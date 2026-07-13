import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { geminiService } from "../gemini.service";
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

    if (slot.mediaType === "video" || slot.mediaType === "human-video") {
      throw new Error("Video chưa được xử lý; cần Phase 4.");
    }

    if (slot.mediaType !== "image") {
      throw new Error(`Media type không hỗ trợ: ${slot.mediaType}`);
    }

    const content = await MarketingContentModel.findOne({
      _id: slot.marketingContentId,
      companyCode: slot.companyCode,
    });
    if (!content || !content.mediaPrompt) {
      throw new Error("Thiếu nội dung bài đăng hoặc Visual Prompt để tạo ảnh.");
    }

    const isBudget = campaign.qualityMode === "budget";
    const imageCost = isBudget ? API_COSTS.CAMPAIGN_IMAGE_BUDGET : API_COSTS.CAMPAIGN_IMAGE_PREMIUM;

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
    await walletService.deductBalance(campaign.createdBy, imageCost, "Tạo ảnh cho chiến dịch tự động (MediaCreatorAgent)");

    content.imageUrl = image.url;
    await content.save();

    console.log(`[MediaCreatorAgent] Generated image successfully: ${image.url}`);
    return image.url;
  }
}
