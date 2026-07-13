import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingCampaignModel } from "../../model/marketing-campaign.model";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { facebookPostService } from "../facebook-post.service";
import { resolveFacebookCredentials } from "./campaign-utils";

export class PublisherAgentService {
  public static async publish(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign
  ): Promise<{ status: "published" | "publishing" | "failed"; postId?: string; postUrl?: string }> {
    const content = await MarketingContentModel.findOne({
      _id: slot.marketingContentId,
      companyCode: slot.companyCode,
    });
    if (!content) {
      throw new Error("Không tìm thấy nội dung bài đăng để thực hiện đăng tải.");
    }

    // 1. Idempotency Check
    if (slot.publishedPostId || content.status === "published") {
      console.log(`[PublisherAgent] Slot ${slot._id} or content has already been published. Skipping.`);
      return { status: "published", postId: slot.publishedPostId || content.facebookPostId, postUrl: slot.publishedUrl || content.postUrl };
    }

    // 2. Late Publish Check
    const lateDeadline = new Date(slot.scheduledAt.getTime() + campaign.latePublishWindowMinutes * 60000);
    if (new Date() > lateDeadline) {
      throw new Error("Đã quá cửa sổ cho phép đăng muộn của chiến dịch.");
    }

    // 3. Resolve Facebook Credentials
    const credentials = await resolveFacebookCredentials({
      companyCode: slot.companyCode,
      createdBy: campaign.createdBy,
      integrationId: slot.integrationId,
    });

    console.log(`[PublisherAgent] Publishing slot ${slot._id} to Facebook page ${credentials.pageId}...`);

    // Record publish requested timestamp
    slot.publishRequestedAt = new Date();
    await slot.save();

    // 4. Graph API execution
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
      // Direct success
      content.status = "published";
      content.publishedAt = new Date();
      content.facebookPostId = postId;
      content.postUrl = postUrl;
      await content.save();

      slot.status = "published";
      slot.publishedPostId = postId;
      slot.publishedUrl = postUrl;
      await slot.save();

      await MarketingCampaignModel.updateOne({ _id: campaign._id }, { $inc: { "statistics.publishedSlots": 1 } });
      console.log(`[PublisherAgent] Published slot ${slot._id} successfully. Post ID: ${postId}`);
      return { status: "published", postId, postUrl };
    }

    // Awaiting async webhook/processing
    content.status = "processing";
    await content.save();

    console.log(`[PublisherAgent] Publish requested for slot ${slot._id}, awaiting webhook callback...`);
    return { status: "publishing" };
  }
}
