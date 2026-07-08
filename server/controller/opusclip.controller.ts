import { Request, Response } from "express";
import { opusclipService } from "../service/opusclip.service";
import { OpusClipProjectModel } from "../model/opusclip-project.model";
import { broadcastEvent } from "../socket";

export const opusclipController = {
  /**
   * API: POST /api/v1/opusclip/projects
   * Khởi tạo dự án cắt ghép video dài thành ngắn bằng AI
   */
  async createProject(req: Request, res: Response) {
    try {
      const { videoUrl, name, lengthOption, sourceLang, brandTemplateId } = req.body;
      const userId = (req as any).user?.id || (req as any).user?._id;

      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập để sử dụng tính năng." });
      }

      console.log(`[OpusClipController.createProject] User ${userId} requested create project. URL: ${videoUrl}`);

      // 1. Gửi yêu cầu khởi tạo dự án lên OpusClip API
      const opusProject = await opusclipService.createProject({
        videoUrl,
        name: name || "Video Long-to-Short",
        lengthOption,
        sourceLang,
        brandTemplateId,
      });

      const projectId = opusProject.id || opusProject.projectId;
      if (!projectId) {
        throw new Error("OpusClip không trả về mã dự án (projectId) hợp lệ.");
      }

      // 2. Lưu thông tin dự án vào Database MongoDB với trạng thái "processing"
      const localProject = await OpusClipProjectModel.create({
        userId,
        projectId,
        videoUrl,
        name: name || `Project ${projectId}`,
        status: "processing",
        lengthOption,
        language: sourceLang || "auto",
        brandTemplateId: brandTemplateId || "",
        clips: [],
      });

      return res.status(201).json({
        status: "success",
        message: "Tạo dự án OpusClip thành công, đang tiến hành xử lý.",
        data: localProject,
      });
    } catch (error: any) {
      console.error("[OpusClipController.createProject] Error:", error.message);
      return res.status(500).json({
        status: "error",
        message: error.message || "Đã xảy ra lỗi khi tạo dự án OpusClip.",
      });
    }
  },

  /**
   * API: GET /api/v1/opusclip/projects
   * Lấy danh sách dự án cắt video của người dùng hiện tại (có phân trang & lọc)
   */
  async getProjects(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || (req as any).user?._id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập." });
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const status = req.query.status as string;

      const filter: Record<string, any> = { userId };
      if (status) {
        filter.status = status;
      }

      const total = await OpusClipProjectModel.countDocuments(filter);
      const list = await OpusClipProjectModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      return res.status(200).json({
        status: "success",
        data: {
          list,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("[OpusClipController.getProjects] Error:", error.message);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy danh sách dự án.",
      });
    }
  },

  /**
   * API: GET /api/v1/opusclip/projects/:projectId
   * Lấy chi tiết dự án cắt video
   */
  async getProjectDetail(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const userId = (req as any).user?.id || (req as any).user?._id;

      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập." });
      }

      const project = await OpusClipProjectModel.findOne({ projectId, userId });
      if (!project) {
        return res.status(404).json({ status: "error", message: "Không tìm thấy dự án." });
      }

      // Nếu dự án đang ở trạng thái xử lý, tiến hành sync thử trạng thái mới từ API
      if (project.status === "processing") {
        try {
          const detail = await opusclipService.getProjectDetail(projectId);
          const stage = detail.stage || detail.status;

          if (stage === "COMPLETE") {
            const clipsRes = await opusclipService.getClips(projectId);
            const mappedClips = (clipsRes?.list || []).map((clip: any) => ({
              clipId: clip.curationId || clip.id?.split(".")[1] || clip.clipId,
              videoUrl: clip.uriForExport || clip.videoUrl,
              title: clip.title || "",
              description: clip.description || "",
              hashtags: clip.hashtags || "",
              viralityScore: clip.viralityScore || clip.viralScore || 0,
              viralReason: clip.viralReason || "",
              duration: clip.durationMs ? Math.round(clip.durationMs / 1000) : 0,
              startTime: clip.timeRanges?.[0]?.[0] ? Math.round(clip.timeRanges[0][0] / 1000) : 0,
              endTime: clip.timeRanges?.[0]?.[1] ? Math.round(clip.timeRanges[0][1] / 1000) : 0,
            }));

            project.status = "completed";
            project.clips = mappedClips;
            await project.save();
          } else if (stage === "FAILED" || stage === "STALLED") {
            project.status = "failed";
            project.error = detail.error || "Dự án bị lỗi trong lúc xử lý.";
            await project.save();
          }
        } catch (syncErr: any) {
          console.warn(`[OpusClipController] Sync status failed for ${projectId}:`, syncErr.message);
        }
      }

      return res.status(200).json({
        status: "success",
        data: project,
      });
    } catch (error: any) {
      console.error("[OpusClipController.getProjectDetail] Error:", error.message);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy chi tiết dự án.",
      });
    }
  },

  /**
   * Webhook: POST /api/v1/opusclip/webhook
   * Tiếp nhận callback tự động từ OpusClip khi video xử lý xong hoặc bị lỗi
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      const rawBody = (req as any).rawBody;
      const headers = req.headers as Record<string, string | undefined>;

      console.log("[OpusClipController.handleWebhook] Received webhook. Verification in progress...");

      // 1. Xác thực chữ ký webhook bằng bảo mật HMAC-SHA256
      const isValid = opusclipService.verifyWebhookSignature(rawBody, headers);
      if (!isValid) {
        console.warn("[OpusClipController.handleWebhook] Webhook verification failed. Unauthorized.");
        return res.status(401).json({ status: "error", message: "Xác thực chữ ký thất bại." });
      }

      console.log("[OpusClipController.handleWebhook] Signature verified successfully. Processing payload...");

      // 2. Phân tích nội dung payload nhận được
      const payload = req.body;
      const projectId = payload.projectId || payload.id;
      const stage = payload.stage || payload.status; // COMPLETE, FAILED, processing, v.v.

      if (!projectId) {
        console.warn("[OpusClipController.handleWebhook] Webhook rejected: Missing projectId in payload.");
        return res.status(400).json({ status: "error", message: "Thiếu projectId." });
      }

      // Tìm kiếm dự án tương ứng trong MongoDB
      const project = await OpusClipProjectModel.findOne({ projectId });
      if (!project) {
        console.warn(`[OpusClipController.handleWebhook] Project ${projectId} not found in database.`);
        return res.status(200).json({ status: "success", message: "Dự án không tồn tại cục bộ." });
      }

      // 3. Xử lý cập nhật DB tuỳ theo trạng thái
      if (stage === "COMPLETE") {
        console.log(`[OpusClipController.handleWebhook] Project ${projectId} processed successfully. Fetching clips...`);
        
        // Gọi API lấy đầy đủ danh sách clips
        const clipsRes = await opusclipService.getClips(projectId);
        
        // Map các trường từ API về Database local của hệ thống
        const mappedClips = (clipsRes?.list || []).map((clip: any) => ({
          clipId: clip.curationId || clip.id?.split(".")[1] || clip.clipId,
          videoUrl: clip.uriForExport || clip.videoUrl,
          title: clip.title || "",
          description: clip.description || "",
          hashtags: clip.hashtags || "",
          viralityScore: clip.viralityScore || clip.viralScore || 0,
          viralReason: clip.viralReason || "",
          duration: clip.durationMs ? Math.round(clip.durationMs / 1000) : 0,
          startTime: clip.timeRanges?.[0]?.[0] ? Math.round(clip.timeRanges[0][0] / 1000) : 0,
          endTime: clip.timeRanges?.[0]?.[1] ? Math.round(clip.timeRanges[0][1] / 1000) : 0,
        }));

        project.status = "completed";
        project.clips = mappedClips;
        await project.save();

        console.log(`[OpusClipController.handleWebhook] Local database updated for ${projectId}. Broadcasting event...`);
        // Bắn sự kiện qua Socket.IO để cập nhật giao diện người dùng ngay lập tức
        broadcastEvent("opusclip:completed", {
          projectId,
          userId: project.userId.toString(),
          status: "completed",
          clips: mappedClips,
        });
      } else if (stage === "FAILED" || stage === "STALLED") {
        const errorMsg = payload.error || "Dự án bị lỗi trong lúc xử lý trên OpusClip.";
        console.log(`[OpusClipController.handleWebhook] Project ${projectId} failed processing. Error: ${errorMsg}`);
        
        project.status = "failed";
        project.error = errorMsg;
        await project.save();

        broadcastEvent("opusclip:failed", {
          projectId,
          userId: project.userId.toString(),
          status: "failed",
          error: project.error,
        });
      } else {
        console.log(`[OpusClipController.handleWebhook] Project ${projectId} stage update: ${stage}`);
      }

      return res.status(200).json({ status: "success", message: "Webhook processed successfully." });
    } catch (error: any) {
      console.error("[OpusClipController.handleWebhook] Error processing webhook:", error.message);
      return res.status(500).json({ status: "error", message: "Lỗi xử lý webhook." });
    }
  },
};
