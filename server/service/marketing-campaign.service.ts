import { randomUUID } from "crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { MarketingCampaignStatus, MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";
import { buildCampaignSchedule, zonedLocalTimeToUtc } from "./marketing-campaign-schedule.service";
import { geminiService } from "./gemini.service";
import { CampaignMatrixGeneratorService } from "./agents/campaign-matrix-generator.service";
import { CampaignOrchestratorService } from "./agents/campaign-orchestrator.service";
import { scanAndEnqueueDueSlots } from "./campaign-scheduler.service";
import { API_COSTS } from "./wallet.service";
import { listGoogleDriveFolderFiles, getGoogleDriveDirectLink } from "./marketing-campaign-helper";

interface CreateCampaignInput {
  sourceBrief: string;
  campaignType?: "single" | "campaign";
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
  captionMode?: "none" | "speech" | "context" | "combined";
  images?: string[];
  qualityMode?: "premium" | "budget";
  publishMode?: "auto" | "manual";
  imageMode?: "ai" | "real" | "order";
  publishNow?: boolean;
  initialVideoUrl?: string;
  googleDriveFolderUrl?: string;
  customSchedule?: Record<string, string[]>;
  apifySources?: string[];
  rules?: {
    requiredCta?: string;
    requiredHashtags?: string[];
    forbiddenTerms?: string[];
    allowTextOnlyFallback?: boolean;
  };
}

const ACTIVE_SLOT_STATUSES: MarketingCampaignSlotStatus[] = [
  "planned",
  "queued",
  "generating",
  "researching",
  "writing",
  "scoring",
  "awaiting_assets",
  "generating_media",
  "verifying",
  "pending_approval",
  "ready_to_publish",
  "publishing",
  "retrying",
  "needs_attention",
];
const TIKTOK_MONTHLY_EXTERNAL_REVIEWER = "External Reviewer (Monthly · TikTok content)";

type TikTokCampaignPublishOptions = {
  caption: string;
  privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  brandContentToggle: boolean;
  brandContent: boolean;
  brandOrganic: boolean;
  isAigc: boolean;
  videoDurationSeconds: number;
  consentAccepted: boolean;
};

type TikTokBatchPublishOptions = Omit<TikTokCampaignPublishOptions, "caption" | "videoDurationSeconds">;

function validateTikTokCampaignPublishOptions(options?: TikTokCampaignPublishOptions) {
  if (typeof options?.caption !== "string" || options.caption.length > 2200) {
    throw new Error("Caption TikTok không hợp lệ.");
  }
  if (!options?.consentAccepted) {
    throw new Error("Bạn phải xác nhận điều khoản TikTok trước khi duyệt đăng.");
  }
  if (!Number.isFinite(options.videoDurationSeconds) || options.videoDurationSeconds <= 0) {
    throw new Error("Không đọc được thời lượng video TikTok. Vui lòng tải lại video trước khi đăng.");
  }
  if (options.brandContentToggle && !options.brandContent && !options.brandOrganic) {
    throw new Error("Vui lòng chọn nội dung quảng bá cho thương hiệu của bạn, đối tác hoặc cả hai.");
  }
  if (options.brandContent && options.privacyLevel === "SELF_ONLY") {
    throw new Error("Branded Content không thể đăng ở chế độ Chỉ mình tôi.");
  }
}

function assertTikTokPublicApprovalDisabled(platform: MarketingCampaignPlatform) {
  if (platform === "TikTok") {
    throw new Error("TikTok cần được duyệt trong màn hình TikTok để chọn quyền riêng tư, thời lượng và điều khoản đăng.");
  }
}

