/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMediaModel } from "../../model/ai-media.model";
import { broadcastEvent } from "../../socket";
import { remotionService } from "./remotion";
import { runFFmpegFallback } from "./ffmpeg";
import { VideoRenderAdapterError, type VideoRenderInput } from "./render-adapter";
import { runRenderWaterfall } from "./render-waterfall";
import { defaultVideoRenderAdapterRegistry } from "./video-render-adapters";

const HYPERFRAMES_RENDER_TIMEOUT_MS = 15 * 60 * 1000;

function safeRenderFailure(error: unknown) {
  if (error instanceof VideoRenderAdapterError) {
    return `${error.code}: ${error.message}`;
  }
  return "Renderer failed.";
}

/**
 * Thực thi tác vụ render video theo waterfall: Hyperframe → Remotion → FFmpeg.
 * Được gọi từ hàng đợi (queue.ts) hoặc trực tiếp khi không có Redis.
 */
export async function executeLocalRenderJob(
  recordId: string,
  videoUrl: string,
  blueprint: any,
  _userId: string
): Promise<void> {
  console.log(`[Video Render Worker] Starting task for record ${recordId}`);

  const currentRecord = await AIMediaModel.findById(recordId);
  const logs: string[] = currentRecord?.metadata?.renderLogs || [
    "[Render] Khởi tạo yêu cầu biên tập...",
    `[Render] Blueprint: ${JSON.stringify(blueprint, null, 2)}`,
  ];
  logs.push("[Render Engine] Bắt đầu xử lý tác vụ từ hàng đợi...");

  const updateLogs = async (progress: number, newLog?: string) => {
    if (newLog) {
      console.log(`[Video Render Worker] [${progress}%] ${newLog}`);
      logs.push(newLog);
    }
    const updatedRecord = await AIMediaModel.findByIdAndUpdate(
      recordId,
      {
        "metadata.progress": progress,
        "metadata.renderLogs": logs,
        "metadata.description": `Đang kết xuất video tự động. Tiến trình: ${progress}%`,
      },
      { new: true }
    );
    if (updatedRecord) {
      broadcastEvent("video_status_updated", {
        videoId: recordId,
        status: "processing",
        updates: [updatedRecord.toObject()],
      });
    }
  };

  try {
    const record = await AIMediaModel.findById(recordId);
    const aspect = record?.metadata?.aspectRatio || "16:9";
    const resolution = record?.metadata?.resolution || "720p";

    // Resolve target dimensions from aspect ratio + resolution
    let targetWidth = 1280;
    let targetHeight = 720;
    if (aspect === "9:16") {
      targetWidth = resolution === "1080p" ? 1080 : 720;
      targetHeight = resolution === "1080p" ? 1920 : 1280;
    } else if (aspect === "1:1") {
      targetWidth = resolution === "1080p" ? 1080 : 720;
      targetHeight = targetWidth;
    } else {
      if (resolution === "1080p") { targetWidth = 1920; targetHeight = 1080; }
    }

    const renderEngine = record?.metadata?.provider || process.env.VIDEO_RENDER_ENGINE || "hyperframe";
    const renderOptions = { aspectRatio: aspect, resolution };
    const normalizedAspect: VideoRenderInput["aspectRatio"] =
      aspect === "9:16" || aspect === "1:1" ? aspect : "16:9";
    const normalizedResolution: VideoRenderInput["resolution"] =
      resolution === "1080p" ? "1080p" : "720p";
    const hyperframesAdapter =
      defaultVideoRenderAdapterRegistry.get("hyperframes");

    if (renderEngine !== "remotion") {
      await updateLogs(25, `[Render Engine] Bắt đầu kết xuất bằng Hyperframe (${aspect}, ${resolution})...`);
    }

    const waterfallResult = await runRenderWaterfall({
      selectedEngine: renderEngine,
      hyperframesAdapter,
      hyperframesInput: {
        jobId: recordId,
        blueprint: blueprint as VideoRenderInput["blueprint"],
        aspectRatio: normalizedAspect,
        resolution: normalizedResolution,
        sourceVideoUrl: videoUrl,
      },
      hyperframesContext: {
        signal: new AbortController().signal,
        timeoutMs: HYPERFRAMES_RENDER_TIMEOUT_MS,
        temporaryDirectory: join(
          tmpdir(),
          `igen-hyperframes-${recordId}-${randomUUID()}`
        ),
        onProgress: async ({ progress, message }) => {
          const workerProgress = Math.min(85, 25 + Math.round(progress * 0.65));
          await updateLogs(workerProgress, `[Hyperframe Engine] ${message}`);
        },
      },
      renderWithRemotion: async () => {
        await updateLogs(35, `[Render Engine] Bắt đầu kết xuất bằng Remotion (${aspect}, ${resolution})...`);
        return remotionService.renderVideo(
          blueprint,
          renderOptions,
          async (progress, msg) => { await updateLogs(progress, msg); }
        );
      },
      renderWithFfmpeg: async () => {
        await updateLogs(42, `[Render Engine] Bắt đầu FFmpeg fallback (${aspect}, ${resolution})...`);
        return runFFmpegFallback(
          recordId,
          videoUrl,
          blueprint,
          { aspectRatio: aspect, resolution, targetWidth, targetHeight },
          async (progress, msg) => { await updateLogs(progress, msg); }
        );
      },
      onFailure: async (engine, error) => {
        const safeFailure = safeRenderFailure(error);
        if (engine === "hyperframes") {
          await updateLogs(30, `[Render Engine] Hyperframe thất bại (${safeFailure}). Thử Remotion...`);
          return;
        }
        await updateLogs(40, `[Render Engine Warning] Remotion thất bại (${safeFailure}). Chuyển sang FFmpeg Fallback...`);
      },
    });

    const finalVideoUrl = waterfallResult.outputUrl;
    if (waterfallResult.engine === "hyperframes") {
      await updateLogs(86, "[Render Engine] ✅ Hyperframe kết xuất thành công.");
    } else if (waterfallResult.engine === "remotion") {
      await updateLogs(86, "[Render Engine] ✅ Remotion kết xuất thành công.");
    }

    await updateLogs(95, "Cloudinary Đồng bộ hóa tài nguyên biên tập...");

    const completedRecord = await AIMediaModel.findByIdAndUpdate(
      recordId,
      {
        url: finalVideoUrl,
        "metadata.status": "completed",
        "metadata.progress": 100,
        "metadata.renderLogs": [...logs, "[Render Engine] Hoàn thành kết xuất video!"],
      },
      { new: true }
    );

    if (completedRecord) {
      broadcastEvent("video_status_updated", {
        videoId: recordId,
        status: "completed",
        updates: [completedRecord.toObject()],
      });
    }

    console.log(`[Video Render Worker] Successfully completed. Final URL: ${finalVideoUrl}`);
  } catch (error: any) {
    console.error("[Video Render Worker Error]", error);
    const failedRecord = await AIMediaModel.findByIdAndUpdate(
      recordId,
      {
        "metadata.status": "failed",
        "metadata.error": error.message || String(error),
        "metadata.progress": 0,
        "metadata.renderLogs": [...logs, `[Render Engine Lỗi] ${error.message || String(error)}`],
      },
      { new: true }
    );
    if (failedRecord) {
      broadcastEvent("video_status_updated", {
        videoId: recordId,
        status: "failed",
        updates: [failedRecord.toObject()],
      });
    }
  }
}
