import type { MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";

const MINIMUM_ACTIVATION_LEAD_MS = 15 * 60 * 1000;

export interface CampaignActivationSlot {
  _id?: unknown;
  status: string;
  scheduledAt: Date;
  platform: MarketingCampaignPlatform;
  mediaType: "text" | "image" | "video" | "human-video";
}

export type CampaignActivationIssue = {
  code: string;
  message: string;
  slotId?: string;
};

export class CampaignActivationValidationError extends Error {
  readonly issues: CampaignActivationIssue[];

  constructor(issues: CampaignActivationIssue[]) {
    super(issues[0]?.message || "Chiến dịch chưa thể khởi chạy. Vui lòng xử lý các mục được thông báo.");
    this.name = "CampaignActivationValidationError";
    this.issues = issues;
  }
}

function formatScheduledAt(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export function collectCampaignDraftActivationIssues(input: {
  slots: CampaignActivationSlot[];
  enabledPlatforms: MarketingCampaignPlatform[];
  timezone: string;
  now?: Date;
}): CampaignActivationIssue[] {
  const issues: CampaignActivationIssue[] = [];
  if (input.slots.length === 0) {
    issues.push({ code: "NO_SLOTS", message: "Chiến dịch cần ít nhất một bài đăng trước khi khởi chạy." });
    return issues;
  }

  const now = input.now || new Date();
  for (const [index, slot] of input.slots.entries()) {
    const slotId = slot._id ? String(slot._id) : undefined;
    const slotLabel = `Bài #${index + 1}`;
    if (slot.status !== "planned") {
      issues.push({ code: "SLOT_NOT_PLANNED", slotId, message: `${slotLabel} không còn ở trạng thái lên kế hoạch. Hãy tải lại dữ liệu trước khi khởi chạy.` });
    }
    if (!input.enabledPlatforms.includes(slot.platform)) {
      issues.push({ code: "PLATFORM_NOT_ENABLED", slotId, message: `${slotLabel} dùng ${slot.platform} nhưng nền tảng này chưa được chọn trong phần thiết lập.` });
    }
    if (slot.platform === "TikTok" && !["video", "human-video"].includes(slot.mediaType)) {
      issues.push({ code: "TIKTOK_VIDEO_REQUIRED", slotId, message: `${slotLabel} trên TikTok phải dùng video trước khi khởi chạy chiến dịch.` });
    }
    if (slot.scheduledAt.getTime() - now.getTime() < MINIMUM_ACTIVATION_LEAD_MS) {
      issues.push({ code: "SCHEDULE_TOO_SOON", slotId, message: `${slotLabel} lúc ${formatScheduledAt(slot.scheduledAt, input.timezone)} cần cách hiện tại ít nhất 15 phút để worker chuẩn bị nội dung.` });
    }
  }
  return issues;
}

export function assertCampaignDraftCanActivate(input: {
  slots: CampaignActivationSlot[];
  enabledPlatforms: MarketingCampaignPlatform[];
  timezone: string;
  now?: Date;
}) {
  const issues = collectCampaignDraftActivationIssues(input);
  if (issues.length > 0) throw new CampaignActivationValidationError(issues);
}
