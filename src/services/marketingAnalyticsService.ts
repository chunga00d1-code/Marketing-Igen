import { getAccessToken } from "./authService";

export interface AnalyticsOverview {
  totalSlots: number;
  publishedSlots: number;
  failedSlots: number;
  pendingApprovalSlots: number;
  successRate: number;
  totalAiCost: number;
  avgAttemptCount: number;
}

export interface PlatformMetrics {
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  totalReach: number;
  totalImpressions: number;
  totalClicks: number;
  avgEngagementPerPost: number;
}

export interface PlatformBreakdown {
  platform: string;
  total: number;
  published: number;
  failed: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  reach: number;
}

export interface DateMetricPoint {
  date: string;
  planned: number;
  published: number;
  failed: number;
  likes: number;
  views: number;
}

export interface QualityScores {
  avgScore: number;
  byDimension: {
    fidelity: number;
    objective: number;
    platform: number;
    hook: number;
    conversion: number;
    readability: number;
    novelty: number;
  };
}

export interface PillarBreakdown {
  pillar: string;
  total: number;
  published: number;
  avgCost: number;
  likes: number;
  views: number;
}

export interface TopErrorItem {
  errorType: string;
  message: string;
  count: number;
}

export interface CampaignListItem {
  _id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface PostMetricItem {
  _id: string;
  platform: string;
  postId: string;
  postUrl?: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  reach: number;
  impressions: number;
  clicks: number;
  syncedAt: string;
  slotId?: {
    _id: string;
    topicBrief: string;
    pillar: string;
    scheduledAt: string;
    mediaType: string;
    status: string;
  };
}

export interface AnalyticsResponse {
  overview: AnalyticsOverview;
  platformMetrics: PlatformMetrics;
  byPlatform: PlatformBreakdown[];
  byDate: DateMetricPoint[];
  qualityScores: QualityScores;
  byPillar: PillarBreakdown[];
  topErrors: TopErrorItem[];
  campaigns: CampaignListItem[];
  posts: PostMetricItem[];
}

export const marketingAnalyticsService = {
  async getAnalytics(params: {
    campaignId?: string;
    platform?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<AnalyticsResponse> {
    const queryParts: string[] = [];
    if (params.campaignId) queryParts.push(`campaignId=${encodeURIComponent(params.campaignId)}`);
    if (params.platform) queryParts.push(`platform=${encodeURIComponent(params.platform)}`);
    if (params.startDate) queryParts.push(`startDate=${encodeURIComponent(params.startDate)}`);
    if (params.endDate) queryParts.push(`endDate=${encodeURIComponent(params.endDate)}`);

    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const response = await fetch(`/api/v1/marketing-campaigns/analytics${queryString}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Không thể lấy dữ liệu báo cáo: ${response.status} - ${errText}`);
    }

    const json = await response.json();
    if (json.status !== "success" || !json.data) {
      throw new Error(json.message || "Lỗi dữ liệu từ máy chủ.");
    }

    return json.data as AnalyticsResponse;
  },
};
