import { openrouterChat } from "../openrouter.service";
import { API_COSTS, walletService } from "../wallet.service";
import { htmlVideoPromptHistoryService } from "./html-video-prompt-history.service";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoAspectRatio,
  type HtmlVideoResolution,
} from "./html-video-security.service";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_REFERENCE_CONTEXT_LENGTH = 24_000;
const MAX_SOURCE_BYTES = 100 * 1024;
const HTML_VIDEO_DRAFT_TIMEOUT_MS = Math.max(
  Number(process.env.HTML_VIDEO_DRAFT_TIMEOUT_MS) || 120_000,
  30_000
);
const HTML_VIDEO_DRAFT_MAX_TOKENS = Math.max(
  Number(process.env.HTML_VIDEO_DRAFT_MAX_TOKENS) || 16_384,
  4_096
);
const HTML_VIDEO_DRAFT_MAX_RETRIES = Math.max(
  Number(process.env.HTML_VIDEO_DRAFT_MAX_RETRIES) || 1,
  1
);

export type HtmlVideoDraftErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "MODEL_ACCESS_DENIED"
  | "MODEL_REQUEST_REJECTED"
  | "AI_UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "INTERNAL";

const draftErrorMessages: Record<HtmlVideoDraftErrorCode, string> = {
  INSUFFICIENT_BALANCE:
    "Số dư ví không đủ. Vui lòng nạp thêm tiền để tiếp tục.",
  MODEL_ACCESS_DENIED:
    "Model HTML-to-Video chưa được cấp quyền trên OpenRouter. Vui lòng kiểm tra OPENROUTER_API_KEY hoặc quyền truy cập model.",
  MODEL_REQUEST_REJECTED:
    "OpenRouter đã từ chối yêu cầu HTML-to-Video. Vui lòng thử lại với prompt ngắn hơn hoặc kiểm tra model đang cấu hình.",
  AI_UNAVAILABLE:
    "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.",
  INVALID_OUTPUT:
    "AI không tạo được HTML/CSS video hợp lệ. Vui lòng thử lại.",
  INTERNAL:
    "Không thể tạo HTML/CSS video lúc này. Vui lòng thử lại sau.",
};

export class HtmlVideoDraftError extends Error {
  constructor(
    public readonly code: HtmlVideoDraftErrorCode,
    cause?: unknown
  ) {
    super(draftErrorMessages[code], { cause });
    this.name = "HtmlVideoDraftError";
  }
}

const INVALID_DRAFT_MESSAGE = draftErrorMessages.INVALID_OUTPUT;

const videoDimensions: Record<
  HtmlVideoAspectRatio,
  Record<HtmlVideoResolution, readonly [number, number]>
> = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
};

export type HtmlVideoDraftActor = { id: string; companyCode: string };

export type HtmlVideoDraftReferenceSlot = {
  id: string;
  name: string;
  kind: "image";
  role?: "background" | "hero" | "logo" | "overlay";
  includeInVideo?: boolean;
};

export type HtmlVideoDraftInput = {
  prompt: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
  promptHistoryId?: string;
  referenceContext?: string;
  referenceAssets?: HtmlVideoDraftReferenceSlot[];
};

export type HtmlVideoDraft = { html: string; css: string };

export type HtmlVideoDraftDependencies = {
  chat: typeof openrouterChat;
  checkBalance: typeof walletService.checkBalance;
  deductBalance: typeof walletService.deductBalance;
  validateComposition: typeof buildSafeHtmlVideoComposition;
  loadPromptContext?: typeof htmlVideoPromptHistoryService.getContextChain;
};

function walletError(error: unknown) {
  const statusCode =
    typeof error === "object" && error !== null
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  return new HtmlVideoDraftError(
    statusCode === 402 ? "INSUFFICIENT_BALANCE" : "INTERNAL",
    error
  );
}

function normalizePrompt(input: unknown) {
  const prompt = String(input ?? "").trim();
  if (!prompt) {
    throw new Error("Vui lòng nhập mô tả video.");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error("Mô tả video không được vượt quá 4.000 ký tự.");
  }
  return prompt;
}

function normalizeReferenceContext(input: unknown) {
  const context = String(input ?? "").trim();
  return context.slice(0, MAX_REFERENCE_CONTEXT_LENGTH);
}

function normalizeReferenceSlots(input: unknown): HtmlVideoDraftReferenceSlot[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 6).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = String(candidate.id || "").trim();
    const name = String(candidate.name || "Ảnh tham chiếu").trim().slice(0, 180);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return [];
    const role = ["background", "hero", "logo", "overlay"].includes(String(candidate.role))
      ? String(candidate.role) as HtmlVideoDraftReferenceSlot["role"]
      : undefined;
    return [{
      id,
      name,
      kind: "image" as const,
      role,
      includeInVideo: candidate.includeInVideo !== false,
    }];
  });
}

