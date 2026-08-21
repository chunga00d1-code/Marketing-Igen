/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import mongoose from "mongoose";
import { AIKnowledgeChunkModel, AIKnowledgeDocumentModel } from "../model/ai-knowledge.model";
import { AIReplyLogModel } from "../model/ai-reply-log.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { geminiService } from "./gemini.service";

const EMBEDDING_DIMENSIONS = 96;
const DEFAULT_TOP_K = 5;
const MAX_CONTEXT_CHARS = 4500;
const MAX_CHUNKS_TO_RANK = 1000;

type ChannelScope = "facebook" | "zalo" | "tiktok" | "all";
type PurposeScope =
  | "sales"
  | "support"
  | "marketing"
  | "caption"
  | "all";
type PageScope = "all" | "selected";
export type KnowledgeDocumentType =
  | "company_profile" | "product" | "service" | "policy" | "pricing"
  | "promotion" | "faq" | "brand_guideline" | "general";

export interface KnowledgeConflict {
  id: string;
  type: "pricing" | "contact" | "policy" | "duplicate";
  severity: "warning" | "error";
  title: string;
  description: string;
  documentA: { id: string; title: string; documentType?: string };
  documentB: { id: string; title: string; documentType?: string };
  conflictingValues: { a: string; b: string };
}

const DOC_TYPE_LABELS: Record<KnowledgeDocumentType, string> = {
  company_profile: "Thông tin doanh nghiệp",
  product: "Sản phẩm",
  pricing: "Bảng giá",
  promotion: "Khuyến mãi / Ưu đãi",
  policy: "Chính sách",
  service: "Dịch vụ",
  faq: "Câu hỏi thường gặp (FAQ)",
  brand_guideline: "Nhận diện thương hiệu",
  general: "Tài liệu",
};

