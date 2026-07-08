import { Request, Response } from "express";
import { schedulerService } from "../service/scheduler.service";

export const schedulerController = {
  /**
   * POST /api/v1/scheduler/check-and-publish
   * API Endpoint được trigger từ n8n Scheduler để quét và tự động đăng bài viết đến hạn
   */
  async checkAndPublish(req: Request, res: Response) {
    try {
      // Xác thực token gửi từ n8n webhook nếu được cấu hình trong biến môi trường
      const secretToken = process.env.N8N_WEBHOOK_SECRET;
      const requestToken = req.headers["x-webhook-token"];

      if (secretToken && requestToken !== secretToken) {
        return res.status(401).json({
          status: "error",
          message: "Không có quyền truy cập endpoint này (Token xác thực không chính xác).",
        });
      }

      const result = await schedulerService.checkAndPublishPosts();
      
      return res.status(200).json({
        status: "success",
        message: "Thực thi tác vụ kiểm tra bài đăng định kỳ thành công",
        data: result,
      });
    } catch (error: any) {
      console.error("[schedulerController.checkAndPublish] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Gặp lỗi khi xử lý tác vụ Scheduler kiểm tra đăng bài viết",
        details: error.message,
      });
    }
  },

  /**
   * POST /api/v1/scheduler/schedule-post
   * Nhận yêu cầu lên lịch bài đăng từ frontend và gửi sang n8n
   */
  async schedulePost(req: Request, res: Response) {
    try {
      const result = await schedulerService.sendScheduleToN8n(req.body);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[schedulerController.schedulePost] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi kết nối hoặc xử lý gửi yêu cầu lên lịch sang n8n",
        details: error.message,
      });
    }
  },
};
