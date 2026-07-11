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
  statistics: {
    totalSlots: number;
    publishedSlots: number;
    failedSlots: number;
  };
  createdAt: string;
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
  list() {
    return request<MarketingCampaignSummary[]>('/api/v1/marketing-campaigns');
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
    mediaPolicy: 'text' | 'image' | 'video' | 'auto';
  }) {
    return request<{ campaign: MarketingCampaignSummary }>('/api/v1/marketing-campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  lifecycle(id: string, action: 'pause' | 'resume' | 'cancel') {
    return request<MarketingCampaignSummary>(`/api/v1/marketing-campaigns/${id}/${action}`, { method: 'POST' });
  },
};
