import crypto from "crypto";
import { AIKnowledgeChunkModel, AIKnowledgeDocumentModel } from "../model/ai-knowledge.model";
import { AIReplyLogModel } from "../model/ai-reply-log.model";
import { ProductModel } from "../model/product.model";

const EMBEDDING_DIMENSIONS = 96;
const DEFAULT_TOP_K = 5;
const MAX_CONTEXT_CHARS = 4500;
const MAX_CHUNKS_TO_RANK = 1000;

type ChannelScope = "facebook" | "zalo" | "all";

const CANDIDATE_STOPWORDS = new Set([
  "toi", "muon", "dat", "mua", "ban", "cai", "cho", "cua", "co", "shop",
  "khong", "nay", "la", "gi", "de", "va", "them", "bot", "tu", "van",
  "lam", "sao", "nao", "lien", "he", "anh", "chi", "em", "quy", "khach",
  "khao", "sat", "tim", "kiem", "xem", "lay", "nhan", "co", "ha", "nha", "a",
  "di", "nhe", "nha", "voi", "giup", "dum", "dum", "oi", "ah", "uh",
  "hoi", "duoc", "ben", "minh", "da"
]);

function normalizeCompanyCode(companyCode?: string) {
  return (companyCode || "SYSTEM").trim().toUpperCase();
}

function normalizeText(text: string) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function normalizeForLookup(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isProductSearchQuery(text: string) {
  const normalized = normalizeForLookup(text);
  const tokens = tokenize(normalized).filter((token) => !CANDIDATE_STOPWORDS.has(token));
  const hasCommerceIntent = /\b(san pham|mua|ban|xem hang|xem san pham|danh sach|catalog|bang gia|bao gia|gia|bao nhieu|co gi|con gi|loai nao|mau nao|size nao|model nao)\b/.test(normalized);
  const hasSpecificProductHint =
    tokens.length > 0 &&
    tokens.some((token) => token.length >= 2) &&
    normalized.split(/\s+/).length <= 15;

  return hasCommerceIntent || hasSpecificProductHint;
}

function computeLooseSubstringScore(queryTokens: string[], title: string, text: string) {
  if (queryTokens.length === 0) return 0;

  const haystack = `${normalizeForLookup(title)} ${normalizeForLookup(text)}`;
  let hits = 0;
  for (const token of queryTokens) {
    if (token.length >= 2 && haystack.includes(token)) {
      hits += 1;
    }
  }

  return hits / Math.max(queryTokens.length, 1);
}

function cleanCandidateLine(line: string) {
  return String(line || "")
    .replace(/^\s*[-*•]+\s*/g, "")
    .replace(/^\s*\d+[.)]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProductCandidateNames(queryTokens: string[], rankedItems: Array<{ title: string; text: string; score: number }>) {
  const genericPattern = /\b(tai lieu|noi bo|bang gia|bao gia|catalog|danh sach|san pham|sku|model|price|gia ban|don gia)\b/i;
  const candidates: Array<{ name: string; score: number }> = [];

  const filteredQueryTokens = queryTokens.filter((t) => !CANDIDATE_STOPWORDS.has(t));
  if (filteredQueryTokens.length === 0) return [];

  for (const item of rankedItems.slice(0, 5)) {
    const rawLines = [
      item.title,
      ...String(item.text || "")
        .split(/[\n;•*|:\t]|\.\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ];
    for (const rawLine of rawLines) {
      const line = cleanCandidateLine(rawLine);
      if (!line || line.length < 4 || line.length > 150) continue;
      if (genericPattern.test(line) && line.split(" ").length <= 3) continue;

      const score = computeLooseSubstringScore(filteredQueryTokens, "", line);
      if (score <= 0) continue;

      candidates.push({
        name: line,
        score: score + item.score * 0.2,
      });
    }
  }

  const unique = new Map<string, number>();
  for (const item of candidates.sort((a, b) => b.score - a.score)) {
    const normalized = normalizeForLookup(item.name);
    if (!normalized || unique.has(normalized)) continue;
    unique.set(normalized, item.score);
    if (unique.size >= 3) break;
  }

  return Array.from(unique.keys()).map((key) => {
    const original = candidates.find((item) => normalizeForLookup(item.name) === key)?.name || key;
    return original;
  });
}

function buildRankedContextItems(params: {
  chunks: any[];
  documentMap: Map<string, any>;
  normalizedQuery: string;
  queryVector: number[];
  queryTokens: string[];
}) {
  const { chunks, documentMap, normalizedQuery, queryVector, queryTokens } = params;

  return chunks.map((chunk) => {
    const doc = documentMap.get(String(chunk.documentId));
    const title = normalizeText(doc?.sourceTitle || "");
    const titleTokens = tokenize(title);
    const bodyTokens = tokenize(chunk.text);
    const semanticScore = cosineSimilarity(queryVector, chunk.embedding || []);
    const lexicalScore = computeTokenOverlapScore(queryTokens, [...titleTokens, ...bodyTokens]);
    const titleBoost = computeTokenOverlapScore(queryTokens, titleTokens);
    const looseMatchScore = computeLooseSubstringScore(queryTokens, title, chunk.text);
    const productDocBoost =
      isProductSearchQuery(normalizedQuery) && /san pham|danh sach|catalog|bang gia|bao gia|sku|model|gia/i.test(title)
        ? 0.25
        : 0;
    const pricingBoost =
      /\b(gia|bao nhieu|bang gia|bao gia)\b/.test(normalizeForLookup(normalizedQuery)) &&
        /\b(gia|gia ban|don gia|bao gia|price|vnd|vnđ)\b/.test(normalizeForLookup(`${title} ${chunk.text}`))
        ? 0.35
        : 0;
    const score =
      semanticScore + lexicalScore * 0.9 + titleBoost * 0.6 + looseMatchScore * 0.7 + productDocBoost + pricingBoost;

    return {
      documentId: chunk.documentId,
      embedding: chunk.embedding,
      text: chunk.text,
      score,
      semanticScore,
      lexicalScore,
      looseMatchScore,
      title: doc?.sourceTitle || "Tai lieu noi bo",
      sourceUrl: doc?.sourceUrl || "",
    };
  });
}

function buildTokenFrequency(tokens: string[]) {
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  return frequency;
}

function computeTokenOverlapScore(queryTokens: string[], chunkTokens: string[]) {
  if (queryTokens.length === 0 || chunkTokens.length === 0) {
    return 0;
  }

  const chunkFrequency = buildTokenFrequency(chunkTokens);
  let matches = 0;
  for (const token of queryTokens) {
    const count = chunkFrequency.get(token) || 0;
    if (count > 0) {
      matches += Math.min(count, 2);
    }
  }

  return matches / Math.max(queryTokens.length, 1);
}

function hashToken(token: string) {
  const digest = crypto.createHash("md5").update(token).digest();
  return digest.readUInt32BE(0);
}

function embedText(text: string) {
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < length; i++) {
    score += a[i] * b[i];
  }
  return score;
}

function chunkText(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const maxChars = 1200;
  const minChars = 250;

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length > maxChars && current.length >= minChars) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars * 1.4) return [chunk];
    const parts: string[] = [];
    for (let start = 0; start < chunk.length; start += maxChars) {
      parts.push(chunk.slice(start, start + maxChars).trim());
    }
    return parts.filter(Boolean);
  });
}

