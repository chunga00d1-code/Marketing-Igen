/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import mongoose from "mongoose";
import { geminiRouter } from "./gemini.router";
import { elevenlabsRouter } from "./elevenlabs.router";
import { facebookPostRouter } from "./facebook-post.router";
import { fbMessengerRouter } from "./fb-messenger.router";
import { zaloMessengerRouter } from "./zalo-messenger.router";
import { tiktokMessengerRouter } from "./tiktok-messenger.router";
import { tiktokRouter } from "./tiktok.router";
import { tiktokController } from "../controller/tiktok.controller";
import { schedulerRouter } from "./scheduler.router";
import { mediaRouter } from "./media.router";
import { authRouter } from "./auth.router";
import { permissionRouter } from "./permission.router";
import { rolePermissionRouter } from "./role-permission.router";
import { crudRouter } from "./crud.router";
import { heygenRouter } from "./heygen.router";
import { walletRouter } from "./wallet.router";
import { professionalRouter } from "./professional.router";
import { klingRouter } from "./kling.router";
import { opusclipRouter } from "./opusclip.router";
import { marketingCampaignRouter } from "./marketing-campaign.router";
import { videoTemplateRouter } from "./video-template.router";
import { videoProjectRouter } from "./video-project.router";
import { shotstackWebhookRouter } from "./shotstack-webhook.router";
import { bulkCreateRouter } from "./bulk-create.router";
import { videoCaptionRouter } from "./video-caption.router";
import { companyKnowledgeRouter } from "./company-knowledge.router";
import { elevenLabsSttWebhookController } from "../controller/elevenlabs-stt-webhook.controller";
export const apiRouter = Router();
/**
 * GET /api/v1/health
 * Health Check API Ä‘á»ƒ giÃ¡m sÃ¡t tráº¡ng thÃ¡i cá»§a há»‡ thá»‘ng
 */
apiRouter.get("/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      server: "up",
      database: isDbConnected ? "online (connected via MongoDB)" : "offline",
    },
  });
});

// Gáº¯n káº¿t router phá»¥ cá»§a Gemini
apiRouter.use("/gemini", geminiRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a ElevenLabs
apiRouter.use("/elevenlabs", elevenlabsRouter);
apiRouter.use("/heygen", heygenRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a Facebook Post qua n8n & Facebook Messenger
apiRouter.use("/facebook", facebookPostRouter);
apiRouter.use("/facebook", fbMessengerRouter);
apiRouter.use("/zalo", zaloMessengerRouter);
apiRouter.use("/tiktok/messenger", tiktokMessengerRouter);


// Gáº¯n káº¿t router phá»¥ cá»§a TikTok
apiRouter.get("/webhooks/tiktok", (req, res) => {
  return res.status(200).json({
    status: "ok",
    path: "/api/v1/webhooks/tiktok",
    message: "TikTok webhook endpoint is reachable",
    timestamp: new Date().toISOString(),
  });
});
apiRouter.post("/webhooks/tiktok", tiktokController.receiveWebhook as any);
apiRouter.use(shotstackWebhookRouter);
apiRouter.get("/webhooks/elevenlabs/speech-to-text", (req, res) => {
  return res.status(200).json({
    status: "ok",
    configured: Boolean(
      process.env.ELEVENLABS_STT_WEBHOOK_SECRET?.trim() ||
      process.env.ELEVENLABS_STT_WEBHOOK_SECRETS?.trim()
    ),
    path: "/api/v1/webhooks/elevenlabs/speech-to-text",
  });
});
apiRouter.post(
  "/webhooks/elevenlabs/speech-to-text",
  elevenLabsSttWebhookController.receive as any
);
apiRouter.use("/tiktok", tiktokRouter);
apiRouter.use("/tiktok-business", tiktokRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a Scheduler
apiRouter.use("/scheduler", schedulerRouter);
apiRouter.use("/marketing-campaigns", marketingCampaignRouter);
apiRouter.use(videoTemplateRouter);
apiRouter.use(videoProjectRouter);
apiRouter.use("/bulk-create", bulkCreateRouter);
apiRouter.use("/video-caption-projects", videoCaptionRouter);
apiRouter.use("/company-knowledge", companyKnowledgeRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a Media Cloudinary Relay
apiRouter.use("/media", mediaRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a XÃ¡c thá»±c JWT
apiRouter.use("/auth", authRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a Quáº£n lÃ½ mÃ£ quyá»n há»‡ thá»‘ng
apiRouter.use("/permissions", permissionRouter);

// Gáº¯n káº¿t router phá»¥ cá»§a Cáº¥u hÃ¬nh gÃ¡n quyá»n cho Role theo doanh nghiá»‡p
apiRouter.use("/role-permissions", rolePermissionRouter);

// Gáº¯n káº¿t router vÃ­ cá»§a ngÆ°á»i dÃ¹ng & náº¡p tiá»n PayOS
apiRouter.use("/wallet", walletRouter);

// Gáº¯n káº¿t router CRUD Ä‘a nÄƒng (MongoDB)
apiRouter.use("/crud", crudRouter);

// Public Professional Video Render API (auth báº±ng X-API-Key header)
apiRouter.use("/professional", professionalRouter);

// Kling AI â€” Motion Control video generation
apiRouter.use("/kling", klingRouter);

// OpusClip AI â€” Long-to-Short video clipping
apiRouter.use("/opusclip", opusclipRouter);
