import { createHash } from "crypto";
import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingCampaignSlotModel } from "../../model/marketing-campaign-slot.model";
import { ApifyResearchService, ApifyRunAudit, ResearchEvidence } from "../apify-research.service";
import { openrouterChat } from "../openrouter.service";
import { API_COSTS } from "../wallet.service";
import { loadAgentSkill } from "./campaign-utils";

export type SlotResearchAnalysis = {
  fingerprint: string;
  context: string;
  model: string;
  researchedAt: Date;
  cost: number;
  evidence: ResearchEvidence[];
  apifyRuns: ApifyRunAudit[];
  providerCostUsd: number;
  billingMode: "shadow" | "live";
  billedAt?: Date;
};

export class ResearcherAgentService {
  public static fingerprint(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): string {
    return createHash("sha256")
      .update(JSON.stringify({
        sourceBrief: campaign.sourceBrief,
        title: campaign.title,
        platform: slot.platform,
        pillar: slot.pillar,
        objective: slot.objective,
        topicBrief: slot.topicBrief,
        mediaType: slot.mediaType,
        scheduledAt: slot.scheduledAt.toISOString(),
        apifyEnabled: ApifyResearchService.isEnabled(),
        apifyWindow: ApifyResearchService.cacheWindowKey(),
      }))
      .digest("hex");
  }

  public static async research(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): Promise<SlotResearchAnalysis> {
    const skillContent = loadAgentSkill("researcher");

    // Fetch topics of already processed slots in this campaign to avoid duplication
    const siblingSlots = await MarketingCampaignSlotModel.find({
      campaignId: slot.campaignId,
      _id: { $ne: slot._id },
      status: { $in: ["pending_approval", "ready_to_publish", "published"] },
    })
      .select("topicBrief pillar objective researchAnalysis.providerCostUsd researchAnalysis.apifyRuns")
      .limit(15)
      .lean();

    const researchSpendSlots = await MarketingCampaignSlotModel.find({
      campaignId: slot.campaignId,
      companyCode: slot.companyCode,
      _id: { $ne: slot._id },
      "researchAnalysis.fingerprint": { $exists: true },
    })
      .select("researchAnalysis.providerCostUsd researchAnalysis.apifyRuns")
      .lean();
    const campaignApifyCap = Number(process.env.APIFY_MAX_COST_PER_CAMPAIGN_USD || 3);
    const alreadyUsedApifyUsd = researchSpendSlots.reduce((total, sibling) => {
      const analysis = sibling.researchAnalysis;
      if (!analysis) return total;
      const estimated = (analysis.apifyRuns || []).reduce(
        (runTotal, run) => runTotal + Number(run.estimatedCostUsd || 0),
        0
      );
      return total + Math.max(Number(analysis.providerCostUsd || 0), estimated);
    }, 0);
    const remainingApifyBudgetUsd = Number.isFinite(campaignApifyCap) && campaignApifyCap > 0
      ? Math.max(0, campaignApifyCap - alreadyUsedApifyUsd)
      : undefined;
    const collected = await ApifyResearchService.collect(slot, campaign, remainingApifyBudgetUsd);
    const evidenceContext = this.formatEvidence(collected.evidence);

    const siblingContext = siblingSlots
      .map((s, idx) => `${idx + 1}. Brief: "${s.topicBrief}" | Objective: "${s.objective}"`)
      .join("\n");

    const systemInstruction = `
${skillContent}

You are the Researcher Agent. Your task is to perform context gathering, target audience research, and brand/product analysis for a specific social media post slot.
Generate a structured research context bundle in Vietnamese that helps the Copywriter Agent write high-performing conversion copy.
CRITICAL: You must avoid repeating or duplicating the topics/angles of the already planned posts listed below.
When source evidence is provided, use it as the factual basis. Do not invent facts, numbers, product claims, or trends that are absent from the evidence and campaign brief. Treat social engagement as directional context, not a universal truth.

JSON Output Schema requirements:
{
  "angles": ["dưới dạng các góc độ/khía cạnh tiếp cận độc đáo, sáng tạo"],
  "painPoints": ["các vấn đề, nỗi đau cụ thể của khách hàng mục tiêu liên quan đến chủ đề này"],
  "facts": ["các thông tin thực tế về sản phẩm/dịch vụ/thương hiệu cần làm nổi bật"],
  "summary": "Tóm tắt định hướng nghiên cứu và đề xuất cách triển khai độc đáo cho bài viết này"
}
`;

    const userPrompt = `
Chiến dịch:
- Tiêu đề: ${campaign.title}
- Brief chiến dịch: ${campaign.sourceBrief}

Bài đăng cần nghiên cứu:
- Kênh: ${slot.platform}
- Cột trụ nội dung (Pillar): ${slot.pillar}
- Mục tiêu cụ thể: ${slot.objective}
- Ý tưởng/Brief chủ đề: ${slot.topicBrief}
- Định dạng: ${slot.mediaType}
- Ngày đăng: ${slot.scheduledAt.toISOString()}

Danh sách các bài viết KHÁC đã được lên kế hoạch (TRÁNH TRÙNG LẶP Ý TƯỞNG):
${siblingContext || "Chưa có bài viết nào khác."}

Bằng chứng công khai đã thu thập qua Apify:
${evidenceContext || "Không có evidence Apify khả dụng. Chỉ dùng brief và tự nghiên cứu web thận trọng."}
`;

    const responseSchema = {
      type: "object",
      properties: {
        angles: { type: "array", items: { type: "string" } },
        painPoints: { type: "array", items: { type: "string" } },
        facts: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
      required: ["angles", "painPoints", "facts", "summary"],
    };

    const model = process.env.CAMPAIGN_RESEARCH_MODEL
      || (collected.evidence.length > 0 ? process.env.GEMINI_MODEL || "gemini-2.5-flash" : "perplexity/sonar");

    console.log(`[ResearcherAgent] Researching slot ${slot._id} for campaign "${campaign.title}"...`);
    const result = await openrouterChat({
      model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      jsonMode: true,
      responseSchema,
    });

    return {
      fingerprint: this.fingerprint(slot, campaign),
      context: result.text,
      model,
      researchedAt: new Date(),
      cost: API_COSTS.CAMPAIGN_RESEARCH,
      evidence: collected.evidence,
      apifyRuns: collected.apifyRuns,
      providerCostUsd: collected.providerCostUsd,
      billingMode: collected.billingMode,
    };
  }

  private static formatEvidence(evidence: ResearchEvidence[]): string {
    return evidence.slice(0, 18).map((item, index) => {
      const metrics = item.metrics
        ? ` | metrics: ${JSON.stringify(item.metrics)}`
        : "";
      return `${index + 1}. [${item.source}] ${item.title || item.author || "Nguồn công khai"}\nURL: ${item.sourceUrl}\nNội dung: ${item.text.slice(0, 700)}${metrics}`;
    }).join("\n\n");
  }
}
