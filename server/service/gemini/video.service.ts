/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
import { AIMediaModel } from "../../model/ai-media.model";
import { cloudinaryService } from "../cloudinary.service";
import { openrouterVideoService } from "../openrouter-video.service";
import { piapiService } from "../piapi.service";
import { editVideo as _editVideo, executeLocalRenderJob as _executeLocalRenderJob } from "../video-edit";
import {
  generateText,
  HTML_VIDEO_MODEL,
  safeParseJson,
} from "./core";

export class GeminiVideoService {
  async composeHtmlVideo(
    prompt: string,
    systemInstruction: string
  ): Promise<{ text: string; isMock: false }> {
    console.log(
      `[geminiService.composeHtmlVideo] Calling HTML video model: ${HTML_VIDEO_MODEL}`
    );
    const response = await generateText(
      HTML_VIDEO_MODEL,
      [{ role: "user", parts: [{ text: prompt }] }],
      {
        systemInstruction,
        temperature: 0.55,
        responseMimeType: "application/json",
        maxTokens: 8_192,
        maxRetries: 1,
        timeoutMs: 60_000,
        fallbackMaxRetries: 1,
        fallbackTimeoutMs: 120_000,
        fallbackModel:
          process.env.HTML_VIDEO_FALLBACK_MODEL ||
          "google/gemini-2.5-flash",
        provider: "openrouter",
      }
    );
    return { text: response.text, isMock: false };
  }

  async generateVideo(
    prompt: string,
    durationSeconds: number = 6,
    options?: {
      aspectRatio?: string;
      modelName?: string;
      resolution?: string;
      referenceVideoUri?: string;
      referenceImageUris?: string[];
      frameMode?: "standard" | "first_last";
    }
  ): Promise<{ url: string; isMock: boolean }> {
    let actualPrompt = prompt;
    try {
      const parsed = safeParseJson(prompt);
      if (parsed.optimized_english_prompt) {
        actualPrompt = parsed.optimized_english_prompt;
        if (parsed.motion_analysis) actualPrompt += `. Motion: ${parsed.motion_analysis}`;
        if (parsed.camera_movement) actualPrompt += `. Camera: ${parsed.camera_movement}`;
      }
    } catch (e) {
      // not JSON, use as is
    }

    const { jobId } = await openrouterVideoService.createVideoTask(
      actualPrompt,
      options?.modelName,
      durationSeconds,
      {
        aspectRatio: options?.aspectRatio,
        resolution: options?.resolution,
        referenceImageUris: options?.referenceImageUris,
        frameMode: options?.frameMode,
      }
    );
    return { url: `pending://openrouter/${jobId}`, isMock: false, jobId } as any;
  }

  async getPiapiTaskStatus(taskId: string): Promise<{ status: string; url?: string; progress?: number; error?: string }> {
    return piapiService.getTaskStatus(taskId);
  }

  async getOpenRouterVideoTaskStatus(jobId: string) {
    return openrouterVideoService.getTaskStatus(jobId);
  }

  /**
   * Biên tập video bằng prompt - delegate tới video-edit module.
   */
  async editVideo(
    userId: string,
    videoUrl: string,
    prompt: string,
    options?: Parameters<typeof _editVideo>[3]
  ): Promise<{ status: string; record: any; blueprint: any }> {
    return _editVideo(userId, videoUrl, prompt, options);
  }

  async executeLocalRenderJob(recordId: string, videoUrl: string, blueprint: any, userId: string) {
    return _executeLocalRenderJob(recordId, videoUrl, blueprint, userId);
  }

