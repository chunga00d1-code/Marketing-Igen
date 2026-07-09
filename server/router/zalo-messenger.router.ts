/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { zaloMessengerController } from "../controller/zalo-messenger.controller";
import { requireAuth } from "../middleware/auth";

export const zaloMessengerRouter = Router();

// Endpoint webhook cá»§a Zalo OA - Pháº£i cÃ´ng khai (public) Ä‘á»ƒ Zalo gá»i tá»›i
zaloMessengerRouter.post("/webhook", zaloMessengerController.receiveWebhookEvent);

// Routes phá»¥c vá»¥ Client Igen-ERP - YÃªu cáº§u xÃ¡c thá»±c Ä‘Äƒng nháº­p (requireAuth)
zaloMessengerRouter.post("/validate-integration", requireAuth as any, zaloMessengerController.validateIntegration);
zaloMessengerRouter.post("/save-integration", requireAuth as any, zaloMessengerController.saveIntegration);
zaloMessengerRouter.delete("/integration", requireAuth as any, zaloMessengerController.removeIntegration);
zaloMessengerRouter.get("/diagnostics/oa", requireAuth as any, zaloMessengerController.diagnoseOaConfig);
zaloMessengerRouter.get("/diagnostics/:conversationId", requireAuth as any, zaloMessengerController.diagnoseConversation);
zaloMessengerRouter.get("/conversations", requireAuth as any, zaloMessengerController.getConversations);
zaloMessengerRouter.get("/conversations/:recipientId/messages", requireAuth as any, zaloMessengerController.getMessages);
zaloMessengerRouter.post("/conversations/:recipientId/mark-read", requireAuth as any, zaloMessengerController.markRead);
zaloMessengerRouter.post("/conversations/:recipientId/resume-ai", requireAuth as any, zaloMessengerController.resumeAI);
zaloMessengerRouter.post("/reply", requireAuth as any, zaloMessengerController.sendReply);
