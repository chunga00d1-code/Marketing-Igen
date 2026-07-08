import { Request, Response } from "express";
import { heygenService } from "../service/heygen.service";
import { walletService, API_COSTS } from "../service/wallet.service";

function getErrorStatus(error: any) {
  const statusCode = Number(error?.statusCode);
  if (statusCode >= 400 && statusCode < 500) {
    return statusCode;
  }
  return 500;
}

export const heygenController = {
  async getLibrary(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }
      const force = req.query.force === "true";
      return res.status(200).json(await heygenService.getLibrary(userId, force));
    } catch (error: any) {
      console.error("[heygenController.getLibrary] Error:", error);
      return res.status(getErrorStatus(error)).json({ status: "error", message: "Khong the lay thu vien HeyGen", details: error.message });
    }
  },

  async createAvatarVideo(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }

      await walletService.checkBalance(userId, API_COSTS.HEYGEN_VIDEO);
      const result = await heygenService.createAvatarVideo(userId, req.body);
      await walletService.deductBalance(userId, API_COSTS.HEYGEN_VIDEO, "Chi phi tao video Avatar AI HeyGen");

      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[heygenController.createAvatarVideo] Error:", error);
      const statusCode = error.statusCode || getErrorStatus(error);
      return res.status(statusCode).json({ status: "error", message: error.message || "Loi tao video avatar HeyGen", details: error.message });
    }
  },

  async getVideoStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }
      return res.status(200).json(await heygenService.getVideoStatus(userId, req.params.videoId, req.body));
    } catch (error: any) {
      console.error("[heygenController.getVideoStatus] Error:", error);
      return res.status(getErrorStatus(error)).json({ status: "error", message: "Loi lay trang thai video", details: error.message });
    }
  },

  async getVideoHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }
      return res.status(200).json({ status: "success", history: await heygenService.getVideoHistory(userId) });
    } catch (error: any) {
      console.error("[heygenController.getVideoHistory] Error:", error);
      return res.status(getErrorStatus(error)).json({ status: "error", message: "Loi lay lich su video", details: error.message });
    }
  },

  async deleteVideoHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }
      return res.status(200).json(await heygenService.deleteVideoHistory(userId, req.params.id));
    } catch (error: any) {
      console.error("[heygenController.deleteVideoHistory] Error:", error);
      return res.status(getErrorStatus(error)).json({ status: "error", message: "Loi xoa lich su video", details: error.message });
    }
  },

  async receiveWebhook(req: Request, res: Response) {
    try {
      const token = String(
        req.headers["x-heygen-webhook-secret"] ||
          req.headers["x-webhook-token"] ||
          req.query.token ||
          ""
      );

      console.log("[heygenController.receiveWebhook] Incoming webhook:", {
        query: req.query,
        hasToken: Boolean(token),
        bodyKeys: Object.keys(req.body || {}),
        videoId:
          req.body?.data?.video_id ||
          req.body?.data?.id ||
          req.body?.video_id ||
          req.body?.videoId ||
          req.body?.id ||
          "",
        eventType: req.body?.event_type || req.body?.event || req.body?.type || "",
        status:
          req.body?.data?.status ||
          req.body?.data?.video_status ||
          req.body?.status ||
          req.body?.video_status ||
          "",
      });

      if (!heygenService.verifyWebhookToken(token)) {
        console.warn("[heygenController.receiveWebhook] Webhook token rejected");
        return res.status(401).json({ status: "error", message: "Webhook token khong hop le" });
      }

      const result = await heygenService.processWebhook(req.body);
      console.log("[heygenController.receiveWebhook] Webhook processed:", result);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[heygenController.receiveWebhook] Error:", error);
      return res.status(getErrorStatus(error)).json({ status: "error", message: "Loi xu ly webhook HeyGen", details: error.message });
    }
  },
};
