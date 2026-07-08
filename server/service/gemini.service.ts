import { AIMediaModel } from "../model/ai-media.model";
import { CompanyModel } from "../model/company.model";
import { cloudinaryService } from "./cloudinary.service";
import { piapiService } from "./piapi.service";
import { videoBlueprintService } from "./video-blueprint.service";
import { hermesService } from "./hermes.service";
import { elevenlabsService } from "./elevenlabs.service";
import { openrouterChat, openrouterGenerateImage, mapModelName, type OpenRouterMessage } from "./openrouter.service";
import { exec } from "child_process";
import { remotionQueueService } from "./remotion-queue.service";
import { remotionService } from "./remotion.service";
import { hyperframeService } from "./hyperframe.service";
import { broadcastEvent } from "../socket";
import { editVideo as _editVideo, executeLocalRenderJob as _executeLocalRenderJob } from "./video-edit";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_HEAVY_MODEL = process.env.GEMINI_HEAVY_MODEL || "gemini-3.5-flash";
const GEMINI_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || "veo31-video-fast-audio";

// Định nghĩa Type tương thích để các schema hiện tại không cần sửa
const Type = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  INTEGER: "integer",
  NUMBER: "number",
  BOOLEAN: "boolean",
} as const;


function safeParseJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) {
      cleaned = match[1].trim();
    }
  }
  return JSON.parse(cleaned);
}

async function fetchWithRetry(url: string, retries = 3, delay = 2000): Promise<Response> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} - ${res.statusText}`);
    } catch (err) {
      lastError = err;
    }
    if (i < retries - 1) {
      console.warn(`[fetchWithRetry] Failed to fetch ${url}. Retrying in ${delay}ms... Error: ${lastError?.message || lastError}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError;
}

async function getVideoDuration(url: string): Promise<number> {
  try {
    const matchedRecord = await AIMediaModel.findOne({ url }).lean();
    if (matchedRecord?.metadata?.duration) {
      const dur = Number(matchedRecord.metadata.duration);
      if (dur > 0) return dur;
    }
  } catch (dbErr) {
    console.warn("[geminiService.getVideoDuration] DB query failed:", dbErr);
  }

  return new Promise<number>((resolve) => {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${url}"`;
    exec(cmd, (error, stdout) => {
      if (!error && stdout) {
        const dur = parseFloat(stdout.trim());
        if (!isNaN(dur) && dur > 0) {
          resolve(dur);
          return;
        }
      }
      resolve(5); // default fallback
    });
  });
}

function normalizePiapiVideoModel(modelName?: string): string {
  const rawModel = (modelName || GEMINI_VIDEO_MODEL || "").trim();
  const normalizedModel = rawModel.toLowerCase();

  if (
    normalizedModel === "veo-3.1-generate-preview" ||
    normalizedModel === "veo31-video-audio" ||
    normalizedModel === "piapi-veo31-video-audio" ||
    normalizedModel === "veo"
  ) {
    return "veo31-video-audio";
  }

  if (
    normalizedModel === "veo-3.1-fast-generate-preview" ||
    normalizedModel === "veo31-video-fast-audio" ||
    normalizedModel === "piapi-veo31-video-fast-audio"
  ) {
    return "veo31-video-fast-audio";
  }

  if (
    normalizedModel === "veo-3.1-lite-generate-preview" ||
    normalizedModel === "veo31-video-fast-no-audio" ||
    normalizedModel === "piapi-veo31-video-fast-no-audio"
  ) {
    return "veo31-video-fast-no-audio";
  }

  if (normalizedModel.includes("veo-3.1") || normalizedModel.includes("veo31") || normalizedModel.startsWith("veo3")) {
    return "veo31-video-audio";
  }

  if (normalizedModel.startsWith("piapi-")) {
    return rawModel;
  }

  return "veo31-video-fast-audio";
}