function inferDocumentType(
  requestedType: KnowledgeDocumentType | undefined,
  sourceTitle: string,
  text: string
): KnowledgeDocumentType {
  if (requestedType && requestedType !== "general") return requestedType;

  const normalizedTitle = normalizeForLookup(sourceTitle);
  const normalizedText = normalizeForLookup(text.slice(0, 15000));
  const combined = `${normalizedTitle} ${normalizedText}`;

  // Kiểm tra file Excel / Spreadsheet trước
  const isSpreadsheet =
    /\.(xlsx?|csv)$/i.test(sourceTitle) ||
    /\bsheet\s*:|\btieu de cot\s*:|\bgoogle sheet\b/i.test(text);
  const hasPriceColumn =
    /\b(gia|gia ban|gia le|gia si|don gia|price|retail price|wholesale price|vnd|vnđ)\b/.test(normalizedText);
  const hasProductColumn =
    /\b(san pham|ten hang|ten hang hoa|ma hang|sku|model|product)\b/.test(normalizedText);
  const structuredRows = (text.match(/^(Sản phẩm|Dòng)\s+\d+\s*:/gim) || []).length;

  if (isSpreadsheet && hasPriceColumn && (hasProductColumn || structuredRows >= 2)) {
    return "pricing";
  }

  // Bảng phân loại quy tắc thông minh
  const rules: Array<{
    type: KnowledgeDocumentType;
    titlePatterns: RegExp[];
    contentPatterns: RegExp[];
    minContentMatches: number;
  }> = [
    {
      type: "pricing",
      titlePatterns: [/\b(bang gia|bao gia|price list|pricing|gia ban|don gia)\b/],
      contentPatterns: [
        /\b(gia|gia ban|don gia|gia le|gia si|price|chi phi)\b/,
        /\b(vnd|vnđ|dong|₫|\.000|nghin|trieu)\b/,
        /\b(san pham|hang hoa|dich vu|goi|combo|don vi tinh|dvt)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "promotion",
      titlePatterns: [/\b(khuyen mai|uu dai|promotion|sale|giam gia|combo|voucher|coupon|tri an|chuong trinh)\b/],
      contentPatterns: [
        /\b(khuyen mai|uu dai|giam gia|sale|flash sale|giam)\b/,
        /\b(tang kem|free|mien phi|discount|voucher|coupon|qua tang)\b/,
        /\b(tu ngay|den ngay|thoi gian|han su dung|ap dung|dieu kien)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "policy",
      titlePatterns: [/\b(chinh sach|bao hanh|doi tra|van chuyen|ship|giao hang|thanh toan|hoan tien|quy dinh|dieu khoan)\b/],
      contentPatterns: [
        /\b(chinh sach|quy dinh|dieu kien|cam ket|quy trinh)\b/,
        /\b(bao hanh|doi tra|hoan tien|van chuyen|giao hang|ship|doi hang|tra hang)\b/,
        /\b(thanh toan|chuyen khoan|cod|tien mat|tra gop)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "faq",
      titlePatterns: [/\b(faq|cau hoi|hoi dap|q&a|thuong gap|giai dap|thac mac)\b/],
      contentPatterns: [
        /\b(cau hoi|hoi|dap|tra loi|faq|q&a)\b/,
        /\b(lam the nao|nhu the nao|tai sao|khi nao|o dau|co duoc khong)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "service",
      titlePatterns: [/\b(dich vu|service|goi dich vu|bang dich vu|giai phap|dich vu tu van)\b/],
      contentPatterns: [
        /\b(dich vu|service|tu van|cung cap|trien khai|giai phap|ho tro)\b/,
        /\b(goi|plan|package|basic|premium|standard|chuyen nghiep|tron goi)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "product",
      titlePatterns: [/\b(san pham|catalog|catalogue|danh muc|product|hang hoa|mau ma|bo suu tap)\b/],
      contentPatterns: [
        /\b(san pham|hang hoa|model|sku|ma hang|dong san pham)\b/,
        /\b(thong so|kich thuoc|size|mau|mau sac|chat lieu|trong luong|cong suat|tinh nang)\b/,
        /\b(cong dung|huong dan|thanh phan|xuat xu|chat luong)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "company_profile",
      titlePatterns: [/\b(gioi thieu|ve chung toi|about|cong ty|ho so|thong tin doanh nghiep|profile)\b/],
      contentPatterns: [
        /\b(cong ty|doanh nghiep|thanh lap|nam kinh nghiem|tru so)\b/,
        /\b(dia chi|hotline|sdt|email|lien he|chi nhanh|website|van phong)\b/,
        /\b(su menh|tam nhin|gia tri cot loi|vision|mission)\b/,
      ],
      minContentMatches: 2,
    },
    {
      type: "brand_guideline",
      titlePatterns: [/\b(thuong hieu|brand|nhan dien|logo|guideline|tone of voice|quy chuan)\b/],
      contentPatterns: [
        /\b(thuong hieu|brand|logo|font|mau sac|color|slogan|tagline|quy chuan)\b/,
      ],
      minContentMatches: 1,
    },
  ];

  // 1) Khớp title trước (ưu tiên cao)
  for (const rule of rules) {
    if (rule.titlePatterns.some((p) => p.test(normalizedTitle))) {
      return rule.type;
    }
  }

  // 2) Đếm pattern khớp trong nội dung
  for (const rule of rules) {
    const matches = rule.contentPatterns.filter((p) => p.test(combined)).length;
    if (matches >= rule.minContentMatches) {
      return rule.type;
    }
  }

  return requestedType || "general";
}

/**
 * Phân tích tin nhắn của khách hàng để tự động xác định danh mục tài liệu cần truy xuất (Intent Router).
 * Trả về danh sách KnowledgeDocumentType cần ưu tiên.
 * Nếu không xác định rõ (hoặc chào hỏi chung), trả về mảng rỗng để fallback toàn kho.
 */
function detectRequiredDocumentTypes(query: string): KnowledgeDocumentType[] {
  const q = normalizeForLookup(query);
  const detected = new Set<KnowledgeDocumentType>();

  // Nhóm GIÁ CẢ & BÁO GIÁ
  if (/\b(gia|bao nhieu|bang gia|bao gia|don gia|gia ban|gia le|gia si|phi|cost|price|tinh tien|tong tien)\b/.test(q)) {
    detected.add("pricing");
    detected.add("product");
    detected.add("promotion");
  }

  // Nhóm KHUYẾN MÃI & ƯU ĐÃI
  if (/\b(khuyen mai|uu dai|giam gia|sale|flash sale|voucher|coupon|tang kem|combo|mien phi|free|chiet khau|tri an)\b/.test(q)) {
    detected.add("promotion");
    detected.add("pricing");
  }

  // Nhóm SẢN PHẨM & TÍNH NĂNG & THÔNG SỐ
  if (/\b(san pham|hang|mau|size|mau sac|chat lieu|model|sku|thong so|kich thuoc|con hang|het hang|kho|trong luong|cong suat|chuc nang|tinh nang|dung nhu nao|xem hang)\b/.test(q)) {
    detected.add("product");
    detected.add("pricing");
  }

  // Nhóm CHÍNH SÁCH (vận chuyển, bảo hành, đổi trả, thanh toán)
  if (/\b(ship|giao hang|van chuyen|bao hanh|doi tra|hoan tien|thanh toan|chuyen khoan|cod|tra gop|phi ship|freeship|chinh sach|kiem tra hang|dong kiem)\b/.test(q)) {
    detected.add("policy");
  }

  // Nhóm DỊCH VỤ & GIẢI PHÁP
  if (/\b(dich vu|service|tu van|goi dich vu|package|plan|basic|premium|trien khai|giai phap)\b/.test(q)) {
    detected.add("service");
    detected.add("pricing");
  }

  // Nhóm THÔNG TIN DOANH NGHIỆP & LIÊN HỆ
  if (/\b(cong ty|doanh nghiep|gioi thieu|dia chi|hotline|sdt|so dien thoai|email|lien he|chi nhanh|la ai|ve ben|shop o dau|cua hang o dau|gio lam viec|gio mo cua|uy tin)\b/.test(q)) {
    detected.add("company_profile");
    detected.add("brand_guideline");
  }

  // Nhóm FAQ & HƯỚNG DẪN SỬ DỤNG
  if (/\b(cach|lam sao|huong dan|faq|tai sao|bao lau|mat bao lau|thu tuc|quy trinh|co nen|loi gi)\b/.test(q)) {
    detected.add("faq");
    detected.add("policy");
  }

  // Nhóm MUA HÀNG & ĐẶT ĐƠN (cần cả giá, sản phẩm, chính sách)
  if (/\b(mua|dat hang|dat|order|lay|muon mua|them vao|chot don|len don)\b/.test(q)) {
    detected.add("product");
    detected.add("pricing");
    detected.add("policy");
  }

  // Nhóm TỔNG QUAN / TÌM HIỂU CHUNG ("bên mình có gì", "shop bán gì", "cho xem sản phẩm")
  if (/\b(co gi|ban gi|co nhung gi|tu van|catalog|catalogue|danh sach|danh muc|cac san pham)\b/.test(q)) {
    detected.add("product");
    detected.add("service");
    detected.add("pricing");
    detected.add("company_profile");
  }

  return Array.from(detected);
}

function normalizePageTarget(pageScope?: PageScope, pageIds?: string[]) {
  const normalizedIds = Array.from(new Set((pageIds || []).map((id) => String(id).trim()).filter(Boolean)));
  const normalizedScope: PageScope = pageScope === "selected" ? "selected" : "all";
  if (normalizedScope === "selected" && normalizedIds.length === 0) {
    const error = new Error("Vui lòng chọn ít nhất một Facebook Page.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return {
    pageScope: normalizedScope,
    pageIds: normalizedScope === "selected" ? normalizedIds : [],
  };
}

async function validateCompanyFacebookPages(companyCode: string, pageScope: PageScope, pageIds: string[]) {
  if (pageScope !== "selected") return;
  const validPageIds = await SocialIntegrationModel.distinct("username", {
    companyCode,
    platform: "Facebook",
    isConnected: true,
    username: { $in: pageIds },
  });
  const validSet = new Set(validPageIds.map(String));
  const invalidPageIds = pageIds.filter((id) => !validSet.has(id));
  if (invalidPageIds.length > 0) {
    const error = new Error("Một hoặc nhiều Facebook Page không thuộc doanh nghiệp hoặc đã ngắt kết nối.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
}

const VIETNAMESE_CHAR_MAP: Record<string, string> = {
  a: "[aàáảãạăằắẳẵặâầấẩẫậ]",
  e: "[eèéẻẽẹêềếểễệ]",
  i: "[iìíỉĩị]",
  o: "[oòóỏõọôồốổỗộơờớởỡợ]",
  u: "[uùúủũụưừứửữự]",
  y: "[yỳýỷỹỵ]",
  d: "[dđ]",
};

export function buildDiacriticRegexPattern(word: string): string {
  const norm = normalizeForLookup(word);
  if (!norm) return "";
  let pattern = "";
  for (const char of norm) {
    if (VIETNAMESE_CHAR_MAP[char]) {
      pattern += VIETNAMESE_CHAR_MAP[char];
    } else if (/[a-z0-9]/.test(char)) {
      pattern += char;
    } else {
      pattern += `\\${char}`;
    }
  }
  return pattern;
}

const CANDIDATE_STOPWORDS = new Set([
  "toi", "muon", "dat", "mua", "ban", "cai", "cho", "cua", "co", "shop",
  "khong", "nay", "la", "gi", "de", "va", "them", "bot", "tu", "van",
  "lam", "sao", "nao", "lien", "he", "anh", "chi", "em", "quy", "khach",
  "khao", "sat", "tim", "kiem", "xem", "lay", "nhan", "ha", "nha", "a",
  "di", "nhe", "voi", "giup", "dum", "oi", "ah", "uh",
  "hoi", "duoc", "ben", "minh", "da"
]);

function normalizeCompanyCode(companyCode?: string) {
  return String(companyCode || "").trim().toUpperCase();
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

function tokenizeRaw(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi, " ")
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

  const effectiveLength = Math.min(Math.max(queryTokens.length, 1), 8);
  return Math.min(1.5, hits / effectiveLength);
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
  pageId?: string;
}) {
  const { chunks, documentMap, normalizedQuery, queryVector, queryTokens, pageId } = params;

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
    const companyProfileBoost =
      /\b(cong ty|doanh nghiep|gioi thieu|ve chung toi|dia chi|hotline|sdt|lien he|la ai|shop|thuong hieu)\b/.test(normalizeForLookup(normalizedQuery)) &&
        /\b(cong ty|doanh nghiep|gioi thieu|dia chi|hotline|lien he|thuong hieu|brand)\b/.test(normalizeForLookup(`${title} ${chunk.text}`))
        ? 0.3
        : 0;
    const promotionBoost =
      /\b(khuyen mai|uu dai|giam gia|sale|voucher|coupon|tang|combo)\b/.test(normalizeForLookup(normalizedQuery)) &&
        /\b(khuyen mai|uu dai|giam gia|sale|voucher|tang|combo)\b/.test(normalizeForLookup(`${title} ${chunk.text}`))
        ? 0.3
        : 0;
    const pageBoost =
      pageId && doc?.pageScope === "selected" && doc?.pageIds?.includes(pageId)
        ? 0.2
        : 0;
    const score =
      semanticScore + lexicalScore * 0.9 + titleBoost * 0.6 + looseMatchScore * 0.7 +
      productDocBoost + pricingBoost + companyProfileBoost + promotionBoost + pageBoost;

    return {
      chunkId: chunk._id,
      documentId: chunk.documentId,
      documentType: (doc?.documentType as KnowledgeDocumentType) || "general",
      version: chunk.version,
      embedding: chunk.embedding,
      text: chunk.text,
      score,
      semanticScore,
      lexicalScore,
      looseMatchScore,
      title: doc?.sourceTitle || "Tai lieu noi bo",
      sourceUrl: doc?.sourceUrl || "",
      pageScope: doc?.pageScope || "all",
      pageIds: Array.isArray(doc?.pageIds) ? doc.pageIds.map(String) : [],
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

  const effectiveLength = Math.min(Math.max(queryTokens.length, 1), 8);
  return Math.min(1.5, matches / effectiveLength);
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

/**
 * Chuẩn hóa và mở rộng câu truy vấn với từ lóng/viết tắt phổ biến trong chat bán hàng
 */
function expandQueryWithSlangAndSynonyms(query: string): {
  normalizedQuery: string;
  expandedQuery: string;
  extraTerms: string[];
} {
  let q = String(query || "").trim();
  const extraTerms: string[] = [];

  // 1. Chuẩn hóa giá tiền viết tắt dạng "150k", "50k", "1.5tr", "2tr"
  q = q.replace(/(\d+)[kK]\b/g, (_match, p1) => {
    const num = parseInt(p1, 10);
    extraTerms.push(`${num}.000`, `${num}000`, `${num} nghìn`, `${num} k`);
    return `${num * 1000} ${num} nghìn`;
  });
  q = q.replace(/(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|triệu)\b/gi, (_match, p1) => {
    const num = parseFloat(p1.replace(",", "."));
    const full = Math.round(num * 1000000);
    extraTerms.push(`${full}`, `${p1} triệu`);
    return `${full} ${p1} triệu`;
  });

  // 2. Mở rộng từ viết tắt thường gặp trong Chat bán hàng
  const SLANG_MAP: Array<{ pattern: RegExp; expansion: string; terms: string[] }> = [
    { pattern: /\b(ib|inbox)\b/gi, expansion: "nhắn tin tư vấn", terms: ["nhắn tin", "inbox", "tư vấn"] },
    { pattern: /\b(sdt|đt|dt|tel)\b/gi, expansion: "số điện thoại hotline", terms: ["số điện thoại", "hotline", "sđt"] },
    { pattern: /\b(dc|đc|d\/c|đ\/c)\b/gi, expansion: "địa chỉ cửa hàng", terms: ["địa chỉ", "chi nhánh", "cửa hàng"] },
    { pattern: /\b(sz)\b/gi, expansion: "size kích thước", terms: ["size", "kích cỡ", "kích thước"] },
    { pattern: /\b(bh)\b/gi, expansion: "bảo hành", terms: ["bảo hành", "chính sách bảo hành"] },
    { pattern: /\b(bn|bnhieu|bao nhiu|bnh)\b/gi, expansion: "bao nhiêu", terms: ["bao nhiêu", "giá"] },
    { pattern: /\b(freeship|fs)\b/gi, expansion: "miễn phí vận chuyển giao hàng", terms: ["freeship", "miễn phí giao hàng"] },
    { pattern: /\b(ship|giao)\b/gi, expansion: "vận chuyển giao hàng", terms: ["vận chuyển", "giao hàng", "ship"] },
    { pattern: /\b(sp)\b/gi, expansion: "sản phẩm", terms: ["sản phẩm", "hàng"] },
    { pattern: /\b(rep|tl|tra loi)\b/gi, expansion: "trả lời phản hồi", terms: ["trả lời", "phản hồi"] },
  ];

  for (const item of SLANG_MAP) {
    if (item.pattern.test(q)) {
      extraTerms.push(...item.terms);
    }
  }

  const expandedQuery = [q, ...extraTerms].join(" ");
  return {
    normalizedQuery: q,
    expandedQuery,
    extraTerms: Array.from(new Set(extraTerms)),
  };
}

/**
 * Phát hiện nội dung dạng bảng sản phẩm từ Excel (output của extractWorkbookText).
 * Dạng: "Sản phẩm 1: Tên SP ..." hoặc "Dòng 1: ..."
 */
const PRODUCT_LINE_PATTERN = /^(Sản phẩm|Dong|Dòng)\s+\d+\s*:/i;
const SHEET_HEADER_PATTERN = /^Sheet:\s+/i;
const COLUMN_HEADER_PATTERN = /^Tiêu đề cột:\s+/i;

function chunkProductTable(paragraphs: string[], contextPrefix: string = "") {
  // Tách header (Sheet + Tiêu đề cột) và các dòng sản phẩm
  const headerLines: string[] = [];
  const productLines: string[] = [];

  for (const p of paragraphs) {
    if (SHEET_HEADER_PATTERN.test(p) || COLUMN_HEADER_PATTERN.test(p)) {
      headerLines.push(p);
    } else {
      productLines.push(p);
    }
  }

  const headerText = [contextPrefix, ...headerLines].filter(Boolean).join("\n");
  const headerLen = headerText.length;

  // Chunk sản phẩm theo nhóm, mỗi chunk kèm header để giữ ngữ cảnh cột
  const maxChars = 1800; // Cho phép lớn hơn vì dữ liệu bảng cần đầy đủ
  const chunks: string[] = [];
  let currentProducts: string[] = [];
  let currentLen = headerLen;

  for (const line of productLines) {
    const lineLen = line.length + 2; // +2 cho "\n\n"
    if (currentProducts.length > 0 && currentLen + lineLen > maxChars) {
      chunks.push([headerText, ...currentProducts].filter(Boolean).join("\n\n"));
      currentProducts = [line];
      currentLen = headerLen + lineLen;
    } else {
      currentProducts.push(line);
      currentLen += lineLen;
    }
  }

  if (currentProducts.length > 0) {
    chunks.push([headerText, ...currentProducts].filter(Boolean).join("\n\n"));
  }

  return chunks;
}

function chunkText(
  text: string,
  metadata?: { title?: string; documentType?: KnowledgeDocumentType }
) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

  // Xây dựng tiền tố ngữ cảnh (Contextual Header Injection)
  const docTypeLabel = metadata?.documentType ? (DOC_TYPE_LABELS[metadata.documentType] || "Tài liệu") : "";
  const contextPrefix = metadata?.title
    ? `[Tài liệu: ${metadata.title}${docTypeLabel ? ` | Danh mục: ${docTypeLabel}` : ""}]\n`
    : "";

  // Phát hiện nội dung dạng bảng sản phẩm Excel: nếu >= 3 dòng khớp pattern sản phẩm
  const productLineCount = paragraphs.filter((p) => PRODUCT_LINE_PATTERN.test(p)).length;
  if (productLineCount >= 3) {
    return chunkProductTable(paragraphs, contextPrefix);
  }

  // Chunking thông thường cho tài liệu dạng văn bản với Sliding Window Overlap
  const chunks: string[] = [];
  let current = "";
  const maxChars = 1100;
  const minChars = 250;
  const overlapChars = 160; // Gối đầu giữa các chunk để không đứt câu

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length > maxChars && current.length >= minChars) {
      const fullChunk = (contextPrefix + current.trim()).trim();
      chunks.push(fullChunk);

      const tail = current.length > overlapChars ? current.slice(-overlapChars).trim() : "";
      current = [tail, paragraph].filter(Boolean).join("\n\n");
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }

  if (current.trim()) {
    const fullChunk = (contextPrefix + current.trim()).trim();
    chunks.push(fullChunk);
  }

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars * 1.4) return [chunk];
    const parts: string[] = [];
    for (let start = 0; start < chunk.length; start += maxChars) {
      parts.push(chunk.slice(start, start + maxChars).trim());
    }
    return parts.filter(Boolean);
  });
}

let legacyChunkIndexRepairPromise: Promise<void> | undefined;

/**
 * Older deployments created a compound index containing both channelScope and
 * purposeScope. Both fields are arrays, which MongoDB cannot index together
 * in one compound index (error 171). The current schema uses separate indexes,
 * so remove only that obsolete, invalid index before writing chunks.
 */
async function repairLegacyChunkScopeIndexes() {
  if (!legacyChunkIndexRepairPromise) {
    const repairPromise = (async () => {
      const indexes = await AIKnowledgeChunkModel.collection.indexes();
      const legacyIndexes = indexes.filter((index) =>
        Object.prototype.hasOwnProperty.call(index.key, "channelScope") &&
        Object.prototype.hasOwnProperty.call(index.key, "purposeScope")
      );

      for (const index of legacyIndexes) {
        if (!index.name) continue;
        console.warn(
          `[aiKnowledgeService] Removing obsolete parallel-array index: ${index.name}`
        );
        await AIKnowledgeChunkModel.collection.dropIndex(index.name);
      }
    })();

    legacyChunkIndexRepairPromise = repairPromise;
    void repairPromise.catch(() => {
      if (legacyChunkIndexRepairPromise === repairPromise) {
        legacyChunkIndexRepairPromise = undefined;
      }
    });
  }

  await legacyChunkIndexRepairPromise;
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
    purposeScope?: PurposeScope[];
    pageScope?: PageScope;
    pageIds?: string[];
    documentType?: KnowledgeDocumentType;
  }) {
    const companyCode = normalizeCompanyCode(params.companyCode);
    if (!companyCode) {
      throw new Error("Mã doanh nghiệp (companyCode) không được để trống khi nạp tài liệu.");
    }
    const text = normalizeText(params.text);
    const contentHash = crypto.createHash("sha256").update(text).digest("hex");
    const channelScope = params.channelScope?.length ? params.channelScope : ["all"];
    const purposeScope = params.purposeScope?.length
      ? params.purposeScope
      : ["all"];
    const pageTarget = normalizePageTarget(params.pageScope, params.pageIds);
    const documentType = inferDocumentType(
      params.documentType,
      params.sourceTitle,
      text
    );
    await validateCompanyFacebookPages(companyCode, pageTarget.pageScope, pageTarget.pageIds);

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
        purposeScope,
        pageScope: pageTarget.pageScope,
        pageIds: pageTarget.pageIds,
        documentType,
        contentHash,
        createdBy: params.createdBy || "",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    await AIKnowledgeChunkModel.deleteMany({ documentId: document._id });

    const chunks = chunkText(text, { title: params.sourceTitle, documentType });
    if (chunks.length > 0) {
      await repairLegacyChunkScopeIndexes();
      await AIKnowledgeChunkModel.insertMany(
        chunks.map((chunk, index) => ({
          companyCode,
          documentId: document._id,
          chunkIndex: index,
          text: chunk,
          embedding: embedText(chunk),
          tokensApprox: Math.ceil(chunk.length / 4),
          channelScope,
          purposeScope,
          pageScope: pageTarget.pageScope,
          pageIds: pageTarget.pageIds,
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
    purpose?: Exclude<PurposeScope, "all">;
    topK?: number;
    pageId?: string;
    documentTypes?: KnowledgeDocumentType[];
  }) {
    const companyCode = normalizeCompanyCode(params.companyCode);
    if (!companyCode) {
      return {
        contextText: "",
        matches: 0,
        items: [],
        bestScore: 0,
        productCandidateNames: [],
        shouldAskProductConfirmation: false,
        debugQueryTokens: [],
        debugRawQueryTokens: [],
      };
    }
    const { normalizedQuery: rawNormQ, expandedQuery } = expandQueryWithSlangAndSynonyms(params.query);
    const normalizedQuery = normalizeText(rawNormQ);
    const queryVector = embedText(expandedQuery);
    const rawQueryTokens = tokenize(expandedQuery);
    const queryTokens = rawQueryTokens.filter((token) => !CANDIDATE_STOPWORDS.has(token));
    const accentedTokens = tokenizeRaw(expandedQuery).filter((token) => !CANDIDATE_STOPWORDS.has(normalizeForLookup(token)));
    const channel = params.channel || "facebook";
    const purpose = params.purpose || "sales";

    const hasCommerceIntent = /\b(san pham|mua|ban|xem hang|xem san pham|danh sach|catalog|bang gia|bao gia|gia|bao nhieu|co gi|con gi|loai nao|mau nao|size nao|model nao|con hang|het hang|lay|dat hang|ship|gui)\b/.test(normalizedQuery);
    const isProductQuery = hasCommerceIntent;

    // Câu hỏi sản phẩm cần nhiều chunk hơn vì dữ liệu bảng Excel được chia theo nhóm sản phẩm
    const topK = isProductQuery
      ? Math.max(params.topK || DEFAULT_TOP_K, 8)
      : (params.topK || DEFAULT_TOP_K);
    const maxContextChars = isProductQuery ? 7500 : MAX_CONTEXT_CHARS;

    let chunks: any[] = [];

    // Luôn luôn tìm kiếm ngữ cảnh tài liệu RAG trong mọi trường hợp (kể cả câu hỏi về sản phẩm)
    // INTENT ROUTER: Tự động phân tích câu hỏi để định tuyến nhóm tài liệu phù hợp nếu caller không chỉ định
    let effectiveDocumentTypes = params.documentTypes;
    if (!effectiveDocumentTypes?.length) {
      const detectedTypes = detectRequiredDocumentTypes(params.query);
      if (detectedTypes.length > 0) {
        effectiveDocumentTypes = detectedTypes;
      }
    }

    let permittedDocumentIds: mongoose.Types.ObjectId[] | undefined;
    if (effectiveDocumentTypes?.length) {
      const permittedDocuments = await AIKnowledgeDocumentModel.find({
        companyCode,
        documentType: { $in: effectiveDocumentTypes },
        status: "active",
      }).select("_id").lean();
      permittedDocumentIds = permittedDocuments.map((document) => document._id);

      // Safety net: Nếu doanh nghiệp chưa có tài liệu thuộc các tag được phát hiện,
      // tự động bỏ filter để fallback tìm kiếm trên toàn bộ kho tri thức
      if (permittedDocumentIds.length === 0) {
        permittedDocumentIds = undefined;
        effectiveDocumentTypes = undefined;
      }
    }

    const purposeFilterValues = ["all", purpose, "sales", "support", "marketing"];
    const filter: any = {
      companyCode,
      channelScope: { $in: ["all", channel] },
      $and: [
        {
          $or: [
            { purposeScope: { $in: purposeFilterValues } },
            { purposeScope: { $exists: false } },
          ],
        },
        {
          $or: params.pageId
            ? [
                { pageScope: "selected", pageIds: params.pageId },
                { pageScope: "all" },
                { pageScope: { $exists: false } },
              ]
            : [
                { pageScope: "all" },
                { pageScope: { $exists: false } },
              ],
        },
      ],
    };
    if (permittedDocumentIds) {
      filter.documentId = { $in: permittedDocumentIds };
    }

    // Xây dựng điều kiện Regex tìm kiếm linh hoạt hỗ trợ tiếng Việt có dấu và không dấu
    const searchTerms = Array.from(new Set([...queryTokens, ...accentedTokens]));
    if (searchTerms.length > 0) {
      const regexConditions: any[] = [];
      for (const term of searchTerms.slice(0, 10)) {
        const pattern = buildDiacriticRegexPattern(term);
        if (pattern) {
          regexConditions.push({ text: { $regex: pattern, $options: "i" } });
        }
      }
      if (regexConditions.length > 0) {
        filter.$or = regexConditions;
      }
    }

    chunks = await AIKnowledgeChunkModel.find(filter as any)
      .sort({ updatedAt: -1 })
      .limit(MAX_CHUNKS_TO_RANK)
      .lean();

    if (chunks.length === 0 && searchTerms.length > 0) {
      const fallbackFilter = {
        companyCode,
        channelScope: { $in: ["all", channel] },
        $and: [
          {
            $or: [
              { purposeScope: { $in: purposeFilterValues } },
              { purposeScope: { $exists: false } },
            ],
          },
          {
            $or: params.pageId
              ? [
                  { pageScope: "selected", pageIds: params.pageId },
                  { pageScope: "all" },
                  { pageScope: { $exists: false } },
                ]
              : [
                  { pageScope: "all" },
                  { pageScope: { $exists: false } },
                ],
          },
        ],
      };
      if (permittedDocumentIds) {
        (fallbackFilter as any).documentId = { $in: permittedDocumentIds };
      }
      chunks = await AIKnowledgeChunkModel.find(fallbackFilter as any)
        .sort({ updatedAt: -1 })
        .limit(MAX_CHUNKS_TO_RANK)
        .lean();
    }

    const documentIds = Array.from(new Set(chunks.map((chunk) => String(chunk.documentId))));
    const documents = await AIKnowledgeDocumentModel.find({
      _id: { $in: documentIds },
    })
      .select("_id sourceTitle sourceUrl pageScope pageIds documentType")
      .lean();
    const documentMap = new Map(documents.map((doc) => [String(doc._id), doc]));

    const ranked = buildRankedContextItems({
      chunks,
      documentMap,
      normalizedQuery,
      queryVector,
      queryTokens,
      pageId: params.pageId,
    })
      .filter((item) => item.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const fallbackRanked =
      ranked.length === 0
        ? buildRankedContextItems({
            chunks,
            documentMap,
            normalizedQuery,
            queryVector,
            queryTokens,
            pageId: params.pageId,
          })
            .filter((item) => item.score > 0.03)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
        : [];

    const finalRanked = ranked.length > 0 ? ranked : fallbackRanked;

    let usedChars = 0;
    const selected: string[] = [];
    const selectedItems: typeof finalRanked = [];

    for (const item of finalRanked) {
      if (usedChars + item.text.length > maxContextChars) break;
      const docTypeTag = (item as any).documentType as KnowledgeDocumentType || "general";
      const tagLabel = DOC_TYPE_LABELS[docTypeTag] || "Tài liệu";
      const labeledText = `[${tagLabel}] ${item.title}${item.sourceUrl ? `\n[Link] ${item.sourceUrl}` : ""}\n${item.text}`;
      if (usedChars + labeledText.length > maxContextChars) break;
      selected.push(labeledText);
      selectedItems.push(item);
      usedChars += labeledText.length;
    }

    // Nếu chưa tìm thấy đủ chunk khớp trực tiếp (hoặc câu hỏi chào hỏi/tổng quan/giới thiệu),
    // tự động bổ sung hồ sơ công ty và thông tin sản phẩm/dịch vụ/bảng giá từ kho tri thức
    if (selected.length < 2 && companyCode) {
      const coreDocs = await AIKnowledgeDocumentModel.find({
        companyCode,
        status: "active",
      })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("_id sourceTitle sourceUrl documentType")
        .lean();

      if (coreDocs.length > 0) {
        const coreDocIds = coreDocs.map((d) => d._id);
        const coreDocMap = new Map(coreDocs.map((d) => [String(d._id), d]));
        const coreChunks = await AIKnowledgeChunkModel.find({
          companyCode,
          documentId: { $in: coreDocIds },
        })
          .sort({ chunkIndex: 1 })
          .limit(8)
          .lean();

        for (const pChunk of coreChunks) {
          if (usedChars + pChunk.text.length > maxContextChars) break;
          const isAlreadySelected = selectedItems.some((s) => String(s.chunkId) === String(pChunk._id));
          if (isAlreadySelected) continue;

          const doc = coreDocMap.get(String(pChunk.documentId));
          const docType = (doc?.documentType as KnowledgeDocumentType) || "general";
          const docTypeLabel = DOC_TYPE_LABELS[docType] || "Thông tin doanh nghiệp";
          const labeledText = `[${docTypeLabel}] ${doc?.sourceTitle || "Thông tin doanh nghiệp"}${doc?.sourceUrl ? `\n[Link] ${doc.sourceUrl}` : ""}\n${pChunk.text}`;
          if (usedChars + labeledText.length > maxContextChars) break;
          selected.push(labeledText);
          usedChars += labeledText.length;
        }
      }
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

    const shouldAskProductConfirmation =
      isProductQuery &&
      productCandidateNames.length > 0 &&
      bestScore < 1.2;

    return {
      contextText: selected.map((text, index) => {
        return `[Nguon ${index}]\n${text}`;
      }).join("\n\n---\n\n"),
      matches: finalRanked.length,
      items: selectedItems.map((item) => ({
        chunkId: String(item.chunkId),
        documentId: String(item.documentId),
        version: String(item.version || ""),
        title: item.title,
        sourceUrl: item.sourceUrl,
        text: item.text,
        score: item.score,
        pageScope: item.pageScope,
        pageIds: item.pageIds,
      })),
      bestScore,
      productCandidateNames,
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

  async detectKnowledgeConflicts(companyCode?: string): Promise<KnowledgeConflict[]> {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    if (!normalizedCompanyCode) return [];

    const documents = await AIKnowledgeDocumentModel.find({
      companyCode: normalizedCompanyCode,
      status: "active",
    })
      .select("_id sourceTitle documentType contentHash")
      .lean();

    if (documents.length < 2) return [];

    const docIds = documents.map((d) => d._id);
    const chunks = await AIKnowledgeChunkModel.find({
      companyCode: normalizedCompanyCode,
      documentId: { $in: docIds },
    })
      .select("documentId text chunkIndex")
      .lean();

    const docChunksMap = new Map<string, string[]>();

    for (const chunk of chunks) {
      const dId = String(chunk.documentId);
      if (!docChunksMap.has(dId)) {
        docChunksMap.set(dId, []);
      }
      docChunksMap.get(dId)!.push(chunk.text);
    }

    const conflicts: KnowledgeConflict[] = [];

    // Helper trích xuất số điện thoại hotline
    const extractHotlines = (text: string) => {
      const phones = new Set<string>();
      const regex = /(?:hotline|sdt|số điện thoại|liên hệ|tel|phone)[^\d]{0,10}(0[235789][0-9]{8,9}|\+84[235789][0-9]{8,9})/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const clean = match[1].replace(/\s+/g, "");
        if (clean.length >= 9) phones.add(clean);
      }
      return Array.from(phones);
    };

    // Helper trích xuất sản phẩm và giá tiền
    const extractProductPrices = (text: string) => {
      const productPrices = new Map<string, number>();
      const lines = text.split("\n");
      for (const line of lines) {
        const lineMatch = /(?:sản phẩm|tên hàng|model|dòng|combo)?\s*[:-]?\s*([A-Za-z0-9\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]{3,40})[^\d\n]{1,15}(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(?:vnd|vnđ|đ|dong|đồng)?/i.exec(line);
        if (lineMatch) {
          const rawName = lineMatch[1].trim();
          const rawPrice = lineMatch[2].replace(/[.,]/g, "");
          const priceNum = parseInt(rawPrice, 10);
          const normName = normalizeForLookup(rawName);
          if (normName.length >= 3 && priceNum > 1000 && priceNum < 1000000000) {
            productPrices.set(normName, priceNum);
          }
        }
      }
      return productPrices;
    };

    // Helper trích xuất ngày đổi trả / bảo hành
    const extractPolicies = (text: string) => {
      const policies: { returnDays?: number; warrantyMonths?: number } = {};
      const returnMatch = /đổi trả[^\d]{0,10}(\d{1,3})\s*ngày/i.exec(text);
      if (returnMatch) {
        policies.returnDays = parseInt(returnMatch[1], 10);
      }
      const warrantyMatch = /bảo hành[^\d]{0,10}(\d{1,2})\s*(tháng|năm)/i.exec(text);
      if (warrantyMatch) {
        const num = parseInt(warrantyMatch[1], 10);
        policies.warrantyMonths = warrantyMatch[2].toLowerCase() === "năm" ? num * 12 : num;
      }
      return policies;
    };

    // Đối chiếu từng cặp tài liệu
    for (let i = 0; i < documents.length; i++) {
      for (let j = i + 1; j < documents.length; j++) {
        const docA = documents[i];
        const docB = documents[j];
        const textA = (docChunksMap.get(String(docA._id)) || []).join("\n\n");
        const textB = (docChunksMap.get(String(docB._id)) || []).join("\n\n");

        if (!textA || !textB) continue;

        // 1. Kiểm tra trùng lặp tài liệu (Duplicate / High Overlap)
        if (docA.contentHash && docA.contentHash === docB.contentHash) {
          conflicts.push({
            id: `dup_${docA._id}_${docB._id}`,
            type: "duplicate",
            severity: "warning",
            title: "Trùng lặp 100% nội dung tài liệu",
            description: `Tài liệu “${docA.sourceTitle}” và “${docB.sourceTitle}” có nội dung hoàn toàn giống nhau. Nên xóa bớt 1 tài liệu để tối ưu dung lượng kho tri thức.`,
            documentA: { id: String(docA._id), title: docA.sourceTitle, documentType: docA.documentType },
            documentB: { id: String(docB._id), title: docB.sourceTitle, documentType: docB.documentType },
            conflictingValues: { a: "Bản sao A", b: "Bản sao B" },
          });
          continue;
        }

        // 2. Kiểm tra mâu thuẫn Giá bán (Pricing Conflicts)
        const pricesA = extractProductPrices(textA);
        const pricesB = extractProductPrices(textB);

        for (const [prodName, priceA] of Array.from(pricesA.entries())) {
          if (pricesB.has(prodName)) {
            const priceB = pricesB.get(prodName)!;
            const diffRatio = Math.abs(priceA - priceB) / Math.max(priceA, priceB);
            if (diffRatio > 0.05) { // Lệch nhau trên 5%
              conflicts.push({
                id: `price_${docA._id}_${docB._id}_${encodeURIComponent(prodName)}`,
                type: "pricing",
                severity: "error",
                title: `Mâu thuẫn giá sản phẩm: "${prodName}"`,
                description: `Tài liệu “${docA.sourceTitle}” ghi giá ${priceA.toLocaleString("vi-VN")}đ nhưng tài liệu “${docB.sourceTitle}” lại ghi giá ${priceB.toLocaleString("vi-VN")}đ.`,
                documentA: { id: String(docA._id), title: docA.sourceTitle, documentType: docA.documentType },
                documentB: { id: String(docB._id), title: docB.sourceTitle, documentType: docB.documentType },
                conflictingValues: {
                  a: `${priceA.toLocaleString("vi-VN")} VND`,
                  b: `${priceB.toLocaleString("vi-VN")} VND`,
                },
              });
            }
          }
        }

        // 3. Kiểm tra mâu thuẫn Số Hotline (Contact Conflicts)
        const hotlinesA = extractHotlines(textA);
        const hotlinesB = extractHotlines(textB);
        if (hotlinesA.length > 0 && hotlinesB.length > 0) {
          const hasCommon = hotlinesA.some((h) => hotlinesB.includes(h));
          if (!hasCommon) {
            conflicts.push({
              id: `contact_${docA._id}_${docB._id}`,
              type: "contact",
              severity: "warning",
              title: "Mâu thuẫn số điện thoại Hotline",
              description: `Tài liệu “${docA.sourceTitle}” ghi Hotline (${hotlinesA.join(", ")}) khác với “${docB.sourceTitle}” (${hotlinesB.join(", ")}).`,
              documentA: { id: String(docA._id), title: docA.sourceTitle, documentType: docA.documentType },
              documentB: { id: String(docB._id), title: docB.sourceTitle, documentType: docB.documentType },
              conflictingValues: {
                a: hotlinesA.join(", "),
                b: hotlinesB.join(", "),
              },
            });
          }
        }

        // 4. Kiểm tra mâu thuẫn Chính sách Đổi trả & Bảo hành (Policy Conflicts)
        const polA = extractPolicies(textA);
        const polB = extractPolicies(textB);
        if (polA.returnDays && polB.returnDays && polA.returnDays !== polB.returnDays) {
          conflicts.push({
            id: `policy_ret_${docA._id}_${docB._id}`,
            type: "policy",
            severity: "warning",
            title: "Mâu thuẫn thời hạn đổi trả hàng",
            description: `Tài liệu “${docA.sourceTitle}” quy định đổi trả trong ${polA.returnDays} ngày nhưng “${docB.sourceTitle}” lại ghi ${polB.returnDays} ngày.`,
            documentA: { id: String(docA._id), title: docA.sourceTitle, documentType: docA.documentType },
            documentB: { id: String(docB._id), title: docB.sourceTitle, documentType: docB.documentType },
            conflictingValues: {
              a: `${polA.returnDays} ngày`,
              b: `${polB.returnDays} ngày`,
            },
          });
        }
        if (polA.warrantyMonths && polB.warrantyMonths && polA.warrantyMonths !== polB.warrantyMonths) {
          conflicts.push({
            id: `policy_war_${docA._id}_${docB._id}`,
            type: "policy",
            severity: "warning",
            title: "Mâu thuẫn thời hạn bảo hành",
            description: `Tài liệu “${docA.sourceTitle}” quy định bảo hành ${polA.warrantyMonths} tháng nhưng “${docB.sourceTitle}” lại ghi ${polB.warrantyMonths} tháng.`,
            documentA: { id: String(docA._id), title: docA.sourceTitle, documentType: docA.documentType },
            documentB: { id: String(docB._id), title: docB.sourceTitle, documentType: docB.documentType },
            conflictingValues: {
              a: `${polA.warrantyMonths} tháng`,
              b: `${polB.warrantyMonths} tháng`,
            },
          });
        }
      }
    }

    return conflicts.slice(0, 20);
  },

  async getKnowledgeHealth(companyCode?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    const [documents, chunksCount, latestLog, conflicts] = await Promise.all([
      AIKnowledgeDocumentModel.find({ companyCode: normalizedCompanyCode }).sort({ updatedAt: -1 }).lean(),
      AIKnowledgeChunkModel.countDocuments({ companyCode: normalizedCompanyCode }),
      AIReplyLogModel.findOne({ companyCode: normalizedCompanyCode }).sort({ createdAt: -1 }).lean(),
      this.detectKnowledgeConflicts(normalizedCompanyCode).catch(() => []),
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
    if (conflicts.length > 0) {
      warnings.push(`Phát hiện ${conflicts.length} mâu thuẫn dữ liệu giữa các tài liệu trong kho tri thức!`);
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
      conflicts,
      latestSyncAt: documents[0]?.updatedAt || null,
      latestReplyAt: latestLog?.createdAt || null,
      documents: documents.slice(0, 5).map((doc) => ({
        id: String(doc._id),
        title: doc.sourceTitle,
        sourceType: doc.sourceType,
        status: doc.status,
        version: doc.version,
        channelScope: doc.channelScope,
        purposeScope: doc.purposeScope,
        documentType: doc.documentType || "general",
        updatedAt: doc.updatedAt,
      })),
    };
  },

  async listKnowledgeDocuments(companyCode?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    if (!normalizedCompanyCode) {
      return {
        companyCode: "",
        documents: [],
      };
    }
    const documents = await AIKnowledgeDocumentModel.find({
      companyCode: normalizedCompanyCode,
    })
      .sort({ updatedAt: -1 })
      .lean();
    const chunkCounts = await AIKnowledgeChunkModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          companyCode: normalizedCompanyCode,
          documentId: { $in: documents.map((document) => document._id) },
        },
      },
      { $group: { _id: "$documentId", count: { $sum: 1 } } },
    ]);
    const countByDocumentId = new Map(
      chunkCounts.map((item) => [String(item._id), item.count])
    );

    return {
      companyCode: normalizedCompanyCode,
      documents: documents.map((document) => ({
        id: String(document._id),
        title: document.sourceTitle,
        sourceType: document.sourceType,
        sourceUrl: document.sourceUrl || "",
        status: document.status,
        version: document.version,
        channelScope: document.channelScope || ["all"],
        purposeScope: document.purposeScope || ["all"],
        pageScope: document.pageScope || "all",
        pageIds: document.pageIds || [],
        documentType: document.documentType || "general",
        chunksCount: countByDocumentId.get(String(document._id)) || 0,
        createdBy: document.createdBy || "",
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })),
    };
  },

  async updateKnowledgeDocumentScopes(params: {
    companyCode?: string;
    documentId: string;
    channelScope: ChannelScope[];
    purposeScope: PurposeScope[];
    pageScope?: PageScope;
    pageIds?: string[];
    documentType?: KnowledgeDocumentType;
  }) {
    const companyCode = normalizeCompanyCode(params.companyCode);
    const existing = await AIKnowledgeDocumentModel.findOne({
      _id: params.documentId,
      companyCode,
    }).select("pageScope pageIds documentType");
    if (!existing) return null;
    const pageTarget = normalizePageTarget(
      params.pageScope || existing.pageScope || "all",
      params.pageIds ?? existing.pageIds ?? []
    );
    await validateCompanyFacebookPages(companyCode, pageTarget.pageScope, pageTarget.pageIds);
    const document = await AIKnowledgeDocumentModel.findOneAndUpdate(
      { _id: params.documentId, companyCode },
      {
        $set: {
          channelScope: params.channelScope,
          purposeScope: params.purposeScope,
          pageScope: pageTarget.pageScope,
          pageIds: pageTarget.pageIds,
          documentType: params.documentType || existing.documentType || "general",
        },
      },
      { returnDocument: "after" }
    );
    if (!document) return null;
    await AIKnowledgeChunkModel.updateMany(
      { documentId: document._id, companyCode },
      {
        $set: {
          channelScope: params.channelScope,
          purposeScope: params.purposeScope,
          pageScope: pageTarget.pageScope,
          pageIds: pageTarget.pageIds,
        },
      }
    );
    return {
      id: String(document._id),
      channelScope: document.channelScope,
      purposeScope: document.purposeScope,
      pageScope: document.pageScope,
      pageIds: document.pageIds,
      documentType: document.documentType,
      version: document.version,
      updatedAt: document.updatedAt,
    };
  },

  async deleteKnowledgeDocument(companyCode: string | undefined, documentId: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    if (!normalizedCompanyCode) return null;
    const document = await AIKnowledgeDocumentModel.findOne({
      _id: documentId,
      companyCode: normalizedCompanyCode,
    })
      .select("_id sourceTitle")
      .lean();
    if (!document) return null;
    await Promise.all([
      AIKnowledgeChunkModel.deleteMany({
        documentId: document._id,
        companyCode: normalizedCompanyCode,
      }),
      AIKnowledgeDocumentModel.deleteOne({
        _id: document._id,
        companyCode: normalizedCompanyCode,
      }),
    ]);
    return { id: String(document._id), title: document.sourceTitle };
  },

  async clearKnowledge(companyCode?: string) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode);
    if (!normalizedCompanyCode) return;
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

  /**
   * Thử nghiệm tìm kiếm tri thức (RAG Search Simulator)
   */
  async testSearchKnowledge(params: {
    companyCode?: string;
    query: string;
    channel?: "facebook" | "zalo" | "tiktok";
    pageId?: string;
    topK?: number;
  }) {
    const companyCode = normalizeCompanyCode(params.companyCode);
    const query = String(params.query || "").trim();
    if (!query) {
      return {
        query: "",
        detectedDocumentTypes: [],
        matches: 0,
        bestScore: 0,
        items: [],
        simulatedAnswer: "Vui lòng nhập câu hỏi để thử nghiệm tìm kiếm tri thức.",
      };
    }

    const detectedDocumentTypes = detectRequiredDocumentTypes(query);
    const ragContext = await this.searchRelevantContext({
      companyCode,
      query,
      channel: params.channel || "facebook",
      pageId: params.pageId,
      topK: params.topK || 5,
    });

    let simulatedAnswer = "";
    try {
      const chatRes = await geminiService.chat(
        query,
        [],
        {
          companyCode,
          enabled: true,
          model: "gemini-3.5-flash",
          replyDelay: 0,
          advancedInstructions: "",
          trainingKnowledge: "",
        },
        ragContext
      );
      simulatedAnswer = chatRes.text;
    } catch (err: any) {
      simulatedAnswer = `[Lỗi sinh câu trả lời]: ${err.message || String(err)}`;
    }

    return {
      query,
      detectedDocumentTypes,
      matches: ragContext.matches,
      bestScore: ragContext.bestScore,
      items: (ragContext.items || []).map((item) => ({
        title: item.title,
        documentType: (item as any).documentType || "general",
        score: item.score,
        text: item.text,
        sourceUrl: item.sourceUrl,
      })),
      simulatedAnswer,
    };
  },
};
