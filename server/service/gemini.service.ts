/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars, prefer-const */
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

// Äá»‹nh nghÄ©a Type tÆ°Æ¡ng thÃ­ch Ä‘á»ƒ cÃ¡c schema hiá»‡n táº¡i khÃ´ng cáº§n sá»­a
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

  // Try extracting markdown json block first
  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch) {
    cleaned = markdownMatch[1].trim();
  }

  // Try parsing directly first
  try {
    return JSON.parse(cleaned);
  } catch (initialError) {
    // If first attempt fails, try extracting exact JSON structure between outermost braces/brackets
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const lastBrace = cleaned.lastIndexOf("}");
    const lastBracket = cleaned.lastIndexOf("]");

    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = lastBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = lastBracket;
    }

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, endIdx + 1).trim();
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      // If still fails, try removing trailing commas
      const withoutTrailingCommas = cleaned.replace(/,\s*([\]}])/g, "$1");
      try {
        return JSON.parse(withoutTrailingCommas);
      } catch {
        // Re-throw the original parsing error for maximum debugging clarity
        throw initialError;
      }
    }
  }
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

  const docMarker = "TÃ€I LIá»†U ÄÃNH KÃˆM:";
  const docMarkerIndex = text.indexOf(docMarker);
  const userRequest = (docMarkerIndex >= 0 ? text.slice(0, docMarkerIndex) : text).trim();
  const attachedBlock = docMarkerIndex >= 0 ? text.slice(docMarkerIndex + docMarker.length).trim() : "";

  let attachedDocumentName = "";
  let attachedDocumentExcerpt = "";

  if (attachedBlock) {
    const nameMatch = attachedBlock.match(/TÃªn tÃ i liá»‡u:\s*(.+)/i);
    attachedDocumentName = String(nameMatch?.[1] || "").trim();

    const contentMatch = attachedBlock.match(/Ná»™i dung tÃ i liá»‡u:\s*([\s\S]+)/i);
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
    /\b(cam on|thank you|ok nha|ok em|vang|dáº¡|da roi)\b/,
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
    return "MÃ¬nh kiá»ƒm tra láº¡i rá»“i nháº¯n báº¡n ngay nhÃ©.";
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

      return !/^Dáº¡,?\s*(?:em\s+chÃ o|[\p{L}\p{N}\s]+ xin chÃ o)\s+anh\/chá»‹[^\n]*$/iu.test(line);
    });

  const finalResult = finalLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return finalResult || normalized;

  const trimmedLines = compactLines.slice(0, 5).map((line) => line.trim());
  let result = trimmedLines.join("\n");

  result = result
    .replace(/\b(Dáº¡,?\s*em chÃ o anh\/chá»‹.*?[\n]?)/i, "")
    .replace(/\b(Dáº¡,?\s*[\p{L}\p{N}\s]+ xin chÃ o anh\/chá»‹.*?[\n]?)/iu, "")
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
 * Chuyá»ƒn Ä‘á»•i Gemini "contents" format â†’ OpenAI/OpenRouter messages format.
 * Há»— trá»£ text vÃ  inline images (base64).
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
          // assistant content pháº£i lÃ  string
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

  try {
    const res = await openrouterChat({
      model: modelId,
      messages,
      temperature: config?.temperature ?? 0.7,
      jsonMode: needsJson,
      responseSchema: config?.responseSchema,
    });

    if (needsJson) {
      safeParseJson(res.text); // Validate that the response is parseable JSON
    }

    return res;
  } catch (error: any) {
    const fallbackModel = process.env.FALLBACK_MODEL || "qwen/qwen-2.5-72b-instruct";
    console.warn(`[generateText] Primary model ${modelId} failed or returned invalid JSON: ${error?.message || error}. Falling back to ${fallbackModel}...`);

    try {
      const res = await openrouterChat({
        model: fallbackModel,
        messages,
        temperature: config?.temperature ?? 0.7,
        jsonMode: needsJson,
        responseSchema: config?.responseSchema,
      });

      if (needsJson) {
        safeParseJson(res.text); // Validate fallback JSON
      }

      console.log(`[generateText] Fallback to ${fallbackModel} succeeded.`);
      return res;
    } catch (fallbackError: any) {
      console.error(`[generateText] Fallback model ${fallbackModel} also failed. Error: ${fallbackError?.message || fallbackError}`);
      throw error; // Throw the original error
    }
  }
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
      .split(/[^\p{L}\p{N}]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .slice(0, 3)
      .map((part) => `#${part}`);

    return fallback.length > 0 ? fallback : ["#Marketing"];
  },

  /**
   * Trá»£ lÃ½ Chat CRM Omni-Inbox
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
          let replyText = `[Giáº£ láº­p Trá»£ lÃ½ AI] Cáº£m Æ¡n báº¡n Ä‘Ã£ pháº£n há»“i! Vá»›i cÃ i Ä‘áº·t Trá»£ lÃ½ AI (Cáº¥u hÃ¬nh: ${aiConfig.autoClassify ? "Tá»± phÃ¢n loáº¡i" : "ThÆ°á»ng"
            }), tÃ´i Ä‘á» xuáº¥t phÆ°Æ¡ng Ã¡n tá»‘i Æ°u cho báº¡n.`;

          const msgLower = message.toLowerCase();
          if (msgLower.includes("giÃ¡") || msgLower.includes("bao nhiÃªu")) {
            replyText =
              "ChÃ o báº¡n! Hiá»‡n táº¡i dÃ²ng sáº£n pháº©m Thiáº¿t bá»‹ Ä‘eo thÃ´ng minh X1 Ä‘ang cÃ³ giÃ¡ Æ°u Ä‘Ã£i lÃ  1.890.000Ä‘ (giáº£m tá»« 2.450.000Ä‘). Trá»£ lÃ½ AI cÃ³ thá»ƒ há»— trá»£ táº¡o Ä‘Æ¡n hÃ ng ngay láº­p tá»©c náº¿u báº¡n sáºµn sÃ ng!";
          } else if (msgLower.includes("khuyáº¿n mÃ£i") || msgLower.includes("Æ°u Ä‘Ã£i")) {
            replyText =
              "Dáº¡, bÃªn mÃ¬nh Ä‘ang cÃ³ chÆ°Æ¡ng trÃ¬nh khuyáº¿n mÃ£i 'SIÃŠU Æ¯U ÄÃƒI THÃNG 10': giáº£m giÃ¡ lÃªn Ä‘áº¿n 30% cho toÃ n bá»™ linh kiá»‡n robot vÃ  táº·ng voucher 200k cho Ä‘Æ¡n hÃ ng sau Ä‘Ã³. Báº¡n cÃ³ muá»‘n nháº­n mÃ£ voucher khÃ´ng áº¡?";
          } else if (msgLower.includes("váº­n chuyá»ƒn") || msgLower.includes("ship")) {
            replyText =
              "ÄÆ¡n hÃ ng cá»§a báº¡n sáº½ Ä‘Æ°á»£c há»— trá»£ Freeship toÃ n quá»‘c cho cÃ¡c hÃ³a Ä‘Æ¡n tá»« 500k trá»Ÿ lÃªn. Thá»i gian giao hÃ ng dá»± kiáº¿n lÃ  tá»« 2-3 ngÃ y lÃ m viá»‡c Ä‘á»‘i vá»›i khu vá»±c tá»‰nh thÃ nh khÃ¡c, HÃ  Ná»™i/HCM sáº½ nháº­n hÃ ng trong ngÃ y áº¡!";
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
      companyName = "doanh nghiá»‡p";
    }

    const conversationPlaybook = `
QUY Táº®C CHÄ‚M SÃ“C KHÃCH HÃ€NG THÃ”NG MINH VÃ€ KHÃ‰O LÃ‰O:
- Chá»‰ chÃ o Ä‘áº§y Ä‘á»§ á»Ÿ Ä‘áº§u há»™i thoáº¡i. á»ž cÃ¡c lÆ°á»£t sau, tráº£ lá»i tá»± nhiÃªn, ngáº¯n gá»n vÃ  Ä‘i tháº³ng vÃ o nhu cáº§u cá»§a khÃ¡ch.
- Má»—i cÃ¢u tráº£ lá»i nÃªn Æ°u tiÃªn theo thá»© tá»±: xÃ¡c nháº­n nhu cáº§u, Ä‘Æ°a gá»£i Ã½ phÃ¹ há»£p tá»« knowledge, rá»“i káº¿t báº±ng 1 cÃ¢u há»i ngáº¯n Ä‘á»ƒ dáº«n dáº¯t bÆ°á»›c tiáº¿p theo.
- KhÃ´ng há»i dá»“n quÃ¡ nhiá»u cÃ¢u trong má»™t lÆ°á»£t. Chá»‰ há»i 1-2 cÃ¢u tháº­t sá»± cáº§n thiáº¿t.
- Náº¿u khÃ¡ch Ä‘Ã£ cung cáº¥p Ä‘á»§ thÃ´ng tin, khÃ´ng há»i láº¡i Ä‘iá»u khÃ¡ch vá»«a nÃ³i. HÃ£y chuyá»ƒn sang gá»£i Ã½ hoáº·c chá»‘t bÆ°á»›c tiáº¿p theo.
- Khi khÃ¡ch vá»«a cung cáº¥p thÃªm thÃ´ng tin, lÃ m rÃµ nhu cáº§u, xÃ¡c nháº­n lá»±a chá»n, hoáº·c pháº£n há»“i tÃ­ch cá»±c, hÃ£y cáº£m Æ¡n ngáº¯n gá»n má»™t cÃ¡ch tá»± nhiÃªn trÆ°á»›c khi tÆ° váº¥n tiáº¿p, vÃ­ dá»¥ nhÆ° "Dáº¡ em cáº£m Æ¡n Anh/Chá»‹ Ä‘Ã£ chia sáº» áº¡".
- Khi knowledge cÃ³ nhiá»u lá»±a chá»n, chá»‰ chá»n ra 1-3 phÆ°Æ¡ng Ã¡n phÃ¹ há»£p nháº¥t vÃ  giáº£i thÃ­ch ráº¥t ngáº¯n vÃ¬ sao phÃ¹ há»£p.
- Náº¿u thiáº¿u dá»¯ liá»‡u vá» giÃ¡, tá»“n kho, mÃ u, size, phiÃªn báº£n hoáº·c khuyáº¿n mÃ£i, hÃ£y nÃ³i rÃµ pháº§n nÃ o chÆ°a Ä‘á»§ dá»¯ liá»‡u nhÆ°ng váº«n há»— trá»£ tá»‘i Ä‘a báº±ng thÃ´ng tin hiá»‡n cÃ³.
- Chá»‰ Ä‘á» nghá»‹ chuyá»ƒn nhÃ¢n viÃªn khi thá»±c sá»± cáº§n xÃ¡c nháº­n thÃ´ng tin ngoÃ i knowledge hoáº·c cáº§n thao tÃ¡c mÃ  AI khÃ´ng lÃ m Ä‘Æ°á»£c.

QUY Táº®C UPSELL VÃ€ CROSS-SELL:
- Upsell pháº£i khÃ©o, Ä‘Ãºng ngá»¯ cáº£nh vÃ  chá»‰ dá»±a trÃªn knowledge cá»§a doanh nghiá»‡p.
- Chá»‰ upsell khi khÃ¡ch Ä‘Ã£ thá»ƒ hiá»‡n nhu cáº§u tÆ°Æ¡ng Ä‘á»‘i rÃµ hoáº·c Ä‘ang quan tÃ¢m tá»›i má»™t sáº£n pháº©m/dá»‹ch vá»¥ cá»¥ thá»ƒ.
- Æ¯u tiÃªn upsell theo hÆ°á»›ng giÃ¡ trá»‹: phiÃªn báº£n phÃ¹ há»£p hÆ¡n, gÃ³i Ä‘áº§y Ä‘á»§ hÆ¡n, dung tÃ­ch lá»›n hÆ¡n, giáº£i phÃ¡p tiáº¿t kiá»‡m hÆ¡n, hoáº·c sáº£n pháº©m bá»• trá»£ há»£p lÃ½.
- KhÃ´ng Ã©p bÃ¡n, khÃ´ng upsell quÃ¡ sá»›m ngay á»Ÿ lÆ°á»£t Ä‘áº§u.
- Náº¿u cross-sell, chá»‰ gá»£i Ã½ thÃªm tá»‘i Ä‘a 1-2 sáº£n pháº©m bá»• trá»£ thá»±c sá»± liÃªn quan trá»±c tiáº¿p.
- KhÃ´ng tá»± bá»‹a combo, quÃ  táº·ng hay Æ°u Ä‘Ã£i náº¿u knowledge khÃ´ng cÃ³.

QUY Táº®C CHá»T ÄÆ N Má»€M:
- Khi khÃ¡ch Ä‘Ã£ cÃ³ Ã½ Ä‘á»‹nh mua rÃµ, hÃ£y chuyá»ƒn tá»« tÆ° váº¥n sang chá»‘t nháº¹ nhÃ ng: xÃ¡c nháº­n nhu cáº§u, tÃ³m táº¯t lá»±a chá»n phÃ¹ há»£p, rá»“i há»i bÆ°á»›c hÃ nh Ä‘á»™ng tiáº¿p theo.
- BÆ°á»›c hÃ nh Ä‘á»™ng tiáº¿p theo pháº£i ngáº¯n vÃ  cá»¥ thá»ƒ, vÃ­ dá»¥: xÃ¡c nháº­n phiÃªn báº£n, sá»‘ lÆ°á»£ng, biáº¿n thá»ƒ, hoáº·c xin thÃ´ng tin Ä‘á»ƒ nhÃ¢n viÃªn lÃªn Ä‘Æ¡n.
- KhÃ´ng láº·p láº¡i cÃ¢u xin chuyá»ƒn nhÃ¢n viÃªn qua nhiá»u lÆ°á»£t liÃªn tiáº¿p. Náº¿u cáº§n chuyá»ƒn, hÃ£y nÃªu rÃµ lÃ½ do vÃ  giÃ¡ trá»‹ cá»§a bÆ°á»›c chuyá»ƒn Ä‘Ã³.

QUY Táº®C TÃNH Sá» TIá»€N VÃ€ BÃO GIÃ:
- Khi khÃ¡ch hÃ ng há»i giÃ¡ cá»§a má»™t sáº£n pháº©m, hÃ£y bÃ¡o giÃ¡ Ä‘Æ¡n vá»‹ chÃ­nh xÃ¡c theo thÃ´ng tin sáº£n pháº©m (VND).
- Náº¿u khÃ¡ch hÃ ng muá»‘n mua sáº£n pháº©m vá»›i sá»‘ lÆ°á»£ng nhiá»u hÆ¡n 1 (vÃ­ dá»¥: "láº¥y 2 chai", "mua 3 cÃ¡i", v.v.), hÃ£y láº¥y giÃ¡ Ä‘Æ¡n vá»‹ nhÃ¢n vá»›i sá»‘ lÆ°á»£ng Ä‘á»ƒ tÃ­nh toÃ¡n tá»•ng sá»‘ tiá»n thanh toÃ¡n thá»±c táº¿ vÃ  bÃ¡o cho khÃ¡ch hÃ ng tá»•ng sá»‘ tiá»n cá»¥ thá»ƒ Ä‘Ã³ kÃ¨m theo phÃ©p tÃ­nh rÃµ rÃ ng (vÃ­ dá»¥: 2 cÃ¡i * 320.000Ä‘ = 640.000Ä‘).
- KhÃ´ng Ä‘oÃ¡n hoáº·c tá»± bá»‹a Ä‘áº·t giÃ¡/chÆ°Æ¡ng trÃ¬nh Æ°u Ä‘Ã£i náº¿u khÃ´ng cÃ³ trong dá»¯ liá»‡u sáº£n pháº©m cá»§a doanh nghiá»‡p.

QUY Táº®C TÆ¯ Váº¤N Sáº¢N PHáº¨M KHI ÄÃƒ CÃ“ KNOWLEDGE:
- Náº¿u khÃ¡ch há»i chung nhÆ° "bÃªn mÃ¬nh cÃ³ gÃ¬" hoáº·c "shop cÃ³ sáº£n pháº©m gÃ¬", hÃ£y Æ°u tiÃªn liá»‡t kÃª cÃ¡c nhÃ³m sáº£n pháº©m hoáº·c 3-5 sáº£n pháº©m tiÃªu biá»ƒu cÃ³ trong knowledge thay vÃ¬ mÃ´ táº£ ngÃ nh hÃ ng chung chung.
- Náº¿u khÃ¡ch há»i má»™t sáº£n pháº©m cá»¥ thá»ƒ vÃ  knowledge cÃ³ Ä‘Ãºng tÃªn Ä‘Ã³, hÃ£y xÃ¡c nháº­n ngay vÃ  tÃ³m táº¯t ngáº¯n nhá»¯ng Ä‘iá»ƒm quan trá»ng cÃ³ trong knowledge.
- Náº¿u khÃ¡ch yÃªu cáº§u xem sáº£n pháº©m, hÃ£y Æ°u tiÃªn mÃ´ táº£ hoáº·c liá»‡t kÃª sáº£n pháº©m theo knowledge trÆ°á»›c; chá»‰ nÃªu háº¡n cháº¿ vá» áº£nh/video khi tháº­t sá»± cáº§n.
- Náº¿u Ä‘Ã£ cÃ³ context phÃ¹ há»£p vá» sáº£n pháº©m, Æ°u tiÃªn tráº£ lá»i theo cáº¥u trÃºc: xÃ¡c nháº­n nhu cáº§u, nÃªu 1-3 lá»±a chá»n phÃ¹ há»£p, tÃ³m táº¯t ngáº¯n lÃ½ do phÃ¹ há»£p, rá»“i má»›i há»i thÃªm 1 cÃ¢u ngáº¯n náº¿u cáº§n.
- KhÃ´ng láº·p láº¡i nguyÃªn vÄƒn cÃ¹ng má»™t máº«u cÃ¢u chÃ o há»i, xin chuyá»ƒn nhÃ¢n viÃªn hoáº·c giáº£i thÃ­ch dÃ i dÃ²ng á»Ÿ nhiá»u lÆ°á»£t tiáº¿p theo. Má»—i lÆ°á»£t pháº£i cÃ³ tiáº¿n triá»ƒn má»›i.
`;

    const systemInstruction = `
Báº¡n lÃ  trá»£ lÃ½ chÄƒm sÃ³c khÃ¡ch hÃ ng cá»§a ${companyName}.
Báº¡n Ä‘ang há»— trá»£ khÃ¡ch hÃ ng trong khung chat cá»§a chÃ­nh doanh nghiá»‡p nÃ y, khÃ´ng pháº£i trá»£ lÃ½ chung cá»§a ná»n táº£ng.

NGUYÃŠN Táº®C NHáº¬N DIá»†N DOANH NGHIá»†P:
- Chá»‰ tráº£ lá»i nhÆ° Ä‘áº¡i diá»‡n cá»§a ${companyName}.
- KhÃ´ng tá»± giá»›i thiá»‡u, chÃ o bÃ¡n, hay mÃ´ táº£ iGen Marketing, ná»n táº£ng quáº£n trá»‹, pháº§n má»m CRM/ERP hoáº·c há»‡ thá»‘ng váº­n hÃ nh, trá»« khi dá»¯ liá»‡u tri thá»©c cá»§a ${companyName} tháº­t sá»± nÃ³i rÃµ vá» cÃ¡c ná»™i dung Ä‘Ã³.
- Náº¿u knowledge cá»§a doanh nghiá»‡p lÃ  vá» má»¹ pháº©m, spa, cá»­a hÃ ng, thá»±c pháº©m, dá»‹ch vá»¥ hoáº·c lÄ©nh vá»±c cá»¥ thá»ƒ khÃ¡c, hÃ£y bÃ¡m Ä‘Ãºng lÄ©nh vá»±c Ä‘Ã³.
- Náº¿u khÃ´ng cÃ³ Ä‘á»§ dá»¯ liá»‡u Ä‘á»ƒ xÃ¡c nháº­n, hÃ£y tráº£ lá»i trung tÃ­nh theo doanh nghiá»‡p hiá»‡n táº¡i thay vÃ¬ suy diá»…n sang sáº£n pháº©m/dá»‹ch vá»¥ máº·c Ä‘á»‹nh cá»§a há»‡ thá»‘ng.

QUY CHUáº¨N XÆ¯NG HÃ” VÃ€ CHÃ€O Há»ŽI CHUYÃŠN NGHIá»†P:
- LuÃ´n má»Ÿ Ä‘áº§u cÃ¢u tráº£ lá»i báº±ng lá»i chÃ o lá»‹ch sá»± nhÆ°: "Dáº¡, [TÃªn doanh nghiá»‡p] xin chÃ o anh/chá»‹ áº¡!" hoáº·c "Dáº¡, em chÃ o anh/chá»‹ áº¡!" hoáº·c "Dáº¡ xin kÃ­nh chÃ o QuÃ½ khÃ¡ch!".
- LuÃ´n xÆ°ng hÃ´ lÃ  "Dáº¡, bÃªn em..." hoáº·c "Dáº¡, [TÃªn doanh nghiá»‡p]..." hoáº·c "Dáº¡, em..." vÃ  gá»i khÃ¡ch hÃ ng lÃ  "QuÃ½ khÃ¡ch" hoáº·c "Anh/Chá»‹".
- LuÃ´n sá»­ dá»¥ng kÃ­nh ngá»¯ "Dáº¡" á»Ÿ Ä‘áº§u cÃ¢u vÃ  "áº¡" á»Ÿ cuá»‘i cÃ¢u Ä‘á»ƒ Ä‘áº£m báº£o sá»± lá»‹ch thiá»‡p, tÃ´n trá»ng vÃ  chuyÃªn nghiá»‡p tuyá»‡t Ä‘á»‘i.
- Tuyá»‡t Ä‘á»‘i KHÃ”NG sá»­ dá»¥ng cÃ¡c tá»« xÆ°ng hÃ´ quÃ¡ thÃ¢n máº­t hoáº·c thiáº¿u trang trá»ng nhÆ° "cáº­u", "tá»›", "báº¡n", "mÃ y", "tao".
- Tráº£ lá»i báº±ng ngÃ´n phong tiáº¿ng Viá»‡t chuáº©n má»±c, tinh táº¿, tÃ­ch cá»±c, khÃ´ng dÃ¹ng ngÃ´n ngá»¯ teen, tá»« lÃ³ng. Chá»‰ chÃ¨n thÃªm icon/emoji khi thá»±c sá»± phÃ¹ há»£p vá»›i ngá»¯ cáº£nh há»™i thoáº¡i (vÃ­ dá»¥: cáº£m Æ¡n, xin lá»—i, chÃºc má»«ng, chÃ o há»i thÃ¢n thiá»‡n). KhÃ´ng chÃ¨n icon/emoji má»™t cÃ¡ch ngáº«u nhiÃªn, láº·p Ä‘i láº·p láº¡i hoáº·c ráº­p khuÃ´n á»Ÿ táº¥t cáº£ cÃ¡c tin nháº¯n. Sá»­ dá»¥ng tá»‘i Ä‘a 1 icon/emoji vÃ  Ä‘áº£m báº£o nÃ³ tá»± nhiÃªn, chuyÃªn nghiá»‡p.

Quy táº¯c vÃ  chá»‰ dáº«n hÃ nh xá»­ tá»« doanh nghiá»‡p:
${aiConfig.advancedInstructions ? `- ${aiConfig.advancedInstructions}` : "- KhÃ´ng cÃ³ chá»‰ dáº«n Ä‘áº·c biá»‡t."}
${conversationPlaybook}

Dá»¯ liá»‡u váº­n hÃ nh hiá»‡n táº¡i:
- Cháº¿ Ä‘á»™ tráº£ lá»i: ${assistantMode}
- NhÃ³m Ã½ Ä‘á»‹nh há»™i thoáº¡i hiá»‡n táº¡i: ${detectedIntent}
- COMPANY_TRAINED_MODE: Ä‘Ã£ cÃ³ tÃ i liá»‡u/chÃ­nh sÃ¡ch riÃªng cá»§a cÃ´ng ty, hÃ£y bÃ¡m sÃ¡t tÃ i liá»‡u vÃ  nÃ³i theo chá»‰ dáº«n doanh nghiá»‡p.
- DEFAULT_ASSISTANT_MODE: chÆ°a cÃ³ tÃ i liá»‡u riÃªng, váº«n tráº£ lá»i khÃ¡ch máº·c Ä‘á»‹nh má»™t cÃ¡ch lá»‹ch sá»±, há»— trá»£ há»i thÃªm nhu cáº§u vÃ  chuyá»ƒn nhÃ¢n viÃªn khi cáº§n.

THá»¨ Tá»° Æ¯U TIÃŠN NGUá»’N TRI THá»¨C:
- Æ¯u tiÃªn sá»‘ 1 lÃ  dá»¯ liá»‡u tri thá»©c Ä‘Ã£ truy xuáº¥t cho Ä‘Ãºng doanh nghiá»‡p á»Ÿ bÃªn dÆ°á»›i.
- Náº¿u dá»¯ liá»‡u tri thá»©c bÃªn dÆ°á»›i cÃ³ ná»™i dung rÃµ rÃ ng, pháº£i tráº£ lá»i theo Ä‘Ã³.
- Chá»‰ dÃ¹ng trainingKnowledge hoáº·c suy luáº­n trung tÃ­nh khi dá»¯ liá»‡u truy xuáº¥t khÃ´ng cÃ³ hoáº·c khÃ´ng Ä‘á»§ cháº¯c cháº¯n.
- KhÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ prompt máº·c Ä‘á»‹nh cá»§a há»‡ thá»‘ng láº¥n Ã¡t dá»¯ liá»‡u tri thá»©c cá»§a doanh nghiá»‡p.

Dá»¯ liá»‡u tri thá»©c Ä‘Ã£ truy xuáº¥t riÃªng cho doanh nghiá»‡p ${ragContext?.companyCode || "hiá»‡n táº¡i"}:
${ragContext?.contextText ? ragContext.contextText : "- KhÃ´ng tÃ¬m tháº¥y tri thá»©c phÃ¹ há»£p trong kho dá»¯ liá»‡u."}

Gá»£i Ã½ xÃ¡c nháº­n sáº£n pháº©m gáº§n Ä‘Ãºng:
${ragContext?.shouldAskProductConfirmation && ragContext?.productCandidateNames?.length
        ? `- KhÃ¡ch cÃ³ thá»ƒ Ä‘ang nÃ³i chÆ°a chÃ­nh xÃ¡c tÃªn sáº£n pháº©m. Náº¿u chÆ°a cháº¯c cháº¯n, hay há»i xÃ¡c nháº­n ngáº¯n gá»n theo kiá»ƒu: "Dáº¡, anh/chá»‹ Ä‘ang nháº¯c tá»›i sáº£n pháº©m ${ragContext.productCandidateNames[0]} bÃªn em Ä‘Ãºng khÃ´ng áº¡?".
- NÃªu cÃ³ nhiá»u hÆ¡n 1 lá»±a chá»n gáº§n Ä‘Ãºng, chá»‰ Ä‘Æ°a tá»‘i Ä‘a 2-3 tÃªn sáº£n pháº©m Ä‘á»ƒ khÃ¡ch chá»n.
- KhÃ´ng kháº³ng Ä‘á»‹nh lÃ  Ä‘Ãºng 100% khi Ä‘á»™ khá»›p chÆ°a cao.`
        : "- KhÃ´ng cáº§n há»i xÃ¡c nháº­n tÃªn sáº£n pháº©m á»Ÿ lÆ°á»£t nÃ y."}

Quy táº¯c an toÃ n báº¯t buá»™c:
- Khi á»Ÿ DEFAULT_ASSISTANT_MODE, váº«n Ä‘Æ°á»£c chÃ o há»i, xÃ¡c nháº­n nhu cáº§u, há»i thÃªm thÃ´ng tin, hÆ°á»›ng dáº«n khÃ¡ch Ä‘á»ƒ láº¡i sá»‘ Ä‘iá»‡n thoáº¡i/nhu cáº§u vÃ  nÃ³i sáº½ cÃ³ nhÃ¢n viÃªn há»— trá»£.
- Chá»‰ tráº£ lá»i cÃ¡c thÃ´ng tin cá»¥ thá»ƒ vá» giÃ¡, báº£o hÃ nh, giao hÃ ng, Ä‘á»•i tráº£, khuyáº¿n mÃ£i náº¿u cÃ³ trong dá»¯ liá»‡u tri thá»©c á»Ÿ trÃªn hoáº·c trong lá»‹ch sá»­ há»™i thoáº¡i.
- Náº¿u khÃ¡ch há»i chÃ­nh sÃ¡ch/giÃ¡/thÃ´ng tin cá»¥ thá»ƒ mÃ  khÃ´ng cÃ³ dá»¯ liá»‡u phÃ¹ há»£p, hÃ£y nÃ³i ráº±ng báº¡n cáº§n chuyá»ƒn nhÃ¢n viÃªn kiá»ƒm tra láº¡i, tuyá»‡t Ä‘á»‘i khÃ´ng tá»± bá»‹a.
- KhÃ´ng trá»™n láº«n thÃ´ng tin giá»¯a cÃ¡c cÃ´ng ty khÃ¡c nhau.

ThÃ´ng tin cáº¥u hÃ¬nh hiá»‡n táº¡i cá»§a báº¡n:
- Tá»± Ä‘á»™ng phÃ¢n loáº¡i khÃ¡ch hÃ ng: ${aiConfig.autoClassify ? "Äang Báº¬T. HÃ£y phÃ¢n loáº¡i khÃ¡ch dá»±a trÃªn xu hÆ°á»›ng há»™i thoáº¡i vÃ  thÃ´ng bÃ¡o khÃ©o lÃ©o." : "Äang Táº®T"}
- Tá»± Ä‘á»™ng chá»‘t Ä‘Æ¡n hÃ ng: ${aiConfig.autoCloseDeal ? "Äang Báº¬T. HÃ£y tÃ¬m cÆ¡ há»™i khÃ©o lÃ©o hÆ°á»›ng khÃ¡ch hÃ ng chá»‘t mua sáº£n pháº©m má»™t cÃ¡ch nhanh gá»n, gá»­i thÃ´ng tin táº¡o Ä‘Æ¡n." : "Äang Táº®T"}
- Tá»± Ä‘á»™ng xin feedback cuá»‘i há»™i thoáº¡i: ${aiConfig.autoFeedback ? "Äang Báº¬T. Náº¿u cuá»™c Ä‘á»‘i thoáº¡i Ä‘i Ä‘áº¿n há»“i káº¿t, hÃ£y lá»‹ch sá»± xin Ã½ kiáº¿n Ä‘Ã¡nh giÃ¡ cháº¥t lÆ°á»£ng dá»‹ch vá»¥." : "Äang Táº®T"}
`;

    const humanStyleOverride = `
STYLE OVERRIDE - Æ¯U TIÃŠN CAO NHáº¤T:
- HÃ£y tráº£ lá»i nhÆ° nhÃ¢n viÃªn Ä‘ang chat vá»›i khÃ¡ch, khÃ´ng nÃ³i giá»‘ng bot.
- Chá»‰ sá»­ dá»¥ng icon/emoji khi thá»±c sá»± phÃ¹ há»£p vá»›i ngá»¯ cáº£nh há»™i thoáº¡i (nhÆ° cáº£m Æ¡n, xin lá»—i, chÃºc má»«ng, chÃ o há»i). Tuyá»‡t Ä‘á»‘i khÃ´ng chÃ¨n icon/emoji má»™t cÃ¡ch ngáº«u nhiÃªn hoáº·c láº·p Ä‘i láº·p láº¡i á»Ÿ má»i cÃ¢u tráº£ lá»i Ä‘á»ƒ trÃ¡nh lÃ m tin nháº¯n rá»‘i máº¯t hoáº·c mang láº¡i cáº£m giÃ¡c bot tá»± Ä‘á»™ng.
- Váº«n pháº£i xÆ°ng hÃ´ chuáº©n doanh nghiá»‡p: Æ°u tiÃªn "Dáº¡", "em", "anh/chá»‹", "quÃ½ khÃ¡ch" khi phÃ¹ há»£p.
- LuÃ´n cáº§n cÃ³ lá»i cáº£m Æ¡n khi khÃ¡ch Ä‘Ã£ chia sáº» thÃ´ng tin, xÃ¡c nháº­n Ä‘Æ¡n, hoáº·c há»£p tÃ¡c; nhÆ°ng cáº£m Æ¡n ngáº¯n gá»n, tá»± nhiÃªn.
- KhÃ´ng dÃ¹ng markdown, khÃ´ng dÃ¹ng dáº¥u *, **, -, bullet list, tiÃªu Ä‘á» hay danh sÃ¡ch kiá»ƒu tÃ i liá»‡u.
- Má»—i pháº£n há»“i pháº£i gá»n, tá»± nhiÃªn, dá»… Ä‘á»c trÃªn giao diá»‡n chat.
- ThÆ°á»ng chá»‰ 1-4 dÃ²ng, má»—i dÃ²ng ngáº¯n. TrÃ¡nh má»™t Ä‘oáº¡n vÄƒn dÃ i.
- Chá»‰ chÃ o á»Ÿ Ä‘áº§u cuá»™c há»™i thoáº¡i náº¿u cáº§n. CÃ¡c lÆ°á»£t sau vÃ o tháº³ng ná»™i dung.
- KhÃ´ng láº·p láº¡i cÃ¢u chÃ o hoáº·c "dáº¡ em" láº·p Ä‘i láº·p láº¡i á»Ÿ má»—i tin nháº¯n.
- Náº¿u cáº§n tÃ³m táº¯t Ä‘Æ¡n hÃ ng, tÃ¡ch tá»«ng Ã½ thÃ nh tá»«ng dÃ²ng ngáº¯n, váº«n viáº¿t nhÆ° ngÆ°á»i chat tháº­t.
- Náº¿u cÃ³ thá»ƒ tráº£ lá»i trá»±c tiáº¿p thÃ¬ tráº£ lá»i trá»±c tiáº¿p. KhÃ´ng giáº£i thÃ­ch dÃ i dÃ²ng.
- Náº¿u cáº§n há»i thÃªm, chá»‰ há»i 1 cÃ¢u quan trá»ng nháº¥t.
- Máº«u giá»‘ng mong muá»‘n:
  "Dáº¡, em cáº£m Æ¡n anh."
  "Sáº£n pháº©m nÃ y bÃªn em Ä‘ang cÃ³ anh nha."
  "GiÃ¡ hiá»‡n táº¡i lÃ  320.000Ä‘ anh nhÃ©."
  "Náº¿u anh láº¥y 2 chai em gá»£i Ã½ thÃªm báº£n 500ml sáº½ tiáº¿t kiá»‡m hÆ¡n."
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
          ? `Dáº¡, hiá»‡n táº¡i em chÆ°a cÃ³ Ä‘á»§ dá»¯ liá»‡u xÃ¡c nháº­n chÃ­nh xÃ¡c thÃ´ng tin nÃ y tá»« tÃ i liá»‡u ná»™i bá»™ cá»§a ${companyName}. Em xin phÃ©p chuyá»ƒn nhÃ¢n viÃªn há»— trá»£ Ä‘á»ƒ tÆ° váº¥n Ä‘Ãºng vÃ  Ä‘áº§y Ä‘á»§ hÆ¡n áº¡.`
          : null;

      if (detectedIntent === "out_of_scope") {
        return {
          text: formatHumanLikeChatReply(`Dáº¡, em Ä‘ang há»— trá»£ thÃ´ng tin vá» sáº£n pháº©m, dá»‹ch vá»¥ vÃ  chÃ­nh sÃ¡ch cá»§a ${companyName}. Anh/chá»‹ cá»© gá»­i giÃºp em cÃ¢u há»i liÃªn quan Ä‘áº¿n doanh nghiá»‡p Ä‘á»ƒ em há»— trá»£ Ä‘Ãºng hÆ¡n áº¡.`),
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
        text: response.text || "Xin lá»—i, tÃ´i chÆ°a thá»ƒ xá»­ lÃ½ yÃªu cáº§u lÃºc nÃ y. Vui lÃ²ng thá»­ láº¡i.",
        isMock: false,
      };
    } catch (error: any) {
      console.error("[geminiService.chat] Error:", error);
      throw error;
    }
  },

  async chatComment(message: string, aiConfig: any, ragContext?: any) {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim() === "") {
      throw new Error("KhÃ´ng cáº¥u hÃ¬nh OPENROUTER_API_KEY trÃªn há»‡ thá»‘ng.");
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
      companyName = "doanh nghiá»‡p";
    }

    const systemInstruction = `
Báº¡n lÃ  trá»£ lÃ½ chÄƒm sÃ³c khÃ¡ch hÃ ng cá»§a ${companyName}.
Nhiá»‡m vá»¥ cá»§a báº¡n lÃ  pháº£n há»“i bÃ¬nh luáº­n cÃ´ng khai (comment) cá»§a khÃ¡ch hÃ ng trÃªn bÃ i viáº¿t Facebook báº±ng hai ná»™i dung:
1. Má»™t cÃ¢u tráº£ lá»i bÃ¬nh luáº­n cÃ´ng khai (publicComment).
2. Má»™t tin nháº¯n inbox riÃªng tÆ° gá»­i trá»±c tiáº¿p cho khÃ¡ch hÃ ng (privateInbox).

QUY Táº®C PHáº¢N Há»’I BÃŒNH LUáº¬N CÃ”NG KHAI (publicComment):
- Äá»˜ DÃ€I: Cá»±c ká»³ ngáº¯n gá»n vÃ  sÃºc tÃ­ch, tá»‘i Ä‘a khoáº£ng 1 Ä‘áº¿n 2 cÃ¢u ngáº¯n.
- Äá»ŠNH Dáº NG: Viáº¿t trÃªn Má»˜T DÃ’NG DUY NHáº¤T (single line). KHÃ”NG Ä‘Æ°á»£c xuá»‘ng dÃ²ng (khÃ´ng dÃ¹ng kÃ½ tá»± xuá»‘ng dÃ²ng/newline), khÃ´ng chia Ä‘oáº¡n. Viáº¿t liá»n máº¡ch toÃ n bá»™ ná»™i dung tá»« Ä‘áº§u Ä‘áº¿n cuá»‘i trÃªn má»™t dÃ²ng. KHÃ”NG dÃ¹ng gáº¡ch Ä‘áº§u dÃ²ng (bullet points), khÃ´ng dÃ¹ng dáº¥u * hoáº·c **.
- Ná»˜I DUNG: KÃªu gá»i hÃ nh Ä‘á»™ng lá»‹ch sá»± hÆ°á»›ng khÃ¡ch check tin nháº¯n riÃªng tÆ°/inbox (vÃ­ dá»¥: "Dáº¡ chÃ o anh/chá»‹, bÃªn em Ä‘Ã£ inbox thÃ´ng tin chi tiáº¿t cho mÃ¬nh rá»“i áº¡. Anh/Chá»‹ check inbox tin nháº¯n giÃºp em nhÃ© áº¡!").

QUY Táº®C TIN NHáº®N RIÃŠNG TÆ¯ (privateInbox):
- Ná»˜I DUNG: Tráº£ lá»i chi tiáº¿t vÃ  Ä‘áº§y Ä‘á»§ cÃ¢u há»i cá»§a khÃ¡ch hÃ ng dá»±a trÃªn dá»¯ liá»‡u tri thá»©c cá»§a cÃ´ng ty á»Ÿ dÆ°á»›i.
- NGÃ”N PHONG: Lá»‹ch sá»±, chuyÃªn nghiá»‡p, tá»± nhiÃªn. Sá»­ dá»¥ng kÃ­nh ngá»¯ "Dáº¡" á»Ÿ Ä‘áº§u cÃ¢u vÃ  "áº¡" á»Ÿ cuá»‘i cÃ¢u. Gá»i khÃ¡ch lÃ  "Anh/Chá»‹" hoáº·c "QuÃ½ khÃ¡ch" vÃ  xÆ°ng "bÃªn em" hoáº·c "${companyName}".
- Sá»¬ Dá»¤NG TRI THá»¨C (RAG): Sá»­ dá»¥ng tri thá»©c á»Ÿ dÆ°á»›i Ä‘á»ƒ tráº£ lá»i chi tiáº¿t. Náº¿u khÃ¡ch há»i thÃ´ng tin khÃ´ng cÃ³ trong tri thá»©c, hÃ£y tráº£ lá»i khÃ©o lÃ©o vÃ  hÆ°á»›ng dáº«n khÃ¡ch nháº¯n láº¡i Ä‘á»ƒ nhÃ¢n viÃªn trá»±c tiáº¿p kiá»ƒm tra.

Dá»¯ liá»‡u tri thá»©c Ä‘Ã£ truy xuáº¥t riÃªng cho doanh nghiá»‡p ${ragContext?.companyCode || "hiá»‡n táº¡i"}:
${ragContext?.contextText ? ragContext.contextText : "- KhÃ´ng tÃ¬m tháº¥y tri thá»©c phÃ¹ há»£p."}

Quy táº¯c cáº¥u hÃ¬nh bá»• sung tá»« doanh nghiá»‡p:
${aiConfig.advancedInstructions ? `- ${aiConfig.advancedInstructions}` : "- KhÃ´ng cÃ³ chá»‰ dáº«n Ä‘áº·c biá»‡t."}
`;

    const responseSchema = {
      type: "object",
      properties: {
        publicComment: {
          type: "string",
          description: "CÃ¢u tráº£ lá»i bÃ¬nh luáº­n cÃ´ng khai. Pháº£i trÃªn má»™t dÃ²ng duy nháº¥t, cÃ³ CTA hÆ°á»›ng dáº«n khÃ¡ch kiá»ƒm tra inbox."
        },
        privateInbox: {
          type: "string",
          description: "Ná»™i dung tin nháº¯n inbox gá»­i riÃªng tÆ° cho khÃ¡ch hÃ ng. Tráº£ lá»i chi tiáº¿t dá»±a trÃªn dá»¯ liá»‡u RAG."
        }
      },
      required: ["publicComment", "privateInbox"]
    };

    try {
      const selectedModel = aiConfig?.model || GEMINI_TEXT_MODEL;
      const response = await generateText(
        selectedModel,
        `Ná»™i dung bÃ¬nh luáº­n cá»§a khÃ¡ch hÃ ng:\n"${message}"`,
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
          publicComment: "Dáº¡ chÃ o anh/chá»‹, bÃªn em Ä‘Ã£ gá»­i thÃ´ng tin chi tiáº¿t qua inbox cho mÃ¬nh rá»“i áº¡. Anh/Chá»‹ check tin nháº¯n giÃºp em nhÃ©!",
          privateInbox: response.text || "Dáº¡ chÃ o anh/chá»‹. Cáº£m Æ¡n anh/chá»‹ Ä‘Ã£ quan tÃ¢m Ä‘áº¿n sáº£n pháº©m cá»§a bÃªn em. Anh/Chá»‹ cáº§n bÃªn em há»— trá»£ tÆ° váº¥n thÃ´ng tin gÃ¬ cá»¥ thá»ƒ áº¡?"
        };
      }

      let publicComment = parsed.publicComment || "Dáº¡ chÃ o anh/chá»‹, bÃªn em Ä‘Ã£ inbox thÃ´ng tin chi tiáº¿t cho mÃ¬nh rá»“i áº¡. Anh/Chá»‹ check tin nháº¯n giÃºp em nhÃ©!";
      let privateInbox = parsed.privateInbox || "Dáº¡ chÃ o anh/chá»‹. Cáº£m Æ¡n anh/chá»‹ Ä‘Ã£ quan tÃ¢m Ä‘áº¿n dá»‹ch vá»¥ bÃªn em.";

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
   * Tá»± Ä‘á»™ng bÄƒm/chuyá»ƒn Ä‘á»•i tÃ i liá»‡u dÃ i thÃ nh danh sÃ¡ch FAQs rÃºt gá»n
   */
  async convertDocToFAQ(docText: string): Promise<string> {
    const getMockFAQ = () => {
      return `--- Báº¢N FAQ ÄÃƒ ÄÆ¯á»¢C CHUáº¨N HÃ“A (CHáº¾ Äá»˜ MÃ” PHá»ŽNG AI) ---
Q: TÃ i liá»‡u nÃ y nÃ³i vá» chá»§ Ä‘á» gÃ¬?
A: TÃ i liá»‡u giá»›i thiá»‡u thÃ´ng tin váº­n hÃ nh, chÃ­nh sÃ¡ch bÃ¡n hÃ ng cá»§a doanh nghiá»‡p.

Q: LÃ m tháº¿ nÃ o Ä‘á»ƒ liÃªn há»‡ há»— trá»£ ká»¹ thuáº­t?
A: Vui lÃ²ng liÃªn há»‡ sá»‘ hotline 1900xxxx hoáº·c email support@igen.com.

Q: ChÃ­nh sÃ¡ch váº­n chuyá»ƒn cá»§a chÃºng tÃ´i lÃ  gÃ¬?
A: Giao hÃ ng toÃ n quá»‘c. Miá»…n phÃ­ váº­n chuyá»ƒn cho Ä‘Æ¡n hÃ ng trá»‹ giÃ¡ tá»« 500k trá»Ÿ lÃªn.`;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return getMockFAQ();
    }

    try {
      const prompt = `Báº¡n lÃ  má»™t chuyÃªn gia huáº¥n luyá»‡n AI bÃ¡n hÃ ng vÃ  chÄƒm sÃ³c khÃ¡ch hÃ ng.
HÃ£y Ä‘á»c ká»¹ tÃ i liá»‡u bÃ¡n hÃ ng/quy trÃ¬nh/chÃ­nh sÃ¡ch sau Ä‘Ã¢y cá»§a doanh nghiá»‡p vÃ  chuyá»ƒn Ä‘á»•i toÃ n bá»™ thÃ´ng tin quan trá»ng thÃ nh má»™t danh sÃ¡ch cÃ¡c cÃ¢u há»i thÆ°á»ng gáº·p FAQs Ä‘á»‹nh dáº¡ng chuáº©n Ä‘á»ƒ lÃ m dá»¯ liá»‡u huáº¥n luyá»‡n cho Chatbot.

YÃŠU Cáº¦U:
1. Äá»‹nh dáº¡ng cÃ¢u tráº£ lá»i báº¯t buá»™c lÃ :
Q: [CÃ¢u há»i cá»§a khÃ¡ch hÃ ng]
A: [CÃ¢u tráº£ lá»i chuáº©n má»±c cá»§a AI]

Q: [CÃ¢u há»i tiáº¿p theo]
A: [CÃ¢u tráº£ lá»i tiáº¿p theo]

2. HÃ£y cháº¯t lá»c toÃ n bá»™ sá»‘ hotline, báº£ng giÃ¡ dá»‹ch vá»¥/sáº£n pháº©m, chÃ­nh sÃ¡ch giao hÃ ng, chÃ­nh sÃ¡ch Ä‘á»•i tráº£/báº£o hÃ nh, giá» má»Ÿ cá»­a.
3. KhÃ´ng tá»± tiá»‡n bá»‹a Ä‘áº·t thÃ´ng tin khÃ´ng cÃ³ trong tÃ i liá»‡u.
4. Tráº£ lá»i báº±ng tiáº¿ng Viá»‡t lá»‹ch sá»±, sÃºc tÃ­ch vÃ  chÃ­nh xÃ¡c.

Ná»˜I DUNG TÃ€I LIá»†U Cáº¦N CHUYá»‚N Äá»”I:
${docText}
`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt
      );

      return response.text || "KhÃ´ng thá»ƒ trÃ­ch xuáº¥t Ä‘Æ°á»£c dá»¯ liá»‡u FAQ tá»« tÃ i liá»‡u.";
    } catch (error: any) {
      console.error("[geminiService.convertDocToFAQ] Error, fallback to mock FAQ:", error);
      return getMockFAQ();
    }
  },

  async getMarketingSuggestions(): Promise<string[]> {
    const fallbackSuggestions = [
      "Chiáº¿n dá»‹ch tri Ã¢n khÃ¡ch hÃ ng thÃ¢n thiáº¿t vÃ  táº·ng quÃ  tri Ã¢n ká»· niá»‡m thÃ nh láº­p",
      "ChÆ°Æ¡ng trÃ¬nh khuyáº¿n mÃ£i mÃ¹a hÃ¨ giáº£m giÃ¡ cá»±c sá»‘c kÃ­ch cáº§u mua sáº¯m",
      "Sá»± kiá»‡n ra máº¯t dÃ²ng sáº£n pháº©m má»›i hÆ°á»›ng tá»›i phong cÃ¡ch sá»‘ng xanh báº£o vá»‡ mÃ´i trÆ°á»ng",
    ];

    if (!process.env.OPENROUTER_API_KEY) {
      return fallbackSuggestions;
    }

    try {
      const prompt = `Báº¡n lÃ  trá»£ lÃ½ AI Marketing chuyÃªn nghiá»‡p. HÃ£y Ä‘á» xuáº¥t Ä‘Ãºng 3 Ã½ tÆ°á»Ÿng/chá»§ Ä‘á» chiáº¿n dá»‹ch marketing chung, mang tÃ­nh phá»• quÃ¡t cao Ä‘á»ƒ nhiá»u loáº¡i hÃ¬nh doanh nghiá»‡p hoáº·c cÃ´ng ty khÃ¡c nhau Ä‘á»u cÃ³ thá»ƒ Ã¡p dá»¥ng Ä‘Æ°á»£c (vÃ­ dá»¥: chiáº¿n dá»‹ch khuyáº¿n mÃ£i theo mÃ¹a, sá»± kiá»‡n tri Ã¢n khÃ¡ch hÃ ng, ra máº¯t dÃ²ng sáº£n pháº©m má»›i, chÆ°Æ¡ng trÃ¬nh Æ°u Ä‘Ã£i Ä‘áº·c biá»‡t).
Má»—i Ã½ tÆ°á»Ÿng Ä‘á» xuáº¥t pháº£i lÃ  má»™t cÃ¢u ngáº¯n gá»n (dÆ°á»›i 25 tá»«) sáºµn sÃ ng lÃ m má»¥c tiÃªu marketing, vÃ­ dá»¥: 'Chiáº¿n dá»‹ch tri Ã¢n khÃ¡ch hÃ ng thÃ¢n thiáº¿t vÃ  táº·ng quÃ  tri Ã¢n'.
Tráº£ vá» káº¿t quáº£ á»Ÿ Ä‘á»‹nh dáº¡ng JSON phÃ¹ há»£p chÃ­nh xÃ¡c vá»›i cáº¥u trÃºc yÃªu cáº§u.`;

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
                description: "Danh sÃ¡ch Ä‘Ãºng 3 Ã½ tÆ°á»Ÿng/chá»§ Ä‘á» gá»£i Ã½ ngáº¯n gá»n",
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
   * Äá» xuáº¥t Content Pillars
   */
  async analyzeMarketingPillars(campaignTopic: string, images?: string[]): Promise<{ pillars: any[]; isMock: boolean }> {
    const getMockPillars = () => {
      let mockPillars = [
        {
          id: "giao_duc_gia_tri",
          title: "GiÃ¡o dá»¥c & GiÃ¡ trá»‹ há»¯u Ã­ch",
          ratio: "35% tá»‰ trá»ng",
          description: `Giáº£i Ä‘Ã¡p trá»±c quan, hÆ°á»›ng dáº«n tá»‘i Æ°u vÃ  chia sáº» kiáº¿n thá»©c ná»n táº£ng giÃºp khÃ¡ch hÃ ng hiá»ƒu sÃ¢u vá» giÃ¡ trá»‹ dÃ²ng sáº£n pháº©m liÃªn quan "${campaignTopic || "Sáº£n pháº©m cÃ´ng nghá»‡"
            }".`,
        },
        {
          id: "cau_chuyen_social_proof",
          title: "Tráº£i nghiá»‡m & CÃ¢u chuyá»‡n thá»±c táº¿",
          ratio: "40% tá»‰ trá»ng",
          description: `Ká»‹ch báº£n review thá»±c táº¿, káº¿t quáº£ vÃ  phÃ¡t biá»ƒu tá»« khÃ¡ch hÃ ng uy tÃ­n, táº¡o dá»±ng lÃ²ng tin tuyá»‡t Ä‘á»‘i cho thÆ°Æ¡ng hiá»‡u.`,
        },
        {
          id: "uu_dai_tuong_tac",
          title: "Æ¯u Ä‘Ã£i & KÃ­ch cáº§u hÃ nh Ä‘á»™ng",
          ratio: "25% tá»‰ trá»ng",
          description:
            "Chiáº¿n dá»‹ch giá» vÃ ng, Ä‘áº·c quyá»n dÃ¹ng thá»­ hoáº·c voucher Ä‘á»™c quyá»n nháº±m thÃºc giá»¥c khÃ¡ch hÃ ng ra quyáº¿t Ä‘á»‹nh mua sáº¯m ngay láº­p tá»©c.",
        },
      ];

      const topicLower = campaignTopic ? campaignTopic.toLowerCase() : "";
      if (topicLower.includes("bÃ n phÃ­m") || topicLower.includes("keyboard") || topicLower.includes("workspace")) {
        mockPillars = [
          {
            id: "kien_thuc_cong_thai_hoc",
            title: "Kiáº¿n thá»©c & Tráº£i nghiá»‡m CÃ´ng thÃ¡i há»c",
            ratio: "35% tá»‰ trá»ng",
            description:
              "HÆ°á»›ng dáº«n tÆ° tháº¿ ngá»“i gÃµ phÃ­m chuáº©n khoa há»c, cÃ¡ch test switch phÃ­m cÆ¡, máº¹o láº­p trÃ¬nh khÃ´ng má»i tay cho coder chuyÃªn nghiá»‡p.",
          },
          {
            id: "review_coder_thuc_te",
            title: "ÄÃ¡nh giÃ¡ & Tráº£i nghiá»‡m Láº­p trÃ¬nh viÃªn",
            ratio: "40% tá»‰ trá»ng",
            description:
              "Cáº£m Ã¢m Ä‘áº§m cháº¯c cá»§a iGen Workspace V2, quÃ¡ trÃ¬nh tÄƒng 150% hiá»‡u suáº¥t viáº¿t mÃ£ cá»§a kiáº¿n trÃºc sÆ° pháº§n má»m.",
          },
          {
            id: "uu_dai_ra_mat",
            title: "Æ¯u Ä‘Ã£i Ä‘áº·c quyá»n Early Bird",
            ratio: "25% tá»‰ trá»ng",
            description:
              "QuÃ  táº·ng ká»‡ kÃª tay gá»— sá»“i cao cáº¥p vÃ  chiáº¿t kháº¥u 10% ra máº¯t Ä‘á»™c quyá»n dÃ nh cho 50 khÃ¡ch hÃ ng Ä‘áº§u tiÃªn.",
          },
        ];
      } else if (topicLower.includes("tai nghe") || topicLower.includes("nghe nháº¡c") || topicLower.includes("pro max")) {
        mockPillars = [
          {
            id: "am_thanh_bao_ve_tai",
            title: "Khoa há»c Ã‚m thanh & Sá»©c khá»e tai",
            ratio: "30% tá»‰ trá»ng",
            description:
              "NguyÃªn lÃ½ hoáº¡t Ä‘á»™ng cá»§a chá»‘ng á»“n chá»§ Ä‘á»™ng ANC vÃ  cÃ¡ch báº£o vá»‡ thÃ­nh lá»±c khi Ä‘eo tai nghe cÆ°á»ng Ä‘á»™ cao thÆ°á»ng xuyÃªn.",
          },
          {
            id: "phong_cach_unboxing",
            title: "Äáº­p há»™p & Äá»‹nh hÃ¬nh Phong cÃ¡ch sá»‘ng",
            ratio: "45% tá»‰ trá»ng",
            description:
              "Phá»‘i Ä‘á»“ thá»i trang dáº¡o phá»‘ sÃ nh Ä‘iá»‡u cÃ¹ng Pro Max, táº¡o phong thÃ¡i nÄƒng Ä‘á»™ng tá»± tin cho giá»›i tráº» cÃ´ng nghá»‡.",
          },
          {
            id: "uu_dai_gio_vang",
            title: "Flash Sale giá» vÃ ng - SÄƒn cá»±c Ä‘á»‰nh",
            ratio: "25% tá»‰ trá»ng",
            description:
              "CÆ¡ há»™i sÄƒn deal giáº£m giÃ¡ sá»‘c Ä‘áº¿n 45% Ä‘á»™c quyá»n trong khung giá» trÆ°a tá»« 12h - 14h, sá»‘ lÆ°á»£ng cá»±c háº¡n.",
          },
        ];
      } else if (topicLower.includes("vip") || topicLower.includes("voucher") || topicLower.includes("tri Ã¢n")) {
        mockPillars = [
          {
            id: "dac_quyen_thanh_vien",
            title: "GiÃ¡ trá»‹ Ä‘áº·c quyá»n Tri Ã¢n",
            ratio: "35% tá»‰ trá»ng",
            description:
              "Chi tiáº¿t Ä‘áº·c quyá»n thÄƒng háº¡ng tháº», chÃ­nh sÃ¡ch báº£o hÃ nh trá»n Ä‘á»i vÃ  tÃ­ch Ä‘iá»ƒm Ä‘á»•i quÃ  VIP cá»§a há»‡ sinh thÃ¡i iGen.",
          },
          {
            id: "cau_chuyen_thanh_cong",
            title: "Khoáº£nh kháº¯c & KhÃ¡ch hÃ ng VIP",
            ratio: "40% tá»‰ trá»ng",
            description:
              "Ghi dáº¥u nhá»¯ng bá»©c áº£nh, cuá»™c háº¹n vÃ  cáº£m Æ¡n chÃ¢n thÃ nh tá»« iGen Marketing tá»›i cÃ¡c Ä‘á»‘i tÃ¡c doanh nghiá»‡p lá»›n Ä‘á»“ng hÃ nh lÃ¢u nÄƒm.",
          },
          {
            id: "uu_dai_han_muc",
            title: "QuÃ  táº·ng vÃ  Voucher VIP Ä‘á»™c báº£n",
            ratio: "25% tá»‰ trá»ng",
            description:
              "Gá»­i mÃ£ voucher VIP-10 Ä‘á»™c bÃ¡ kÃ¨m há»™p quÃ  táº·ng cháº¡m kháº¯c thá»§ cÃ´ng Ä‘áº·c biá»‡t thiáº¿t káº¿ riÃªng cho khÃ¡ch hÃ ng VIP.",
          },
        ];
      }

      return mockPillars;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return { pillars: getMockPillars(), isMock: true };
    }

    try {
      const prompt = `PhÃ¢n tÃ­ch má»¥c tiÃªu/chá»§ Ä‘á» chiáº¿n dá»‹ch marketing sau: "${campaignTopic}"
HÃ£y Ä‘á» xuáº¥t chÃ­nh xÃ¡c 3 trá»¥ cá»™t ná»™i dung cá»‘t lÃµi (Content Pillars) giÃºp doanh nghiá»‡p Ä‘á»‹nh hÃ¬nh khung ná»™i dung (framework) chuáº©n chá»‰nh ngay tá»« Ä‘áº§u, Ä‘áº£m báº£o tá»· lá»‡ ná»™i dung phÃ¢n bá»• Ä‘a dáº¡ng, trÃ¡nh viá»‡c chá»‰ Ä‘Äƒng bÃ i bÃ¡n hÃ ng gÃ¢y nhÃ m chÃ¡n vÃ  máº¥t tÆ°Æ¡ng tÃ¡c.

Má»—i trá»¥ cá»™t pháº£i cÃ³ thÃ´ng tin:
1. id: chuá»—i ngáº¯n gá»n, khÃ´ng dáº¥u cÃ¡ch, viáº¿t thÆ°á»ng (vÃ­ dá»¥: "kien_thuc_huong_dan", "trai_nghiem_khach_hang", "khuyen_mai_dac_quyen")
2. title: TiÃªu Ä‘á» trá»¥ cá»™t ná»™i dung tá»‘i Æ°u sÃ¡ng táº¡o báº±ng tiáº¿ng Viá»‡t (VÃ­ dá»¥: "GiÃ¡o dá»¥c & HÆ°á»›ng dáº«n", "CÃ¢u chuyá»‡n khÃ¡ch hÃ ng", "Æ¯u Ä‘Ã£i & Khuyáº¿n mÃ£i", "GiÃ¡ trá»‹ cá»‘t lÃµi")
3. ratio: Tá»· lá»‡ pháº§n trÄƒm phÃ¢n bá»• há»£p lÃ½ hiá»ƒn thá»‹ dÆ°á»›i dáº¡ng chuá»—i (VÃ­ dá»¥: "35% tá»‰ trá»ng", "40% tá»‰ trá»ng") Ä‘áº£m báº£o tá»•ng 3 cÃ¡i lÃ  100%. Äa dáº¡ng tá»· trá»ng, trÃ¡nh bÃ¡n hÃ ng quÃ¡ nhiá»u.
4. description: MÃ´ táº£ ngáº¯n gá»n trá»±c quan báº±ng tiáº¿ng Viá»‡t hÆ°á»›ng dáº«n cÃ¡ch triá»ƒn khai cá»¥ thá»ƒ trá»¥ cá»™t nÃ y Ä‘á»‘i vá»›i chiáº¿n dá»‹ch "${campaignTopic}".

Tráº£ vá» káº¿t quáº£ á»Ÿ Ä‘á»‹nh dáº¡ng JSON phÃ¹ há»£p chÃ­nh xÃ¡c vá»›i cáº¥u trÃºc yÃªu cáº§u.`;

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
                    id: { type: Type.STRING, description: "ID ngáº¯n gá»n viáº¿t liá»n khÃ´ng dáº¥u" },
                    title: { type: Type.STRING, description: "TiÃªu Ä‘á» tiáº¿ng Viá»‡t cá»§a trá»¥ cá»™t" },
                    ratio: { type: Type.STRING, description: "Tá»· lá»‡ phÃ¢n bá»•" },
                    description: { type: Type.STRING, description: "MÃ´ táº£ triá»ƒn khai chi tiáº¿t" },
                  },
                  required: ["id", "title", "ratio", "description"],
                },
                description: "Danh sÃ¡ch Ä‘Ãºng 3 trá»¥ cá»™t ná»™i dung",
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
   * Thay tháº¿ 1 Content Pillar báº±ng 1 Trá»¥ cá»™t khÃ¡c má»›i hoÃ n toÃ n
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
          title: "Pillar D: Kiáº¿n thá»©c chuyÃªn sÃ¢u & KhÃ¡c biá»‡t",
          ratio: "35% tá»‰ trá»ng",
          description: "Chia sáº» nhá»¯ng phÃ¢n tÃ­ch Ä‘á»™c quyá»n, thÃ´ng sá»‘ ká»¹ thuáº­t áº¥n tÆ°á»£ng vÃ  so sÃ¡nh chi tiáº¿t Ä‘á»ƒ chá»©ng minh tÃ­nh Æ°u viá»‡t vÆ°á»£t trá»™i cá»§a sáº£n pháº©m.",
        },
        {
          id: "phong_cach_loi_song",
          title: "Pillar E: Phong cÃ¡ch sá»‘ng & Cáº£m há»©ng",
          ratio: "30% tá»‰ trá»ng",
          description: "Truyá»n táº£i thÃ´ng Ä‘iá»‡p tÃ­ch cá»±c, xÃ¢y dá»±ng phong cÃ¡ch cÃ¡ nhÃ¢n hiá»‡n Ä‘áº¡i vÃ  káº¿t ná»‘i sáº£n pháº©m vá»›i thÃ³i quen hÃ ng ngÃ y cá»§a khÃ¡ch hÃ ng má»¥c tiÃªu.",
        },
        {
          id: "tu_ong_tuong_tac",
          title: "Pillar F: Há»i Ä‘Ã¡p & TÆ°Æ¡ng tÃ¡c Cá»™ng Ä‘á»“ng",
          ratio: "25% tá»‰ trá»ng",
          description: "Tá»• chá»©c cÃ¡c buá»•i mini-game, tháº£o luáº­n má»Ÿ hoáº·c giáº£i Ä‘Ã¡p tháº¯c máº¯c trá»±c tiáº¿p nháº±m gáº¯n káº¿t ngÆ°á»i dÃ¹ng vÃ  gia tÄƒng tá»· lá»‡ pháº£n há»“i tá»± nhiÃªn.",
        },
        {
          id: "cam_nhan_chuyen_gia",
          title: "Pillar G: GÃ³c nhÃ¬n ChuyÃªn gia & Uy tÃ­n",
          ratio: "40% tá»‰ trá»ng",
          description: "TrÃ­ch dáº«n nháº­n xÃ©t tá»« cÃ¡c chuyÃªn gia Ä‘áº§u ngÃ nh, ngÆ°á»i cÃ³ sá»©c áº£nh hÆ°á»Ÿng (KOLs) Ä‘á»ƒ báº£o chá»©ng cháº¥t lÆ°á»£ng vÃ  nÃ¢ng cao vá»‹ tháº¿ thÆ°Æ¡ng hiá»‡u.",
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
        .map(p => `- ID: "${p.id}", TiÃªu Ä‘á»: "${p.title}", MÃ´ táº£: "${p.description}"`)
        .join("\n");

      const toReplace = currentPillars.find(p => p.id === pillarIdToReplace);
      const replaceStr = toReplace
        ? `ID: "${toReplace.id}", TiÃªu Ä‘á»: "${toReplace.title}" (Tá»· lá»‡ phÃ¢n bá»•: ${toReplace.ratio})`
        : pillarIdToReplace;

      const prompt = `PhÃ¢n tÃ­ch má»¥c tiÃªu/chá»§ Ä‘á» chiáº¿n dá»‹ch marketing sau: "${campaignTopic}"
Hiá»‡n táº¡i, chÃºng tÃ´i Ä‘ang sá»­ dá»¥ng cÃ¡c trá»¥ cá»™t ná»™i dung (Content Pillars) sau Ä‘Ã¢y:
${existingPillarsStr}

ChÃºng tÃ´i muá»‘n THAY THáº¾ (Ä‘á»•i) trá»¥ cá»™t sau Ä‘Ã¢y:
${replaceStr}

YÃŠU Cáº¦U:
HÃ£y Ä‘á» xuáº¥t 1 trá»¥ cá»™t ná»™i dung (Content Pillar) má»›i vÃ  hoÃ n toÃ n KHÃC BIá»†T so vá»›i cÃ¡c trá»¥ cá»™t hiá»‡n cÃ³ á»Ÿ trÃªn Ä‘á»ƒ thay tháº¿ cho trá»¥ cá»™t muá»‘n Ä‘á»•i. Trá»¥ cá»™t má»›i nÃ y pháº£i bá»• trá»£ tá»‘t cho chiáº¿n dá»‹ch vÃ  má»¥c tiÃªu "${campaignTopic}".
Trá»¥ cá»™t má»›i pháº£i cÃ³ thÃ´ng tin cáº¥u trÃºc sau:
1. id: chuá»—i ngáº¯n gá»n, khÃ´ng dáº¥u cÃ¡ch, viáº¿t thÆ°á»ng (vÃ­ dá»¥: "kien_thuc_chuyen_sau", "goc_nhin_chuyen_gia") vÃ  KHÃ”NG ÄÆ¯á»¢C TRÃ™NG vá»›i báº¥t ká»³ ID nÃ o cá»§a cÃ¡c trá»¥ cá»™t hiá»‡n táº¡i.
2. title: TiÃªu Ä‘á» trá»¥ cá»™t ná»™i dung má»›i tá»‘i Æ°u báº±ng tiáº¿ng Viá»‡t (VÃ­ dá»¥: "Pillar D: Kiáº¿n thá»©c chuyÃªn sÃ¢u", "Pillar E: Phong cÃ¡ch sá»‘ng").
3. ratio: Tá»· lá»‡ phÃ¢n bá»• há»£p lÃ½ hiá»ƒn thá»‹ dÆ°á»›i dáº¡ng chuá»—i (VÃ­ dá»¥: "35% tá»‰ trá»ng"). HÃ£y giá»¯ nguyÃªn tá»‰ lá»‡ cá»§a trá»¥ cá»™t cÅ© lÃ : "${toReplace?.ratio || "33% tá»‰ trá»ng"}".
4. description: MÃ´ táº£ ngáº¯n gá»n trá»±c quan báº±ng tiáº¿ng Viá»‡t hÆ°á»›ng dáº«n cÃ¡ch triá»ƒn khai cá»¥ thá»ƒ trá»¥ cá»™t nÃ y Ä‘á»‘i vá»›i chiáº¿n dá»‹ch "${campaignTopic}".

Tráº£ vá» káº¿t quáº£ á»Ÿ Ä‘á»‹nh dáº¡ng JSON phÃ¹ há»£p chÃ­nh xÃ¡c vá»›i cáº¥u trÃºc yÃªu cáº§u.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "ID ngáº¯n gá»n viáº¿t liá»n khÃ´ng dáº¥u, khÃ´ng trÃ¹ng ID hiá»‡n táº¡i" },
              title: { type: Type.STRING, description: "TiÃªu Ä‘á» tiáº¿ng Viá»‡t cá»§a trá»¥ cá»™t" },
              ratio: { type: Type.STRING, description: "Tá»· lá»‡ phÃ¢n bá»• (giá»¯ nguyÃªn tá»· lá»‡ cÅ©)" },
              description: { type: Type.STRING, description: "MÃ´ táº£ triá»ƒn khai chi tiáº¿t" },
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
   * PhÃ¡t sinh báº£n nhÃ¡p Ã½ tÆ°á»Ÿng chiáº¿n dá»‹ch
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
        ? `(Äá»‹nh hÆ°á»›ng Trá»¥ cá»™t ná»™i dung: ${selectedPillars.join(", ")})`
        : "";

    const getMockConcepts = () => {
      const concepts = [
        {
          title: `Chiáº¿n dá»‹ch: Cháº¡m Äá»™t PhÃ¡ - ${campaignTopic || "Mua Sáº¯m Cuá»‘i NÄƒm"}`,
          matchPercent: 95,
          summary: `Äá»™t phÃ¡ doanh sá»‘ nháº¯m vÃ o Ä‘á»‘i tÆ°á»£ng tráº» tuá»•i. ${pillarsStr
            ? `Táº­p trung sÃ¢u vÃ o Ä‘á»‹nh hÆ°á»›ng truyá»n thÃ´ng tá»« cÃ¡c trá»¥ cá»™t lá»±a chá»n: ${selectedPillars.join(", ")}.`
            : "Táº¡o lá»‘i sá»‘ng tráº£i nghiá»‡m cÃ´ng nghá»‡ Ä‘eo vÃ  phong cÃ¡ch sá»‘ng lÃ nh máº¡nh."
            }`,
          channels: channels && channels.length > 0 ? channels : ["TikTok", "Facebook", "Zalo"],
          suggestedContent:
            "ðŸŽ¬ Ká»‹ch báº£n Tiktok: Biáº¿n Ä‘á»•i phong cÃ¡ch thÆ°á»ng ngÃ y thÃ nh phong cÃ¡ch nÄƒng Ä‘á»™ng thá»ƒ thao chá»‰ sau 1 cÃ¡i cháº¡m mÃ n hÃ¬nh X1.",
          hashtags: ["#iGenX1", "#SmartWearable", "#NangTamCuocSong"],
          mediaPrompt: `A dynamic lifestyle photoshoot featuring a young professional using ${campaignTopic || "smart wearable device"} in an urban setting, bright natural lighting, modern cityscape background, energetic mood, 8k high-resolution product photography.`,
        },
        {
          title: `Tráº£i nghiá»‡m Äá»‰nh Cao - Tri Ã‚n Há»™i ViÃªn`,
          matchPercent: 88,
          summary: `Quáº£ng bÃ¡ giÃ¡ trá»‹ cá»‘t lÃµi bá»n vá»¯ng thÃ´ng qua chuá»—i bÃ i viáº¿t phá»ng váº¥n cÃ¡c Ä‘á»‘i tÃ¡c trung thÃ nh thá»±c táº¿ Ä‘ang nÃ¢ng táº§m cÃ´ng viá»‡c cÃ¹ng Workspace V2. ${pillarsStr ? `Äiá»u phá»‘i theo: ${selectedPillars.join(", ")}.` : ""
            }`,
          channels: channels && channels.length > 0 ? channels : ["Facebook", "Zalo"],
          suggestedContent:
            "âœï¸ Facebook Post: 'Gáº·p gá»¡ anh HÃ¹ng, GiÃ¡m Ä‘á»‘c SÃ¡ng táº¡o, ngÆ°á»i Ä‘Ã£ nÃ¢ng cáº¥p 200% tá»‘c Ä‘á»™ gÃµ nhá» BÃ n phÃ­m cÆ¡ Workspace V2...'",
          hashtags: ["#WorkspaceV2", "#KeyboardMechanic", "#TangHieuSuat"],
          mediaPrompt: `A premium flatlay product photograph of a mechanical keyboard on a clean wooden desk, warm ambient lighting, coffee cup and notebook nearby, professional workspace aesthetic, detailed textures, 4k resolution.`,
        },
        {
          title: `Giá» VÃ ng GiÃ¡ Sá»‘c - SÄƒn Äá»™c Quyá»n AI`,
          matchPercent: 78,
          summary: `Táº¡o sá»± gáº¥p rÃºt báº±ng tÃ­nh nÄƒng Ä‘áº¿m ngÆ°á»£c flash sale Ä‘Æ°á»£c quáº£n lÃ½ tá»± Ä‘á»™ng bá»Ÿi thuáº­t toÃ¡n Ä‘á» xuáº¥t cá»§a iGen Marketing. ${pillarsStr ? `Káº¿ thá»«a Ã½ tÆ°á»Ÿng tá»« cÃ¡c Content Pillar Ä‘Æ°á»£c cáº¥u hÃ¬nh: ${selectedPillars.join(", ")}.` : ""
            }`,
          channels: channels && channels.length > 0 ? channels : ["Facebook", "Zalo"],
          suggestedContent:
            "ðŸ”¥ Tin nháº¯n Zalo: 'Duy nháº¥t hÃ´m nay! Giá» vÃ ng tá»« 12h-14h, giáº£m giÃ¡ 30% toÃ n bá»™ tai nghe KhÃ´ng dÃ¢y Pro Max. Äáº·t ngay!'",
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
          ? `\nCÃ¡c Trá»¥ cá»™t ná»™i dung (Content Pillars) báº¯t buá»™c pháº£i tÃ­ch há»£p vÃ  bÃ¡m sÃ¡t: ${selectedPillars.join(
            ", "
          )}. HÃ£y sÃ¡ng táº¡o cÃ¡c Ã½ tÆ°á»Ÿng táº­p trung xoay quanh cÃ¡c trá»¥ cá»™t nÃ y.`
          : "";

      const channelsContext =
        channels && channels.length > 0
          ? `\nKÃªnh truyá»n thÃ´ng báº¯t buá»™c: Báº¯t buá»™c cÃ¡c Ã½ tÆ°á»Ÿng cá»§a báº¡n pháº£i phÃ¢n phá»‘i vÃ  Ä‘Äƒng bÃ i chÃ­nh xÃ¡c trÃªn cÃ¡c kÃªnh: ${channels.join(", ")}.`
          : "";

      const mediaContext =
        mediaType === "image"
          ? "\nYÃªu cáº§u vá» phÆ°Æ¡ng tiá»‡n: CÃ¡c Ã½ tÆ°á»Ÿng pháº£i thiáº¿t káº¿ Ä‘i kÃ¨m hÃ¬nh áº£nh lÃ m chá»§ Ä‘áº¡o."
          : mediaType === "video"
            ? "\nYÃªu cáº§u vá» phÆ°Æ¡ng tiá»‡n: CÃ¡c Ã½ tÆ°á»Ÿng pháº£i thiáº¿t káº¿ Ä‘i kÃ¨m video lÃ m chá»§ Ä‘áº¡o."
            : mediaType === "human-video"
              ? "\nYÃªu cáº§u vá» phÆ°Æ¡ng tiá»‡n: CÃ¡c Ã½ tÆ°á»Ÿng pháº£i phÃ¹ há»£p cho video ngÆ°á»i tháº­t/avatar nÃ³i trÆ°á»›c camera, Æ°u tiÃªn hook máº¡nh, lá»i thoáº¡i tá»± nhiÃªn, cáº£nh quay Ä‘Æ¡n giáº£n vÃ  cÃ³ thá»ƒ chuyá»ƒn thÃ nh voice script trá»±c tiáº¿p."
              : mediaType === "none"
                ? "\nYÃªu cáº§u vá» phÆ°Æ¡ng tiá»‡n: CÃ¡c bÃ i Ä‘Äƒng khÃ´ng Ä‘i kÃ¨m hÃ¬nh áº£nh hoáº·c video (chá»‰ vÄƒn báº£n/caption)."
                : "";

      const prompt = `Báº¡n lÃ  má»™t chuyÃªn gia marketing xuáº¥t sáº¯c.
HÃ£y táº¡o Ä‘Ãºng 3 Ã½ tÆ°á»Ÿng/báº£n nhÃ¡p chiáº¿n dá»‹ch marketing chi tiáº¿t cho chá»§ Ä‘á»/chiáº¿n dá»‹ch nÃ y: "${campaignTopic}".${pillarsContext}${channelsContext}${mediaContext}
YÃªu cáº§u káº¿t quáº£ Ä‘áº§u ra:
1. Äá» xuáº¥t tiÃªu Ä‘á» chiáº¿n dá»‹ch sÃ¡ng táº¡o.
2. Tá»· lá»‡ pháº§n trÄƒm phÃ¹ há»£p (matchPercent) Æ°á»›c lÆ°á»£ng (sá»‘ nguyÃªn tá»« 50-100).
3. TÃ³m táº¯t Ã½ tÆ°á»Ÿng triá»ƒn khai ngáº¯n gá»n.
4. CÃ¡c kÃªnh truyá»n thÃ´ng phÃ¹ há»£p Ä‘á» xuáº¥t Ä‘Äƒng bÃ i (máº£ng cÃ¡c chuá»—i, vÃ­ dá»¥: ["Facebook", "TikTok"] - Báº¯t buá»™c pháº£i trÃ¹ng khá»›p vá»›i danh sÃ¡ch kÃªnh Ä‘Ã£ Ä‘Æ°á»£c yÃªu cáº§u á»Ÿ trÃªn).
5. Ã tÆ°á»Ÿng ná»™i dung gá»£i Ã½ ban Ä‘áº§u Ä‘á»ƒ triá»ƒn khai bÃ i Ä‘Äƒng trÃªn kÃªnh.
6. Hashtags liÃªn quan phÃ¹ há»£p.
7. mediaPrompt: Má»™t Ä‘oáº¡n mÃ´ táº£ chi tiáº¿t báº±ng tiáº¿ng Anh (visual prompt) mÃ´ táº£ chÃ­nh xÃ¡c hÃ¬nh áº£nh hoáº·c video phÃ¹ há»£p nháº¥t cho Ã½ tÆ°á»Ÿng nÃ y, dÃ¹ng Ä‘á»ƒ gá»­i tá»›i AI Image/Video Generator. Prompt pháº£i bao gá»“m: chá»§ thá»ƒ chÃ­nh, bá»‘i cáº£nh, Ã¡nh sÃ¡ng, phong cÃ¡ch nghá»‡ thuáº­t, mood/tone, vÃ  chi tiáº¿t ká»¹ thuáº­t.
8. mediaPrompt pháº£i dá»‹ch Ä‘Ãºng nghÄ©a vÃ  bÃ¡m sÃ¡t nháº¥t vá»›i input ngÆ°á»i dÃ¹ng vÃ  ná»™i dung phÃ¢n tÃ­ch tá»« file Ä‘Ã­nh kÃ¨m. KhÃ´ng Ä‘Æ°á»£c thÃªm bá»›t chá»§ Ä‘á» hay lÃ m generic hÃ³a bá»‘i cáº£nh.

NGUá»’N Sá»° THáº¬T Báº®T BUá»˜C:
${sourceBrief.normalizedBrief || campaignTopic}

Tráº£ vá» káº¿t quáº£ á»Ÿ Ä‘á»‹nh dáº¡ng JSON phÃ¹ há»£p chÃ­nh xÃ¡c vá»›i cáº¥u trÃºc yÃªu cáº§u.`;

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
                    title: { type: Type.STRING, description: "TiÃªu Ä‘á» Ã½ tÆ°á»Ÿng chiáº¿n dá»‹ch" },
                    matchPercent: { type: Type.INTEGER, description: "Tá»· lá»‡ phÃ¹ há»£p" },
                    summary: { type: Type.STRING, description: "TÃ³m táº¯t Ã½ tÆ°á»Ÿng" },
                    channels: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "CÃ¡c kÃªnh Ä‘á» xuáº¥t Ä‘Äƒng bÃ i",
                    },
                    suggestedContent: { type: Type.STRING, description: "Ã tÆ°á»Ÿng ná»™i dung gá»£i Ã½ ban Ä‘áº§u" },
                    hashtags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Hashtags liÃªn quan",
                    },
                    mediaPrompt: {
                      type: Type.STRING,
                      description: "A detailed English visual prompt describing the ideal image or video for this concept, including subject, setting, lighting, art style, mood, and technical details.",
                    },
                  },
                  required: ["title", "matchPercent", "summary", "channels", "suggestedContent", "hashtags", "mediaPrompt"],
                },
                description: "Danh sÃ¡ch 3 Ã½ tÆ°á»Ÿng/báº£n nhÃ¡p chiáº¿n dá»‹ch marketing",
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
      if (c.includes("tiktok") || c.includes("tik tok") || c.includes("reels") || c.includes("video ngáº¯n")) return "TikTok";
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
        let contentType = "BÃ i viáº¿t truyá»n thÃ´ng";
        let outline = "";
        let bodyText = "";
        let mockMediaPrompt = "";
        if (chan === "Facebook") {
          contentType = "HÃ¬nh áº£nh kÃ¨m Caption";
          outline = `ðŸ“‹ DÃ€N Ã CHI TIáº¾T (OUTLINE):
1. HÃ¬nh áº£nh: áº¢nh flatlay thiáº¿t bá»‹ sang trá»ng trÃªn bÃ n lÃ m viá»‡c hiá»‡n Ä‘áº¡i.
2. TiÃªu Ä‘á»: Äá»™c vá»‹ phong cÃ¡ch - Chá»n ${title}.
3. Ná»™i dung chÃ­nh: Giáº£i quyáº¿t váº¥n Ä‘á» má»i tay, tÄƒng tá»‘c gÃµ vÃ  tá»‘i Æ°u hÃ³a khÃ´ng gian lÃ m viá»‡c.
4. Call to Action: ÄÄƒng kÃ½ nháº­n Æ°u Ä‘Ã£i 10% ra máº¯t.`;
          bodyText = `ðŸ”¥ Báº¬T PHONG CÃCH - NHÃ‚N HIá»†U SUáº¤T CÃ™NG ${title}! ðŸ”¥

Báº¡n cÃ³ biáº¿t 90% hiá»‡u suáº¥t lÃ m viá»‡c phá»¥ thuá»™c vÃ o sá»± thoáº£i mÃ¡i cá»§a thiáº¿t bá»‹ Ä‘á»“ng hÃ nh? Vá»›i chiáº¿n dá»‹ch ${summary}, chÃºng tÃ´i mang Ä‘áº¿n giáº£i phÃ¡p tá»‘i Æ°u cho báº¡n:
ðŸ’» Thiáº¿t káº¿ cÃ´ng thÃ¡i há»c tinh táº¿.
âš¡ TÄƒng tá»‘c Ä‘á»™ pháº£n há»“i phÃ­m gÃµ lÃªn 150%.
ðŸŽ QuÃ  táº·ng kÃ¨m kÃª tay gá»— sá»“i Ä‘áº·c quyá»n.

ðŸ’¡ Ã tÆ°á»Ÿng cá»‘t lÃµi: "${suggestedContent}"

ðŸ“² Nháº¯n tin ngay cho iGen Ä‘á»ƒ nháº­n deal há»i! #iGenMarketing #WorkspaceV2 #CongNgheSo #Success`;
          mockMediaPrompt = `A professional product photoshoot of ${title} on a modern wooden desk, warm cozy lighting, detailed textures, 8k resolution.`;
        } else if (chan === "TikTok") {
          contentType = "Ká»‹ch báº£n Video ngáº¯n 8s";
          outline = `ðŸŽ¬ Ká»ŠCH Báº¢N QUAY (TIMELINE VIDEO SCRIPTS - MAX 8S):
[0:00 - 0:03]
- Visual: Hook so sÃ¡nh tÆ° tháº¿ lÃ m viá»‡c gÃ¹ lÆ°ng/má»i tay vá»›i tÆ° tháº¿ chuáº©n.
- Audio (Voiceover): "Báº¡n cÃ³ Ä‘ang lÃ m viá»‡c sai tÆ° tháº¿?"

[0:03 - 0:08]
- Visual: Show cáº­n cáº£nh thiáº¿t káº¿ sang trá»ng & Ã¢m thanh gÃµ phÃ­m Ä‘áº§m cháº¯c cá»§a ${title}.
- Audio (Voiceover): "NÃ¢ng cáº¥p hiá»‡u nÄƒng lÃ m viá»‡c cá»±c Ä‘á»‰nh cÃ¹ng ${summary}"`;
          bodyText = `ðŸ”¥ Cá»©u tinh deadline cá»§a báº¡n Ä‘Ã¢y rá»“i! NÃ¢ng cáº¥p hiá»‡u nÄƒng lÃ m viá»‡c cá»±c Ä‘á»‰nh vá»›i ${title}. ÄÄƒng kÃ½ tráº£i nghiá»‡m ngay hÃ´m nay Ä‘á»ƒ nháº­n voucher giáº£m giÃ¡ 45% Ä‘á»™c quyá»n! #iGenMarketing #WorkspaceV2 #WorkSmart #Deadline`;
          mockMediaPrompt = `An energetic, dynamic lifestyle video showing someone typing fast on ${title}, neon lighting, high-tech vibes, cinematic look.`;
        } else if (chan === "LinkedIn") {
          contentType = "BÃ i viáº¿t chuyÃªn sÃ¢u (Article)";
          outline = `ðŸ“‹ DÃ€N Ã CHI TIáº¾T (OUTLINE):
1. Äáº·t váº¥n Ä‘á»: Xu hÆ°á»›ng chuyá»ƒn Ä‘á»•i sá»‘ vÃ  nÃ¢ng cao nÄƒng suáº¥t doanh nghiá»‡p.
2. PhÃ¢n tÃ­ch: Vai trÃ² cá»§a thiáº¿t bá»‹ chuáº©n cÃ´ng thÃ¡i há»c Ä‘á»‘i vá»›i nhÃ¢n sá»± IT/Láº­p trÃ¬nh.
3. Chiáº¿n dá»‹ch ${summary} Ä‘Ã³ng gÃ³p giÃ¡ trá»‹ nhÆ° tháº¿ nÃ o.
4. CTA káº¿t ná»‘i nháº­n tÆ° váº¥n.`;
          bodyText = `[XU HÆ¯á»šNG Váº¬N HÃ€NH] Tá»I Æ¯U HÃ“A TRáº I NGHIá»†M NHÃ‚N Sá»° Äá»‚ Äá»˜T PHÃ HIá»†U SUáº¤T

KÃ­nh gá»­i quÃ½ Ä‘á»‘i tÃ¡c vÃ  cá»™ng Ä‘á»“ng doanh nghiá»‡p,

Trong quáº£n trá»‹ hiá»‡n Ä‘áº¡i, sá»± hÃ i lÃ²ng vÃ  sá»©c khá»e thá»ƒ cháº¥t cá»§a nhÃ¢n viÃªn chÃ­nh lÃ  Ä‘Ã²n báº©y hiá»‡u nÄƒng lá»›n nháº¥t. Vá»›i chiáº¿n dá»‹ch "${title}" cÃ¹ng Ä‘á»‹nh hÆ°á»›ng: ${summary}.

Dá»±a trÃªn gá»£i Ã½ Ä‘á» xuáº¥t: "${suggestedContent}", iGen Marketing mang tá»›i gÃ³c nhÃ¬n má»›i giÃºp doanh nghiá»‡p:
âœ… Giáº£m thiá»ƒu cháº¥n thÆ°Æ¡ng cá»• tay (RSI) á»Ÿ bá»™ pháº­n ká»¹ thuáº­t.
âœ… Gia tÄƒng sá»± táº­p trung vÃ  gáº¯n káº¿t cÃ´ng viá»‡c.
âœ… XÃ¢y dá»±ng mÃ´i trÆ°á»ng lÃ m viá»‡c thÃ´ng minh vÃ  hiá»‡n Ä‘áº¡i.

ðŸ’¼ HÃ£y tháº£o luáº­n cÃ¹ng chÃºng tÃ´i Ä‘á»ƒ thiáº¿t káº¿ giáº£i phÃ¡p chuyá»ƒn Ä‘á»•i sá»‘ toÃ n diá»‡n cho doanh nghiá»‡p cá»§a báº¡n.

#ChuyenDoiSo #iGenMarketing #LinkedInArticle #CongNgheTuongLai`;
          mockMediaPrompt = `A minimalist, clean corporate office setting showing a laptop and ${title}, professional corporate workspace, bright natural light.`;
        } else {
          contentType = "BÃ i viáº¿t truyá»n thÃ´ng Ä‘a kÃªnh";
          outline = `ðŸ“‹ DÃ€N Ã CHI TIáº¾T (OUTLINE):
1. Má»Ÿ bÃ i cuá»‘n hÃºt.
2. PhÃ¢n tÃ­ch cá»‘t lÃµi.
3. CTA kÃªu gá»i hÃ nh Ä‘á»™ng.`;
          bodyText = `Giá»›i thiá»‡u chiáº¿n dá»‹ch: ${title}!

Äá»‹nh hÆ°á»›ng Ã½ tÆ°á»Ÿng: ${summary}.
Ná»™i dung chi tiáº¿t gá»£i Ã½: ${suggestedContent}`;
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

YÃŠU Cáº¦U RIÃŠNG CHO VIDEO NGÆ¯á»œI THáº¬T:
1. Má»—i bÃ i viáº¿t báº¯t buá»™c pháº£i cÃ³ thÃªm trÆ°á»ng "voiceScript" báº±ng tiáº¿ng Viá»‡t tá»± nhiÃªn, mÆ°á»£t mÃ , chuáº©n vÄƒn phong nÃ³i tiáº¿ng Viá»‡t vÃ  khÃ´ng bá»‹ cáº£m giÃ¡c dá»‹ch mÃ¡y.
2. "voiceScript" pháº£i lÃ  Ä‘oáº¡n lá»i thoáº¡i hoÃ n chá»‰nh Ä‘á»ƒ Ä‘Æ°a trá»±c tiáº¿p sang bá»™ chuyá»ƒn Ä‘á»•i Text-to-Speech (TTS). Tuyá»‡t Ä‘á»‘i khÃ´ng chá»©a kÃ½ hiá»‡u markdown, khÃ´ng chá»©a gáº¡ch Ä‘áº§u dÃ²ng (bullet points), khÃ´ng chá»©a báº¥t ká»³ nhÃ£n dáº«n hay lá»i ghi chÃº nÃ o (vÃ­ dá»¥: khÃ´ng cÃ³ "MC:", "Voiceover:", "Cáº£nh 1:", v.v.).
3. RÃ€NG BUá»˜C Äá»˜ DÃ€I VÃ€ THá»œI LÆ¯á»¢NG NGHIÃŠM NGáº¶T: Thá»i lÆ°á»£ng Ä‘á»c má»¥c tiÃªu lÃ  Ä‘Ãºng ${humanDurationSeconds} giÃ¢y. Äá»ƒ Ä‘áº£m báº£o Ä‘iá»u nÃ y, sá»‘ lÆ°á»£ng tá»«/Ã¢m tiáº¿t tiáº¿ng Viá»‡t trong "voiceScript" báº¯t buá»™c pháº£i náº±m trong giá»›i háº¡n tá»« ${minWords} Ä‘áº¿n ${maxWords} tá»«. TrÃ¡nh viá»‡c viáº¿t quÃ¡ dÃ i hoáº·c quÃ¡ ngáº¯n sáº½ lÃ m há»ng thá»i lÆ°á»£ng video.
4. "bodyText" váº«n lÃ  pháº§n caption/ná»™i dung ngáº¯n gá»n Ä‘Äƒng lÃªn kÃªnh máº¡ng xÃ£ há»™i, cÃ²n "voiceScript" má»›i lÃ  ká»‹ch báº£n thoáº¡i Ä‘Æ°á»£c Ä‘á»c thÃ nh tiáº¿ng. Hai trÆ°á»ng nÃ y pháº£i nháº¥t quÃ¡n nhÆ°ng tÃ¡ch biá»‡t.
5. "outline" pháº£i mÃ´ táº£ cÃ¡c cáº£nh quay, gÃ³c mÃ¡y, nhá»‹p cáº¯t khá»›p hoÃ n háº£o vá»›i diá»…n biáº¿n cá»§a "voiceScript".
6. "motionText" lÃ  mÃ´ táº£ chi tiáº¿t báº±ng TIáº¾NG VIá»†T vá» cá»­ chá»‰, biá»ƒu cáº£m gÆ°Æ¡ng máº·t, cá»­ Ä‘á»™ng cÆ¡ thá»ƒ vÃ  hÃ nh Ä‘á»™ng cá»§a avatar ngÆ°á»i tháº­t trong video (vÃ­ dá»¥: "NgÆ°á»i thuyáº¿t trÃ¬nh tá»± tin, gáº­t Ä‘áº§u nháº¹ nhÃ ng, biá»ƒu cáº£m thÃ¢n thiá»‡n, cá»­ chá»‰ tay cá»Ÿi má»Ÿ"). MÃ´ táº£ pháº£i tá»± nhiÃªn, bÃ¡m sÃ¡t ná»™i dung vÃ  ngá»¯ Ä‘iá»‡u lá»i thoáº¡i.
7. Tuyá»‡t Ä‘á»‘i khÃ´ng viáº¿t "voiceScript" chung chung. Ná»™i dung pháº£i táº­p trung lÃ m ná»•i báº­t tiÃªu Ä‘á», tÃ³m táº¯t chiáº¿n dá»‹ch, insight khÃ¡ch hÃ ng vÃ  thÃ´ng Ä‘iá»‡p bÃ¡n hÃ ng cá»¥ thá»ƒ Ä‘Æ°á»£c cung cáº¥p.
`
          : "";

        const prompt = `Báº¡n lÃ  má»™t chuyÃªn gia viáº¿t ká»‹ch báº£n vÃ  AI Copywriter xuáº¥t sáº¯c.
HÃ£y láº­p DÃ n Ã½ (Outline) vÃ  viáº¿t Báº£n nhÃ¡p ná»™i dung (Draft Content) cho cÃ¡c kÃªnh sau Ä‘Ã¢y: ${targetChannels.join(", ")}

QUY Táº®C PHÃ‚N TÃCH Dá»® LIá»†U Báº®T BUá»˜C CHO Tá»ªNG KÃŠNH:
1. Äá»‘i vá»›i kÃªnh TikTok:
   - TrÆ°á»ng "outline" (DÃ n Ã½): PHáº¢I chá»©a toÃ n bá»™ ká»‹ch báº£n quay chi tiáº¿t (Shooting Script / Storyboard), bao gá»“m phÃ¢n Ä‘oáº¡n visual (hÃ¬nh áº£nh/hÃ nh Ä‘á»™ng), audio (lá»i thoáº¡i/Ã¢m thanh/voiceover) vÃ  má»‘c thá»i gian (Timeline dáº¡ng [0:00 - 0:03], [0:03 - 0:08]...) cho tá»«ng cáº£nh. Tá»•ng thá»i lÆ°á»£ng ká»‹ch báº£n khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ ${videoDurationSeconds} giÃ¢y.
   - TrÆ°á»ng "bodyText" (Ná»™i dung chÃ­nh): PHáº¢I lÃ  Caption/Description giá»›i thiá»‡u video sáº¡ch, cuá»‘n hÃºt kÃ¨m hashtag Ä‘á»ƒ Ä‘Äƒng táº£i trá»±c tiáº¿p lÃªn TikTok (vÃ­ dá»¥: "ðŸ”¥ Cá»©u tinh deadline cá»§a báº¡n Ä‘Ã¢y... #iGenMarketing..."). TUYá»†T Äá»I khÃ´ng chá»©a báº¥t ká»³ má»‘c thá»i gian timeline, phÃ¢n cáº£nh, Visual hay Audio nÃ o á»Ÿ trÆ°á»ng nÃ y.
2. Äá»‘i vá»›i cÃ¡c kÃªnh khÃ¡c (Facebook, LinkedIn, Instagram...):
   - TrÆ°á»ng "outline": Láº­p dÃ n Ã½ chi tiáº¿t, cá»¥ thá»ƒ vÃ  tá»‘i Æ°u cá»§a bÃ i viáº¿t.
   - TrÆ°á»ng "bodyText": LÆ°u báº£n nhÃ¡p ná»™i dung bÃ i viáº¿t sáº¡ch hoÃ n chá»‰nh Ä‘á»ƒ Ä‘Äƒng táº£i trá»±c tiáº¿p (khÃ´ng chá»©a dÃ n Ã½ hay tiÃªu Ä‘á» nhÃ¡p).
3. Äá»‘i vá»›i má»i kÃªnh: Sinh thÃªm trÆ°á»ng "mediaPrompt" lÃ  má»™t Ä‘oáº¡n mÃ´ táº£ chi tiáº¿t báº±ng tiáº¿ng Anh (visual prompt) mÃ´ phá»ng chÃ­nh xÃ¡c ná»™i dung trá»±c quan (hÃ¬nh áº£nh hoáº·c video) phÃ¹ há»£p cho bÃ i viáº¿t nÃ y Ä‘á»ƒ gá»­i tá»›i AI Generator.
4. mediaPrompt pháº£i lÃ  báº£n dá»‹ch trung thÃ nh sang tiáº¿ng Anh tá»« dá»¯ liá»‡u gá»‘c, khÃ´ng Ä‘Æ°á»£c Ä‘á»•i nghÄ©a, khÃ´ng Ä‘Æ°á»£c tá»± Ã½ thÃªm chi tiáº¿t khÃ´ng cÃ³ trong input hoáº·c tÃ i liá»‡u Ä‘Ã­nh kÃ¨m, khÃ´ng Ä‘Æ°á»£c biáº¿n thÃ nh bá»‘i cáº£nh generic.
${humanVoiceRules}

ThÃ´ng tin chiáº¿n dá»‹ch marketing:
- TiÃªu Ä‘á» Ã½ tÆ°á»Ÿng: "${title}"
- TÃ³m táº¯t Ã½ tÆ°á»Ÿng: "${summary}"
- Ná»™i dung gá»£i Ã½ ban Ä‘áº§u: "${suggestedContent}"

NGUá»’N Sá»° THáº¬T Báº®T BUá»˜C:
${extractSourceBrief(sourceBriefText).normalizedBrief || sourceBriefText}

Tráº£ vá» káº¿t quáº£ á»Ÿ Ä‘á»‹nh dáº¡ng JSON phÃ¹ há»£p chÃ­nh xÃ¡c vá»›i cáº¥u trÃºc yÃªu cáº§u.`;

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
                      channel: { type: Type.STRING, description: "KÃªnh Ä‘Äƒng bÃ i (vÃ­ dá»¥: Facebook, TikTok, LinkedIn, Instagram, Zalo)" },
                      contentType: { type: Type.STRING, description: "Loáº¡i ná»™i dung" },
                      outline: {
                        type: Type.STRING,
                        description: `DÃ n Ã½ chi tiáº¿t cá»§a bÃ i viáº¿t. Äáº¶C BIá»†T vá»›i TikTok: Pháº£i lÆ°u Ká»ŠCH Báº¢N QUAY (timeline video script) chi tiáº¿t bao gá»“m Visual, Audio vÃ  má»‘c thá»i gian dáº¡ng [0:00 - 0:03], [0:03 - 0:08]... vá»›i tá»•ng thá»i lÆ°á»£ng tá»‘i Ä‘a khÃ´ng quÃ¡ ${videoDurationSeconds} giÃ¢y.`
                      },
                      bodyText: {
                        type: Type.STRING,
                        description: "Ná»™i dung bÃ i Ä‘Äƒng/caption sáº¡ch Ä‘á»ƒ Ä‘Äƒng táº£i trá»±c tiáº¿p. Äáº¶C BIá»†T vá»›i TikTok: Chá»‰ lÃ  Caption/Description giá»›i thiá»‡u video kÃ¨m hashtag vÃ  call-to-action (TUYá»†T Äá»I khÃ´ng chá»©a ká»‹ch báº£n quay, visual, audio hay timeline video á»Ÿ trÆ°á»ng nÃ y)."
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
                        description: "Short motion and expression direction in Vietnamese for the avatar/presenter (e.g., 'NgÆ°á»i thuyáº¿t trÃ¬nh tá»± tin, gáº­t Ä‘áº§u thÃ¢n thiá»‡n, cá»­ chá»‰ tay má»Ÿ rá»™ng'). Keep empty string when not needed."
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
   * Sinh áº£nh AI báº±ng model Nano-Banana (PiAPI), Gemini Banana Pro (Google Imagen), hoáº·c Imagen 4
   */
  async generateImage(
    prompt: string,
    options?: { aspectRatio?: string; modelName?: string; resolution?: string; existingImageUris?: string[] }
  ): Promise<{ url: string; isMock: boolean }> {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh trong file .env.");
    }

    return this._generateImageWithOpenRouter(prompt, options);
  },

  /**
   * Táº¡o áº£nh qua OpenRouter chat/completions + modalities: ["image","text"]
   * áº¢nh Ä‘Æ°á»£c tráº£ vá» trong message.images[0].image_url.url (field non-standard cá»§a OpenRouter)
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
   * Sinh video AI báº±ng model Veo3 hoáº·c Veo2
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
      throw new Error("ChÆ°a cáº¥u hÃ¬nh PIAPI_API_KEY. KhÃ´ng thá»ƒ sinh video.");
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
   * Táº¡o giá»ng nÃ³i TTS (Gemini Voice Modality)
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
   * Tá»‘i Æ°u ká»‹ch báº£n giá»ng nÃ³i
   */
  async optimizeScript(text: string, readingStyle: string, model?: string) {
    if (!process.env.OPENROUTER_API_KEY) {
      return { optimizedText: `[Tá»‘i Æ°u hÃ³a Giáº£ láº­p] ${text}` };
    }
    try {
      const systemInstruction = `Báº¡n lÃ  má»™t chuyÃªn gia biÃªn soáº¡n ká»‹ch báº£n vÃ  phÃ¡t thanh viÃªn chuyÃªn nghiá»‡p cá»§a ÄÃ i Tiáº¿ng nÃ³i Viá»‡t Nam (VOV).
HÃ£y tá»‘i Æ°u hÃ³a vÄƒn báº£n gá»‘c cá»§a ngÆ°á»i dÃ¹ng Ä‘á»ƒ biáº¿n nÃ³ thÃ nh má»™t ká»‹ch báº£n thoáº¡i (voiceover script) cháº¥t lÆ°á»£ng cao, lÆ°u loÃ¡t, chuáº©n tiáº¿ng Viá»‡t vÃ  cá»±c ká»³ tá»± nhiÃªn.

Ãp dá»¥ng cÃ¡c quy táº¯c biÃªn táº­p vÃ  phÃ¡t thanh nghiÃªm ngáº·t sau:
1. Sá»° Tá»° NHIÃŠN VÃ€ TRÃ”I CHáº¢Y: Chuyá»ƒn Ä‘á»•i vÄƒn báº£n thÃ nh vÄƒn phong nÃ³i tá»± nhiÃªn, chuáº©n ngÃ´n ngá»¯ phÃ¡t thanh. Loáº¡i bá» cÃ¡c cá»¥m tá»« rÆ°á»m rÃ , láº·p Ã½ hoáº·c mang tÃ­nh cháº¥t vÄƒn viáº¿t khÃ´ khan.
2. NGáº®T NGHá»ˆ Há»¢P LÃ Báº°NG Dáº¤U CÃ‚U: Tá»± Ä‘á»™ng chÃ¨n thÃªm dáº¥u pháº©y (,), dáº¥u cháº¥m (.) hoáº·c dáº¥u ba cháº¥m (...) táº¡i cÃ¡c vá»‹ trÃ­ cáº§n ngáº¯t nghá»‰, láº¥y hÆ¡i tá»± nhiÃªn cá»§a phÃ¡t thanh viÃªn. Äiá»u nÃ y ráº¥t quan trá»ng Ä‘á»ƒ giÃºp cÃ´ng cá»¥ Text-to-Speech (TTS) Ä‘á»c vá»›i nhá»‹p Ä‘iá»‡u vá»«a pháº£i, nháº¥n nhÃ¡ chÃ­nh xÃ¡c, khÃ´ng bá»‹ Ä‘á»c liá»n má»™t máº¡ch quÃ¡ nhanh hay dÃ­nh chá»¯.
3. PHÃT Ã‚M VÃ€ CHá»® Sá» (Báº®T BUá»˜C):
   - Äá»c vÃ  viáº¿t rÃµ hoÃ n toÃ n cÃ¡c tá»« viáº¿t táº¯t thÃ nh tiáº¿ng Viá»‡t chuáº©n (VÃ­ dá»¥: "KH" -> "khÃ¡ch hÃ ng", "SP" -> "sáº£n pháº©m", "DN" -> "doanh nghiá»‡p", "VS" -> "vá»›i").
   - Viáº¿t rÃµ cÃ¡c tá»« tiáº¿ng Anh thÃ´ng dá»¥ng theo cÃ¡ch Ä‘á»c tá»± nhiÃªn cá»§a tiáº¿ng Viá»‡t hoáº·c phiÃªn Ã¢m dá»… Ä‘á»c (VÃ­ dá»¥: "ERP" -> "E-R-P", "AI" -> "A-I", "IT" -> "I-T", "Sales" -> "sale", "Marketing" -> "mÃ¡c-kÃ©t-tinh").
   - Viáº¿t chá»¯ hoÃ n toÃ n cho táº¥t cáº£ cÃ¡c con sá»‘, pháº§n trÄƒm, kÃ½ hiá»‡u, ngÃ y thÃ¡ng hoáº·c sá»‘ tiá»n (VÃ­ dá»¥: "10%" -> "mÆ°á»i pháº§n trÄƒm", "24/7" -> "hai mÆ°Æ¡i tÆ° trÃªn báº£y", "2026" -> "nÄƒm hai nghÃ¬n khÃ´ng trÄƒm hai mÆ°Æ¡i sÃ¡u", "15s" -> "mÆ°á»i lÄƒm giÃ¢y", "$100" -> "má»™t trÄƒm Ä‘Ã´ la").
4. PHONG CÃCH Äá»ŒC: BÃ¡m sÃ¡t vÃ  thá»ƒ hiá»‡n rÃµ nÃ©t phong cÃ¡ch Ä‘á»c yÃªu cáº§u (vÃ­ dá»¥: hÃ o há»©ng, sÃ¢u láº¯ng, cháº­m rÃ£i...).
5. Káº¾T QUáº¢ TRáº¢ Vá»€: Chá»‰ tráº£ vá» DUY NHáº¤T vÄƒn báº£n ká»‹ch báº£n thoáº¡i tiáº¿ng Viá»‡t Ä‘Ã£ Ä‘Æ°á»£c tá»‘i Æ°u hÃ³a hoÃ n chá»‰nh. KhÃ´ng thÃªm lá»i bÃ¬nh luáº­n, khÃ´ng cÃ³ kÃ½ tá»± markdown (nhÆ° **, ##, *), khÃ´ng chá»©a tiÃªu Ä‘á» ká»‹ch báº£n, lá»i má»Ÿ Ä‘áº§u hay báº¥t ká»³ lá»i giáº£i thÃ­ch nÃ o.`;
      const selectedModel = model || GEMINI_TEXT_MODEL;
      const response = await generateText(
        selectedModel,
        `Phong cÃ¡ch: ${readingStyle || "háº¥p dáº«n, lÃ´i cuá»‘n"}\nVÄƒn báº£n gá»‘c:\n${text}`,
        {
          systemInstruction,
          temperature: 0.7,
        }
      );
      return { optimizedText: response.text || text };
    } catch (error: any) {
      console.error("[geminiService.optimizeScript] Error, fallback to mock script:", error);
      return { optimizedText: `[Tá»‘i Æ°u hÃ³a Giáº£ láº­p] ${text}` };
    }
  },

  /**
   * Tá»‘i Æ°u prompt hÃ¬nh áº£nh (cáº¥u trÃºc JSON)
   */
  async optimizeImagePrompt(description: string, imageUris?: string[], modelName?: string) {
    const normalizedDescription = String(description || "").trim();

    const getMockImagePrompt = () => {
      const wantsGraphicLayout = /\b(banner|poster|advertisement|ad creative|cover|thumbnail|flyer|social post)\b/i.test(normalizedDescription)
        || /(bÄƒng rÃ´n|banner|Ã¡p phÃ­ch|poster|quáº£ng cÃ¡o|giá»›i thiá»‡u|máº·t hÃ ng|bÃ¬a|thumbnail|tá» rÆ¡i|bÃ i Ä‘Äƒng)/i.test(normalizedDescription);
      const optimizedPrompt = wantsGraphicLayout
        ? `A professional commercial banner design that faithfully represents this exact brief: ${normalizedDescription || "the provided concept"}. Use a clear hero product or subject, designed background, headline area, subheadline area, CTA button area, brand/logo placeholder, clean typography, safe margins, and negative space for readable Vietnamese text. Do not make it a plain product photo.`
        : `A precise visual that faithfully represents this exact marketing or business concept: ${normalizedDescription || "the provided concept"}`;

      return {
        subject: normalizedDescription || "image concept",
        clothing_material: "",
        action_pose: "",
        setting_lighting: "",
        camera_parameters: "",
        optimized_english_prompt: optimizedPrompt,
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
Respect the requested media format. If the user asks for a banner, poster, ad creative, cover, thumbnail, flyer, or social post, the optimized prompt MUST describe a designed commercial graphic layout, not just a realistic product/photo scene.
For banner/ad/poster/social creative requests, include a clear hero subject, intentional composition, designed background, headline area, subheadline area, CTA/button area, brand/logo placeholder if no brand is provided, clean typography, safe margins, and enough negative space for readable text.
For product or shop introduction banners, show the product assortment as the hero visual but frame it as a promotional banner design with text zones and CTA, not plain documentary product photography.
Only choose a pure photo/lifestyle scene when the user explicitly requests a photo, realistic scene, or workplace/lifestyle image.
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
   * Tá»‘i Æ°u prompt video (cáº¥u trÃºc JSON)
   */
  async optimizeVideoPrompt(description: string, imageUris?: string[]) {
    const normalizedDescription = String(description || "").trim();

    const getMockVideoPrompt = () => {
      const text = normalizedDescription.toLowerCase().trim();
      const isEnglish = !/[Ã Ã¡áº£Ã£áº¡Äƒáº¯áº±áº³áºµáº·Ã¢áº¥áº§áº©áº«áº­Ã¨Ã©áº»áº½áº¹Ãªáº¿á»á»ƒá»…á»‡Ä‘Ã¬Ã­á»‰Ä©á»‹Ã²Ã³á»Ãµá»Ã´á»‘á»“á»•á»—á»™Æ¡á»›á»á»Ÿá»¡á»£Ã¹Ãºá»§Å©á»¥Æ°á»©á»«á»­á»¯á»±á»³Ã½á»·á»¹á»µ]/i.test(normalizedDescription);
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
        "cÃ¢u chuyá»‡n ngáº¯n vá» tuna": "a short narrative story about a character named Tuna",
        "cÃ¢u chuyá»‡n vá» tuna": "a narrative story featuring Tuna",
        "táº­p truyá»‡n vá» tuna": "a short story about Tuna",
        "tuna": "a character named Tuna",
        "nÃºi tuyáº¿t": "majestic snow-capped mountains under a clear sky",
        "nÃºi": "picturesque mountain ranges",
        "hoÃ ng hÃ´n": "sunset during golden hour with warm amber tones",
        "bÃ¬nh minh": "sunrise during blue hour, soft morning mist",
        "sáº£n pháº©m": "a premium commercial product showcase",
        "quáº£ng cÃ¡o": "high-end promotional commercial video",
        "ngÆ°á»i máº«u": "an elegant fashion model",
        "sÃ n diá»…n": "a glamorous fashion show catwalk runway",
        "runway": "fashion catwalk runway with bright studio lights",
        "flycam": "aerial drone perspective sweeping across the landscape",
        "bay": "soaring aerial shot",
        "xoay": "360-degree rotating showcase",
        "cáº­n cáº£nh": "extreme close-up macro details",
        "toÃ n cáº£nh": "wide-angle scenic overview",
        "xe": "a sleek modern luxury sports car",
        "Ã´ tÃ´": "a luxury car driving along a scenic route",
        "biá»ƒn": "crystal clear ocean waves gently crashing on a sandy beach",
        "Ä‘áº¡i dÆ°Æ¡ng": "vast deep blue ocean landscape",
        "thÃ nh phá»‘": "modern cityscape with towering skyscrapers",
        "cÃ´ng nghá»‡": "futuristic technology environment with holographic displays",
        "phim": "cinematic movie style footage",
        "Ä‘iá»‡n áº£nh": "cinematic film style",
        "cháº­m": "dramatic slow-motion video",
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
          .replace(/tiáº¿n hÃ nh/gi, "")
          .replace(/táº¡o 1/gi, "")
          .replace(/táº¡o má»™t/gi, "")
          .replace(/táº¡o/gi, "")
          .replace(/lÃ m/gi, "")
          .trim();
        if (cleanText) {
          englishSubject = `a cinematic representation of: "${cleanText}"`;
        }
      }

      // Adjust motion and camera based on keyword detection
      if (text.includes("cháº­m") || text.includes("slow")) {
        motion = "dramatic slow-motion action with elegant fluid dynamics";
        camera = "ultra-smooth slow tracking camera";
      } else if (text.includes("nhanh") || text.includes("fast")) {
        motion = "high-energy fast-paced dynamic actions";
        camera = "rapid cuts, active handheld tracking, whip pans";
      }

      if (text.includes("flycam") || text.includes("bay") || text.includes("trÃªn cao")) {
        camera = "high-altitude aerial drone sweep, panning down smoothly";
      } else if (text.includes("xoay") || text.includes("360")) {
        camera = "orbiting 360-degree rotation around the subject";
      } else if (text.includes("cáº­n cáº£nh") || text.includes("cáº­n")) {
        camera = "macro close-up focus with shallow depth of field";
      }

      if (text.includes("sáº£n pháº©m") || text.includes("product")) {
        lighting = "professional studio key lighting, soft box diffusion, edge highlight";
        style = "commercial grade, high-end product commercial, 8k, photorealistic";
      } else if (text.includes("ngÆ°á»i máº«u") || text.includes("fashion") || text.includes("runway")) {
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
      const systemInstruction = `Báº¡n lÃ  trá»£ lÃ½ chá»‰nh sá»­a video chuyÃªn nghiá»‡p, thÃ nh tháº¡o tiáº¿ng Viá»‡t vÃ  tiáº¿ng Anh.
Nhiá»‡m vá»¥ cá»§a báº¡n: chuyá»ƒn Ä‘á»•i prompt mÃ´ táº£ tá»± nhiÃªn cá»§a ngÆ°á»i dÃ¹ng thÃ nh cÃ¡c lá»‡nh chá»‰nh sá»­a video Cá»¤ THá»‚, CHI TIáº¾T báº±ng tiáº¿ng Viá»‡t.

âš ï¸ QUAN TRá»ŒNG: 
- Äáº§u ra pháº£i lÃ  cÃ¡c Lá»†NH CHá»ˆNH Sá»¬A (cáº¯t, zoom, filter, text, nháº¡c, tá»‘c Ä‘á»™), KHÃ”NG pháº£i mÃ´ táº£ chung chung.
- Náº¿u ngÆ°á»i dÃ¹ng nÃ³i "viral TikTok", hÃ£y cá»¥ thá»ƒ hÃ³a: "cáº¯t thÃ nh cÃ¡c Ä‘oáº¡n 2-3 giÃ¢y, tua nhanh 1.5x, zoom in/out xen káº½, thÃªm text popup ná»•i báº­t, chÃ¨n nháº¡c EDM sÃ´i Ä‘á»™ng xuyÃªn suá»‘t"
- Náº¿u ngÆ°á»i dÃ¹ng nÃ³i "chuyÃªn nghiá»‡p", hÃ£y cá»¥ thá»ƒ hÃ³a: "filter cinematic, chuyá»ƒn cáº£nh fade mÆ°á»£t, text tiÃªu Ä‘á» á»Ÿ giá»¯a 3 giÃ¢y Ä‘áº§u, nháº¡c ná»n corporate, tÄƒng tÆ°Æ¡ng pháº£n 1.25"
- Bao gá»“m CHÃNH XÃC cÃ¡c thÃ´ng sá»‘: thá»i gian (giÃ¢y), tá»‘c Ä‘á»™ (playbackRate), vá»‹ trÃ­ text, mÃ u sáº¯c.
- Viáº¿t báº±ng TIáº¾NG VIá»†T.

VÃ­ dá»¥:
Input: "Biáº¿n video nÃ y thÃ nh clip viral TikTok"
Output: "Cáº¯t video thÃ nh cÃ¡c Ä‘oáº¡n ngáº¯n 2-3 giÃ¢y, tua nhanh gáº¥p 1.5 láº§n toÃ n bá»™, zoom in vÃ  zoom out xen káº½ má»—i 2 giÃ¢y, thÃªm text highlight mÃ u vÃ ng #FFD700 á»Ÿ bottom-center, chÃ¨n nháº¡c EDM sÃ´i Ä‘á»™ng xuyÃªn suá»‘t tá»« 0 giÃ¢y Ä‘áº¿n háº¿t video."

Input: "LÃ m video chuyÃªn nghiá»‡p hÆ¡n"
Output: "ThÃªm filter cinematic (tÄƒng tÆ°Æ¡ng pháº£n 1.25, tÄƒng bÃ£o hÃ²a 1.3, giáº£m sÃ¡ng 0.95), chuyá»ƒn cáº£nh fade mÆ°á»£t giá»¯a cÃ¡c Ä‘oáº¡n, thÃªm text tiÃªu Ä‘á» 'Giá»›i thiá»‡u' á»Ÿ center trong 3 giÃ¢y Ä‘áº§u, chÃ¨n nháº¡c ná»n corporate xuyÃªn suá»‘t."

CHá»ˆ tráº£ vá» lá»‡nh chá»‰nh sá»­a, khÃ´ng thÃªm giáº£i thÃ­ch, khÃ´ng markdown.`;

      const response = await generateText(
        GEMINI_TEXT_MODEL,
        `Chuyá»ƒn prompt sau thÃ nh lá»‡nh chá»‰nh sá»­a video cá»¥ thá»ƒ, chi tiáº¿t:
"${normalizedDescription}"`,
        {
          systemInstruction,
          temperature: 0.7,
        }
      );

      const optimizedPrompt = (response.text || normalizedDescription).trim();
      console.log(`[geminiService.optimizeEditPrompt] Original: "${normalizedDescription}" â†’ Optimized: "${optimizedPrompt}"`);
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
   * BiÃªn táº­p video báº±ng prompt â€” delegate tá»›i video-edit module.
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
   * Láº¥y lá»‹ch sá»­ táº¡o Ä‘a phÆ°Æ¡ng tiá»‡n theo user vÃ  loáº¡i
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
   * XÃ³a má»™t báº£n ghi lá»‹ch sá»­
   */
  async deleteMediaHistory(userId: string, id: string) {
    try {
      const result = await AIMediaModel.deleteOne({ _id: id, userId });
      if (result.deletedCount === 0) {
        throw new Error("KhÃ´ng tÃ¬m tháº¥y báº£n ghi hoáº·c khÃ´ng cÃ³ quyá»n xÃ³a");
      }
      return { status: "success" };
    } catch (error: any) {
      console.error("[geminiService.deleteMediaHistory] Error:", error);
      throw error;
    }
  },

  /**
   * Polling tráº¡ng thÃ¡i video tá»« PiAPI cháº¡y ngáº§m khÃ´ng cháº·n luá»“ng HTTP
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
            "metadata.error": result.error || "Lá»—i táº¡o video tá»« PiAPI",
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
            "metadata.error": "QuÃ¡ thá»i gian chá» táº¡o video tá»« PiAPI (10 phÃºt)",
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
   * Äá»“ng bá»™ lÆ°u trá»¯ nÃ¢ng cao cá»§a Image/Video sau khi sinh thÃ nh cÃ´ng
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
   * Láº¥y danh sÃ¡ch giá»ng nÃ³i ElevenLabs (delegate to elevenlabsService)
   */
  async getElevenLabsVoices(userId?: string) {
    return elevenlabsService.getVoices(userId);
  },

  /**
   * Thiáº¿t káº¿ & phÃ¡t nghe thá»­ giá»ng nÃ³i ElevenLabs (delegate to elevenlabsService)
   */
  async generateCustomVoicePreview(userId: string, input: { gender: string; accent: string; age: string; accentStrength: number; text: string }) {
    return elevenlabsService.generateCustomVoicePreview(userId, input);
  },

  /**
   * LÆ°u giá»ng thiáº¿t káº¿ thÃ nh giá»ng chÃ­nh thá»©c (delegate to elevenlabsService)
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
 * Chuyá»ƒn Ä‘á»•i PCM sang WAV 16-bit Mono (Pure JS/Node)
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


