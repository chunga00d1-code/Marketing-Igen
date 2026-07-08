import { resolveAutoReplyOwner } from "./ai-auto-reply.service";
import { aiKnowledgeService } from "./ai-knowledge.service";
import { geminiService } from "./gemini.service";
import { fbMessengerService } from "./fb-messenger.service";
import { AIReplyLogModel } from "../model/ai-reply-log.model";

const processingComments = new Set<string>();

export const facebookCommentService = {
  /**
   * Xử lý bình luận mới từ Facebook Webhook và tự động trả lời bằng AI
   */
  async handleIncomingComment(pageId: string, commentData: any) {
    let companyCode = "SYSTEM";
    let commentId = "";
    let postId = "";
    let messageText = "";
    let replyText = "";
    let effectiveRagContext: any = { contextText: "", matches: 0 };
    let aiConfig: any = null;
    const startedAt = Date.now();

    try {
      const senderId = commentData.from?.id || commentData.sender_id;
      const {
        comment_id: commentIdVal,
        post_id: postIdVal,
        verb,
        message,
      } = commentData;

      commentId = commentIdVal;
      postId = postIdVal;
      messageText = message;

      if (verb !== "add") {
        return;
      }

      // Tránh lặp vô hạn nếu Page tự trả lời chính mình
      const cleanSenderId = String(senderId || "").trim();
      const cleanPageId = String(pageId || "").trim();
      if (cleanSenderId === cleanPageId) {
        return;
      }

      if (!message || !String(message).trim()) {
        return;
      }

      // Tránh xử lý trùng lặp nếu bình luận này đã được phản hồi trước đó
      if (commentIdVal) {
        if (processingComments.has(commentIdVal)) {
          console.log(`[FB Comment Webhook] Bình luận ${commentIdVal} đang được xử lý, bỏ qua.`);
          return;
        }

        const existingLog = await AIReplyLogModel.findOne({ commentId: commentIdVal });
        if (existingLog) {
          return;
        }

        processingComments.add(commentIdVal);
      }

      console.log(`[FB Comment Webhook] Nhận bình luận mới: pageId=${pageId}, commentId=${commentId}, message="${message}"`);

      // Xác định Owner và kiểm tra cấu hình AI Auto-Reply
      const ownerInfo = await resolveAutoReplyOwner("facebook", pageId);
      companyCode = ownerInfo.companyCode;
      const selectedUser = ownerInfo.selectedUser;
      aiConfig = ownerInfo.aiConfig;

      if (!selectedUser || !aiConfig) {
        return;
      }

      // Kiểm tra xem cấu hình tự động trả lời bình luận có được bật riêng không
      if (!aiConfig.commentReplyEnabled) {
        return;
      }

      // Truy xuất ngữ cảnh RAG
      const ragContext = await aiKnowledgeService.searchRelevantContext({
        companyCode,
        query: message,
        channel: "facebook",
        topK: 5,
      });

      effectiveRagContext = aiKnowledgeService.buildEffectiveRagContext({
        companyCode,
        ragContext,
        trainingKnowledge: aiConfig.trainingKnowledge,
      });

      // Gọi Gemini sinh câu trả lời dành riêng cho comment (bao gồm comment công khai và inbox riêng tư)
      const aiResponse = await geminiService.chatComment(message, aiConfig, effectiveRagContext);

      if (!aiResponse || (!aiResponse.publicComment && !(aiResponse as any).text)) {
        console.error(`[FB Comment Webhook] Không nhận được nội dung trả lời từ Gemini cho comment ID ${commentId}`);
        await AIReplyLogModel.create({
          companyCode,
          channel: "facebook_comment",
          commentId,
          postId,
          customerMessage: message,
          aiResponse: "[FAILED] Không nhận được nội dung trả lời từ Gemini",
          contextPreview: effectiveRagContext.contextText || "",
          contextMatches: effectiveRagContext.matches || 0,
          mode: aiConfig.trainingKnowledge ? "trained" : "default",
          latencyMs: Date.now() - startedAt,
          status: "failed",
        });
        return;
      }

      const publicComment = (aiResponse.publicComment || (aiResponse as any).text || "").trim();
      const privateInbox = (aiResponse.privateInbox || "").trim();

      console.log(`[FB Comment Webhook] Đã sinh câu trả lời công khai: "${publicComment}"`);
      if (privateInbox) {
        console.log(`[FB Comment Webhook] Đã sinh tin nhắn inbox riêng tư: "${privateInbox}"`);
      }

      // Lấy page access token tương ứng
      const token = await fbMessengerService.getPageAccessTokenByPageId(pageId);
      if (!token) {
        throw new Error(`Không tìm thấy Access Token cho Fanpage ID: ${pageId}`);
      }

      // 1. Đăng câu trả lời công khai lên Graph API của Facebook
      const commentUrl = `https://graph.facebook.com/v19.0/${commentId}/comments?access_token=${token}`;
      const commentResponse = await (globalThis as any).fetch(commentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: publicComment }),
      });

      if (!commentResponse.ok) {
        const errText = await commentResponse.text();
        throw new Error(`Facebook Graph API (Comment Reply) trả về lỗi: ${commentResponse.status} - ${errText}`);
      }

      const commentResult = await commentResponse.json();
      console.log(`[FB Comment Webhook] Đã trả lời bình luận thành công, Graph Comment ID: ${commentResult.id}`);

      // 2. Gửi tin nhắn inbox riêng tư cho khách hàng (nếu có)
      let inboxSuccessStatus = "";
      let isInboxFailed = false;
      if (privateInbox) {
        try {
          const inboxUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
          const inboxResponse = await (globalThis as any).fetch(inboxUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { comment_id: commentId },
              message: { text: privateInbox }
            }),
          });

          if (!inboxResponse.ok) {
            isInboxFailed = true;
            const errText = await inboxResponse.text();
            let parsedError = errText;
            try {
              const errJson = JSON.parse(errText);
              if (errJson.error?.message) {
                parsedError = `(Mã ${errJson.error.code || "N/A"}) ${errJson.error.message}`;
              }
            } catch (e) {}
            console.error(`[FB Comment Webhook] Không thể gửi inbox riêng tư: ${inboxResponse.status} - ${errText}`);
            inboxSuccessStatus = ` | [Inbox Thất bại: ${parsedError}]`;
          } else {
            const inboxResult = await inboxResponse.json();
            console.log(`[FB Comment Webhook] Đã gửi inbox riêng tư thành công, Message ID: ${inboxResult.message_id}`);
            inboxSuccessStatus = " | [Inbox Thành công]";
          }
        } catch (inboxErr: any) {
          isInboxFailed = true;
          console.error(`[FB Comment Webhook] Lỗi khi gọi API gửi inbox riêng tư:`, inboxErr.message || inboxErr);
          inboxSuccessStatus = ` | [Inbox Lỗi: ${inboxErr.message || inboxErr}]`;
        }
      }

      const combinedLogResponse = privateInbox
        ? `[Bình luận] ${publicComment}\n[Inbox] ${privateInbox}${inboxSuccessStatus}`
        : publicComment;

      // Ghi nhận log
      await AIReplyLogModel.create({
        companyCode,
        channel: "facebook_comment",
        commentId,
        postId,
        customerMessage: message,
        aiResponse: combinedLogResponse,
        contextPreview: effectiveRagContext.contextText || "",
        contextMatches: effectiveRagContext.matches || 0,
        mode: aiConfig.trainingKnowledge ? "trained" : "default",
        latencyMs: Date.now() - startedAt,
        status: isInboxFailed ? "failed" : "sent",
      });
    } catch (error: any) {
      console.error("[FB Comment Webhook] Lỗi khi xử lý trả lời bình luận:", error.message || error);
      
      // Gửi cảnh báo mất kết nối nếu do lỗi Token
      const errorStr = error.message || String(error);
      if (errorStr.includes("token") || errorStr.includes("190") || errorStr.includes("102") || errorStr.includes("OAuth")) {
        try {
          const { SocialIntegrationModel } = await import("../model/social-integration.model");
          const integration = await SocialIntegrationModel.findOne({
            platform: "Facebook",
            username: pageId,
          });
          const { telegramService } = await import("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "Facebook",
            integration?.displayName || "Facebook Page",
            pageId,
            companyCode,
            `Lỗi Token khi trả lời bình luận: ${errorStr.slice(0, 150)}`
          ).catch((e: any) => console.error("[FB Comment Webhook] Không thể gửi cảnh báo lỗi Token về Telegram:", e));
        } catch (tgErr) {
          console.error("[FB Comment Webhook] Lỗi khi require/gửi cảnh báo Token:", tgErr);
        }
      }

      // Ghi nhận log thất bại
      if (commentId) {
        await AIReplyLogModel.create({
          companyCode,
          channel: "facebook_comment",
          commentId,
          postId,
          customerMessage: messageText,
          aiResponse: `[FAILED] ${replyText || "[Không có phản hồi AI]"}\n\nError: ${error.message || error}`,
          contextPreview: effectiveRagContext.contextText || "",
          contextMatches: effectiveRagContext.matches || 0,
          mode: aiConfig ? (aiConfig.trainingKnowledge ? "trained" : "default") : "default",
          latencyMs: Date.now() - startedAt,
          status: "failed",
        }).catch((logErr) => {
          console.error("[FB Comment Webhook] Không thể ghi nhận log lỗi vào database:", logErr.message || logErr);
        });
      }
    } finally {
      if (commentId) {
        processingComments.delete(commentId);
      }
    }
  }
};
