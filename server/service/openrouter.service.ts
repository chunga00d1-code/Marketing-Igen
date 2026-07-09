/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenRouter Service
 * ������������������������������������
 * OpenAI-compatible client trỏ t�:i https://openrouter.ai/api/v1.
 * H� trợ: chat completions (text + vision), image generation.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

/**
 * Thêm provider prefix nếu chưa có.
 * "gemini-2.5-flash" �  "google/gemini-2.5-flash"
 * "claude-opus-4-5"  �  "anthropic/claude-opus-4-5"
 */
export function mapModelName(modelName: string): string {
  if (!modelName) return "google/gemini-2.5-flash";
  if (modelName.includes("/")) return modelName; // already namespaced

  if (modelName.startsWith("gemini-")) return `google/${modelName}`;
  if (modelName.startsWith("claude-")) return `anthropic/${modelName}`;

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
  /** Return JSON object (response_format: json_object) */
  jsonMode?: boolean;
  /** Optional JSON schema � injected into system prompt as instruction */
  responseSchema?: object;
  maxRetries?: number;
}

/**
 * Chat completions � text và/hoặc vision (base64 images).
 */
export async function openrouterChat(params: OpenRouterChatParams): Promise<{ text: string }> {
  const { model, temperature = 0.7, jsonMode, responseSchema, maxRetries = 4 } = params;
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("[OpenRouter] OPENROUTER_API_KEY chưa �ược cấu hình trong .env");
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

  if (jsonMode || responseSchema) {
    body.response_format = { type: "json_object" };
  }

  let lastError: any;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      console.log(`[OpenRouter] POST /chat/completions | model=${mappedModel} | attempt=${attempt}`);

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
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
        const err = new Error(`OpenRouter API l�i ${response.status}: ${errText}`) as any;
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
        msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT");

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
}

/**
 * Image generation qua OpenRouter /chat/completions v�:i modalities: ["image", "text"]
 * Đây là cách chính thức theo OpenRouter SDK � /images endpoint b�9 geo-block Vietnam
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
  const finalPrompt = `${params.prompt}\n\n${aspectRatioInstruction}`;

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
    for (const img of params.referenceImages || []) {
      content.push({ type: "image_url", image_url: { url: img } });
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

  // Main flow with dual fallback
  try {
    return await tryGemini(primaryModel, finalPrompt);
  } catch (error) {
    console.warn(`[OpenRouter Image] Primary Gemini generation failed: ${error?.message || error}. Trying fallback...`);

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
