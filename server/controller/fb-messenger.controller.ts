import { Request, Response } from "express";
import { fbMessengerService } from "../service/fb-messenger.service";
import { UserModel } from "../model/user.model";
import { AIReplyLogModel } from "../model/ai-reply-log.model";

async function getFacebookPageConfig(userId: string, requestedPageId?: string): Promise<{ isConnected: boolean; pageId?: string }> {
  const dbUser = await UserModel.findById(userId).lean();
  if (!dbUser) {
    console.warn(`[FB Config] Khong tim thay user voi userId=${userId}`);
    return { isConnected: false };
  }

  const cleanRequestedPageId = requestedPageId ? String(requestedPageId).trim() : "";

  if (cleanRequestedPageId) {
    // 1. Check user's personal integration
    if (
      dbUser.facebookIntegration?.isConnected &&
      dbUser.facebookIntegration.pageId === cleanRequestedPageId
    ) {
      console.log(`[FB Config] Dung Facebook integration ca nhan theo yeu cau cua user=${dbUser.email}, pageId=${cleanRequestedPageId}`);
      return { isConnected: true, pageId: cleanRequestedPageId };
    }

    // 2. Check company integrations
    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegration = await SocialIntegrationModel.findOne({
      companyCode: dbUser.companyCode,
      platform: "Facebook",
      username: cleanRequestedPageId,
      isConnected: true
    }).lean();

    if (companyIntegration) {
      console.log(`[FB Config] Dung Facebook integration doanh nghiep theo yeu cau cua company=${dbUser.companyCode}, pageId=${cleanRequestedPageId}`);
      return { isConnected: true, pageId: cleanRequestedPageId };
    }
  }

  // Fallback: original logic
  if (dbUser.facebookIntegration?.isConnected && dbUser.facebookIntegration.pageId) {
    console.log(`[FB Config] Dung Facebook integration ca nhan cua user=${dbUser.email}, pageId=${dbUser.facebookIntegration.pageId}`);
    return { isConnected: true, pageId: dbUser.facebookIntegration.pageId };
  }

  const { SocialIntegrationModel } = require("../model/social-integration.model");
  const companyIntegration = await SocialIntegrationModel.findOne({
    companyCode: dbUser.companyCode,
    platform: "Facebook",
    isConnected: true
  }).lean();

  if (companyIntegration && companyIntegration.username) {
    console.log(`[FB Config] Fallback Facebook company integration cua company=${dbUser.companyCode}, pageId=${companyIntegration.username}, displayName=${companyIntegration.displayName}`);
    return { isConnected: true, pageId: companyIntegration.username };
  }

  console.warn(`[FB Config] Khong tim thay Facebook integration hoat dong cho user=${dbUser.email}, company=${dbUser.companyCode}`);
  return { isConnected: false };
}


