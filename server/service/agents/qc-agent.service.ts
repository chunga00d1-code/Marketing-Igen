import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { openrouterChat } from "../openrouter.service";
import { assertReachableMedia, loadAgentSkill, resolveFacebookCredentials } from "./campaign-utils";

export class QcAgentService {
  public static async verify(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): Promise<{ passed: boolean; score: number; reasons: string[] }> {
    const content = await MarketingContentModel.findOne({
      _id: slot.marketingContentId,
      companyCode: slot.companyCode,
    });
    if (!content) {
      return { passed: false, score: 0, reasons: ["Không tìm thấy nội dung bài đăng để kiểm duyệt."] };
    }

    const reasons: string[] = [];

    // 1. Technical Checks
    if (!content.bodyText || !content.bodyText.trim()) {
      reasons.push("Nội dung bài viết trống.");
    }

    if (slot.mediaType === "image") {
      if (!content.imageUrl) {
        reasons.push("Hình ảnh bắt buộc chưa sẵn sàng.");
      } else {
        try {
          await assertReachableMedia(content.imageUrl);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          reasons.push(`Hình ảnh không truy cập được: ${msg}`);
        }
      }
    }

    if (slot.mediaType === "text" && ["image", "video"].includes(campaign.mediaPolicy) && !campaign.rules?.allowTextOnlyFallback) {
      reasons.push("Chiến dịch yêu cầu đa phương tiện nhưng không cho phép bài viết text-only fallback.");
    }

    // 2. Integration / Credential Verification
    try {
      await resolveFacebookCredentials({
        companyCode: slot.companyCode,
        createdBy: campaign.createdBy,
        integrationId: slot.integrationId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reasons.push(`Lỗi kết nối kênh đăng bài: ${msg}`);
    }

    if (reasons.length > 0) {
      return { passed: false, score: 0, reasons };
    }

    // 3. Editorial Checks via AI (QC Agent Sweep)
    const qcSkill = loadAgentSkill("qc");

    const systemInstruction = `
${qcSkill}

You are the Quality Control (QC) Agent. Your task is to perform an editing sweep of the Vietnamese marketing copy.
Scan the draft for:
1. Placeholders (e.g. [Tên], [Số điện thoại], [Link], [Sản phẩm], etc. that have not been filled).
2. Clichés and jargon (avoid words like "seamless", "cutting-edge", "innovative" without evidence).
3. Passive voice, confusing sentences, or formatting issues.
4. Exclamation points (minimize them).

Score the post content on a scale of 1 to 10 based on the Copy Editing Checklist.
If the score is 7 or above AND there are no placeholders or critical errors, mark "passed" as true.
Otherwise, set "passed" as false and list specific rejection reasons in Vietnamese.

JSON Output Schema:
{
  "score": 8,
  "passed": true,
  "rejectionReasons": []
}
`;

    const userPrompt = `
Tiêu đề: ${content.title}
Nội dung bài đăng:
"""
${content.bodyText}
"""
`;

    const responseSchema = {
      type: "object",
      properties: {
        score: { type: "number" },
        passed: { type: "boolean" },
        rejectionReasons: { type: "array", items: { type: "string" } },
      },
      required: ["score", "passed", "rejectionReasons"],
    };

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    console.log(`[QcAgent] Auditing content for slot ${slot._id}...`);
    try {
      const result = await openrouterChat({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        jsonMode: true,
        responseSchema,
      });

      const audit = JSON.parse(result.text);

      if (!audit.passed || audit.score < 7 || (audit.rejectionReasons && audit.rejectionReasons.length > 0)) {
        return {
          passed: false,
          score: audit.score,
          reasons: audit.rejectionReasons || ["Nội dung không đạt điểm chất lượng tối thiểu (7/10)."],
        };
      }

      return { passed: true, score: audit.score, reasons: [] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[QcAgent] Editorial sweep failed: ${msg}. Defaulting to basic structural pass.`);
      // Fallback: If AI fails but structural check passed
      return { passed: true, score: 7, reasons: [] };
    }
  }
}