  async pollPiAPIVideoStatusBackground(recordId: string, taskId: string, userId: string) {
    console.log(`[PiAPI Background Poll] Started polling for record ${recordId}, taskId ${taskId}`);

    let attempts = 0;
    const maxAttempts = 60; // 10 minutes (60 * 10 seconds)

    const runPoll = async () => {
      try {
        const result = await piapiService.getTaskStatus(taskId);
        console.log(`[PiAPI Background Poll] Record ${recordId} status: ${result.status}`);

        if (result.status === "completed" && result.url) {
          console.log(`[PiAPI Background Poll] Completed! Uploading to Cloudinary...`);
          const cloudinaryUrl = await cloudinaryService.uploadMedia(result.url, "igen_erp/marketing/video");

          const record = await AIMediaModel.findByIdAndUpdate(
            recordId,
            { url: cloudinaryUrl, "metadata.status": "completed", "metadata.progress": 100 },
            { new: true }
          );

          const activeCardId = record?.metadata?.activeCardId;
          if (activeCardId) {
            const { MarketingContentModel } = require("../../model/marketing-content.model");
            await MarketingContentModel.findByIdAndUpdate(activeCardId, { videoUrl: cloudinaryUrl });
            console.log(`[PiAPI Background Poll] Updated target card ${activeCardId} with videoUrl: ${cloudinaryUrl}`);
          }
          return;
        } else if (result.status === "failed") {
          console.error(`[PiAPI Background Poll] Failed for task ${taskId}: ${result.error}`);
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "failed",
            "metadata.error": result.error || "Lỗi tạo video từ PiAPI",
            "metadata.progress": 0,
          });
          return;
        } else {
          let currentProgress = typeof result.progress === "number" && result.progress > 0 ? result.progress : 0;
          if (currentProgress === 0) {
            currentProgress = Math.min(5 + attempts * 7, 95);
          }
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.progress": currentProgress,
          });
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(runPoll, 10000);
        } else {
          console.error(`[PiAPI Background Poll] Timeout for task ${taskId}`);
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "timeout",
            "metadata.error": "Quá thời gian chờ tạo video từ PiAPI (10 phút)",
          });
        }
      } catch (error: any) {
        console.error(`[PiAPI Background Poll] Error polling task ${taskId}:`, error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(runPoll, 10000);
        }
      }
    };

    setTimeout(runPoll, 10000);
  }

  /**
   * Poll trạng thái video OpenRouter và lưu file hoàn chỉnh lên Cloudinary.
   */
  async pollOpenRouterVideoStatusBackground(recordId: string, jobId: string, userId: string) {
    console.log(`[OpenRouter Video Poll] Started for record ${recordId}, job ${jobId}`);

    let attempts = 0;
    const maxAttempts = 60;

    const runPoll = async () => {
      try {
        const result = await openrouterVideoService.getTaskStatus(jobId);
        console.log(`[OpenRouter Video Poll] Record ${recordId} status: ${result.status}`);

        if (result.status === "completed") {
          const videoBuffer = await openrouterVideoService.downloadVideo(jobId, result.unsignedUrl);
          const cloudinaryUrl = await cloudinaryService.uploadMediaBuffer(
            videoBuffer,
            "igen_erp/marketing/video",
            `openrouter_${jobId}`
          );
          const record = await AIMediaModel.findByIdAndUpdate(
            recordId,
            { url: cloudinaryUrl, "metadata.status": "completed", "metadata.progress": 100 },
            { new: true }
          );

          const activeCardId = record?.metadata?.activeCardId;
          if (activeCardId) {
            const { MarketingContentModel } = require("../../model/marketing-content.model");
            await MarketingContentModel.findByIdAndUpdate(activeCardId, { videoUrl: cloudinaryUrl });
          }
          return;
        }

        if (result.status === "failed") {
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "failed",
            "metadata.error": result.error || "Lỗi tạo video từ OpenRouter",
            "metadata.progress": 0,
          });
          return;
        }

        const currentProgress = typeof result.progress === "number" && result.progress > 0
          ? result.progress
          : Math.min(5 + attempts * 7, 95);
        await AIMediaModel.findByIdAndUpdate(recordId, {
          "metadata.progress": currentProgress,
        });

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(runPoll, 10000);
        } else {
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "timeout",
            "metadata.error": "Quá thời gian chờ tạo video từ OpenRouter (10 phút)",
          });
        }
      } catch (error) {
        console.error(`[OpenRouter Video Poll] Error polling job ${jobId}:`, error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(runPoll, 10000);
        } else {
          await AIMediaModel.findByIdAndUpdate(recordId, {
            "metadata.status": "timeout",
            "metadata.error": "Không thể nhận kết quả video từ OpenRouter sau nhiều lần thử.",
          });
        }
      }
    };

    setTimeout(runPoll, 10000);
  }
}

export const geminiVideoService = new GeminiVideoService();
