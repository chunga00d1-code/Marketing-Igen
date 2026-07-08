import { facebookPostService } from "./facebook-post.service";
import { MarketingContentModel } from "../model/marketing-content.model";
import { UserModel } from "../model/user.model";
import { SocialIntegrationModel } from "../model/social-integration.model";

export const schedulerService = {
  /**
   * Re-check các bài Facebook đang ở trạng thái "processing" (video chưa encode xong sau khi n8n callback).
   * n8n workflow mới đã tự đăng bài và check status ngay sau 20s.
   * Hàm này chỉ cần xử lý trường hợp video vẫn chưa ready sau lần check đó.
   */
  async checkAndPublishPosts() {
    console.log("[Scheduler Service] Bắt đầu quét bài Facebook đang processing...");

    try {
      const processingCards = await MarketingContentModel.find({
        status: "processing",
        channel: "Facebook",
        facebookPostId: { $exists: true, $ne: "" },
      });

      if (!processingCards || processingCards.length === 0) {
        console.log("[Scheduler Service] Không có bài Facebook nào đang processing.");
        return { processedCount: 0, successCount: 0, failedCount: 0, details: [] };
      }

      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;
      const details: any[] = [];

      for (const card of processingCards) {
        const cardId = card._id.toString();
        processedCount++;

        try {
          let accessToken: string | undefined = undefined;
          let isMock = false;

          if (card.integrationId) {
            const fbIntegration = await SocialIntegrationModel.findOne({
              _id: card.integrationId,
              platform: "Facebook",
              isConnected: true,
            }).lean();
            if (!fbIntegration) {
              throw new Error("Liên kết Facebook không còn tồn tại hoặc đã bị ngắt.");
            }
            accessToken = fbIntegration.accessToken;
            isMock = !!fbIntegration.isMock;
          } else {
            const user = await UserModel.findById(card.authorUid).lean();
            const fbInt = user?.facebookIntegration;
            if (!fbInt?.isConnected) {
              throw new Error("Tài khoản chưa liên kết Facebook Page.");
            }
            accessToken = fbInt.pageAccessToken;
            isMock = !!fbInt.isMock;
          }

          if (!accessToken) throw new Error("Không lấy được access token.");

          if (isMock || accessToken.includes("mock")) {
            await MarketingContentModel.findByIdAndUpdate(cardId, {
              status: "published",
              publishedAt: new Date(),
              publishError: null,
            });
            successCount++;
            details.push({ cardId, title: card.title, status: "success" });
            continue;
          }

          const checkResult = await facebookPostService.checkVideoStatus(
            card.facebookPostId!,
            accessToken,
            true
          );

          console.log(`[Scheduler Service] Re-check video ${card.facebookPostId}: ${checkResult.status}`);

          if (checkResult.status === "ready") {
            await MarketingContentModel.findByIdAndUpdate(cardId, {
              status: "published",
              publishedAt: new Date(),
              publishError: null,
            });
            successCount++;
            details.push({ cardId, title: card.title, status: "success" });
          } else if (checkResult.status === "failed") {
            throw new Error(checkResult.error || "Facebook video processing failed.");
          } else {
            // Vẫn processing — bỏ qua, lần sau quét tiếp
            details.push({ cardId, title: card.title, status: "pending" });
            processedCount--;
          }
        } catch (err: any) {
          const errMsg = err.message || String(err);
          console.error(`[Scheduler Service] Lỗi re-check bài ${cardId}:`, errMsg);
          await MarketingContentModel.findByIdAndUpdate(cardId, {
            status: "failed",
            publishError: errMsg,
          });
          failedCount++;
          details.push({ cardId, title: card.title, status: "failed", error: errMsg });
        }
      }

      console.log(`[Scheduler Service] Xong. Tổng: ${processedCount}, Thành công: ${successCount}, Thất bại: ${failedCount}`);
      return { processedCount, successCount, failedCount, details };
    } catch (dbError: any) {
      console.error("[Scheduler Service] Lỗi DB:", dbError.message);
      throw dbError;
    }
  },

  /**
   * Gửi thông tin bài đăng + lịch hẹn sang n8n Webhook để n8n tự động quản lý độ trễ và tự động đăng bài
   */
  async sendScheduleToN8n(payload: any) {
    const webhookUrl = process.env.N8N_FB_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error(
        "Cấu hình N8N_FB_WEBHOOK_URL chưa được thiết lập trong biến môi trường."
      );
    }

    const secretToken = process.env.N8N_WEBHOOK_SECRET;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secretToken) {
      headers["X-Webhook-Token"] = secretToken;
    }

    let n8nPayload = payload;

    if (payload.channel === "Facebook" && payload.integration) {
      let scheduledTimeISO = "";
      if (payload.scheduledDate && payload.scheduledTime) {
        scheduledTimeISO = `${payload.scheduledDate}T${payload.scheduledTime}:00+07:00`;
      }

      let mediaType: "none" | "image" | "video" = "none";
      let mediaUrl = "";
      if (payload.videoUrl) {
        mediaType = "video";
        mediaUrl = payload.videoUrl;
      } else if (payload.imageUrl) {
        mediaType = "image";
        mediaUrl = payload.imageUrl;
      }

      const appUrl = process.env.APP_URL || "https://api.igentechsolutions.com";
      const callbackUrl = `${appUrl.replace(/\/$/, "")}/api/v1/facebook/n8n-callback`;

      n8nPayload = {
        cardId: payload.cardId,
        platform: "facebook",
        publishType: "scheduled",
        scheduledTime: scheduledTimeISO,
        title: payload.title || "",
        content: payload.bodyText || "",
        mediaType,
        mediaUrl,
        pageId: payload.integration.pageId,
        accessToken: payload.integration.pageAccessToken,
        callbackUrl,
      };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(n8nPayload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `n8n Webhook phản hồi lỗi: ${response.status} - ${text}`
        );
      }

      let responseData: any = {};
      const textData = await response.text();
      if (textData.trim()) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            responseData = JSON.parse(textData);
          } catch (err) {
            responseData = { message: textData };
          }
        } else {
          responseData = { message: textData };
        }
      }

      return {
        status: "success",
        message: "Gửi yêu cầu lên lịch bài đăng sang n8n thành công",
        data: responseData,
      };
    } catch (error: any) {
      console.error("[schedulerService.sendScheduleToN8n] Error:", error);
      throw new Error(`Gửi yêu cầu lên lịch sang n8n thất bại: ${error.message}`);
    }
  },
};
