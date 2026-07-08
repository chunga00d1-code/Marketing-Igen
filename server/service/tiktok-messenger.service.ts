import { TikTokConversationModel, TikTokMessageModel } from "../model/tiktok-messenger.model";
import { UserModel } from "../model/user.model";
import { emitToPage } from "../socket";
import { aiAutoReplyService } from "./ai-auto-reply.service";

export const tiktokMessengerService = {

  /**
   * Xử lý sự kiện Webhook từ TikTok Business Messaging
   * Tham khảo: https://developers.tiktok.com/doc/webhooks-overview
   */
  async handleWebhookEvent(body: any) {
    try {
      console.log("[TikTok Messenger Webhook] Nhận event:", JSON.stringify(body).substring(0, 500));

      // TikTok webhook format: { event: "receive_message", ... }
      const eventType = body.event || body.type || body.event_type || "";

      if (eventType === "receive_message" || eventType === "message") {
        await this.processIncomingMessage(body);
      } else {
        console.log(`[TikTok Messenger Webhook] Bỏ qua event_type không xử lý: ${eventType}`);
      }
    } catch (error: any) {
      console.error("[TikTok Messenger Webhook] Lỗi xử lý event:", error);
    }
  },

  /**
   * Xử lý tin nhắn đến từ TikTok user
   * Lưu vào DB, emit Socket.IO, trigger AI auto-reply
   */
  async processIncomingMessage(event: any) {
    try {
      // Parse payload - TikTok Business Messaging API webhook format
      const content = event.content || event.message || event;
      const senderOpenId = content.sender?.open_id || content.open_id || content.from_user_id || content.sender_id || "";
      const messageText = content.text || content.message_text || content.content?.text || "";
      const messageId = content.msg_id || content.message_id || content.server_message_id || `tt_in_${Date.now()}`;
      const timestamp = content.create_time ? new Date(content.create_time * 1000) : new Date();
      const senderName = content.sender?.display_name || content.sender?.nickname || "Khách hàng TikTok";
      const avatarUrl = content.sender?.avatar_url || content.sender?.avatar || "";
      const conversationId = content.conversation_id || content.conversation_short_id || "";

      // Xác định Business Account ID (receiver)
      const businessAccountId = content.receiver?.open_id || content.to_user_id || content.business_id || "";

      if (!senderOpenId) {
        console.warn("[TikTok Messenger] Không tìm thấy sender open_id trong webhook payload:", JSON.stringify(content).substring(0, 300));
        return;
      }

      // Tìm businessAccountId từ SocialIntegration nếu không có trong payload
      let resolvedBusinessAccountId = businessAccountId;
      if (!resolvedBusinessAccountId) {
        const { SocialIntegrationModel } = require("../model/social-integration.model");
        const tiktokIntegration = await SocialIntegrationModel.findOne({
          platform: "TikTok",
          isConnected: true
        }).lean();
        if (tiktokIntegration) {
          resolvedBusinessAccountId = tiktokIntegration.username || "";
        }
      }

      if (!resolvedBusinessAccountId) {
        console.warn("[TikTok Messenger] Không xác định được businessAccountId, bỏ qua tin nhắn.");
        return;
      }

      console.log(`[TikTok Messenger] Xử lý tin nhắn đến: sender=${senderOpenId}, business=${resolvedBusinessAccountId}, msgId=${messageId}, text="${messageText.substring(0, 50)}"`);

      // Tìm hoặc tạo conversation
      let conversation = await TikTokConversationModel.findOne({
        businessAccountId: resolvedBusinessAccountId,
        openId: senderOpenId
      });

      if (!conversation) {
        console.log(`[TikTok Messenger] Tạo conversation mới cho sender: ${senderOpenId}`);
        conversation = new TikTokConversationModel({
          openId: senderOpenId,
          businessAccountId: resolvedBusinessAccountId,
          senderName,
          avatarUrl,
          tiktokConversationId: conversationId,
          lastMessageText: messageText,
          lastMessageAt: timestamp,
          unreadCount: 1,
          status: "open",
        });
        await conversation.save();
      } else {
        // Cập nhật thông tin conversation
        conversation.lastMessageText = messageText;
        conversation.lastMessageAt = timestamp;
        conversation.unreadCount += 1;
        if (senderName && senderName !== "Khách hàng TikTok") {
          conversation.senderName = senderName;
        }
        if (avatarUrl) {
          conversation.avatarUrl = avatarUrl;
        }
        if (conversationId && !conversation.tiktokConversationId) {
          conversation.tiktokConversationId = conversationId;
        }
        await conversation.save();
      }

      // Kiểm tra trùng lặp tin nhắn
      const existingMsg = await TikTokMessageModel.findOne({ messageId });
      if (existingMsg) {
        console.log(`[TikTok Messenger] Tin nhắn đã tồn tại (messageId=${messageId}), bỏ qua.`);
        return;
      }

      // Lưu tin nhắn vào DB
      const newMessage = new TikTokMessageModel({
        conversationId: conversation._id,
        senderId: senderOpenId,
        recipientId: resolvedBusinessAccountId,
        direction: "inbound",
        text: messageText,
        attachments: [],
        messageId,
        timestamp,
        status: "delivered",
      });
      await newMessage.save();

      console.log(`[TikTok Messenger] Đã lưu tin nhắn inbound: msgId=${messageId}, conversationId=${conversation._id}`);

      // Emit Socket.IO để cập nhật realtime cho Frontend
      emitToPage(resolvedBusinessAccountId, "new_message", {
        message: newMessage,
        conversation,
      });
      emitToPage(resolvedBusinessAccountId, "conversation_updated", conversation);

      // Trigger AI Auto-Reply nếu có cấu hình
      if (messageText.trim()) {
        try {
          await aiAutoReplyService.triggerAutoReply(
            "tiktok",
            resolvedBusinessAccountId,
            conversation._id.toString(),
            messageText,
            messageId
          );
        } catch (aiErr: any) {
          console.error("[TikTok Messenger] Lỗi khi trigger AI auto-reply:", aiErr);
        }
      }
    } catch (error: any) {
      console.error("[TikTok Messenger] Lỗi xử lý tin nhắn đến:", error);
    }
  },

  /**
   * Lấy Access Token hợp lệ cho TikTok Business Account
   */
  async getAccessTokenByBusinessAccountId(businessAccountId: string): Promise<string | null> {
    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegration = await SocialIntegrationModel.findOne({
      platform: "TikTok",
      username: businessAccountId,
      isConnected: true
    });

    if (companyIntegration) {
      console.log(`[TikTok Messenger Token] Found company-level integration for businessAccountId=${businessAccountId}`);
      if (companyIntegration.isMock) {
        return "mock_tiktok_access_token_123456789";
      }
      return companyIntegration.accessToken || null;
    }

    // Fallback to user-level integration
    const user = await UserModel.findOne({
      "tiktokIntegration.isConnected": true,
      "tiktokIntegration.username": businessAccountId
    });

    if (user && (user as any).tiktokIntegration) {
      const integration = (user as any).tiktokIntegration;
      if (integration.isMock) {
        return "mock_tiktok_access_token_123456789";
      }
      return integration.accessToken || null;
    }

    console.warn(`[TikTok Messenger Token] Không tìm thấy token cho businessAccountId=${businessAccountId}`);
    return null;
  },

  /**
   * Lấy danh sách hội thoại TikTok
   */
  async getConversations(businessAccountId: string, options?: { limit?: number; skip?: number }) {
    console.log(`[TikTok Messenger] Lấy danh sách hội thoại cho Business Account: ${businessAccountId}`);
    const limit = options?.limit || 20;
    const skip = options?.skip || 0;
    return TikTokConversationModel.find({ businessAccountId })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit);
  },

  /**
   * Lấy tin nhắn chi tiết
   */
  async getMessages(businessAccountId: string, conversationId: string, options?: { limit?: number; before?: string; sync?: boolean }) {
    const conversation = await TikTokConversationModel.findOne({ _id: conversationId, businessAccountId });
    if (!conversation) {
      return {
        messages: [],
        pagination: { limit: 20, hasMore: false, nextBefore: null }
      };
    }

    // Reset số lượng tin nhắn chưa đọc
    if (conversation.unreadCount > 0) {
      conversation.unreadCount = 0;
      await conversation.save();
    }

    const limit = Math.min(Math.max(Number(options?.limit || 20), 1), 100);
    const beforeDate = options?.before ? new Date(options.before) : null;
    const filter: any = { conversationId: conversation._id };

    if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
      filter.timestamp = { $lt: beforeDate };
    }

    const existingMessages = await TikTokMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit + 1);
    const hasMore = existingMessages.length > limit;
    const trimmedMessages = hasMore ? existingMessages.slice(0, limit) : existingMessages;
    const orderedMessages = [...trimmedMessages].reverse();
    const oldestMessage = orderedMessages[0];

    return {
      messages: orderedMessages,
      pagination: {
        limit,
        hasMore,
        nextBefore: oldestMessage?.timestamp ? new Date(oldestMessage.timestamp).toISOString() : null,
      }
    };
  },

  /**
   * Đánh dấu đã đọc hội thoại
   */
  async markConversationRead(businessAccountId: string, conversationId: string) {
    const conversation = await TikTokConversationModel.findOne({ _id: conversationId, businessAccountId });
    if (!conversation) {
      throw new Error("Không tìm thấy hội thoại TikTok.");
    }

    if (conversation.unreadCount !== 0) {
      conversation.unreadCount = 0;
      await conversation.save();
      emitToPage(businessAccountId, "conversation_updated", conversation);
    }

    return { success: true };
  },

  /**
   * Kích hoạt lại AI auto-reply cho hội thoại
   */
  async resumeAIAutoReply(businessAccountId: string, conversationId: string) {
    const conversation = await TikTokConversationModel.findOne({ _id: conversationId, businessAccountId });
    if (!conversation) {
      throw new Error("Không tìm thấy hội thoại TikTok.");
    }
    conversation.aiPausedUntil = undefined;
    await conversation.save();
    emitToPage(businessAccountId, "conversation_updated", conversation);
    return conversation;
  },

  /**
   * Gửi phản hồi tin nhắn cho khách hàng qua TikTok Business Messaging API
   */
  async sendReply(businessAccountId: string, conversationId: string, text: string, senderType: "human" | "ai" = "human") {
    const conversation = await TikTokConversationModel.findOne({ _id: conversationId, businessAccountId });
    if (!conversation) {
      throw new Error("Không tìm thấy cuộc hội thoại TikTok để trả lời.");
    }

    // Hủy các phản hồi AI đang lên lịch do nhân viên đã can thiệp
    if (senderType === "human") {
      aiAutoReplyService.cancelPendingReply(conversationId, "human_reply");
    }

    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegration = await SocialIntegrationModel.findOne({
      platform: "TikTok",
      username: businessAccountId,
      isConnected: true
    }).lean();

    const isMock = companyIntegration ? !!companyIntegration.isMock : false;
    const recipientOpenId = conversation.openId;
    console.log(`[TikTok SendReply] businessAccountId=${businessAccountId}, conversationId=${conversationId}, recipientOpenId=${recipientOpenId}, textLength=${text.length}, isMock=${isMock}`);

    const messageId = `tt_out_${Date.now()}`;
    const sentAt = new Date();
    const newMsg = new TikTokMessageModel({
      conversationId: conversation._id,
      senderId: businessAccountId,
      recipientId: recipientOpenId,
      direction: "outbound",
      text,
      attachments: [],
      messageId,
      timestamp: sentAt,
      status: "sent",
    });

    const emitRealtimeUpdate = () => {
      emitToPage(businessAccountId, "new_message", {
        message: newMsg,
        conversation: conversation
      });
      emitToPage(businessAccountId, "conversation_updated", conversation);
    };

    if (isMock) {
      console.log(`[TikTok Messenger Mock] Giả lập gửi tin tới TikTok User: ${recipientOpenId}`);
      conversation.lastMessageText = text;
      conversation.lastMessageAt = sentAt;
      conversation.unreadCount = 0;
      if (senderType === "human") {
        conversation.aiPausedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      await conversation.save();
      newMsg.status = "delivered";
      await newMsg.save();
      emitRealtimeUpdate();

      // Lên lịch phản hồi tự động từ Bot giả lập sau 2.5 giây
      setTimeout(async () => {
        try {
          const autoReplyText = `[TikTok Demo Bot] Cảm ơn bạn đã phản hồi: "${text}". Hệ thống ERP đang thử nghiệm hoạt động tốt!`;
          const botMessageId = `tt_in_mock_${Date.now()}`;

          const incomingMsg = new TikTokMessageModel({
            conversationId: conversation._id,
            senderId: recipientOpenId,
            recipientId: businessAccountId,
            direction: "inbound",
            text: autoReplyText,
            attachments: [],
            messageId: botMessageId,
            timestamp: new Date(),
            status: "delivered"
          });
          await incomingMsg.save();

          conversation.lastMessageText = autoReplyText;
          conversation.lastMessageAt = new Date();
          conversation.unreadCount += 1;
          await conversation.save();

          emitToPage(businessAccountId, "new_message", {
            message: incomingMsg,
            conversation: conversation
          });
          emitToPage(businessAccountId, "conversation_updated", conversation);
        } catch (err) {
          console.error("Lỗi giả lập phản hồi TikTok:", err);
        }
      }, 2500);

    } else {
      // Gửi thật qua TikTok Business Messaging API
      const token = await this.getAccessTokenByBusinessAccountId(businessAccountId);
      console.log(`[TikTok SendReply] Resolved token: ${token ? `FOUND(...${token.slice(-8)})` : "NOT_FOUND"}`);
      if (!token) {
        throw new Error("TikTok token không hợp lệ hoặc đã hết hạn. Vui lòng kết nối lại tài khoản TikTok.");
      }

      // TikTok Business Messaging API - Send Message
      // Endpoint: POST https://open.tiktokapis.com/v2/dm/message/send/
      const url = "https://open.tiktokapis.com/v2/dm/message/send/";
      const payload = {
        open_id: recipientOpenId,
        message_type: "text",
        text: {
          text: text
        }
      };

      try {
        const response = await (globalThis as any).fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[TikTok Messenger API] Gửi tin thất bại: ${response.status} - ${errText}`);
          throw new Error(`TikTok API phản hồi lỗi: ${response.status} - ${errText}`);
        }

        const resData = await response.json();
        if (resData.data?.error_code) {
          throw new Error(`TikTok API Error: ${resData.data?.description || resData.data?.error_code}`);
        }

        console.log(`[TikTok Messenger API] Đã gửi tin nhắn thành công:`, resData);
        newMsg.messageId = resData.data?.message_id || messageId;
      } catch (apiErr: any) {
        // Vẫn lưu message vào DB dù API fail để người dùng thấy tin nhắn đã gửi
        console.error(`[TikTok Messenger API] Lỗi gọi TikTok API:`, apiErr.message);
        throw apiErr;
      }

      conversation.lastMessageText = text;
      conversation.lastMessageAt = sentAt;
      conversation.unreadCount = 0;
      if (senderType === "human") {
        conversation.aiPausedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      await conversation.save();
      newMsg.status = "delivered";
      await newMsg.save();
      emitRealtimeUpdate();
    }

    return {
      status: "success",
      messageId: newMsg.messageId,
    };
  },
};
