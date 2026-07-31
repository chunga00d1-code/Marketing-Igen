import { openrouterChat } from "../openrouter.service";
import { API_COSTS, walletService } from "../wallet.service";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoAspectRatio,
  type HtmlVideoResolution,
} from "./html-video-security.service";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_SOURCE_BYTES = 100 * 1024;

export type HtmlVideoDraftErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "AI_UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "INTERNAL";

const draftErrorMessages: Record<HtmlVideoDraftErrorCode, string> = {
  INSUFFICIENT_BALANCE:
    "Số dư ví không đủ. Vui lòng nạp thêm tiền để tiếp tục.",
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

export type HtmlVideoDraftInput = {
  prompt: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
};

export type HtmlVideoDraft = { html: string; css: string };

export type HtmlVideoDraftDependencies = {
  chat: typeof openrouterChat;
  checkBalance: typeof walletService.checkBalance;
  deductBalance: typeof walletService.deductBalance;
  validateComposition: typeof buildSafeHtmlVideoComposition;
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

function parseDraft(text: unknown): HtmlVideoDraft {
  if (typeof text !== "string") {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 2 ||
    !keys.includes("html") ||
    !keys.includes("css") ||
    typeof record.html !== "string" ||
    typeof record.css !== "string"
  ) {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }

  const html = record.html.trim();
  const css = record.css.trim();
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
    "Return only an HTML fragment in html and CSS in css. Use supported HTML and CSS only; do not include JavaScript.",
    "Banned constructs: scripts, event handlers, inline styles, URLs, external assets, external fonts, images, SVG, MathML, iframes, forms, @import, url(...), and CSS expressions.",
    "Keep essential text and logos inside a safe margin, use high contrast and readable font sizes, and keep the final intended state visible for the end of the video.",
    "Do not invent prices, discounts, factual claims, guarantees, contact details, or URLs that are not present in the user request.",
  ].join("\n");
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

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let safe: ReturnType<HtmlVideoDraftDependencies["validateComposition"]>;
        let response: Awaited<ReturnType<HtmlVideoDraftDependencies["chat"]>>;
        try {
          response = await dependencies.chat({
            model: process.env.AI_HTML_MODEL || "google/gemini-2.5-flash",
            temperature: 0.35,
            jsonMode: true,
            responseSchema: { html: "string", css: "string" },
            maxRetries: 1,
            maxTokens: 10_000,
            timeoutMs: 45_000,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
          });
        } catch (error) {
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
        } catch {
          // Malformed provider output and trust-boundary failures are retried once without logging.
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
});
