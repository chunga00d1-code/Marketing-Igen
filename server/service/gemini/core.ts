/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import { GoogleGenAI } from "@google/genai";
import { exec } from "child_process";
import { AIMediaModel } from "../../model/ai-media.model";
import { openrouterChat, mapModelName, type OpenRouterMessage, type OpenRouterContentPart } from "../openrouter.service";
import type {
  ChatIntent,
  FaithFulVisualGuardrailInput,
  GenerateTextConfig,
  NormalizedImageRegion,
  SourceBriefExtraction,
} from "./types";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const GEMINI_HEAVY_MODEL = process.env.GEMINI_HEAVY_MODEL || "gemini-3.5-flash";
export const HTML_VIDEO_MODEL = process.env.HTML_VIDEO_MODEL || process.env.GEMINI_MODEL || "google/gemini-2.5-flash";
export const AI_REPLY_MESSAGE_MODEL = process.env.AI_REPLY_MESSAGE_MODEL || process.env.GEMINI_MODEL || "deepseek-v4-flash-0731";
export const AI_REPLY_COMMENT_MODEL = process.env.AI_REPLY_COMMENT_MODEL || process.env.GEMINI_MODEL || "deepseek-v4-flash-0731";

export const Type = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  INTEGER: "integer",
  NUMBER: "number",
  BOOLEAN: "boolean",
} as const;

export function safeParseJson(text: string): any {
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

export async function fetchWithRetry(url: string, retries = 3, delay = 2000): Promise<Response> {
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

export async function getVideoDuration(url: string): Promise<number> {
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

export function extractSourceBrief(rawText: string): SourceBriefExtraction {
  const text = String(rawText || "").trim();
  if (!text) {
    return {
      userRequest: "",
      attachedDocumentName: "",
      attachedDocumentExcerpt: "",
      normalizedBrief: "",
    };
  }

  const docMarker = "TÀI LIỆU ĐỊNH KÈM:";
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

export function normalizeIntentText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectChatIntent(message: string, history: any[] = []): ChatIntent {
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
    /\b(dia chi|dc|hotline|so dien thoai|sdt|email|cong ty|thuong hieu|chi nhanh)\b/,
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

export function formatHumanLikeChatReply(rawText: string): string {
  const cleaned = String(rawText || "")
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) {
    return "Dạ, em kiểm tra lại rồi phản hồi mình ngay nhé ạ.";
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
    if (next.length <= 160) {
      currentLine = next;
    } else {
      if (currentLine) compactLines.push(currentLine);
      currentLine = piece;
    }
  }

  if (currentLine) compactLines.push(currentLine);

  const finalLines = compactLines
    .slice(0, 8)
    .map((line) => line.trim())
    .filter((line, index) => {
      if (index !== 0) return true;
      return !/^Dạ,?\s*(?:em\s+chào|[\p{L}\p{N}\s]+ xin chào)\s+anh\/chị[^\n]*$/iu.test(line);
    });

  const finalResult = finalLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return finalResult || normalized;
}

export function buildFaithfulVisualGuardrail(input: FaithFulVisualGuardrailInput): string {
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

export async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
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
export async function buildOpenRouterMessages(
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
          const text = contentParts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
          if (text) msgs.push({ role: "assistant", content: text });
        } else if (contentParts.length === 1 && contentParts[0].type === "text") {
          msgs.push({ role: "user", content: contentParts[0].text });
        } else {
          msgs.push({ role: "user", content: contentParts as OpenRouterContentPart[] });
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

export async function generateText(
  model: string,
  contents: any,
  config?: GenerateTextConfig
): Promise<{ text: string }> {
  let modelId = model || GEMINI_TEXT_MODEL;
  const needsJson = !!config?.responseMimeType?.includes("json") || !!config?.responseSchema;

  const messages = await buildOpenRouterMessages(
    contents,
    config?.systemInstruction,
    config?.images
  );

  const displayModel = mapModelName(modelId);
  console.log(`[generateText] Calling OpenRouter | model=${displayModel} | msgs=${messages.length} | hasSchema=${!!config?.responseSchema} | hasImages=${!!(config?.images?.length)}`);

  try {
    const res = await openrouterChat({
      model: modelId,
      messages,
      temperature: config?.temperature ?? 0.7,
      jsonMode: needsJson,
      responseSchema: config?.responseSchema,
      maxRetries: config?.maxRetries,
      timeoutMs: config?.timeoutMs,
      maxTokens: config?.maxTokens,
    });

    if (needsJson) {
      safeParseJson(res.text); // Validate that the response is parseable JSON
    }

    return res;
  } catch (error: any) {
    const fallbackModel =
      config?.fallbackModel ||
      process.env.FALLBACK_MODEL || "google/gemini-2.5-flash";
    console.warn(`[generateText] Primary model ${modelId} failed or returned invalid JSON: ${error?.message || error}. Falling back to ${fallbackModel}...`);

    try {
      const res = await openrouterChat({
        model: fallbackModel,
        messages,
        temperature: config?.temperature ?? 0.7,
        jsonMode: needsJson,
        responseSchema: config?.responseSchema,
        maxRetries: config?.fallbackMaxRetries ?? config?.maxRetries,
        timeoutMs: config?.fallbackTimeoutMs ?? config?.timeoutMs,
        maxTokens: config?.maxTokens,
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

export const MAX_POSTPROCESS_IMAGE_BYTES = 20 * 1024 * 1024;

export async function readImageBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:[^;]+;base64,(.+)$/s);
    if (!match) throw new Error("Ảnh nguồn dạng data URL không hợp lệ.");
    const buffer = Buffer.from(match[1], "base64");
    if (buffer.length > MAX_POSTPROCESS_IMAGE_BYTES) throw new Error("Ảnh nguồn vượt quá giới hạn xử lý.");
    return buffer;
  }

  const parsed = new URL(source);
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const isTrustedCloudinaryUrl = parsed.protocol === "https:"
    && parsed.hostname === "res.cloudinary.com"
    && cloudName
    && parsed.pathname.startsWith(`/${cloudName}/`);
  if (!isTrustedCloudinaryUrl) {
    throw new Error("Chỉ cho phép xử lý pixel trên ảnh Cloudinary của hệ thống hoặc data URL.");
  }

  const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Không thể tải ảnh Cloudinary để xử lý (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_POSTPROCESS_IMAGE_BYTES) throw new Error("Ảnh nguồn vượt quá giới hạn xử lý.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_POSTPROCESS_IMAGE_BYTES) throw new Error("Ảnh nguồn vượt quá giới hạn xử lý.");
  return buffer;
}

export function clampRegion(region: NormalizedImageRegion): NormalizedImageRegion {
  const x = Math.max(0, Math.min(1, region.x));
  const y = Math.max(0, Math.min(1, region.y));
  const width = Math.max(0, Math.min(1 - x, region.width));
  const height = Math.max(0, Math.min(1 - y, region.height));
  return { x, y, width, height };
}

/**
 * Convert PCM to WAV 16-bit Mono (Pure JS/Node)
 */
export function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000, numChannels: number = 1, bitDepth: number = 16): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = numChannels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const fileSize = 36 + dataSize;

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export function estimateAudioDuration(text: string): number {
  return Math.max(1, Math.ceil(text.length / 13));
}
