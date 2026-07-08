import { Request, Response } from "express";
import { zaloMessengerService } from "../service/zalo-messenger.service";
import { UserModel } from "../model/user.model";

async function getZaloOaConfig(userId: string): Promise<{ isConnected: boolean; oaId?: string }> {
  const dbUser = await UserModel.findById(userId).lean();
  if (!dbUser) {
    console.warn(`[Zalo Config] Khong tim thay user voi userId=${userId}`);
    return { isConnected: false };
  }

  if (dbUser.zaloIntegration?.isConnected && dbUser.zaloIntegration.oaId) {
    console.log(`[Zalo Config] Dung Zalo integration ca nhan cua user=${dbUser.email}, oaId=${dbUser.zaloIntegration.oaId}`);
    return { isConnected: true, oaId: dbUser.zaloIntegration.oaId };
  }

  // Try company integration lookup
  const { SocialIntegrationModel } = require("../model/social-integration.model");
  const companyIntegration = await SocialIntegrationModel.findOne({
    companyCode: dbUser.companyCode,
    platform: "Zalo",
    isConnected: true
  }).lean();

  if (companyIntegration && companyIntegration.username) {
    console.log(`[Zalo Config] Dung Zalo company integration cua company=${dbUser.companyCode}, oaId=${companyIntegration.username}, displayName=${companyIntegration.displayName}`);
    return { isConnected: true, oaId: companyIntegration.username };
  }

  console.warn(`[Zalo Config] Khong tim thay Zalo integration hoat dong cho user=${dbUser.email}, company=${dbUser.companyCode}`);
  return { isConnected: false };
}

