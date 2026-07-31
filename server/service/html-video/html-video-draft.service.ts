import { openrouterChat } from "../openrouter.service";
import { API_COSTS, walletService } from "../wallet.service";
import {
  buildSafeHtmlVideoComposition,
  type HtmlVideoAspectRatio,
  type HtmlVideoResolution,
} from "./html-video-security.service";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_SOURCE_BYTES = 100 * 1024;
const INVALID_DRAFT_MESSAGE = "AI không trả về HTML/CSS hợp lệ.";

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

      await dependencies.checkBalance(actor.id, API_COSTS.AI_HTML_CHAT);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let safe: ReturnType<HtmlVideoDraftDependencies["validateComposition"]>;
        try {
          const response = await dependencies.chat({
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
          const draft = parseDraft(response.text);
          safe = dependencies.validateComposition({
            ...draft,
            durationSeconds: input.durationSeconds,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
          });
        } catch {
          // Provider output and trust-boundary failures are retried once without logging.
          continue;
        }

        await dependencies.deductBalance(
          actor.id,
          API_COSTS.AI_HTML_CHAT,
          "Chi phí tạo HTML/CSS video bằng AI"
        );
        return { html: safe.sanitizedHtml, css: safe.sanitizedCss };
      }

      throw new Error(INVALID_DRAFT_MESSAGE);
    },
  };
}

export const htmlVideoDraftService = createHtmlVideoDraftService({
  chat: openrouterChat,
  checkBalance: walletService.checkBalance.bind(walletService),
  deductBalance: walletService.deductBalance.bind(walletService),
  validateComposition: buildSafeHtmlVideoComposition,
});
