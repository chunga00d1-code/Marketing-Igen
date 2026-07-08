import { Router } from "express";
import { fbMessengerController } from "../controller/fb-messenger.controller";
import { requireAuth } from "../middleware/auth";

export const fbMessengerRouter = Router();

// Routes dành cho Webhook của Meta (Facebook) - Phải công khai (public) để Facebook gọi tới
fbMessengerRouter.get("/webhook", fbMessengerController.verifyWebhook);
fbMessengerRouter.post("/webhook", fbMessengerController.receiveWebhookEvent);

// Authenticated diagnostic endpoint for AI auto-reply logs.
fbMessengerRouter.get("/debug-ai-logs", requireAuth as any, fbMessengerController.debugAILogs);

// Routes dành cho Igen-ERP Client (Frontend) - Bắt buộc yêu cầu đăng nhập (requireAuth)
fbMessengerRouter.get("/messenger/conversations", requireAuth as any, fbMessengerController.getConversations);
fbMessengerRouter.get("/messenger/conversations/:recipientId/messages", requireAuth as any, fbMessengerController.getMessages);
fbMessengerRouter.post("/messenger/conversations/:recipientId/mark-read", requireAuth as any, fbMessengerController.markRead);
fbMessengerRouter.post("/messenger/conversations/:recipientId/resume-ai", requireAuth as any, fbMessengerController.resumeAI);
fbMessengerRouter.get("/messenger/diagnostics/page", requireAuth as any, fbMessengerController.diagnosePageConfig);
fbMessengerRouter.get("/messenger/diagnostics/:conversationId", requireAuth as any, fbMessengerController.diagnoseConversation);
fbMessengerRouter.post("/messenger/reply", requireAuth as any, fbMessengerController.sendReply);
fbMessengerRouter.get("/messenger/post-detail/:postId", requireAuth as any, fbMessengerController.getPostDetail);
