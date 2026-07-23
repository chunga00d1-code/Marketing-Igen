import { getAccessToken } from './authService';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface MarketingCampaignSummary {
  _id: string;
  title: string;
  sourceBrief: string;
  campaignType?: 'single' | 'campaign';
  status: CampaignStatus;
  timezone: string;
  startDate: string;
  endDate: string;
  postsPerDay: number;
  postingTimes: string[];
  platforms: Array<'Facebook' | 'TikTok'>;
  candidateCount: number;
  contentPillars: string[];
  publishMode?: 'auto' | 'manual';
  researchReport?: string;
  contentMatrix?: Array<{
    pillar: string;
    direction: string;
    targetPercentage: number;
    angles: Array<{
      title: string;
      funnel: 'TOFU' | 'MOFU' | 'BOFU';
    }>;
  }>;
  statistics: {
    totalSlots: number;
    publishedSlots: number;
    failedSlots: number;
    estimatedCost?: number;
    actualCost?: number;
  };
  companyCode?: string;
  createdAt: string;
}

export interface CampaignSlot {
  _id: string;
  pillar: string;
  objective?: string;
  topicBrief: string;
  funnelStage?: 'TOFU' | 'MOFU' | 'BOFU';
  scheduledAt: string;
  status: string;
  variant?: string;
  errorMessage?: string;
  publishedPostUrl?: string;
  platform?: string;
  approvedBy?: string;
  approvedAt?: string;
  marketingContentId?: string;
  ingestedMedia?: Array<{ sourceUrl: string; url: string; uploadedAt: string }>;
  researchAnalysis?: {
    fingerprint: string;
    context: string;
    model: string;
    researchedAt: string;
    cost: number;
    evidence: Array<{
      source: 'google' | 'facebook' | 'tiktok';
      sourceUrl: string;
      title?: string;
      text: string;
      author?: string;
      publishedAt?: string;
      collectedAt: string;
      metrics?: { views?: number; likes?: number; comments?: number; shares?: number };
    }>;
    apifyRuns: Array<{
      source: 'google' | 'facebook' | 'tiktok';
      actorId: string;
      runId?: string;
      datasetId?: string;
      status: 'succeeded' | 'failed' | 'skipped';
      itemCount: number;
      estimatedCostUsd: number;
      providerCostUsd: number;
      billingMode: 'shadow' | 'live';
      executedAt: string;
      error?: string;
    }>;
    providerCostUsd: number;
    billingMode: 'shadow' | 'live';
    billedAt?: string;
  };
  visualAnalysis?: {
    fingerprint: string;
    sourceUrls: string[];
    summary: string;
    subjects: string[];
    visibleText: string[];
    setting: string;
    visualStyle: string;
    mood: string;
    factualDetails: string[];
    marketingAngles: string[];
    cautions: string[];
    model: string;
    analyzedAt: string;
    cost: number;
    billedAt?: string;
  };
  lastError?: {
    type: string;
    message: string;
    occurredAt: string;
  };
  content?: MarketingContent | null;
}

export interface MarketingContent {
  _id: string;
  title?: string;
  bodyText?: string;
  outline?: string;
  mediaPrompt?: string;
  mediaUrls?: string[];
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: 'text' | 'image' | 'video';
}

