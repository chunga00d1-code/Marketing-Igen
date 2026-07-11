import mongoose from "mongoose";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { MarketingCampaignStatus, MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";
import { buildCampaignSchedule } from "./marketing-campaign-schedule.service";
import { geminiService } from "./gemini.service";

interface CreateCampaignInput {
  sourceBrief: string;
  startDate: string;
  endDate: string;
  postsPerDay: number;
  postingTimes: string[];
  timezone?: string;
  platforms: MarketingCampaignPlatform[];
  integrationIds?: Partial<Record<MarketingCampaignPlatform, string>>;
  candidateCount?: number;
  generationLeadMinutes?: number;
  verificationLeadMinutes?: number;
  latePublishWindowMinutes?: number;
  minimumScore?: number;
  mediaPolicy?: "text" | "image" | "video" | "auto";
  rules?: {
    requiredCta?: string;
    requiredHashtags?: string[];
    forbiddenTerms?: string[];
    allowTextOnlyFallback?: boolean;
  };
}

const ACTIVE_SLOT_STATUSES: MarketingCampaignSlotStatus[] = ["planned", "queued", "generating", "scoring", "generating_media", "verifying", "ready_to_publish", "retrying"];

async function validateIntegrations(companyCode: string, platforms: MarketingCampaignPlatform[], integrationIds: CreateCampaignInput["integrationIds"]) {
  for (const platform of platforms) {
    const integrationId = integrationIds?.[platform];
    if (!integrationId) continue;
    if (!mongoose.Types.ObjectId.isValid(integrationId)) {
      throw new Error(`Liên kết ${platform} không hợp lệ.`);
    }
    const exists = await SocialIntegrationModel.exists({
      _id: integrationId,
      companyCode,
      platform,
      isConnected: true,
    });
    if (!exists) throw new Error(`Không tìm thấy liên kết ${platform} đang hoạt động trong doanh nghiệp.`);
  }
}

export const marketingCampaignService = {
  async create(companyCode: string, createdBy: string, input: CreateCampaignInput) {
    const timezone = input.timezone || "Asia/Bangkok";
    const generationLeadMinutes = input.generationLeadMinutes ?? 60;
    const verificationLeadMinutes = input.verificationLeadMinutes ?? 15;
    const schedule = buildCampaignSchedule({
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      timezone,
      platforms: input.platforms,
      generationLeadMinutes,
      verificationLeadMinutes,
    });

    const now = new Date();
    const failingSlot = schedule.find((slot) => slot.prepareAt <= now);
    if (failingSlot) {
      const formatZonedTime = (date: Date) => {
        return new Intl.DateTimeFormat("vi-VN", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(date);
      };

      const scheduledStr = formatZonedTime(failingSlot.scheduledAt);
      const prepareStr = formatZonedTime(failingSlot.prepareAt);
      const nowStr = formatZonedTime(now);

      if (failingSlot.scheduledAt <= now) {
        throw new Error(
          `Lịch đăng lúc ${scheduledStr} đã trôi qua so với thời gian hiện tại (${nowStr}). Vui lòng chọn khung giờ khác.`
        );
      } else {
        throw new Error(
          `Lịch đăng lúc ${scheduledStr} quá sát thời gian hiện tại (${nowStr}). Hệ thống cần ${generationLeadMinutes} phút để chuẩn bị nội dung (bắt đầu từ ${prepareStr}).`
        );
      }
    }
    await validateIntegrations(companyCode, input.platforms, input.integrationIds);

    const strategy = await geminiService.generateScheduledCampaign({
      prompt: input.sourceBrief,
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      channels: input.platforms,
    });
    if (strategy.slots.length !== schedule.length) {
      throw new Error(`AI trả về ${strategy.slots.length}/${schedule.length} slot chiến dịch.`);
    }

    const campaign = await MarketingCampaignModel.create({
      companyCode,
      createdBy,
      title: strategy.campaignTitle,
      sourceBrief: input.sourceBrief,
      status: "active",
      timezone,
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      platforms: input.platforms,
      integrationIds: input.integrationIds || {},
      candidateCount: input.candidateCount ?? 3,
      generationLeadMinutes,
      verificationLeadMinutes,
      latePublishWindowMinutes: input.latePublishWindowMinutes ?? 30,
      minimumScore: input.minimumScore ?? 80,
      mediaPolicy: input.mediaPolicy || "auto",
      contentPillars: strategy.contentPillars,
      rules: input.rules || {},
      statistics: { totalSlots: schedule.length, publishedSlots: 0, failedSlots: 0, estimatedCost: 0, actualCost: 0 },
    });

    try {
      const slots = await MarketingCampaignSlotModel.insertMany(schedule.map((scheduledSlot, index) => {
        const brief = strategy.slots[index];
        const integrationId = input.integrationIds?.[scheduledSlot.platform];
        return {
          companyCode,
          campaignId: campaign._id,
          scheduledAt: scheduledSlot.scheduledAt,
          prepareAt: scheduledSlot.prepareAt,
          verifyAt: scheduledSlot.verifyAt,
          platform: scheduledSlot.platform,
          integrationId,
          pillar: brief.pillar,
          objective: brief.objective,
          topicBrief: brief.topicBrief,
          mediaType: brief.mediaType,
          status: "planned",
          attemptCount: 0,
          publishIdempotencyKey: `${campaign._id}:${index}:${scheduledSlot.platform}`,
          transitions: [{ to: "planned", reason: "Campaign activated", at: new Date() }],
        };
      }));
      return { campaign, slots };
    } catch (error) {
      await MarketingCampaignModel.deleteOne({ _id: campaign._id, companyCode });
      throw error;
    }
  },

  async list(companyCode: string) {
    return MarketingCampaignModel.find({ companyCode }).sort({ createdAt: -1 }).lean();
  },

  async getDetail(companyCode: string, campaignId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error("ID chiến dịch không hợp lệ.");
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode }).lean();
    if (!campaign) throw new Error("Không tìm thấy chiến dịch.");
    const slots = await MarketingCampaignSlotModel.find({ campaignId, companyCode }).sort({ scheduledAt: 1 }).lean();
    return { campaign, slots };
  },

  async changeStatus(companyCode: string, campaignId: string, action: "pause" | "resume" | "cancel") {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error("ID chiến dịch không hợp lệ.");
    const transitions: Record<typeof action, { from: MarketingCampaignStatus[]; to: MarketingCampaignStatus }> = {
      pause: { from: ["active"], to: "paused" },
      resume: { from: ["paused"], to: "active" },
      cancel: { from: ["draft", "active", "paused", "failed"], to: "cancelled" },
    };
    const transition = transitions[action];
    const campaign = await MarketingCampaignModel.findOneAndUpdate(
      { _id: campaignId, companyCode, status: { $in: transition.from } },
      { $set: { status: transition.to } },
      { new: true }
    );
    if (!campaign) throw new Error("Trạng thái hiện tại không cho phép thao tác này.");

    if (action === "cancel") {
      await MarketingCampaignSlotModel.updateMany(
        { campaignId, companyCode, status: { $in: ACTIVE_SLOT_STATUSES } },
        {
          $set: { status: "cancelled", lockId: null, lockedAt: null, lockExpiresAt: null },
          $push: { transitions: { to: "cancelled", reason: "Campaign cancelled", at: new Date() } },
        }
      );
    }
    return campaign;
  },
};
