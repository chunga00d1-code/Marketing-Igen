import { Request, Response } from "express";
import { tiktokMessengerService } from "../service/tiktok-messenger.service";
import { UserModel } from "../model/user.model";

async function getTikTokConfig(userId: string): Promise<{ isConnected: boolean; businessAccountId?: string }> {
  const dbUser = await UserModel.findById(userId).lean();
  if (!dbUser) {
    console.warn(`[TikTok Config] Không tìm thấy user với userId=${userId}`);
    return { isConnected: false };
  }

  // Try company integration lookup first
  const { SocialIntegrationModel } = require("../model/social-integration.model");
  const companyIntegration = await SocialIntegrationModel.findOne({
    companyCode: dbUser.companyCode,
    platform: "TikTok",
    isConnected: true
  }).lean();

  if (companyIntegration && companyIntegration.username) {
    console.log(`[TikTok Config] Dùng TikTok company integration của company=${dbUser.companyCode}, businessAccountId=${companyIntegration.username}, displayName=${companyIntegration.displayName}`);
    return { isConnected: true, businessAccountId: companyIntegration.username };
  }

  // Fallback to user-level integration
  const userTiktok = (dbUser as any).tiktokIntegration;
  if (userTiktok?.isConnected && userTiktok.username) {
    console.log(`[TikTok Config] Dùng TikTok integration cá nhân của user=${dbUser.email}, username=${userTiktok.username}`);
    return { isConnected: true, businessAccountId: userTiktok.username };
  }

  console.warn(`[TikTok Config] Không tìm thấy TikTok integration hoạt động cho user=${dbUser.email}, company=${dbUser.companyCode}`);
  return { isConnected: false };
}

export const tiktokMessengerController = {
  /**
   * POST /api/v1/tiktok/messenger/webhook
   * Endpoint nhận sự kiện Webhook từ TikTok Business Messaging
   */
  async receiveWebhookEvent(req: Request, res: Response): Promise<any> {
    try {
      const body = req.body;

      // Phản hồi 200 OK nhanh nhất có thể để TikTok không báo timeout
      res.status(200).send({ success: true, message: "EVENT_RECEIVED" });

      // Xử lý sự kiện ở chế độ nền (asynchronous)
      tiktokMessengerService.handleWebhookEvent(body).catch((err) => {
        console.error("[TikTok Messenger Webhook] Lỗi nghiêm trọng khi xử lý event dưới nền:", err);
      });
    } catch (error: any) {
      console.error("[TikTok Messenger Webhook] Lỗi tiếp nhận webhook:", error);
      res.status(200).send({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/v1/tiktok/messenger/webhook
   * TikTok Webhook Verification (Challenge Response)
   */
  async verifyWebhook(req: Request, res: Response): Promise<any> {
    try {
      const challenge = req.query.challenge || req.query["hub.challenge"];
      console.log("[TikTok Messenger Webhook] Verification request received. Challenge:", challenge);
      if (challenge) {
        return res.status(200).send(challenge);
      }
      return res.status(200).json({
        status: "ok",
        message: "TikTok messenger webhook endpoint is reachable",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[TikTok Messenger Webhook] Lỗi xác thực webhook:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * GET /api/v1/tiktok/messenger/conversations
   * API lấy danh sách hội thoại TikTok
   */
  async getConversations(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, businessAccountId } = await getTikTokConfig(userId);
      if (!isConnected || !businessAccountId) {
        return res.status(200).json({ success: true, data: [] });
      }

      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;

      const conversations = await tiktokMessengerService.getConversations(businessAccountId, { limit, skip });
      res.status(200).json({ success: true, data: conversations });
    } catch (error: any) {
      console.error("[TikTok Messenger Controller getConversations] Lỗi:", error);
      res.status(500).json({ success: false, message: error.message || "Không thể lấy danh sách cuộc hội thoại." });
    }
  },

  /**
   * GET /api/v1/tiktok/messenger/conversations/:conversationId/messages
   * API lấy lịch sử tin nhắn
   */
  async getMessages(req: any, res: Response): Promise<any> {
    try {
      const conversationId = req.params.conversationId;
      const userId = req.user?.id;
      const limit = Number(req.query.limit || 20);
      const before = typeof req.query.before === "string" ? req.query.before : undefined;
      const shouldSync = req.query.sync === "1" || req.query.sync === "true";

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, businessAccountId } = await getTikTokConfig(userId);

      if (!isConnected || !businessAccountId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp TikTok." });
      }

      const result = await tiktokMessengerService.getMessages(businessAccountId, conversationId, { limit, before, sync: shouldSync });

      res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error("[TikTok Messenger Controller getMessages] Lỗi:", error);
      res.status(500).json({ success: false, message: error.message || "Không thể lấy lịch sử tin nhắn." });
    }
  },

  /**
   * POST /api/v1/tiktok/messenger/conversations/:conversationId/mark-read
   */
  async markRead(req: any, res: Response): Promise<any> {
    try {
      const conversationId = req.params.conversationId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, businessAccountId } = await getTikTokConfig(userId);

      if (!isConnected || !businessAccountId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp TikTok." });
      }

      const result = await tiktokMessengerService.markConversationRead(businessAccountId, conversationId);

      res.status(200).json({
        success: true,
        message: "Đã đánh dấu đã đọc cuộc hội thoại TikTok.",
        data: result
      });
    } catch (error: any) {
      console.error("[TikTok Messenger Controller markRead] Lỗi:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể đánh dấu đã đọc cuộc hội thoại TikTok."
      });
    }
  },

  /**
   * POST /api/v1/tiktok/messenger/conversations/:conversationId/resume-ai
   */
  async resumeAI(req: any, res: Response): Promise<any> {
    try {
      const conversationId = req.params.conversationId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, businessAccountId } = await getTikTokConfig(userId);

      if (!isConnected || !businessAccountId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp TikTok." });
      }

      const conversation = await tiktokMessengerService.resumeAIAutoReply(businessAccountId, conversationId);

      res.status(200).json({
        success: true,
        message: "Đã kích hoạt lại AI cho cuộc hội thoại TikTok.",
        data: conversation
      });
    } catch (error: any) {
      console.error("[TikTok Messenger Controller resumeAI] Lỗi:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể kích hoạt lại AI cho cuộc hội thoại TikTok."
      });
    }
  },

  /**
   * POST /api/v1/tiktok/messenger/reply
   * API nhân viên / Bot AI phản hồi tin nhắn TikTok
   */
  async sendReply(req: any, res: Response): Promise<any> {
    try {
      const { text } = req.body;
      const conversationId = req.body.conversationId || req.body.recipientId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, businessAccountId } = await getTikTokConfig(userId);

      if (!isConnected || !businessAccountId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp TikTok." });
      }

      if (!conversationId || !text) {
        return res.status(400).json({ success: false, message: "Thiếu conversationId hoặc nội dung text." });
      }

      const result = await tiktokMessengerService.sendReply(businessAccountId, conversationId, text);

      res.status(200).json({
        success: true,
        message: "Đã gửi tin nhắn phản hồi TikTok thành công.",
        data: result
      });
    } catch (error: any) {
      console.error("[TikTok Messenger Controller sendReply] Gửi tin nhắn thất bại:", error);
      res.status(500).json({ success: false, message: error.message || "Gửi tin nhắn TikTok thất bại." });
    }
  },
};
