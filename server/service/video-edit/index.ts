import { AIMediaModel } from "../../model/ai-media.model";
import { videoBlueprintService } from "../video-blueprint.service";
import { hermesService } from "./hermes";
import { remotionQueueService } from "./queue";
import { claudeRenderService } from "./claude-render.service";

export interface EditVideoOptions {
  modelName?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  videoDurations?: number[];
  blueprint?: any;
  renderMode?: "local" | "hermes";
  renderEngine?: "remotion" | "hyperframe" | "hermes" | "professional";
  referenceVideoUrl?: string;
  referenceVideoDuration?: number;
  // Professional mode options
  outline?: string;
  scenes?: string[];
  scenesContent?: import("./claude-render.service").SceneSpec[];
  brandName?: string;
  bgMusicUrl?: string;
  /** Bỏ qua bước phân tích nội dung video (nhanh hơn nhưng blueprint ít chính xác hơn) */
  skipContentAnalysis?: boolean;
}

/**
 * Điểm vào chính cho tính năng "Edit Video bằng Prompt".
 *
 * Luồng:
 *  1. Nếu Hermes được yêu cầu → gọi hermesService.editVideo() (cloud worker)
 *  2. Nếu không → sinh Blueprint từ prompt, tạo record "processing", đẩy vào hàng đợi render
 *     Queue sẽ chạy: Hyperframe → Remotion → FFmpeg theo thứ tự ưu tiên
 */
export async function editVideo(
  userId: string,
  videoUrl: string,
  prompt: string,
  options?: EditVideoOptions
): Promise<{ status: string; record: any; blueprint: any }> {
  // Professional: Claude API sinh HTML+GSAP → HyperFrames → FFmpeg (độc lập với Hermes)
  if (options?.renderEngine === "professional") {
    const result = await claudeRenderService.renderVideo(userId, {
      facecamUrl: videoUrl,
      outline: options.outline || prompt,
      scenes: options.scenes,
      scenesContent: options.scenesContent,
      brandName: options.brandName,
      bgMusicUrl: options.bgMusicUrl,
    });
    return { ...result, blueprint: null };
  }

  // Hermes: cloud AI worker pool (explicit request only)
  if (options?.renderMode === "hermes" || options?.renderEngine === "hermes") {
    return hermesService.editVideo(userId, videoUrl, prompt, options);
  }

  const videoDuration = options?.duration || 10;
  const hasReferenceVideo = !!options?.referenceVideoUrl;

  // Blueprint generation: style-copy mode vs standard prompt mode
  let blueprint = options?.blueprint;
  let renderLogs: string[];
  let recordTitle: string;

  if (!blueprint) {
    if (hasReferenceVideo) {
      // ── STYLE COPY MODE: phân tích video mẫu → sinh blueprint ─────────────
      const refDuration = options!.referenceVideoDuration || videoDuration;
      renderLogs = [
        "[Style Copy] Khởi tạo chế độ áp dụng phong cách từ video mẫu...",
        `[Style Copy] Video gốc: ${videoUrl}`,
        `[Style Copy] Video mẫu: ${options!.referenceVideoUrl}`,
        "[Style Copy] Đang tải video mẫu lên Gemini để phân tích...",
      ];
      recordTitle = `Áp dụng phong cách video mẫu${prompt ? `: ${prompt}` : ""}`;

      blueprint = await videoBlueprintService.copyAndScaleBlueprint(
        userId,
        [options!.referenceVideoUrl!, videoUrl],
        {
          [options!.referenceVideoUrl!]: refDuration,
          [videoUrl]: videoDuration,
        }
      );

      // Hybrid: nếu user còn nhập thêm prompt → tinh chỉnh blueprint
      if (prompt?.trim()) {
        renderLogs.push(`[Style Copy] Tinh chỉnh thêm theo yêu cầu: "${prompt}"`);
        blueprint = await videoBlueprintService.refineBlueprint(
          blueprint,
          prompt,
          videoUrl,
          videoDuration
        );
      }
    } else {
      // ── STANDARD PROMPT MODE (với content-aware generation mặc định) ──────────
      const useContentAnalysis = !options?.skipContentAnalysis;
      renderLogs = [
        "[Render] Khởi tạo yêu cầu biên tập video...",
        `[Render] Video đầu vào: ${videoUrl}`,
        `[Render] Yêu cầu: ${prompt}`,
        useContentAnalysis
          ? "[Render] Chế độ: Content-Aware (phân tích nội dung + sinh blueprint thông minh)"
          : "[Render] Chế độ: Standard (sinh blueprint từ prompt)",
      ];
      recordTitle = `Biên tập video: ${prompt}`;

      if (useContentAnalysis) {
        const result = await videoBlueprintService.generateContentAwareBlueprint(videoUrl, videoDuration, prompt);
        blueprint = result.blueprint;
        if (result.analysis) {
          renderLogs.push(
            `[Content Analysis] contentType=${result.analysis.contentType}, mood=${result.analysis.mood}, transcript=${result.analysis.transcript.length} đoạn, keyMoments=${result.analysis.keyMoments.length}`
          );
        }
      } else {
        blueprint = await videoBlueprintService.generateBlueprintFromPrompt(videoUrl, videoDuration, prompt);
      }
    }
  } else {
    renderLogs = [
      "[Render] Sử dụng blueprint được cung cấp sẵn...",
      `[Render] Video đầu vào: ${videoUrl}`,
    ];
    recordTitle = `Biên tập video: ${prompt}`;
  }

  const renderEngine = options?.renderEngine
    || (options?.modelName === "remotion" || process.env.VIDEO_RENDER_ENGINE === "remotion" ? "remotion" : "hyperframe");

  // Create initial "processing" record — returned immediately to client
  const record = await AIMediaModel.create({
    userId,
    mediaType: "video",
    url: `pending://${renderEngine}/${userId}-${Date.now()}`,
    prompt,
    metadata: {
      status: "processing",
      progress: hasReferenceVideo ? 20 : 5,
      provider: renderEngine,
      title: recordTitle,
      description: "Đang xếp hàng đợi kết xuất...",
      blueprint: blueprint ? JSON.stringify(blueprint) : "{}",
      referenceVideoUrl: options?.referenceVideoUrl,
      renderLogs,
      aspectRatio: options?.aspectRatio || "16:9",
      resolution: options?.resolution || "720p",
    },
  });

  // Enqueue render job (non-blocking)
  void remotionQueueService.addRenderJob(record._id.toString(), videoUrl, blueprint, userId);

  return { status: "success", record, blueprint };
}

// Re-export engines for direct access if needed
export { hyperframeService } from "./hyperframe";
export { remotionService } from "./remotion";
export { hermesService } from "./hermes";
export { remotionQueueService } from "./queue";
export { executeLocalRenderJob } from "./job-runner";
