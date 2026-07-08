/**
 * Public Professional Video API
 * ─────────────────────────────
 * Cho phép server bên ngoài gọi để tạo professional video (không cần JWT user).
 * Xác thực bằng API key header: X-API-Key
 *
 * Routes:
 *   POST /api/v1/professional/render    — submit render job
 *   GET  /api/v1/professional/status/:jobId — check job status
 *   GET  /api/v1/professional/health    — health check
 */

import { Router, Request, Response } from "express";
import { claudeRenderService } from "../service/video-edit/claude-render.service";
import { AIMediaModel } from "../model/ai-media.model";

export const professionalRouter = Router();

function validateApiKey(req: Request, res: Response): boolean {
  const expectedKey = process.env.CLAUDE_RENDER_PUBLIC_KEY || process.env.PROFESSIONAL_API_KEY || "igen-erp-pro-2024";
  const provided =
    (req.headers["x-api-key"] as string) ||
    (req.query.api_key as string) || "";

  if (!provided || provided !== expectedKey) {
    res.status(401).json({
      status: "error",
      message: "API key không hợp lệ. Truyền qua header X-API-Key.",
    });
    return false;
  }
  return true;
}

/**
 * GET /api/v1/professional/health
 */
professionalRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Professional Video Render API",
    timestamp: new Date().toISOString(),
    workerUrl: process.env.HERMES_WORKER_URL || "http://103.90.224.34:8643",
  });
});

/**
 * POST /api/v1/professional/render
 *
 * Body:
 * {
 *   facecamUrl: string,         // URL video facecam gốc (người nói)
 *   outline: string,            // Nội dung / kịch bản cần thể hiện
 *   scenes?: string[],          // Mặc định: hook, story, insight, pipeline, before_after, cta
 *   brandName?: string,         // Tên thương hiệu (mặc định: "iGen Tech")
 *   bgMusicUrl?: string,        // URL nhạc nền (tuỳ chọn)
 *   callbackUrl?: string,       // Webhook nhận kết quả khi xong
 *   userId?: string,            // ID user (để lưu lịch sử, tuỳ chọn)
 * }
 *
 * Response: { jobId, status: "queued", recordId }
 */
professionalRouter.post("/render", async (req: Request, res: Response) => {
  if (!validateApiKey(req, res)) return;

  const {
    facecamUrl,
    outline,
    scenes,
    brandName = "iGen Tech",
    bgMusicUrl = "",
    callbackUrl = "",
    userId = "api-user",
  } = req.body;

  if (!facecamUrl || !outline) {
    return res.status(400).json({
      status: "error",
      message: "Thiếu facecamUrl hoặc outline",
      required: { facecamUrl: "URL video facecam", outline: "Nội dung / kịch bản" },
    });
  }

  try {
    const result = await claudeRenderService.renderVideo(userId, {
      facecamUrl,
      outline,
      scenes,
      brandName,
      bgMusicUrl,
      webhookUrl: callbackUrl,
    });

    return res.status(200).json({
      status: "queued",
      jobId: result.record._id.toString(),
      recordId: result.record._id.toString(),
      message: "Job đã được gửi lên VPS. Dùng GET /status/:jobId để kiểm tra tiến độ.",
    });
  } catch (err: any) {
    console.error("[Professional API] render error:", err);
    return res.status(500).json({
      status: "error",
      message: err?.message || "Lỗi khởi tạo render job",
    });
  }
});

/**
 * GET /api/v1/professional/status/:jobId
 */
professionalRouter.get("/status/:jobId", async (req: Request, res: Response) => {
  if (!validateApiKey(req, res)) return;

  const { jobId } = req.params;
  if (!jobId || !/^[0-9a-fA-F]{24}$/.test(jobId)) {
    return res.status(400).json({ status: "error", message: "jobId không hợp lệ (MongoDB ObjectId)" });
  }

  try {
    const record = await AIMediaModel.findById(jobId).lean();
    if (!record) {
      return res.status(404).json({ status: "error", message: "Job không tồn tại" });
    }

    const meta = (record as any).metadata || {};
    return res.json({
      jobId,
      status: meta.status || "unknown",
      progress: meta.progress || 0,
      videoUrl: meta.status === "done" ? (record as any).url : null,
      renderLogs: (meta.renderLogs || []).slice(-10),
      createdAt: (record as any).createdAt,
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message });
  }
});
