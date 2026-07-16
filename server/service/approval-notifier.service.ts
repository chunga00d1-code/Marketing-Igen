/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Approval Notifier Service
 * ─────────────────────────
 * Gửi thông báo Telegram tới các giám đốc (admin/superadmin) cùng companyCode
 * khi một campaign slot chuyển sang trạng thái pending_approval.
 */
import jwt from "jsonwebtoken";
import { TelegramSessionModel } from "../model/telegram-session.model";
import { telegramService } from "./telegram.service";
import { MarketingContentModel } from "../model/marketing-content.model";

const ADMIN_ROLES = ["admin", "superadmin"];

interface SlotInfo {
  _id: any;
  campaignId: any;
  companyCode: string;
  platform?: string;
  pillar?: string;
  topicBrief?: string;
  scheduledTime?: Date | string;
}

interface CampaignInfo {
  _id: any;
  title?: string;
  companyCode: string;
}

function buildApprovalLink(slotId: string, campaignId: string, companyCode: string): string {
  const token = jwt.sign(
    { slotId, campaignId, companyCode },
    process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key",
    { expiresIn: "30d" }
  );

  let baseUrl = process.env.APP_URL || "https://marketing.igentechsolutions.com";
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  return `${baseUrl}/approve-post?token=${token}`;
}

