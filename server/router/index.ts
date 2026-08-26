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
import { creativeImageRouter } from "./creative-image.router";
import { htmlVideoRenderRouter } from "./html-video-render.router";
import { realEstateMapVideoRouter } from "./real-estate-map-video.router";
import { canvaRouter } from "./canva.router";
export const apiRouter = Router();
/**
 * GET /api/v1/health
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

apiRouter.use("/gemini", geminiRouter);

apiRouter.use("/elevenlabs", elevenlabsRouter);
apiRouter.use("/heygen", heygenRouter);

apiRouter.use("/facebook", facebookPostRouter);
apiRouter.use("/facebook", fbMessengerRouter);
apiRouter.use("/zalo", zaloMessengerRouter);
apiRouter.use("/tiktok/messenger", tiktokMessengerRouter);


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
apiRouter.use("/tiktok", tiktokRouter);
apiRouter.use("/tiktok-business", tiktokRouter);

apiRouter.use("/scheduler", schedulerRouter);
apiRouter.use("/marketing-campaigns", marketingCampaignRouter);
apiRouter.use(videoTemplateRouter);
apiRouter.use(videoProjectRouter);
apiRouter.use("/bulk-create", bulkCreateRouter);
apiRouter.use("/canva", canvaRouter);
apiRouter.use("/video-caption-projects", videoCaptionRouter);
apiRouter.use("/company-knowledge", companyKnowledgeRouter);
apiRouter.use("/creative-image", creativeImageRouter);
apiRouter.use(htmlVideoRenderRouter);
apiRouter.use(realEstateMapVideoRouter);

apiRouter.use("/media", mediaRouter);

apiRouter.use("/auth", authRouter);

apiRouter.use("/permissions", permissionRouter);

apiRouter.use("/role-permissions", rolePermissionRouter);

apiRouter.use("/wallet", walletRouter);

apiRouter.use("/crud", crudRouter);

apiRouter.use("/professional", professionalRouter);

apiRouter.use("/kling", klingRouter);

apiRouter.use("/opusclip", opusclipRouter);
