/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenRouter Service
 * ─────────────────────────────────────────────────────────────────
 * OpenAI-compatible client trỏ tới https://openrouter.ai/api/v1.
 * Hỗ trợ: chat completions (text + vision), image generation.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

/**
 * Thêm provider prefix nếu chưa có.
 * "gemini-2.5-flash" -> "google/gemini-2.5-flash"
 * "claude-opus-4-5"  -> "anthropic/claude-opus-4-5"
 * "deepseek-v4-flash-0731" -> "deepseek/deepseek-v4-flash-0731"
 */
export function mapModelName(modelName: string): string {
  if (!modelName) return "google/gemini-2.5-flash";
  if (modelName.includes("/")) return modelName; // already namespaced

  if (modelName.startsWith("gemini-")) return `google/${modelName}`;
  if (modelName.startsWith("claude-")) return `anthropic/${modelName}`;
  if (modelName.startsWith("deepseek-") || modelName.startsWith("deepseek")) return `deepseek/${modelName}`;

  return modelName;
}

export type OpenRouterMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OpenRouterContentPart[] }
  | { role: "assistant"; content: string };

export type OpenRouterContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OpenRouterChatParams {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Return JSON object (response_format: json_object) */
  jsonMode?: boolean;
  /** Optional JSON schema — injected into system prompt as instruction */
  responseSchema?: object;
  maxRetries?: number;
}

/**
 * Chat completions — text và/hoặc vision (base64 images).
 */
export async function openrouterChat(params: OpenRouterChatParams): Promise<{ text: string }> {
  const {
    model,
    temperature = 0.7,
    jsonMode,
    responseSchema,
    maxRetries = 4,
    maxTokens,
    timeoutMs = 45_000,
  } = params;
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("[OpenRouter] OPENROUTER_API_KEY chưa được cấu hình trong .env");
  }

  const mappedModel = mapModelName(model);

  // Nếu có responseSchema, inject vào system prompt
  let messages = [...params.messages];
  if (responseSchema) {
    const schemaInstruction = `Respond ONLY with a valid JSON object matching this schema (no markdown, no explanation):\n${JSON.stringify(responseSchema, null, 2)}`;
    const sysIdx = messages.findIndex((m) => m.role === "system");
    if (sysIdx >= 0) {
      messages[sysIdx] = {
        role: "system",
        content: (messages[sysIdx] as any).content + "\n\n" + schemaInstruction,
      };
    } else {
      messages = [{ role: "system", content: schemaInstruction }, ...messages];
    }
  }

  const body: Record<string, any> = {
    model: mappedModel,
    messages,
    temperature,
  };
  if (maxTokens) body.max_tokens = maxTokens;

  if (jsonMode || responseSchema) {
    if (!mappedModel.includes("perplexity")) {
      body.response_format = { type: "json_object" };
    }
  }

  let lastError: any;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      console.log(`[OpenRouter] POST /chat/completions | model=${mappedModel} | attempt=${attempt}`);

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.APP_URL || "https://igen-erp.app",
          "X-Title": "Igen ERP",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        const publicMessage =
          response.status === 402
            ? "Dịch vụ AI đang tạm thời không khả dụng. Vui lòng thử lại sau."
            : `OpenRouter API lỗi ${response.status}: ${errText}`;
        const err = new Error(publicMessage) as any;
        err.providerMessage = errText;
        err.status = response.status;
        throw err;
      }

      const data = (await response.json()) as any;
      const text: string = data.choices?.[0]?.message?.content || "";
      const elapsed = Date.now() - startTime;
      console.log(`[OpenRouter] Success | model=${data.model || mappedModel} | ${elapsed}ms | len=${text.length}`);
      return { text };
    } catch (error: any) {
      lastError = error;
      const status = error?.status ?? 0;
      const msg = error?.message || String(error);
      const isRetryable =
        status === 429 || status === 503 || status === 502 ||
        msg.includes("RESOURCE_EXHAUSTED") || msg.includes("fetch failed") ||
        msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") ||
        msg.includes("aborted") || msg.includes("timed out");

      if (isRetryable && attempt < maxRetries) {
        console.warn(`[OpenRouter] Attempt ${attempt} failed, retrying in ${delay}ms... Error: ${msg}`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      } else {
        break;
      }
    }
  }

  throw lastError ?? new Error("[OpenRouter] Chat completions failed with no error details.");
}