function providerFailureLabel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/OPENROUTER_API_KEY/i.test(message)) return "missing_api_key";
  if (/fetch failed|ECONN|EACCES|ENOTFOUND|ETIMEDOUT|aborted|timed out/i.test(message)) {
    return "network_error";
  }
  return "provider_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractBalancedJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error(INVALID_DRAFT_MESSAGE);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(INVALID_DRAFT_MESSAGE);
}

function parseDraftJson(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(normalized);
  } catch {
    return JSON.parse(extractBalancedJsonObject(normalized));
  }
}

function stripCodeFence(value: string) {
  return value.trim()
    .replace(/^```(?:html|css)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeDraftSources(html: string, css: string) {
  let fragment = stripCodeFence(html);
  let styles = stripCodeFence(css);
  const styleBlocks = [...fragment.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (styleBlocks.length > 0) {
    styles = [styles, ...styleBlocks].filter(Boolean).join("\n");
    fragment = fragment.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  }
  const body = fragment.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) fragment = body[1];
  fragment = fragment
    .replace(/<!doctype\b[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .trim();
  styles = styles
    .replace(/^<style\b[^>]*>/i, "")
    .replace(/<\/style>$/i, "")
    .trim();
  return { html: fragment, css: styles };
}

const modelAllowedTags = new Set([
  "article", "aside", "b", "blockquote", "br", "code", "div", "em",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5",
  "h6", "header", "hr", "i", "li", "main", "ol", "p", "pre", "section",
  "small", "span", "strong", "sub", "sup", "time", "u", "ul",
]);
const modelAllowedAttributes = new Set([
  "id", "class", "role", "title", "aria-label", "aria-hidden",
  "data-media-slot",
]);

function escapeModelAttribute(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] || character);
}

function repairModelHtml(html: string) {
  let fragment = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|svg|math|canvas)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(img|input|link|meta|base|source|track|video|audio)\b[^>]*\/?>/gi, "")
    .replace(/<\/?(?:button|a)\b/gi, (tag) => tag.startsWith("</") ? "</span" : "<span");

  fragment = fragment.replace(/<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi, (tag, name: string, attributes: string) => {
    const lowerName = name.toLowerCase();
    if (!modelAllowedTags.has(lowerName)) return "";
    if (tag.startsWith("</")) return `</${lowerName}>`;
    const safeAttributes = [...attributes.matchAll(/\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
      .filter((match) => modelAllowedAttributes.has(match[1].toLowerCase()))
      .map((match) => {
        const value = match[2] ?? match[3] ?? match[4];
        return value === undefined
          ? ` ${match[1].toLowerCase()}`
          : ` ${match[1].toLowerCase()}="${escapeModelAttribute(value)}"`;
      })
      .join("");
    return `<${lowerName}${safeAttributes}>`;
  });
  return fragment.trim();
}

function parseDraft(text: unknown): HtmlVideoDraft {
  if (typeof text !== "string") {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  let value: unknown;
  try {
    value = parseDraftJson(text);
  } catch {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  const record = [
    value,
    isRecord(value) ? value.data : null,
    isRecord(value) ? value.result : null,
    isRecord(value) ? value.composition : null,
  ].find((candidate) => isRecord(candidate) && typeof candidate.html === "string" && typeof candidate.css === "string");
  if (!isRecord(record)) {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  const normalizedSources = normalizeDraftSources(
    String(record.html),
    String(record.css)
  );
  const html = repairModelHtml(normalizedSources.html);
  const css = normalizedSources.css;
  if (
    !html ||
    Buffer.byteLength(html, "utf8") > MAX_SOURCE_BYTES ||
    Buffer.byteLength(css, "utf8") > MAX_SOURCE_BYTES
  ) {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }
  return { html, css };
}

function buildSystemPrompt(input: HtmlVideoDraftInput) {
  const [width, height] = videoDimensions[input.aspectRatio][input.resolution];
  return [
    "Generate a single safe, editable HTML/CSS video composition.",
    `Target canvas: ${width}x${height}px (${input.aspectRatio}, ${input.resolution}); duration: ${input.durationSeconds} seconds.`,
    "Return only a JSON object with exactly the html and css string fields. The html value must be an HTML fragment only (no doctype, html, head, body, style, or markdown fences); css must contain the styles separately. Use supported HTML and CSS only; do not include JavaScript.",
    "This must be an animated video composition, not a static poster: include a clear opening, main message sequence, and final CTA using CSS @keyframes across the full requested duration.",
    "Use the same full-duration animation timeline for scene elements and encode their timing in keyframe percentages; avoid per-element animation-delay so preview seeking and final rendering show the same frame.",
    "Keep the HTML/CSS concise and self-contained so the complete JSON response fits comfortably within the model output limit.",
    "Make the layout fill the target canvas, keep overflow controlled, and ensure text remains readable at the requested aspect ratio.",
    "Use a clear visual hierarchy with separate regions for eyebrow, headline, supporting copy, and CTA. Never place two text blocks in the same position or let text overlap; use normal flow, flex, or grid with explicit gaps and safe margins.",
    "Avoid a plain black background unless the user explicitly asks for it or the visual reference is predominantly black. Prefer a deliberate background treatment and a restrained palette that follows the supplied brief.",
    "Default art direction: make the composition feel premium and intentionally designed, not like a plain text poster. Use at least three coordinated visual layers (background treatment, content surface or frame, and subtle accent/decorative shapes) with gradients, borders, soft shadows, or glow used sparingly.",
    "Use one focal headline of no more than two lines, one short supporting message, and one clear CTA. Keep typography strongly scaled, readable, and balanced with generous padding; never use giant all-caps text, default browser styles, or a stack of competing headlines.",
    "Build the scene inside a centered safe frame with 8–12% outer padding. Make the final composition feel complete at the requested aspect ratio: no empty black canvas, no clipped text, no accidental horizontal overflow, and no element that depends on a missing external asset.",
    "Before returning the JSON, silently self-check visual quality: the background is intentional, the text hierarchy is legible, every scene has a clear focal point, the CTA has enough contrast, and no text or decorative layer overlaps another.",
    "Banned constructs: scripts, event handlers, inline styles, URLs, external assets, external fonts, direct image tags, SVG, MathML, iframes, forms, style tags, doctype, html/head/body wrappers, @import, url(...), and CSS expressions.",
    "When image reference slots are supplied, use a slot only when the reference recommendation says it should appear in the video. Insert it exactly once as <div data-media-slot=\"slot-id\"></div>; never invent slot IDs and never write an img tag or URL yourself.",
    "Keep essential text and logos inside a safe margin, use high contrast and readable font sizes, and keep the final intended state visible for the end of the video.",
    "Do not invent prices, discounts, factual claims, guarantees, contact details, or URLs that are not present in the user request.",
  ].join("\n");
}

function buildGenerationPrompt(prompt: string, previousPrompts: string[]) {
  if (previousPrompts.length === 0) return prompt;
  return [
    "LỊCH SỬ PROMPT CỦA CHÍNH NGƯỜI DÙNG — dùng để duy trì chủ đề, phong cách và các quyết định trước đó:",
    previousPrompts.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    "YÊU CẦU HIỆN TẠI — đây là chỉ dẫn có ưu tiên cao nhất:",
    prompt,
  ].join("\n\n");
}

function buildGenerationPromptWithContext(
  prompt: string,
  previousPrompts: string[],
  referenceContext: string,
  referenceAssets: HtmlVideoDraftReferenceSlot[]
) {
  if (!referenceContext && referenceAssets.length === 0) {
    return buildGenerationPrompt(prompt, previousPrompts);
  }
  const sections: string[] = [];
  if (previousPrompts.length > 0) {
    sections.push(
      [
        "PROMPT HISTORY — preserve the user's previous topic and style decisions:",
        previousPrompts.map((item, index) => `${index + 1}. ${item}`).join("\n"),
      ].join("\n")
    );
  }
  if (referenceContext) {
    sections.push(
      [
        "VISUAL/DOCUMENT REFERENCE CONTEXT — extracted from the files attached by the user:",
        referenceContext,
        "Treat a video reference in this context as a reusable HTML/CSS template, not as a fixed theme. Preserve its composition skeleton: scene/region structure, relative timing, layer order, safe zones, typography hierarchy, subtitle/CTA placement, transitions, and motion language. Let the current user request control the new theme, colors, text, images, and factual content. Keep every text block in its own non-overlapping region. Never embed the original file directly; recreate the template with safe HTML/CSS.",
      ].join("\n")
    );
  }
  if (referenceAssets.length > 0) {
    sections.push(
      [
        "AVAILABLE IMAGE REFERENCE SLOTS:",
        referenceAssets.map((asset) =>
          `slot=${asset.id}; name=${asset.name}; role=${asset.role || "hero"}; recommended_include=${asset.includeInVideo !== false ? "yes" : "no"}`
        ).join("\n"),
        "For recommended_include=no, keep the image as style/content reference only and do not add its slot. For recommended_include=yes, add the slot once in the most useful, non-overlapping region of the composition.",
      ].join("\n")
    );
  }
  sections.push(
    [
      "CURRENT USER REQUEST — highest priority:",
      prompt,
    ].join("\n")
  );
  return sections.join("\n\n");
}

export function createHtmlVideoDraftService(
  dependencies: HtmlVideoDraftDependencies
) {
  return {
    async generate(
      actor: HtmlVideoDraftActor,
      input: HtmlVideoDraftInput
    ): Promise<HtmlVideoDraft> {
      const prompt = normalizePrompt(input.prompt);
      const systemPrompt = buildSystemPrompt(input);

      try {
        await dependencies.checkBalance(actor.id, API_COSTS.AI_HTML_CHAT);
      } catch (error) {
        throw walletError(error);
      }

      const referenceContext = normalizeReferenceContext(input.referenceContext);
      const referenceAssets = normalizeReferenceSlots(input.referenceAssets);
      let previousPrompts: string[] = [];
      if (input.promptHistoryId && dependencies.loadPromptContext) {
        try {
          const history = await dependencies.loadPromptContext(
            actor,
            input.promptHistoryId
          );
          const historyWithoutCurrent =
            history.at(-1)?.prompt.trim() === prompt ? history.slice(0, -1) : history;
          previousPrompts = historyWithoutCurrent
            .slice(-6)
            .map((item) => item.prompt.trim().slice(0, 2_000))
            .filter(Boolean);
        } catch (error) {
          throw new HtmlVideoDraftError("INTERNAL", error);
        }
      }
      const generationPrompt = buildGenerationPromptWithContext(
        prompt,
        previousPrompts,
        referenceContext,
        referenceAssets
      );

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let safe: ReturnType<HtmlVideoDraftDependencies["validateComposition"]>;
        let response: Awaited<ReturnType<HtmlVideoDraftDependencies["chat"]>>;
        const attemptPrompt = attempt === 0
          ? generationPrompt
          : [
              generationPrompt,
              "RETRY CORRECTION: Your previous response was rejected. Return one valid JSON object with exactly html and css. Keep html as a safe fragment with only semantic tags such as main, section, div, span, p, h1-h6, and no markdown, wrappers, style attributes, style tags, scripts, buttons, links, images, SVG, URLs, or unsupported tags; put all styling in css.",
            ].join("\n\n");
        try {
          response = await dependencies.chat({
            model:
              process.env.HTML_VIDEO_MODEL ||
              process.env.GEMINI_MODEL ||
              "google/gemini-2.5-flash",
            temperature: 0.35,
            jsonMode: true,
            responseSchema: { html: "string", css: "string" },
            maxRetries: HTML_VIDEO_DRAFT_MAX_RETRIES,
            maxTokens: HTML_VIDEO_DRAFT_MAX_TOKENS,
            timeoutMs: HTML_VIDEO_DRAFT_TIMEOUT_MS,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: attemptPrompt },
            ],
          });
        } catch (error) {
          const providerStatus =
            typeof error === "object" && error !== null
              ? Number((error as { status?: unknown }).status)
              : 0;
          console.error("[HTML Video] OpenRouter draft request failed", {
            status: providerStatus || undefined,
            reason: providerFailureLabel(error),
          });
          if (providerFailureLabel(error) === "missing_api_key") {
            throw new HtmlVideoDraftError("MODEL_ACCESS_DENIED", error);
          }
          if (providerStatus === 401 || providerStatus === 403) {
            throw new HtmlVideoDraftError("MODEL_ACCESS_DENIED", error);
          }
          if (providerStatus === 400) {
            throw new HtmlVideoDraftError("MODEL_REQUEST_REJECTED", error);
          }
          throw new HtmlVideoDraftError("AI_UNAVAILABLE", error);
        }
        try {
          const draft = parseDraft(response.text);
          safe = dependencies.validateComposition({
            ...draft,
            durationSeconds: input.durationSeconds,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
          });
          if (!safe.sanitizedHtml.trim()) {
            throw new Error(INVALID_DRAFT_MESSAGE);
          }
        } catch (error) {
          console.warn("[HTML Video] Draft output rejected", {
            attempt: attempt + 1,
            reason: error instanceof Error ? error.message : "invalid_output",
          });
          continue;
        }

        try {
          await dependencies.deductBalance(
            actor.id,
            API_COSTS.AI_HTML_CHAT,
            "Chi phí tạo HTML/CSS video bằng AI"
          );
        } catch (error) {
          throw walletError(error);
        }
        return { html: safe.sanitizedHtml, css: safe.sanitizedCss };
      }

      throw new HtmlVideoDraftError("INVALID_OUTPUT");
    },
  };
}

export const htmlVideoDraftService = createHtmlVideoDraftService({
  chat: openrouterChat,
  checkBalance: walletService.checkBalance.bind(walletService),
  deductBalance: walletService.deductBalance.bind(walletService),
  validateComposition: buildSafeHtmlVideoComposition,
  loadPromptContext: htmlVideoPromptHistoryService.getContextChain.bind(
    htmlVideoPromptHistoryService
  ),
});
