import dotenv from "dotenv";
import { cloudinaryService } from "./cloudinary.service";

dotenv.config();

const PIAPI_API_KEY = process.env.PIAPI_API_KEY || "";
const PIAPI_BASE_URL = "https://api.piapi.ai/api/v1";

console.log(`[PiAPI Service] Loaded API Key status: ${PIAPI_API_KEY ? `Present (Length: ${PIAPI_API_KEY.length}, Prefix: ${PIAPI_API_KEY.substring(0, 8)}...)` : 'Missing'}`);

function createPiApiError(context: string, statusCode: number, rawText: string): Error {
  const normalized = String(rawText || "").trim();
  const upper = normalized.toUpperCase();
  let message = `${context}: ${statusCode}`;

  if (
    statusCode === 402 ||
    upper.includes("INSUFFICIENT_CREDITS") ||
    upper.includes("NO CREDIT") ||
    upper.includes("OUT OF CREDITS") ||
    upper.includes("BALANCE") ||
    upper.includes("PAYMENT REQUIRED")
  ) {
    message = `PiAPI hết credit hoặc số dư không đủ để thực hiện tác vụ. Chi tiết: ${normalized || `HTTP ${statusCode}`}`;
  } else if (
    statusCode === 429 ||
    upper.includes("RESOURCE_EXHAUSTED") ||
    upper.includes("RATE LIMIT") ||
    upper.includes("TOO MANY REQUESTS") ||
    upper.includes("QUOTA")
  ) {
    message = `PiAPI đã vượt quota hoặc rate limit. Chi tiết: ${normalized || `HTTP ${statusCode}`}`;
  } else if (
    statusCode === 401 ||
    statusCode === 403 ||
    upper.includes("UNAUTHORIZED") ||
    upper.includes("FORBIDDEN") ||
    upper.includes("INVALID API KEY") ||
    upper.includes("API KEY")
  ) {
    message = `PiAPI từ chối truy cập hoặc API key không hợp lệ. Chi tiết: ${normalized || `HTTP ${statusCode}`}`;
  } else if (normalized) {
    message = `${context}: ${statusCode} - ${normalized}`;
  }

  const error = new Error(message) as Error & { statusCode?: number; provider?: string; rawDetails?: string };
  error.statusCode = statusCode;
  error.provider = "piapi";
  error.rawDetails = normalized;
  return error;
}