export const fbMessengerController = {
  /**
   * GET /api/v1/facebook/webhook
   * Facebook gọi endpoint này để kiểm tra xem Webhook URL có hoạt động đúng và an toàn không
   */
  async verifyWebhook(req: Request, res: Response): Promise<any> {
    const mode = req.query["hub.mode"] as string;
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;

    console.log(`[Facebook Webhook Verification] Bắt đầu xác thực: mode=${mode}, token=${token}, challenge=${challenge}`);

    try {
      const result = await fbMessengerService.verifyWebhook(mode, token, challenge);
      console.log("[Facebook Webhook Verification] Xác thực thành công! Phản hồi challenge về Meta.");
      // Phản hồi lại chuỗi challenge bằng plain text
      res.status(200).send(result);
    } catch (error: any) {
      console.error("[Facebook Webhook Verification] Xác thực thất bại:", error.message || error);
      res.status(403).send(error.message || "Xác thực thất bại");
    }
  },

  /**
   * POST /api/v1/facebook/webhook
   * Facebook gọi endpoint này mỗi khi có sự kiện tin nhắn mới
   */
  async receiveWebhookEvent(req: Request, res: Response): Promise<any> {
    try {
      const body = req.body;
      const entryCount = Array.isArray(body?.entry) ? body.entry.length : 0;
      console.log(`[Facebook Webhook Event] Nhan webhook object=${body?.object || "unknown"}, entries=${entryCount}`);
      
      // Phản hồi nhanh chóng cho Meta để tránh timeout
      res.status(200).send("EVENT_RECEIVED");

      // Xử lý không đồng bộ dưới background
      fbMessengerService.handleWebhookEvent(body).catch((err) => {
        console.error("[Facebook Webhook Event] Lỗi nghiêm trọng khi xử lý event dưới nền:", err);
      });
    } catch (error: any) {
      console.error("[Facebook Webhook Event] Lỗi tiếp nhận webhook:", error);
      res.status(200).send("EVENT_RECEIVED_WITH_ERROR");
    }
  },

  /**
   * GET /api/v1/facebook/messenger/conversations
   * API để Frontend lấy danh sách hội thoại của trang
   */
  async getConversations(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      const requestedPageId = typeof req.query.pageId === "string" ? req.query.pageId : undefined;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Người dùng chưa đăng nhập."
        });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);

      // Nếu người dùng hiện tại chưa kết nối Facebook Page, trả về mảng rỗng ngay lập tức
      if (!isConnected || !pageId) {
        return res.status(200).json({
          success: true,
          data: []
        });
      }

      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
      const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
      const shouldSync = req.query.sync === "1" || req.query.sync === "true";
      
      const conversations = await fbMessengerService.getConversations(pageId, { 
        sync: shouldSync,
        limit,
        skip
      });
      
      res.status(200).json({
        success: true,
        data: conversations
      });
    } catch (error: any) {
      console.error("[FB Controller getConversations] Lỗi khi xử lý:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể lấy danh sách cuộc hội thoại."
      });
    }
  },

  /**
   * GET /api/v1/facebook/messenger/conversations/:recipientId/messages
   * API lấy lịch sử tin nhắn của một khách hàng
   */
  async getMessages(req: any, res: Response): Promise<any> {
    try {
      const { recipientId: conversationId } = req.params;
      const userId = req.user?.id;
      const limit = Number(req.query.limit || 20);
      const before = typeof req.query.before === "string" ? req.query.before : undefined;
      const shouldSync = req.query.sync === "1" || req.query.sync === "true";
      const requestedPageId = typeof req.query.pageId === "string" ? req.query.pageId : undefined;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Người dùng chưa đăng nhập."
        });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);

      // Bảo vệ: Đảm bảo khách hàng này thuộc về Page ID của người dùng hiện tại
      if (!isConnected || !pageId) {
        return res.status(403).json({
          success: false,
          message: "Quyền truy cập bị từ chối. Bạn chưa cấu hình tích hợp Facebook."
        });
      }

      const result = await fbMessengerService.getMessages(pageId, conversationId, { limit, before, sync: shouldSync });

      res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error("[FB Controller getMessages] Lỗi khi lấy lịch sử tin nhắn:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể lấy lịch sử tin nhắn."
      });
    }
  },

  /**
   * POST /api/v1/facebook/messenger/reply
   * API để nhân viên/AI gửi tin nhắn trả lời khách hàng
   */
  async markRead(req: any, res: Response): Promise<any> {
    try {
      const { recipientId: conversationId } = req.params;
      const userId = req.user?.id;
      const requestedPageId = typeof req.query.pageId === "string" ? req.query.pageId : undefined;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Người dùng chưa đăng nhập."
        });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);

      if (!isConnected || !pageId) {
        return res.status(403).json({
          success: false,
          message: "Quyền truy cập bị từ chối. Bạn chưa cấu hình tích hợp Facebook."
        });
      }

      const conversation = await fbMessengerService.markConversationRead(pageId, conversationId);

      res.status(200).json({
        success: true,
        message: "Đã đánh dấu đã đọc cuộc hội thoại Facebook.",
        data: conversation
      });
    } catch (error: any) {
      console.error("[FB Controller markRead] Lỗi khi đánh dấu đã đọc:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể đánh dấu đã đọc cuộc hội thoại."
      });
    }
  },

  async resumeAI(req: any, res: Response): Promise<any> {
    try {
      const { recipientId: conversationId } = req.params;
      const userId = req.user?.id;
      const requestedPageId = typeof req.query.pageId === "string" ? req.query.pageId : undefined;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Người dùng chưa đăng nhập."
        });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);

      if (!isConnected || !pageId) {
        return res.status(403).json({
          success: false,
          message: "Quyền truy cập bị từ chối. Bạn chưa cấu hình tích hợp Facebook."
        });
      }

      const conversation = await fbMessengerService.resumeAIAutoReply(pageId, conversationId);

      res.status(200).json({
        success: true,
        message: "Đã kích hoạt lại AI cho cuộc hội thoại này.",
        data: conversation
      });
    } catch (error: any) {
      console.error("[FB Controller resumeAI] Lỗi:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Không thể kích hoạt lại AI cho cuộc hội thoại này."
      });
    }
  },

  async sendReply(req: any, res: Response): Promise<any> {
    try {
      const { recipientId: conversationId, text, pageId: requestedPageId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Người dùng chưa đăng nhập."
        });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);

      if (!isConnected || !pageId) {
        return res.status(403).json({
          success: false,
          message: "Quyền truy cập bị từ chối. Bạn chưa cấu hình tích hợp Facebook."
        });
      }

      if (!conversationId || !text) {
        return res.status(400).json({
          success: false,
          message: "Thiếu recipientId hoặc nội dung text."
        });
      }

      const result = await fbMessengerService.sendReply(pageId, conversationId, text);

      res.status(200).json({
        success: true,
        message: "Đã gửi tin nhắn phản hồi thành công.",
        data: result
      });
    } catch (error: any) {
      console.error("[FB Controller sendReply] Gửi tin nhắn thất bại:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Gửi tin nhắn thất bại."
      });
    }
  },

  /**
   * GET /api/v1/facebook/messenger/diagnostics/:conversationId
   * Kiểm tra nhanh vì sao Facebook auto-reply không gửi.
   */
  async diagnoseConversation(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      const { conversationId } = req.params;
      const requestedPageId = typeof req.query.pageId === "string" ? req.query.pageId : undefined;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);
      if (!isConnected || !pageId) {
        return res.status(403).json({ success: false, message: "Bạn chưa cấu hình tích hợp Facebook." });
      }

      const diagnostic = await fbMessengerService.diagnoseConversation(pageId, conversationId);
      return res.status(200).json({ success: true, data: diagnostic });
    } catch (error: any) {
      console.error("[FB Controller diagnoseConversation] Lỗi:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Không thể chẩn đoán hội thoại Facebook.",
      });
    }
  }

  ,

  /**
   * GET /api/v1/facebook/messenger/diagnostics/page
   * Kiem tra nhanh cau hinh page/token/webhook mapping cua user hien tai.
   */
  async diagnosePageConfig(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      const requestedPageId = typeof req.query.pageId === "string" ? req.query.pageId : undefined;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Người dùng chưa đăng nhập." });
      }

      const { isConnected, pageId } = await getFacebookPageConfig(userId, requestedPageId);
      const diagnostic = await fbMessengerService.diagnosePageConfig(userId, pageId);
      return res.status(200).json({
        success: true,
        data: {
          isConnected,
          pageId: pageId || null,
          ...diagnostic,
        }
      });
    } catch (error: any) {
      console.error("[FB Controller diagnosePageConfig] Loi:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Không thể chẩn đoán cấu hình Facebook page.",
      });
    }
  },

  /**
   * GET /api/v1/facebook/debug-ai-logs
   * Authenticated diagnostic endpoint scoped to the current user's company.
   */
  async debugAILogs(req: any, res: Response): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Nguoi dung chua dang nhap." });
      }

      const user = await UserModel.findById(userId).select("companyCode role email").lean();
      if (!user) {
        return res.status(404).json({ success: false, message: "Khong tim thay user." });
      }

      const limit = Math.min(Number(req.query.limit || 10), 100);
      const page = Math.max(Number(req.query.page || 1), 1);
      const skip = (page - 1) * limit;

      const baseFilter = user.role === "superadmin" && req.query.companyCode
        ? { companyCode: String(req.query.companyCode).trim().toUpperCase() }
        : { companyCode: String(user.companyCode || "SYSTEM").trim().toUpperCase() };
      const rawChannel = typeof req.query.channel === "string" ? req.query.channel.trim() : "";
      const channelFilter = rawChannel === "facebook" || rawChannel === "zalo" || rawChannel === "test" || rawChannel === "facebook_comment"
        ? rawChannel
        : undefined;
      const filter = {
        ...baseFilter,
        ...(req.query.conversationId ? { conversationId: String(req.query.conversationId).trim() } : {}),
        ...(channelFilter ? { channel: channelFilter } : {}),
      };

      const totalCount = await AIReplyLogModel.countDocuments(filter);
      const logs = await AIReplyLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return res.status(200).json({
        success: true,
        filter,
        count: logs.length,
        total: totalCount,
        page,
        hasMore: skip + logs.length < totalCount,
        logs: logs.map(l => ({
          _id: l._id,
          companyCode: l.companyCode,
          channel: l.channel,
          conversationId: l.conversationId,
          commentId: l.commentId,
          postId: l.postId,
          status: l.status,
          customerMessage: l.customerMessage,
          aiResponse: l.aiResponse,
          contextPreview: l.contextPreview,
          contextMatches: l.contextMatches,
          feedback: l.feedback,
          latencyMs: l.latencyMs,
          createdAt: l.createdAt,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * GET /api/v1/facebook/messenger/post-detail/:postId
   * Fetch a Facebook post's text message, created time, and media URL
   */
  async getPostDetail(req: any, res: Response): Promise<any> {
    const { postId } = req.params;
    try {
      const { pageId } = req.query;

      if (!postId) {
        return res.status(400).json({ success: false, message: "Thiếu Post ID." });
      }

      // Resolve the page access token
      let token: string | null = null;
      if (pageId) {
        token = await fbMessengerService.getPageAccessTokenByPageId(String(pageId));
      }

      if (!token && postId.includes("_")) {
        const extractedPageId = postId.split("_")[0];
        token = await fbMessengerService.getPageAccessTokenByPageId(extractedPageId);
      }

      if (!token) {
        return res.status(400).json({
          success: false,
          message: `Không tìm thấy Access Token để xem chi tiết bài viết ID: ${postId}`
        });
      }

      // Query Facebook Graph API
      const url = `https://graph.facebook.com/v19.0/${postId}?fields=message,story,created_time,full_picture&access_token=${token}`;
      const response = await (globalThis as any).fetch(url);
      
      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[FB Controller getPostDetail] Graph API error: ${response.status} - ${errText}`);
        return res.status(400).json({
          success: false,
          message: `Lỗi Facebook Graph API khi tải chi tiết bài viết: ${errText}`
        });
      }

      const data = await response.json();
      return res.status(200).json({
        success: true,
        data: {
          message: data.message || data.story || "Bài viết không có nội dung chữ.",
          created_time: data.created_time || new Date().toISOString(),
          full_picture: data.full_picture || null,
        }
      });
    } catch (error: any) {
      console.error("[FB Controller getPostDetail] Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi hệ thống khi tải chi tiết bài viết."
      });
    }
  }
};