export interface OpenRouterImageParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  /** Reference images (base64 data URL hoặc https URL) cho image-to-image */
  referenceImages?: string[];
  referenceImageRoles?: Array<"source" | "supporting" | "annotation">;
}

const REFERENCE_IMAGE_INSTRUCTIONS = [
  "REFERENCE IMAGE 1 — DEFAULT POSTER BACKGROUND OR TEMPLATE: preserve the intended composition, visual style, color palette, text-safe areas, and any usable layout cues from this image.",
  "REFERENCE IMAGE 2 — DEFAULT HERO PRODUCT OR SUBJECT: integrate this exact subject naturally into the poster. Preserve its recognizable silhouette, label, materials, colors, and key identifying details. Do not redesign, replace, or merge it with the background.",
  "REFERENCE IMAGE 3 — DEFAULT LOGO OR SECONDARY ASSET: preserve this asset accurately and place it cleanly as a supporting element. Do not invent, distort, or turn it into unreadable text.",
] as const;

function getGenerationMode(prompt: string): "prompt" | "edit" | "compose" | null {
  if (/GENERATION MODE:\s*CREATE FROM PROMPT/i.test(prompt)) return "prompt";
  if (/GENERATION MODE:\s*IMAGE EDIT/i.test(prompt)) return "edit";
  if (/GENERATION MODE:\s*IMAGE COMPOSITION/i.test(prompt)) return "compose";
  return null;
}

/**
 * Detect a requested camera/viewpoint change without forcing every image edit
 * into a side profile. This is intentionally based on the user's wording (and
 * the optimized English prompt), not on the presence of a reference image.
 */
function hasCameraViewChangeRequest(prompt: string): boolean {
  const normalized = prompt.replace(/[–—]/g, "-");
  const englishViewTerms = /\b(?:side(?:[-\s]?profile)?(?:\s+view)?|profile\s+view|three[-\s]?quarter|front\s+view|rear\s+view|camera\s+(?:angle|viewpoint)|viewpoint|perspective|change\s+(?:the\s+)?(?:camera\s+)?(?:angle|view|perspective)|rotate\s+(?:the\s+)?(?:camera|viewpoint))\b/i;
  const vietnameseViewTerms = /(?:xoay|đổi|thay|chuyển).{0,40}(?:góc|hướng|camera|máy ảnh|nhìn|ngang|dọc)|(?:góc|hướng|camera|nhìn|ngang|dọc).{0,40}(?:xoay|đổi|thay|chuyển)/i;
  return englishViewTerms.test(normalized) || vietnameseViewTerms.test(normalized);
}

