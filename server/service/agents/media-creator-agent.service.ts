import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { MarketingCampaignModel } from "../../model/marketing-campaign.model";
import { geminiService } from "../gemini.service";
import { piapiService } from "../piapi.service";
import { API_COSTS, walletService } from "../wallet.service";

export class MediaCreatorAgentService {
  public static async createMedia(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): Promise<string> {
    if (slot.mediaType === "text") {
      console.log(`[MediaCreatorAgent] Slot ${slot._id} is text-only. Skipping media generation.`);
      return "";
    }

    const content = await MarketingContentModel.findOne({
      _id: slot.marketingContentId,
      companyCode: slot.companyCode,
    });
    if (!content || !content.mediaPrompt) {
      throw new Error("Thiếu nội dung bài đăng hoặc Visual Prompt để tạo media.");
    }

    if (content.videoUrl || content.imageUrl) {
      return content.videoUrl || content.imageUrl || "";
    }

    const isBudget = campaign.qualityMode === "budget";

    if (slot.mediaType === "video" || slot.mediaType === "human-video") {
      const videoCost = isBudget ? API_COSTS.CAMPAIGN_VIDEO_BUDGET : API_COSTS.CAMPAIGN_VIDEO_PREMIUM;

      try {
        // Check balance first
        await walletService.checkBalance(campaign.createdBy, videoCost);

        const model = process.env.GEMINI_VIDEO_MODEL || "veo31-video-fast-audio";
        console.log(`[MediaCreatorAgent] Generating video for slot ${slot._id} (Prompt: "${content.mediaPrompt}", Model: ${model})...`);
        
        const videoResult = await piapiService.generateVideo(
          content.mediaPrompt,
          model,
          5, // 5 seconds duration
          { aspectRatio: "16:9" }
        );

        if (!/^https:\/\//i.test(videoResult.url)) {
          throw new Error("AI không trả về URL video HTTPS hợp lệ.");
        }

        // Deduct balance
        const billing = await walletService.deductBalance(
          campaign.createdBy,
          videoCost,
          "Tạo video cho chiến dịch tự động (MediaCreatorAgent)",
          `${campaign._id}:${slot._id}:media:video`
        );
        if (billing?.charged) {
          await MarketingCampaignModel.updateOne(
            { _id: campaign._id, companyCode: campaign.companyCode },
            { $inc: { "statistics.actualCost": videoCost } }
          );
        }

        content.videoUrl = videoResult.url;
        await content.save();

        console.log(`[MediaCreatorAgent] Generated video successfully: ${videoResult.url}`);
        return videoResult.url;
      } catch (err: unknown) {
        console.warn(`[MediaCreatorAgent] Video generation failed. Attempting fallback to image...`, err);
        slot.mediaType = "image";
        await slot.save();
        content.mediaType = "image";
        await content.save();
        // Fall through to the image generation logic below
      }
    }

    if (slot.mediaType === "image") {
      const imageCost = isBudget ? API_COSTS.CAMPAIGN_IMAGE_BUDGET : API_COSTS.CAMPAIGN_IMAGE_PREMIUM;

      try {
        // Check balance first
        await walletService.checkBalance(campaign.createdBy, imageCost);

        console.log(`[MediaCreatorAgent] Generating image for slot ${slot._id} (Prompt: "${content.mediaPrompt}")...`);
        const image = await geminiService.generateImage(content.mediaPrompt, {
          aspectRatio: "1:1",
          resolution: "1K",
        });

        if (!/^https:\/\//i.test(image.url)) {
          throw new Error("AI không trả về URL ảnh HTTPS hợp lệ.");
        }

        // Deduct balance
        const billing = await walletService.deductBalance(
          campaign.createdBy,
          imageCost,
          "Tạo ảnh cho chiến dịch tự động (MediaCreatorAgent)",
          `${campaign._id}:${slot._id}:media:image`
        );
        if (billing?.charged) {
          await MarketingCampaignModel.updateOne(
            { _id: campaign._id, companyCode: campaign.companyCode },
            { $inc: { "statistics.actualCost": imageCost } }
          );
        }

        content.imageUrl = image.url;
        await content.save();

        console.log(`[MediaCreatorAgent] Generated image successfully: ${image.url}`);
        return image.url;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (campaign.rules?.allowTextOnlyFallback || slot.platform === "Facebook") {
          console.warn(`[MediaCreatorAgent] Image generation failed. Attempting fallback to text-only...`, err);
          slot.mediaType = "text";
          await slot.save();
          content.mediaType = undefined;
          await content.save();
          return "";
        }
        throw new Error(`Tạo ảnh thất bại và không cho phép bài viết chỉ có chữ làm dự phòng. Lỗi chi tiết: ${errorMsg}`);
      }
    }

    throw new Error(`Media type không hỗ trợ: ${slot.mediaType}`);
  }
}