export const aiKnowledgeService = {
  normalizeCompanyCode,

  async upsertKnowledgeFromText(params: {
    companyCode?: string;
    sourceType: "manual" | "google_doc";
    sourceTitle: string;
    text: string;
    sourceUrl?: string;
    createdBy?: string;
    channelScope?: ChannelScope[];
  }) {
    const companyCode = normalizeCompanyCode(params.companyCode);
    const text = normalizeText(params.text);
    const contentHash = crypto.createHash("sha256").update(text).digest("hex");
    const channelScope = params.channelScope?.length ? params.channelScope : ["all"];

    if (!text) {
      await AIKnowledgeDocumentModel.deleteMany({
        companyCode,
        sourceType: params.sourceType,
        sourceUrl: params.sourceUrl || "",
      });
      return { document: null, chunksCount: 0 };
    }

    const existing = await AIKnowledgeDocumentModel.findOne({
      companyCode,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl || "",
    }).sort({ updatedAt: -1 });

    const version = existing ? existing.version + (existing.contentHash === contentHash ? 0 : 1) : 1;
    const document = await AIKnowledgeDocumentModel.findOneAndUpdate(
      {
        companyCode,
        sourceType: params.sourceType,
        sourceUrl: params.sourceUrl || "",
      },
      {
        companyCode,
        sourceType: params.sourceType,
        sourceTitle: params.sourceTitle,
        sourceUrl: params.sourceUrl || "",
        status: "active",
        version,
        channelScope,
        contentHash,
        createdBy: params.createdBy || "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await AIKnowledgeChunkModel.deleteMany({ documentId: document._id });

    const chunks = chunkText(text);
    if (chunks.length > 0) {
      await AIKnowledgeChunkModel.insertMany(
        chunks.map((chunk, index) => ({
          companyCode,
          documentId: document._id,
          chunkIndex: index,
          text: chunk,
          embedding: embedText(chunk),
          tokensApprox: Math.ceil(chunk.length / 4),
          channelScope,
          version,
        }))
      );
    }

    return { document, chunksCount: chunks.length };
  },

  async searchRelevantContext(params: {
    companyCode?: string;
    query: string;
    channel?: "facebook" | "zalo" | "tiktok";
    topK?: number;
  }) {
    const companyCode = normalizeCompanyCode(params.companyCode);
    const normalizedQuery = normalizeText(params.query);
    const queryVector = embedText(normalizedQuery);
    const rawQueryTokens = tokenize(normalizedQuery);
    const queryTokens = rawQueryTokens.filter((token) => !CANDIDATE_STOPWORDS.has(token));
    const topK = params.topK || DEFAULT_TOP_K;
    const channel = params.channel || "facebook";

    // 1. Tìm các sản phẩm khớp từ database thực tế của công ty
    let matchedProducts: any[] = [];
    if (queryTokens.length > 0) {
      try {
        const allProducts = await ProductModel.find({ companyCode, status: "Active" }).lean();
        const productScores = allProducts.map((p) => {
          const productText = `${p.name} ${p.sku} ${p.brand || ""} ${p.category} ${p.description || ""}`.toLowerCase();
          let matches = 0;
          for (const token of queryTokens) {
            if (productText.includes(token.toLowerCase())) {
              matches += 1;
            }
          }
          const score = matches / queryTokens.length;
          return { product: p, score };
        });

        matchedProducts = productScores
          .filter((ps) => ps.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((ps) => ps.product);
      } catch (err) {
        console.error("[AI Knowledge Service] Loi khi tim kiem san pham tu DB:", err);
      }
    }

    const hasCommerceIntent = /\b(san pham|mua|ban|xem hang|xem san pham|danh sach|catalog|bang gia|bao gia|gia|bao nhieu|co gi|con gi|loai nao|mau nao|size nao|model nao|con hang|het hang|lay|dat hang|ship|gui)\b/.test(normalizedQuery);
    const isProductQuery = hasCommerceIntent || matchedProducts.length > 0;

    if (matchedProducts.length === 0 && isProductQuery) {
      try {
        matchedProducts = await ProductModel.find({ companyCode, status: "Active" })
          .sort({ stock: -1 })
          .limit(10)
          .lean();
      } catch (err) {
        console.error("[AI Knowledge Service] Loi khi tai danh sach san pham mac dinh tu DB:", err);
      }
    }

    const productStrings: string[] = [];
    if (matchedProducts.length > 0) {
      productStrings.push("[DANH SÁCH SẢN PHẨM THỰC TẾ TRONG KHO HÀNG CỦA CÔNG TY]");
      for (const p of matchedProducts) {
        productStrings.push(
          `- Tên sản phẩm: ${p.name}\n` +
          `  SKU: ${p.sku}\n` +
          `  Danh mục: ${p.category}\n` +
          `  Thương hiệu: ${p.brand || "N/A"}\n` +
          `  Đơn vị tính: ${p.unit || "Cái"}\n` +
          `  Giá bán: ${p.price.toLocaleString("vi-VN")} VND\n` +
          `  Tồn kho thực tế: ${p.stock}\n` +
          `  Mô tả: ${p.description || "Chưa có mô tả"}`
        );
      }
    }

    let chunks: any[] = [];

    if (!isProductQuery) {
      const filter: any = {
        companyCode,
        channelScope: { $in: ["all", channel] },
      };

      if (queryTokens.length > 0) {
        filter.$or = queryTokens.map((token) => ({
          text: { $regex: token, $options: "i" },
        }));
      }

      chunks = await AIKnowledgeChunkModel.find(filter as any)
        .sort({ updatedAt: -1 })
        .limit(MAX_CHUNKS_TO_RANK)
        .lean();

      if (chunks.length === 0 && queryTokens.length > 0) {
        const fallbackFilter = {
          companyCode,
          channelScope: { $in: ["all", channel] },
        };
        chunks = await AIKnowledgeChunkModel.find(fallbackFilter as any)
          .sort({ updatedAt: -1 })
          .limit(MAX_CHUNKS_TO_RANK)
          .lean();
      }
    }

    const documentIds = Array.from(new Set(chunks.map((chunk) => String(chunk.documentId))));
    const documents = await AIKnowledgeDocumentModel.find({
      _id: { $in: documentIds },
    })
      .select("_id sourceTitle sourceUrl")
      .lean();
    const documentMap = new Map(documents.map((doc) => [String(doc._id), doc]));

    const ranked = buildRankedContextItems({
      chunks,
      documentMap,
      normalizedQuery,
      queryVector,
      queryTokens,
    })
      .filter((item) => item.score > 0.12)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const fallbackRanked =
      ranked.length === 0 && isProductQuery
        ? buildRankedContextItems({
            chunks,
            documentMap,
            normalizedQuery,
            queryVector,
            queryTokens,
          })
            .filter((item) => item.score > 0.04)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
        : [];

    const finalRanked = ranked.length > 0 ? ranked : fallbackRanked;

    let usedChars = 0;
    const selected: string[] = [];

    if (productStrings.length > 0) {
      const dbProductContext = productStrings.join("\n\n");
      selected.push(dbProductContext);
      usedChars += dbProductContext.length;
    }

    for (const item of finalRanked) {
      if (usedChars + item.text.length > MAX_CONTEXT_CHARS) break;
      const labeledText = `[Tai lieu] ${item.title}${item.sourceUrl ? `\n[Link] ${item.sourceUrl}` : ""}\n${item.text}`;
      if (usedChars + labeledText.length > MAX_CONTEXT_CHARS) break;
      selected.push(labeledText);
      usedChars += labeledText.length;
    }

    const bestScore = finalRanked[0]?.score || 0;
    const productCandidateNames =
      isProductQuery && queryTokens.length > 0
        ? extractProductCandidateNames(
            queryTokens,
            finalRanked.map((item) => ({
              title: item.title,
              text: item.text,
              score: item.score,
            }))
          )
        : [];

    const dbProductNames = matchedProducts.map((p) => p.name);
    const combinedProductCandidateNames = Array.from(new Set([...productCandidateNames, ...dbProductNames])).slice(0, 5);

    const shouldAskProductConfirmation =
      isProductQuery &&
      combinedProductCandidateNames.length > 0 &&
      bestScore < 1.2 &&
      matchedProducts.length === 0;

    return {
      contextText: selected.map((text, index) => {
        if (text.startsWith("[DANH SÁCH SẢN PHẨM")) {
          return text;
        }
        return `[Nguon ${index}]\n${text}`;
      }).join("\n\n---\n\n"),
      matches: finalRanked.length,
      bestScore,
      productCandidateNames: combinedProductCandidateNames,
      shouldAskProductConfirmation,
      debugQueryTokens: queryTokens,
      debugRawQueryTokens: rawQueryTokens,
    };
  },

  buildEffectiveRagContext(input: {
    companyCode?: string;
    ragContext?: {
      contextText?: string;
      matches?: number;
      bestScore?: number;
      productCandidateNames?: string[];
      shouldAskProductConfirmation?: boolean;
    };
    trainingKnowledge?: string;
  }) {
    const normalizedCompanyCode = normalizeCompanyCode(input.companyCode);
    const ragContext = input.ragContext || {};

    if (ragContext.contextText) {
      return {
        contextText: ragContext.contextText,
        matches: ragContext.matches || 0,
        bestScore: ragContext.bestScore || 0,
        productCandidateNames: ragContext.productCandidateNames || [],
        shouldAskProductConfirmation: !!ragContext.shouldAskProductConfirmation,
        companyCode: normalizedCompanyCode,
        source: "rag",
      };
    }

    if (input.trainingKnowledge) {
      return {
        contextText: String(input.trainingKnowledge).slice(0, 4500),
        matches: 0,
        bestScore: 0,
        productCandidateNames: [],
        shouldAskProductConfirmation: false,
        companyCode: normalizedCompanyCode,
        source: "training_knowledge",
      };
    }

    return {
      contextText: "",
      matches: 0,
      bestScore: 0,
      productCandidateNames: [],
      shouldAskProductConfirmation: false,
      companyCode: normalizedCompanyCode,
      source: "empty",
    };
  },

  describeEffectiveRagContext(input: {
    source?: string;
    companyCode?: string;
    contextText?: string;
    matches?: number;
    bestScore?: number;
    productCandidateNames?: string[];
    shouldAskProductConfirmation?: boolean;
  }) {
    const preview = normalizeText(input.contextText || "").slice(0, 320);
    return {
      source: input.source || "unknown",
      companyCode: normalizeCompanyCode(input.companyCode),
      matches: input.matches || 0,
      bestScore: Number(input.bestScore || 0),
      shouldAskProductConfirmation: !!input.shouldAskProductConfirmation,
      productCandidateNames: Array.isArray(input.productCandidateNames) ? input.productCandidateNames.slice(0, 3) : [],
      contextPreview: preview,
    };
  },

  async getKnowledgeHealth(companyCode?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    const [documents, chunksCount, latestLog] = await Promise.all([
      AIKnowledgeDocumentModel.find({ companyCode: normalizedCompanyCode }).sort({ updatedAt: -1 }).lean(),
      AIKnowledgeChunkModel.countDocuments({ companyCode: normalizedCompanyCode }),
      AIReplyLogModel.findOne({ companyCode: normalizedCompanyCode }).sort({ createdAt: -1 }).lean(),
    ]);

    const allText = await AIKnowledgeChunkModel.find({ companyCode: normalizedCompanyCode })
      .select("text")
      .limit(500)
      .lean();
    const combined = allText.map((chunk) => chunk.text).join("\n").toLowerCase();
    const detectedTopics = [
      { key: "pricing", label: "Giá/bảng giá", pattern: /giá|phí|gói|voucher|khuyến mãi|ưu đãi/ },
      { key: "shipping", label: "Giao hàng/vận chuyển", pattern: /ship|giao hàng|vận chuyển|freeship/ },
      { key: "warranty", label: "Bảo hành", pattern: /bảo hành|warranty|đổi trả|hoàn tiền/ },
      { key: "contact", label: "Liên hệ/hotline", pattern: /hotline|email|liên hệ|địa chỉ|zalo|facebook/ },
    ].filter((topic) => topic.pattern.test(combined));

    const warnings: string[] = [];
    if (chunksCount === 0) {
      warnings.push("Chưa có tài liệu công ty, AI đang ở chế độ trả lời mặc định.");
    }
    if (chunksCount > 0 && detectedTopics.length === 0) {
      warnings.push("Tài liệu đã nhập nhưng chưa phát hiện chính sách quan trọng như giá, ship, bảo hành hoặc liên hệ.");
    }
    if (chunksCount > 120) {
      warnings.push("Knowledge base khá lớn; nên chia tài liệu theo chủ đề để kiểm soát chất lượng tốt hơn.");
    }

    return {
      companyCode: normalizedCompanyCode,
      mode: chunksCount > 0 ? "trained" : "default",
      documentsCount: documents.length,
      chunksCount,
      detectedTopics,
      warnings,
      latestSyncAt: documents[0]?.updatedAt || null,
      latestReplyAt: latestLog?.createdAt || null,
      documents: documents.slice(0, 5).map((doc) => ({
        title: doc.sourceTitle,
        sourceType: doc.sourceType,
        status: doc.status,
        version: doc.version,
        updatedAt: doc.updatedAt,
      })),
    };
  },

  async clearKnowledge(companyCode?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    await Promise.all([
      AIKnowledgeDocumentModel.deleteMany({ companyCode: normalizedCompanyCode }),
      AIKnowledgeChunkModel.deleteMany({ companyCode: normalizedCompanyCode }),
    ]);
  },

  async createReplyLog(params: {
    companyCode?: string;
    channel: "facebook" | "zalo" | "tiktok" | "test";
    conversationId?: string;
    customerMessage: string;
    aiResponse: string;
    contextText?: string;
    contextMatches?: number;
    latencyMs?: number;
    status?: "sent" | "failed" | "preview";
  }) {
    const contextPreview = normalizeText(params.contextText || "").slice(0, 1200);
    return AIReplyLogModel.create({
      companyCode: normalizeCompanyCode(params.companyCode),
      channel: params.channel,
      conversationId: params.conversationId || "",
      customerMessage: params.customerMessage,
      aiResponse: params.aiResponse,
      contextPreview,
      contextMatches: params.contextMatches || 0,
      mode: contextPreview ? "trained" : "default",
      latencyMs: params.latencyMs || 0,
      status: params.status || "sent",
    });
  },

  async listReplyLogs(companyCode?: string, limit = 20) {
    return AIReplyLogModel.find({ companyCode: normalizeCompanyCode(companyCode) })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  },

  async updateReplyFeedback(companyCode: string | undefined, id: string, feedback: "good" | "bad" | "needs_fix", note?: string) {
    return AIReplyLogModel.findOneAndUpdate(
      { _id: id, companyCode: normalizeCompanyCode(companyCode) },
      { feedback, feedbackNote: note || "" },
      { new: true }
    );
  },
};
