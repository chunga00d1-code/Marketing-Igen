import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { UserModel } from "../model/user.model";
import { emitToPage } from "../socket";
import { aiAutoReplyService } from "./ai-auto-reply.service";
import { facebookCommentService } from "./facebook-comment.service";
import { SocialIntegrationModel } from "../model/social-integration.model";

const syncTimestamps = new Map<string, number>();
const CONVERSATION_SYNC_TTL_MS = 15000;
const MESSAGE_SYNC_TTL_MS = 5000;

function normalizeFacebookId(value: any) {
  return String(value || "").trim();
}

function normalizeOptionalFacebookConversationId(value: any): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

export const fbMessengerService = {
  shouldSync(key: string, ttlMs: number) {
    const now = Date.now();
    const lastRun = syncTimestamps.get(key) || 0;
    if (now - lastRun < ttlMs) {
      return false;
    }

    syncTimestamps.set(key, now);
    return true;
  },

  async fetchGraphJson(url: string) {
    const response = await (globalThis as any).fetch(url);
    const rawText = await response.text();
    let parsed: any = null;

    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = rawText;
    }

    if (!response.ok) {
      throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
    }

    return parsed;
  },

  async syncConversationsFromFacebook(pageId: string) {
    const startedAt = Date.now();
    console.log(`[FB Service syncConversations] Bắt đầu đồng bộ hội thoại trực tiếp từ Facebook cho Page ID: ${pageId}`);
    const token = await this.getPageAccessTokenByPageId(pageId);
    if (!token) {
      throw new Error(`Không tìm thấy Access Token cấu hình cho Page ID: ${pageId}`);
    }

    const fields = [
      "id",
      "updated_time",
      "senders",
      "messages.limit(1){id,message,created_time,from,to}"
    ].join(",");
    const url = `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(token)}`;
    const data = await this.fetchGraphJson(url);
    const conversations = Array.isArray(data?.data) ? data.data : [];

    for (const fbConversation of conversations) {
      const senders = Array.isArray(fbConversation?.senders?.data) ? fbConversation.senders.data : [];
      const latestMessage = Array.isArray(fbConversation?.messages?.data) ? fbConversation.messages.data[0] : null;
      const nonPageSender = senders.find((sender: any) => sender?.id && sender.id !== pageId);
      const fallbackRecipientId = latestMessage?.from?.id && latestMessage.from.id !== pageId
        ? latestMessage.from.id
        : "";
      const recipientId = nonPageSender?.id || fallbackRecipientId;

      if (!recipientId) {
        console.warn(`[FB Service syncConversations] Bỏ qua conversation ${fbConversation?.id} vì không xác định được recipientId.`);
        continue;
      }

      let conversation = await FBConversationModel.findOne({
        pageId,
        $or: [
          { facebookConversationId: fbConversation.id },
          { recipientId }
        ]
      });

      let avatarUrl = "";
      let senderName = nonPageSender?.name || "";

      // Chỉ fetch profile của khách hàng nếu hội thoại chưa có trong DB hoặc chưa có đủ Tên/Avatar
      if (!conversation || !conversation.avatarUrl || !conversation.senderName || conversation.senderName === "Khách hàng Facebook") {
        if (recipientId) {
          try {
            const profile = await this.getSenderProfile(recipientId, token);
            avatarUrl = profile?.profile_pic || "";
            if (profile?.first_name || profile?.last_name) {
              senderName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
            }
          } catch (error) {
            console.warn(`[FB Service syncConversations] Không lấy được avatar/profile cho PSID ${recipientId}:`, error);
          }
        }
      }

      if (conversation) {
        conversation.facebookConversationId = normalizeOptionalFacebookConversationId(fbConversation.id);
        conversation.recipientId = recipientId;
        conversation.senderName = senderName || conversation.senderName || "Khách hàng Facebook";
        if (avatarUrl) {
          conversation.avatarUrl = avatarUrl;
        }
        conversation.lastMessageText = latestMessage?.message || conversation.lastMessageText || "[Đính kèm]";
        conversation.lastMessageAt = latestMessage?.created_time
          ? new Date(latestMessage.created_time)
          : (conversation.lastMessageAt || new Date(fbConversation?.updated_time || Date.now()));
        conversation.status = "open";
        await conversation.save();
      } else {
        conversation = new FBConversationModel({
          recipientId,
          pageId,
          facebookConversationId: normalizeOptionalFacebookConversationId(fbConversation.id),
          senderName: senderName || "Khách hàng Facebook",
          avatarUrl,
          lastMessageText: latestMessage?.message || "[Đính kèm]",
          lastMessageAt: latestMessage?.created_time
            ? new Date(latestMessage.created_time)
            : new Date(fbConversation?.updated_time || Date.now()),
          status: "open",
        });
        await conversation.save();
      }
    }

    console.log(`[FB Service syncConversations] Đồng bộ xong ${conversations.length} hội thoại từ Facebook cho Page ID: ${pageId} trong ${Date.now() - startedAt}ms`);
  },

  async syncMessagesFromFacebook(pageId: string, recipientId: string) {
    const startedAt = Date.now();
    console.log(`[FB Service syncMessages] Bắt đầu đồng bộ tin nhắn từ Facebook cho PSID ${recipientId}, Page ID: ${pageId}`);
    const conversation = await FBConversationModel.findOne({ pageId, recipientId });
    const conversationGraphId = conversation?.facebookConversationId;

    if (!conversationGraphId) {
      console.warn(`[FB Service syncMessages] Không có facebookConversationId cho PSID ${recipientId}. Thử đồng bộ lại danh sách hội thoại.`);
      await this.syncConversationsFromFacebook(pageId);
    }

    const refreshedConversation = await FBConversationModel.findOne({ pageId, recipientId });
    if (!refreshedConversation?.facebookConversationId) {
      console.warn(`[FB Service syncMessages] Vẫn không tìm thấy conversation graph ID cho PSID ${recipientId}.`);
      return [];
    }

    const token = await this.getPageAccessTokenByPageId(pageId);
    if (!token) {
      throw new Error(`Không tìm thấy Access Token cấu hình cho Page ID: ${pageId}`);
    }

    const existingMids = new Set(
      (await FBMessageModel.find({ conversationId: refreshedConversation._id }, { messageId: 1 }))
        .map(m => m.messageId)
    );

    const fields = ["id", "message", "created_time", "from", "to", "attachments"].join(",");
    const url = `https://graph.facebook.com/v19.0/${refreshedConversation.facebookConversationId}/messages?fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(token)}`;
    const data = await this.fetchGraphJson(url);
    const messages = Array.isArray(data?.data) ? data.data : [];
    let upsertedCount = 0;

    for (const fbMessage of messages) {
      if (existingMids.has(fbMessage.id)) {
        continue;
      }

      const fromId = fbMessage?.from?.id || "";
      const direction = fromId === pageId ? "outbound" : "inbound";
      const toList = Array.isArray(fbMessage?.to?.data) ? fbMessage.to.data : [];
      const matchedRecipientId = direction === "outbound"
        ? (toList.find((item: any) => item?.id && item.id !== pageId)?.id || recipientId)
        : recipientId;
      const attachmentList = Array.isArray(fbMessage?.attachments?.data)
        ? fbMessage.attachments.data.map((attachment: any) => ({
            type: attachment?.mime_type?.startsWith("image/") ? "image" : (attachment?.mime_type || attachment?.type || "attachment"),
            url: attachment?.image_data?.url || attachment?.file_url || attachment?.video_data?.url || attachment?.payload?.url || "",
          }))
        : [];
      const normalizedText = fbMessage?.message || "";

      await FBMessageModel.findOneAndUpdate(
        { messageId: fbMessage.id },
        {
          conversationId: refreshedConversation._id,
          senderId: fromId || (direction === "outbound" ? pageId : recipientId),
          recipientId: matchedRecipientId,
          direction,
          text: normalizedText,
          attachments: attachmentList,
          messageId: fbMessage.id,
          timestamp: fbMessage?.created_time ? new Date(fbMessage.created_time) : new Date(),
          status: "delivered",
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
      upsertedCount += 1;
    }

    console.log(`[FB Service syncMessages] Đồng bộ xong ${upsertedCount}/${messages.length} tin nhắn từ Facebook cho PSID ${recipientId} trong ${Date.now() - startedAt}ms`);
    return FBMessageModel.find({ conversationId: refreshedConversation._id }).sort({ timestamp: 1 });
  },

  normalizeWebhookBody(body: any) {
    if (body?.object === "page" && Array.isArray(body?.entry)) {
      return body;
    }

    const sample = body?.sample;
    if (sample?.field === "messages" && sample?.value?.sender?.id && sample?.value?.recipient?.id) {
      console.log("[FB Service normalizeWebhookBody] Phát hiện payload test từ Meta Webhooks UI. Chuẩn hóa về định dạng page webhook.");
      const sampleValue = sample.value;
      const timestampNumber = Number(sampleValue.timestamp);
      const normalizedEvent = {
        sender: { id: sampleValue.sender.id },
        recipient: { id: sampleValue.recipient.id },
        timestamp: Number.isFinite(timestampNumber) ? timestampNumber * 1000 : Date.now(),
        message: {
          mid: sampleValue.message?.mid || `sample_${Date.now()}`,
          text: sampleValue.message?.text || "",
          attachments: sampleValue.message?.attachments || [],
          is_echo: sampleValue.message?.is_echo || false,
        },
      };

      return {
        object: "page",
        entry: [
          {
            id: sampleValue.recipient.id,
            messaging: [normalizedEvent],
          },
        ],
      };
    }

    return body;
  },

  /**
   * Xác thực Webhook (GET request) từ Facebook gửi qua
   */
  async verifyWebhook(mode: string | undefined, token: string | undefined, challenge: string | undefined) {
    const verifyToken = process.env.FB_VERIFY_TOKEN || "igen_erp_fb_verify_2026";
    console.log(`[FB Service verifyWebhook] So sánh Verify Token nhận được: "${token}" với Token cấu hình hệ thống.`);

    if (mode === "subscribe") {
      if (token === verifyToken) {
        console.log("[FB Service verifyWebhook] Trùng khớp với Default Verify Token trong biến môi trường!");
        return challenge;
      }

      // Check if any user in DB has configured this verifyToken
      const user = await UserModel.findOne({
        "facebookIntegration.isConnected": true,
        "facebookIntegration.verifyToken": token
      });

      if (user) {
        console.log(`[FB Service verifyWebhook] Trùng khớp với Verify Token được cấu hình bởi user: ${user.email}`);
        return challenge;
      }

      // Check if any company-level integration has configured this verifyToken
      const integration = await SocialIntegrationModel.findOne({
        platform: "Facebook",
        isConnected: true,
        verifyToken: token
      });

      if (integration) {
        console.log(`[FB Service verifyWebhook] Trùng khớp với Verify Token được cấu hình trong Company Integration: ${integration.displayName}`);
        return challenge;
      }
    }

    console.error(`[FB Service verifyWebhook] Không tìm thấy Verify Token khớp với "${token}". Xác thực thất bại.`);
    throw new Error("Mã xác minh không chính xác");
  },

  /**
   * Xử lý dữ liệu Webhook Event (POST request) từ Facebook gửi tới khi có tin nhắn mới
   */
  async handleWebhookEvent(body: any) {
    const normalizedBody = this.normalizeWebhookBody(body);

    if (normalizedBody.object !== "page") {
      console.warn(`[FB Service handleWebhookEvent] Nhận đối tượng webhook không phải page: "${normalizedBody.object}"`);
      throw new Error("Sự kiện webhook không hợp lệ.");
    }

    const entries = normalizedBody.entry || [];

    for (const entry of entries) {
      // 1. Xử lý sự kiện tin nhắn (Messenger)
      const messagingEvents = entry.messaging || [];
      if (messagingEvents.length > 0) {
        for (const event of messagingEvents) {
          if (event.message && !event.message.is_echo) {
            const attachmentCount = Array.isArray(event.message?.attachments) ? event.message.attachments.length : 0;
            const quickReplyPayload = String(event.message?.quick_reply?.payload || "").trim();
            console.log(
              `[FB Service] Nhận tin nhắn mới: sender=${event.sender?.id}, textLength=${String(event.message.text || "").length}, attachments=${attachmentCount}`
            );
            await this.processIncomingMessage(event, entry.id);
          } else if (event.read) {
            await this.processReadReceipt(event);
          }
        }
      }

      // 2. Xử lý sự kiện thay đổi trên feed bài viết (Bình luận / Post)
      const changesEvents = entry.changes || [];
      if (changesEvents.length > 0) {
        for (const change of changesEvents) {
          if (change.field === "feed") {
            const value = change.value;
            if (value && value.item === "comment" && value.verb === "add") {
              facebookCommentService.handleIncomingComment(entry.id, value).catch((err) => {
                console.error("[FB Service] Lỗi khi xử lý bình luận tự động:", err.message || err);
              });
            }
          }
        }
      }
    }
  },

  /**
   * Lấy Page Access Token của một User bất kỳ đang liên kết với Page ID này
   */
  async getPageAccessTokenByPageId(pageId: string): Promise<string | null> {
    const resolvedPageId = normalizeFacebookId(pageId);
    console.log(`[FB Service Token] Đang tìm Access Token cho Page ID: raw=${pageId}, resolved=${resolvedPageId}`);

    // Prefer company-level integration first to match the page configured for the company.
    const companyIntegration = await SocialIntegrationModel.findOne({
      platform: "Facebook",
      isConnected: true,
      username: resolvedPageId, // pageId is stored in username
    });

    if (companyIntegration && companyIntegration.accessToken) {
      console.log(`[FB Service Token] Đã tìm thấy Page Access Token từ Company Integration: ${companyIntegration.displayName}, company=${companyIntegration.companyCode}, pageId=${resolvedPageId}`);
      return companyIntegration.accessToken;
    }

    const user = await UserModel.findOne({
      "facebookIntegration.isConnected": true,
      "facebookIntegration.pageId": resolvedPageId,
    });
    
    if (user && user.facebookIntegration?.pageAccessToken) {
      console.log(`[FB Service Token] Fallback Page Access Token tu tai khoan User: ${user.email}, pageId=${resolvedPageId}`);
      return user.facebookIntegration.pageAccessToken;
    }
    
    const samePlatformIntegrations = await SocialIntegrationModel.find({
      platform: "Facebook",
      isConnected: true,
    }).select("companyCode displayName username").lean();
    console.warn(`[FB Service Token] Khong tim thay config khop chinh xac cho Page ID=${pageId}. Cac company integration Facebook dang co: ${samePlatformIntegrations.map((item: any) => `${item.companyCode}:${item.displayName}:${item.username}`).join(" | ") || "none"}`);
    console.log(`[FB Service Token] Không tìm thấy config của user nào cho Page ID: ${pageId}. Fallback về biến môi trường FB_PAGE_ACCESS_TOKEN.`);
    return process.env.FB_PAGE_ACCESS_TOKEN || null;
  },

  async subscribePageWebhooks(pageId: string, token: string): Promise<any> {
    const cleanPageId = normalizeFacebookId(pageId);
    const isMockPage = cleanPageId.startsWith("mock_") || cleanPageId === "unknown_page" || cleanPageId === "123456";
    if (isMockPage) {
      console.log(`[FB Service subscribePageWebhooks] Bỏ qua subscribe cho Page giả lập: ${cleanPageId}`);
      return { success: true, message: "Mock Page bypass" };
    }

    const fields = "feed,messages,messaging_postbacks,message_deliveries,message_reads";
    const url = `https://graph.facebook.com/v19.0/${cleanPageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    console.log(`[FB Service subscribePageWebhooks] Đang đăng ký webhook cho Page ID: ${cleanPageId}...`);

    try {
      const response = await (globalThis as any).fetch(url, {
        method: "POST",
      });
      const data = await response.json();
      console.log(`[FB Service subscribePageWebhooks] Kết quả đăng ký từ Facebook Graph API:`, data);
      return data;
    } catch (error: any) {
      console.error(`[FB Service subscribePageWebhooks] Lỗi khi đăng ký webhook cho Page ID ${cleanPageId}:`, error.message || error);
      return { error: error.message || error };
    }
  },

  async enrichConversationProfile(pageId: string, senderId: string, conversationId: string) {
    try {
      const token = await this.getPageAccessTokenByPageId(pageId);
      if (!token) {
        return;
      }

      const profile = await this.getSenderProfile(senderId, token);
      if (!profile) {
        return;
      }

      const updatedConversation = await FBConversationModel.findOneAndUpdate(
        { _id: conversationId, pageId },
        {
          senderName: `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Khach hang Facebook",
          avatarUrl: profile.profile_pic || "",
        },
        { new: true }
      );

      if (updatedConversation) {
        emitToPage(pageId, "conversation_updated", updatedConversation);
      }
    } catch (error) {
      console.error("[FB Service enrichConversationProfile] Khong the cap nhat profile Facebook:", error);
    }
  },

  /**
   * Lưu tin nhắn đến vào DB và tạo cuộc hội thoại nếu chưa có
   */
  async processIncomingMessage(event: any, pageId?: string) {
    const senderId = event.sender.id; // PSID của khách hàng
    const recipientId = event.recipient.id; // ID của Fanpage mình (pageId)
    const message = event.message;
    const messageId = String(message?.mid || `fb_in_${recipientId}_${senderId}_${Date.now()}`).trim();
    const timestamp = new Date(event.timestamp);

    const resolvedPageId = pageId || recipientId;
    if (senderId === resolvedPageId || event.message?.is_echo) {
      console.log(`[FB Service processIncomingMessage] Bỏ qua tin nhắn outbound từ Page ${resolvedPageId}`);
      return;
    }

    const text = String(message?.text || "").trim();
    const rawAttachments = Array.isArray(message?.attachments) ? message.attachments : [];
    const attachments = rawAttachments.map((att: any) => ({
      type: att?.type || "attachment",
      url: att?.payload?.url || "",
    }));
    const quickReplyPayload = String(message?.quick_reply?.payload || "").trim();

    if (!text && attachments.length === 0 && !quickReplyPayload) {
      return;
    }

    const token = await this.getPageAccessTokenByPageId(resolvedPageId);
    const duplicateMsg = await FBMessageModel.findOne({ messageId });
    if (duplicateMsg) {
      // Vẫn kích hoạt AI nếu tin nhắn này là inbound và chưa được xử lý phản hồi
      const conversation = await FBConversationModel.findOne({ recipientId: senderId, pageId: resolvedPageId });
      if (conversation) {
        aiAutoReplyService.triggerAutoReply("facebook", resolvedPageId, conversation._id.toString(), text, messageId);
      }
      return;
    }

    // Lấy token động từ DB dựa theo Page ID của tin nhắn đến

    // 1. Kiểm tra xem đã có cuộc hội thoại với khách hàng này chưa
    let conversation = await FBConversationModel.findOne({ recipientId: senderId, pageId: resolvedPageId });

    if (!conversation) {
      let senderName = "Khách hàng Facebook";
      let avatarUrl = "";

      if (token) {
        try {
          const profile = await Promise.race([
            this.getSenderProfile(senderId, token),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 350))
          ]);
          if (profile) {
            senderName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Khách hàng Facebook";
            avatarUrl = profile.profile_pic || "";
          }
        } catch (err: any) {
          console.error("[FB Service] Thất bại khi lấy thông tin profile từ Graph API:", err.message || err);
        }
      }

      conversation = new FBConversationModel({
        recipientId: senderId,
        senderName,
        avatarUrl,
        pageId: resolvedPageId,
        lastMessageText: text || "[Đính kèm]",
        lastMessageAt: timestamp,
        unreadCount: 1,
        status: "open",
      });
      try {
        await conversation.save();
      } catch (err: any) {
        if (err?.code === 11000) {
          conversation = await FBConversationModel.findOne({ recipientId: senderId, pageId: resolvedPageId });
          if (!conversation) {
            throw err;
          }
        } else {
          throw err;
        }
      }
      console.log(`[FB Service processIncomingMessage] 💾 CONVERSATION NEW: Đã tạo cuộc hội thoại mới _id=${conversation._id.toString()}`);
    } else {
      conversation.lastMessageText = text || "[Đính kèm]";
      conversation.lastMessageAt = timestamp;
      conversation.unreadCount += 1;
      conversation.status = "open";
      await conversation.save();
      console.log(`[FB Service processIncomingMessage] 💾 CONVERSATION UPDATE: Đã cập nhật hội thoại _id=${conversation._id.toString()}, unreadCount=${conversation.unreadCount}`);
    }

    // 2. Lưu tin nhắn chi tiết vào DB
    const existingMsg = await FBMessageModel.findOne({ messageId });
    if (!existingMsg) {
      const newMsg = new FBMessageModel({
        conversationId: conversation._id,
        senderId,
        recipientId,
        direction: "inbound",
        text,
        attachments,
        messageId,
        timestamp,
        status: "delivered",
      });
      await newMsg.save();
      console.log(`[FB Service processIncomingMessage] 💾 MSG SAVE: Đã lưu tin nhắn inbound thành công (messageId=${messageId})`);

      // Realtime update via Socket.IO
      emitToPage(resolvedPageId, "new_message", {
        message: newMsg,
        conversation: conversation
      });
      emitToPage(resolvedPageId, "conversation_updated", conversation);

      // Kích hoạt AI Auto-Reply Bot bất đồng bộ
      console.log(
        `[FB Service processIncomingMessage] 🚀 TRIGGER AI: Đang chuyển tiếp sang aiAutoReplyService.triggerAutoReply ` +
        `cho conversationId=${conversation._id.toString()}, pageId=${resolvedPageId}, textLength=${text.length}`
      );
      aiAutoReplyService.triggerAutoReply("facebook", resolvedPageId, conversation._id.toString(), text, messageId);
    }
  },

  /**
   * Cập nhật trạng thái đã đọc của tin nhắn
   */
  async processReadReceipt(event: any) {
    const senderId = event.sender.id;
    const pageId = event.recipient?.id;
    await FBConversationModel.findOneAndUpdate(
      pageId ? { recipientId: senderId, pageId } : { recipientId: senderId },
      { unreadCount: 0 }
    );
  },

  async markConversationRead(pageId: string, conversationId: string) {
    const conversation = await FBConversationModel.findOne({ _id: conversationId, pageId });
    if (!conversation) {
      throw new Error("Không tìm thấy hội thoại Facebook.");
    }

    if (conversation.unreadCount !== 0) {
      conversation.unreadCount = 0;
      await conversation.save();
      emitToPage(pageId, "conversation_updated", conversation);
    }

    return { success: true };
  },

  async resumeAIAutoReply(pageId: string, conversationId: string) {
    const conversation = await FBConversationModel.findOne({ _id: conversationId, pageId });
    if (!conversation) {
      throw new Error("Không tìm thấy hội thoại Facebook.");
    }
    conversation.aiPausedUntil = undefined;
    await conversation.save();
    emitToPage(pageId, "conversation_updated", conversation);
    return conversation;
  },

  /**
   * Gọi Graph API lấy Profile từ PSID bằng Token động
   */
  async getSenderProfile(psid: string, token: string): Promise<any> {
    const url = `https://graph.facebook.com/${psid}?fields=first_name,last_name,profile_pic&access_token=${token}`;
    console.log(`[FB Service GraphAPI] Gọi request tới URL: https://graph.facebook.com/${psid}?fields=first_name,last_name...`);
    try {
      const response = await (globalThis as any).fetch(url);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[FB Service GraphAPI] Lỗi phản hồi từ Graph API: ${response.status} - ${errText}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error("[FB Service GraphAPI] Lỗi kết nối Graph API:", error);
      return null;
    }
  },

  /**
   * Gửi tin nhắn phản hồi tới khách hàng qua Facebook Send API (sử dụng Token của Page tương ứng)
   */
  async sendReply(pageId: string, conversationId: string, text: string, senderType: "human" | "ai" = "human") {
    const conversation = await FBConversationModel.findOne({ _id: conversationId, pageId });
    if (!conversation) {
      throw new Error("Không tìm thấy cuộc hội thoại để gửi phản hồi.");
    }

    // Hủy các phản hồi AI đang lên lịch do nhân viên đã can thiệp
    if (senderType === "human") {
      aiAutoReplyService.cancelPendingReply(conversationId, "human_reply");
    }

    const recipientPsid = conversation.recipientId;
    const resolvedPageId = conversation.pageId || pageId || process.env.FB_PAGE_ID || "";
    console.log(
      `[FB Service sendReply] Chuẩn bị gửi reply: conversationId=${conversationId}, pageId=${resolvedPageId}, ` +
      `recipientPsid=${recipientPsid}, textLength=${String(text || "").length}`
    );
    
    // Lấy token động của Page này từ DB
    const token = await this.getPageAccessTokenByPageId(resolvedPageId);
    
    if (!token) {
      console.error(`[FB Service sendReply] Lỗi: Không thể tìm thấy Access Token cấu hình cho Page ID: ${resolvedPageId}`);
      throw new Error(`Không tìm thấy Access Token cấu hình cho Page ID: ${resolvedPageId}`);
    }

    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
    
    const body = {
      recipient: { id: recipientPsid },
      message: { text },
      messaging_type: "RESPONSE"
    };

    try {
      const response = await (globalThis as any).fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const textErr = await response.text();
        console.error(`[FB Service sendReply] Send API phản hồi lỗi: ${response.status} - ${textErr}`);
        
        let isTokenError = false;
        let facebookErrCode = 0;
        try {
          const errObj = JSON.parse(textErr);
          facebookErrCode = errObj.error?.code;
          const msgLower = String(errObj.error?.message || "").toLowerCase();
          if (facebookErrCode === 190 || facebookErrCode === 102 || facebookErrCode === 100 || msgLower.includes("token") || msgLower.includes("session")) {
            isTokenError = true;
          }
        } catch (e) {
          if (textErr.includes("token") || textErr.includes("OAuth") || response.status === 401 || response.status === 400) {
            isTokenError = true;
          }
        }

        if (isTokenError) {
          const integration = await SocialIntegrationModel.findOne({
            platform: "Facebook",
            username: resolvedPageId,
          });
          const { telegramService } = require("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "Facebook",
            integration?.displayName || "Facebook Page",
            resolvedPageId,
            integration?.companyCode || "SYSTEM",
            `Mã lỗi Facebook: ${facebookErrCode || response.status}. Chi tiết: ${textErr.slice(0, 150)}`
          ).catch((e: any) => console.error("[FB Service] Không thể gửi cảnh báo lỗi Token về Telegram:", e));
        }

        throw new Error(`Facebook Send API phản hồi lỗi: ${response.status} - ${textErr}`);
      }

      const data = await response.json();
      console.log(
        `[FB Service sendReply] Send API thành công: conversationId=${conversationId}, ` +
        `facebookMessageId=${data.message_id || "n/a"}, recipientId=${recipientPsid}`
      );

      conversation.lastMessageText = text;
      conversation.lastMessageAt = new Date();
      conversation.unreadCount = 0;
      if (senderType === "human") {
        conversation.aiPausedUntil = new Date(Date.now() + 30 * 60 * 1000); // Tạm dừng AI cho cuộc hội thoại này 30 phút
      }
      await conversation.save();

      const newMsg = new FBMessageModel({
        conversationId: conversation?._id,
        senderId: resolvedPageId,
        recipientId: recipientPsid,
        direction: "outbound",
        text,
        attachments: [],
        messageId: data.message_id || `out_${Date.now()}`,
        timestamp: new Date(),
        status: "sent",
      });
      await newMsg.save();

      // Realtime update via Socket.IO
      emitToPage(resolvedPageId, "new_message", {
        message: newMsg,
        conversation: conversation
      });
      emitToPage(resolvedPageId, "conversation_updated", conversation);

      return {
        status: "success",
        messageId: newMsg.messageId,
      };
    } catch (error: any) {
      console.error("[FB Service sendReply] Thất bại khi gửi hoặc lưu phản hồi:", error);
      throw new Error(`Gửi tin nhắn thất bại: ${error.message}`);
    }
  },

  /**
   * Gửi sender_action (ví dụ: typing_on, typing_off, mark_seen) tới khách hàng qua Facebook Graph API
   */
  async sendSenderAction(pageId: string, conversationId: string, action: "typing_on" | "typing_off" | "mark_seen") {
    const conversation = await FBConversationModel.findOne({ _id: conversationId, pageId });
    if (!conversation) return;

    const recipientPsid = conversation.recipientId;
    const resolvedPageId = conversation.pageId || pageId || "";
    const token = await this.getPageAccessTokenByPageId(resolvedPageId);
    if (!token) return;

    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
    const body = {
      recipient: { id: recipientPsid },
      sender_action: action
    };

    try {
      await (globalThis as any).fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error(`[FB Service sendSenderAction] Thất bại khi gửi sender_action ${action}:`, error);
    }
  },

  async getConversations(pageId?: string, options?: { sync?: boolean; limit?: number; skip?: number }) {
    console.log(`[FB Service getConversations] Lọc hội thoại theo Page ID: ${pageId || "Tất cả"}, limit: ${options?.limit || 20}, skip: ${options?.skip || 0}`);
    const filter = pageId ? { pageId } : {};
    const skip = options?.skip || 0;
    const limit = options?.limit || 20;

    if (pageId && options?.sync && skip === 0 && this.shouldSync(`conversations:${pageId}`, CONVERSATION_SYNC_TTL_MS)) {
      try {
        await this.syncConversationsFromFacebook(pageId);
      } catch (error) {
        console.error(`[FB Service getConversations] Đồng bộ trực tiếp từ Facebook thất bại cho Page ID ${pageId}:`, error);
      }
    }

    return FBConversationModel.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit);
  },

  /**
   * Lấy lịch sử tin nhắn của cuộc hội thoại
   */
  async getMessages(pageId: string, conversationId: string, options?: { limit?: number; before?: string; sync?: boolean }) {
    console.log(`[FB Service getMessages] Lấy tin nhắn cho conversation ${conversationId} thuộc Page ID: ${pageId}`);
    const conversation = await FBConversationModel.findOne({ _id: conversationId, pageId });
    if (!conversation) {
      console.warn(`[FB Service getMessages] Không tìm thấy conversation ${conversationId} thuộc Page ID: ${pageId}.`);
      return {
        messages: [],
        pagination: {
          limit: Math.min(Math.max(Number(options?.limit || 20), 1), 100),
          hasMore: false,
          nextBefore: null,
        },
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

    let existingMessages = await FBMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit + 1);

    if (!beforeDate && options?.sync && conversation.recipientId && this.shouldSync(`messages:${pageId}:${conversation._id}`, MESSAGE_SYNC_TTL_MS)) {
      await this.syncMessagesFromFacebook(pageId, conversation.recipientId);
      existingMessages = await FBMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit + 1);
    }

    const hasMore = existingMessages.length > limit;
    const trimmedMessages = hasMore ? existingMessages.slice(0, limit) : existingMessages;
    const orderedMessages = [...trimmedMessages].reverse();
    const oldestMessage = orderedMessages[0];
    const latestMessage = orderedMessages[orderedMessages.length - 1];

    return {
      messages: orderedMessages,
      pagination: {
        limit,
        hasMore,
        nextBefore: oldestMessage?.timestamp ? new Date(oldestMessage.timestamp).toISOString() : null,
      },
    };
  },

  async diagnoseConversation(pageId: string, conversationId: string) {
    const resolvedPageId = normalizeFacebookId(pageId);
    const conversation = await FBConversationModel.findOne({ _id: conversationId, pageId }).lean();
    const directOwnerCandidates = await UserModel.find({
      "facebookIntegration.isConnected": true,
      "facebookIntegration.pageId": resolvedPageId,
    })
      .select("email companyCode aiAutoReplyConfig.enabled")
      .lean();
    const pageOwner = await UserModel.findOne({
      "facebookIntegration.isConnected": true,
      "facebookIntegration.pageId": resolvedPageId,
    })
      .select("email companyCode aiAutoReplyConfig facebookIntegration.pageId facebookIntegration.pageName facebookIntegration.pageAccessToken")
      .lean();
    const companyIntegrations = await SocialIntegrationModel.find({
      platform: "Facebook",
      username: resolvedPageId,
      isConnected: true
    }).lean();
    const companyIntegration = companyIntegrations[0] || null;
    let companyCode = pageOwner?.companyCode || null;
    let aiEnabled = !!pageOwner?.aiAutoReplyConfig?.enabled;
    let replyDelay = pageOwner?.aiAutoReplyConfig?.replyDelay ?? null;
    let model = pageOwner?.aiAutoReplyConfig?.model || null;
    let pageOwnerEmail = pageOwner?.email || null;
    let ownerSource = pageOwner ? "user" : null;

    if (!pageOwner) {
      if (companyIntegration) {
        companyCode = companyIntegration.companyCode;
        const companyUser = await UserModel.findOne({
          companyCode,
          "aiAutoReplyConfig.enabled": true,
        }).select("email aiAutoReplyConfig").lean()
          || await UserModel.findOne({ companyCode }).select("email aiAutoReplyConfig").lean();
        if (companyUser) {
          pageOwnerEmail = companyUser.email;
          aiEnabled = !!companyUser.aiAutoReplyConfig?.enabled;
          replyDelay = companyUser.aiAutoReplyConfig?.replyDelay ?? null;
          model = companyUser.aiAutoReplyConfig?.model || null;
          ownerSource = "company";
        }
      }
    }

    const latestMessage = conversation
      ? await FBMessageModel.findOne({ conversationId: conversation._id }).sort({ timestamp: -1 }).lean()
      : null;
    const token = await this.getPageAccessTokenByPageId(pageId);
    const reasons: string[] = [];
    if (!conversation) reasons.push("conversation_not_found");
    if (!pageOwner && !companyIntegration) reasons.push("owner_not_found");
    if (directOwnerCandidates.length > 1) reasons.push("multiple_user_page_mappings");
    if (!aiEnabled) reasons.push("ai_disabled");
    if (!token) reasons.push("missing_page_access_token");
    if (conversation && !latestMessage) reasons.push("no_messages");
    if (latestMessage && latestMessage.direction !== "inbound") reasons.push("latest_message_not_inbound");
    if (latestMessage?.direction === "inbound" && !String(latestMessage.text || "").trim()) reasons.push("latest_inbound_message_empty");
    const shouldTriggerAutoReply = reasons.length === 0;

    return {
      channel: "facebook",
      pageId,
      resolvedPageId,
      conversationFound: !!conversation,
      conversationPageId: conversation?.pageId || null,
      recipientId: conversation?.recipientId || null,
      pageOwnerEmail,
      ownerSource,
      companyCode,
      aiEnabled,
      replyDelay,
      model,
      hasPageAccessToken: !!token,
      pageAccessTokenTail: token ? token.slice(-6) : null,
      directOwnerCandidateCount: directOwnerCandidates.length,
      directOwnerCandidates: directOwnerCandidates.map((item: any) => ({
        email: item.email,
        companyCode: item.companyCode || null,
        aiEnabled: !!item.aiAutoReplyConfig?.enabled,
      })),
      companyIntegrationCount: companyIntegrations.length,
      companyIntegrationCompanies: companyIntegrations.map((item: any) => item.companyCode),
      latestMessageDirection: latestMessage?.direction || null,
      latestMessageId: latestMessage?.messageId || null,
      latestMessageText: latestMessage?.text || null,
      latestMessageAt: latestMessage?.timestamp || null,
      shouldTriggerAutoReply,
      reasons,
    };
  },

  async diagnosePageConfig(userId: string, resolvedPageId?: string) {
    const user = await UserModel.findById(userId)
      .select("email companyCode facebookIntegration")
      .lean();
    const normalizedResolvedPageId = normalizeFacebookId(resolvedPageId);

    const companyIntegrations = await SocialIntegrationModel.find({
      companyCode: user?.companyCode,
      platform: "Facebook",
    })
      .select("displayName username isConnected verifyToken accessToken")
      .lean();

    const directOwnerCandidates = normalizedResolvedPageId
      ? await UserModel.find({
          "facebookIntegration.isConnected": true,
          "facebookIntegration.pageId": normalizedResolvedPageId,
        })
          .select("email companyCode aiAutoReplyConfig.enabled")
          .lean()
      : [];

    const crossCompanyIntegrations = normalizedResolvedPageId
      ? await SocialIntegrationModel.find({
          platform: "Facebook",
          username: normalizedResolvedPageId,
          isConnected: true,
        })
          .select("companyCode displayName username createdBy")
          .lean()
      : [];

    const conversationsForResolvedPage = normalizedResolvedPageId
      ? await FBConversationModel.countDocuments({ pageId: normalizedResolvedPageId })
      : 0;

    const recentConversations = await FBConversationModel.find({})
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .select("pageId recipientId senderName lastMessageAt")
      .lean();

    const token = normalizedResolvedPageId ? await this.getPageAccessTokenByPageId(normalizedResolvedPageId) : null;
    let webhookSubscription: any = null;
    if (normalizedResolvedPageId && token) {
      try {
        webhookSubscription = await this.subscribePageWebhooks(normalizedResolvedPageId, token);
      } catch (err: any) {
        webhookSubscription = { error: err.message || err };
      }
    }

    console.log(`[FB Diagnose Page] user=${user?.email}, company=${user?.companyCode}, resolvedPageId=${resolvedPageId || "none"}, personalPageId=${user?.facebookIntegration?.pageId || "none"}, companyPages=${companyIntegrations.map((item: any) => item.username).join(",") || "none"}, token=${token ? `FOUND(...${token.slice(-6)})` : "NOT_FOUND"}, conversationsForResolvedPage=${conversationsForResolvedPage}, webhookSubscription=${JSON.stringify(webhookSubscription)}`);

    return {
      userEmail: user?.email || null,
      companyCode: user?.companyCode || null,
      personalIntegration: user?.facebookIntegration
        ? {
            isConnected: !!user.facebookIntegration.isConnected,
            pageId: user.facebookIntegration.pageId || null,
            pageName: user.facebookIntegration.pageName || null,
            hasToken: !!user.facebookIntegration.pageAccessToken,
            verifyToken: user.facebookIntegration.verifyToken || null,
          }
        : null,
      companyIntegrations: companyIntegrations.map((item: any) => ({
        displayName: item.displayName,
        pageId: item.username || null,
        isConnected: !!item.isConnected,
        hasToken: !!item.accessToken,
        verifyToken: item.verifyToken || null,
      })),
      resolvedPageId: normalizedResolvedPageId || null,
      hasResolvedToken: !!token,
      resolvedTokenTail: token ? token.slice(-6) : null,
      webhookSubscription,
      directOwnerCandidateCount: directOwnerCandidates.length,
      directOwnerCandidates: directOwnerCandidates.map((item: any) => ({
        email: item.email,
        companyCode: item.companyCode || null,
        aiEnabled: !!item.aiAutoReplyConfig?.enabled,
      })),
      crossCompanyIntegrationCount: crossCompanyIntegrations.length,
      crossCompanyIntegrations: crossCompanyIntegrations.map((item: any) => ({
        companyCode: item.companyCode,
        displayName: item.displayName,
        pageId: item.username || null,
        createdBy: item.createdBy || null,
      })),
      conversationsForResolvedPage,
      recentConversationPageIds: recentConversations.map((item: any) => ({
        pageId: item.pageId,
        recipientId: item.recipientId,
        senderName: item.senderName,
        lastMessageAt: item.lastMessageAt,
      })),
    };
  }
};