async function validateIntegrations(companyCode: string, platforms: MarketingCampaignPlatform[], integrationIds: CreateCampaignInput["integrationIds"]) {
  for (const platform of platforms) {
    const integrationId = integrationIds?.[platform];
    if (platform === "TikTok" && !integrationId) {
      throw new Error("Vui lòng chọn tài khoản TikTok doanh nghiệp đang hoạt động trước khi tạo chiến dịch.");
    }
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

function canUseLocalMockFacebookPage() {
  return process.env.NODE_ENV !== "production" && process.env.DISABLE_LOCAL_MOCKS !== "true";
}

async function ensureLocalMockFacebookPage(companyCode: string, createdBy: string) {
  const existing = await SocialIntegrationModel.findOne({
    companyCode,
    platform: "Facebook",
    isConnected: true,
    isMock: true,
  })
    .select("_id")
    .lean();
  if (existing) return String(existing._id);

  const suffix = companyCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "local";
  const integration = await SocialIntegrationModel.create({
    companyCode,
    platform: "Facebook",
    displayName: "Fanpage Facebook giả lập (local)",
    username: `mock_local_${suffix}`,
    accessToken: `mock_local_facebook_token_${randomUUID()}`,
    isConnected: true,
    isMock: true,
    createdBy,
  });
  console.log(`[Marketing Campaign] Đã tạo Fanpage Facebook giả lập cho local. company=${companyCode}`);
  return String(integration._id);
}

export const marketingCampaignService = {
  async create(companyCode: string, createdBy: string, input: CreateCampaignInput) {
    const requiresTikTokVideo = input.platforms.includes("TikTok");
    const initialVideoUrl = input.initialVideoUrl?.trim() || "";
    if (requiresTikTokVideo && (
      input.mediaPolicy !== "video"
      || input.imageMode === "ai"
      || (input.images && input.images.length > 0)
    )) {
      throw new Error("Chiến dịch TikTok chỉ nhận video. Vui lòng tải video trực tiếp cho một bài hoặc nhập video từ Google Drive và không đính kèm ảnh.");
    }
    if (requiresTikTokVideo && input.publishMode === "auto") {
      throw new Error("TikTok cần duyệt thủ công để chọn quyền riêng tư, thời lượng video và xác nhận điều khoản trước khi đăng.");
    }
    if (initialVideoUrl) {
      const isSingleTikTokPost = input.campaignType === "single"
        && input.platforms.length === 1
        && input.platforms[0] === "TikTok";
      const isCloudinaryVideo = /^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(initialVideoUrl);
      if (!isSingleTikTokPost || !isCloudinaryVideo) {
        throw new Error("Video tải trực tiếp chỉ áp dụng cho một bài TikTok và phải được tải lên hệ thống.");
      }
    }
    const timezone = input.timezone || "Asia/Ho_Chi_Minh";
    const generationLeadMinutes = input.generationLeadMinutes ?? 60;
    const verificationLeadMinutes = input.verificationLeadMinutes ?? 15;
    const monthlyPreparationLeadDays = 10;
    const now = new Date();
    const schedule = buildCampaignSchedule({
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      timezone,
      platforms: input.platforms,
      generationLeadMinutes,
      verificationLeadMinutes,
      customSchedule: input.customSchedule,
      campaignCreatedAt: now,
      monthlyPreparationLeadDays,
    });

    const minLeadTimeMs = 15 * 60 * 1000;
    if (!input.publishNow) {
      const failingSlot = schedule.find((slot) => slot.scheduledAt.getTime() - now.getTime() < minLeadTimeMs);
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
        const nowStr = formatZonedTime(now);

        throw new Error(
          `Lịch đăng lúc ${scheduledStr} quá sát so với thời gian hiện tại (${nowStr}). Hệ thống cần ít nhất 15 phút để chuẩn bị nội dung.`
        );
      }
    }
    const integrationIds = { ...(input.integrationIds || {}) };
    if (
      canUseLocalMockFacebookPage()
      && input.platforms.includes("Facebook")
      && !integrationIds.Facebook
    ) {
      integrationIds.Facebook = await ensureLocalMockFacebookPage(companyCode, createdBy);
    }
    await validateIntegrations(companyCode, input.platforms, integrationIds);

    // New campaigns never bind Drive media before their content exists. Legacy
    // callers that still send "real" are migrated into the content-first order flow.
    const imageMode: "ai" | "order" = input.imageMode === "ai" ? "ai" : "order";
    const researchReport = await geminiService.conductWebResearch(input.sourceBrief);
    const aiStrategy = await geminiService.generateScheduledCampaign({
      prompt: input.sourceBrief,
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      channels: input.platforms,
      images: imageMode === "ai" ? input.images : undefined,
      customSchedule: input.customSchedule,
      researchReport,
      rules: input.rules,
    });

    if (aiStrategy.slots.length !== schedule.length) {
      throw new Error(`AI trả về ${aiStrategy.slots.length}/${schedule.length} slot chiến dịch.`);
    }

    const strategy = {
      campaignTitle: aiStrategy.campaignTitle,
      contentPillars: aiStrategy.contentPillars,
      slots: requiresTikTokVideo
        ? aiStrategy.slots.map((slot) => ({ ...slot, mediaType: "video" as const }))
        : imageMode === "order"
        ? aiStrategy.slots.map((slot) => ({
          ...slot,
          mediaType: slot.mediaType === "text" ? "image" as const : slot.mediaType,
        }))
        : aiStrategy.slots,
    };

    const isBudget = input.qualityMode === "budget";
    const pPlan = API_COSTS.CAMPAIGN_STRATEGY;
    const pResearch = API_COSTS.CAMPAIGN_RESEARCH;

    // Zero-Click Content Strategy Matrix Generation (Background)
    const contentMatrix = await CampaignMatrixGeneratorService.generateMatrix(
      input.sourceBrief,
      schedule.length
    );

    // Flatten all angles with their funnel tags
    const allAngles = contentMatrix.flatMap((p) => p.angles);

    let totalResearchCost = 0;
    const totalVisionCost = 0;
    let totalContentCost = 0;
    let totalMediaCost = 0;

    strategy.slots.forEach((brief) => {
      const type = brief.mediaType;
      const requiresAiCopy = true;

      if (requiresAiCopy) {
        totalResearchCost += pResearch;
      }
      if (requiresAiCopy) {
        totalContentCost += isBudget ? API_COSTS.CAMPAIGN_CONTENT_BUDGET : API_COSTS.CAMPAIGN_CONTENT_PREMIUM;
      }

      // Order mode receives media later, so it has no AI media or Vision estimate.
      if (imageMode === "ai") {
        if (type === "image") {
          totalMediaCost += isBudget ? API_COSTS.CAMPAIGN_IMAGE_BUDGET : API_COSTS.CAMPAIGN_IMAGE_PREMIUM;
        } else if (type === "video" || type === "human-video") {
          totalMediaCost += isBudget ? API_COSTS.CAMPAIGN_VIDEO_BUDGET : API_COSTS.CAMPAIGN_VIDEO_PREMIUM;
        }
      }
    });

    const estimatedCost = pPlan + totalResearchCost + totalVisionCost + totalContentCost + totalMediaCost;

    const campaign = await MarketingCampaignModel.create({
      companyCode,
      createdBy,
      title: strategy.campaignTitle,
      sourceBrief: input.sourceBrief,
      campaignType: input.campaignType || "campaign",
      researchReport,
      status: "active",
      timezone,
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      platforms: input.platforms,
      integrationIds,
      candidateCount: input.candidateCount ?? 1,
      generationLeadMinutes,
      preparationMode: "monthly",
      monthlyPreparationLeadDays,
      preparationScheduleVersion: 2,
      verificationLeadMinutes,
      latePublishWindowMinutes: input.latePublishWindowMinutes ?? 30,
      minimumScore: input.minimumScore ?? 80,
      mediaPolicy: input.mediaPolicy || "auto",
      captionMode: input.captionMode || "none",
      contentPillars: strategy.contentPillars,
      qualityMode: input.qualityMode || "premium",
      publishMode: input.publishMode || "manual",
      imageMode,
      customSchedule: input.customSchedule,
      apifySources: input.apifySources || ["google", "facebook", "tiktok"],
      contentMatrix,
      rules: input.rules || {},
      statistics: { totalSlots: schedule.length, publishedSlots: 0, failedSlots: 0, estimatedCost, actualCost: 0 },
    });

    try {
      const slots = await MarketingCampaignSlotModel.insertMany(schedule.map((scheduledSlot, index) => {
        const brief = strategy.slots[index];
        const integrationId = integrationIds[scheduledSlot.platform];

        // Map funnel stage according to schedule timeline progress ratio
        // Week 1 (0% - 25%): TOFU | Week 2-3 (25% - 75%): MOFU | Week 4 (75% - 100%): BOFU
        const ratio = scheduledSlot.progressRatio;
        let funnelStage: "TOFU" | "MOFU" | "BOFU" = "MOFU";
        if (ratio <= 0.25) {
          funnelStage = "TOFU";
        } else if (ratio >= 0.75) {
          funnelStage = "BOFU";
        }

        // Try to assign matching angle if available
        const matchingAngle = allAngles.find((a) => a.funnel === funnelStage);

        const isPastOrImmediate = input.publishNow || scheduledSlot.scheduledAt.getTime() <= Date.now();
        const finalScheduledAt = isPastOrImmediate ? new Date() : scheduledSlot.scheduledAt;
        const finalPrepareAt = isPastOrImmediate ? new Date() : scheduledSlot.prepareAt;

        return {
          companyCode,
          campaignId: campaign._id,
          scheduledAt: finalScheduledAt,
          prepareAt: finalPrepareAt,
          verifyAt: scheduledSlot.verifyAt,
          platform: scheduledSlot.platform,
          integrationId,
          pillar: brief.pillar,
          objective: brief.objective,
          topicBrief: matchingAngle ? `${matchingAngle.title} — ${brief.topicBrief}` : brief.topicBrief,
          funnelStage,
          mediaType: brief.mediaType,
          realImageDirectUrls: initialVideoUrl && scheduledSlot.platform === "TikTok" ? [initialVideoUrl] : [],
          status: "planned",
          attemptCount: 0,
          publishIdempotencyKey: `${campaign._id}:${index}:${scheduledSlot.platform}`,
          transitions: [{ to: "planned", reason: input.publishNow ? "Campaign activated (Publish Now mode)" : "Campaign activated", at: new Date() }],
        };
      }));

      let preparation = { enqueued: 0, deferred: 0 };
      try {
        const initialBatch = await scanAndEnqueueDueSlots({
          campaignId: String(campaign._id),
          limit: Math.min(schedule.length, 100),
        });
        preparation = {
          enqueued: initialBatch.enqueued,
          deferred: initialBatch.deferred,
        };
      } catch (error) {
        console.error("[Marketing Campaign] Unable to enqueue the initial monthly batch:", error);
      }

      return { campaign, slots, preparation };
    } catch (error) {
      await MarketingCampaignModel.deleteOne({ _id: campaign._id, companyCode });
      throw error;
    }
  },

  async syncCampaignStatusAndStats(campaignId: string | mongoose.Types.ObjectId) {
    const campaign = await MarketingCampaignModel.findById(campaignId);
    if (!campaign) return null;

    const slots = await MarketingCampaignSlotModel.find({ campaignId: campaign._id }).select("status").lean();
    const totalSlots = slots.length;
    if (totalSlots === 0) return campaign;

    const publishedSlots = slots.filter((s) => s.status === "published").length;
    const failedSlots = slots.filter((s) => s.status === "failed").length;
    const cancelledSlots = slots.filter((s) => s.status === "cancelled").length;
    const skippedSlots = slots.filter((s) => s.status === "skipped").length;

    const finishedSlotsCount = publishedSlots + failedSlots + cancelledSlots + skippedSlots;

    campaign.statistics.totalSlots = totalSlots;
    campaign.statistics.publishedSlots = publishedSlots;
    campaign.statistics.failedSlots = failedSlots;

    if (finishedSlotsCount >= totalSlots && totalSlots > 0) {
      if (campaign.status === "active" || campaign.status === "paused") {
        if (publishedSlots > 0 || (publishedSlots === 0 && failedSlots === 0)) {
          campaign.status = "completed";
        } else if (failedSlots === totalSlots) {
          campaign.status = "failed";
        } else if (cancelledSlots === totalSlots) {
          campaign.status = "cancelled";
        } else {
          campaign.status = "completed";
        }
      }
    }

    await campaign.save();
    return campaign;
  },

  async list(companyCode: string, query?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(query?.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query?.limit || 10)));
    const skip = (page - 1) * limit;

    const [campaignDocs, total] = await Promise.all([
      MarketingCampaignModel.find({ companyCode })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      MarketingCampaignModel.countDocuments({ companyCode }),
    ]);

    const campaigns = await Promise.all(
      campaignDocs.map(async (camp) => {
        const synced = await this.syncCampaignStatusAndStats(camp._id);
        return (synced || camp).toObject();
      })
    );

    return {
      campaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getCalendar(companyCode: string, startDate: string, endDate: string) {
    const timezone = "Asia/Bangkok";
    const startAt = zonedLocalTimeToUtc(startDate, "00:00", timezone);
    const endCursor = new Date(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(endCursor.getTime())) throw new Error("Khoảng ngày lịch không hợp lệ.");
    endCursor.setUTCDate(endCursor.getUTCDate() + 1);
    const endExclusiveDate = endCursor.toISOString().slice(0, 10);
    const endAt = zonedLocalTimeToUtc(endExclusiveDate, "00:00", timezone);
    if (endAt <= startAt) throw new Error("Khoảng ngày lịch không hợp lệ.");

    const slots = await MarketingCampaignSlotModel.find({
      companyCode,
      scheduledAt: { $gte: startAt, $lt: endAt },
    })
      .select("campaignId scheduledAt platform status mediaType topicBrief")
      .sort({ scheduledAt: 1 })
      .lean();

    const campaignIds = [...new Set(slots.map((slot) => String(slot.campaignId)))];
    const campaigns = await MarketingCampaignModel.find({
      companyCode,
      _id: { $in: campaignIds },
    })
      .select("title campaignType")
      .lean();
    const campaignById = new Map(campaigns.map((campaign) => [String(campaign._id), campaign]));

    return {
      timezone,
      slots: slots.map((slot) => {
        const campaign = campaignById.get(String(slot.campaignId));
        return {
          _id: String(slot._id),
          campaignId: String(slot.campaignId),
          campaignTitle: campaign?.title || "Chiến dịch",
          campaignType: campaign?.campaignType || "campaign",
          scheduledAt: slot.scheduledAt,
          platform: slot.platform,
          status: slot.status,
          mediaType: slot.mediaType,
          topicBrief: slot.topicBrief,
        };
      }),
    };
  },

  async getDetail(companyCode: string, campaignId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error("ID chiến dịch không hợp lệ.");
    await this.syncCampaignStatusAndStats(campaignId);
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode }).lean();
    if (!campaign) throw new Error("Không tìm thấy chiến dịch.");
    const slots = await MarketingCampaignSlotModel.find({ campaignId, companyCode })
      .sort({ scheduledAt: 1 })
      .populate("marketingContentId")
      .populate("selectedCandidateId")
      .lean();

    const transformedSlots = slots.map((slot) => {
      const contentDoc = slot.marketingContentId as unknown as {
        _id: mongoose.Types.ObjectId;
        title: string;
        bodyText: string;
        outline?: string;
        mediaPrompt?: string;
        imageUrl?: string;
        videoUrl?: string;
        mediaUrls?: string[];
        mediaType?: "image" | "video" | "human-video";
      } | null;

      const candidateDoc = slot.selectedCandidateId as unknown as {
        _id: mongoose.Types.ObjectId;
        variant: string;
      } | null;

      const content = contentDoc
        ? {
            _id: contentDoc._id,
            title: contentDoc.title,
            bodyText: contentDoc.bodyText,
            outline: contentDoc.outline,
            mediaPrompt: contentDoc.mediaPrompt,
            videoUrl: contentDoc.videoUrl,
            mediaUrls: contentDoc.mediaUrls?.length
              ? contentDoc.mediaUrls
              : (contentDoc.imageUrl ? [contentDoc.imageUrl] : (contentDoc.videoUrl ? [contentDoc.videoUrl] : [])),
            mediaType: contentDoc.mediaType,
          }
        : null;

      return {
        ...slot,
        content,
        variant: candidateDoc?.variant || null,
        errorMessage: slot.lastError?.message,
        publishedPostUrl: slot.publishedUrl,
      };
    });

    return { campaign, slots: transformedSlots };
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

    if (action === "pause") {
      await MarketingCampaignSlotModel.updateMany(
        { campaignId, companyCode, status: "queued" },
        {
          $set: { status: "planned" },
          $push: {
            transitions: {
              from: "queued",
              to: "planned",
              reason: "Campaign paused before monthly preparation started",
              at: new Date(),
            },
          },
        }
      );
    }

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

  async retrySlot(companyCode: string, campaignId: string, slotId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode, status: "active" });
    if (!campaign) throw new Error("Chiến dịch không ở trạng thái đang chạy.");
    const slot = await MarketingCampaignSlotModel.findOneAndUpdate(
      { _id: slotId, campaignId, companyCode, status: { $in: ["needs_attention", "failed"] } },
      {
        $set: { status: "planned", attemptCount: 0, lockId: null, lockedAt: null, lockExpiresAt: null, lastError: null, prepareAt: new Date() },
        $push: { transitions: { to: "planned", reason: "Manual retry requested", at: new Date() } },
      },
      { new: true }
    );
    if (!slot) throw new Error("Slot không ở trạng thái cho phép thử lại.");
    return slot;
  },

  async retryAllSlots(companyCode: string, campaignId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error("ID chiến dịch không hợp lệ.");
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode, status: "active" });
    if (!campaign) throw new Error("Chiến dịch không ở trạng thái đang chạy.");
    const result = await MarketingCampaignSlotModel.updateMany(
      { campaignId, companyCode, status: { $in: ["needs_attention", "failed"] } },
      {
        $set: { status: "planned", attemptCount: 0, lockId: null, lockedAt: null, lockExpiresAt: null, lastError: null, prepareAt: new Date() },
        $push: { transitions: { to: "planned", reason: "Bulk retry requested", at: new Date() } },
      }
    );
    return { retriedCount: result.modifiedCount };
  },

  async approveSlot(companyCode: string, campaignId: string, slotId: string, approvedBy: string, tiktokPublishOptions?: TikTokCampaignPublishOptions) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    const allowedStatuses = ["pending_approval", "needs_attention", "failed"];
    if (!allowedStatuses.includes(slot.status)) {
      throw new Error(`Slot không thể được duyệt ở trạng thái này: ${slot.status}`);
    }
    if (slot.platform === "TikTok") {
      validateTikTokCampaignPublishOptions(tiktokPublishOptions);
      slot.tiktokPublishOptions = tiktokPublishOptions;
    }

    const previousStatus = slot.status;
    slot.status = "ready_to_publish";
    slot.approvedBy = approvedBy;
    slot.approvedAt = new Date();
    slot.transitions.push({
      from: previousStatus,
      to: "ready_to_publish",
      reason: `Approved manually by ${approvedBy}`,
      at: new Date()
    });

    await slot.save();
    return slot;
  },

  async approveTikTokSlots(
    companyCode: string,
    campaignId: string,
    slotIds: string[],
    approvedBy: string,
    tiktokPublishOptions: TikTokBatchPublishOptions,
    videoDurations: Record<string, number>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || slotIds.some((slotId) => !mongoose.Types.ObjectId.isValid(slotId))) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const uniqueSlotIds = [...new Set(slotIds)];
    if (uniqueSlotIds.length === 0 || uniqueSlotIds.length > 100) {
      throw new Error("Chỉ có thể duyệt từ 1 đến 100 video TikTok mỗi lần.");
    }
    const slots = await MarketingCampaignSlotModel.find({
      _id: { $in: uniqueSlotIds },
      campaignId,
      companyCode,
      platform: "TikTok",
    });
    if (slots.length !== uniqueSlotIds.length) {
      throw new Error("Một hoặc nhiều slot TikTok không tồn tại hoặc không thuộc chiến dịch này.");
    }
    const allowedStatuses = ["pending_approval", "needs_attention", "failed"];
    const unavailableSlot = slots.find((slot) => !allowedStatuses.includes(slot.status));
    if (unavailableSlot) {
      throw new Error(`Slot ${unavailableSlot._id} không thể được duyệt ở trạng thái này: ${unavailableSlot.status}`);
    }

    const contentIds = slots.flatMap((slot) => slot.marketingContentId ? [slot.marketingContentId] : []);
    const contents = await MarketingContentModel.find({
      _id: { $in: contentIds },
      companyCode,
    }).select("_id bodyText");
    const contentById = new Map(contents.map((content) => [String(content._id), content]));
    const optionsBySlot = slots.map((slot) => {
      const content = slot.marketingContentId ? contentById.get(String(slot.marketingContentId)) : undefined;
      if (!content) throw new Error(`Slot ${slot._id} chưa có nội dung TikTok để duyệt.`);
      const options: TikTokCampaignPublishOptions = {
        ...tiktokPublishOptions,
        caption: String(slot.customBodyText || content.bodyText || "").trim(),
        videoDurationSeconds: Number(videoDurations[String(slot._id)]),
      };
      validateTikTokCampaignPublishOptions(options);
      return { slot, options };
    });

    const approvedAt = new Date();
    await Promise.all(optionsBySlot.map(async ({ slot, options }) => {
      const previousStatus = slot.status;
      slot.tiktokPublishOptions = options;
      slot.status = "ready_to_publish";
      slot.approvedBy = approvedBy;
      slot.approvedAt = approvedAt;
      slot.transitions.push({
        from: previousStatus,
        to: "ready_to_publish",
        reason: `Batch approved manually by ${approvedBy}`,
        at: approvedAt,
      });
      await slot.save();
    }));
    return { approvedCount: optionsBySlot.length };
  },

  async publishNowSlot(companyCode: string, campaignId: string, slotId: string, approvedBy: string, tiktokPublishOptions?: TikTokCampaignPublishOptions) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    const allowedStatuses = ["pending_approval", "ready_to_publish", "needs_attention", "failed"];
    if (!allowedStatuses.includes(slot.status)) {
      throw new Error(`Slot không thể đăng ngay ở trạng thái này: ${slot.status}`);
    }
    if (slot.platform === "TikTok") {
      validateTikTokCampaignPublishOptions(tiktokPublishOptions);
      slot.tiktokPublishOptions = tiktokPublishOptions;
    }

    const previousStatus = slot.status;
    const lockId = randomUUID();
    const now = new Date();

    slot.status = "publishing";
    slot.scheduledAt = now;
    slot.approvedBy = approvedBy;
    slot.approvedAt = now;
    slot.lockId = lockId;
    slot.lockedAt = now;
    slot.lockExpiresAt = new Date(now.getTime() + 20 * 60000);
    slot.transitions.push({
      from: previousStatus,
      to: "publishing",
      reason: `Publish Now requested by ${approvedBy}`,
      at: now,
    });

    await slot.save();

    CampaignOrchestratorService.orchestratePublish(String(slot._id), lockId).catch((err) => {
      console.error(`[PublishNow] Error publishing slot ${slot._id}:`, err);
    });

    return slot;
  },

  async updateSlotContent(
    companyCode: string,
    campaignId: string,
    slotId: string,
    updates: {
      title?: string;
      bodyText?: string;
      outline?: string;
      mediaPrompt?: string;
    }
  ) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    const allowedStatuses = ["pending_approval", "needs_attention", "failed"];
    if (!allowedStatuses.includes(slot.status)) {
      throw new Error("Chỉ có thể chỉnh sửa nội dung khi bài viết đang chờ duyệt, cần kiểm tra hoặc lỗi.");
    }
    if (!slot.marketingContentId) {
      throw new Error("Không tìm thấy nội dung bài viết liên kết với slot này.");
    }
    if (slot.platform === "TikTok" && updates.bodyText !== undefined && updates.bodyText.length > 2200) {
      throw new Error("Caption TikTok không được vượt quá 2.200 ký tự.");
    }

    const content = await MarketingContentModel.findOneAndUpdate(
      { _id: slot.marketingContentId, companyCode },
      { $set: updates },
      { new: true }
    );
    if (!content) throw new Error("Không tìm thấy nội dung bài viết.");

    if (slot.status === "needs_attention") {
      slot.status = "pending_approval";
      slot.lastError = undefined;
      slot.transitions.push({
        from: "needs_attention",
        to: "pending_approval",
        reason: "Content updated by internal user after rejection.",
        at: new Date()
      });
      await slot.save();
    }

    return content;
  },

  async replaceSlotImage(companyCode: string, campaignId: string, slotId: string, imageUrl: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    const allowedStatuses = ["pending_approval", "needs_attention", "failed"];
    if (!allowedStatuses.includes(slot.status)) {
      throw new Error("Chỉ có thể thay ảnh khi bài viết đang chờ duyệt, cần kiểm tra hoặc lỗi.");
    }
    if (!slot.marketingContentId) {
      throw new Error("Không tìm thấy nội dung bài viết liên kết với slot này.");
    }

    const content = await MarketingContentModel.findOneAndUpdate(
      { _id: slot.marketingContentId, companyCode },
      { $set: { imageUrl } },
      { new: true }
    );
    if (!content) throw new Error("Không tìm thấy nội dung bài viết.");

    if (slot.status === "needs_attention") {
      slot.status = "pending_approval";
      slot.lastError = undefined;
      slot.transitions.push({
        from: "needs_attention",
        to: "pending_approval",
        reason: "Image replaced by internal user after rejection.",
        at: new Date()
      });
      await slot.save();
    }

    return content;
  },

  async generateShareLink(companyCode: string, campaignId: string, slotId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    assertTikTokPublicApprovalDisabled(slot.platform);
    
    // Sign token valid for 30 days
    const token = jwt.sign(
      { slotId, campaignId, companyCode },
      process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key",
      { expiresIn: "30d" }
    );
    
    let baseUrl = process.env.APP_URL || "https://marketing.igentechsolutions.com";
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    return { shareLink: `${baseUrl}/approve-post?token=${token}` };
  },

  async getPublicSlotDetail(token: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { slotId: string; campaignId: string; companyCode: string };

      if (!decoded.slotId || !decoded.campaignId || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      const slot = await MarketingCampaignSlotModel.findOne({
        _id: decoded.slotId,
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
      }).populate("selectedCandidateId").lean();
      if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");

      const campaign = await MarketingCampaignModel.findOne({
        _id: decoded.campaignId,
        companyCode: decoded.companyCode,
      });

      let content = null;
      if (slot.marketingContentId) {
        content = await MarketingContentModel.findOne({
          _id: slot.marketingContentId,
          companyCode: decoded.companyCode,
        }).lean();
      }

      const candidateDoc = slot.selectedCandidateId as unknown as {
        _id: mongoose.Types.ObjectId;
        variant: string;
      } | null;

      const transformedSlot = {
        ...slot,
        variant: candidateDoc?.variant || null
      };

      return { slot: transformedSlot, content, campaign };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Token không hợp lệ hoặc đã hết hạn.");
    }
  },

  async executePublicSlotAction(token: string, action: "approve" | "reject", reason?: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { slotId: string; campaignId: string; companyCode: string };

      const slot = await MarketingCampaignSlotModel.findOne({
        _id: decoded.slotId,
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
      });
      if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
      assertTikTokPublicApprovalDisabled(slot.platform);

      if (slot.status !== "pending_approval") {
        throw new Error(`Bài đăng này đã được xử lý (Trạng thái hiện tại: ${slot.status}).`);
      }

      if (action === "approve") {
        slot.status = "ready_to_publish";
        slot.approvedBy = "External Reviewer";
        slot.approvedAt = new Date();
        slot.transitions.push({
          from: "pending_approval",
          to: "ready_to_publish",
          reason: "Approved by external reviewer via public link",
          at: new Date(),
        });
      } else if (action === "reject") {
        slot.status = "needs_attention";
        slot.lastError = {
          type: "validation",
          message: reason || "Từ chối bởi người duyệt bên ngoài.",
          occurredAt: new Date(),
        };
        slot.transitions.push({
          from: "pending_approval",
          to: "needs_attention",
          reason: `Rejected by external reviewer: ${reason || "Không có lý do."}`,
          at: new Date(),
        });
      } else {
        throw new Error("Thao tác không hợp lệ.");
      }

      await slot.save();
      return slot;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Thao tác phê duyệt thất bại.");
    }
  },

  async rejectSlot(companyCode: string, campaignId: string, slotId: string, reason: string, rejectedBy: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    if (slot.status !== "pending_approval") {
      throw new Error(`Slot không thể được từ chối ở trạng thái này: ${slot.status}`);
    }

    slot.status = "needs_attention";
    slot.lastError = {
      type: "validation",
      message: reason,
      occurredAt: new Date(),
    };
    slot.transitions.push({
      from: "pending_approval",
      to: "needs_attention",
      reason: `Rejected by ${rejectedBy}: ${reason}`,
      at: new Date(),
    });

    await slot.save();
    return slot;
  },

  async publishNowSlotDirect(companyCode: string, campaignId: string, slotId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");

    if (slot.status === "published") {
      throw new Error("Slot này đã được đăng trước đó.");
    }

    if (slot.status !== "ready_to_publish") {
      throw new Error(`Slot chưa sẵn sàng để xuất bản (Trạng thái hiện tại: ${slot.status}). Vui lòng phê duyệt trước.`);
    }

    const { randomUUID } = await import("crypto");
    const lockId = randomUUID();
    const now = new Date();
    const LEASE_MS = 20 * 60000;

    const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
      {
        _id: slotId,
        campaignId,
        companyCode,
        status: "ready_to_publish",
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "publishing",
          lockId,
          lockedAt: now,
          lockExpiresAt: new Date(now.getTime() + LEASE_MS),
        },
        $push: {
          transitions: {
            from: "ready_to_publish",
            to: "publishing",
            reason: "Immediate publish requested by user",
            at: now,
          },
        },
      },
      { new: true }
    );

    if (!claimed) {
      throw new Error("Không thể chiếm quyền xuất bản slot. Slot có thể đang được xử lý bởi một tiến trình khác.");
    }

    const { CampaignOrchestratorService } = await import("./agents/campaign-orchestrator.service");
    await CampaignOrchestratorService.orchestratePublish(slotId, lockId);

    const updatedSlot = await MarketingCampaignSlotModel.findById(slotId).populate("marketingContentId").lean();
    return updatedSlot;
  },

  async previewDrive(googleDriveFolderUrl: string) {
    if (!googleDriveFolderUrl) {
      throw new Error("Vui lòng cung cấp đường dẫn thư mục Google Drive.");
    }
    const files = await listGoogleDriveFolderFiles(googleDriveFolderUrl);
    if (!files.length) {
      return [];
    }
    return files
      .filter((file) => {
        const name = file.name.toLowerCase();
        return /\.(jpg|jpeg|png|webp|gif|heic|mp4|mov|avi|webm)$/.test(name);
      })
      .map((file) => {
        const name = file.name.toLowerCase();
        const isVideo = /\.(mp4|mov|avi|webm)$/.test(name);
        const directUrl = getGoogleDriveDirectLink(file.id, isVideo ? "video" : "image");
        return {
          id: file.id,
          name: file.name,
          directUrl,
          isVideo,
        };
      });
  },

  async generateDailyShareLink(companyCode: string, campaignId: string, date: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("ID chiến dịch không hợp lệ.");
    }
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode });
    if (!campaign) throw new Error("Không tìm thấy chiến dịch.");

    // Sign token valid for 30 days
    const token = jwt.sign(
      { campaignId, date, companyCode },
      process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key",
      { expiresIn: "30d" }
    );

    let baseUrl = process.env.APP_URL || "https://marketing.igentechsolutions.com";
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }

    return { shareLink: `${baseUrl}/approve-posts-day?token=${token}` };
  },

  async getPublicDailySlotsDetail(token: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { campaignId: string; date: string; companyCode: string };

      if (!decoded.campaignId || !decoded.date || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      const campaign = await MarketingCampaignModel.findOne({
        _id: decoded.campaignId,
        companyCode: decoded.companyCode,
      });
      if (!campaign) throw new Error("Không tìm thấy chiến dịch.");

      // Calculate start and end of date in campaign's timezone
      const startOfDay = zonedLocalTimeToUtc(decoded.date, "00:00", campaign.timezone || "Asia/Ho_Chi_Minh");
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const slots = await MarketingCampaignSlotModel.find({
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
        scheduledAt: { $gte: startOfDay, $lt: endOfDay }
      }).populate("selectedCandidateId").lean();

      const slotsWithContent = await Promise.all(slots.map(async (slot) => {
        let content = null;
        if (slot.marketingContentId) {
          content = await MarketingContentModel.findOne({
            _id: slot.marketingContentId,
            companyCode: decoded.companyCode,
          }).lean();
        }
        const candidateDoc = slot.selectedCandidateId as unknown as {
          _id: mongoose.Types.ObjectId;
          variant: string;
        } | null;
        return {
          ...slot,
          content,
          variant: candidateDoc?.variant || null
        };
      }));

      return { campaign, slots: slotsWithContent, date: decoded.date };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Token không hợp lệ hoặc đã hết hạn.");
    }
  },

  async executePublicDailySlotAction(token: string, slotId: string, action: "approve" | "reject", reason?: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { campaignId: string; date: string; companyCode: string };

      if (!decoded.campaignId || !decoded.date || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      if (!mongoose.Types.ObjectId.isValid(slotId)) {
        throw new Error("ID slot không hợp lệ.");
      }

      const slot = await MarketingCampaignSlotModel.findOne({
        _id: slotId,
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
      });
      if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
      assertTikTokPublicApprovalDisabled(slot.platform);

      if (slot.status !== "pending_approval") {
        throw new Error(`Bài đăng này đã được xử lý (Trạng thái hiện tại: ${slot.status}).`);
      }

      if (action === "approve") {
        slot.status = "ready_to_publish";
        slot.approvedBy = "External Reviewer (Daily)";
        slot.approvedAt = new Date();
        slot.transitions.push({
          from: "pending_approval",
          to: "ready_to_publish",
          reason: "Approved by external reviewer via public daily link",
          at: new Date(),
        });
      } else if (action === "reject") {
        slot.status = "needs_attention";
        slot.lastError = {
          type: "validation",
          message: reason || "Từ chối bởi người duyệt bên ngoài (Daily).",
          occurredAt: new Date(),
        };
        slot.transitions.push({
          from: "pending_approval",
          to: "needs_attention",
          reason: `Rejected by external reviewer via daily link: ${reason || "Không có lý do."}`,
          at: new Date(),
        });
      } else {
        throw new Error("Thao tác không hợp lệ.");
      }

      await slot.save();
      return slot;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Thao tác phê duyệt thất bại.");
    }
  },

  async updatePublicDailySlotContent(token: string, slotId: string, updates: { title?: string; bodyText?: string }) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { campaignId: string; date: string; companyCode: string };

      if (!decoded.campaignId || !decoded.date || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      if (!mongoose.Types.ObjectId.isValid(slotId)) {
        throw new Error("ID slot không hợp lệ.");
      }

      const slot = await MarketingCampaignSlotModel.findOne({
        _id: slotId,
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
      });
      if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
      assertTikTokPublicApprovalDisabled(slot.platform);

      if (!["pending_approval", "needs_attention", "failed"].includes(slot.status)) {
        throw new Error(`Không thể chỉnh sửa nội dung ở trạng thái hiện tại (${slot.status}).`);
      }

      let content = null;
      if (slot.marketingContentId) {
        content = await MarketingContentModel.findOne({
          _id: slot.marketingContentId,
          companyCode: decoded.companyCode,
        });
      }

      if (!content) {
        content = new MarketingContentModel({
          campaignId: decoded.campaignId,
          companyCode: decoded.companyCode,
          mediaType: slot.platform === "TikTok" ? "video" : "image",
          mediaUrls: [],
          createdAt: new Date(),
        });
        await content.save();
        slot.marketingContentId = content._id;
        await slot.save();
      }

      if (updates.title !== undefined) {
        content.title = updates.title;
      }
      if (updates.bodyText !== undefined) {
        content.bodyText = updates.bodyText;
      }
      await content.save();

      return { slot, content };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Cập nhật nội dung thất bại.");
    }
  },

  async generateMonthlyShareLink(companyCode: string, campaignId: string, startDate: string, endDate: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("ID chiến dịch không hợp lệ.");
    }
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode });
    if (!campaign) throw new Error("Không tìm thấy chiến dịch.");

    // Sign token valid for 30 days
    const token = jwt.sign(
      { campaignId, startDate, endDate, companyCode },
      process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key",
      { expiresIn: "30d" }
    );

    let baseUrl = process.env.APP_URL || "https://marketing.igentechsolutions.com";
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }

    return { shareLink: `${baseUrl}/approve-posts-month?token=${token}` };
  },

  async getPublicMonthlySlotsDetail(token: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { campaignId: string; startDate: string; endDate: string; companyCode: string };

      if (!decoded.campaignId || !decoded.startDate || !decoded.endDate || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      const campaign = await MarketingCampaignModel.findOne({
        _id: decoded.campaignId,
        companyCode: decoded.companyCode,
      });
      if (!campaign) throw new Error("Không tìm thấy chiến dịch.");

      // Calculate start and end boundary in campaign's timezone
      const startDateTime = zonedLocalTimeToUtc(decoded.startDate, "00:00", campaign.timezone || "Asia/Ho_Chi_Minh");
      const endDateTime = zonedLocalTimeToUtc(decoded.endDate, "23:59", campaign.timezone || "Asia/Ho_Chi_Minh");

      const slots = await MarketingCampaignSlotModel.find({
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
        scheduledAt: { $gte: startDateTime, $lte: endDateTime }
      }).populate("selectedCandidateId").lean();

      const slotsWithContent = await Promise.all(slots.map(async (slot) => {
        let content = null;
        if (slot.marketingContentId) {
          content = await MarketingContentModel.findOne({
            _id: slot.marketingContentId,
            companyCode: decoded.companyCode,
          }).lean();
        }
        const candidateDoc = slot.selectedCandidateId as unknown as {
          _id: mongoose.Types.ObjectId;
          variant: string;
        } | null;
        return {
          ...slot,
          content,
          variant: candidateDoc?.variant || null
        };
      }));

      return { campaign, slots: slotsWithContent, startDate: decoded.startDate, endDate: decoded.endDate };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Token không hợp lệ hoặc đã hết hạn.");
    }
  },

  async executePublicMonthlySlotAction(token: string, slotId: string, action: "approve" | "reject", reason?: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { campaignId: string; startDate: string; endDate: string; companyCode: string };

      if (!decoded.campaignId || !decoded.startDate || !decoded.endDate || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      if (!mongoose.Types.ObjectId.isValid(slotId)) {
        throw new Error("ID slot không hợp lệ.");
      }

      const slot = await MarketingCampaignSlotModel.findOne({
        _id: slotId,
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
      });
      if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
      if (slot.status !== "pending_approval") {
        throw new Error(`Bài đăng này đã được xử lý (Trạng thái hiện tại: ${slot.status}).`);
      }

      if (action === "approve") {
        if (slot.platform === "TikTok") {
          if (slot.approvedBy === TIKTOK_MONTHLY_EXTERNAL_REVIEWER) {
            throw new Error("Nội dung TikTok này đã được duyệt, đang chờ chủ tài khoản xác nhận đăng.");
          }
          slot.approvedBy = TIKTOK_MONTHLY_EXTERNAL_REVIEWER;
          slot.approvedAt = new Date();
          slot.transitions.push({
            from: "pending_approval",
            to: "pending_approval",
            reason: "TikTok content approved by external reviewer via monthly link; awaiting creator privacy and consent confirmation.",
            at: new Date(),
          });
          await slot.save();
          return { slot, reviewState: "awaiting_tiktok_creator_confirmation" };
        }
        slot.status = "ready_to_publish";
        slot.approvedBy = "External Reviewer (Monthly)";
        slot.approvedAt = new Date();
        slot.transitions.push({
          from: "pending_approval",
          to: "ready_to_publish",
          reason: "Approved by external reviewer via public monthly link",
          at: new Date(),
        });
      } else if (action === "reject") {
        if (!reason || !reason.trim()) {
          throw new Error("Vui lòng nhập lý do từ chối bài viết.");
        }
        slot.status = "needs_attention";
        slot.lastError = {
          type: "validation",
          message: reason.trim(),
          occurredAt: new Date(),
        };
        slot.transitions.push({
          from: "pending_approval",
          to: "needs_attention",
          reason: `Rejected by external reviewer via monthly link: ${reason.trim()}`,
          at: new Date(),
        });
      } else {
        throw new Error("Thao tác không hợp lệ.");
      }

      await slot.save();
      return { slot, reviewState: action === "approve" ? "approved" : "rejected" };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Thao tác phê duyệt thất bại.");
    }
  },

  async executePublicMonthlyBulkAction(token: string, slotIds: string[], action: "approve" | "reject", reason?: string) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key"
      ) as { campaignId: string; startDate: string; endDate: string; companyCode: string };

      if (!decoded.campaignId || !decoded.startDate || !decoded.endDate || !decoded.companyCode) {
        throw new Error("Token không chứa đầy đủ thông tin.");
      }

      if (!Array.isArray(slotIds) || slotIds.length === 0) {
        throw new Error("Danh sách slot không hợp lệ.");
      }

      if (action === "reject" && (!reason || !reason.trim())) {
        throw new Error("Vui lòng nhập lý do từ chối hàng loạt bài viết.");
      }

      const slots = await MarketingCampaignSlotModel.find({
        _id: { $in: slotIds },
        campaignId: decoded.campaignId,
        companyCode: decoded.companyCode,
      });

      let processed = 0;
      let skipped = 0;

      for (const slot of slots) {
        if (slot.status !== "pending_approval") {
          skipped++;
          continue;
        }

        if (action === "approve") {
          if (slot.platform === "TikTok") {
            if (slot.approvedBy === TIKTOK_MONTHLY_EXTERNAL_REVIEWER) {
              skipped++;
              continue;
            }
            slot.approvedBy = TIKTOK_MONTHLY_EXTERNAL_REVIEWER;
            slot.approvedAt = new Date();
            slot.transitions.push({
              from: "pending_approval",
              to: "pending_approval",
              reason: "TikTok content approved by external reviewer via monthly bulk action; awaiting creator privacy and consent confirmation.",
              at: new Date(),
            });
            await slot.save();
            processed++;
            continue;
          }
          slot.status = "ready_to_publish";
          slot.approvedBy = "External Reviewer (Monthly Bulk)";
          slot.approvedAt = new Date();
          slot.transitions.push({
            from: "pending_approval",
            to: "ready_to_publish",
            reason: "Approved by external reviewer via monthly bulk action",
            at: new Date(),
          });
        } else if (action === "reject") {
          slot.status = "needs_attention";
          slot.lastError = {
            type: "validation",
            message: reason!.trim(),
            occurredAt: new Date(),
          };
          slot.transitions.push({
            from: "pending_approval",
            to: "needs_attention",
            reason: `Rejected by external reviewer via monthly bulk action: ${reason!.trim()}`,
            at: new Date(),
          });
        }
        await slot.save();
        processed++;
      }

      return { processed, skipped };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Thao tác hàng loạt thất bại.");
    }
  },

  async batchPrepareMonth(companyCode: string, campaignId: string, startDate: string, endDate: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("ID chiến dịch không hợp lệ.");
    }
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode });
    if (!campaign) throw new Error("Không tìm thấy chiến dịch.");

    // Calculate start and end boundary in campaign's timezone
    const startDateTime = zonedLocalTimeToUtc(startDate, "00:00", campaign.timezone || "Asia/Ho_Chi_Minh");
    const endDateTime = zonedLocalTimeToUtc(endDate, "23:59", campaign.timezone || "Asia/Ho_Chi_Minh");

    const slots = await MarketingCampaignSlotModel.find({
      campaignId,
      companyCode,
      scheduledAt: { $gte: startDateTime, $lte: endDateTime },
      status: { $in: ["planned", "retrying", "failed", "needs_attention"] }
    });

    let enqueued = 0;
    const now = new Date();

    for (const slot of slots) {
      slot.prepareAt = now;
      slot.status = "planned";
      slot.attemptCount = 0;
      slot.lockId = null;
      slot.lockedAt = null;
      slot.lockExpiresAt = null;
      slot.lastError = undefined;
      slot.transitions.push({
        from: slot.status,
        to: "planned",
        reason: "Reset slot for batch generation by marketer",
        at: now,
      });
      await slot.save();
      enqueued++;
    }

    try {
      await scanAndEnqueueDueSlots({
        campaignId,
        limit: Math.min(slots.length, 100),
      });
    } catch (error) {
      console.warn("[Batch Prepare] Unable to enqueue the first bounded batch; scheduler will retry.", error);
    }

    return { enqueued, skipped: 0 };
  }
};
