import { openrouterChat } from "../openrouter.service";
import { API_COSTS, walletService } from "../wallet.service";
import { htmlVideoPromptHistoryService } from "./html-video-prompt-history.service";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoAspectRatio,
  type HtmlVideoResolution,
} from "./html-video-security.service";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_PRIMARY_PROMPT_LENGTH = 23_000;
const MAX_REFERENCE_CONTEXT_LENGTH = 24_000;
const MAX_GENERATION_CONTEXT_LENGTH = 42_000;
const MAX_HISTORY_CONTEXT_LENGTH = 6_000;
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
  primaryPromptContext?: string;
  primaryPromptFileName?: string;
  referenceAssets?: HtmlVideoDraftReferenceSlot[];
};

export type HtmlVideoDraft = {
  html: string;
  css: string;
  voiceScript?: string;
};

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

function normalizePrimaryPromptContext(input: unknown) {
  const context = String(input ?? "").trim();
  if (context.length > MAX_PRIMARY_PROMPT_LENGTH) {
    throw new Error("Nội dung prompt chính không được vượt quá 23.000 ký tự.");
  }
  return context;
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

function normalizeVoiceScript(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 8_000) : "";
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

function assertVisualQuality(
  html: string,
  css: string,
  input: Pick<HtmlVideoDraftInput, "aspectRatio" | "resolution">
) {
  const visibleText = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!visibleText) {
    throw new Error("Generated composition has no visible text.");
  }
  if (/\bheight\s*:\s*(?:100vh|100dvh)\b/i.test(css)) {
    throw new Error("Generated composition uses a viewport-sized inner panel.");
  }
  if (
    /\boverflow(?:-x|-y)?\s*:\s*(?:auto|scroll)\b/i.test(css) ||
    /scroll-snap(?:-type|-align)?\s*:/i.test(css)
  ) {
    throw new Error("Generated composition must be a fixed slide deck, not a scrollable page.");
  }
  if (/\btranslateY\s*\(/i.test(css)) {
    throw new Error("Generated composition must use horizontal or fade transitions, not vertical movement.");
  }
  if (/\bscene-deck\b/i.test(html)) {
    const [, height] = videoDimensions[input.aspectRatio][input.resolution];
    const headlineMinimum = Math.max(64, Math.round(height * 0.045));
    const readableMinimum = Math.max(24, Math.round(height * 0.014));
    const fontSizes = [...css.matchAll(/font-size\s*:\s*([^;}]+)/gi)]
      .flatMap((match) => [...match[1].matchAll(/(\d+(?:\.\d+)?)px\b/gi)])
      .map((match) => Number(match[1]));
    if (
      fontSizes.length === 0 ||
      Math.max(...fontSizes) < headlineMinimum ||
      fontSizes.some((size) => size < readableMinimum)
    ) {
      throw new Error("Generated scene deck uses typography that is too small for the target canvas.");
    }
    const visualSignals = [
      /(?:linear|radial|conic)-gradient\s*\(/i,
      /box-shadow\s*:/i,
      /border-radius\s*:/i,
      /::before|::after/i,
      /border\s*:/i,
      /filter\s*:/i,
    ].filter((pattern) => pattern.test(css)).length;
    if (visualSignals < 3) {
      throw new Error("Generated scene deck needs a richer theme and background treatment.");
    }
  }
  for (const match of css.matchAll(/[^{}]+\{([^{}]*)\}/g)) {
    const declarations = match[1];
    if (
      /(?:min-)?height\s*:\s*100%\b/i.test(declarations) &&
      /background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?)\b/i.test(declarations)
    ) {
      throw new Error("Generated composition contains a full-height blank white panel.");
    }
  }
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
  const voiceScript = normalizeVoiceScript(record.voiceScript);
  return voiceScript ? { html, css, voiceScript } : { html, css };
}