export interface MarketingCampaignCalendarSlot {
  _id: string;
  campaignId: string;
  campaignTitle: string;
  campaignType: 'single' | 'campaign';
  scheduledAt: string;
  platform: 'Facebook' | 'TikTok';
  status: string;
  mediaType: 'text' | 'image' | 'video' | 'human-video';
  topicBrief: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken()}`,
      ...options?.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Không thể xử lý chiến dịch.');
  return result.data as T;
}

export const marketingCampaignService = {
  list(page: number = 1, limit: number = 10) {
    return request<{ campaigns: MarketingCampaignSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/v1/marketing-campaigns?page=${page}&limit=${limit}`
    );
  },

  calendar(startDate: string, endDate: string) {
    const query = new URLSearchParams({ startDate, endDate });
    return request<{ timezone: string; slots: MarketingCampaignCalendarSlot[] }>(
      `/api/v1/marketing-campaigns/calendar?${query.toString()}`
    );
  },

  create(input: {
    sourceBrief: string;
    campaignType?: 'single' | 'campaign';
    startDate: string;
    endDate: string;
    postsPerDay: number;
    postingTimes: string[];
    timezone: string;
    platforms: Array<'Facebook' | 'TikTok'>;
    integrationIds: Partial<Record<'Facebook' | 'TikTok', string>>;
    candidateCount: number;
    qualityMode?: 'premium' | 'budget';
    publishMode?: 'auto' | 'manual';
    imageMode?: 'ai' | 'real';
    publishNow?: boolean;
    googleDriveFolderUrl?: string;
    mediaPolicy: 'text' | 'image' | 'video' | 'auto';
    images?: string[];
    customSchedule?: Record<string, string[]>;
    apifySources?: string[];
  }) {
    return request<{ campaign: MarketingCampaignSummary }>('/api/v1/marketing-campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  detail(id: string) {
    return request<{ campaign: MarketingCampaignSummary; slots: unknown[] }>(`/api/v1/marketing-campaigns/${id}`);
  },

  lifecycle(id: string, action: 'pause' | 'resume' | 'cancel') {
    return request<MarketingCampaignSummary>(`/api/v1/marketing-campaigns/${id}/${action}`, { method: 'POST' });
  },

  retrySlot(campaignId: string, slotId: string) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/retry`, { method: 'POST' });
  },

  retryAllSlots(campaignId: string) {
    return request<{ retriedCount: number }>(`/api/v1/marketing-campaigns/${campaignId}/retry-all`, { method: 'POST' });
  },

  approveSlot(campaignId: string, slotId: string) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/approve`, { method: 'POST' });
  },

  publishNowSlot(campaignId: string, slotId: string) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/publish-now`, { method: 'POST' });
  },

  updateSlotContent(campaignId: string, slotId: string, updates: { title?: string; bodyText?: string; outline?: string; mediaPrompt?: string }) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/content`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  replaceSlotImage(campaignId: string, slotId: string, imageBase64OrUrl: string) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/replace-image`, {
      method: 'POST',
      body: JSON.stringify({ image: imageBase64OrUrl }),
    });
  },

  getShareLink(campaignId: string, slotId: string) {
    return request<{ shareLink: string }>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/share-link`);
  },

  rejectSlot(campaignId: string, slotId: string, reason: string) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getPublicSlot(token: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/slots/${token}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể lấy chi tiết bài viết.');
    return result.data as { slot: CampaignSlot; content: MarketingContent | null; campaign: MarketingCampaignSummary };
  },

  async publicSlotAction(token: string, action: 'approve' | 'reject', reason?: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/slots/${token}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể xử lý phê duyệt bài viết.');
    return result.data;
  },

  getDailyShareLink(campaignId: string, date: string) {
    return request<{ shareLink: string }>(`/api/v1/marketing-campaigns/${campaignId}/dates/${date}/share-link`);
  },

  async getPublicDailySlots(token: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/dates/${token}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể lấy danh sách bài viết theo ngày.');
    return result.data as { campaign: MarketingCampaignSummary; slots: (CampaignSlot & { content: MarketingContent | null })[]; date: string };
  },

  async publicDailySlotAction(token: string, slotId: string, action: 'approve' | 'reject', reason?: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/dates/${token}/slots/${slotId}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể xử lý phê duyệt bài viết.');
    return result.data;
  },

  async updatePublicDailySlotContent(token: string, slotId: string, updates: { title?: string; bodyText?: string }) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/dates/${token}/slots/${slotId}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể lưu chỉnh sửa bài viết.');
    return result.data as { slot: CampaignSlot; content: MarketingContent | null };
  },

  getMonthlyShareLink(campaignId: string, startDate: string, endDate: string) {
    return request<{ shareLink: string }>(`/api/v1/marketing-campaigns/${campaignId}/monthly/${startDate}/${endDate}/share-link`);
  },

  async getPublicMonthlySlots(token: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/monthly/${token}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể lấy danh sách bài viết theo tháng.');
    return result.data as { campaign: MarketingCampaignSummary; slots: (CampaignSlot & { content: MarketingContent | null })[]; startDate: string; endDate: string };
  },

  async publicMonthlySlotAction(token: string, slotId: string, action: 'approve' | 'reject', reason?: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/monthly/${token}/slots/${slotId}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể xử lý phê duyệt bài viết.');
    return result.data;
  },

  async publicMonthlyBulkAction(token: string, slotIds: string[], action: 'approve' | 'reject', reason?: string) {
    const response = await fetch(`/api/v1/marketing-campaigns/public/monthly/${token}/bulk-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slotIds, action, reason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Không thể xử lý phê duyệt hàng loạt bài viết.');
    return result.data;
  },

  batchPrepare(campaignId: string, startDate: string, endDate: string) {
    return request<{ enqueued: number; skipped: number }>(`/api/v1/marketing-campaigns/${campaignId}/batch-prepare`, {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate }),
    });
  },

  previewDrive(googleDriveFolderUrl: string) {
    return request<DriveFileItem[]>('/api/v1/marketing-campaigns/preview-drive', {
      method: 'POST',
      body: JSON.stringify({ googleDriveFolderUrl }),
    });
  },
};

export interface DriveFileItem {
  id: string;
  name: string;
  directUrl: string;
  isVideo: boolean;
}
