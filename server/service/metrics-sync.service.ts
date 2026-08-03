/* eslint-disable @typescript-eslint/no-explicit-any */
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { UserModel } from "../model/user.model";
import { SocialPostMetricModel } from "../model/social-post-metric.model";

export class MetricsSyncService {
  /**
   * Đồng bộ metrics cho các Facebook slot đã published
   */
  public static async syncFacebookMetrics(limit = 20): Promise<{
    processed: number;
    success: number;
    failed: number;
    errors: string[];
  }> {
    const result = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    try {
      // 1. Lấy danh sách các slot đã sync trong vòng 6 tiếng qua để loại trừ
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentlySynced = await SocialPostMetricModel.find({
        platform: "Facebook",
        syncedAt: { $gte: sixHoursAgo },
      } as any)
        .select("slotId")
        .lean();

      const recentlySyncedSlotIds = recentlySynced.map((m: any) => String(m.slotId));

      // 2. Tìm các slot cần sync (published trong 30 ngày qua, chưa sync hoặc sync > 6 tiếng trước)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const slots = await MarketingCampaignSlotModel.find({
        platform: "Facebook",
        status: "published",
        publishedPostId: { $exists: true, $ne: "" },
        scheduledAt: { $gte: thirtyDaysAgo },
        _id: { $nin: recentlySyncedSlotIds as any },
      })
        .limit(limit)
        .lean();

      result.processed = slots.length;

      if (slots.length === 0) {
        return result;
      }

      // Cache token để tránh query lặp đi lặp lại
      const tokenCache: Record<string, { pageId: string; accessToken: string }> = {};

      for (const slot of slots) {
        try {
          const postId = String(slot.publishedPostId || "").trim();
          if (!postId) {
            continue;
          }

          // Lấy credentials cho slot này
          let credentials = tokenCache[String(slot.integrationId || slot.campaignId)];

          if (!credentials) {
            if (slot.integrationId) {
              const integration = await SocialIntegrationModel.findOne({
                _id: slot.integrationId,
                companyCode: slot.companyCode,
                platform: "Facebook",
                isConnected: true,
              }).lean();

              if (integration?.username && integration.accessToken) {
                credentials = {
                  pageId: integration.username,
                  accessToken: integration.accessToken,
                };
                tokenCache[String(slot.integrationId)] = credentials;
              }
            } else {
              const campaign = await MarketingCampaignModel.findById(slot.campaignId)
                .select("createdBy")
                .lean();

              if (campaign?.createdBy) {
                const user = await UserModel.findById(campaign.createdBy)
                  .select("companyCode facebookIntegration")
                  .lean();

                if (user?.facebookIntegration?.isConnected && user.facebookIntegration.pageId && user.facebookIntegration.pageAccessToken) {
                  credentials = {
                    pageId: user.facebookIntegration.pageId,
                    accessToken: user.facebookIntegration.pageAccessToken,
                  };
                  tokenCache[String(slot.campaignId)] = credentials;
                }
              }
            }
          }

          if (!credentials?.accessToken) {
            throw new Error(`Không tìm thấy token kết nối Facebook cho slot ${slot._id}`);
          }

          // Gọi API lấy tương tác cơ bản (Likes, Comments, Shares)
          const basicUrl = `https://graph.facebook.com/v25.0/${encodeURIComponent(postId)}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(credentials.accessToken)}`;
          
          let likes = 0;
          let comments = 0;
          let shares = 0;

          const basicResponse = await (globalThis as any).fetch(basicUrl);
          if (basicResponse.ok) {
            const basicData = await basicResponse.json();
            likes = basicData.likes?.summary?.total_count || 0;
            comments = basicData.comments?.summary?.total_count || 0;
            shares = basicData.shares?.count || 0;
          } else {
            const errText = await basicResponse.text();
            throw new Error(`Graph API basic metrics error: ${basicResponse.status} - ${errText}`);
          }

          // Gọi API lấy Insights (Reach, Impressions, Clicks)
          const insightsUrl = `https://graph.facebook.com/v25.0/${encodeURIComponent(postId)}/insights?metric=post_impressions,post_impressions_unique,post_clicks&access_token=${encodeURIComponent(credentials.accessToken)}`;
          
          let impressions = 0;
          let reach = 0;
          let clicks = 0;

          const insightsResponse = await (globalThis as any).fetch(insightsUrl);
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            const dataArray = insightsData.data || [];
            
            for (const item of dataArray) {
              const value = item.values?.[0]?.value || 0;
              if (item.name === "post_impressions") impressions = value;
              if (item.name === "post_impressions_unique") reach = value;
              if (item.name === "post_clicks") clicks = value;
            }
          } else {
            const errText = await insightsResponse.text();
            console.warn(`[MetricsSyncService] Không thể lấy Insights cho post ${postId} (có thể Page < 100 likes hoặc thiếu quyền): ${insightsResponse.status} - ${errText}`);
            // Không throw lỗi này để vẫn lưu được Likes/Comments/Shares
          }

          // Upsert kết quả vào SocialPostMetric
          await SocialPostMetricModel.findOneAndUpdate(
            { slotId: slot._id } as any,
            {
              $set: {
                companyCode: slot.companyCode,
                campaignId: slot.campaignId,
                platform: "Facebook",
                postId,
                postUrl: slot.publishedUrl,
                impressions,
                reach,
                clicks,
                likes,
                comments,
                shares,
                syncedAt: new Date(),
                syncError: undefined,
              },
              $inc: { syncCount: 1 },
            },
            { upsert: true, new: true }
          );

          result.success++;
        } catch (slotError: any) {
          result.failed++;
          const errMsg = `Slot ${slot._id} error: ${slotError.message}`;
          result.errors.push(errMsg);
          console.error(`[MetricsSyncService] ${errMsg}`);

          // Ghi nhận lỗi vào SocialPostMetric để theo dõi
          await SocialPostMetricModel.findOneAndUpdate(
            { slotId: slot._id } as any,
            {
              $set: {
                companyCode: slot.companyCode,
                campaignId: slot.campaignId,
                platform: "Facebook",
                postId: slot.publishedPostId || "unknown",
                postUrl: slot.publishedUrl,
                syncedAt: new Date(),
                syncError: slotError.message,
              },
              $inc: { syncCount: 1 },
            },
            { upsert: true }
          ).catch((e) => console.error(`[MetricsSyncService] Failed to log sync error: ${e.message}`));
        }
      }
    } catch (globalError: any) {
      console.error("[MetricsSyncService] Global sync error:", globalError);
      result.errors.push(`Global error: ${globalError.message}`);
    }

    return result;
  }
}
