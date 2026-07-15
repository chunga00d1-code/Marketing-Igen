import { getAccessToken } from './authService';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface MarketingCampaignSummary {
  _id: string;
  title: string;
  sourceBrief: string;
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
  statistics: {
    totalSlots: number;
    publishedSlots: number;
    failedSlots: number;
    estimatedCost?: number;
    actualCost?: number;
  };
  createdAt: string;
}

export interface CampaignSlot {
  _id: string;
  pillar: string;
  objective?: string;
  topicBrief: string;
  scheduledAt: string;
  status: string;
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

  create(input: {
    sourceBrief: string;
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
