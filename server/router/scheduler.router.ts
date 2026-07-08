import { Router } from "express";
import Joi from "joi";
import { schedulerController } from "../controller/scheduler.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth, requirePermission } from "../middleware/auth";

export const schedulerRouter = Router();

const schedulePostSchema = {
  body: Joi.object({
    cardId: Joi.string().required().messages({
      "any.required": "Card ID không được để trống.",
      "string.empty": "Card ID không được để trống.",
    }),
    channel: Joi.string().valid("Facebook", "TikTok").required().messages({
      "any.required": "Kênh đăng tải không được để trống.",
      "any.only": "Kênh đăng tải phải là Facebook hoặc TikTok.",
    }),
    title: Joi.string().required().messages({
      "any.required": "Tiêu đề không được để trống.",
    }),
    bodyText: Joi.string().required().messages({
      "any.required": "Nội dung bài viết không được để trống.",
    }),
    imageUrl: Joi.string().uri().optional().allow(""),
    videoUrl: Joi.string().uri().optional().allow(""),
    scheduledDate: Joi.string().required().messages({
      "any.required": "Ngày lên lịch không được để trống.",
    }),
    scheduledTime: Joi.string().required().messages({
      "any.required": "Thời gian lên lịch không được để trống.",
    }),
    integration: Joi.object().required().messages({
      "any.required": "Thông tin liên kết MXH là bắt buộc.",
    }),
  }),
};

// Route trigger chạy kiểm tra và đăng bài viết (gọi từ n8n - không áp dụng user auth, tự validate webhook token)
schedulerRouter.post("/check-and-publish", schedulerController.checkAndPublish);

// Route đăng ký lịch hẹn đăng bài viết chuyển tiếp sang n8n (Yêu cầu đăng nhập và có quyền marketing:post)
schedulerRouter.post(
  "/schedule-post",
  requireAuth as any,
  requirePermission("marketing:post") as any,
  validateRequest(schedulePostSchema),
  schedulerController.schedulePost as any
);
