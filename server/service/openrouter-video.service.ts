/* eslint-disable @typescript-eslint/no-explicit-any */
import { cloudinaryService } from "./cloudinary.service";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_VIDEO_MODEL = "google/veo-3.1-fast";
const ALLOWED_VIDEO_MODELS = new Set([
  "google/veo-3.1-fast",
  "bytedance/seedance-2.0",
]);

export interface OpenRouterVideoCreateOptions {
  aspectRatio?: string;
  resolution?: string;
  referenceImageUris?: string[];
  frameMode?: "standard" | "first_last";
  generateAudio?: boolean;
}

export interface OpenRouterVideoStatus {
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  error?: string;
  unsignedUrl?: string;
}

function getApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Chưa cấu hình OPENROUTER_API_KEY. Không thể sinh video AI.");
  }
  return apiKey;
}

function headers(includeJson = false): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(process.env.OPENROUTER_SITE_URL
      ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
      : {}),
    "X-Title": process.env.OPENROUTER_APP_NAME || "iGen Marketing",
  };
}

function normalizeModel(modelName?: string) {
  const normalized = String(modelName || "").trim().toLowerCase();
  const legacyModels: Record<string, string> = {
    "piapi-veo31-video-fast-audio": "google/veo-3.1-fast",
    "veo31-video-fast-audio": "google/veo-3.1-fast",
    "veo-3.1-fast-generate-preview": "google/veo-3.1-fast",
    "piapi-veo31-video-audio": "google/veo-3.1-fast",
    "veo31-video-audio": "google/veo-3.1-fast",
    "veo-3.1-generate-preview": "google/veo-3.1-fast",
    "piapi-veo31-video-fast-no-audio": "google/veo-3.1-fast",
    "veo31-video-fast-no-audio": "google/veo-3.1-fast",
    "veo-3.1-lite-generate-preview": "google/veo-3.1-fast",
  };
  const resolved = legacyModels[normalized] || normalized;
  return ALLOWED_VIDEO_MODELS.has(resolved) ? resolved : DEFAULT_VIDEO_MODEL;
}

function shouldGenerateAudio(modelName?: string) {
  return !String(modelName || "").toLowerCase().includes("no-audio");
}

async function readError(response: Response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.error || parsed?.message || raw;
  } catch {
    return raw;
  }
}

export const openrouterVideoService = {
  async createVideoTask(
    prompt: string,
    modelName: string | undefined,
    durationSeconds: number,
    options?: OpenRouterVideoCreateOptions
  ): Promise<{ jobId: string; pollingUrl?: string }> {
    const referenceImages = await Promise.all(
      (options?.referenceImageUris || []).filter(Boolean).map(async (uri) => {
        if (!uri.startsWith("data:")) return uri;
        return cloudinaryService.uploadMedia(uri, "igen_erp/marketing/openrouter-video-inputs");
      })
    );
    const frameImages = referenceImages.slice(0, options?.frameMode === "first_last" ? 2 : 1)
      .map((url, index) => ({
        type: "image_url",
        image_url: { url },
        frame_type: index === 1 ? "last_frame" : "first_frame",
      }));

    const payload = {
      model: normalizeModel(modelName),
      prompt,
      duration: Math.max(1, Math.round(Number(durationSeconds) || 8)),
      ...(options?.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      ...(options?.resolution ? { resolution: options.resolution } : {}),
      generate_audio: options?.generateAudio ?? shouldGenerateAudio(modelName),
      ...(frameImages.length ? { frame_images: frameImages } : {}),
    };

    console.log(
      `[OpenRouter Video] Submitting | model=${payload.model} | duration=${payload.duration} | resolution=${options?.resolution || "default"}`
    );
    const response = await fetch(`${OPENROUTER_BASE_URL}/videos`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter Video API lỗi ${response.status}: ${await readError(response)}`);
    }

    const result = await response.json() as any;
    const jobId = String(result?.id || "").trim();
    if (!jobId) {
      throw new Error("OpenRouter đã nhận yêu cầu nhưng không trả về mã job video.");
    }
    return { jobId, pollingUrl: result?.polling_url };
  },

  async getTaskStatus(jobId: string): Promise<OpenRouterVideoStatus> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/videos/${encodeURIComponent(jobId)}`, {
      headers: headers(),
    });
    if (!response.ok) {
      throw new Error(`Không thể kiểm tra job OpenRouter ${response.status}: ${await readError(response)}`);
    }

    const result = await response.json() as any;
    const rawStatus = String(result?.status || "pending").toLowerCase();
    if (rawStatus === "completed") {
      return {
        status: "completed",
        progress: 100,
        unsignedUrl: Array.isArray(result?.unsigned_urls) ? result.unsigned_urls[0] : undefined,
      };
    }
    if (rawStatus === "failed" || rawStatus === "cancelled" || rawStatus === "canceled") {
      return {
        status: "failed",
        progress: 0,
        error: String(result?.error?.message || result?.error || "OpenRouter không thể tạo video."),
      };
    }
    return {
      status: rawStatus === "pending" || rawStatus === "queued" ? "pending" : "processing",
      progress: typeof result?.progress === "number" ? result.progress : undefined,
    };
  },

  async downloadVideo(jobId: string, unsignedUrl?: string): Promise<Buffer> {
    const downloadUrl = unsignedUrl
      || `${OPENROUTER_BASE_URL}/videos/${encodeURIComponent(jobId)}/content?index=0`;
    const response = await fetch(downloadUrl, {
      headers: downloadUrl.startsWith(OPENROUTER_BASE_URL) ? headers() : undefined,
    });
    if (!response.ok) {
      throw new Error(`Không thể tải video OpenRouter ${response.status}: ${await readError(response)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  },

  async generateVideo(
    prompt: string,
    modelName: string | undefined,
    durationSeconds: number,
    options?: OpenRouterVideoCreateOptions
  ): Promise<{ jobId: string; buffer: Buffer }> {
    const { jobId } = await this.createVideoTask(prompt, modelName, durationSeconds, options);
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const result = await this.getTaskStatus(jobId);
      if (result.status === "completed") {
        return {
          jobId,
          buffer: await this.downloadVideo(jobId, result.unsignedUrl),
        };
      }
      if (result.status === "failed") {
        throw new Error(result.error || "OpenRouter không thể tạo video.");
      }
    }
    throw new Error("Quá thời gian chờ tạo video từ OpenRouter (10 phút).");
  },
};

export { normalizeModel as normalizeOpenRouterVideoModel };
