/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { tiktokMessengerController } from "../controller/tiktok-messenger.controller";
import { requireAuth } from "../middleware/auth";

export const tiktokMessengerRouter = Router();

// Endpoint webhook TikTok Business Messaging - Pháº£i cÃ´ng khai (public) Ä‘á»ƒ TikTok gá»i tá»›i
tiktokMessengerRouter.get("/webhook", tiktokMessengerController.verifyWebhook);
tiktokMessengerRouter.post("/webhook", tiktokMessengerController.receiveWebhookEvent);

// Routes phá»¥c vá»¥ Client Igen-ERP - YÃªu cáº§u xÃ¡c thá»±c Ä‘Äƒng nháº­p (requireAuth)
tiktokMessengerRouter.get("/conversations", requireAuth as any, tiktokMessengerController.getConversations);
tiktokMessengerRouter.get("/conversations/:conversationId/messages", requireAuth as any, tiktokMessengerController.getMessages);
tiktokMessengerRouter.post("/conversations/:conversationId/mark-read", requireAuth as any, tiktokMessengerController.markRead);
tiktokMessengerRouter.post("/conversations/:conversationId/resume-ai", requireAuth as any, tiktokMessengerController.resumeAI);
tiktokMessengerRouter.post("/reply", requireAuth as any, tiktokMessengerController.sendReply);
