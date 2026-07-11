import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { UserModel } from "../model/user.model";
import { facebookPostService } from "./facebook-post.service";
import { geminiService } from "./gemini.service";
import { API_COSTS, walletService } from "./wallet.service";

const LEASE_MS = 20 * 60000;

async function assertReachableMedia(url: string) {
  if (!/^https:\/\//i.test(url)) throw new Error("Media URL không dùng HTTPS.");
  const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Media URL không truy cập được (${response.status}).`);
}

async function resolveFacebookCredentials(input: { companyCode: string; createdBy: string; integrationId?: unknown }) {
  if (input.integrationId) {
    const integration = await SocialIntegrationModel.findOne({
      _id: input.integrationId,
      companyCode: input.companyCode,
      platform: "Facebook",
      isConnected: true,
    }).lean();
    if (!integration?.username || !integration.accessToken) throw new Error("Liên kết Facebook doanh nghiệp thiếu Page ID hoặc access token.");
    return { pageId: integration.username, accessToken: integration.accessToken };
  }
  const user = await UserModel.findById(input.createdBy).select("companyCode facebookIntegration").lean();
  if (!user || user.companyCode !== input.companyCode || !user.facebookIntegration?.isConnected) {
    throw new Error("Không tìm thấy Facebook Page cá nhân đang kết nối.");
  }
  if (!user.facebookIntegration.pageId || !user.facebookIntegration.pageAccessToken) {
    throw new Error("Facebook Page cá nhân thiếu Page ID hoặc access token.");
  }
  return { pageId: user.facebookIntegration.pageId, accessToken: user.facebookIntegration.pageAccessToken };
}

async function releaseWithFailure(slotId: unknown, lockId: string, stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId }).select("attemptCount status campaignId").lean();
  if (!slot) return;
  const terminal = slot.attemptCount >= 2;
  const result = await MarketingCampaignSlotModel.updateOne({ _id: slotId, lockId }, {
    $set: {
      status: terminal ? "needs_attention" : slot.status,
      lockId: null,
      lockedAt: null,
      lockExpiresAt: null,
      lastError: { type: terminal ? "terminal" : "provider", message, occurredAt: new Date() },
    },
    $inc: { attemptCount: 1 },
    $push: { transitions: { from: slot.status, to: terminal ? "needs_attention" : slot.status, reason: `${stage}: ${message}`, at: new Date() } },
  });
  if (terminal && result.modifiedCount > 0) {
    await MarketingCampaignModel.updateOne({ _id: slot.campaignId }, { $inc: { "statistics.failedSlots": 1 } });
  }
}

async function processImageSlot(slotId: unknown, lockId: string) {
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId, status: "generating_media", platform: "Facebook", mediaType: "image" });
  if (!slot?.marketingContentId) return { slotId: String(slotId), status: "skipped" };
  const campaign = await MarketingCampaignModel.findOne({ _id: slot.campaignId, companyCode: slot.companyCode, status: "active" });
  const content = await MarketingContentModel.findOne({ _id: slot.marketingContentId, companyCode: slot.companyCode });
  if (!campaign || !content?.mediaPrompt) {
    await releaseWithFailure(slotId, lockId, "media", new Error("Thiếu campaign, content hoặc media prompt."));
    return { slotId: String(slotId), status: "failed" };
  }
  try {
    await walletService.checkBalance(campaign.createdBy, API_COSTS.GEMINI_IMAGE);
    const image = await geminiService.generateImage(content.mediaPrompt, { aspectRatio: "1:1", resolution: "1K" });
    if (!/^https:\/\//i.test(image.url)) throw new Error("AI không trả về URL ảnh HTTPS hợp lệ.");
    await walletService.deductBalance(campaign.createdBy, API_COSTS.GEMINI_IMAGE, "Tạo ảnh cho chiến dịch tự động");
    content.imageUrl = image.url;
    await content.save();
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
      $set: { status: "verifying", lockId: null, lockedAt: null, lockExpiresAt: null },
      $push: { transitions: { from: "generating_media", to: "verifying", reason: "Facebook image generated", at: new Date() } },
    });
    return { slotId: String(slotId), status: "verifying" };
  } catch (error) {
    await releaseWithFailure(slotId, lockId, "media", error);
    return { slotId: String(slotId), status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function processVerifySlot(slotId: unknown, lockId: string) {
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId, status: "verifying", platform: "Facebook" });
  if (!slot?.marketingContentId) return { slotId: String(slotId), status: "skipped" };
  const campaign = await MarketingCampaignModel.findOne({ _id: slot.campaignId, companyCode: slot.companyCode, status: "active" });
  const content = await MarketingContentModel.findOne({ _id: slot.marketingContentId, companyCode: slot.companyCode });
  try {
    if (!campaign || !content || !content.bodyText.trim()) throw new Error("Thiếu campaign hoặc nội dung bài đăng.");
    if (slot.mediaType === "image") {
      if (!content.imageUrl) throw new Error("Ảnh bắt buộc chưa sẵn sàng.");
      await assertReachableMedia(content.imageUrl);
    }
    if (slot.mediaType === "text" && ["image", "video"].includes(campaign.mediaPolicy) && !campaign.rules?.allowTextOnlyFallback) {
      throw new Error("Chiến dịch không cho phép đăng bài text-only.");
    }
    if (slot.mediaType === "video" || slot.mediaType === "human-video") throw new Error("Video chưa được xử lý; cần Phase 4.");
    await resolveFacebookCredentials({ companyCode: slot.companyCode, createdBy: campaign.createdBy, integrationId: slot.integrationId });
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
      $set: { status: "ready_to_publish", lockId: null, lockedAt: null, lockExpiresAt: null, lastError: null },
      $push: { transitions: { from: "verifying", to: "ready_to_publish", reason: "Content, media and Facebook integration verified", at: new Date() } },
    });
    return { slotId: String(slotId), status: "ready_to_publish" };
  } catch (error) {
    await releaseWithFailure(slotId, lockId, "verify", error);
    return { slotId: String(slotId), status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function processPublishSlot(slotId: unknown, lockId: string) {
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId, status: "publishing", platform: "Facebook" });
  if (!slot?.marketingContentId) return { slotId: String(slotId), status: "skipped" };
  const campaign = await MarketingCampaignModel.findOne({ _id: slot.campaignId, companyCode: slot.companyCode, status: "active" });
  const content = await MarketingContentModel.findOne({ _id: slot.marketingContentId, companyCode: slot.companyCode });
  try {
    if (!campaign || !content) throw new Error("Không tìm thấy campaign hoặc nội dung để đăng.");
    if (slot.publishedPostId || content.status === "published") {
      await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, { $set: { status: "published", lockId: null, lockedAt: null, lockExpiresAt: null } });
      return { slotId: String(slotId), status: "published", deduplicated: true };
    }
    const lateDeadline = new Date(slot.scheduledAt.getTime() + campaign.latePublishWindowMinutes * 60000);
    if (new Date() > lateDeadline) throw new Error("Đã quá cửa sổ cho phép đăng muộn.");
    const credentials = await resolveFacebookCredentials({ companyCode: slot.companyCode, createdBy: campaign.createdBy, integrationId: slot.integrationId });
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, { $set: { publishRequestedAt: new Date() } });
    const result = await facebookPostService.publishToPage(
      content.bodyText,
      content.imageUrl || "",
      content.videoUrl || "",
      credentials.pageId,
      credentials.accessToken,
      String(content._id),
      "immediate",
      undefined,
      content.title,
      undefined,
      slot.publishIdempotencyKey
    );
    const postId = String(result.data?.id || result.data?.post_id || "").trim();
    const postUrl = String(result.data?.postUrl || result.data?.permalink_url || "").trim();
    if (postId) {
      content.status = "published";
      content.publishedAt = new Date();
      content.facebookPostId = postId;
      content.postUrl = postUrl;
      await content.save();
      const updated = await MarketingCampaignSlotModel.findOneAndUpdate(
        { _id: slot._id, lockId, status: "publishing" },
        {
          $set: { status: "published", publishedPostId: postId, publishedUrl: postUrl, lockId: null, lockedAt: null, lockExpiresAt: null },
          $push: { transitions: { from: "publishing", to: "published", reason: "Facebook publish completed", at: new Date() } },
        },
        { new: true }
      );
      if (updated) await MarketingCampaignModel.updateOne({ _id: campaign._id }, { $inc: { "statistics.publishedSlots": 1 } });
      return { slotId: String(slotId), status: "published", postId, postUrl };
    }
    content.status = "processing";
    await content.save();
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
      $set: { lockId: null, lockedAt: null, lockExpiresAt: null },
      $push: { transitions: { from: "publishing", to: "publishing", reason: "Facebook accepted request; awaiting callback", at: new Date() } },
    });
    return { slotId: String(slotId), status: "publishing" };
  } catch (error) {
    await releaseWithFailure(slotId, lockId, "publish", error);
    return { slotId: String(slotId), status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function claimSlots(input: { statuses: MarketingCampaignSlotStatus[]; dueField?: "verifyAt" | "scheduledAt"; platform: "Facebook"; mediaType?: "image"; limit: number; nextStatus?: MarketingCampaignSlotStatus }) {
  const now = new Date();
  const leaseFilter = [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }];
  const baseFilter = { status: { $in: input.statuses }, platform: input.platform, $or: leaseFilter };
  const candidates = input.dueField === "verifyAt"
    ? await MarketingCampaignSlotModel.find({ ...baseFilter, verifyAt: { $lte: now } }).sort({ verifyAt: 1 }).limit(input.limit).select("_id status").lean()
    : input.dueField === "scheduledAt"
      ? await MarketingCampaignSlotModel.find({ ...baseFilter, scheduledAt: { $lte: now } }).sort({ scheduledAt: 1 }).limit(input.limit).select("_id status").lean()
      : await MarketingCampaignSlotModel.find({ ...baseFilter, mediaType: input.mediaType }).sort({ updatedAt: 1 }).limit(input.limit).select("_id status").lean();
  const claims: Array<{ slotId: Types.ObjectId; lockId: string }> = [];
  for (const candidate of candidates) {
    const lockId = randomUUID();
    const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
      { _id: candidate._id, status: { $in: input.statuses }, $or: [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }] },
      { $set: { status: input.nextStatus || candidate.status, lockId, lockedAt: now, lockExpiresAt: new Date(now.getTime() + LEASE_MS) } },
      { new: true }
    );
    if (claimed) claims.push({ slotId: claimed._id, lockId });
  }
  return claims;
}

export const marketingCampaignFacebookWorkerService = {
  async generateDueMedia(limit = 2) {
    const claims = await claimSlots({ statuses: ["generating_media"], platform: "Facebook", mediaType: "image", limit: Math.max(1, Math.min(limit, 5)) });
    return { claimed: claims.length, results: await Promise.all(claims.map((claim) => processImageSlot(claim.slotId, claim.lockId))) };
  },

  async verifyDueSlots(limit = 5) {
    const claims = await claimSlots({ statuses: ["verifying"], platform: "Facebook", dueField: "verifyAt", limit: Math.max(1, Math.min(limit, 10)) });
    return { claimed: claims.length, results: await Promise.all(claims.map((claim) => processVerifySlot(claim.slotId, claim.lockId))) };
  },

  async publishDueSlots(limit = 3) {
    const claims = await claimSlots({ statuses: ["ready_to_publish", "publishing"], platform: "Facebook", dueField: "scheduledAt", limit: Math.max(1, Math.min(limit, 10)), nextStatus: "publishing" });
    return { claimed: claims.length, results: await Promise.all(claims.map((claim) => processPublishSlot(claim.slotId, claim.lockId))) };
  },
};
