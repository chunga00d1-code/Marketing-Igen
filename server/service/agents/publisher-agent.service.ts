import { IMarketingCampaignSlot } from "../../interface/marketing-campaign-slot.interface";
import { IMarketingCampaign } from "../../interface/marketing-campaign.interface";
import { MarketingContentModel } from "../../model/marketing-content.model";
import { facebookPostService } from "../facebook-post.service";
import { tiktokService } from "../tiktok.service";
import { resolveFacebookCredentials } from "./campaign-utils";
import { marketingCampaignService } from "../marketing-campaign.service";
import { assertCampaignVideoReady } from "./campaign-caption.service";

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
      return {
        status: "published",
        postId: slot.publishedPostId || content.facebookPostId || content.tiktokPostId,
        postUrl: slot.publishedUrl || content.postUrl || content.tiktokShareUrl,
      };
    }
    if (slot.platform === "TikTok" && content.status === "processing" && content.tiktokPublishId) {
      console.log(`[PublisherAgent] TikTok slot ${slot._id} already has publish_id ${content.tiktokPublishId}. Awaiting provider completion.`);
      return { status: "publishing" };
    }

    // 2. Late Publish Check
    const lateDeadline = new Date(slot.scheduledAt.getTime() + campaign.latePublishWindowMinutes * 60000);
    if (new Date() > lateDeadline) {
      throw new Error("Đã quá cửa sổ cho phép đăng muộn của chiến dịch.");
    }

    // 3. Final media/caption invariant before every platform publish.
    await assertCampaignVideoReady({ campaign, slot, content });

    // 4. Platform specific publishing
    if (slot.platform === "TikTok") {
      console.log(`[PublisherAgent] Publishing slot ${slot._id} to TikTok...`);
      slot.publishRequestedAt = new Date();
      await slot.save();

      const postOptions = slot.tiktokPublishOptions;
      if (!postOptions?.consentAccepted || !postOptions.privacyLevel || !postOptions.videoDurationSeconds) {
        throw new Error("Cần mở màn hình đăng TikTok để chọn quyền riêng tư, xác nhận điều khoản và kiểm tra thời lượng video trước khi đăng.");
      }

      const result = await tiktokService.publishVideo(
        String(content._id),
        postOptions.caption,
        content.videoUrl || "",
        postOptions.privacyLevel,
        undefined,
        undefined,
        undefined,
        slot.integrationId ? String(slot.integrationId) : undefined,
        slot.companyCode,
        postOptions
      );

      if (result.status === "success" && result.data?.success) {
        const postId = String(result.data.postId || "").trim();
        const postUrl = String(result.data.shareUrl || "").trim();

        content.status = "published";
        content.publishedAt = new Date();
        content.tiktokPostId = postId;
        content.tiktokShareUrl = postUrl;
        await content.save();

        slot.status = "published";
        slot.publishedPostId = postId;
        slot.publishedUrl = postUrl;
        await slot.save();

        await marketingCampaignService.syncCampaignStatusAndStats(campaign._id);
        console.log(`[PublisherAgent] Published slot ${slot._id} successfully to TikTok. Post ID: ${postId}`);
        return { status: "published", postId, postUrl };
      }

      content.status = "processing";
      if (result.data?.publishId) {
        content.tiktokPublishId = result.data.publishId;
      }
      await content.save();

      console.log(`[PublisherAgent] TikTok publish requested for slot ${slot._id}, awaiting processing/webhook...`);
      return { status: "publishing" };
    } else {
      // Default to Facebook
      const credentials = await resolveFacebookCredentials({
        companyCode: slot.companyCode,
        createdBy: campaign.createdBy,
        integrationId: slot.integrationId,
      });

      if (
        credentials.isMock
        && credentials.pageId.startsWith("mock_local_")
        && process.env.NODE_ENV !== "production"
      ) {
        const postId = `mock-local-${slot._id}-${Date.now()}`;
        const postUrl = `http://localhost:3000/mock-facebook/${postId}`;
        content.status = "published";
        content.publishedAt = new Date();
        content.facebookPostId = postId;
        content.postUrl = postUrl;
        await content.save();

        slot.status = "published";
        slot.publishedPostId = postId;
        slot.publishedUrl = postUrl;
        await slot.save();

        await marketingCampaignService.syncCampaignStatusAndStats(campaign._id);
        console.log(`[PublisherAgent] Local mock published slot ${slot._id}.`);
        return { status: "published", postId, postUrl };
      }

      console.log(`[PublisherAgent] Publishing slot ${slot._id} to Facebook page ${credentials.pageId}...`);

      // Detect retry: slot already had a publish attempt before
      const isRetry = !!slot.publishRequestedAt;

      // Record publish requested timestamp
      slot.publishRequestedAt = new Date();
      await slot.save();

      // Graph API execution
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
        slot.publishIdempotencyKey,
        isRetry, // bypass n8n lock on retry
        content.mediaUrls
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

        await marketingCampaignService.syncCampaignStatusAndStats(campaign._id);
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
}