export const piapiService = {
  /**
   * Sinh ảnh bằng PiAPI (Midjourney, Flux, v.v.)
   */
  async generateImage(
    prompt: string,
    model: string,
    options?: { aspectRatio?: string; existingImageUris?: string[] }
  ): Promise<{ url: string; isMock: boolean }> {
    if (!PIAPI_API_KEY) {
      throw new Error("Chưa cấu hình PIAPI_API_KEY. Không thể sinh ảnh.");
    }

    const aspect = options?.aspectRatio || "1:1";
    let imageUrls: string[] = [];
    if (options?.existingImageUris && options.existingImageUris.length > 0) {
      for (const uri of options.existingImageUris) {
        if (!uri) continue;
        if (uri.startsWith("data:")) {
          try {
            console.log("[PiAPI Image Generation] Uploading reference image to Cloudinary...");
            const uploadedUrl = await cloudinaryService.uploadMedia(uri, "igen_erp/image_refs");
            console.log(`[PiAPI Image Generation] Reference image uploaded: ${uploadedUrl}`);
            imageUrls.push(uploadedUrl);
          } catch (err) {
            console.error("[PiAPI Image Generation] Failed to upload reference image to Cloudinary:", err);
            imageUrls.push(uri);
          }
        } else {
          imageUrls.push(uri);
        }
      }
    }

    let reqBody: any;

    if (model === "nano-banana-pro" || model === "nano-banana-2") {
      reqBody = {
        model: "gemini",
        task_type: model,
        input: {
          prompt,
          output_format: "png",
          aspect_ratio: aspect,
          resolution: "1K",
          ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        },
      };
    } else {
      let piapiModel = model.replace("piapi-", "");
      if (piapiModel === "flux") {
        piapiModel = "Qubico/flux1-dev";
      }
      const isMidjourney = piapiModel === "midjourney";
      reqBody = {
        model: piapiModel,
        task_type: isMidjourney ? "imagine" : "text2img",
        input: {
          prompt: isMidjourney && imageUrls.length > 0 ? `${imageUrls.join(" ")} ${prompt}` : prompt,
          aspect_ratio: aspect,
          ...(!isMidjourney && imageUrls.length > 0 ? {
            image_url: imageUrls[0],
            image: imageUrls[0],
            image_urls: imageUrls,
          } : {}),
        },
      };
      if (!isMidjourney && imageUrls.length > 0) {
        reqBody.task_type = "img2img";
      }
    }

    try {
      console.log(`[PiAPI Image Generation] Requesting task for model ${model}. Body:`, JSON.stringify(reqBody, null, 2));
      const response = await fetch(`${PIAPI_BASE_URL}/task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": PIAPI_API_KEY,
        },
        body: JSON.stringify(reqBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createPiApiError("PiAPI task creation failed", response.status, errorText);
      }

      const json: any = await response.json();
      console.log(`[PiAPI Image Generation] Task creation response:`, JSON.stringify(json, null, 2));
      const taskId = json.data?.task_id;
      if (!taskId) {
        throw new Error("Không nhận được task_id từ PiAPI");
      }

      console.log(`[PiAPI Image Generation] Task created: ${taskId}. Polling for completion...`);

      let attempts = 0;
      const maxAttempts = 30; // 5 minutes
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const pollResponse = await fetch(`${PIAPI_BASE_URL}/task/${taskId}`, {
          headers: { "x-api-key": PIAPI_API_KEY },
        });

        if (pollResponse.ok) {
          const pollJson: any = await pollResponse.json();
          const task = pollJson.data;
          console.log(`[PiAPI Image Generation] Task ${taskId} poll result:`, JSON.stringify(pollJson, null, 2));

          if (task?.status === "completed") {
            const url = (task.output?.image_urls && task.output.image_urls[0]) || task.output?.image_url || task.output?.url;
            if (!url) {
              throw new Error("Tác vụ hoàn thành nhưng không nhận được URL hình ảnh.");
            }
            return { url, isMock: false };
          } else if (task?.status === "failed") {
            throw createPiApiError("PiAPI task failed", 400, task.error || "Lỗi không xác định");
          }
        }
        attempts++;
      }

      throw new Error("Quá thời gian chờ tạo ảnh từ PiAPI");
    } catch (error: any) {
      console.error("[PiAPI Image Generation] Error:", error);
      throw error;
    }
  },

  /**
   * Sinh video bằng PiAPI (Luma, v.v. và Veo 3.1)
   */
  async createVideoTask(
    prompt: string,
    model: string,
    durationSeconds: number = 5,
    options?: { aspectRatio?: string; referenceImageUris?: string[] }
  ): Promise<{ taskId: string }> {
    if (!PIAPI_API_KEY) {
      throw new Error("Chưa cấu hình PIAPI_API_KEY");
    }

    const aspect = options?.aspectRatio || "16:9";
    const piapiModel = model.replace("piapi-", "");
    let reqBody: any;

    if (piapiModel.includes("veo31") || piapiModel.includes("veo-3.1") || piapiModel.startsWith("veo3")) {
      let taskType = "veo3.1-video-fast";
      let generateAudio = true;

      if (piapiModel === "veo31-video-audio") {
        taskType = "veo3.1-video";
        generateAudio = true;
      } else if (piapiModel === "veo31-video-fast-audio") {
        taskType = "veo3.1-video-fast";
        generateAudio = true;
      } else if (piapiModel === "veo31-video-fast-no-audio") {
        taskType = "veo3.1-video-fast";
        generateAudio = false;
      }

      let imageUrl: string | undefined = undefined;
      if (options?.referenceImageUris && options.referenceImageUris.length > 0) {
        const firstImage = options.referenceImageUris[0];
        if (firstImage) {
          if (firstImage.startsWith("data:")) {
            try {
              console.log("[PiAPI Video Generation] Uploading reference image to Cloudinary...");
              imageUrl = await cloudinaryService.uploadMedia(firstImage, "igen_erp/video_refs");
              console.log(`[PiAPI Video Generation] Reference image uploaded: ${imageUrl}`);
            } catch (err) {
              console.error("[PiAPI Video Generation] Failed to upload reference image to Cloudinary:", err);
              imageUrl = firstImage; 
            }
          } else {
            imageUrl = firstImage;
          }
        }
      }

      reqBody = {
        model: "veo3.1",
        task_type: taskType,
        input: {
          prompt,
          aspect_ratio: aspect,
          duration: `${durationSeconds}s`,
          generate_audio: generateAudio,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        },
      };
    } else {
      let imageUrl: string | undefined;
      if (options?.referenceImageUris && options.referenceImageUris.length > 0) {
        const firstUri = options.referenceImageUris[0];
        if (firstUri.startsWith("data:")) {
          try {
            imageUrl = await cloudinaryService.uploadMedia(firstUri, "piapi_temp_inputs");
          } catch (uploadError) {
            console.error("[PiAPI Video Generation] Failed to upload reference image to Cloudinary:", uploadError);
          }
        } else {
          imageUrl = firstUri;
        }
      }

      reqBody = {
        model: piapiModel,
        task_type: "video_generation",
        input: {
          prompt,
          aspect_ratio: aspect,
          duration: durationSeconds,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        },
      };
    }

    try {
      console.log(`[PiAPI Video Generation] Requesting task for model ${model}. Body:`, JSON.stringify(reqBody, null, 2));
      const response = await fetch(`${PIAPI_BASE_URL}/task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": PIAPI_API_KEY,
        },
        body: JSON.stringify(reqBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createPiApiError("PiAPI task creation failed", response.status, errorText);
      }

      const json: any = await response.json();
      console.log(`[PiAPI Video Generation] Task creation response:`, JSON.stringify(json, null, 2));
      const taskId = json.data?.task_id;
      if (!taskId) {
        throw new Error("Không nhận được task_id từ PiAPI");
      }

      return { taskId };
    } catch (error: any) {
      console.error("[PiAPI Video Generation] Error in createVideoTask:", error);
      throw error;
    }
  },

  async getTaskStatus(
    taskId: string
  ): Promise<{ status: "pending" | "processing" | "completed" | "failed"; url?: string; progress?: number; error?: string }> {
    if (!PIAPI_API_KEY) {
      throw new Error("Chưa cấu hình PIAPI_API_KEY");
    }

    const pollResponse = await fetch(`${PIAPI_BASE_URL}/task/${taskId}`, {
      headers: { "x-api-key": PIAPI_API_KEY },
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      throw createPiApiError("PiAPI task polling failed", pollResponse.status, errorText);
    }

    const pollJson: any = await pollResponse.json();
    const task = pollJson.data;

    return {
      status: task?.status || "processing",
      url: task?.output?.video || task?.output?.video_url || task?.output?.url,
      progress: typeof task?.progress === "number" ? task.progress : (task?.status === "completed" ? 100 : 0),
      error: task?.error || "",
    };
  },

  /**
   * Sinh video bằng PiAPI (Luma, v.v.)
   */
  async generateVideo(
    prompt: string,
    model: string,
    durationSeconds: number = 5,
    options?: { aspectRatio?: string; referenceImageUris?: string[] }
  ): Promise<{ url: string; isMock: boolean }> {
    if (!PIAPI_API_KEY) {
      throw new Error("Chưa cấu hình PIAPI_API_KEY. Không thể sinh video.");
    }

    try {
      const { taskId } = await this.createVideoTask(prompt, model, durationSeconds, options);
      console.log(`[PiAPI Video Generation] Task created: ${taskId}. Polling for completion...`);

      let attempts = 0;
      const maxAttempts = 60; // 10 minutes
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const result = await this.getTaskStatus(taskId);
        console.log(`[PiAPI Video Generation] Task ${taskId} status: ${result.status}`);

        if (result.status === "completed") {
          if (!result.url) {
            throw new Error("Tác vụ hoàn thành nhưng không nhận được URL video.");
          }
          return { url: result.url, isMock: false };
        } else if (result.status === "failed") {
          throw createPiApiError("PiAPI task failed", 400, result.error || "Lỗi không xác định");
        }
        attempts++;
      }

      throw new Error("Quá thời gian chờ tạo video từ PiAPI");
    } catch (error: any) {
      console.error("[PiAPI Video Generation] Error:", error);
      throw error;
    }
  },

  /**
   * Gọi Chat Completions API của PiAPI (OpenAI-compatible)
   */
  async chatCompletions(
    messages: any[],
    model: string = "gpt-4o-mini",
    responseFormat?: any
  ): Promise<any> {
    if (!PIAPI_API_KEY) {
      throw new Error("Chưa cấu hình PIAPI_API_KEY");
    }

    const body: any = {
      model,
      messages,
      stream: false,
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch("https://api.piapi.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PIAPI_API_KEY}`,
        "x-api-key": PIAPI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PiAPI Chat Completions failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  },
};