function buildReferenceCompositionInstruction(
  referenceCount: number,
  prompt: string,
  referenceImageRoles: Array<"source" | "supporting" | "annotation"> = []
): string {
  const mode = getGenerationMode(prompt);
  const cameraViewInstruction = hasCameraViewChangeRequest(prompt)
    ? "\n\nCAMERA VIEW TRANSFORMATION (only because the user requested a view/angle change):\nTreat this as a change of camera viewpoint, not a 2D rotation of the image. Preserve the exact same subject and render the specifically requested viewpoint. If the request says side/horizontal view, use a true direct side-profile view with the full side silhouette visible; do not keep a three-quarter, front, or rear angle. Preserve identity, proportions, colors, materials, background, lighting, and every unmentioned detail."
    : "";
  if (mode === "prompt") {
    return "\n\nPROMPT-CREATION MODE:\nCreate a new image from the user's text. Reference images are optional visual inspiration only; do not treat them as a source image, poster template, or assets to combine unless the user explicitly requests that.";
  }
  if (mode === "edit") {
    const hasAnnotation = referenceImageRoles.includes("annotation");
    return `\n\nIMAGE-EDIT WITH SUPPORTING REFERENCES MODE:\nUse REFERENCE IMAGE 1 as the source image to preserve. If an annotated reference is supplied, use its visible marks only as a location map for the requested edit and never reproduce those marks. Any other reference images are supporting examples only for the requested angle, style, composition, or detail. Do not replace the source subject, merge subjects, or create a collage. Change only what the user's prompt explicitly requests; preserve every unmentioned source-image element.${hasAnnotation ? " The annotated reference is not a second subject; align it to the source image and follow its marked region." : ""}${cameraViewInstruction}`;
  }
  if (referenceCount === 1) {
    return "\n\nSINGLE-IMAGE EDIT MODE:\nUse REFERENCE IMAGE 1 as the source image, not as a poster template. The user's requested change is the only intended change. Preserve the exact subject identity, silhouette, colors, materials, background, lighting, and all unmentioned elements. Do not add text, a headline, CTA, logo, props, accessories, extra subjects, or a commercial layout unless the user's prompt explicitly asks for them. If the prompt requests a side view/profile, render a true direct side-profile view rather than a three-quarter angle.";
  }
  if (referenceCount < 2) return "";

  const referenceGuidance = mode === "compose"
    ? Array.from({ length: referenceCount }, (_, index) => `REFERENCE IMAGE ${index + 1}: infer its role from the user's explicit prompt and the visual content; do not impose a fixed background/subject/logo role.`)
    : REFERENCE_IMAGE_INSTRUCTIONS.slice(0, referenceCount);
  return `\n\nMULTI-IMAGE COMPOSITION MODE:\nCreate one coherent image, not a collage of unrelated images. The user's explicit prompt is the source of truth and can assign any role or order to the references. Keep distinct subjects visually coherent, match lighting, perspective, scale, contact shadow, and color grading, and do not duplicate a subject or recreate logos as unreadable AI text.\n\n${referenceGuidance.join("\n")}`;
}

function getReferenceImageInstruction(
  index: number,
  referenceCount: number,
  prompt: string,
  referenceImageRoles: Array<"source" | "supporting" | "annotation"> = []
): string {
  const mode = getGenerationMode(prompt);
  const role = referenceImageRoles[index];
  if (role === "annotation") {
    return `REFERENCE IMAGE ${index + 1} — ANNOTATED EDIT MAP: this is an annotated copy of the source image. Use the visible selection, crop frame, or brush marks only to locate the requested change. Do not copy, preserve, or render any colored marks, boxes, arrows, or annotations in the result.`;
  }
  if (role === "source") {
    return "REFERENCE IMAGE 1 — SOURCE IMAGE FOR A CONSTRAINED EDIT: preserve this exact image and change only what the user's prompt explicitly requests.";
  }
  if (mode === "prompt") {
    return `REFERENCE IMAGE ${index + 1} — OPTIONAL VISUAL INSPIRATION: use only visual traits explicitly requested by the user; do not treat this as an asset to preserve or combine.`;
  }
  if (mode === "edit" && index === 0) {
    return "REFERENCE IMAGE 1 — SOURCE IMAGE FOR A CONSTRAINED EDIT: preserve this exact image and change only what the user's prompt explicitly requests.";
  }
  if (mode === "edit") {
    return `REFERENCE IMAGE ${index + 1} — SUPPORTING EDIT REFERENCE: use only relevant visual traits requested by the user, such as angle, style, composition, or detail. Do not replace or merge the source subject.`;
  }
  if (mode === "compose") {
    return `REFERENCE IMAGE ${index + 1} — COMPOSITION INPUT: infer this image's role from the user's explicit prompt and the image itself. Do not assume it is a background, product, or logo unless requested.`;
  }
  return REFERENCE_IMAGE_INSTRUCTIONS[index] || `REFERENCE IMAGE ${index + 1}: use this image as a supporting visual constraint.`;
}

