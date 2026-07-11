import { createHash, randomUUID } from "crypto";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCandidateModel } from "../model/marketing-candidate.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { geminiService } from "./gemini.service";
import { API_COSTS, walletService } from "./wallet.service";

const VARIANTS = ["Insight và nỗi đau khách hàng", "Kể chuyện tình huống thực tế", "Giá trị giáo dục và hướng dẫn", "Social proof và bằng chứng", "Chuyển đổi và xử lý phản đối"];
const PLACEHOLDER_PATTERN = /\[(?:điền|insert|placeholder|tên sản phẩm|link)[^\]]*\]|\{\{[^}]+\}\}/i;

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function contentHash(value: string) {
  return createHash("sha256").update(normalizeText(value)).digest("hex");
}

function similarity(left: string, right: string) {
  const a = new Set(normalizeText(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(normalizeText(right).split(" ").filter((word) => word.length > 2));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
}

function validateCandidate(candidate: { title: string; outline: string; bodyText: string; mediaPrompt: string; voiceScript: string }, input: {
  platform: "Facebook" | "TikTok";
  mediaType: string;
  requiredCta?: string;
  requiredHashtags?: string[];
  forbiddenTerms?: string[];
  recentBodies: string[];
}) {
  const reasons: string[] = [];
  if (!candidate.title || !candidate.outline || !candidate.bodyText || !candidate.mediaPrompt) reasons.push("Thiếu trường nội dung bắt buộc.");
  if (PLACEHOLDER_PATTERN.test(`${candidate.title} ${candidate.bodyText}`)) reasons.push("Nội dung còn placeholder.");
  const normalizedBody = normalizeText(candidate.bodyText);
  for (const term of input.forbiddenTerms || []) {
    if (normalizedBody.includes(normalizeText(term))) reasons.push(`Chứa từ cấm: ${term}`);
  }
  if (input.requiredCta && !normalizedBody.includes(normalizeText(input.requiredCta))) reasons.push("Thiếu CTA bắt buộc.");
  for (const hashtag of input.requiredHashtags || []) {
    if (!candidate.bodyText.toLowerCase().includes(hashtag.toLowerCase())) reasons.push(`Thiếu hashtag: ${hashtag}`);
  }
  if (input.platform === "TikTok" && /\b(?:visual|audio|cảnh\s*\d+|0:\d{2})\b/i.test(candidate.bodyText)) reasons.push("Caption TikTok chứa storyboard/timeline.");
  if (input.mediaType === "human-video" && !candidate.voiceScript) reasons.push("Thiếu voice script cho video người thật.");
  if (input.recentBodies.some((body) => similarity(body, candidate.bodyText) >= 0.72)) reasons.push("Nội dung trùng lặp quá cao với bài gần đây.");
  return reasons;
}

async function processSlot(slotId: string, lockId: string) {
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, lockId });
  if (!slot) return { slotId, status: "skipped" };
  const campaign = await MarketingCampaignModel.findOne({ _id: slot.campaignId, companyCode: slot.companyCode, status: "active" });
  if (!campaign) {
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, { $set: { status: "planned", lockId: null, lockedAt: null, lockExpiresAt: null } });
    return { slotId, status: "inactive_campaign" };
  }

  const recentContent = await MarketingContentModel.find({ companyCode: slot.companyCode, campaignId: String(campaign._id) })
    .sort({ generatedAt: -1 }).limit(10).select("title bodyText").lean();
  const recentTitles = recentContent.map((item) => item.title);
  const recentBodies = recentContent.map((item) => item.bodyText);
  const variants = VARIANTS.slice(0, campaign.candidateCount);

  try {
    const generated = await Promise.all(variants.map(async (variant) => {
      await walletService.checkBalance(campaign.createdBy, API_COSTS.GEMINI_MARKETING);
      const candidate = await geminiService.generateCampaignCandidate({
        sourceBrief: campaign.sourceBrief,
        campaignTitle: campaign.title,
        pillar: slot.pillar,
        objective: slot.objective,
        topicBrief: slot.topicBrief,
        platform: slot.platform,
        mediaType: slot.mediaType,
        variant,
        requiredCta: campaign.rules?.requiredCta,
        requiredHashtags: campaign.rules?.requiredHashtags,
        forbiddenTerms: campaign.rules?.forbiddenTerms,
        recentTitles,
      });
      await walletService.deductBalance(campaign.createdBy, API_COSTS.GEMINI_MARKETING, `Sinh candidate chiến dịch: ${variant}`);
      return { variant, candidate };
    }));

    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
      $set: { status: "scoring" },
      $push: { transitions: { from: "generating", to: "scoring", reason: "Candidates generated", at: new Date() } },
    });

    const evaluated = await Promise.all(generated.map(async ({ variant, candidate }) => {
      const rejectionReasons = validateCandidate(candidate, {
        platform: slot.platform,
        mediaType: slot.mediaType,
        requiredCta: campaign.rules?.requiredCta,
        requiredHashtags: campaign.rules?.requiredHashtags,
        forbiddenTerms: campaign.rules?.forbiddenTerms,
        recentBodies,
      });
      const scoreDetails = rejectionReasons.length > 0
        ? { fidelity: 0, objective: 0, platform: 0, hook: 0, conversion: 0, readability: 0, novelty: 0 }
        : await geminiService.scoreCampaignCandidate({
          sourceBrief: campaign.sourceBrief,
          objective: slot.objective,
          platform: slot.platform,
          title: candidate.title,
          bodyText: candidate.bodyText,
          recentTitles,
        });
      if (rejectionReasons.length === 0) {
        await walletService.deductBalance(campaign.createdBy, API_COSTS.GEMINI_MARKETING, "Chấm điểm candidate chiến dịch");
      }
      const score = Object.values(scoreDetails).reduce((sum, value) => sum + value, 0);
      return { variant, candidate, rejectionReasons, scoreDetails, score };
    }));

    const savedCandidates = await MarketingCandidateModel.insertMany(evaluated.map((item) => ({
      companyCode: slot.companyCode,
      campaignId: campaign._id,
      slotId: slot._id,
      variant: item.variant,
      ...item.candidate,
      score: item.score,
      scoreDetails: item.scoreDetails,
      rejectionReasons: item.rejectionReasons,
      selected: false,
      contentHash: contentHash(item.candidate.bodyText),
      usage: { estimatedCost: API_COSTS.GEMINI_MARKETING * (item.rejectionReasons.length > 0 ? 1 : 2) },
    })));
    const winner = savedCandidates.filter((item) => item.rejectionReasons.length === 0).sort((a, b) => b.score - a.score)[0];

    if (!winner || winner.score < campaign.minimumScore) {
      const canRetry = slot.attemptCount < 1;
      await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
        $set: {
          status: canRetry ? "retrying" : "needs_attention",
          prepareAt: canRetry ? new Date(Date.now() + 5 * 60000) : slot.prepareAt,
          lockId: null, lockedAt: null, lockExpiresAt: null,
          lastError: { type: "validation", message: `Không có candidate đạt ngưỡng ${campaign.minimumScore}.`, occurredAt: new Date() },
        },
        $inc: { attemptCount: 1 },
        $push: { transitions: { from: "scoring", to: canRetry ? "retrying" : "needs_attention", reason: "Score below threshold", at: new Date() } },
      });
      return { slotId, status: canRetry ? "retrying" : "needs_attention" };
    }

    await MarketingCandidateModel.updateOne({ _id: winner._id, selected: false }, { $set: { selected: true } });
    const content = await MarketingContentModel.create({
      companyCode: slot.companyCode,
      authorUid: campaign.createdBy,
      campaignId: String(campaign._id),
      campaignTitle: campaign.title,
      campaignSlotId: slot._id,
      title: winner.title,
      channel: slot.platform,
      contentType: slot.platform === "TikTok" ? "Video ngắn" : "Bài viết chiến dịch",
      status: "pending",
      bodyText: winner.bodyText,
      outline: winner.outline,
      mediaPrompt: winner.mediaPrompt,
      voiceScript: winner.voiceScript,
      mediaType: slot.mediaType === "text" ? undefined : slot.mediaType === "image" ? "image" : slot.mediaType,
      generatedAt: new Date(),
      integrationId: slot.integrationId,
    });
    const nextStatus = slot.mediaType === "text" ? "verifying" : "generating_media";
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
      $set: {
        status: nextStatus,
        selectedCandidateId: winner._id,
        marketingContentId: content._id,
        lockId: null, lockedAt: null, lockExpiresAt: null,
      },
      $push: { transitions: { from: "scoring", to: nextStatus, reason: `Winner selected with score ${winner.score}`, at: new Date() } },
    });
    return { slotId, status: nextStatus, score: winner.score };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await MarketingCampaignSlotModel.updateOne({ _id: slot._id, lockId }, {
      $set: {
        status: "retrying", prepareAt: new Date(Date.now() + 5 * 60000), lockId: null, lockedAt: null, lockExpiresAt: null,
        lastError: { type: "retryable", message, occurredAt: new Date() },
      },
      $inc: { attemptCount: 1 },
      $push: { transitions: { from: slot.status, to: "retrying", reason: message, at: new Date() } },
    });
    return { slotId, status: "retrying", error: message };
  }
}

export const marketingCampaignWorkerService = {
  async prepareDueSlots(limit = 3) {
    const due = await MarketingCampaignSlotModel.find({
      status: { $in: ["planned", "retrying"] },
      prepareAt: { $lte: new Date() },
      $or: [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: new Date() } }],
    }).sort({ prepareAt: 1 }).limit(Math.max(1, Math.min(limit, 10))).select("_id").lean();

    const claims: Array<{ slotId: string; lockId: string }> = [];
    for (const item of due) {
      const lockId = randomUUID();
      const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
        { _id: item._id, status: { $in: ["planned", "retrying"] }, $or: [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: new Date() } }] },
        {
          $set: { status: "generating", lockId, lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + 20 * 60000) },
          $push: { transitions: { to: "generating", reason: "Prepare worker claimed slot", at: new Date() } },
        },
        { new: true }
      );
      if (claimed) claims.push({ slotId: String(claimed._id), lockId });
    }
    const results = await Promise.all(claims.map((claim) => processSlot(claim.slotId, claim.lockId)));
    return { claimed: claims.length, results };
  },
};
