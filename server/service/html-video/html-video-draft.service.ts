import { openrouterChat } from "../openrouter.service";
import { API_COSTS, walletService } from "../wallet.service";
import { htmlVideoPromptHistoryService } from "./html-video-prompt-history.service";
import type { HtmlVideoPipelineMetadata } from "../../interface/html-video-pipeline.interface";
import {
  HtmlVideoPipelineProviderError,
  runHtmlVideoStructuredPipeline,
  type HtmlVideoPipelineCheckpoint,
  type HtmlVideoPipelineStage,
} from "./html-video-pipeline.service";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoAspectRatio,
  type HtmlVideoResolution,
} from "./html-video-security.service";
import { classifyHtmlVideoRevisionIntent } from "./html-video-revision.service";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_PRIMARY_PROMPT_LENGTH = 23_000;
const MAX_REFERENCE_CONTEXT_LENGTH = 24_000;
const MAX_GENERATION_CONTEXT_LENGTH = 42_000;
const MAX_HISTORY_CONTEXT_LENGTH = 6_000;
const MAX_SOURCE_BYTES = 100 * 1024;
export type HtmlVideoDraftErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "MODEL_ACCESS_DENIED"
  | "MODEL_REQUEST_REJECTED"
  | "AI_UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "LEGACY_REVISION_UNAVAILABLE"
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
  LEGACY_REVISION_UNAVAILABLE:
    "Video cũ không có dữ liệu scene/timeline để chỉnh sửa an toàn. Hãy yêu cầu dựng lại toàn bộ hoặc tạo video mới.",
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
  width?: number;
  height?: number;
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
  editSource?: {
    html: string;
    css: string;
    voiceScript?: string;
    snapshotHash?: string;
    pipeline?: HtmlVideoPipelineMetadata;
  };
};

export type HtmlVideoDraft = {
  html: string;
  css: string;
  voiceScript?: string;
  pipeline?: HtmlVideoPipelineMetadata;
};

export type HtmlVideoDraftDependencies = {
  chat: typeof openrouterChat;
  checkBalance: typeof walletService.checkBalance;
  deductBalance: typeof walletService.deductBalance;
  validateComposition: typeof buildSafeHtmlVideoComposition;
  loadPromptContext?: typeof htmlVideoPromptHistoryService.getContextChain;
};