function buildRuntimeVideoContract(input: HtmlVideoDraftInput) {
  const [width, height] = videoDimensions[input.aspectRatio][input.resolution];
  return [
    "RUNTIME HTML-TO-VIDEO SKILL: Apply this production contract to the user's request before generating the composition.",
    "The final deliverable is a rendered MP4, not an HTML page, screenshot, or HTML-to-image export. HTML/CSS is only the safe intermediate composition used by preview and the backend renderer.",
    `Normalize the request internally into ordered content units, source facts, scene purposes, on-screen text, narration, and time ranges for the ${width}x${height}px canvas and ${input.durationSeconds}-second duration. Treat the current user request and authoritative prompt file as the source of truth; preserve exact phrases and omit unsupported facts rather than inventing them.`,
    "Use one content unit per full-canvas scene for multi-item requests. Build an explicit scene-deck/scene structure, keep scenes in source order, and keep each scene readable for a real hold interval. Use one shared full-duration timeline so preview seeking and final rendering show the same frame.",
    "Design for social video on a phone: use a coherent subject-driven theme, a layered background, a contrasting content surface, restrained accents, safe margins, and explicit canvas-scaled typography. Make the key phrase dominant and never hide meaning in tiny text or a generic white card.",
    "Create one continuous, context-matched voiceScript in the request language with one consistent narrator. Keep visible text, narration, scene order, and duration semantically aligned. Do not add speaker labels, timestamps, stage directions, sound effects, or claims absent from the source.",
    "Before returning JSON, silently check source fidelity, scene order, timing coverage, readability, contrast, no overlap, no scrolling, no vertical page transition, no external asset dependency, and production-safe HTML/CSS. Return only the required structured fields.",
  ].join("\n");
}

