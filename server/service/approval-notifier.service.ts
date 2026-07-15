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

function buildNotificationMessage(slot: SlotInfo, campaign: CampaignInfo): string {
  const campaignTitle = campaign.title || "Chiến dịch Marketing";
  const platform = slot.platform || "Không xác định";
  const pillar = slot.pillar || "—";
  const topicBrief = slot.topicBrief || "Không có chủ đề";
  const scheduledDisplay = formatScheduledTime(slot.scheduledTime);

  return [
    "📋 <b>BÀI ĐĂNG CẦN PHÊ DUYỆT</b>",
    "",
    `🏷️ Chiến dịch: <b>${campaignTitle}</b>`,
    `📱 Kênh: <b>${platform}</b> | Pillar: <b>${pillar}</b>`,
    `📅 Lịch đăng: <b>${scheduledDisplay}</b>`,
    `💡 Chủ đề: <i>${topicBrief}</i>`,
    "",
    "Bấm nút bên dưới để xem chi tiết và phê duyệt bài viết.",
  ].join("\n");
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

      // Tạo link phê duyệt
      const approvalLink = buildApprovalLink(
        String(slot._id),
        String(slot.campaignId),
        companyCode
      );

      // Xây nội dung thông báo
      const message = buildNotificationMessage(slot, campaign);

      // Gửi tới từng giám đốc
      const sendPromises = adminSessions.map(async (session) => {
        try {
          await telegramService.sendMessageWithInlineKeyboard(
            session.telegramChatId,
            message,
            [{ text: "🔗 Mở trang phê duyệt", url: approvalLink }]
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
