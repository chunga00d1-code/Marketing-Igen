import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingCandidateModel } from "../../model/marketing-candidate.model";
import { openrouterChat } from "../openrouter.service";
import { contentHash, loadAgentSkill } from "./campaign-utils";

type CopywriterDraft = {
  title: string;
  outline: string;
  bodyText: string;
  mediaPrompt: string;
  voiceScript?: string;
};

function parseCopywriterDraft(responseText: string): CopywriterDraft {
  let cleaned = responseText.trim();
  const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch) cleaned = markdownMatch[1].trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = JSON.parse(cleaned.replace(/,\s*([\]}])/g, "$1"));
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI không trả về đối tượng JSON hợp lệ.");
  }

  const draft = parsed as Record<string, unknown>;
  const requiredFields = ["title", "outline", "bodyText", "mediaPrompt"] as const;
  for (const field of requiredFields) {
    if (typeof draft[field] !== "string" || !draft[field].trim()) {
      throw new Error(`AI trả về thiếu trường nội dung bắt buộc: ${field}.`);
    }
  }

  return {
    title: String(draft.title).trim(),
    outline: String(draft.outline).trim(),
    bodyText: String(draft.bodyText).trim(),
    mediaPrompt: String(draft.mediaPrompt).trim(),
    voiceScript: typeof draft.voiceScript === "string" ? draft.voiceScript.trim() : "",
  };
}

