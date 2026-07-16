/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from "mongoose";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { SocialPostMetricModel } from "../model/social-post-metric.model";

export class MarketingAnalyticsService {
  public static async getCampaignAnalytics(
    companyCode: string,
    filters: {
      campaignId?: string;
      platform?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    // 1. Xây dựng match filters cho slots
    const slotMatch: any = { companyCode };

    if (filters.campaignId) {
      slotMatch.campaignId = new Types.ObjectId(filters.campaignId);
    }
    if (filters.platform) {
      slotMatch.platform = filters.platform;
    }
    if (filters.startDate || filters.endDate) {
      slotMatch.scheduledAt = {};
      if (filters.startDate) {
        slotMatch.scheduledAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // Đặt mốc thời gian cuối ngày
        slotMatch.scheduledAt.$lte = new Date(`${filters.endDate}T23:59:59.999Z`);
      }
    }

    // Match filter cho metrics (tương ứng với các slot khớp bộ lọc)
    const metricMatch: any = { companyCode };
    if (filters.campaignId) {
      metricMatch.campaignId = new Types.ObjectId(filters.campaignId);
    }
    if (filters.platform) {
      metricMatch.platform = filters.platform;
    }

    // Nếu lọc theo thời gian của slot, ta cần lấy danh sách slotId khớp trước
    if (filters.startDate || filters.endDate) {
      const matchingSlotIds = await MarketingCampaignSlotModel.find(slotMatch)
        .select("_id")
        .lean();
      metricMatch.slotId = { $in: matchingSlotIds.map((s) => s._id) };
    }

    // 2. Query song song các pipelines
    const [
      overview,
      platformMetrics,
      byPlatform,
      byDate,
      qualityScores,
      byPillar,
      topErrors,
      campaigns,
    ] = await Promise.all([
      // Aggregation 1: Tổng quan slot (Total, Published, Failed, AI Cost)
      MarketingCampaignSlotModel.aggregate([
        { $match: slotMatch },
        {
          $group: {
            _id: null,
            totalSlots: { $sum: 1 },
            publishedSlots: {
              $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
            },
            failedSlots: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
            },
            pendingApprovalSlots: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [
                        "draft",
                        "generating",
                        "researching",
                        "writing",
                        "scoring",
                        "generating_media",
                        "verifying",
                        "pending_approval",
                        "ready_to_publish",
                        "publishing",
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalAiCost: {
              $sum: {
                $add: [
                  { $ifNull: ["$researchAnalysis.cost", 0] },
                  { $ifNull: ["$visualAnalysis.cost", 0] },
                ],
              },
            },
            totalAttempts: { $sum: "$attemptCount" },
          },
        },
      ]),

      // Aggregation 2: Tổng hợp metrics thực tế từ nền tảng
      SocialPostMetricModel.aggregate([
        { $match: metricMatch },
        {
          $group: {
            _id: null,
            totalLikes: { $sum: "$likes" },
            totalComments: { $sum: "$comments" },
            totalShares: { $sum: "$shares" },
            totalViews: { $sum: "$views" },
            totalReach: { $sum: "$reach" },
            totalImpressions: { $sum: "$impressions" },
            totalClicks: { $sum: "$clicks" },
          },
        },
      ]),

      // Aggregation 3: Thống kê theo Kênh (Platform)
      MarketingCampaignSlotModel.aggregate([
        { $match: slotMatch },
        {
          $group: {
            _id: "$platform",
            total: { $sum: 1 },
            published: {
              $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
            },
            failed: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
            },
          },
        },
        {
          $lookup: {
            from: "socialpostmetrics",
            let: { platformName: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$platform", "$$platformName"] },
                      { $eq: ["$companyCode", companyCode] },
                      ...(metricMatch.campaignId
                        ? [{ $eq: ["$campaignId", metricMatch.campaignId] }]
                        : []),
                      ...(metricMatch.slotId
                        ? [{ $in: ["$slotId", metricMatch.slotId.$in] }]
                        : []),
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  likes: { $sum: "$likes" },
                  comments: { $sum: "$comments" },
                  shares: { $sum: "$shares" },
                  views: { $sum: "$views" },
                  reach: { $sum: "$reach" },
                },
              },
            ],
            as: "m",
          },
        },
        {
          $project: {
            platform: "$_id",
            total: 1,
            published: 1,
            failed: 1,
            likes: { $ifNull: [{ $arrayElemAt: ["$m.likes", 0] }, 0] },
            comments: { $ifNull: [{ $arrayElemAt: ["$m.comments", 0] }, 0] },
            shares: { $ifNull: [{ $arrayElemAt: ["$m.shares", 0] }, 0] },
            views: { $ifNull: [{ $arrayElemAt: ["$m.views", 0] }, 0] },
            reach: { $ifNull: [{ $arrayElemAt: ["$m.reach", 0] }, 0] },
          },
        },
      ]),

      // Aggregation 4: Thống kê theo ngày (Time series)
      MarketingCampaignSlotModel.aggregate([
        { $match: slotMatch },
        {
          $project: {
            dateStr: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$scheduledAt",
                timezone: "Asia/Ho_Chi_Minh",
              },
            },
            status: 1,
            slotId: "$_id",
          },
        },
        {
          $group: {
            _id: "$dateStr",
            planned: { $sum: 1 },
            published: {
              $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
            },
            failed: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
            },
            slotIds: { $push: "$slotId" },
          },
        },
        { $sort: { _id: 1 } },
        {
          $lookup: {
            from: "socialpostmetrics",
            let: { ids: "$slotIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$slotId", "$$ids"] },
                },
              },
              {
                $group: {
                  _id: null,
                  likes: { $sum: "$likes" },
                  views: { $sum: "$views" },
                },
              },
            ],
            as: "m",
          },
        },
        {
          $project: {
            date: "$_id",
            planned: 1,
            published: 1,
            failed: 1,
            likes: { $ifNull: [{ $arrayElemAt: ["$m.likes", 0] }, 0] },
            views: { $ifNull: [{ $arrayElemAt: ["$m.views", 0] }, 0] },
          },
        },
      ]),

      // Aggregation 5: Điểm chất lượng AI (chỉ lấy từ các candidates được chọn)
      MarketingCampaignSlotModel.aggregate([
        {
          $match: {
            ...slotMatch,
            selectedCandidateId: { $exists: true, $ne: null },
          },
        },
        {
          $lookup: {
            from: "marketingcandidates",
            localField: "selectedCandidateId",
            foreignField: "_id",
            as: "c",
          },
        },
        { $unwind: "$c" },
        {
          $group: {
            _id: null,
            avgScore: { $avg: "$c.score" },
            fidelity: { $avg: "$c.scoreDetails.fidelity" },
            objective: { $avg: "$c.scoreDetails.objective" },
            platform: { $avg: "$c.scoreDetails.platform" },
            hook: { $avg: "$c.scoreDetails.hook" },
            conversion: { $avg: "$c.scoreDetails.conversion" },
            readability: { $avg: "$c.scoreDetails.readability" },
            novelty: { $avg: "$c.scoreDetails.novelty" },
          },
        },
      ]),

      // Aggregation 6: Thống kê theo Content Pillar
      MarketingCampaignSlotModel.aggregate([
        { $match: slotMatch },
        {
          $group: {
            _id: "$pillar",
            total: { $sum: 1 },
            published: {
              $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
            },
            cost: {
              $sum: {
                $add: [
                  { $ifNull: ["$researchAnalysis.cost", 0] },
                  { $ifNull: ["$visualAnalysis.cost", 0] },
                ],
              },
            },
            slotIds: { $push: "$_id" },
          },
        },
        {
          $lookup: {
            from: "socialpostmetrics",
            let: { ids: "$slotIds" },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ["$slotId", "$$ids"] },
                },
              },
              {
                $group: {
                  _id: null,
                  likes: { $sum: "$likes" },
                  views: { $sum: "$views" },
                },
              },
            ],
            as: "m",
          },
        },
        {
          $project: {
            pillar: { $cond: [{ $eq: ["$_id", ""] }, "Khác", "$_id"] },
            total: 1,
            published: 1,
            avgCost: { $cond: [{ $gt: ["$total", 0] }, { $divide: ["$cost", "$total"] }, 0] },
            likes: { $ifNull: [{ $arrayElemAt: ["$m.likes", 0] }, 0] },
            views: { $ifNull: [{ $arrayElemAt: ["$m.views", 0] }, 0] },
          },
        },
      ]),

      // Aggregation 7: Top lỗi đăng bài
      MarketingCampaignSlotModel.aggregate([
        {
          $match: {
            ...slotMatch,
            lastError: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              type: "$lastError.type",
              message: "$lastError.message",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $project: {
            errorType: "$_id.type",
            message: "$_id.message",
            count: 1,
            _id: 0,
          },
        },
      ]),

      // Aggregation 8: Danh sách chiến dịch để đổ vào Dropdown bộ lọc
      MarketingCampaignModel.find({ companyCode })
        .select("_id title status startDate endDate")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // 3. Chuẩn hóa dữ liệu trả về
    const ov = overview[0] || {
      totalSlots: 0,
      publishedSlots: 0,
      failedSlots: 0,
      pendingApprovalSlots: 0,
      totalAiCost: 0,
      totalAttempts: 0,
    };

    const pm = platformMetrics[0] || {
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalViews: 0,
      totalReach: 0,
      totalImpressions: 0,
      totalClicks: 0,
    };

    const qs = qualityScores[0] || {
      avgScore: 0,
      fidelity: 0,
      objective: 0,
      platform: 0,
      hook: 0,
      conversion: 0,
      readability: 0,
      novelty: 0,
    };

    const successRate =
      ov.totalSlots > 0 ? Math.round((ov.publishedSlots / ov.totalSlots) * 100) : 0;

    const avgAttemptCount =
      ov.totalSlots > 0 ? parseFloat((ov.totalAttempts / ov.totalSlots).toFixed(2)) : 0;

    const avgEngagementPerPost =
      ov.publishedSlots > 0
        ? parseFloat(
            ((pm.totalLikes + pm.totalComments + pm.totalShares) / ov.publishedSlots).toFixed(2)
          )
        : 0;

    return {
      overview: {
        totalSlots: ov.totalSlots,
        publishedSlots: ov.publishedSlots,
        failedSlots: ov.failedSlots,
        pendingApprovalSlots: ov.pendingApprovalSlots,
        successRate,
        totalAiCost: parseFloat(ov.totalAiCost.toFixed(4)),
        avgAttemptCount,
      },
      platformMetrics: {
        totalLikes: pm.totalLikes,
        totalComments: pm.comments || pm.totalComments, // fallback check
        totalShares: pm.shares || pm.totalShares,
        totalViews: pm.totalViews,
        totalReach: pm.totalReach,
        totalImpressions: pm.totalImpressions,
        totalClicks: pm.totalClicks,
        avgEngagementPerPost,
      },
      byPlatform,
      byDate,
      qualityScores: {
        avgScore: Math.round(qs.avgScore),
        byDimension: {
          fidelity: Math.round(qs.fidelity || 0),
          objective: Math.round(qs.objective || 0),
          platform: Math.round(qs.platform || 0),
          hook: Math.round(qs.hook || 0),
          conversion: Math.round(qs.conversion || 0),
          readability: Math.round(qs.readability || 0),
          novelty: Math.round(qs.novelty || 0),
        },
      },
      byPillar,
      topErrors,
      campaigns,
    };
  }
}
