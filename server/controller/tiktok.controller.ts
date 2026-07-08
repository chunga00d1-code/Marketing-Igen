import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { tiktokService } from "../service/tiktok.service";

export const tiktokController = {
  async startOAuth(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const companyCode = authReq.user?.companyCode;
      const email = authReq.user?.email;
      const target = String(req.query.target || "personal");
      const integrationId = String(req.query.integrationId || "").trim();
      const clientKey = String(req.query.clientKey || "").trim();
      const clientSecret = String(req.query.clientSecret || "").trim();

      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Nguoi dung chua xac thuc.",
        });
      }

      const result = await tiktokService.createOAuthSession({
        userId,
        companyCode,
        email,
        target,
        integrationId,
        clientKey: clientKey || undefined,
        clientSecret: clientSecret || undefined,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[tiktokController.startOAuth] Error:", error);
      return res.status(400).json({
        status: "error",
        message: error.message || "Khong the khoi tao ket noi TikTok.",
      });
    }
  },

  async oauthCallback(req: Request, res: Response) {
    try {
      const result = await tiktokService.completeOAuthCallback({
        code: String(req.query.code || "").trim(),
        state: String(req.query.state || "").trim(),
        error: String(req.query.error || "").trim(),
        errorDescription: String(req.query.error_description || "").trim(),
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(tiktokService.renderOAuthPopupPage(result));
    } catch (error: any) {
      console.error("[tiktokController.oauthCallback] Error:", error);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(
        tiktokService.renderOAuthPopupPage({
          ok: false,
          error: error.message || "Khong the hoan tat ket noi TikTok.",
        })
      );
    }
  },

  async publish(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const companyCode = authReq.user?.companyCode;

      const {
        cardId,
        caption,
        videoUrl,
        privacyLevel,
        accessToken,
        username,
        scheduledTime,
        integrationId,
      } = req.body;

      const result = await tiktokService.publishVideo(
        cardId,
        caption,
        videoUrl,
        privacyLevel,
        accessToken,
        username,
        scheduledTime,
        integrationId,
        companyCode
      );

      await tiktokService.registerPublishTracking(cardId, result);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[tiktokController.publish] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi ket noi hoac xu ly dang bai len TikTok",
        details: error.message,
      });
    }
  },

  async validateToken(req: Request, res: Response) {
    try {
      const { username, accessToken } = req.body;
      const result = await tiktokService.validateToken(username, accessToken);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[tiktokController.validateToken] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi xac thuc token TikTok",
        details: error.message,
      });
    }
  },

  async getCreatorInfo(req: Request, res: Response) {
    try {
      const { accessToken } = req.body;
      const result = await tiktokService.getCreatorInfo(accessToken);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[tiktokController.getCreatorInfo] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi lay thong tin creator TikTok",
        details: error.message,
      });
    }
  },

  async receiveWebhook(req: Request, res: Response) {
    try {
      const token = String(
        req.headers["x-tiktok-webhook-secret"] || req.headers["x-webhook-token"] || req.query.token || ""
      );

      if (!tiktokService.verifyWebhookToken(token)) {
        return res.status(401).json({
          status: "error",
          message: "Webhook token khong hop le",
        });
      }

      const result = await tiktokService.processWebhook(req.body);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[tiktokController.receiveWebhook] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Loi xu ly webhook TikTok",
        details: error.message,
      });
    }
  },
};