export const zaloMessengerController = {
  /**
   * POST /api/v1/zalo/webhook
   * Endpoint nhận sự kiện Webhook từ Zalo OA
   */
  async receiveWebhookEvent(req: Request, res: Response): Promise<any> {
    try {
      const body = req.body;
      
      // Phản hồi 200 OK nhanh nhất có thể để Zalo không báo timeout
      res.status(200).send({ success: true, message: "EVENT_RECEIVED" });

      // Xử lý sự kiện ở chế độ nền (asynchronous)
      zaloMessengerService.handleWebhookEvent(body).catch((err) => {
        console.error("[Zalo Webhook Event] Lỗi nghiêm trọng khi xử lý event dưới nền:", err);
      });
    } catch (error: any) {
      console.error("[Zalo Webhook Event] Lỗi tiếp nhận webhook:", error);
      res.status(200).send({ success: false, error: error.message });
    }
  },

  /**
   * GET /api/v1/zalo/conversations
   * API lấy danh sách hội thoại Zalo OA
   */
  async getConversations(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);
      if (!isConnected || !oaId) {
        return res.status(200).json({ success: true, data: [] });
      }

      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;

      const conversations = await zaloMessengerService.getConversations(oaId, { limit, skip });
      res.status(200).json({ success: true, data: conversations });
    } catch (error: any) {
      console.error("[Zalo Controller getConversations] Lỗi khi xử lý:", error);
      res.status(500).json({ success: false, message: error.message || "Không thể lấy danh sách cuộc hội thoại." });
    }
  },

  /**
   * GET /api/v1/zalo/conversations/:recipientId/messages
   * API lấy lịch sử tin nhắn của một khách hàng
   */
  async getMessages(req: any, res: Response): Promise<any> {
    try {
      const { recipientId } = req.params;
      const conversationId = req.params.conversationId || recipientId;
      const userId = req.user?.id;
      const limit = Number(req.query.limit || 20);
      const before = typeof req.query.before === "string" ? req.query.before : undefined;
      const shouldSync = req.query.sync === "1" || req.query.sync === "true";

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);

      if (!isConnected || !oaId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp Zalo OA." });
      }

      const result = await zaloMessengerService.getMessages(oaId, conversationId, { limit, before, sync: shouldSync });

      res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error("[Zalo Controller getMessages] Lỗi khi lấy lịch sử tin nhắn:", error);
      res.status(500).json({ success: false, message: error.message || "Không thể lấy lịch sử tin nhắn." });
    }
  },

  /**
   * POST /api/v1/zalo/reply
   * API nhân viên / Bot AI phản hồi tin nhắn Zalo OA
   */
  async markRead(req: any, res: Response): Promise<any> {
    try {
      const { recipientId } = req.params;
      const conversationId = req.params.conversationId || recipientId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);

      if (!isConnected || !oaId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp Zalo OA." });
      }

      const conversation = await zaloMessengerService.markConversationRead(oaId, conversationId);

      res.status(200).json({
        success: true,
        message: "Đã đánh dấu đã đọc cuộc hội thoại Zalo.",
        data: conversation
      });
    } catch (error: any) {
      console.error("[Zalo Controller markRead] Lỗi khi đánh dấu đã đọc:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể đánh dấu đã đọc cuộc hội thoại Zalo."
      });
    }
  },

  async resumeAI(req: any, res: Response): Promise<any> {
    try {
      const { recipientId } = req.params;
      const conversationId = req.params.conversationId || recipientId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);

      if (!isConnected || !oaId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp Zalo OA." });
      }

      const conversation = await zaloMessengerService.resumeAIAutoReply(oaId, conversationId);

      res.status(200).json({
        success: true,
        message: "Đã kích hoạt lại AI cho cuộc hội thoại này.",
        data: conversation
      });
    } catch (error: any) {
      console.error("[Zalo Controller resumeAI] Lỗi:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể kích hoạt lại AI cho cuộc hội thoại Zalo."
      });
    }
  },

  async sendReply(req: any, res: Response): Promise<any> {
    try {
      const { text } = req.body;
      const conversationId = req.body.conversationId || req.body.recipientId;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);

      if (!isConnected || !oaId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp Zalo OA." });
      }

      if (!conversationId || !text) {
        return res.status(400).json({ success: false, message: "Thiếu conversationId hoặc nội dung text." });
      }

      const result = await zaloMessengerService.sendReply(oaId, conversationId, text);

      res.status(200).json({
        success: true,
        message: "Đã gửi tin nhắn phản hồi Zalo thành công.",
        data: result
      });
    } catch (error: any) {
      console.error("[Zalo Controller sendReply] Gửi tin nhắn thất bại:", error);
      res.status(500).json({ success: false, message: error.message || "Gửi tin nhắn Zalo thất bại." });
    }
  },

  /**
   * POST /api/v1/zalo/save-integration
   * API cấu hình lưu tích hợp Zalo thủ công (Mock/Real)
   */
  async saveIntegration(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      const { oaId, oaName, accessToken, refreshToken, isMock } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      if (!oaId || !oaName || !accessToken) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ các trường bắt buộc." });
      }

      const integration = await zaloMessengerService.saveIntegrationManual(userId, {
        oaId,
        oaName,
        accessToken,
        refreshToken: refreshToken || "",
        isMock: !!isMock
      });

      res.status(200).json({
        success: true,
        message: "Cập nhật tích hợp Zalo OA thành công.",
        data: integration
      });
    } catch (error: any) {
      console.error("[Zalo Controller saveIntegration] Thất bại:", error);
      res.status(500).json({ success: false, message: error.message || "Lưu tích hợp thất bại." });
    }
  },

  async validateIntegration(req: any, res: Response): Promise<any> {
    try {
      const { oaId, oaName, accessToken } = req.body;
      if (!oaId || !accessToken) {
        return res.status(400).json({ success: false, message: "Vui long nhap OA ID va Access Token." });
      }

      const result = await zaloMessengerService.validateIntegrationToken({
        oaId,
        oaName,
        accessToken,
      });

      return res.status(200).json({
        success: true,
        message: "Xac thuc Zalo OA voi ben thu 3 thanh cong.",
        data: result,
      });
    } catch (error: any) {
      console.error("[Zalo Controller validateIntegration] That bai:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Khong the xac thuc Zalo OA.",
      });
    }
  },

  /**
   * DELETE /api/v1/zalo/integration
   * API hủy tích hợp Zalo OA
   */
  async removeIntegration(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      await zaloMessengerService.removeIntegration(userId);
      res.status(200).json({ success: true, message: "Đã hủy liên kết Zalo OA thành công." });
    } catch (error: any) {
      console.error("[Zalo Controller removeIntegration] Thất bại:", error);
      res.status(500).json({ success: false, message: error.message || "Hủy liên kết thất bại." });
    }
  },

  async diagnoseOaConfig(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);
      const diagnostic = await zaloMessengerService.diagnoseOaConfig(userId, oaId);
      return res.status(200).json({
        success: true,
        data: {
          isConnected,
          oaId: oaId || null,
          ...diagnostic,
        }
      });
    } catch (error: any) {
      console.error("[Zalo Controller diagnoseOaConfig] Loi:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Không thể chẩn đoán cấu hình Zalo OA.",
      });
    }
  },

  async diagnoseConversation(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      const { conversationId } = req.params;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Nguoi dung chua dang nhap." });
      }

      const { isConnected, oaId } = await getZaloOaConfig(userId);
      if (!isConnected || !oaId) {
        return res.status(403).json({ success: false, message: "Ban chua cau hinh tich hop Zalo OA." });
      }

      const diagnostic = await zaloMessengerService.diagnoseConversation(oaId, conversationId);
      return res.status(200).json({ success: true, data: diagnostic });
    } catch (error: any) {
      console.error("[Zalo Controller diagnoseConversation] Loi:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Khong the chan doan hoi thoai Zalo.",
      });
    }
  }
};