export class CopywriterAgentService {
  public static async write(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign,
    researchContext: string
  ) {
    const existingCandidate = await MarketingCandidateModel.findOne({
      slotId: slot._id,
      selected: true,
    }).sort({ createdAt: -1 });
    if (existingCandidate) {
      return existingCandidate;
    }

    const copywritingSkill = loadAgentSkill("copywriter");
    const socialSkill = loadAgentSkill("social");
    const tiktokSkill = slot.platform === "TikTok"
      ? loadAgentSkill("tiktok-content-publishing")
      : "";

    const systemInstruction = `
${copywritingSkill}
${socialSkill}
${tiktokSkill}

You are the Copywriter Agent. Your job is to draft exactly ONE extremely compelling, high-converting social media post variant in Vietnamese for the given slot.
Use the provided Research Context Bundle from the Researcher Agent to guide the copy's direction, key pain points, and facts.

Follow these rules:
1. Clarity over cleverness: Speak directly to the reader. Use customer language, not corporate jargon.
2. Structure: Start with a powerful scroll-stopping hook (verbal hook). Follow with benefit-oriented core content and a strong, specific call to action (CTA).
3. Visual description (mediaPrompt): Write a highly detailed ENGLISH prompt for an AI image/video generator.
   - Use the formula: Subject + Setting + Style (e.g. modern commercial photography, 3D render) + Lighting + Composition + Technical (e.g. 16:9, 4k).
   - Ensure the image concept matches the Vietnamese post content faithfully.
   - Do NOT add unrelated objects/persons not in the brief.
4. Voice script (voiceScript): If the post format involves video/audio, write a natural narration script in Vietnamese.
5. Real-media grounding: If the Research Context contains a visual analysis, the caption MUST match the observed subjects, setting, visible text, and factual details. Never turn uncertain visual guesses or suggested marketing angles into product facts.
6. TikTok constraint: when Platform is TikTok, write only a caption in bodyText (maximum 2,200 characters including hashtags). Put scene directions in outline/mediaPrompt and narration in voiceScript. Do not truncate the caption.

JSON Output Schema:
{
  "title": "Tiêu đề ngắn gọn mô tả bài viết",
  "outline": "Dàn ý chi tiết các phần của bài viết",
  "bodyText": "Nội dung chi tiết bài viết (caption/body) bằng tiếng Việt, bao gồm cả các hashtag phù hợp",
  "mediaPrompt": "Detailed English image/video prompt following visual guidelines",
  "voiceScript": "Kịch bản đọc thoại tiếng Việt (chỉ bắt buộc nếu mediaType là video hoặc human-video)"
}
`;

    const globalResearch = campaign.researchReport
      ? `\n\nTài liệu nghiên cứu và xu hướng thị trường (Google & Social):
${campaign.researchReport}`
      : "";

    const rulesSection = campaign.rules
      ? `\n\nQUY TẮC CHIẾN DỊCH BẮT BUỘC (Bạn phải tuân thủ nghiêm ngặt):\n` +
        (campaign.rules.requiredCta ? `- Kêu gọi hành động (CTA) bắt buộc: ${campaign.rules.requiredCta}\n` : "") +
        (campaign.rules.requiredHashtags?.length ? `- Hashtags bắt buộc: ${campaign.rules.requiredHashtags.join(", ")}\n` : "") +
        (campaign.rules.forbiddenTerms?.length ? `- Không được chứa các từ ngữ cấm sau: ${campaign.rules.forbiddenTerms.join(", ")}\n` : "")
      : "";

    const userPrompt = `
Chiến dịch:
- Tiêu đề: ${campaign.title}
- Brief chiến dịch: ${campaign.sourceBrief}${globalResearch}${rulesSection}
 
Bài đăng cần viết:
- Kênh (Platform): ${slot.platform}
- Cột trụ (Pillar): ${slot.pillar}
- Mục tiêu: ${slot.objective}
- Định dạng (MediaType): ${slot.mediaType}
- Chủ đề: ${slot.topicBrief}
 
Kết quả nghiên cứu local của slot từ Researcher Agent:
${researchContext}
`;

    const responseSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        outline: { type: "string" },
        bodyText: { type: "string" },
        mediaPrompt: { type: "string" },
        voiceScript: { type: "string" },
      },
      required: ["title", "outline", "bodyText", "mediaPrompt"],
    };

    const model = process.env.GEMINI_HEAVY_MODEL || "gemini-3.5-flash";

    const generateDraft = async (prompt: string, temperature: number): Promise<CopywriterDraft> => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const repairInstruction = attempt === 0
          ? ""
          : "\n\nPhản hồi trước sai cú pháp JSON. Hãy trả về đúng MỘT đối tượng JSON hợp lệ, không markdown, không giải thích và không xuống dòng bên trong chuỗi nếu chưa escape.";
        const result = await openrouterChat({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: `${prompt}${repairInstruction}` },
          ],
          temperature: attempt === 0 ? temperature : 0.2,
          jsonMode: true,
          responseSchema,
        });
        try {
          return parseCopywriterDraft(result.text);
        } catch (error) {
          lastError = error;
          console.warn(
            `[CopywriterAgent] Invalid structured response for slot ${slot._id}; retry ${attempt + 1}/2:`,
            error instanceof Error ? error.message : error
          );
        }
      }
      throw new Error(
        `AI trả về JSON sai định dạng sau 2 lần thử: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      );
    };

    console.log(`[CopywriterAgent] Writing content for slot ${slot._id} using model ${model}...`);
    const data = await generateDraft(userPrompt, 0.7);
    if (slot.platform === "TikTok" && (!data.bodyText?.trim() || data.bodyText.length > 2200)) {
      throw new Error("TikTok caption must be non-empty and no longer than 2,200 characters.");
    }

    // Compute hash and check for duplicates
    const hash = contentHash(data.bodyText);
    const duplicate = await MarketingCandidateModel.findOne({
      campaignId: slot.campaignId,
      contentHash: hash,
    }).lean();

    if (duplicate) {
      console.warn(`[CopywriterAgent] Duplicate content detected for hash: ${hash}. Regenerating unique content...`);
      // Append warning for uniqueness
      const uniquePrompt = `${userPrompt}\n\nWARNING: The previous attempt generated a duplicate. You MUST write a completely different angle and hook. Do not reuse similar phrases.`;
      const retryData = await generateDraft(uniquePrompt, 0.85);
      if (slot.platform === "TikTok" && (!retryData.bodyText?.trim() || retryData.bodyText.length > 2200)) {
        throw new Error("TikTok caption must be non-empty and no longer than 2,200 characters.");
      }
      const retryHash = contentHash(retryData.bodyText);

      const candidate = await MarketingCandidateModel.create({
        companyCode: slot.companyCode,
        campaignId: slot.campaignId,
        slotId: slot._id,
        variant: "v1_unique",
        title: retryData.title,
        outline: retryData.outline,
        bodyText: retryData.bodyText,
        mediaPrompt: retryData.mediaPrompt,
        voiceScript: retryData.voiceScript || "",
        score: 100,
        selected: true,
        contentHash: retryHash,
        usage: { model, estimatedCost: 0.01 },
      });
      return candidate;
    }

    const candidate = await MarketingCandidateModel.create({
      companyCode: slot.companyCode,
      campaignId: slot.campaignId,
      slotId: slot._id,
      variant: "v1",
      title: data.title,
      outline: data.outline,
      bodyText: data.bodyText,
      mediaPrompt: data.mediaPrompt,
      voiceScript: data.voiceScript || "",
      score: 100,
      selected: true,
      contentHash: hash,
      usage: { model, estimatedCost: 0.01 },
    });

    return candidate;
  }
}
