import { Router } from "express";
import { tiktokMessengerController } from "../controller/tiktok-messenger.controller";
import { requireAuth } from "../middleware/auth";

export const tiktokMessengerRouter = Router();

// Endpoint webhook TikTok Business Messaging - Phải công khai (public) để TikTok gọi tới
tiktokMessengerRouter.get("/webhook", tiktokMessengerController.verifyWebhook);
tiktokMessengerRouter.post("/webhook", tiktokMessengerController.receiveWebhookEvent);

// Routes phục vụ Client Igen-ERP - Yêu cầu xác thực đăng nhập (requireAuth)
tiktokMessengerRouter.get("/conversations", requireAuth as any, tiktokMessengerController.getConversations);
tiktokMessengerRouter.get("/conversations/:conversationId/messages", requireAuth as any, tiktokMessengerController.getMessages);
tiktokMessengerRouter.post("/conversations/:conversationId/mark-read", requireAuth as any, tiktokMessengerController.markRead);
tiktokMessengerRouter.post("/conversations/:conversationId/resume-ai", requireAuth as any, tiktokMessengerController.resumeAI);
tiktokMessengerRouter.post("/reply", requireAuth as any, tiktokMessengerController.sendReply);
