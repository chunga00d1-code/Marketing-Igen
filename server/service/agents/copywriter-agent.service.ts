import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingCandidateModel } from "../../model/marketing-candidate.model";
import { openrouterChat } from "../openrouter.service";
import { contentHash, loadAgentSkill } from "./campaign-utils";

export class CopywriterAgentService {
  public static async write(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign,
    researchContext: string
  ) {
    const copywritingSkill = loadAgentSkill("copywriter");
    const socialSkill = loadAgentSkill("social");

    const systemInstruction = `
${copywritingSkill}
${socialSkill}

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

JSON Output Schema:
{
  "title": "Tiêu đề ngắn gọn mô tả bài viết",
  "outline": "Dàn ý chi tiết các phần của bài viết",
  "bodyText": "Nội dung chi tiết bài viết (caption/body) bằng tiếng Việt, bao gồm cả các hashtag phù hợp",
  "mediaPrompt": "Detailed English image/video prompt following visual guidelines",
  "voiceScript": "Kịch bản đọc thoại tiếng Việt (chỉ bắt buộc nếu mediaType là video hoặc human-video)"
}
`;

    const userPrompt = `
Chiến dịch:
- Tiêu đề: ${campaign.title}
- Brief chiến dịch: ${campaign.sourceBrief}

Bài đăng cần viết:
- Kênh (Platform): ${slot.platform}
- Cột trụ (Pillar): ${slot.pillar}
- Mục tiêu: ${slot.objective}
- Định dạng (MediaType): ${slot.mediaType}
- Chủ đề: ${slot.topicBrief}

Kết quả nghiên cứu từ Researcher Agent:
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

    console.log(`[CopywriterAgent] Writing content for slot ${slot._id} using model ${model}...`);
    const result = await openrouterChat({
      model,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      jsonMode: true,
      responseSchema,
    });

    const data = JSON.parse(result.text);

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
      const retryResult = await openrouterChat({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: uniquePrompt },
        ],
        temperature: 0.85, // increase temp for more novelty
        jsonMode: true,
        responseSchema,
      });
      const retryData = JSON.parse(retryResult.text);
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
