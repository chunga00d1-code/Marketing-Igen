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
export const apiRouter = Router();
/**
 * GET /api/v1/health
 * Health Check API để giám sát trạng thái của hệ thống
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

// Gắn kết router phụ của Gemini
apiRouter.use("/gemini", geminiRouter);

// Gắn kết router phụ của ElevenLabs
apiRouter.use("/elevenlabs", elevenlabsRouter);
apiRouter.use("/heygen", heygenRouter);

// Gắn kết router phụ của Facebook Post qua n8n & Facebook Messenger
apiRouter.use("/facebook", facebookPostRouter);
apiRouter.use("/facebook", fbMessengerRouter);
apiRouter.use("/zalo", zaloMessengerRouter);
apiRouter.use("/tiktok/messenger", tiktokMessengerRouter);


// Gắn kết router phụ của TikTok
apiRouter.get("/webhooks/tiktok", (req, res) => {
  return res.status(200).json({
    status: "ok",
    path: "/api/v1/webhooks/tiktok",
    message: "TikTok webhook endpoint is reachable",
    timestamp: new Date().toISOString(),
  });
});
apiRouter.post("/webhooks/tiktok", tiktokController.receiveWebhook as any);
apiRouter.use("/tiktok", tiktokRouter);
apiRouter.use("/tiktok-business", tiktokRouter);

// Gắn kết router phụ của Scheduler
apiRouter.use("/scheduler", schedulerRouter);

// Gắn kết router phụ của Media Cloudinary Relay
apiRouter.use("/media", mediaRouter);

// Gắn kết router phụ của Xác thực JWT
apiRouter.use("/auth", authRouter);

// Gắn kết router phụ của Quản lý mã quyền hệ thống
apiRouter.use("/permissions", permissionRouter);

// Gắn kết router phụ của Cấu hình gán quyền cho Role theo doanh nghiệp
apiRouter.use("/role-permissions", rolePermissionRouter);

// Gắn kết router ví của người dùng & nạp tiền PayOS
apiRouter.use("/wallet", walletRouter);

// Gắn kết router CRUD đa năng (MongoDB)
apiRouter.use("/crud", crudRouter);

// Public Professional Video Render API (auth bằng X-API-Key header)
apiRouter.use("/professional", professionalRouter);

// Kling AI — Motion Control video generation
apiRouter.use("/kling", klingRouter);

// OpusClip AI — Long-to-Short video clipping
apiRouter.use("/opusclip", opusclipRouter);