function formatScheduledTime(time?: Date | string): string {
  if (!time) return "Chưa xác định";
  const date = typeof time === "string" ? new Date(time) : time;
  if (isNaN(date.getTime())) return "Chưa xác định";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function truncateText(value: string, maxLength: number): string {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function buildNotificationMessage(slot: SlotInfo, campaign: CampaignInfo, content: any, excludeMediaLinks?: boolean): string {
  const campaignTitle = campaign.title || "Chiến dịch Marketing";
  const platform = slot.platform || "Không xác định";
  const pillar = slot.pillar || "—";
  const topicBrief = slot.topicBrief || "Không có chủ đề";
  const scheduledDisplay = formatScheduledTime(slot.scheduledTime || (slot as any).scheduledAt);

  const messageLines = [
    "📋 <b>BÀI ĐĂNG CẦN PHÊ DUYỆT</b>",
    "",
    `🏷️ Chiến dịch: <b>${campaignTitle}</b>`,
    `📱 Kênh: <b>${platform}</b> | Pillar: <b>${pillar}</b>`,
    `📅 Lịch đăng: <b>${scheduledDisplay}</b>`,
    `💡 Chủ đề: <i>${topicBrief}</i>`,
  ];

  if (content) {
    const truncatedBody = content.bodyText ? truncateText(content.bodyText, 400) : "";
    messageLines.push(
      "",
      "✍️ <b>Bản nháp nội dung:</b>",
      `<b>Tiêu đề:</b> ${content.title || "—"}`,
      `<i>${truncatedBody || "Chưa có nội dung"}</i>`
    );
    if (!excludeMediaLinks) {
      if (content.imageUrl) {
        messageLines.push(`🖼️ <a href="${content.imageUrl}">Ảnh đính kèm</a>`);
      } else if (content.videoUrl) {
        messageLines.push(`🎬 <a href="${content.videoUrl}">Video đính kèm</a>`);
      }
    }
  }

  messageLines.push(
    "",
    "Bấm nút dưới đây để duyệt nhanh từ Telegram hoặc mở trang web chi tiết."
  );

  return messageLines.join("\n");
}

export const approvalNotifierService = {
  /**
   * Gửi thông báo phê duyệt qua Telegram tới các admin/superadmin
   * cùng companyCode với slot. Fire-and-forget, không throw lỗi ra ngoài.
   */
  async notifyPendingApproval(slot: SlotInfo, campaign: CampaignInfo): Promise<void> {
    try {
      const companyCode = slot.companyCode;
      if (!companyCode) {
        console.warn("[ApprovalNotifier] Slot thiếu companyCode, bỏ qua gửi thông báo.");
        return;
      }

      // Tìm tất cả Telegram session của admin/superadmin cùng công ty
      const adminSessions = await TelegramSessionModel.find({
        companyCode,
        role: { $in: ADMIN_ROLES },
      }).lean();

      if (adminSessions.length === 0) {
        console.log(`[ApprovalNotifier] Không tìm thấy admin Telegram session cho companyCode="${companyCode}". Bỏ qua thông báo.`);
        return;
      }

      // Tìm content bản nháp
      const content = await MarketingContentModel.findOne({ campaignSlotId: slot._id }).lean();

      // Tạo link phê duyệt
      const approvalLink = buildApprovalLink(
        String(slot._id),
        String(slot.campaignId),
        companyCode
      );

      // Xác định xem có media để gửi xem trước không
      let targetImageUrl = "";
      let targetVideoUrl = "";
      if (content) {
        targetImageUrl = content.imageUrl || "";
        targetVideoUrl = content.videoUrl || "";

        if (!targetImageUrl && !targetVideoUrl && content.mediaUrls && content.mediaUrls.length > 0) {
          const firstMedia = content.mediaUrls[0];
          const isVideo = /\.(mp4|mov|avi|mkv|webm)/i.test(firstMedia) || firstMedia.includes("video");
          if (isVideo) {
            targetVideoUrl = firstMedia;
          } else {
            targetImageUrl = firstMedia;
          }
        }
      }

      // Nút bấm
      const buttons = [
        [
          { text: "✅ Phê duyệt", callbackData: `/slot_approve ${slot._id}` },
          { text: "✏️ Sửa", callbackData: `/slot_edit ${slot._id}` },
          { text: "❌ Từ chối", callbackData: `/slot_reject ${slot._id}` }
        ],
        [
          { text: "🔗 Chi tiết trên Web", url: approvalLink }
        ]
      ];

      const captionMessage = buildNotificationMessage(slot, campaign, content, true);
      const textMessage = buildNotificationMessage(slot, campaign, content, false);

      // Gửi tới từng giám đốc
      const sendPromises = adminSessions.map(async (session) => {
        try {
          if (targetVideoUrl) {
            try {
              await telegramService.sendVideoWithSlotApprovalButtons(
                session.telegramChatId,
                targetVideoUrl,
                captionMessage,
                buttons
              );
              console.log(`[ApprovalNotifier] Đã gửi thông báo video phê duyệt slot ${slot._id} tới Telegram chatId=${session.telegramChatId}`);
              return;
            } catch (mediaErr) {
              console.warn(`[ApprovalNotifier] Không thể gửi video tới chatId=${session.telegramChatId}, chuyển sang gửi text fallback:`, mediaErr);
            }
          } else if (targetImageUrl) {
            try {
              await telegramService.sendPhotoWithSlotApprovalButtons(
                session.telegramChatId,
                targetImageUrl,
                captionMessage,
                buttons
              );
              console.log(`[ApprovalNotifier] Đã gửi thông báo ảnh phê duyệt slot ${slot._id} tới Telegram chatId=${session.telegramChatId}`);
              return;
            } catch (mediaErr) {
              console.warn(`[ApprovalNotifier] Không thể gửi ảnh tới chatId=${session.telegramChatId}, chuyển sang gửi text fallback:`, mediaErr);
            }
          }

          // Fallback
          await telegramService.sendMessageWithSlotApprovalButtons(
            session.telegramChatId,
            textMessage,
            buttons
          );
          console.log(`[ApprovalNotifier] Đã gửi thông báo phê duyệt slot ${slot._id} tới Telegram chatId=${session.telegramChatId} (${session.displayName || session.email}).`);
        } catch (sendErr: any) {
          console.warn(`[ApprovalNotifier] Không thể gửi thông báo tới chatId=${session.telegramChatId}: ${sendErr?.message || sendErr}`);
        }
      });

      await Promise.allSettled(sendPromises);
      console.log(`[ApprovalNotifier] Hoàn thành gửi thông báo slot ${slot._id} tới ${adminSessions.length} admin(s) của companyCode="${companyCode}".`);
    } catch (error: any) {
      // Fire-and-forget: log lỗi nhưng không crash
      console.error(`[ApprovalNotifier] Lỗi khi gửi thông báo phê duyệt: ${error?.message || error}`);
    }
  },
};