function resolveReferenceImages(images: string[] | undefined): string[] {
  return (images || []).flatMap((image) => {
    if (typeof image !== "string" || !image.trim()) return [];
    const isHeic = /\.hei[cf](?:$|[?#])/i.test(image);
    if (!isHeic) return [image];
    if (image.includes("res.cloudinary.com")) {
      return [image.replace(/\.heic(?=($|[?#]))/i, ".jpg").replace(/\.heif(?=($|[?#]))/i, ".jpg")];
    }
    console.warn("[OpenRouter Image] Skipping unsupported HEIC reference image.");
    return [];
  });
}

function shouldSanitizePrompt(error: any): boolean {
  const detail = String(error?.message || error).toUpperCase();
  return detail.includes("CONTENT_FILTER") || detail.includes("PROHIBITED_CONTENT") || detail.includes("SAFETY");
}

/**
 * Image generation qua OpenRouter /chat/completions với modalities: ["image", "text"]
 * Đây là cách chính thức theo OpenRouter SDK vì /images endpoint bị geo-block Vietnam
 */
function sanitizePrompt(prompt: string): string {
  let cleaned = prompt;

  const sensitiveWords = [
    /finance/gi, /money/gi, /dollar/gi, /cash/gi, /profit/gi, /revenue/gi,
    /credit card/gi, /card/gi, /payment/gi, /bank/gi, /hack/gi, /security/gi,
    /exploit/gi, /warning/gi, /alert/gi, /crisis/gi, /scam/gi, /fraud/gi,
    /official/gi, /legal/gi, /government/gi, /police/gi, /court/gi,
    /prohibited/gi, /violence/gi, /weapon/gi, /illegal/gi
  ];

  for (const regex of sensitiveWords) {
    cleaned = cleaned.replace(regex, "business visual");
  }

  const sentences = cleaned.split(/[.!?]+/);
  if (sentences.length > 1) {
    cleaned = sentences[0] + ". " + (sentences[1] || "");
  }
  if (cleaned.length > 250) {
    cleaned = cleaned.slice(0, 250);
  }

  return cleaned.trim() || "A clean professional marketing product showcase.";
}

/**
 * Image generation qua OpenRouter /chat/completions với modalities: ["image", "text"]
 * Đây là cách chính thức theo OpenRouter SDK vì /images endpoint bị geo-block Vietnam
 */
export async function openrouterGenerateImage(params: OpenRouterImageParams): Promise<{ url: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("[OpenRouter] OPENROUTER_API_KEY chưa được cấu hình trong .env");

  const primaryModel = params.model
    ? mapModelName(params.model)
    : (process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image");

  const ASPECT_RATIO_MAP: Record<string, { width: number; height: number }> = {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1344, height: 768 },
    "9:16": { width: 768, height: 1344 },
    "4:3": { width: 1152, height: 864 },
    "3:4": { width: 864, height: 1152 },
    "3:2": { width: 1216, height: 832 },
    "2:3": { width: 832, height: 1216 },
  };
  const ratioKey = params.aspectRatio || "1:1";
  const dimensions = ASPECT_RATIO_MAP[ratioKey] || ASPECT_RATIO_MAP["1:1"];
  const aspectRatioInstruction = `Generate the image with aspect ratio ${ratioKey} (${dimensions.width}x${dimensions.height} pixels).`;
  const referenceImages = resolveReferenceImages(params.referenceImages);
  const referenceImageRoles = params.referenceImageRoles || [];
  const finalPrompt = `${params.prompt}${buildReferenceCompositionInstruction(referenceImages.length, params.prompt, referenceImageRoles)}\n\n${aspectRatioInstruction}`;

  const tryFluxSchnell = async (prompt: string): Promise<{ url: string }> => {
    console.log("[OpenRouter Image] Trying fallback to black-forest-labs/flux-schnell via /api/v1/images...");
    const response = await fetch(`${OPENROUTER_BASE_URL}/images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://igen-erp.app",
        "X-Title": "Igen ERP",
      },
      body: JSON.stringify({
        model: "black-forest-labs/flux-schnell",
        prompt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[Flux Fallback] API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const url = data.data?.[0]?.url || data?.[0]?.url || data?.url;
    if (!url) throw new Error("[Flux Fallback] Response has no image URL");
    return { url };
  };

  const tryGemini = async (model: string, prompt: string): Promise<{ url: string }> => {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "https://igen-erp.app",
      "X-Title": "Igen ERP",
    };

    console.log(`[OpenRouter Image] chat+modalities | model=${model} | promptLen=${prompt.length} | aspectRatio=${ratioKey} | dimensions=${dimensions.width}x${dimensions.height}`);

    const content: any[] = [{ type: "text", text: prompt }];
    for (const [index, imageUrl] of referenceImages.entries()) {
      const instruction = getReferenceImageInstruction(index, referenceImages.length, prompt, referenceImageRoles);
      content.push({ type: "text", text: instruction });
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const body = {
      model,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
      image_generation_config: {
        width: dimensions.width,
        height: dimensions.height,
      },
    };

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[Gemini] API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    console.log("[OpenRouter Image Debug] Raw response:", JSON.stringify(data).slice(0, 1000));

    const choice = data.choices?.[0];
    if (
      choice?.finish_reason === "content_filter" ||
      (choice?.native_finish_reason && String(choice.native_finish_reason).includes("PROHIBITED_CONTENT"))
    ) {
      throw new Error("CONTENT_FILTER_TRIGGERED");
    }

    const images = choice?.message?.images;
    if (Array.isArray(images) && images.length > 0) {
      const url = images[0]?.image_url?.url;
      if (url) return { url };
    }

    const messageContent = choice?.message?.content;
    if (typeof messageContent === "string") {
      if (messageContent.startsWith("http") || messageContent.startsWith("data:")) {
        return { url: messageContent };
      }
    } else if (Array.isArray(messageContent)) {
      for (const part of messageContent) {
        if (part?.type === "image_url" && part?.image_url?.url) return { url: part.image_url.url };
        if (part?.type === "image" && part?.source?.data) {
          return { url: `data:${part.source.media_type || "image/png"};base64,${part.source.data}` };
        }
      }
    }

    throw new Error("Image response không chứa ảnh.");
  };

  // Reference-image composition must never fall back to text-only Flux, because it
  // would lose the source products/logos that the user asked to preserve.
  try {
    return await tryGemini(primaryModel, finalPrompt);
  } catch (error) {
    console.warn(`[OpenRouter Image] Primary Gemini generation failed: ${error?.message || error}. Trying fallback...`);

    if (referenceImages.length > 0) {
      const retryPrompt = shouldSanitizePrompt(error)
        ? `${sanitizePrompt(params.prompt)}${buildReferenceCompositionInstruction(referenceImages.length, params.prompt, referenceImageRoles)}\n\n${aspectRatioInstruction}`
        : finalPrompt;
      console.log(`[OpenRouter Image] Retrying reference composition | sanitized=${retryPrompt !== finalPrompt}`);
      try {
        return await tryGemini(primaryModel, retryPrompt);
      } catch (retryError) {
        console.error(`[OpenRouter Image] Reference composition retry failed: ${retryError?.message || retryError}`);
        throw error;
      }
    }

    // Attempt Flux Schnell via Images API
    try {
      return await tryFluxSchnell(finalPrompt);
    } catch (fluxError) {
      console.warn(`[OpenRouter Image] Flux Schnell fallback failed: ${fluxError?.message || fluxError}. Retrying Gemini with sanitized prompt...`);

      // Attempt Gemini again with sanitized prompt
      const sanitized = sanitizePrompt(finalPrompt);
      console.log(`[OpenRouter Image] Retrying Gemini with sanitized prompt: "${sanitized}"`);
      try {
        return await tryGemini(primaryModel, sanitized);
      } catch (retryError) {
        console.error(`[OpenRouter Image] All image generation options failed. Final error: ${retryError?.message || retryError}`);
        throw error;
      }
    }
  }
}
