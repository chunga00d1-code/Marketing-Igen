import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { MarketingCampaignStatus, MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";
import { buildCampaignSchedule } from "./marketing-campaign-schedule.service";
import { geminiService } from "./gemini.service";
import { API_COSTS } from "./wallet.service";
import { listGoogleDriveFolderFiles, groupDriveFiles, getGoogleDriveDirectLink } from "./marketing-campaign-helper";

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
  images?: string[];
  qualityMode?: "premium" | "budget";
  publishMode?: "auto" | "manual";
  imageMode?: "ai" | "real";
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

const ACTIVE_SLOT_STATUSES: MarketingCampaignSlotStatus[] = ["planned", "queued", "generating", "scoring", "generating_media", "pending_approval", "ready_to_publish", "retrying"];

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
    const timezone = input.timezone || "Asia/Ho_Chi_Minh";
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
      customSchedule: input.customSchedule,
    });

    const now = new Date();
    const minLeadTimeMs = 15 * 60 * 1000;
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
    await validateIntegrations(companyCode, input.platforms, input.integrationIds);

    const imageMode = input.imageMode || "ai";
    const googleDriveFolderUrl = input.googleDriveFolderUrl || "";

    let researchReport = "";
    let strategy: {
      campaignTitle: string;
      contentPillars: string[];
      slots: Array<{
        pillar: string;
        objective: string;
        topicBrief: string;
        mediaType: "text" | "image" | "video" | "human-video";
        customBodyText?: string;
        realImageDriveUrls?: string[];
        realImageDirectUrls?: string[];
      }>;
    };

    if (imageMode === "real") {
      if (!googleDriveFolderUrl) {
        throw new Error("Vui lòng điền đường dẫn thư mục Google Drive khi chọn chế độ ảnh thật.");
      }
      
      const files = await listGoogleDriveFolderFiles(googleDriveFolderUrl);
      if (files.length === 0) {
        throw new Error("Không tìm thấy tệp tin hình ảnh hoặc video nào trong thư mục Google Drive. Vui lòng kiểm tra lại quyền truy cập hoặc định dạng file.");
      }
      
      const grouped = groupDriveFiles(files);
      const realMediaBySlot = schedule.map((_, index) => {
        const postIndex = index + 1;
        const postFiles = grouped[postIndex] || [];

        if (postFiles.length === 0) {
          throw new Error(
            `Thư mục Google Drive thiếu ảnh/video cho Bài đăng số ${postIndex}. Vui lòng tải lên tệp tin có tên chứa số ${postIndex} (Ví dụ: 'post_${postIndex}.jpg' hoặc '${postIndex}.png').`
          );
        }

        const hasVideo = postFiles.some((file) => file.isVideo);
        return {
          mediaType: hasVideo ? "video" as const : "image" as const,
          fileNames: postFiles.map((file) => file.name),
          realImageDriveUrls: postFiles.map((file) => `https://drive.google.com/file/d/${file.id}/view`),
          realImageDirectUrls: postFiles.map((file) => file.directUrl),
        };
      });

      const planningPrompt = `${input.sourceBrief.trim()}

YÊU CẦU LẬP BẢN PHÁC THẢO CHO CHIẾN DỊCH DÙNG ẢNH THẬT:
- Mỗi topicBrief là bản phác thảo ý tưởng để người dùng xem trước: nêu thông điệp chính, góc khai thác và giá trị mang lại cho người xem.
- Không viết caption/bài đăng hoàn chỉnh ở bước này.
- Không dùng cách ghi chung chung như "Bài đăng thứ N sử dụng ảnh từ Google Drive".
- Không khẳng định chi tiết sản phẩm chưa có trong brief; nội dung sẽ được Vision Agent đối chiếu với ảnh thật gần giờ đăng.
- Các tệp media đã được gán sẵn theo từng slot như sau:
${realMediaBySlot.map((media, index) => `  Slot ${index + 1}: ${media.fileNames.join(", ")}`).join("\n")}`;

      const aiStrategy = await geminiService.generateScheduledCampaign({
        prompt: planningPrompt,
        startDate: input.startDate,
        endDate: input.endDate,
        postsPerDay: input.postsPerDay,
        postingTimes: input.postingTimes,
        channels: input.platforms,
        customSchedule: input.customSchedule,
        rules: input.rules,
      });

      if (aiStrategy.slots.length !== schedule.length) {
        throw new Error(`AI trả về ${aiStrategy.slots.length}/${schedule.length} slot chiến dịch.`);
      }

      researchReport = "Chiến dịch sử dụng ảnh thật; nghiên cứu và phân tích hình ảnh sẽ chạy theo từng slot gần giờ đăng.";
      strategy = {
        campaignTitle: aiStrategy.campaignTitle,
        contentPillars: aiStrategy.contentPillars,
        slots: aiStrategy.slots.map((brief, index) => {
          const media = realMediaBySlot[index];
          return {
            pillar: brief.pillar,
            objective: brief.objective,
            topicBrief: brief.topicBrief,
            mediaType: media.mediaType,
            customBodyText: "",
            realImageDriveUrls: media.realImageDriveUrls,
            realImageDirectUrls: media.realImageDirectUrls,
          };
        }),
      };
    } else {
      researchReport = await geminiService.conductWebResearch(input.sourceBrief);
      const aiStrategy = await geminiService.generateScheduledCampaign({
        prompt: input.sourceBrief,
        startDate: input.startDate,
        endDate: input.endDate,
        postsPerDay: input.postsPerDay,
        postingTimes: input.postingTimes,
        channels: input.platforms,
        images: input.images,
        customSchedule: input.customSchedule,
        researchReport,
        rules: input.rules,
      });

      if (aiStrategy.slots.length !== schedule.length) {
        throw new Error(`AI trả về ${aiStrategy.slots.length}/${schedule.length} slot chiến dịch.`);
      }

      strategy = {
        campaignTitle: aiStrategy.campaignTitle,
        contentPillars: aiStrategy.contentPillars,
        slots: aiStrategy.slots,
      };
    }

    const isBudget = input.qualityMode === "budget";
    const pPlan = API_COSTS.CAMPAIGN_STRATEGY;
    const pResearch = API_COSTS.CAMPAIGN_RESEARCH;

    let totalResearchCost = 0;
    let totalVisionCost = 0;
    let totalContentCost = 0;
    let totalMediaCost = 0;

    strategy.slots.forEach((brief) => {
      const type = brief.mediaType;
      const requiresAiCopy = imageMode === "ai" || !brief.customBodyText;

      if (requiresAiCopy) {
        totalResearchCost += pResearch;
      }
      if (imageMode === "real" && requiresAiCopy) {
        const imageCount = Math.max(
          brief.realImageDriveUrls?.length || 0,
          brief.realImageDirectUrls?.length || 0
        );
        totalVisionCost += Math.ceil(imageCount / 8) * API_COSTS.CAMPAIGN_VISION;
      }
      
      // Calculate content write cost (only charge if AI Copywriter needs to generate copy)
      if (imageMode === "real") {
        if (!brief.customBodyText) {
          totalContentCost += isBudget ? API_COSTS.CAMPAIGN_CONTENT_BUDGET : API_COSTS.CAMPAIGN_CONTENT_PREMIUM;
        }
      } else {
        totalContentCost += isBudget ? API_COSTS.CAMPAIGN_CONTENT_BUDGET : API_COSTS.CAMPAIGN_CONTENT_PREMIUM;
      }

      // Calculate media cost (always 0 for real image mode)
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
      researchReport,
      status: "active",
      timezone,
      startDate: input.startDate,
      endDate: input.endDate,
      postsPerDay: input.postsPerDay,
      postingTimes: input.postingTimes,
      platforms: input.platforms,
      integrationIds: input.integrationIds || {},
      candidateCount: input.candidateCount ?? 1,
      generationLeadMinutes,
      verificationLeadMinutes,
      latePublishWindowMinutes: input.latePublishWindowMinutes ?? 30,
      minimumScore: input.minimumScore ?? 80,
      mediaPolicy: input.mediaPolicy || "auto",
      contentPillars: strategy.contentPillars,
      qualityMode: input.qualityMode || "premium",
      publishMode: input.publishMode || "manual",
      imageMode,
      googleDriveFolderUrl,
      customSchedule: input.customSchedule,
      apifySources: input.apifySources || ["google"],
      rules: input.rules || {},
      statistics: { totalSlots: schedule.length, publishedSlots: 0, failedSlots: 0, estimatedCost, actualCost: 0 },
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
          realImageDriveUrls: brief.realImageDriveUrls || [],
          realImageDirectUrls: brief.realImageDirectUrls || [],
          customBodyText: brief.customBodyText,
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

  async list(companyCode: string, query?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(query?.page || 1));
    const limit = Math.max(1, Math.min(100, Number(query?.limit || 10)));
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      MarketingCampaignModel.find({ companyCode })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MarketingCampaignModel.countDocuments({ companyCode }),
    ]);

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

  async getDetail(companyCode: string, campaignId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) throw new Error("ID chiến dịch không hợp lệ.");
    const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode }).lean();
    if (!campaign) throw new Error("Không tìm thấy chiến dịch.");
    const slots = await MarketingCampaignSlotModel.find({ campaignId, companyCode })
      .sort({ scheduledAt: 1 })
      .populate("marketingContentId")
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

      const content = contentDoc
        ? {
            _id: contentDoc._id,
            title: contentDoc.title,
            bodyText: contentDoc.bodyText,
            outline: contentDoc.outline,
            mediaPrompt: contentDoc.mediaPrompt,
            mediaUrls: contentDoc.mediaUrls?.length
              ? contentDoc.mediaUrls
              : (contentDoc.imageUrl ? [contentDoc.imageUrl] : (contentDoc.videoUrl ? [contentDoc.videoUrl] : [])),
            mediaType: contentDoc.mediaType,
          }
        : null;

      return {
        ...slot,
        content,
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

  async approveSlot(companyCode: string, campaignId: string, slotId: string, approvedBy: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    if (slot.status !== "pending_approval") {
      throw new Error(`Slot không thể được duyệt ở trạng thái này: ${slot.status}`);
    }

    slot.status = "ready_to_publish";
    slot.approvedBy = approvedBy;
    slot.approvedAt = new Date();
    slot.transitions.push({
      from: "pending_approval",
      to: "ready_to_publish",
      reason: `Approved manually by ${approvedBy}`,
      at: new Date()
    });

    await slot.save();
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
    if (slot.status !== "pending_approval") {
      throw new Error("Chỉ có thể chỉnh sửa nội dung khi bài viết đang chờ duyệt.");
    }
    if (!slot.marketingContentId) {
      throw new Error("Không tìm thấy nội dung bài viết liên kết với slot này.");
    }

    const content = await MarketingContentModel.findOneAndUpdate(
      { _id: slot.marketingContentId, companyCode },
      { $set: updates },
      { new: true }
    );
    if (!content) throw new Error("Không tìm thấy nội dung bài viết.");
    return content;
  },

  async replaceSlotImage(companyCode: string, campaignId: string, slotId: string, imageUrl: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    if (slot.status !== "pending_approval") {
      throw new Error("Chỉ có thể thay ảnh khi bài viết đang chờ duyệt.");
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
    return content;
  },

  async generateShareLink(companyCode: string, campaignId: string, slotId: string) {
    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      throw new Error("ID chiến dịch hoặc slot không hợp lệ.");
    }
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw new Error("Không tìm thấy slot chiến dịch.");
    
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
      });
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
        });
      }

      return { slot, content, campaign };
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
  }
};