function extractSourceBrief(rawText: string): {
  userRequest: string;
  attachedDocumentName: string;
  attachedDocumentExcerpt: string;
  normalizedBrief: string;
} {
  const text = String(rawText || "").trim();
  if (!text) {
    return {
      userRequest: "",
      attachedDocumentName: "",
      attachedDocumentExcerpt: "",
      normalizedBrief: "",
    };
  }

  const docMarker = "TÀI LIỆU ĐÍNH KÈM:";
  const docMarkerIndex = text.indexOf(docMarker);
  const userRequest = (docMarkerIndex >= 0 ? text.slice(0, docMarkerIndex) : text).trim();
  const attachedBlock = docMarkerIndex >= 0 ? text.slice(docMarkerIndex + docMarker.length).trim() : "";

  let attachedDocumentName = "";
  let attachedDocumentExcerpt = "";

  if (attachedBlock) {
    const nameMatch = attachedBlock.match(/Tên tài liệu:\s*(.+)/i);
    attachedDocumentName = String(nameMatch?.[1] || "").trim();

    const contentMatch = attachedBlock.match(/Nội dung tài liệu:\s*([\s\S]+)/i);
    attachedDocumentExcerpt = String(contentMatch?.[1] || attachedBlock)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2200);
  }

  const normalizedBrief = [
    userRequest ? `User request: ${userRequest}` : "",
    attachedDocumentName ? `Attached document: ${attachedDocumentName}` : "",
    attachedDocumentExcerpt ? `Attached document facts: ${attachedDocumentExcerpt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    userRequest,
    attachedDocumentName,
    attachedDocumentExcerpt,
    normalizedBrief,
  };
}

type ChatIntent = "small_talk" | "company_faq" | "product_pricing_policy" | "out_of_scope";

function normalizeIntentText(text: string) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectChatIntent(message: string, history: any[] = []): ChatIntent {
  const currentText = normalizeIntentText(message);
  const recentHistoryText = history
    .slice(-4)
    .map((item) => normalizeIntentText(item?.text || ""))
    .join(" ");
  const combinedText = `${recentHistoryText} ${currentText}`.trim();

  const factualPatterns = [
    /\b(gia|bao nhieu tien|bao nhieu|bang gia|bao gia|chi phi|phi ship|freeship|uu dai|khuyen mai)\b/,
    /\b(bao hanh|doi tra|hoan tien|giao hang|van chuyen|thanh toan|thoi gian giao)\b/,
    /\b(san pham|goi dich vu|goi|tinh nang|thong so|con hang|size|mau|chat lieu)\b/,
    /\b(dia chi|hotline|so dien thoai|email|cong ty|thuong hieu|chi nhanh)\b/,
  ];
  if (factualPatterns.some((pattern) => pattern.test(combinedText))) {
    return "product_pricing_policy";
  }

  const smallTalkPatterns = [
    /\b(xin chao|chao shop|chao ban|hello|hi|alo|ad oi|shop oi)\b/,
    /\b(cam on|thank you|ok nha|ok em|vang|dạ|da roi)\b/,
    /\b(tu van giup|minh can tu van|hoi ti|cho hoi)\b/,
  ];
  if (smallTalkPatterns.some((pattern) => pattern.test(currentText)) && currentText.length <= 120) {
    return "small_talk";
  }

  const companyPatterns = [
    /\b(ben minh lam gi|gioi thieu cong ty|cong ty ban gi|ve ben minh|thong tin cong ty)\b/,
    /\b(quy trinh|faq|ho tro|cham soc khach hang|lien he)\b/,
  ];
  if (companyPatterns.some((pattern) => pattern.test(combinedText))) {
    return "company_faq";
  }

  const outOfScopePatterns = [
    /\b(boi bai|tu vi|xem ngay|xem menh|du doan so xo)\b/,
    /\b(viet tho|ke chuyen cuoi|giai toan|lap trinh|code giup)\b/,
    /\b(tin tuc the gioi|chinh tri|bong da hom nay|gia vang)\b/,
  ];
  if (outOfScopePatterns.some((pattern) => pattern.test(combinedText))) {
    return "out_of_scope";
  }

  return "company_faq";
}

function formatHumanLikeChatReply(rawText: string) {
  const cleaned = String(rawText || "")
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) {
    return "Mình kiểm tra lại rồi nhắn bạn ngay nhé.";
  }

  const normalized = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  const shortLineCandidates = normalized
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);

  const compactLines: string[] = [];
  let currentLine = "";

  for (const piece of shortLineCandidates) {
    const next = currentLine ? `${currentLine} ${piece}` : piece;
    if (next.length <= 120) {
      currentLine = next;
    } else {
      if (currentLine) compactLines.push(currentLine);
      currentLine = piece;
    }
  }

  if (currentLine) compactLines.push(currentLine);

  const finalLines = compactLines
    .slice(0, 5)
    .map((line) => line.trim())
    .filter((line, index) => {
      if (index !== 0) return true;

      return !/^Dạ,?\s*(?:em\s+chào|[A-Za-zÀ-ỹ0-9\s]+ xin chào)\s+anh\/chị[^\n]*$/i.test(line);
    });

  const finalResult = finalLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return finalResult || normalized;

  const trimmedLines = compactLines.slice(0, 5).map((line) => line.trim());
  let result = trimmedLines.join("\n");

  result = result
    .replace(/\b(Dạ,?\s*em chào anh\/chị.*?[\n]?)/i, "")
    .replace(/\b(Dạ,?\s*[A-Za-zÀ-ỹ0-9\s]+ xin chào anh\/chị.*?[\n]?)/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result || normalized;
}

function buildFaithfulVisualGuardrail(input: {
  sourceBrief?: string;
  title?: string;
  summary?: string;
  suggestedContent?: string;
  outline?: string;
  bodyText?: string;
  channels?: string[];
  selectedPillars?: string[];
}) {
  const source = extractSourceBrief(input.sourceBrief || "");

  return [
    "STRICT SOURCE-OF-TRUTH REQUIREMENT:",
    source.userRequest ? `Original user brief in Vietnamese: ${source.userRequest}` : "",
    source.attachedDocumentName ? `Attached source file: ${source.attachedDocumentName}` : "",
    source.attachedDocumentExcerpt ? `Facts extracted from the attached file: ${source.attachedDocumentExcerpt}` : "",
    input.title ? `Campaign title: ${input.title}` : "",
    input.summary ? `Campaign summary: ${input.summary}` : "",
    input.suggestedContent ? `Suggested content direction: ${input.suggestedContent}` : "",
    input.outline ? `Post outline: ${input.outline}` : "",
    input.bodyText ? `Post body/caption: ${input.bodyText}` : "",
    Array.isArray(input.channels) && input.channels.length > 0 ? `Target channels: ${input.channels.join(", ")}.` : "",
    Array.isArray(input.selectedPillars) && input.selectedPillars.length > 0 ? `Required pillars: ${input.selectedPillars.join(", ")}.` : "",
    "The English media prompt must preserve the exact meaning of the Vietnamese brief and attached file.",
    "Do not add products, people, locations, industries, outfits, props, or use-cases that are not grounded in the source brief.",
    "Do not generalize into generic office, lifestyle, beauty, fashion, product showcase, or abstract marketing scenes unless the source explicitly asks for that.",
    "If the source is about software, ecommerce, logistics, education, training, omnichannel, operations, CRM, warehouse, or business workflow, the visual must clearly show that exact context.",
    "Translate faithfully into English for image/video generation, but keep the original business meaning, subject, context, and constraints unchanged.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { mimeType: contentType, data: base64 };
  } catch (error) {
    console.error(`[fetchImageAsBase64] Error fetching image from ${url}:`, error);
    return null;
  }
}

/**
 * Chuyển đổi Gemini "contents" format → OpenAI/OpenRouter messages format.
 * Hỗ trợ text và inline images (base64).
 */
async function buildOpenRouterMessages(
  contents: any,
  systemInstruction?: string,
  images?: string[]
): Promise<OpenRouterMessage[]> {
  const msgs: OpenRouterMessage[] = [];

  if (systemInstruction) {
    msgs.push({ role: "system", content: systemInstruction });
  }

  if (typeof contents === "string") {
    if (images && images.length > 0) {
      const parts: any[] = [{ type: "text", text: contents }];
      for (const img of images) {
        if (img.startsWith("data:")) {
          parts.push({ type: "image_url", image_url: { url: img } });
        } else if (img.startsWith("http://") || img.startsWith("https://")) {
          const imgData = await fetchImageAsBase64(img);
          if (imgData) {
            parts.push({ type: "image_url", image_url: { url: `data:${imgData.mimeType};base64,${imgData.data}` } });
          }
        }
      }
      msgs.push({ role: "user", content: parts });
    } else {
      msgs.push({ role: "user", content: contents });
    }
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === "string") {
        msgs.push({ role: "user", content: item });
      } else if (item.role && item.parts) {
        const role: "user" | "assistant" = item.role === "model" ? "assistant" : "user";
        const contentParts: any[] = [];
        for (const p of item.parts as any[]) {
          if (typeof p?.text === "string") {
            contentParts.push({ type: "text", text: p.text });
          } else if (p?.inlineData?.data) {
            const mimeType = p.inlineData.mimeType || "image/png";
            contentParts.push({ type: "image_url", image_url: { url: `data:${mimeType};base64,${p.inlineData.data}` } });
          }
        }
        if (contentParts.length === 0) {
          // skip empty
        } else if (role === "assistant") {
          // assistant content phải là string
          const text = contentParts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
          if (text) msgs.push({ role: "assistant", content: text });
        } else if (contentParts.length === 1 && contentParts[0].type === "text") {
          msgs.push({ role: "user", content: contentParts[0].text });
        } else {
          msgs.push({ role: "user", content: contentParts as import("./openrouter.service").OpenRouterContentPart[] });
        }
      } else if (item.text) {
        msgs.push({ role: "user", content: item.text });
      }
    }
  }

  if (!msgs.some((m) => m.role === "user")) {
    msgs.push({ role: "user", content: String(contents) });
  }

  return msgs;
}

async function generateText(
  model: string,
  contents: any,
  config?: {
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: any;
    images?: string[];
  }
): Promise<{ text: string }> {
  let modelId = model || GEMINI_TEXT_MODEL;
  // normalize alias
  if (modelId === "gemini-3.5-flash") modelId = "gemini-2.5-flash";

  const needsJson = !!config?.responseMimeType?.includes("json") || !!config?.responseSchema;

  const messages = await buildOpenRouterMessages(contents, config?.systemInstruction, config?.images);

  console.log(`[generateText] Calling OpenRouter | model=${mapModelName(modelId)} | msgs=${messages.length} | hasSchema=${!!config?.responseSchema} | hasImages=${!!(config?.images?.length)}`);

  return openrouterChat({
    model: modelId,
    messages,
    temperature: config?.temperature ?? 0.7,
    jsonMode: needsJson,
    responseSchema: config?.responseSchema,
  });
}

export const geminiService = {
  normalizeMarketingChannel(rawChannel: string): string {
    if (!rawChannel) return "Facebook";
    const c = String(rawChannel).toLowerCase().trim();
    if (c.includes("facebook") || c === "fb") return "Facebook";
    if (c.includes("tiktok") || c.includes("tik tok")) return "TikTok";
    if (c.includes("linkedin") || c.includes("linked in")) return "LinkedIn";
    if (c.includes("instagram") || c === "ig" || c.includes("insta")) return "Instagram";
    if (c.includes("zalo")) return "Zalo";
    return "Facebook";
  },

  sanitizeHashtags(rawHashtags: unknown, fallbackTitle: string): string[] {
    const hashtags = Array.isArray(rawHashtags) ? rawHashtags : [];
    const normalized = hashtags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .map((tag) => tag.replace(/\s+/g, ""))
      .filter((tag, index, arr) => arr.indexOf(tag) === index);

    if (normalized.length > 0) {
      return normalized.slice(0, 6);
    }

    const fallback = String(fallbackTitle || "")
      .split(/[^A-Za-z0-9À-ỹ]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .slice(0, 3)
      .map((part) => `#${part}`);

    return fallback.length > 0 ? fallback : ["#Marketing"];
  },

  /**
   * Trợ lý Chat CRM Omni-Inbox
   */
  async chat(
    message: string,
    history: any[],
    aiConfig: any,
    ragContext?: {
      contextText?: string;
      companyCode?: string;
      matches?: number;
      bestScore?: number;
      productCandidateNames?: string[];
      shouldAskProductConfirmation?: boolean;
    }
  ): Promise<{ text: string; isMock: boolean }> {
    aiConfig = {
      ...aiConfig,
      autoClassify: true,
      autoCloseDeal: true,
      autoFeedback: true
    };

    const getMockResponse = () => {
      return new Promise<{ text: string; isMock: boolean }>((resolve) => {
        setTimeout(() => {
          let replyText = `[Giả lập Trợ lý AI] Cảm ơn bạn đã phản hồi! Với cài đặt Trợ lý AI (Cấu hình: ${aiConfig.autoClassify ? "Tự phân loại" : "Thường"
            }), tôi đề xuất phương án tối ưu cho bạn.`;

          const msgLower = message.toLowerCase();
          if (msgLower.includes("giá") || msgLower.includes("bao nhiêu")) {
            replyText =
              "Chào bạn! Hiện tại dòng sản phẩm Thiết bị đeo thông minh X1 đang có giá ưu đãi là 1.890.000đ (giảm từ 2.450.000đ). Trợ lý AI có thể hỗ trợ tạo đơn hàng ngay lập tức nếu bạn sẵn sàng!";
          } else if (msgLower.includes("khuyến mãi") || msgLower.includes("ưu đãi")) {
            replyText =
              "Dạ, bên mình đang có chương trình khuyến mãi 'SIÊU ƯU ĐÃI THÁNG 10': giảm giá lên đến 30% cho toàn bộ linh kiện robot và tặng voucher 200k cho đơn hàng sau đó. Bạn có muốn nhận mã voucher không ạ?";
          } else if (msgLower.includes("vận chuyển") || msgLower.includes("ship")) {
            replyText =
              "Đơn hàng của bạn sẽ được hỗ trợ Freeship toàn quốc cho các hóa đơn từ 500k trở lên. Thời gian giao hàng dự kiến là từ 2-3 ngày làm việc đối với khu vực tỉnh thành khác, Hà Nội/HCM sẽ nhận hàng trong ngày ạ!";
          }
          resolve({ text: replyText, isMock: true });
        }, 800);
      });
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockResponse();
    }

    const detectedIntent = detectChatIntent(message, history);
    const shouldRequireStrictKnowledge = detectedIntent === "product_pricing_policy" || detectedIntent === "company_faq";
    const hasCompanyKnowledge = !!ragContext?.contextText;
    const assistantMode = hasCompanyKnowledge ? "COMPANY_TRAINED_MODE" : "DEFAULT_ASSISTANT_MODE";

    // Resolve companyName dynamically
    const companyCode = ragContext?.companyCode || aiConfig?.companyCode;
    let companyName = aiConfig?.companyName || "";

    if (!companyName && companyCode) {
      try {
        const company = await CompanyModel.findOne({ code: companyCode.toUpperCase() }).lean();
        if (company) {
          companyName = company.name;
        }
      } catch (err) {
        console.warn("[geminiService.chat] Error fetching company from DB:", err);
      }
    }
    if (!companyName) {
      companyName = "doanh nghiệp";
    }

    const conversationPlaybook = `
QUY TẮC CHĂM SÓC KHÁCH HÀNG THÔNG MINH VÀ KHÉO LÉO:
- Chỉ chào đầy đủ ở đầu hội thoại. Ở các lượt sau, trả lời tự nhiên, ngắn gọn và đi thẳng vào nhu cầu của khách.
- Mỗi câu trả lời nên ưu tiên theo thứ tự: xác nhận nhu cầu, đưa gợi ý phù hợp từ knowledge, rồi kết bằng 1 câu hỏi ngắn để dẫn dắt bước tiếp theo.
- Không hỏi dồn quá nhiều câu trong một lượt. Chỉ hỏi 1-2 câu thật sự cần thiết.
- Nếu khách đã cung cấp đủ thông tin, không hỏi lại điều khách vừa nói. Hãy chuyển sang gợi ý hoặc chốt bước tiếp theo.
- Khi khách vừa cung cấp thêm thông tin, làm rõ nhu cầu, xác nhận lựa chọn, hoặc phản hồi tích cực, hãy cảm ơn ngắn gọn một cách tự nhiên trước khi tư vấn tiếp, ví dụ như "Dạ em cảm ơn Anh/Chị đã chia sẻ ạ".
- Khi knowledge có nhiều lựa chọn, chỉ chọn ra 1-3 phương án phù hợp nhất và giải thích rất ngắn vì sao phù hợp.
- Nếu thiếu dữ liệu về giá, tồn kho, màu, size, phiên bản hoặc khuyến mãi, hãy nói rõ phần nào chưa đủ dữ liệu nhưng vẫn hỗ trợ tối đa bằng thông tin hiện có.
- Chỉ đề nghị chuyển nhân viên khi thực sự cần xác nhận thông tin ngoài knowledge hoặc cần thao tác mà AI không làm được.

QUY TẮC UPSELL VÀ CROSS-SELL:
- Upsell phải khéo, đúng ngữ cảnh và chỉ dựa trên knowledge của doanh nghiệp.
- Chỉ upsell khi khách đã thể hiện nhu cầu tương đối rõ hoặc đang quan tâm tới một sản phẩm/dịch vụ cụ thể.
- Ưu tiên upsell theo hướng giá trị: phiên bản phù hợp hơn, gói đầy đủ hơn, dung tích lớn hơn, giải pháp tiết kiệm hơn, hoặc sản phẩm bổ trợ hợp lý.
- Không ép bán, không upsell quá sớm ngay ở lượt đầu.
- Nếu cross-sell, chỉ gợi ý thêm tối đa 1-2 sản phẩm bổ trợ thực sự liên quan trực tiếp.
- Không tự bịa combo, quà tặng hay ưu đãi nếu knowledge không có.

QUY TẮC CHỐT ĐƠN MỀM:
- Khi khách đã có ý định mua rõ, hãy chuyển từ tư vấn sang chốt nhẹ nhàng: xác nhận nhu cầu, tóm tắt lựa chọn phù hợp, rồi hỏi bước hành động tiếp theo.
- Bước hành động tiếp theo phải ngắn và cụ thể, ví dụ: xác nhận phiên bản, số lượng, biến thể, hoặc xin thông tin để nhân viên lên đơn.
- Không lặp lại câu xin chuyển nhân viên qua nhiều lượt liên tiếp. Nếu cần chuyển, hãy nêu rõ lý do và giá trị của bước chuyển đó.

QUY TẮC TÍNH SỐ TIỀN VÀ BÁO GIÁ:
- Khi khách hàng hỏi giá của một sản phẩm, hãy báo giá đơn vị chính xác theo thông tin sản phẩm (VND).
- Nếu khách hàng muốn mua sản phẩm với số lượng nhiều hơn 1 (ví dụ: "lấy 2 chai", "mua 3 cái", v.v.), hãy lấy giá đơn vị nhân với số lượng để tính toán tổng số tiền thanh toán thực tế và báo cho khách hàng tổng số tiền cụ thể đó kèm theo phép tính rõ ràng (ví dụ: 2 cái * 320.000đ = 640.000đ).
- Không đoán hoặc tự bịa đặt giá/chương trình ưu đãi nếu không có trong dữ liệu sản phẩm của doanh nghiệp.

QUY TẮC TƯ VẤN SẢN PHẨM KHI ĐÃ CÓ KNOWLEDGE:
- Nếu khách hỏi chung như "bên mình có gì" hoặc "shop có sản phẩm gì", hãy ưu tiên liệt kê các nhóm sản phẩm hoặc 3-5 sản phẩm tiêu biểu có trong knowledge thay vì mô tả ngành hàng chung chung.
- Nếu khách hỏi một sản phẩm cụ thể và knowledge có đúng tên đó, hãy xác nhận ngay và tóm tắt ngắn những điểm quan trọng có trong knowledge.
- Nếu khách yêu cầu xem sản phẩm, hãy ưu tiên mô tả hoặc liệt kê sản phẩm theo knowledge trước; chỉ nêu hạn chế về ảnh/video khi thật sự cần.
- Nếu đã có context phù hợp về sản phẩm, ưu tiên trả lời theo cấu trúc: xác nhận nhu cầu, nêu 1-3 lựa chọn phù hợp, tóm tắt ngắn lý do phù hợp, rồi mới hỏi thêm 1 câu ngắn nếu cần.
- Không lặp lại nguyên văn cùng một mẫu câu chào hỏi, xin chuyển nhân viên hoặc giải thích dài dòng ở nhiều lượt tiếp theo. Mỗi lượt phải có tiến triển mới.
`;

    const systemInstruction = `
Bạn là trợ lý chăm sóc khách hàng của ${companyName}.
Bạn đang hỗ trợ khách hàng trong khung chat của chính doanh nghiệp này, không phải trợ lý chung của nền tảng.

NGUYÊN TẮC NHẬN DIỆN DOANH NGHIỆP:
- Chỉ trả lời như đại diện của ${companyName}.
- Không tự giới thiệu, chào bán, hay mô tả iGen ERP, nền tảng quản trị, phần mềm CRM/ERP hoặc hệ thống vận hành, trừ khi dữ liệu tri thức của ${companyName} thật sự nói rõ về các nội dung đó.
- Nếu knowledge của doanh nghiệp là về mỹ phẩm, spa, cửa hàng, thực phẩm, dịch vụ hoặc lĩnh vực cụ thể khác, hãy bám đúng lĩnh vực đó.
- Nếu không có đủ dữ liệu để xác nhận, hãy trả lời trung tính theo doanh nghiệp hiện tại thay vì suy diễn sang sản phẩm/dịch vụ mặc định của hệ thống.

QUY CHUẨN XƯNG HÔ VÀ CHÀO HỎI CHUYÊN NGHIỆP:
- Luôn mở đầu câu trả lời bằng lời chào lịch sự như: "Dạ, [Tên doanh nghiệp] xin chào anh/chị ạ!" hoặc "Dạ, em chào anh/chị ạ!" hoặc "Dạ xin kính chào Quý khách!".
- Luôn xưng hô là "Dạ, bên em..." hoặc "Dạ, [Tên doanh nghiệp]..." hoặc "Dạ, em..." và gọi khách hàng là "Quý khách" hoặc "Anh/Chị".
- Luôn sử dụng kính ngữ "Dạ" ở đầu câu và "ạ" ở cuối câu để đảm bảo sự lịch thiệp, tôn trọng và chuyên nghiệp tuyệt đối.
- Tuyệt đối KHÔNG sử dụng các từ xưng hô quá thân mật hoặc thiếu trang trọng như "cậu", "tớ", "bạn", "mày", "tao".
- Trả lời bằng ngôn phong tiếng Việt chuẩn mực, tinh tế, tích cực, không dùng ngôn ngữ teen, từ lóng. Chỉ chèn thêm icon/emoji khi thực sự phù hợp với ngữ cảnh hội thoại (ví dụ: cảm ơn, xin lỗi, chúc mừng, chào hỏi thân thiện). Không chèn icon/emoji một cách ngẫu nhiên, lặp đi lặp lại hoặc rập khuôn ở tất cả các tin nhắn. Sử dụng tối đa 1 icon/emoji và đảm bảo nó tự nhiên, chuyên nghiệp.

Quy tắc và chỉ dẫn hành xử từ doanh nghiệp:
${aiConfig.advancedInstructions ? `- ${aiConfig.advancedInstructions}` : "- Không có chỉ dẫn đặc biệt."}
${conversationPlaybook}

Dữ liệu vận hành hiện tại:
- Chế độ trả lời: ${assistantMode}
- Nhóm ý định hội thoại hiện tại: ${detectedIntent}
- COMPANY_TRAINED_MODE: đã có tài liệu/chính sách riêng của công ty, hãy bám sát tài liệu và nói theo chỉ dẫn doanh nghiệp.
- DEFAULT_ASSISTANT_MODE: chưa có tài liệu riêng, vẫn trả lời khách mặc định một cách lịch sự, hỗ trợ hỏi thêm nhu cầu và chuyển nhân viên khi cần.

THỨ TỰ ƯU TIÊN NGUỒN TRI THỨC:
- Ưu tiên số 1 là dữ liệu tri thức đã truy xuất cho đúng doanh nghiệp ở bên dưới.
- Nếu dữ liệu tri thức bên dưới có nội dung rõ ràng, phải trả lời theo đó.
- Chỉ dùng trainingKnowledge hoặc suy luận trung tính khi dữ liệu truy xuất không có hoặc không đủ chắc chắn.
- Không được để prompt mặc định của hệ thống lấn át dữ liệu tri thức của doanh nghiệp.

Dữ liệu tri thức đã truy xuất riêng cho doanh nghiệp ${ragContext?.companyCode || "hiện tại"}:
${ragContext?.contextText ? ragContext.contextText : "- Không tìm thấy tri thức phù hợp trong kho dữ liệu."}

Gợi ý xác nhận sản phẩm gần đúng:
${ragContext?.shouldAskProductConfirmation && ragContext?.productCandidateNames?.length
        ? `- Khách có thể đang nói chưa chính xác tên sản phẩm. Nếu chưa chắc chắn, hay hỏi xác nhận ngắn gọn theo kiểu: "Dạ, anh/chị đang nhắc tới sản phẩm ${ragContext.productCandidateNames[0]} bên em đúng không ạ?".
- Nêu có nhiều hơn 1 lựa chọn gần đúng, chỉ đưa tối đa 2-3 tên sản phẩm để khách chọn.
- Không khẳng định là đúng 100% khi độ khớp chưa cao.`
        : "- Không cần hỏi xác nhận tên sản phẩm ở lượt này."}

Quy tắc an toàn bắt buộc:
- Khi ở DEFAULT_ASSISTANT_MODE, vẫn được chào hỏi, xác nhận nhu cầu, hỏi thêm thông tin, hướng dẫn khách để lại số điện thoại/nhu cầu và nói sẽ có nhân viên hỗ trợ.
- Chỉ trả lời các thông tin cụ thể về giá, bảo hành, giao hàng, đổi trả, khuyến mãi nếu có trong dữ liệu tri thức ở trên hoặc trong lịch sử hội thoại.
- Nếu khách hỏi chính sách/giá/thông tin cụ thể mà không có dữ liệu phù hợp, hãy nói rằng bạn cần chuyển nhân viên kiểm tra lại, tuyệt đối không tự bịa.
- Không trộn lẫn thông tin giữa các công ty khác nhau.

Thông tin cấu hình hiện tại của bạn:
- Tự động phân loại khách hàng: ${aiConfig.autoClassify ? "Đang BẬT. Hãy phân loại khách dựa trên xu hướng hội thoại và thông báo khéo léo." : "Đang TẮT"}
- Tự động chốt đơn hàng: ${aiConfig.autoCloseDeal ? "Đang BẬT. Hãy tìm cơ hội khéo léo hướng khách hàng chốt mua sản phẩm một cách nhanh gọn, gửi thông tin tạo đơn." : "Đang TẮT"}
- Tự động xin feedback cuối hội thoại: ${aiConfig.autoFeedback ? "Đang BẬT. Nếu cuộc đối thoại đi đến hồi kết, hãy lịch sự xin ý kiến đánh giá chất lượng dịch vụ." : "Đang TẮT"}
`;

    const humanStyleOverride = `
STYLE OVERRIDE - ƯU TIÊN CAO NHẤT:
- Hãy trả lời như nhân viên đang chat với khách, không nói giống bot.
- Chỉ sử dụng icon/emoji khi thực sự phù hợp với ngữ cảnh hội thoại (như cảm ơn, xin lỗi, chúc mừng, chào hỏi). Tuyệt đối không chèn icon/emoji một cách ngẫu nhiên hoặc lặp đi lặp lại ở mọi câu trả lời để tránh làm tin nhắn rối mắt hoặc mang lại cảm giác bot tự động.
- Vẫn phải xưng hô chuẩn doanh nghiệp: ưu tiên "Dạ", "em", "anh/chị", "quý khách" khi phù hợp.
- Luôn cần có lời cảm ơn khi khách đã chia sẻ thông tin, xác nhận đơn, hoặc hợp tác; nhưng cảm ơn ngắn gọn, tự nhiên.
- Không dùng markdown, không dùng dấu *, **, -, bullet list, tiêu đề hay danh sách kiểu tài liệu.
- Mỗi phản hồi phải gọn, tự nhiên, dễ đọc trên giao diện chat.
- Thường chỉ 1-4 dòng, mỗi dòng ngắn. Tránh một đoạn văn dài.
- Chỉ chào ở đầu cuộc hội thoại nếu cần. Các lượt sau vào thẳng nội dung.
- Không lặp lại câu chào hoặc "dạ em" lặp đi lặp lại ở mỗi tin nhắn.
- Nếu cần tóm tắt đơn hàng, tách từng ý thành từng dòng ngắn, vẫn viết như người chat thật.
- Nếu có thể trả lời trực tiếp thì trả lời trực tiếp. Không giải thích dài dòng.
- Nếu cần hỏi thêm, chỉ hỏi 1 câu quan trọng nhất.
- Mẫu giống mong muốn:
  "Dạ, em cảm ơn anh."
  "Sản phẩm này bên em đang có anh nha."
  "Giá hiện tại là 320.000đ anh nhé."
  "Nếu anh lấy 2 chai em gợi ý thêm bản 500ml sẽ tiết kiệm hơn."
`;

    const finalSystemInstruction = `${systemInstruction}\n${humanStyleOverride}`;

    const contents = history.map((h: any) => ({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    }));

    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    try {
      const selectedModel = aiConfig?.model || GEMINI_TEXT_MODEL;
      const fallbackNoKnowledgeReply =
        shouldRequireStrictKnowledge && !hasCompanyKnowledge
          ? `Dạ, hiện tại em chưa có đủ dữ liệu xác nhận chính xác thông tin này từ tài liệu nội bộ của ${companyName}. Em xin phép chuyển nhân viên hỗ trợ để tư vấn đúng và đầy đủ hơn ạ.`
          : null;

      if (detectedIntent === "out_of_scope") {
        return {
          text: formatHumanLikeChatReply(`Dạ, em đang hỗ trợ thông tin về sản phẩm, dịch vụ và chính sách của ${companyName}. Anh/chị cứ gửi giúp em câu hỏi liên quan đến doanh nghiệp để em hỗ trợ đúng hơn ạ.`),
          isMock: false,
        };
      }

      if (fallbackNoKnowledgeReply) {
        return {
          text: formatHumanLikeChatReply(fallbackNoKnowledgeReply),
          isMock: false,
        };
      }

      const response = await generateText(
        selectedModel,
        contents,
        {
          systemInstruction: finalSystemInstruction,
          temperature: detectedIntent === "small_talk" ? 0.75 : 0.35,
        }
      );

      response.text = formatHumanLikeChatReply(response.text || "Minh kiem tra lai roi nhan ban ngay nhe.");

      return {
        text: response.text || "Xin lỗi, tôi chưa thể xử lý yêu cầu lúc này. Vui lòng thử lại.",
        isMock: false,
      };
    } catch (error: any) {
      console.error("[geminiService.chat] Error:", error);
      throw error;
    }
  },

  async chatComment(message: string, aiConfig: any, ragContext?: any) {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim() === "") {
      throw new Error("Không cấu hình OPENROUTER_API_KEY trên hệ thống.");
    }

    const companyCode = ragContext?.companyCode || aiConfig?.companyCode;
    let companyName = aiConfig?.companyName || "";

    if (!companyName && companyCode) {
      try {
        const company = await CompanyModel.findOne({ code: companyCode.toUpperCase() }).lean();
        if (company) {
          companyName = company.name;
        }
      } catch (err) {
        console.warn("[geminiService.chatComment] Error fetching company from DB:", err);
      }
    }
    if (!companyName) {
      companyName = "doanh nghiệp";
    }

    const systemInstruction = `
Bạn là trợ lý chăm sóc khách hàng của ${companyName}.
Nhiệm vụ của bạn là phản hồi bình luận công khai (comment) của khách hàng trên bài viết Facebook bằng hai nội dung:
1. Một câu trả lời bình luận công khai (publicComment).
2. Một tin nhắn inbox riêng tư gửi trực tiếp cho khách hàng (privateInbox).

QUY TẮC PHẢN HỒI BÌNH LUẬN CÔNG KHAI (publicComment):
- ĐỘ DÀI: Cực kỳ ngắn gọn và súc tích, tối đa khoảng 1 đến 2 câu ngắn.
- ĐỊNH DẠNG: Viết trên MỘT DÒNG DUY NHẤT (single line). KHÔNG được xuống dòng (không dùng ký tự xuống dòng/newline), không chia đoạn. Viết liền mạch toàn bộ nội dung từ đầu đến cuối trên một dòng. KHÔNG dùng gạch đầu dòng (bullet points), không dùng dấu * hoặc **.
- NỘI DUNG: Kêu gọi hành động lịch sự hướng khách check tin nhắn riêng tư/inbox (ví dụ: "Dạ chào anh/chị, bên em đã inbox thông tin chi tiết cho mình rồi ạ. Anh/Chị check inbox tin nhắn giúp em nhé ạ!").

QUY TẮC TIN NHẮN RIÊNG TƯ (privateInbox):
- NỘI DUNG: Trả lời chi tiết và đầy đủ câu hỏi của khách hàng dựa trên dữ liệu tri thức của công ty ở dưới.
- NGÔN PHONG: Lịch sự, chuyên nghiệp, tự nhiên. Sử dụng kính ngữ "Dạ" ở đầu câu và "ạ" ở cuối câu. Gọi khách là "Anh/Chị" hoặc "Quý khách" và xưng "bên em" hoặc "${companyName}".
- SỬ DỤNG TRI THỨC (RAG): Sử dụng tri thức ở dưới để trả lời chi tiết. Nếu khách hỏi thông tin không có trong tri thức, hãy trả lời khéo léo và hướng dẫn khách nhắn lại để nhân viên trực tiếp kiểm tra.

Dữ liệu tri thức đã truy xuất riêng cho doanh nghiệp ${ragContext?.companyCode || "hiện tại"}:
${ragContext?.contextText ? ragContext.contextText : "- Không tìm thấy tri thức phù hợp."}

Quy tắc cấu hình bổ sung từ doanh nghiệp:
${aiConfig.advancedInstructions ? `- ${aiConfig.advancedInstructions}` : "- Không có chỉ dẫn đặc biệt."}
`;

    const responseSchema = {
      type: "object",
      properties: {
        publicComment: {
          type: "string",
          description: "Câu trả lời bình luận công khai. Phải trên một dòng duy nhất, có CTA hướng dẫn khách kiểm tra inbox."
        },
        privateInbox: {
          type: "string",
          description: "Nội dung tin nhắn inbox gửi riêng tư cho khách hàng. Trả lời chi tiết dựa trên dữ liệu RAG."
        }
      },
      required: ["publicComment", "privateInbox"]
    };

    try {
      const selectedModel = aiConfig?.model || GEMINI_TEXT_MODEL;
      const response = await generateText(
        selectedModel,
        `Nội dung bình luận của khách hàng:\n"${message}"`,
        {
          systemInstruction,
          temperature: 0.35,
          responseSchema,
        }
      );

      let parsed: any;
      try {
        parsed = JSON.parse(response.text);
      } catch (e) {
        console.warn("[geminiService.chatComment] Failed to parse JSON response:", response.text);
        parsed = {
          publicComment: "Dạ chào anh/chị, bên em đã gửi thông tin chi tiết qua inbox cho mình rồi ạ. Anh/Chị check tin nhắn giúp em nhé!",
          privateInbox: response.text || "Dạ chào anh/chị. Cảm ơn anh/chị đã quan tâm đến sản phẩm của bên em. Anh/Chị cần bên em hỗ trợ tư vấn thông tin gì cụ thể ạ?"
        };
      }

      let publicComment = parsed.publicComment || "Dạ chào anh/chị, bên em đã inbox thông tin chi tiết cho mình rồi ạ. Anh/Chị check tin nhắn giúp em nhé!";
      let privateInbox = parsed.privateInbox || "Dạ chào anh/chị. Cảm ơn anh/chị đã quan tâm đến dịch vụ bên em.";

      // Clean up publicComment to guarantee single line
      publicComment = publicComment.replace(/[*#]/g, "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
      // Clean up privateInbox formatting
      privateInbox = privateInbox.replace(/[*#]/g, "").trim();

      return {
        publicComment,
        privateInbox,
        isMock: false,
      };
    } catch (error: any) {
      console.error("[geminiService.chatComment] Error:", error);
      throw error;
    }
  },

  /**
   * Tự động băm/chuyển đổi tài liệu dài thành danh sách FAQs rút gọn
   */
  async convertDocToFAQ(docText: string): Promise<string> {
    const getMockFAQ = () => {
      return `--- BẢN FAQ ĐÃ ĐƯỢC CHUẨN HÓA (CHẾ ĐỘ MÔ PHỎNG AI) ---
Q: Tài liệu này nói về chủ đề gì?
A: Tài liệu giới thiệu thông tin vận hành, chính sách bán hàng của doanh nghiệp.

Q: Làm thế nào để liên hệ hỗ trợ kỹ thuật?
A: Vui lòng liên hệ số hotline 1900xxxx hoặc email support@igen.com.

Q: Chính sách vận chuyển của chúng tôi là gì?
A: Giao hàng toàn quốc. Miễn phí vận chuyển cho đơn hàng trị giá từ 500k trở lên.`;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockFAQ();
    }

    try {
      const prompt = `Bạn là một chuyên gia huấn luyện AI bán hàng và chăm sóc khách hàng.
Hãy đọc kỹ tài liệu bán hàng/quy trình/chính sách sau đây của doanh nghiệp và chuyển đổi toàn bộ thông tin quan trọng thành một danh sách các câu hỏi thường gặp FAQs định dạng chuẩn để làm dữ liệu huấn luyện cho Chatbot.

YÊU CẦU:
1. Định dạng câu trả lời bắt buộc là:
Q: [Câu hỏi của khách hàng]
A: [Câu trả lời chuẩn mực của AI]

Q: [Câu hỏi tiếp theo]
A: [Câu trả lời tiếp theo]

2. Hãy chắt lọc toàn bộ số hotline, bảng giá dịch vụ/sản phẩm, chính sách giao hàng, chính sách đổi trả/bảo hành, giờ mở cửa.
3. Không tự tiện bịa đặt thông tin không có trong tài liệu.
4. Trả lời bằng tiếng Việt lịch sự, súc tích và chính xác.

NỘI DUNG TÀI LIỆU CẦN CHUYỂN ĐỔI:
${docText}
`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt
      );

      return response.text || "Không thể trích xuất được dữ liệu FAQ từ tài liệu.";
    } catch (error: any) {
      console.error("[geminiService.convertDocToFAQ] Error, fallback to mock FAQ:", error);
      return getMockFAQ();
    }
  },

  async getMarketingSuggestions(): Promise<string[]> {
    const fallbackSuggestions = [
      "Chiến dịch tri ân khách hàng thân thiết và tặng quà tri ân kỷ niệm thành lập",
      "Chương trình khuyến mãi mùa hè giảm giá cực sốc kích cầu mua sắm",
      "Sự kiện ra mắt dòng sản phẩm mới hướng tới phong cách sống xanh bảo vệ môi trường",
    ];

    if (!process.env.OPENROUTER_API_KEY) {
      return fallbackSuggestions;
    }

    try {
      const prompt = `Bạn là trợ lý AI Marketing chuyên nghiệp. Hãy đề xuất đúng 3 ý tưởng/chủ đề chiến dịch marketing chung, mang tính phổ quát cao để nhiều loại hình doanh nghiệp hoặc công ty khác nhau đều có thể áp dụng được (ví dụ: chiến dịch khuyến mãi theo mùa, sự kiện tri ân khách hàng, ra mắt dòng sản phẩm mới, chương trình ưu đãi đặc biệt).
Mỗi ý tưởng đề xuất phải là một câu ngắn gọn (dưới 25 từ) sẵn sàng làm mục tiêu marketing, ví dụ: 'Chiến dịch tri ân khách hàng thân thiết và tặng quà tri ân'.
Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách đúng 3 ý tưởng/chủ đề gợi ý ngắn gọn",
              },
            },
            required: ["suggestions"],
          },
        }
      );

      const responseText = response.text || "{}";
      const parsedData = safeParseJson(responseText);
      return parsedData.suggestions || fallbackSuggestions;
    } catch (error: any) {
      console.error("[geminiService.getMarketingSuggestions] Fallback to mock suggestions:", error);
      return fallbackSuggestions;
    }
  },

  /**
   * Đề xuất Content Pillars
   */
  async analyzeMarketingPillars(campaignTopic: string, images?: string[]): Promise<{ pillars: any[]; isMock: boolean }> {
    const getMockPillars = () => {
      let mockPillars = [
        {
          id: "giao_duc_gia_tri",
          title: "Giáo dục & Giá trị hữu ích",
          ratio: "35% tỉ trọng",
          description: `Giải đáp trực quan, hướng dẫn tối ưu và chia sẻ kiến thức nền tảng giúp khách hàng hiểu sâu về giá trị dòng sản phẩm liên quan "${campaignTopic || "Sản phẩm công nghệ"
            }".`,
        },
        {
          id: "cau_chuyen_social_proof",
          title: "Trải nghiệm & Câu chuyện thực tế",
          ratio: "40% tỉ trọng",
          description: `Kịch bản review thực tế, kết quả và phát biểu từ khách hàng uy tín, tạo dựng lòng tin tuyệt đối cho thương hiệu.`,
        },
        {
          id: "uu_dai_tuong_tac",
          title: "Ưu đãi & Kích cầu hành động",
          ratio: "25% tỉ trọng",
          description:
            "Chiến dịch giờ vàng, đặc quyền dùng thử hoặc voucher độc quyền nhằm thúc giục khách hàng ra quyết định mua sắm ngay lập tức.",
        },
      ];

      const topicLower = campaignTopic ? campaignTopic.toLowerCase() : "";
      if (topicLower.includes("bàn phím") || topicLower.includes("keyboard") || topicLower.includes("workspace")) {
        mockPillars = [
          {
            id: "kien_thuc_cong_thai_hoc",
            title: "Kiến thức & Trải nghiệm Công thái học",
            ratio: "35% tỉ trọng",
            description:
              "Hướng dẫn tư thế ngồi gõ phím chuẩn khoa học, cách test switch phím cơ, mẹo lập trình không mỏi tay cho coder chuyên nghiệp.",
          },
          {
            id: "review_coder_thuc_te",
            title: "Đánh giá & Trải nghiệm Lập trình viên",
            ratio: "40% tỉ trọng",
            description:
              "Cảm âm đầm chắc của iGen Workspace V2, quá trình tăng 150% hiệu suất viết mã của kiến trúc sư phần mềm.",
          },
          {
            id: "uu_dai_ra_mat",
            title: "Ưu đãi đặc quyền Early Bird",
            ratio: "25% tỉ trọng",
            description:
              "Quà tặng kệ kê tay gỗ sồi cao cấp và chiết khấu 10% ra mắt độc quyền dành cho 50 khách hàng đầu tiên.",
          },
        ];
      } else if (topicLower.includes("tai nghe") || topicLower.includes("nghe nhạc") || topicLower.includes("pro max")) {
        mockPillars = [
          {
            id: "am_thanh_bao_ve_tai",
            title: "Khoa học Âm thanh & Sức khỏe tai",
            ratio: "30% tỉ trọng",
            description:
              "Nguyên lý hoạt động của chống ồn chủ động ANC và cách bảo vệ thính lực khi đeo tai nghe cường độ cao thường xuyên.",
          },
          {
            id: "phong_cach_unboxing",
            title: "Đập hộp & Định hình Phong cách sống",
            ratio: "45% tỉ trọng",
            description:
              "Phối đồ thời trang dạo phố sành điệu cùng Pro Max, tạo phong thái năng động tự tin cho giới trẻ công nghệ.",
          },
          {
            id: "uu_dai_gio_vang",
            title: "Flash Sale giờ vàng - Săn cực đỉnh",
            ratio: "25% tỉ trọng",
            description:
              "Cơ hội săn deal giảm giá sốc đến 45% độc quyền trong khung giờ trưa từ 12h - 14h, số lượng cực hạn.",
          },
        ];
      } else if (topicLower.includes("vip") || topicLower.includes("voucher") || topicLower.includes("tri ân")) {
        mockPillars = [
          {
            id: "dac_quyen_thanh_vien",
            title: "Giá trị đặc quyền Tri ân",
            ratio: "35% tỉ trọng",
            description:
              "Chi tiết đặc quyền thăng hạng thẻ, chính sách bảo hành trọn đời và tích điểm đổi quà VIP của hệ sinh thái iGen.",
          },
          {
            id: "cau_chuyen_thanh_cong",
            title: "Khoảnh khắc & Khách hàng VIP",
            ratio: "40% tỉ trọng",
            description:
              "Ghi dấu những bức ảnh, cuộc hẹn và cảm ơn chân thành từ iGen ERP tới các đối tác doanh nghiệp lớn đồng hành lâu năm.",
          },
          {
            id: "uu_dai_han_muc",
            title: "Quà tặng và Voucher VIP độc bản",
            ratio: "25% tỉ trọng",
            description:
              "Gửi mã voucher VIP-10 độc bá kèm hộp quà tặng chạm khắc thủ công đặc biệt thiết kế riêng cho khách hàng VIP.",
          },
        ];
      }

      return mockPillars;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return { pillars: getMockPillars(), isMock: true };
    }

    try {
      const prompt = `Phân tích mục tiêu/chủ đề chiến dịch marketing sau: "${campaignTopic}"
Hãy đề xuất chính xác 3 trụ cột nội dung cốt lõi (Content Pillars) giúp doanh nghiệp định hình khung nội dung (framework) chuẩn chỉnh ngay từ đầu, đảm bảo tỷ lệ nội dung phân bổ đa dạng, tránh việc chỉ đăng bài bán hàng gây nhàm chán và mất tương tác.

Mỗi trụ cột phải có thông tin:
1. id: chuỗi ngắn gọn, không dấu cách, viết thường (ví dụ: "kien_thuc_huong_dan", "trai_nghiem_khach_hang", "khuyen_mai_dac_quyen")
2. title: Tiêu đề trụ cột nội dung tối ưu sáng tạo bằng tiếng Việt (Ví dụ: "Giáo dục & Hướng dẫn", "Câu chuyện khách hàng", "Ưu đãi & Khuyến mãi", "Giá trị cốt lõi")
3. ratio: Tỷ lệ phần trăm phân bổ hợp lý hiển thị dưới dạng chuỗi (Ví dụ: "35% tỉ trọng", "40% tỉ trọng") đảm bảo tổng 3 cái là 100%. Đa dạng tỷ trọng, tránh bán hàng quá nhiều.
4. description: Mô tả ngắn gọn trực quan bằng tiếng Việt hướng dẫn cách triển khai cụ thể trụ cột này đối với chiến dịch "${campaignTopic}".

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pillars: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "ID ngắn gọn viết liền không dấu" },
                    title: { type: Type.STRING, description: "Tiêu đề tiếng Việt của trụ cột" },
                    ratio: { type: Type.STRING, description: "Tỷ lệ phân bổ" },
                    description: { type: Type.STRING, description: "Mô tả triển khai chi tiết" },
                  },
                  required: ["id", "title", "ratio", "description"],
                },
                description: "Danh sách đúng 3 trụ cột nội dung",
              },
            },
            required: ["pillars"],
          },
          images
        }
      );

      const responseText = response.text || "{}";
      const parsedData = safeParseJson(responseText);
      return { pillars: parsedData.pillars || [], isMock: false };
    } catch (error: any) {
      console.error("[geminiService.analyzeMarketingPillars] Error, fallback to mock pillars:", error);
      return { pillars: getMockPillars(), isMock: true };
    }
  },

  /**
   * Thay thế 1 Content Pillar bằng 1 Trụ cột khác mới hoàn toàn
   */
  async swapMarketingPillar(
    campaignTopic: string,
    currentPillars: any[],
    pillarIdToReplace: string,
    images?: string[]
  ): Promise<{ pillar: any; isMock: boolean }> {
    const getMockSwapPillar = () => {
      const replacementOptions = [
        {
          id: "kien_thuc_chuyen_sau",
          title: "Pillar D: Kiến thức chuyên sâu & Khác biệt",
          ratio: "35% tỉ trọng",
          description: "Chia sẻ những phân tích độc quyền, thông số kỹ thuật ấn tượng và so sánh chi tiết để chứng minh tính ưu việt vượt trội của sản phẩm.",
        },
        {
          id: "phong_cach_loi_song",
          title: "Pillar E: Phong cách sống & Cảm hứng",
          ratio: "30% tỉ trọng",
          description: "Truyền tải thông điệp tích cực, xây dựng phong cách cá nhân hiện đại và kết nối sản phẩm với thói quen hàng ngày của khách hàng mục tiêu.",
        },
        {
          id: "tu_ong_tuong_tac",
          title: "Pillar F: Hỏi đáp & Tương tác Cộng đồng",
          ratio: "25% tỉ trọng",
          description: "Tổ chức các buổi mini-game, thảo luận mở hoặc giải đáp thắc mắc trực tiếp nhằm gắn kết người dùng và gia tăng tỷ lệ phản hồi tự nhiên.",
        },
        {
          id: "cam_nhan_chuyen_gia",
          title: "Pillar G: Góc nhìn Chuyên gia & Uy tín",
          ratio: "40% tỉ trọng",
          description: "Trích dẫn nhận xét từ các chuyên gia đầu ngành, người có sức ảnh hưởng (KOLs) để bảo chứng chất lượng và nâng cao vị thế thương hiệu.",
        }
      ];

      const existingIds = new Set(currentPillars.map(p => p.id));
      const available = replacementOptions.filter(opt => !existingIds.has(opt.id));
      const selected = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : replacementOptions[0];

      const targetPillar = currentPillars.find(p => p.id === pillarIdToReplace);
      if (targetPillar) {
        selected.ratio = targetPillar.ratio;
      }
      return selected;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return { pillar: getMockSwapPillar(), isMock: true };
    }

    try {
      const existingPillarsStr = currentPillars
        .map(p => `- ID: "${p.id}", Tiêu đề: "${p.title}", Mô tả: "${p.description}"`)
        .join("\n");

      const toReplace = currentPillars.find(p => p.id === pillarIdToReplace);
      const replaceStr = toReplace
        ? `ID: "${toReplace.id}", Tiêu đề: "${toReplace.title}" (Tỷ lệ phân bổ: ${toReplace.ratio})`
        : pillarIdToReplace;

      const prompt = `Phân tích mục tiêu/chủ đề chiến dịch marketing sau: "${campaignTopic}"
Hiện tại, chúng tôi đang sử dụng các trụ cột nội dung (Content Pillars) sau đây:
${existingPillarsStr}

Chúng tôi muốn THAY THẾ (đổi) trụ cột sau đây:
${replaceStr}

YÊU CẦU:
Hãy đề xuất 1 trụ cột nội dung (Content Pillar) mới và hoàn toàn KHÁC BIỆT so với các trụ cột hiện có ở trên để thay thế cho trụ cột muốn đổi. Trụ cột mới này phải bổ trợ tốt cho chiến dịch và mục tiêu "${campaignTopic}".
Trụ cột mới phải có thông tin cấu trúc sau:
1. id: chuỗi ngắn gọn, không dấu cách, viết thường (ví dụ: "kien_thuc_chuyen_sau", "goc_nhin_chuyen_gia") và KHÔNG ĐƯỢC TRÙNG với bất kỳ ID nào của các trụ cột hiện tại.
2. title: Tiêu đề trụ cột nội dung mới tối ưu bằng tiếng Việt (Ví dụ: "Pillar D: Kiến thức chuyên sâu", "Pillar E: Phong cách sống").
3. ratio: Tỷ lệ phân bổ hợp lý hiển thị dưới dạng chuỗi (Ví dụ: "35% tỉ trọng"). Hãy giữ nguyên tỉ lệ của trụ cột cũ là: "${toReplace?.ratio || "33% tỉ trọng"}".
4. description: Mô tả ngắn gọn trực quan bằng tiếng Việt hướng dẫn cách triển khai cụ thể trụ cột này đối với chiến dịch "${campaignTopic}".

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "ID ngắn gọn viết liền không dấu, không trùng ID hiện tại" },
              title: { type: Type.STRING, description: "Tiêu đề tiếng Việt của trụ cột" },
              ratio: { type: Type.STRING, description: "Tỷ lệ phân bổ (giữ nguyên tỷ lệ cũ)" },
              description: { type: Type.STRING, description: "Mô tả triển khai chi tiết" },
            },
            required: ["id", "title", "ratio", "description"],
          },
          images
        }
      );

      const responseText = response.text || "{}";
      const parsedPillar = safeParseJson(responseText);
      return { pillar: parsedPillar, isMock: false };
    } catch (error: any) {
      console.error("[geminiService.swapMarketingPillar] Error, fallback to mock swap pillar:", error);
      return { pillar: getMockSwapPillar(), isMock: true };
    }
  },

  /**
   * Phát sinh bản nháp ý tưởng chiến dịch
   */
  async generateMarketingIdeas(
    campaignTopic: string,
    selectedPillars: string[],
    channels?: string[],
    mediaType?: string,
    images?: string[]
  ): Promise<{ concepts: any[]; isMock: boolean }> {
    const pillarsStr =
      selectedPillars && selectedPillars.length > 0
        ? `(Định hướng Trụ cột nội dung: ${selectedPillars.join(", ")})`
        : "";

    const getMockConcepts = () => {
      const concepts = [
        {
          title: `Chiến dịch: Chạm Đột Phá - ${campaignTopic || "Mua Sắm Cuối Năm"}`,
          matchPercent: 95,
          summary: `Đột phá doanh số nhắm vào đối tượng trẻ tuổi. ${pillarsStr
            ? `Tập trung sâu vào định hướng truyền thông từ các trụ cột lựa chọn: ${selectedPillars.join(", ")}.`
            : "Tạo lối sống trải nghiệm công nghệ đeo và phong cách sống lành mạnh."
            }`,
          channels: channels && channels.length > 0 ? channels : ["TikTok", "Facebook", "Zalo"],
          suggestedContent:
            "🎬 Kịch bản Tiktok: Biến đổi phong cách thường ngày thành phong cách năng động thể thao chỉ sau 1 cái chạm màn hình X1.",
          hashtags: ["#iGenX1", "#SmartWearable", "#NangTamCuocSong"],
          mediaPrompt: `A dynamic lifestyle photoshoot featuring a young professional using ${campaignTopic || "smart wearable device"} in an urban setting, bright natural lighting, modern cityscape background, energetic mood, 8k high-resolution product photography.`,
        },
        {
          title: `Trải nghiệm Đỉnh Cao - Tri Ân Hội Viên`,
          matchPercent: 88,
          summary: `Quảng bá giá trị cốt lõi bền vững thông qua chuỗi bài viết phỏng vấn các đối tác trung thành thực tế đang nâng tầm công việc cùng Workspace V2. ${pillarsStr ? `Điều phối theo: ${selectedPillars.join(", ")}.` : ""
            }`,
          channels: channels && channels.length > 0 ? channels : ["Facebook", "Zalo"],
          suggestedContent:
            "✍️ Facebook Post: 'Gặp gỡ anh Hùng, Giám đốc Sáng tạo, người đã nâng cấp 200% tốc độ gõ nhờ Bàn phím cơ Workspace V2...'",
          hashtags: ["#WorkspaceV2", "#KeyboardMechanic", "#TangHieuSuat"],
          mediaPrompt: `A premium flatlay product photograph of a mechanical keyboard on a clean wooden desk, warm ambient lighting, coffee cup and notebook nearby, professional workspace aesthetic, detailed textures, 4k resolution.`,
        },
        {
          title: `Giờ Vàng Giá Sốc - Săn Độc Quyền AI`,
          matchPercent: 78,
          summary: `Tạo sự gấp rút bằng tính năng đếm ngược flash sale được quản lý tự động bởi thuật toán đề xuất của iGen ERP. ${pillarsStr ? `Kế thừa ý tưởng từ các Content Pillar được cấu hình: ${selectedPillars.join(", ")}.` : ""
            }`,
          channels: channels && channels.length > 0 ? channels : ["Facebook", "Zalo"],
          suggestedContent:
            "🔥 Tin nhắn Zalo: 'Duy nhất hôm nay! Giờ vàng từ 12h-14h, giảm giá 30% toàn bộ tai nghe Không dây Pro Max. Đặt ngay!'",
          hashtags: ["#FlashSale", "#TaiNgheProMax", "#AmThanhDinhCao"],
          mediaPrompt: `A vibrant flash sale promotional banner featuring wireless headphones with neon glow effects, countdown timer overlay, bold typography, dark background with electric blue and orange accents, high-energy commercial style.`,
        },
      ];
      return concepts;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    try {
      const sourceBrief = extractSourceBrief(campaignTopic);
      const pillarsContext =
        selectedPillars && selectedPillars.length > 0
          ? `\nCác Trụ cột nội dung (Content Pillars) bắt buộc phải tích hợp và bám sát: ${selectedPillars.join(
            ", "
          )}. Hãy sáng tạo các ý tưởng tập trung xoay quanh các trụ cột này.`
          : "";

      const channelsContext =
        channels && channels.length > 0
          ? `\nKênh truyền thông bắt buộc: Bắt buộc các ý tưởng của bạn phải phân phối và đăng bài chính xác trên các kênh: ${channels.join(", ")}.`
          : "";

      const mediaContext =
        mediaType === "image"
          ? "\nYêu cầu về phương tiện: Các ý tưởng phải thiết kế đi kèm hình ảnh làm chủ đạo."
          : mediaType === "video"
            ? "\nYêu cầu về phương tiện: Các ý tưởng phải thiết kế đi kèm video làm chủ đạo."
            : mediaType === "human-video"
              ? "\nYêu cầu về phương tiện: Các ý tưởng phải phù hợp cho video người thật/avatar nói trước camera, ưu tiên hook mạnh, lời thoại tự nhiên, cảnh quay đơn giản và có thể chuyển thành voice script trực tiếp."
              : mediaType === "none"
                ? "\nYêu cầu về phương tiện: Các bài đăng không đi kèm hình ảnh hoặc video (chỉ văn bản/caption)."
                : "";

      const prompt = `Bạn là một chuyên gia marketing xuất sắc.
Hãy tạo đúng 3 ý tưởng/bản nháp chiến dịch marketing chi tiết cho chủ đề/chiến dịch này: "${campaignTopic}".${pillarsContext}${channelsContext}${mediaContext}
Yêu cầu kết quả đầu ra:
1. Đề xuất tiêu đề chiến dịch sáng tạo.
2. Tỷ lệ phần trăm phù hợp (matchPercent) ước lượng (số nguyên từ 50-100).
3. Tóm tắt ý tưởng triển khai ngắn gọn.
4. Các kênh truyền thông phù hợp đề xuất đăng bài (mảng các chuỗi, ví dụ: ["Facebook", "TikTok"] - Bắt buộc phải trùng khớp với danh sách kênh đã được yêu cầu ở trên).
5. Ý tưởng nội dung gợi ý ban đầu để triển khai bài đăng trên kênh.
6. Hashtags liên quan phù hợp.
7. mediaPrompt: Một đoạn mô tả chi tiết bằng tiếng Anh (visual prompt) mô tả chính xác hình ảnh hoặc video phù hợp nhất cho ý tưởng này, dùng để gửi tới AI Image/Video Generator. Prompt phải bao gồm: chủ thể chính, bối cảnh, ánh sáng, phong cách nghệ thuật, mood/tone, và chi tiết kỹ thuật.
8. mediaPrompt phải dịch đúng nghĩa và bám sát nhất với input người dùng và nội dung phân tích từ file đính kèm. Không được thêm bớt chủ đề hay làm generic hóa bối cảnh.

NGUỒN SỰ THẬT BẮT BUỘC:
${sourceBrief.normalizedBrief || campaignTopic}

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

      const response = await generateText(
        GEMINI_HEAVY_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              concepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "Tiêu đề ý tưởng chiến dịch" },
                    matchPercent: { type: Type.INTEGER, description: "Tỷ lệ phù hợp" },
                    summary: { type: Type.STRING, description: "Tóm tắt ý tưởng" },
                    channels: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Các kênh đề xuất đăng bài",
                    },
                    suggestedContent: { type: Type.STRING, description: "Ý tưởng nội dung gợi ý ban đầu" },
                    hashtags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Hashtags liên quan",
                    },
                    mediaPrompt: {
                      type: Type.STRING,
                      description: "A detailed English visual prompt describing the ideal image or video for this concept, including subject, setting, lighting, art style, mood, and technical details.",
                    },
                  },
                  required: ["title", "matchPercent", "summary", "channels", "suggestedContent", "hashtags", "mediaPrompt"],
                },
                description: "Danh sách 3 ý tưởng/bản nháp chiến dịch marketing",
              },
            },
            required: ["concepts"],
          },
          images
        }
      );

      const responseText = response.text || "{}";
      const parsedData = safeParseJson(responseText);
      const groundedConcepts = (parsedData.concepts || []).map((concept: any) => {
        const groundedConcept = buildFaithfulVisualGuardrail({
          sourceBrief: campaignTopic,
          title: concept?.title,
          summary: concept?.summary,
          suggestedContent: concept?.suggestedContent,
          channels,
          selectedPillars,
        });

        return {
          ...concept,
          title: String(concept?.title || "").trim(),
          summary: String(concept?.summary || "").trim(),
          suggestedContent: String(concept?.suggestedContent || "").trim(),
          matchPercent: Math.max(50, Math.min(100, Number(concept?.matchPercent || 50))),
          channels: (Array.isArray(concept?.channels) ? concept.channels : (channels || ["Facebook"]))
            .map((channel: string) => this.normalizeMarketingChannel(channel))
            .filter((channel: string, index: number, arr: string[]) => arr.indexOf(channel) === index),
          hashtags: this.sanitizeHashtags(concept?.hashtags, concept?.title || campaignTopic),
          mediaPrompt: concept?.mediaPrompt
            ? `${groundedConcept} ${concept.mediaPrompt}`.trim()
            : groundedConcept,
        };
      }).filter((concept: any) => concept.title && concept.summary && concept.suggestedContent);

      if (groundedConcepts.length === 0) {
        throw new Error("AI khong tra ve concept hop le.");
      }
      return { concepts: groundedConcepts, isMock: false };
    } catch (error: any) {
      console.error("[geminiService.generateMarketingIdeas] Failed to generate grounded concepts:", error);
      throw new Error(error?.message || "Khong the phat sinh y tuong marketing tu AI.");
    }
  },

  async developMarketingIdea(
    title: string,
    summary: string,
    suggestedContent: string,
    channels: string[],
    mediaOptions?: {
      mediaType?: string;
      imageModel?: string;
      imageResolution?: string;
      imageAspectRatio?: string;
      videoModel?: string;
      videoQuality?: string;
      videoDuration?: number;
      videoAspectRatio?: string;
      mediaPrompt?: string;
      humanVoiceId?: string;
      humanVoiceModel?: string;
      humanDurationSeconds?: number;
    }
  ): Promise<{ posts: any[]; isMock: boolean }> {
    const validChannels = ["Facebook", "TikTok", "LinkedIn", "Instagram", "Zalo"];
    const sourceBriefText = String(mediaOptions?.mediaPrompt || suggestedContent || `${title}. ${summary}`).trim();

    // Normalize target channels: filter out invalid channels, map input to valid ones
    const normalizeChannel = (chan: string): string => {
      if (!chan) return "Facebook";
      const c = chan.toLowerCase().trim();
      if (c.includes("facebook") || c.includes("fb")) return "Facebook";
      if (c.includes("tiktok") || c.includes("tik tok") || c.includes("reels") || c.includes("video ngắn")) return "TikTok";
      if (c.includes("linkedin") || c.includes("linked in") || c.includes("link")) return "LinkedIn";
      if (c.includes("instagram") || c.includes("insta") || c.includes("ig")) return "Instagram";
      if (c.includes("zalo")) return "Zalo";
      return "Facebook";
    };

    let targetChannels = (Array.isArray(channels) ? channels : ["Facebook"])
      .map(ch => normalizeChannel(ch))
      .filter((v, i, a) => a.indexOf(v) === i); // Deduplicate

    if (targetChannels.length === 0) {
      targetChannels = ["Facebook"];
    }

    let posts: any[] = [];
    let isMock = false;

    const getMockPosts = () => {
      return targetChannels.map((chan) => {
        let contentType = "Bài viết truyền thông";
        let outline = "";
        let bodyText = "";
        let mockMediaPrompt = "";
        if (chan === "Facebook") {
          contentType = "Hình ảnh kèm Caption";
          outline = `📋 DÀN Ý CHI TIẾT (OUTLINE):
1. Hình ảnh: Ảnh flatlay thiết bị sang trọng trên bàn làm việc hiện đại.
2. Tiêu đề: Độc vị phong cách - Chọn ${title}.
3. Nội dung chính: Giải quyết vấn đề mỏi tay, tăng tốc gõ và tối ưu hóa không gian làm việc.
4. Call to Action: Đăng ký nhận ưu đãi 10% ra mắt.`;
          bodyText = `🔥 BẬT PHONG CÁCH - NHÂN HIỆU SUẤT CÙNG ${title}! 🔥

Bạn có biết 90% hiệu suất làm việc phụ thuộc vào sự thoải mái của thiết bị đồng hành? Với chiến dịch ${summary}, chúng tôi mang đến giải pháp tối ưu cho bạn:
💻 Thiết kế công thái học tinh tế.
⚡ Tăng tốc độ phản hồi phím gõ lên 150%.
🎁 Quà tặng kèm kê tay gỗ sồi đặc quyền.

💡 Ý tưởng cốt lõi: "${suggestedContent}"

📲 Nhắn tin ngay cho iGen để nhận deal hời! #iGenERP #WorkspaceV2 #CongNgheSo #Success`;
          mockMediaPrompt = `A professional product photoshoot of ${title} on a modern wooden desk, warm cozy lighting, detailed textures, 8k resolution.`;
        } else if (chan === "TikTok") {
          contentType = "Kịch bản Video ngắn 8s";
          outline = `🎬 KỊCH BẢN QUAY (TIMELINE VIDEO SCRIPTS - MAX 8S):
[0:00 - 0:03]
- Visual: Hook so sánh tư thế làm việc gù lưng/mỏi tay với tư thế chuẩn.
- Audio (Voiceover): "Bạn có đang làm việc sai tư thế?"

[0:03 - 0:08]
- Visual: Show cận cảnh thiết kế sang trọng & âm thanh gõ phím đầm chắc của ${title}.
- Audio (Voiceover): "Nâng cấp hiệu năng làm việc cực đỉnh cùng ${summary}"`;
          bodyText = `🔥 Cứu tinh deadline của bạn đây rồi! Nâng cấp hiệu năng làm việc cực đỉnh với ${title}. Đăng ký trải nghiệm ngay hôm nay để nhận voucher giảm giá 45% độc quyền! #iGenERP #WorkspaceV2 #WorkSmart #Deadline`;
          mockMediaPrompt = `An energetic, dynamic lifestyle video showing someone typing fast on ${title}, neon lighting, high-tech vibes, cinematic look.`;
        } else if (chan === "LinkedIn") {
          contentType = "Bài viết chuyên sâu (Article)";
          outline = `📋 DÀN Ý CHI TIẾT (OUTLINE):
1. Đặt vấn đề: Xu hướng chuyển đổi số và nâng cao năng suất doanh nghiệp.
2. Phân tích: Vai trò của thiết bị chuẩn công thái học đối với nhân sự IT/Lập trình.
3. Chiến dịch ${summary} đóng góp giá trị như thế nào.
4. CTA kết nối nhận tư vấn.`;
          bodyText = `[XU HƯỚNG VẬN HÀNH] TỐI ƯU HÓA TRẠI NGHIỆM NHÂN SỰ ĐỂ ĐỘT PHÁ HIỆU SUẤT

Kính gửi quý đối tác và cộng đồng doanh nghiệp,

Trong quản trị hiện đại, sự hài lòng và sức khỏe thể chất của nhân viên chính là đòn bẩy hiệu năng lớn nhất. Với chiến dịch "${title}" cùng định hướng: ${summary}.

Dựa trên gợi ý đề xuất: "${suggestedContent}", iGen ERP mang tới góc nhìn mới giúp doanh nghiệp:
✅ Giảm thiểu chấn thương cổ tay (RSI) ở bộ phận kỹ thuật.
✅ Gia tăng sự tập trung và gắn kết công việc.
✅ Xây dựng môi trường làm việc thông minh và hiện đại.

💼 Hãy thảo luận cùng chúng tôi để thiết kế giải pháp chuyển đổi số toàn diện cho doanh nghiệp của bạn.

#ChuyenDoiSo #iGenERP #LinkedInArticle #CongNgheTuongLai`;
          mockMediaPrompt = `A minimalist, clean corporate office setting showing a laptop and ${title}, professional corporate workspace, bright natural light.`;
        } else {
          contentType = "Bài viết truyền thông đa kênh";
          outline = `📋 DÀN Ý CHI TIẾT (OUTLINE):
1. Mở bài cuốn hút.
2. Phân tích cốt lõi.
3. CTA kêu gọi hành động.`;
          bodyText = `Giới thiệu chiến dịch: ${title}!

Định hướng ý tưởng: ${summary}.
Nội dung chi tiết gợi ý: ${suggestedContent}`;
          mockMediaPrompt = `A creative, appealing social media visual representing ${title}.`;
        }
        const voiceScript = `Xin chao, day la noi dung gioi thieu ngan gon cho chien dich ${title}. ${summary}. Hay lien he ngay de nhan tu van chi tiet va uu dai phu hop.`;
        const motionText = `Confident presenter, natural hand gestures, clear eye contact, upbeat delivery, topic-focused marketing explainer.`;
        return { channel: chan, contentType, outline, bodyText, mediaPrompt: mockMediaPrompt, voiceScript, motionText };
      });
    };

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    } else {
      try {
        const isHumanVideo = mediaOptions?.mediaType === "human-video";
        const humanDurationSeconds = Number(mediaOptions?.humanDurationSeconds || 15);
        const videoDurationSeconds = Number(mediaOptions?.videoDuration || 8);
        const minWords = Math.floor(humanDurationSeconds * 2.2);
        const maxWords = Math.ceil(humanDurationSeconds * 2.8);
        const humanVoiceRules = isHumanVideo
          ? `

YÊU CẦU RIÊNG CHO VIDEO NGƯỜI THẬT:
1. Mỗi bài viết bắt buộc phải có thêm trường "voiceScript" bằng tiếng Việt tự nhiên, mượt mà, chuẩn văn phong nói tiếng Việt và không bị cảm giác dịch máy.
2. "voiceScript" phải là đoạn lời thoại hoàn chỉnh để đưa trực tiếp sang bộ chuyển đổi Text-to-Speech (TTS). Tuyệt đối không chứa ký hiệu markdown, không chứa gạch đầu dòng (bullet points), không chứa bất kỳ nhãn dẫn hay lời ghi chú nào (ví dụ: không có "MC:", "Voiceover:", "Cảnh 1:", v.v.).
3. RÀNG BUỘC ĐỘ DÀI VÀ THỜI LƯỢNG NGHIÊM NGẶT: Thời lượng đọc mục tiêu là đúng ${humanDurationSeconds} giây. Để đảm bảo điều này, số lượng từ/âm tiết tiếng Việt trong "voiceScript" bắt buộc phải nằm trong giới hạn từ ${minWords} đến ${maxWords} từ. Tránh việc viết quá dài hoặc quá ngắn sẽ làm hỏng thời lượng video.
4. "bodyText" vẫn là phần caption/nội dung ngắn gọn đăng lên kênh mạng xã hội, còn "voiceScript" mới là kịch bản thoại được đọc thành tiếng. Hai trường này phải nhất quán nhưng tách biệt.
5. "outline" phải mô tả các cảnh quay, góc máy, nhịp cắt khớp hoàn hảo với diễn biến của "voiceScript".
6. "motionText" là mô tả chi tiết bằng TIẾNG VIỆT về cử chỉ, biểu cảm gương mặt, cử động cơ thể và hành động của avatar người thật trong video (ví dụ: "Người thuyết trình tự tin, gật đầu nhẹ nhàng, biểu cảm thân thiện, cử chỉ tay cởi mở"). Mô tả phải tự nhiên, bám sát nội dung và ngữ điệu lời thoại.
7. Tuyệt đối không viết "voiceScript" chung chung. Nội dung phải tập trung làm nổi bật tiêu đề, tóm tắt chiến dịch, insight khách hàng và thông điệp bán hàng cụ thể được cung cấp.
`
          : "";

        const prompt = `Bạn là một chuyên gia viết kịch bản và AI Copywriter xuất sắc.
Hãy lập Dàn ý (Outline) và viết Bản nháp nội dung (Draft Content) cho các kênh sau đây: ${targetChannels.join(", ")}

QUY TẮC PHÂN TÁCH DỮ LIỆU BẮT BUỘC CHO TỪNG KÊNH:
1. Đối với kênh TikTok:
   - Trường "outline" (Dàn ý): PHẢI chứa toàn bộ kịch bản quay chi tiết (Shooting Script / Storyboard), bao gồm phân đoạn visual (hình ảnh/hành động), audio (lời thoại/âm thanh/voiceover) và mốc thời gian (Timeline dạng [0:00 - 0:03], [0:03 - 0:08]...) cho từng cảnh. Tổng thời lượng kịch bản không được vượt quá ${videoDurationSeconds} giây.
   - Trường "bodyText" (Nội dung chính): PHẢI là Caption/Description giới thiệu video sạch, cuốn hút kèm hashtag để đăng tải trực tiếp lên TikTok (ví dụ: "🔥 Cứu tinh deadline của bạn đây... #iGenERP..."). TUYỆT ĐỐI không chứa bất kỳ mốc thời gian timeline, phân cảnh, Visual hay Audio nào ở trường này.
2. Đối với các kênh khác (Facebook, LinkedIn, Instagram...):
   - Trường "outline": Lập dàn ý chi tiết, cụ thể và tối ưu của bài viết.
   - Trường "bodyText": Lưu bản nháp nội dung bài viết sạch hoàn chỉnh để đăng tải trực tiếp (không chứa dàn ý hay tiêu đề nháp).
3. Đối với mọi kênh: Sinh thêm trường "mediaPrompt" là một đoạn mô tả chi tiết bằng tiếng Anh (visual prompt) mô phỏng chính xác nội dung trực quan (hình ảnh hoặc video) phù hợp cho bài viết này để gửi tới AI Generator.
4. mediaPrompt phải là bản dịch trung thành sang tiếng Anh từ dữ liệu gốc, không được đổi nghĩa, không được tự ý thêm chi tiết không có trong input hoặc tài liệu đính kèm, không được biến thành bối cảnh generic.
${humanVoiceRules}

Thông tin chiến dịch marketing:
- Tiêu đề ý tưởng: "${title}"
- Tóm tắt ý tưởng: "${summary}"
- Nội dung gợi ý ban đầu: "${suggestedContent}"

NGUỒN SỰ THẬT BẮT BUỘC:
${extractSourceBrief(sourceBriefText).normalizedBrief || sourceBriefText}

Trả về kết quả ở định dạng JSON phù hợp chính xác với cấu trúc yêu cầu.`;

        const response = await generateText(
          GEMINI_HEAVY_MODEL,
          prompt,
          {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                posts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      channel: { type: Type.STRING, description: "Kênh đăng bài (ví dụ: Facebook, TikTok, LinkedIn, Instagram, Zalo)" },
                      contentType: { type: Type.STRING, description: "Loại nội dung" },
                      outline: {
                        type: Type.STRING,
                        description: `Dàn ý chi tiết của bài viết. ĐẶC BIỆT với TikTok: Phải lưu KỊCH BẢN QUAY (timeline video script) chi tiết bao gồm Visual, Audio và mốc thời gian dạng [0:00 - 0:03], [0:03 - 0:08]... với tổng thời lượng tối đa không quá ${videoDurationSeconds} giây.`
                      },
                      bodyText: {
                        type: Type.STRING,
                        description: "Nội dung bài đăng/caption sạch để đăng tải trực tiếp. ĐẶC BIỆT với TikTok: Chỉ là Caption/Description giới thiệu video kèm hashtag và call-to-action (TUYỆT ĐỐI không chứa kịch bản quay, visual, audio hay timeline video ở trường này)."
                      },
                      mediaPrompt: {
                        type: Type.STRING,
                        description: "A detailed visual description prompt in English for generating a matching image or video (e.g. scenic views, product display, lifestyle scene, characters, setting details)."
                      },
                      voiceScript: {
                        type: Type.STRING,
                        description: "Natural Vietnamese narration script for human-video voice generation. Strictly limited to " + minWords + "-" + maxWords + " words/syllables. Keep empty string when not needed."
                      },
                      motionText: {
                        type: Type.STRING,
                        description: "Short motion and expression direction in Vietnamese for the avatar/presenter (e.g., 'Người thuyết trình tự tin, gật đầu thân thiện, cử chỉ tay mở rộng'). Keep empty string when not needed."
                      }
                    },
                    required: ["channel", "contentType", "outline", "bodyText", "mediaPrompt"],
                  },
                },
              },
              required: ["posts"],
            },
          }
        );

        const responseText = response.text || "{}";
        const parsedData = safeParseJson(responseText);
        posts = (parsedData.posts || []).map((post: any) => {
          const groundedPrompt = buildFaithfulVisualGuardrail({
            sourceBrief: sourceBriefText,
            title,
            summary,
            suggestedContent,
            outline: post?.outline,
            bodyText: post?.bodyText,
            channels: [this.normalizeMarketingChannel(post.channel)],
          });

          return {
            ...post,
            channel: this.normalizeMarketingChannel(post.channel),
            contentType: String(post?.contentType || "").trim(),
            outline: String(post?.outline || "").trim(),
            bodyText: String(post?.bodyText || "").trim(),
            voiceScript: typeof post?.voiceScript === "string" ? post.voiceScript.trim() : "",
            motionText: typeof post?.motionText === "string" ? post.motionText.trim() : "",
            mediaPrompt: post?.mediaPrompt
              ? `${groundedPrompt} ${post.mediaPrompt}`.trim()
              : groundedPrompt,
          };
        }).filter((post: any) => post.channel && post.contentType && post.bodyText);

        if (posts.length === 0) {
          throw new Error("AI khong tra ve post hop le.");
        }
      } catch (error: any) {
        console.error("[geminiService.developMarketingIdea] Failed to develop grounded posts:", error);
        throw new Error(error?.message || "Khong the phat trien noi dung marketing tu AI.");
      }
    }

    // Auto-generate media if mediaType is requested
    if (mediaOptions && mediaOptions.mediaType && mediaOptions.mediaType !== "none") {
      console.log(`[developMarketingIdea] Generating media of type: ${mediaOptions.mediaType}`);
      for (const post of posts) {
        if (mediaOptions.mediaType === "image") {
          try {
            const promptToUse = post.mediaPrompt || mediaOptions.mediaPrompt || `A professional photo matching the campaign topic: ${title}`;
            const imageResult = await geminiService.generateImage(promptToUse, {
              modelName: mediaOptions.imageModel,
              resolution: mediaOptions.imageResolution,
              aspectRatio: mediaOptions.imageAspectRatio,
            });

            if (imageResult.isMock) {
              post.imageUrl = imageResult.url;
            } else {
              try {
                const uploadedUrl = await cloudinaryService.uploadMedia(imageResult.url, "igen_erp");
                post.imageUrl = uploadedUrl;
              } catch (clErr) {
                console.error("[developMarketingIdea] Cloudinary upload image failed, fallback to raw url:", clErr);
                post.imageUrl = imageResult.url;
              }
            }
          } catch (err) {
            console.error(`[developMarketingIdea] Error generating image for post on ${post.channel}:`, err);
            // Fallback to mock image in case of PiAPI credit/service failures
            const seed = Math.floor(Math.random() * 1000000);
            post.imageUrl = `https://picsum.photos/seed/${seed}/800/600`;
            console.log(`[developMarketingIdea] Fallback to mock image: ${post.imageUrl}`);
          }
        } else if (mediaOptions.mediaType === "video") {
          try {
            const promptToUse = post.mediaPrompt || mediaOptions.mediaPrompt || `A cinematic video clip matching the campaign topic: ${title}`;
            const durationSec = mediaOptions.videoDuration ? Number(mediaOptions.videoDuration) : 6;
            const videoResult = await geminiService.generateVideo(promptToUse, durationSec, {
              modelName: mediaOptions.videoModel,
              resolution: mediaOptions.videoQuality,
              aspectRatio: mediaOptions.videoAspectRatio,
            });

            if (videoResult.isMock) {
              post.videoUrl = videoResult.url;
            } else {
              try {
                const uploadedUrl = await cloudinaryService.uploadMedia(videoResult.url, "igen_erp");
                post.videoUrl = uploadedUrl;
              } catch (clErr) {
                console.error("[developMarketingIdea] Cloudinary upload video failed, fallback to raw url:", clErr);
                post.videoUrl = videoResult.url;
              }
            }
          } catch (err) {
            console.error(`[developMarketingIdea] Error generating video for post on ${post.channel}:`, err);
            // Fallback to mock video in case of PiAPI credit/service failures
            post.videoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
            console.log(`[developMarketingIdea] Fallback to mock video: ${post.videoUrl}`);
          }
        }
      }
    }

    return { posts, isMock };
  },


  /**
   * Sinh ảnh AI bằng model Nano-Banana (PiAPI), Gemini Banana Pro (Google Imagen), hoặc Imagen 4
   */
  async generateImage(
    prompt: string,
    options?: { aspectRatio?: string; modelName?: string; resolution?: string; existingImageUris?: string[] }
  ): Promise<{ url: string; isMock: boolean }> {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY chưa được cấu hình trong file .env.");
    }

    return this._generateImageWithOpenRouter(prompt, options);
  },

  /**
   * Tạo ảnh qua OpenRouter chat/completions + modalities: ["image","text"]
   * Ảnh được trả về trong message.images[0].image_url.url (field non-standard của OpenRouter)
   */
  async _generateImageWithOpenRouter(
    prompt: string,
    options?: { aspectRatio?: string; resolution?: string; existingImageUris?: string[]; modelName?: string }
  ): Promise<{ url: string; isMock: boolean }> {
    const model = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
    console.log(`[OpenRouter Image] Generating | model=${model} | promptLen=${prompt.length}`);

    try {
      const result = await openrouterGenerateImage({
        prompt,
        model,
        aspectRatio: options?.aspectRatio,
        resolution: options?.resolution,
        referenceImages: options?.existingImageUris,
      });
      let imageUrl = result.url;

      if (imageUrl.startsWith("data:")) {
        console.log("[OpenRouter Image] Got base64, uploading to Cloudinary...");
        imageUrl = await cloudinaryService.uploadMedia(imageUrl, "igen_erp/generated_images");
      }

      console.log(`[OpenRouter Image] Done: ${imageUrl}`);
      return { url: imageUrl, isMock: false };
    } catch (error: any) {
      console.error("[OpenRouter Image] Error:", error);
      throw error;
    }
  },


  /**
   * Sinh video AI bằng model Veo3 hoặc Veo2
   */
  async generateVideo(
    prompt: string,
    durationSeconds: number = 6,
    options?: {
      aspectRatio?: string;
      modelName?: string;
      resolution?: string;
      referenceVideoUri?: string;
      referenceImageUris?: string[];
      frameMode?: "standard" | "first_last";
    }
  ): Promise<{ url: string; isMock: boolean }> {
    let actualPrompt = prompt;
    try {
      const parsed = safeParseJson(prompt);
      if (parsed.optimized_english_prompt) {
        actualPrompt = parsed.optimized_english_prompt;
        if (parsed.motion_analysis) actualPrompt += `. Motion: ${parsed.motion_analysis}`;
        if (parsed.camera_movement) actualPrompt += `. Camera: ${parsed.camera_movement}`;
      }
    } catch (e) {
      // not JSON, use as is
    }

    const modelToUse = normalizePiapiVideoModel(options?.modelName);

    if (!process.env.PIAPI_API_KEY) {
      throw new Error("Chưa cấu hình PIAPI_API_KEY. Không thể sinh video.");
    }

    const { taskId } = await piapiService.createVideoTask(actualPrompt, modelToUse, durationSeconds, {
      aspectRatio: options?.aspectRatio,
      referenceImageUris: options?.referenceImageUris,
    });
    return { url: `pending://piapi/${taskId}`, isMock: false, taskId } as any;
  },

  async getPiapiTaskStatus(taskId: string): Promise<{ status: string; url?: string; progress?: number; error?: string }> {
    return piapiService.getTaskStatus(taskId);
  },

  /**
   * Tạo giọng nói TTS (Gemini Voice Modality)
   */
  async generateVoice(userId: string, input: any) {
    const { textToSpeak, styleInstructions, mode, temperature, modelName, voiceName, speakerA, speakerB, title, description, stability, similarityBoost, useSpeakerBoost } = input;

    // ElevenLabs Voice Mapping Table
    const ELEVENLABS_VOICE_MAP: Record<string, string> = {
      // Male voices
      'Sadaltager': 'pNInz6obpgqjGQJe7v5C', // Adam
      'Charon': 'IKne3meq5aP759yEl2s8',    // Charlie
      'Orus': 'JBF2zhBk4EKq12v0tw9H',      // George
      'Puck': 'TxGEqn7nUaNZTRXjOFaQ',      // Josh
      'Fenrir': 'VR6A4UBqILHN73idDuEx',    // Arnold
      'Enceladus': 'N2lVS1w4EtoT3sAHBSz1', // Callum
      'Iapetus': 'ODq5FpeHgnsMrZsnXCw8',   // Patrick
      'Umbriel': 'SOYhlJg1783U4EcYUPgl',   // Harry
      'Algenib': 'TX329t22vkzCsaeeH8ui',   // Liam
      'Rasalgethi': 'CYw3moM5B48wqvQUxxTL',// Dave
      'Achernar': 'GBv7mTt0atIp3u8bJvhg',  // Thomas
      'Zephyr': 'D38z5qw23EIviwc77s33',    // Fin
      'Alnilam': '2EiwXtPIZgojA6xnRghf',   // Clyde
      'Gacrux': '2EiwXtPIZgojA6xnRghf',    // Clyde fallback
      'Achird': 'pNInz6obpgqjGQJe7v5C',    // Adam fallback
      'Zubenelgenubi': 'pNInz6obpgqjGQJe7v5C', // Adam fallback
      'Sulafat': 'pNInz6obpgqjGQJe7v5C',   // Adam fallback

      // Female voices
      'Aoede': 'EXAVITQu4vr4xnSDxMaL',     // Bella
      'Callirrhoe': 'AZnzlk1XvdvUeBnXmlld',// Domi
      'Kore': '21m00Tcm4TlvDq8ikWAM',      // Rachel
      'Leda': 'Lcfc5O6IFm67RCg5pQA1',      // Emily
      'Autonoe': 'MF3mGyEYCl7XYWbV9VbO',   // Ellie
      'Algieba': 'ThT50A1aJnqfgCzz94ks',   // Dorothy
      'Despina': 'zrHiDhphv9RcmhlC3AEg',   // Mimi
      'Erinome': 'EXAVITQu4vr4xnSDxMaL',   // Bella fallback
      'Laomedeia': 'EXAVITQu4vr4xnSDxMaL', // Bella fallback
      'Schedar': 'EXAVITQu4vr4xnSDxMaL',   // Bella fallback
      'Pulcherrima': 'EXAVITQu4vr4xnSDxMaL', // Bella fallback
      'Vindemiatrix': 'EXAVITQu4vr4xnSDxMaL', // Bella fallback
      'Sadachbia': 'EXAVITQu4vr4xnSDxMaL'  // Bella fallback
    };

    let audioDataUri = "";
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey || elevenLabsApiKey.trim() === "") {
      console.log("[geminiService.generateVoice] ELEVENLABS_API_KEY is not configured. Running in MOCK mode.");
      audioDataUri = "data:audio/wav;base64,UklGRigAAABXQVZFlm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAG";
    } else {
      try {
        const targetVoice = mode === 'multi' ? (speakerA || 'Aoede') : (voiceName || 'Aoede');
        const mappedVoiceId = ELEVENLABS_VOICE_MAP[targetVoice] || targetVoice || 'pNInz6obpgqjGQJe7v5C';

        console.log(`[geminiService.generateVoice] Generating voice using ElevenLabs with voice: ${mappedVoiceId}`);

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${mappedVoiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsApiKey.trim()
          },
          body: JSON.stringify({
            text: textToSpeak,
            model_id: modelName || "eleven_v3",
            voice_settings: {
              stability: typeof stability === 'number' ? stability : 0.5,
              similarity_boost: typeof similarityBoost === 'number' ? similarityBoost : 0.75,
              use_speaker_boost: typeof useSpeakerBoost === 'boolean' ? useSpeakerBoost : true
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`ElevenLabs API error: ${response.status} - ${errText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Audio = buffer.toString('base64');
        audioDataUri = `data:audio/mpeg;base64,${base64Audio}`;
      } catch (error: any) {
        console.error("[geminiService.generateVoice] ElevenLabs API error:", error);
        throw error;
      }
    }

    // Upload to Cloudinary
    const cloudinaryUrl = await cloudinaryService.uploadMedia(audioDataUri, "igen_erp/marketing/voice");

    // Save to MongoDB
    const record = await AIMediaModel.create({
      userId,
      mediaType: "voice",
      url: cloudinaryUrl,
      prompt: textToSpeak,
      metadata: {
        voiceName: mode === 'multi' ? `Multi (${speakerA} & ${speakerB})` : voiceName,
        duration: estimateAudioDuration(textToSpeak),
        resolution: modelName || "eleven_v3",
        title: title || undefined,
        description: description || undefined,
      }
    });

    return record;
  },

  /**
   * Tối ưu kịch bản giọng nói
   */
  async optimizeScript(text: string, readingStyle: string, model?: string) {
    if (!process.env.OPENROUTER_API_KEY) {
      return { optimizedText: `[Tối ưu hóa Giả lập] ${text}` };
    }
    try {
      const systemInstruction = `Bạn là một chuyên gia biên soạn kịch bản và phát thanh viên chuyên nghiệp của Đài Tiếng nói Việt Nam (VOV).
Hãy tối ưu hóa văn bản gốc của người dùng để biến nó thành một kịch bản thoại (voiceover script) chất lượng cao, lưu loát, chuẩn tiếng Việt và cực kỳ tự nhiên.

Áp dụng các quy tắc biên tập và phát thanh nghiêm ngặt sau:
1. SỰ TỰ NHIÊN VÀ TRÔI CHẢY: Chuyển đổi văn bản thành văn phong nói tự nhiên, chuẩn ngôn ngữ phát thanh. Loại bỏ các cụm từ rườm rà, lặp ý hoặc mang tính chất văn viết khô khan.
2. NGẮT NGHỈ HỢP LÝ BẰNG DẤU CÂU: Tự động chèn thêm dấu phẩy (,), dấu chấm (.) hoặc dấu ba chấm (...) tại các vị trí cần ngắt nghỉ, lấy hơi tự nhiên của phát thanh viên. Điều này rất quan trọng để giúp công cụ Text-to-Speech (TTS) đọc với nhịp điệu vừa phải, nhấn nhá chính xác, không bị đọc liền một mạch quá nhanh hay dính chữ.
3. PHÁT ÂM VÀ CHỮ SỐ (BẮT BUỘC):
   - Đọc và viết rõ hoàn toàn các từ viết tắt thành tiếng Việt chuẩn (Ví dụ: "KH" -> "khách hàng", "SP" -> "sản phẩm", "DN" -> "doanh nghiệp", "VS" -> "với").
   - Viết rõ các từ tiếng Anh thông dụng theo cách đọc tự nhiên của tiếng Việt hoặc phiên âm dễ đọc (Ví dụ: "ERP" -> "E-R-P", "AI" -> "A-I", "IT" -> "I-T", "Sales" -> "sale", "Marketing" -> "mác-két-tinh").
   - Viết chữ hoàn toàn cho tất cả các con số, phần trăm, ký hiệu, ngày tháng hoặc số tiền (Ví dụ: "10%" -> "mười phần trăm", "24/7" -> "hai mươi tư trên bảy", "2026" -> "năm hai nghìn không trăm hai mươi sáu", "15s" -> "mười lăm giây", "$100" -> "một trăm đô la").
4. PHONG CÁCH ĐỌC: Bám sát và thể hiện rõ nét phong cách đọc yêu cầu (ví dụ: hào hứng, sâu lắng, chậm rãi...).
5. KẾT QUẢ TRẢ VỀ: Chỉ trả về DUY NHẤT văn bản kịch bản thoại tiếng Việt đã được tối ưu hóa hoàn chỉnh. Không thêm lời bình luận, không có ký tự markdown (như **, ##, *), không chứa tiêu đề kịch bản, lời mở đầu hay bất kỳ lời giải thích nào.`;
      const selectedModel = model || GEMINI_TEXT_MODEL;
      const response = await generateText(
        selectedModel,
        `Phong cách: ${readingStyle || "hấp dẫn, lôi cuốn"}\nVăn bản gốc:\n${text}`,
        {
          systemInstruction,
          temperature: 0.7,
        }
      );
      return { optimizedText: response.text || text };
    } catch (error: any) {
      console.error("[geminiService.optimizeScript] Error, fallback to mock script:", error);
      return { optimizedText: `[Tối ưu hóa Giả lập] ${text}` };
    }
  },

  /**
   * Tối ưu prompt hình ảnh (cấu trúc JSON)
   */
  async optimizeImagePrompt(description: string, imageUris?: string[], modelName?: string) {
    const normalizedDescription = String(description || "").trim();

    const getMockImagePrompt = () => {
      return {
        subject: normalizedDescription || "image concept",
        clothing_material: "",
        action_pose: "",
        setting_lighting: "",
        camera_parameters: "",
        optimized_english_prompt: `A precise visual that faithfully represents this exact marketing or business concept: ${normalizedDescription || "the provided concept"}`,
        negative_prompt: "ugly, blurry, low quality",
      };
    };

    if (!normalizedDescription) {
      return getMockImagePrompt();
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockImagePrompt();
    }

    try {
      const optimizeMessages: any[] = [
        {
          role: "system",
          content: `You are an expert prompt engineer for image generators. Optimize the user's image description into a high-quality, descriptive English prompt.
Preserve the exact business topic, audience, use-case, and key message from the user's input.
Do not convert a concrete brief into a generic product shot, generic lifestyle image, abstract office scene, or unrelated beauty visual.
If the prompt is about software, ecommerce, omnichannel, logistics, operations, training, consulting, customer growth, or workflow, explicitly visualize that real context.
Translate faithfully from Vietnamese to English when needed. Semantic fidelity is more important than creative embellishment.
Do not introduce new objects, characters, industries, locations, demographics, props, outfits, or claims unless they are explicitly grounded in the source input or attached references.
When source files or images are provided, use them as constraints and preserve the same meaning as closely as possible.
Output MUST be a valid JSON object matching this schema:
{
  "subject": "string",
  "clothing_material": "string",
  "action_pose": "string",
  "setting_lighting": "string",
  "camera_parameters": "string",
  "optimized_english_prompt": "string of the final detailed prompt in English",
  "negative_prompt": "string of negative prompts"
}
Do not include markdown blocks or any text other than the JSON object.`
        }
      ];

      const systemMessage = optimizeMessages[0].content;
      const userText = `Translate and optimize this media brief into English while preserving the exact topic, context, audience, business meaning, and factual constraints from the original input: ${normalizedDescription}`;
      const result = await generateText(GEMINI_TEXT_MODEL, userText, {
        systemInstruction: systemMessage,
        responseMimeType: "application/json",
        images: imageUris?.filter((u: string) => u && typeof u === "string"),
      });
      return safeParseJson(result.text);
    } catch (error: any) {
      console.error("[geminiService.optimizeImagePrompt] Gemini Error, fallback to local optimizer:", error);
      return getMockImagePrompt();
    }
  },

  /**
   * Tối ưu prompt video (cấu trúc JSON)
   */
  async optimizeVideoPrompt(description: string, imageUris?: string[]) {
    const normalizedDescription = String(description || "").trim();

    const getMockVideoPrompt = () => {
      const text = normalizedDescription.toLowerCase().trim();
      const isEnglish = !/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệđìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i.test(normalizedDescription);
      if (isEnglish) {
        return {
          motion_analysis: "smooth cinematic motion of the subject",
          camera_movement: "slow pan, dynamic focus tracking",
          optimized_english_prompt: `A high quality cinematic video representing: ${normalizedDescription || "the provided concept"}`,
        };
      }

      // Default values
      let englishSubject = "a cinematic scene";
      let motion = "subtle and realistic movements of the subject";
      let camera = "slow cinematic pan, smooth tracking shot";
      let lighting = "cinematic lighting, soft volumetric rays";
      let style = "photorealistic, 8k resolution, highly detailed, masterpiece";

      // Translation mappings
      const dict: { [key: string]: string } = {
        "câu chuyện ngắn về tuna": "a short narrative story about a character named Tuna",
        "câu chuyện về tuna": "a narrative story featuring Tuna",
        "tập truyện về tuna": "a short story about Tuna",
        "tuna": "a character named Tuna",
        "núi tuyết": "majestic snow-capped mountains under a clear sky",
        "núi": "picturesque mountain ranges",
        "hoàng hôn": "sunset during golden hour with warm amber tones",
        "bình minh": "sunrise during blue hour, soft morning mist",
        "sản phẩm": "a premium commercial product showcase",
        "quảng cáo": "high-end promotional commercial video",
        "người mẫu": "an elegant fashion model",
        "sàn diễn": "a glamorous fashion show catwalk runway",
        "runway": "fashion catwalk runway with bright studio lights",
        "flycam": "aerial drone perspective sweeping across the landscape",
        "bay": "soaring aerial shot",
        "xoay": "360-degree rotating showcase",
        "cận cảnh": "extreme close-up macro details",
        "toàn cảnh": "wide-angle scenic overview",
        "xe": "a sleek modern luxury sports car",
        "ô tô": "a luxury car driving along a scenic route",
        "biển": "crystal clear ocean waves gently crashing on a sandy beach",
        "đại dương": "vast deep blue ocean landscape",
        "thành phố": "modern cityscape with towering skyscrapers",
        "công nghệ": "futuristic technology environment with holographic displays",
        "phim": "cinematic movie style footage",
        "điện ảnh": "cinematic film style",
        "chậm": "dramatic slow-motion video",
        "nhanh": "dynamic fast-paced cuts and motion",
      };

      // Sort keys by length descending to match longest phrases first
      const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
      let remainingText = text;
      const detectedKeywords: string[] = [];

      for (const key of keys) {
        if (remainingText.includes(key)) {
          detectedKeywords.push(dict[key]);
          remainingText = remainingText.replace(new RegExp(key, 'g'), '');
        }
      }

      if (detectedKeywords.length > 0) {
        englishSubject = detectedKeywords.join(", ");
      } else {
        const cleanText = normalizedDescription
          .replace(/tiến hành/gi, "")
          .replace(/tạo 1/gi, "")
          .replace(/tạo một/gi, "")
          .replace(/tạo/gi, "")
          .replace(/làm/gi, "")
          .trim();
        if (cleanText) {
          englishSubject = `a cinematic representation of: "${cleanText}"`;
        }
      }

      // Adjust motion and camera based on keyword detection
      if (text.includes("chậm") || text.includes("slow")) {
        motion = "dramatic slow-motion action with elegant fluid dynamics";
        camera = "ultra-smooth slow tracking camera";
      } else if (text.includes("nhanh") || text.includes("fast")) {
        motion = "high-energy fast-paced dynamic actions";
        camera = "rapid cuts, active handheld tracking, whip pans";
      }

      if (text.includes("flycam") || text.includes("bay") || text.includes("trên cao")) {
        camera = "high-altitude aerial drone sweep, panning down smoothly";
      } else if (text.includes("xoay") || text.includes("360")) {
        camera = "orbiting 360-degree rotation around the subject";
      } else if (text.includes("cận cảnh") || text.includes("cận")) {
        camera = "macro close-up focus with shallow depth of field";
      }

      if (text.includes("sản phẩm") || text.includes("product")) {
        lighting = "professional studio key lighting, soft box diffusion, edge highlight";
        style = "commercial grade, high-end product commercial, 8k, photorealistic";
      } else if (text.includes("người mẫu") || text.includes("fashion") || text.includes("runway")) {
        lighting = "bright runway stage lights, high-contrast spotlighting, camera flashes";
        style = "high-fashion editorial look, cinematic 4k, vibrant colors";
      }

      const optimized_english_prompt = `Cinematic, photorealistic video of ${englishSubject}. ${motion}. Camera movement: ${camera}. Lighting: ${lighting}. Visual style: ${style}. Rendered in crisp 4k, volumetric atmosphere, hyper-detailed textures.`;

      return {
        motion_analysis: motion,
        camera_movement: camera,
        optimized_english_prompt,
      };
    };

    if (!normalizedDescription) {
      return {
        motion_analysis: "smooth cinematic motion of the subject",
        camera_movement: "slow pan, dynamic focus tracking",
        optimized_english_prompt: "A high quality cinematic video with clear subject focus and natural movement.",
      };
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockVideoPrompt();
    }

    try {
      const messages: any[] = [
        {
          role: "system",
          content: `You are an expert prompt engineer for video generators. Optimize the description into a high-quality video prompt.
Preserve the exact meaning of the original input. Translate faithfully from Vietnamese to English when needed.
Do not add unrelated cinematic elements, fashion cues, generic lifestyle filler, or abstract visuals that are not grounded in the source brief.
If source images are provided, treat them as grounding constraints and keep the prompt semantically aligned with them.
Output MUST be a valid JSON object matching this schema:
{
  "motion_analysis": "Detailed description of the motion of subjects, speed changes, and physics of the scene",
  "camera_movement": "Detailed description of camera movements, panning, focal adjustments, depth of field, and camera paths",
  "optimized_english_prompt": "A complete, highly descriptive visual prompt in English, combining composition, lighting, cinematic style, and subject details"
}
Do not include markdown blocks or any text other than the JSON object.`
        }
      ];

      const videoSystemMessage = messages[0].content;
      const videoUserText = `Translate and optimize this video brief into English while preserving the exact topic, context, audience, and factual meaning from the original input: ${normalizedDescription}`;
      const videoResult = await generateText(GEMINI_TEXT_MODEL, videoUserText, {
        systemInstruction: videoSystemMessage,
        responseMimeType: "application/json",
        images: imageUris?.filter((u: string) => u && typeof u === "string"),
      });
      return safeParseJson(videoResult.text);
    } catch (error: any) {
      console.error("[geminiService.optimizeVideoPrompt] Gemini Error, fallback to local optimizer:", error);
      return getMockVideoPrompt();
    }
  },

  async optimizeEditPrompt(description: string): Promise<{ optimized_prompt: string }> {
    const normalizedDescription = String(description || "").trim();
    if (!normalizedDescription) {
      return { optimized_prompt: "" };
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return { optimized_prompt: normalizedDescription };
    }

    try {
      const systemInstruction = `Bạn là trợ lý chỉnh sửa video chuyên nghiệp, thành thạo tiếng Việt và tiếng Anh.
Nhiệm vụ của bạn: chuyển đổi prompt mô tả tự nhiên của người dùng thành các lệnh chỉnh sửa video CỤ THỂ, CHI TIẾT bằng tiếng Việt.

⚠️ QUAN TRỌNG: 
- Đầu ra phải là các LỆNH CHỈNH SỬA (cắt, zoom, filter, text, nhạc, tốc độ), KHÔNG phải mô tả chung chung.
- Nếu người dùng nói "viral TikTok", hãy cụ thể hóa: "cắt thành các đoạn 2-3 giây, tua nhanh 1.5x, zoom in/out xen kẽ, thêm text popup nổi bật, chèn nhạc EDM sôi động xuyên suốt"
- Nếu người dùng nói "chuyên nghiệp", hãy cụ thể hóa: "filter cinematic, chuyển cảnh fade mượt, text tiêu đề ở giữa 3 giây đầu, nhạc nền corporate, tăng tương phản 1.25"
- Bao gồm CHÍNH XÁC các thông số: thời gian (giây), tốc độ (playbackRate), vị trí text, màu sắc.
- Viết bằng TIẾNG VIỆT.

Ví dụ:
Input: "Biến video này thành clip viral TikTok"
Output: "Cắt video thành các đoạn ngắn 2-3 giây, tua nhanh gấp 1.5 lần toàn bộ, zoom in và zoom out xen kẽ mỗi 2 giây, thêm text highlight màu vàng #FFD700 ở bottom-center, chèn nhạc EDM sôi động xuyên suốt từ 0 giây đến hết video."

Input: "Làm video chuyên nghiệp hơn"
Output: "Thêm filter cinematic (tăng tương phản 1.25, tăng bão hòa 1.3, giảm sáng 0.95), chuyển cảnh fade mượt giữa các đoạn, thêm text tiêu đề 'Giới thiệu' ở center trong 3 giây đầu, chèn nhạc nền corporate xuyên suốt."

CHỈ trả về lệnh chỉnh sửa, không thêm giải thích, không markdown.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        `Chuyển prompt sau thành lệnh chỉnh sửa video cụ thể, chi tiết:
"${normalizedDescription}"`,
        {
          systemInstruction,
          temperature: 0.7,
        }
      );

      const optimizedPrompt = (response.text || normalizedDescription).trim();
      console.log(`[geminiService.optimizeEditPrompt] Original: "${normalizedDescription}" → Optimized: "${optimizedPrompt}"`);
      return { optimized_prompt: optimizedPrompt };
    } catch (error: any) {
      console.error("[geminiService.optimizeEditPrompt] Error, fallback to original:", error);
      return { optimized_prompt: normalizedDescription };
    }
  },

  async extractTextFromPdf(base64Pdf: string): Promise<string> {
    try {
      const response = await generateText(GEMINI_TEXT_MODEL, [
        {
          role: "user",
          parts: [
            { text: "Extract and write down all readable text and data from this PDF file. Keep the formatting as clear and structured as possible." },
            { inlineData: { mimeType: "application/pdf", data: base64Pdf } }
          ]
        }
      ]);
      return response.text || "";
    } catch (error) {
      console.error("[geminiService.extractTextFromPdf] Error extracting PDF text:", error);
      throw error;
    }
  },

  /**
   * Biên tập video bằng prompt — delegate tới video-edit module.
   */
  async editVideo(
    userId: string,
    videoUrl: string,
    prompt: string,
    options?: Parameters<typeof _editVideo>[3]
  ): Promise<{ status: string; record: any; blueprint: any }> {
    return _editVideo(userId, videoUrl, prompt, options);
  },

  async executeLocalRenderJob(recordId: string, videoUrl: string, blueprint: any, userId: string) {
    return _executeLocalRenderJob(recordId, videoUrl, blueprint, userId);
  },

  /**
   * Lấy lịch sử tạo đa phương tiện theo user và loại
   */
  async getMediaHistory(userId: string, mediaType: "image" | "video" | "voice") {
    try {
      const records = await AIMediaModel.find({ userId, mediaType })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      if (mediaType === "video") {
        await Promise.all(
          records.map(async (record: any) => {
            if (record.url && record.url.startsWith("pending://piapi/")) {
              const taskId = record.url.replace("pending://piapi/", "");
              try {
                const result = await piapiService.getTaskStatus(taskId);
                if (result.status === "completed" && result.url) {
                  const cloudinaryUrl = await cloudinaryService.uploadMedia(result.url, "igen_erp/marketing/video");
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { url: cloudinaryUrl, "metadata.status": "completed", "metadata.progress": 100 }
                  );
                  record.url = cloudinaryUrl;
                  record.metadata = { ...record.metadata, status: "completed", progress: 100 };

                  const activeCardId = record.metadata?.activeCardId;
                  if (activeCardId) {
                    const { MarketingContentModel } = require("../model/marketing-content.model");
                    await MarketingContentModel.findByIdAndUpdate(activeCardId, { videoUrl: cloudinaryUrl });
                  }
                } else if (result.status === "failed") {
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { "metadata.status": "failed", "metadata.error": result.error || "Failed", "metadata.progress": 0 }
                  );
                  record.metadata = { ...record.metadata, status: "failed", error: result.error, progress: 0 };
                } else {
                  const currentProgress = result.progress !== undefined ? result.progress : 0;
                  await AIMediaModel.updateOne(
                    { _id: record._id },
                    { "metadata.progress": currentProgress }
                  );
                  record.metadata = { ...record.metadata, progress: currentProgress };
                }
              } catch (err) {
                console.error(`[getMediaHistory] Error refreshing pending task ${taskId}:`, err);
              }
            }
          })
        );
      }
      return records;
    } catch (error: any) {
      console.error("[geminiService.getMediaHistory] Error:", error);
      throw error;
    }
  },

  /**
   * Xóa một bản ghi lịch sử
   */
  async deleteMediaHistory(userId: string, id: string) {
    try {
      const result = await AIMediaModel.deleteOne({ _id: id, userId });
      if (result.deletedCount === 0) {
        throw new Error("Không tìm thấy bản ghi hoặc không có quyền xóa");
      }
      return { status: "success" };
    } catch (error: any) {
      console.error("[geminiService.deleteMediaHistory] Error:", error);
      throw error;
    }
  },

  /**
   * Polling trạng thái video từ PiAPI chạy ngầm không chặn luồng HTTP
   */
  async pollPiAPIVideoStatusBackground(recordId: string, taskId: string, userId: string) {
    console.log(`[PiAPI Background Poll] Started polling for record ${recordId}, taskId ${taskId}`);

    let attempts = 0;
    const maxAttempts = 60; // 10 minutes (60 * 10 seconds)

    const runPoll = async () => {
      try {
        const result = await piapiService.getTaskStatus(taskId);
        console.log(`[PiAPI Background Poll] Record ${recordId} status: ${result.status}`);

        if (result.status === "completed" && result.url) {
          console.log(`[PiAPI Background Poll] Completed! Uploading to Cloudinary...`);
          const cloudinaryUrl = await cloudinaryService.uploadMedia(result.url, "igen_erp/marketing/video");

          const record = await AIMediaModel.findByIdAndUpdate(
            recordId,
            { url: cloudinaryUrl, "metadata.status": "completed", "metadata.progress": 100 },
            { new: true }
          );

          const activeCardId = record?.metadata?.activeCardId;
          if (activeCardId) {
            const { MarketingContentModel } = require("../model/marketing-content.model");
            await MarketingContentModel.findByIdAndUpdate(activeCardId, { videoUrl: cloudinaryUrl });
            console.log(`[PiAPI Background Poll] Updated target card ${activeCardId} with videoUrl: ${cloudinaryUrl}`);
          }
          return;
        } else if (result.status === "failed") {
          console.error(`[PiAPI Background Poll] Failed for task ${taskId}: ${result.error}`);
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "failed",
            "metadata.error": result.error || "Lỗi tạo video từ PiAPI",
            "metadata.progress": 0,
          });
          return;
        } else {
          let currentProgress = typeof result.progress === "number" && result.progress > 0 ? result.progress : 0;
          if (currentProgress === 0) {
            currentProgress = Math.min(5 + attempts * 7, 95);
          }
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.progress": currentProgress
          });
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(runPoll, 10000);
        } else {
          console.error(`[PiAPI Background Poll] Timeout for task ${taskId}`);
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "timeout",
            "metadata.error": "Quá thời gian chờ tạo video từ PiAPI (10 phút)",
          });
        }
      } catch (error: any) {
        console.error(`[PiAPI Background Poll] Error polling task ${taskId}:`, error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(runPoll, 10000);
        }
      }
    };

    setTimeout(runPoll, 10000);
  },

  /**
   * Đồng bộ lưu trữ nâng cao của Image/Video sau khi sinh thành công
   */
  async saveGeneratedMediaRecord(userId: string, mediaType: "image" | "video", base64OrUrl: string, prompt: string, metadata?: any) {
    try {
      let finalUrl = base64OrUrl;
      if (base64OrUrl.startsWith("data:")) {
        finalUrl = await cloudinaryService.uploadMedia(base64OrUrl, `igen_erp/marketing/${mediaType}`);
      }

      const record = await AIMediaModel.create({
        userId,
        mediaType,
        url: finalUrl,
        prompt,
        metadata,
      });
      return record;
    } catch (error: any) {
      console.error("[geminiService.saveGeneratedMediaRecord] Error:", error);
      throw error;
    }
  },

  /**
   * Lấy danh sách giọng nói ElevenLabs (delegate to elevenlabsService)
   */
  async getElevenLabsVoices(userId?: string) {
    return elevenlabsService.getVoices(userId);
  },

  /**
   * Thiết kế & phát nghe thử giọng nói ElevenLabs (delegate to elevenlabsService)
   */
  async generateCustomVoicePreview(userId: string, input: { gender: string; accent: string; age: string; accentStrength: number; text: string }) {
    return elevenlabsService.generateCustomVoicePreview(userId, input);
  },

  /**
   * Lưu giọng thiết kế thành giọng chính thức (delegate to elevenlabsService)
   */
  async createCustomVoice(userId: string, input: { voiceName: string; voiceDescription: string; generatedVoiceId: string }) {
    return elevenlabsService.createCustomVoice(userId, input);
  },

  async addElevenLabsVoice(userId: string, name: string, description: string, files: string[]) {
    return elevenlabsService.addVoice(userId, name, description, files);
  },

  async deleteElevenLabsVoice(userId: string, voiceId: string) {
    return elevenlabsService.deleteVoice(userId, voiceId);
  }
};

/**
 * Chuyển đổi PCM sang WAV 16-bit Mono (Pure JS/Node)
 */
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000, numChannels: number = 1, bitDepth: number = 16): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = numChannels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const fileSize = 36 + dataSize;

  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function estimateAudioDuration(text: string): number {
  return Math.max(1, Math.ceil(text.length / 13));
}