export type HtmlVideoDraftGenerateOptions = {
  billingIdempotencyKey?: string;
  checkpoint?: HtmlVideoPipelineCheckpoint;
  onPipelineStage?: (stage: HtmlVideoPipelineStage) => void | Promise<void>;
  onPipelineCheckpoint?: <K extends keyof HtmlVideoPipelineCheckpoint>(
    key: K,
    value: NonNullable<HtmlVideoPipelineCheckpoint[K]>
  ) => void | Promise<void>;
  onPipelineCheckpointReset?: (
    keys: Array<keyof HtmlVideoPipelineCheckpoint>
  ) => void | Promise<void>;
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

function repairModelCss(css: string): string {
  let styles = css
    .replace(/<\/?style\b[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import\b[^;]*;/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/\btranslateY\s*\(/gi, "translateX(")
    .replace(/\b((?:min-|max-)?height)\s*:\s*100(?:d|s|l)?vh\b/gi, "$1:100%")
    .replace(/\b((?:min-|max-)?width)\s*:\s*100(?:d|s|l)?vw\b/gi, "$1:100%")
    .replace(/\\/g, "");

  styles = styles.replace(/@(media|supports|property|container|scope|layer)\b[^{]*\{([\s\S]*?\})\s*\}/gi, "$2");
  styles = styles.replace(/@(media|supports|property|container|scope|layer)\b[^{]*\{/gi, "");

  return styles.trim();
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
  styles = repairModelCss(styles);
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

function explicitStoryboardSceneCount(context: string) {
  return [...context.matchAll(/(?:^|\n)\s*(?:#{1,6}\s*)?SCENE\s+\d{1,3}\b/gi)].length;
}

function storyboardSceneElements(html: string) {
  return [...html.matchAll(/<[a-z][^>]*\bclass=["']([^"']*)["'][^>]*>/gi)]
    .filter((match) => match[1].split(/\s+/).includes("scene"));
}

function assertStoryboardQuality(
  html: string,
  voiceScript: string,
  primaryPromptContext: string,
  durationSeconds: number
) {
  const expectedSceneCount = explicitStoryboardSceneCount(primaryPromptContext);
  if (expectedSceneCount < 2) return;
  if (!/\bscene-deck\b/i.test(html)) {
    throw new Error("Generated storyboard must use a fixed scene deck.");
  }
  const actualSceneCount = storyboardSceneElements(html).length;
  if (actualSceneCount !== expectedSceneCount) {
    throw new Error(`Generated storyboard must contain exactly ${expectedSceneCount} scenes.`);
  }
  if (!voiceScript.trim()) {
    throw new Error("Generated storyboard must include one continuous voiceScript.");
  }
  const wordCount = voiceScript.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > Math.ceil(durationSeconds * 2.5)) {
    throw new Error("Generated voiceScript is too long for the requested duration.");
  }
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
      Math.max(...fontSizes) < headlineMinimum
    ) {
      throw new Error("Generated scene deck uses typography that is too small for the target canvas.");
    }
    const hasReadableSupportingText = fontSizes.some((size) => size >= readableMinimum);
    if (!hasReadableSupportingText) {
      throw new Error("Generated scene deck has no readable supporting typography.");
    }
    const visualSignals = [
      /(?:linear|radial|conic)-gradient\s*\(/i,
      /box-shadow\s*:/i,
      /border-radius\s*:/i,
      /::before|::after/i,
      /border\s*:/i,
      /filter\s*:/i,
    ].filter((pattern) => pattern.test(css)).length;
    if (visualSignals < 2) {
      throw new Error("Generated scene deck needs a richer theme and background treatment.");
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

export function buildSystemPrompt(input: HtmlVideoDraftInput) {
  const [width, height] = videoDimensions[input.aspectRatio][input.resolution];
  const explicitSceneCount = explicitStoryboardSceneCount(normalizePrimaryPromptContext(input.primaryPromptContext));
  return [
    buildRuntimeVideoContract(input),
    "Generate a single safe, editable HTML/CSS video composition.",
    `Target canvas: ${width}x${height}px (${input.aspectRatio}, ${input.resolution}); duration: ${input.durationSeconds} seconds.`,
    `VOICE LENGTH: Write approximately ${Math.max(1, Math.round(input.durationSeconds * 2.5))} spoken words for this ${input.durationSeconds}-second video at a natural pace; never narrate the full production prompt or add stage directions.`,
    explicitSceneCount >= 2
      ? `EXPLICIT STORYBOARD CONTRACT: The authoritative request contains exactly ${explicitSceneCount} explicit SCENE headings. Create exactly ${explicitSceneCount} elements whose class list contains the token scene inside one scene-deck, in the exact source order. Do not add an extra intro, outro, or summary scene. Preserve the requested scene timing and use the same product/reference slot inside each scene that needs the product; never turn the product into a small standalone card.`
      : "",
    "Return only a JSON object with exactly the html, css, and voiceScript string fields. The html value must be an HTML fragment only (no doctype, html, head, body, style, or markdown fences); css must contain the styles separately. Use supported HTML and CSS only; do not include JavaScript.",
    "voiceScript is the single continuous narration for the final video. STRICT SCENE-VOICE SYNCHRONIZATION: The voice narration must synchronize 100% with the visual progression of the scene deck. When a scene is visible, voiceScript must narrate the exact subject and on-screen text of that scene — never narrate points out of order, ahead of time, or after the slide has already passed. Keep the voice pace at ~2.2-2.5 words per second matching the scene duration.",
    "voiceScript must contain spoken words only: no labels such as Voice or Narrator, no timestamps, no scene directions, no markdown, no multiple speakers, and no sound effects. Use one consistent narrator throughout the video.",
    "This must be an animated video composition, not a static poster: include dynamic CSS @keyframes animations for headline entrance, supporting copy reveal, CTA breathing pulse, and gentle background accents across the video.",
    "MOTION & ANIMATION PATTERNS: Bring elements to life with smooth cubic-bezier / ease-out curves: 1) Eyebrow/Headline/Body entrance: translateX(-24px) or opacity fade-in with cubic-bezier(0.16, 1, 0.3, 1); 2) CTA button: gentle breathing pulse scale(1.05) and box-shadow glow; 3) Background orbs/shapes: slow floating translation; 4) Hero media: subtle entrance zoom-in.",
    "Keep the HTML/CSS concise and self-contained so the complete JSON response fits comfortably within the model output limit.",
    "Make the layout fill the target canvas, keep overflow controlled, and ensure text remains readable at the requested aspect ratio.",
    "SLIDE/SCENE CONTRACT: Treat every distinct item, sentence, lesson point, product feature, step, or story beat as its own full-canvas slide when the request contains more than one item. Build a fixed scene deck inside the root using class names scene-deck for the container and scene for every slide: one scene element per item, with the scene deck and every scene using position:relative/absolute, inset:0 or an equivalent full-canvas layout, overflow:hidden, and no page scroll. Show scenes one at a time in the user's order with a short horizontal slide or opacity crossfade; never use vertical scrolling, a tall column of scenes, top-to-bottom page flow, or translateY as the main scene transition. Each scene may use normal flex/grid flow internally for its own text, but the deck must never stack scenes in normal document flow.",
    "TRANSITION QUALITY: Use only a short horizontal translateX(...) motion or opacity crossfade with ease-out/cubic-bezier timing; keep a readable hold interval before and after each transition, and use one shared keyframes timeline rather than independent delays. Never use translateY, scrolling, or a vertical page transition.",
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
    "Banned constructs: scripts, event handlers, inline styles, URLs, external assets, external fonts, direct image tags, SVG, MathML, iframes, forms, style tags, doctype, html/head/body wrappers, @import, @media, url(...), translateY(...), and CSS expressions.",
    "TRANSITIONS & MOVEMENT: For scene transitions and element movement, use only horizontal translateX(...) or opacity crossfade. Never use translateY(...) anywhere in your CSS.",
    "When image reference slots are supplied, use a slot only when the reference recommendation says it should appear in the video. For a storyboard, insert the same slot once inside each scene that needs the product, using <div data-media-slot=\"slot-id\"></div>; otherwise insert it once. Never invent slot IDs and never write an img tag or URL yourself. Give hero media its own bounded, non-overlapping visual region in normal scene flow; never stretch it across the canvas or place headline, supporting text, or CTA on top of the product.",
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
  primaryPromptFileName: string,
  editSource?: HtmlVideoDraftInput["editSource"]
) {
  if (!primaryPromptContext && !referenceContext && referenceAssets.length === 0 && !editSource) {
    return buildGenerationPrompt(prompt, previousPrompts);
  }
  const historyText = previousPrompts
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const boundedHistoryText = historyText.length > MAX_HISTORY_CONTEXT_LENGTH
    ? historyText.slice(-MAX_HISTORY_CONTEXT_LENGTH)
    : historyText;
  const sections: string[] = [];
  if (boundedHistoryText) {
    sections.push([
      "PROMPT HISTORY — preserve the user's previous topic and style decisions:",
      boundedHistoryText,
    ].join("\n"));
  }
  if (primaryPromptContext) {
    sections.push([
      "PRIMARY USER PROMPT FILE — this is the complete authoritative request from the user:",
      `File: ${primaryPromptFileName}`,
      "Use every relevant requirement in this file. Do not summarize, omit, or treat it as optional reference material.",
      primaryPromptContext,
    ].join("\n"));
  }
  if (referenceContext) {
    sections.push([
      "VISUAL/DOCUMENT REFERENCE CONTEXT — extracted from the files attached by the user:",
      referenceContext.slice(0, 12_000),
      "Treat a video reference as a reusable HTML/CSS template. Preserve composition, layer order, safe zones, typography hierarchy, transitions, and motion language while the current request controls new content.",
    ].join("\n"));
  }
  if (referenceAssets.length > 0) {
    sections.push([
      "AVAILABLE IMAGE REFERENCE SLOTS:",
      referenceAssets.map((asset) =>
        `slot=${asset.id}; name=${asset.name}; role=${asset.role || "hero"}; recommended_include=${asset.includeInVideo !== false ? "yes" : "no"}`
      ).join("\n"),
      "Use only recommended slots and never invent an asset ID.",
    ].join("\n"));
  }
  if (editSource) {
    const revisionPayload = JSON.stringify({
      html: editSource.html.slice(0, 9_000),
      css: editSource.css.slice(0, 9_000),
      voiceScript: String(editSource.voiceScript || "").slice(0, 3_000),
      pipeline: editSource.pipeline || null,
    }).slice(0, 24_000);
    sections.push([
      "EXISTING VIDEO REVISION SOURCE — this is the current approved composition, not a loose reference:",
      "Preserve every scene, visual choice, animation, timing decision, and narration that the current edit request does not explicitly change.",
      "Apply the requested changes directly to this composition. Do not redesign or recreate the whole video unless explicitly asked.",
      revisionPayload,
    ].join("\n"));
  }
  sections.push([
    editSource ? "CURRENT EDIT REQUEST — highest priority:" : "CURRENT USER REQUEST — highest priority:",
    prompt,
  ].join("\n"));
  const combined = sections.join("\n\n");
  if (combined.length <= MAX_GENERATION_CONTEXT_LENGTH) return combined;
  return [
    combined.slice(0, MAX_GENERATION_CONTEXT_LENGTH - 8_200),
    "[AUXILIARY CONTEXT BOUNDED]",
    combined.slice(-8_000),
  ].join("\n\n");
}

export function createHtmlVideoDraftService(
  dependencies: HtmlVideoDraftDependencies
) {
  return {
    async generate(
      actor: HtmlVideoDraftActor,
      input: HtmlVideoDraftInput,
      options: HtmlVideoDraftGenerateOptions = {}
    ): Promise<HtmlVideoDraft> {
      const prompt = normalizePrompt(input.prompt);
      if (
        input.editSource
        && !input.editSource.pipeline
        && !classifyHtmlVideoRevisionIntent(prompt).fullRedesign
      ) {
        throw new HtmlVideoDraftError("LEGACY_REVISION_UNAVAILABLE");
      }
      const primaryPromptContext = normalizePrimaryPromptContext(input.primaryPromptContext);
      const primaryPromptFileName = String(input.primaryPromptFileName || "prompt-day-du.txt")
        .trim()
        .slice(0, 180) || "prompt-day-du.txt";
      const systemPrompt = buildRuntimeVideoContract(input);

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
        primaryPromptFileName,
        input.editSource
      );

      let lastRejectionReason = "";
      const pipelineCheckpoint: HtmlVideoPipelineCheckpoint = {
        ...(options.checkpoint || {}),
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let safe: ReturnType<HtmlVideoDraftDependencies["validateComposition"]>;
        let generatedDraft: HtmlVideoDraft;
        const attemptPrompt = attempt === 0
          ? generationPrompt
          : [
            generationPrompt,
            `RETRY CORRECTION: Your previous response was rejected${lastRejectionReason ? `: "${lastRejectionReason}"` : ""}.`,
            "Return one valid JSON object with exactly html, css, and voiceScript.",
            "- Raw CSS only in the 'css' field: DO NOT include <style> tags, @media queries, @import, url(), or backslashes.",
            "- Use width:100% and height:100% inside the fixed canvas; never use vw, vh, dvw, dvh, svw, svh, lvw, or lvh units.",
            "- Never use translateY(...) anywhere in your CSS: use only horizontal translateX(...) or opacity crossfade for animations.",
            "- Keep html as a safe fragment with only semantic tags such as main, section, div, span, p, h1-h6.",
            "- Keep voiceScript as one concise spoken narration.",
            "- If the request contains multiple items, use one full-canvas scene per item with class scene inside a fixed position:absolute scene-deck and overflow:hidden; do not create a scrollable column or vertical movement.",
          ].join("\n\n");
        try {
          const pipelineResult = await runHtmlVideoStructuredPipeline({
            chat: dependencies.chat,
            draftInput: input,
            generationPrompt: [systemPrompt, attemptPrompt].join("\n\n"),
            referenceAssets,
            checkpoint: pipelineCheckpoint,
            onStage: options.onPipelineStage,
            onCheckpoint: async (key, value) => {
              Object.assign(pipelineCheckpoint, { [key]: value });
              await options.onPipelineCheckpoint?.(key, value);
            },
          });
          generatedDraft = pipelineResult.kind === "legacy"
            ? parseDraft(pipelineResult.responseText)
            : {
                html: pipelineResult.html,
                css: pipelineResult.css,
                voiceScript: pipelineResult.voiceScript,
                pipeline: pipelineResult.pipeline,
              };
        } catch (error) {
          if (!(error instanceof HtmlVideoPipelineProviderError)) {
            lastRejectionReason = error instanceof Error ? error.message : "invalid_output";
            console.warn("[HTML Video] Pipeline stage rejected", {
              attempt: attempt + 1,
              reason: lastRejectionReason,
            });
            continue;
          }
          const providerError = error.providerCause;
          const providerStatus =
            typeof providerError === "object" && providerError !== null
              ? Number((providerError as { status?: unknown }).status)
              : 0;
          console.error("[HTML Video] OpenRouter draft request failed", {
            status: providerStatus || undefined,
            reason: providerFailureLabel(providerError),
          });
          if (providerFailureLabel(providerError) === "missing_api_key") {
            throw new HtmlVideoDraftError("MODEL_ACCESS_DENIED", providerError);
          }
          if (providerStatus === 401 || providerStatus === 403) {
            throw new HtmlVideoDraftError("MODEL_ACCESS_DENIED", providerError);
          }
          if (providerStatus === 400) {
            throw new HtmlVideoDraftError("MODEL_REQUEST_REJECTED", providerError);
          }
          throw new HtmlVideoDraftError("AI_UNAVAILABLE", providerError);
        }
        let voiceScript = "";
        try {
          voiceScript = generatedDraft.voiceScript || "";
          safe = dependencies.validateComposition({
            ...generatedDraft,
            durationSeconds: input.durationSeconds,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            ...(generatedDraft.pipeline
              ? { scenePlan: generatedDraft.pipeline.scenePlan }
              : {}),
          });
          assertVisualQuality(safe.sanitizedHtml, safe.sanitizedCss, input);
          assertStoryboardQuality(safe.sanitizedHtml, voiceScript, primaryPromptContext, input.durationSeconds);
          if (!safe.sanitizedHtml.trim()) {
            throw new Error(INVALID_DRAFT_MESSAGE);
          }
        } catch (error) {
          lastRejectionReason = error instanceof Error ? error.message : "invalid_output";
          const resetCompositionKeys: Array<keyof HtmlVideoPipelineCheckpoint> = [];
          if (pipelineCheckpoint.visual) {
            delete pipelineCheckpoint.visual;
            resetCompositionKeys.push("visual");
          }
          if (pipelineCheckpoint.revision) {
            delete pipelineCheckpoint.revision;
            resetCompositionKeys.push("revision");
          }
          if (resetCompositionKeys.length > 0) {
            await options.onPipelineCheckpointReset?.(resetCompositionKeys);
          }
          console.warn("[HTML Video] Draft output rejected", {
            attempt: attempt + 1,
            reason: lastRejectionReason,
          });
          continue;
        }

        try {
          await dependencies.deductBalance(
            actor.id,
            API_COSTS.AI_HTML_CHAT,
            "Chi phí tạo HTML/CSS video bằng AI",
            options.billingIdempotencyKey
          );
        } catch (error) {
          throw walletError(error);
        }
        return {
          html: safe.sanitizedHtml,
          css: safe.sanitizedCss,
          ...(voiceScript ? { voiceScript } : {}),
          ...(generatedDraft.pipeline ? { pipeline: generatedDraft.pipeline } : {}),
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
