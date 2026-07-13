import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingCampaignSlotModel } from "../../model/marketing-campaign-slot.model";
import { openrouterChat } from "../openrouter.service";
import { loadAgentSkill } from "./campaign-utils";

export class ResearcherAgentService {
  public static async research(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): Promise<string> {
    const skillContent = loadAgentSkill("researcher");

    // Fetch topics of already processed slots in this campaign to avoid duplication
    const siblingSlots = await MarketingCampaignSlotModel.find({
      campaignId: slot.campaignId,
      _id: { $ne: slot._id },
      status: { $in: ["pending_approval", "ready_to_publish", "published"] },
    })
      .select("topicBrief pillar objective")
      .limit(15)
      .lean();

    const siblingContext = siblingSlots
      .map((s, idx) => `${idx + 1}. Brief: "${s.topicBrief}" | Objective: "${s.objective}"`)
      .join("\n");

    const systemInstruction = `
${skillContent}

You are the Researcher Agent. Your task is to perform context gathering, target audience research, and brand/product analysis for a specific social media post slot.
Generate a structured research context bundle in Vietnamese that helps the Copywriter Agent write high-performing conversion copy.
CRITICAL: You must avoid repeating or duplicating the topics/angles of the already planned posts listed below.

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

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

    return result.text;
  }
}