function buildSystemPrompt(input: HtmlVideoDraftInput) {
  const [width, height] = videoDimensions[input.aspectRatio][input.resolution];
  return [
    buildRuntimeVideoContract(input),
    "Generate a single safe, editable HTML/CSS video composition.",
    `Target canvas: ${width}x${height}px (${input.aspectRatio}, ${input.resolution}); duration: ${input.durationSeconds} seconds.`,
    "Return only a JSON object with exactly the html, css, and voiceScript string fields. The html value must be an HTML fragment only (no doctype, html, head, body, style, or markdown fences); css must contain the styles separately. Use supported HTML and CSS only; do not include JavaScript.",
    "voiceScript is the single continuous narration for the final video. Derive it from the user's request and the visual story you create. Keep it concise enough to fit the requested duration at a natural speaking pace, preserve factual details, and keep the same language as the request while preserving important English phrases exactly.",
    "voiceScript must contain spoken words only: no labels such as Voice or Narrator, no timestamps, no scene directions, no markdown, no multiple speakers, and no sound effects. Use one consistent narrator throughout the video.",
    "This must be an animated video composition, not a static poster: include a clear opening, main message sequence, and final CTA using CSS @keyframes across the full requested duration.",
    "Use the same full-duration animation timeline for scene elements and encode their timing in keyframe percentages; avoid per-element animation-delay so preview seeking and final rendering show the same frame.",
    "Keep the HTML/CSS concise and self-contained so the complete JSON response fits comfortably within the model output limit.",
    "Make the layout fill the target canvas, keep overflow controlled, and ensure text remains readable at the requested aspect ratio.",
    "SLIDE/SCENE CONTRACT: Treat every distinct item, sentence, lesson point, product feature, step, or story beat as its own full-canvas slide when the request contains more than one item. Build a fixed scene deck inside the root using class names scene-deck for the container and scene for every slide: one scene element per item, with the scene deck and every scene using position:relative/absolute, inset:0 or an equivalent full-canvas layout, overflow:hidden, and no page scroll. Show scenes one at a time in the user's order with a short horizontal slide or opacity crossfade; never use vertical scrolling, a tall column of scenes, top-to-bottom page flow, or translateY as the main scene transition. Each scene may use normal flex/grid flow internally for its own text, but the deck must never stack scenes in normal document flow.",
    "For multi-item educational content, use a compact sequence such as opening/title scene, one dedicated scene per item, then an optional closing/CTA scene. Keep each scene visually complete and balanced within the safe frame; do not squeeze multiple item cards into one long poster. Use one shared full-duration @keyframes timeline for all scenes so preview seeking and final rendering agree. Give each scene a visible hold interval and calculate non-overlapping percentage ranges across the requested duration; avoid per-element animation-delay.",
    "Use one stable root scene that fills the canvas with a safe padding of 8% to 12%. Normal flow applies to the content inside one scene only. Decorative shapes may be position:absolute, while scene containers must be isolated full-canvas layers.",
    "Use a clear visual hierarchy with separate regions for eyebrow, headline, supporting copy, and CTA. Never place two text blocks in the same position or let text overlap; use normal flow, flex, or grid with explicit gaps and safe margins.",
    "Every visible text element must remain inside the safe frame with enough contrast against its immediate background. Keep the headline to at most two lines and keep supporting copy short enough to fit without clipping.",
    "Do not create a giant empty white card, blank placeholder, empty image frame, loading panel, or full-height inner rectangle. Inner cards must have height:auto and contain visible content; never use min-height:100%, height:100vh, height:100dvh, or a full-canvas white panel for an inner element.",
    "Do not put essential text at negative offsets, outside the canvas, behind another layer, or only in an animation state whose first frame is invisible. The first and last rendered frames must both contain a complete readable composition.",
    `TYPOGRAPHY SCALE: This is a fixed ${width}x${height}px canvas, so use explicit pixel font sizes instead of tiny relative text. The dominant headline/phrase must be at least ${Math.max(64, Math.round(height * 0.045))}px, supporting text at least ${Math.max(30, Math.round(height * 0.02))}px, and the smallest label at least ${Math.max(24, Math.round(height * 0.014))}px. Let the main phrase occupy roughly 60% to 86% of the canvas width; do not leave a large empty canvas around small centered text.`,
    "Avoid a plain white, near-white, or flat gray page unless the user explicitly asks for it. Choose one coherent theme tied to the subject, then build it with a strong multi-stop gradient, a contrasting content surface, and two or more restrained CSS accents such as blurred circles, geometric bands, borders, texture-like patterns, or soft shadows. Keep the palette intentional and high contrast; do not mix unrelated colors.",
    "Default art direction: make the composition feel premium and intentionally designed, not like a plain text poster. Use at least three coordinated visual layers (background treatment, content surface or frame, and subtle accent/decorative shapes) with gradients, borders, soft shadows, or glow used visibly but sparingly. The background must still look designed when text is removed.",
    "Use one focal headline of no more than two lines, one short supporting message, and one clear CTA. For teaching slides, make the phrase the largest element, pronunciation clearly secondary, meaning prominent, and explanation concise. Keep typography strongly scaled, readable, and balanced with generous padding; never render every text block at the same small size, use giant all-caps text, default browser styles, or a stack of competing headlines.",
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
  referenceAssets: HtmlVideoDraftReferenceSlot[],
  primaryPromptContext: string,
  primaryPromptFileName: string
) {
  if (!primaryPromptContext && !referenceContext && referenceAssets.length === 0) {
    return buildGenerationPrompt(prompt, previousPrompts);
  }
  const historyText = previousPrompts
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const boundedHistoryText = historyText.length > MAX_HISTORY_CONTEXT_LENGTH
    ? historyText.slice(-MAX_HISTORY_CONTEXT_LENGTH)
    : historyText;
  const historySection = boundedHistoryText
    ? [
      "PROMPT HISTORY — preserve the user's previous topic and style decisions:",
      boundedHistoryText,
    ].join("\n")
    : "";
  const primaryPromptSection = primaryPromptContext
    ? [
      "PRIMARY USER PROMPT FILE — this is the complete authoritative request from the user:",
      `File: ${primaryPromptFileName}`,
      "Use every relevant requirement in this file. Do not summarize, omit, or treat it as optional reference material.",
      primaryPromptContext,
    ].join("\n")
    : "";
  const assetSection = referenceAssets.length > 0
    ? [
      "AVAILABLE IMAGE REFERENCE SLOTS:",
      referenceAssets.map((asset) =>
        `slot=${asset.id}; name=${asset.name}; role=${asset.role || "hero"}; recommended_include=${asset.includeInVideo !== false ? "yes" : "no"}`
      ).join("\n"),
      "For recommended_include=no, keep the image as style/content reference only and do not add its slot. For recommended_include=yes, add the slot once in the most useful, non-overlapping region of the composition.",
    ].join("\n")
    : "";
  const currentRequestSection = [
    "CURRENT USER REQUEST — highest priority:",
    prompt,
  ].join("\n");
  const buildReferenceSection = (context: string) => [
    "VISUAL/DOCUMENT REFERENCE CONTEXT — extracted from the files attached by the user:",
    context,
    "Treat a video reference in this context as a reusable HTML/CSS template, not as a fixed theme. Preserve its composition skeleton: scene/region structure, relative timing, layer order, safe zones, typography hierarchy, subtitle/CTA placement, transitions, and motion language. Let the current user request control the new theme, colors, text, images, and factual content. Keep every text block in its own non-overlapping region. Never embed the original file directly; recreate the template with safe HTML/CSS.",
  ].join("\n");
  const referencePlaceholder = "__REFERENCE_CONTEXT__";
  const templateSections = [
    historySection,
    primaryPromptSection,
    referenceContext ? buildReferenceSection(referencePlaceholder) : "",
    assetSection,
    currentRequestSection,
  ].filter(Boolean);
  const availableReferenceLength = Math.max(
    0,
    MAX_GENERATION_CONTEXT_LENGTH - templateSections.join("\n\n").length + referencePlaceholder.length
  );
  const boundedReferenceContext = referenceContext.slice(0, availableReferenceLength);
  const sections: string[] = [];
  if (historySection) sections.push(historySection);
  if (primaryPromptSection) sections.push(primaryPromptSection);
  if (boundedReferenceContext) {
    sections.push(buildReferenceSection(boundedReferenceContext));
  }
  if (referenceAssets.length > 0) {
    sections.push(assetSection);
  }
  sections.push(currentRequestSection);
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
      const primaryPromptContext = normalizePrimaryPromptContext(input.primaryPromptContext);
      const primaryPromptFileName = String(input.primaryPromptFileName || "prompt-day-du.txt")
        .trim()
        .slice(0, 180) || "prompt-day-du.txt";
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
            history.at(-1)?.id === input.promptHistoryId || history.at(-1)?.prompt.trim() === prompt
              ? history.slice(0, -1)
              : history;
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
        referenceAssets,
        primaryPromptContext,
        primaryPromptFileName
      );

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let safe: ReturnType<HtmlVideoDraftDependencies["validateComposition"]>;
        let response: Awaited<ReturnType<HtmlVideoDraftDependencies["chat"]>>;
        const attemptPrompt = attempt === 0
          ? generationPrompt
          : [
              generationPrompt,
              "RETRY CORRECTION: Your previous response was rejected. Return one valid JSON object with exactly html, css, and voiceScript. Keep html as a safe fragment with only semantic tags such as main, section, div, span, p, h1-h6, and no markdown, wrappers, style attributes, style tags, scripts, buttons, links, images, SVG, URLs, or unsupported tags; put all styling in css. Keep voiceScript as one concise spoken narration. If the request contains multiple items, use one full-canvas scene per item with class scene inside a fixed position:absolute scene-deck and overflow:hidden; do not create a scrollable column, vertical movement, or a top-to-bottom page layout.",
            ].join("\n\n");
        try {
          response = await dependencies.chat({
            model:
              process.env.HTML_VIDEO_MODEL ||
              process.env.GEMINI_MODEL ||
              "google/gemini-2.5-flash",
            temperature: 0.35,
            jsonMode: true,
            responseSchema: { html: "string", css: "string", voiceScript: "string" },
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
        let voiceScript = "";
        try {
          const draft = parseDraft(response.text);
          voiceScript = draft.voiceScript || "";
          safe = dependencies.validateComposition({
            ...draft,
            durationSeconds: input.durationSeconds,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
          });
          assertVisualQuality(safe.sanitizedHtml, safe.sanitizedCss, input);
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
        return {
          html: safe.sanitizedHtml,
          css: safe.sanitizedCss,
          ...(voiceScript ? { voiceScript } : {}),
        };
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
