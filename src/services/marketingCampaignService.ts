import { getAccessToken } from './authService';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

export type TikTokCampaignPublishOptions = {
  caption: string;
  privacyLevel: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  brandContentToggle: boolean;
  brandContent: boolean;
  brandOrganic: boolean;
  isAigc: boolean;
  videoDurationSeconds: number;
  consentAccepted: boolean;
};

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
  preparationMode?: 'monthly';
  monthlyPreparationLeadDays?: number;
  preparationScheduleVersion?: number;
  contentPillars: string[];
  publishMode?: 'auto' | 'manual';
  captionMode?: 'none' | 'speech' | 'context' | 'combined';
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
  integrationId?: string;
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

export type CampaignSheetDataType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'media_url'
  | 'boolean';

export interface CampaignSheetColumn {
  id: string;
  key: string;
  label: string;
  kind: 'system' | 'custom';
  dataType: CampaignSheetDataType;
  systemField?: string;
  required: boolean;
  archived: boolean;
  options?: string[];
  fieldPolicy: 'input' | 'constraint' | 'approved_override' | 'note';
  ai: {
    enabled: boolean;
    instruction?: string;
    allowedSources: Array<'row' | 'campaign' | 'knowledge'>;
    sensitiveBusinessField: boolean;
    knowledgeDocumentTypes?: string[];
  };
  display: {
    order: number;
    width?: number;
    hidden?: boolean;
    frozen?: boolean;
  };
}

export interface CampaignSheetField {
  key: string;
  value: unknown;
  source: 'system' | 'user' | 'ai' | 'knowledge' | 'import';
  locked: boolean;
  updatedBy: string;
  updatedAt: string;
  generationId?: string;
  references?: Array<{
    kind: 'campaign' | 'slot' | 'knowledge_document' | 'knowledge_chunk';
    id: string;
    title?: string;
    version?: string;
    excerpt?: string;
  }>;
}

export interface CampaignSheetRow {
  slotId: string;
  revision: number;
  readOnly: boolean;
  system: Record<string, unknown>;
  fields: Record<string, CampaignSheetField>;
  updatedAt: string;
}

export interface CampaignSheetData {
  campaign: {
    id: string;
    title: string;
    timezone: string;
    status: CampaignStatus;
    startDate: string;
    endDate: string;
    platforms: Array<'Facebook' | 'TikTok'>;
  };
  config: {
    id: string;
    revision: number;
    columns: CampaignSheetColumn[];
  };
  limits: {
    maxCustomColumns: number;
    maxRows: number;
    maxAiRows: number;
    maxBulkCells: number;
  };
  rows: CampaignSheetRow[];
}

export interface CampaignSheetAIJob {
  _id: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  conflictedItems: number;
  progress: number;
  estimatedCost: number;
  actualCost: number;
  errorMessage?: string;
  proposals: Array<{
    slotId: string;
    expectedRevision: number;
    fields: Array<{
      key: string;
      value: unknown;
      confidence: number;
      references: CampaignSheetField['references'];
      warning?: string;
    }>;
    warnings: string[];
    status: string;
  }>;
}

export interface CampaignSheetRevision {
  _id: string;
  actorType: 'user' | 'ai';
  actorId: string;
  operation: string;
  baseRevision: number;
  changes: Array<{
    slotId: string;
    fieldKey: string;
    before?: unknown;
    after?: unknown;
  }>;
  createdAt: string;
}

export type CampaignAssetOrderFormat = 'image' | 'video' | 'image_video';
export type CampaignAssetOrderStatus = 'draft' | 'needs_assets' | 'ready' | 'bulk_queued' | 'completed' | 'cancelled';
export type CampaignAssetSource = 'manual' | 'sheet' | 'drive' | 'upload';
export type CampaignAssetRole = 'primary' | 'secondary' | 'logo' | 'video' | 'other';

export interface CampaignAssetOrderAsset {
  role: CampaignAssetRole;
  sourceUrl: string;
  originalName?: string;
  source: CampaignAssetSource;
  order: number;
}

export interface CampaignAssetOrder {
  _id: string;
  campaignId: string;
  slotId?: string;
  title: string;
  contentGroup?: string;
  shootingContent?: string;
  productionRequirements?: string;
  quantitySuggestion?: string;
  usageChannels?: 'Facebook';
  source: CampaignAssetSource;
  format: CampaignAssetOrderFormat;
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9';
  templateId?: string;
  headline: string;
  subheadline?: string;
  cta?: string;
  visualBrief?: string;
  videoScript?: string;
  assets: CampaignAssetOrderAsset[];
  customFields?: Record<string, string>;
  manualFieldKeys?: string[];
  status: CampaignAssetOrderStatus;
  revision: number;
  bulkJobId?: string;
  outputUrls: string[];
  aiProposal?: {
    idempotencyKey: string;
    generationJobId?: string;
    modelName?: string;
    contentGroup?: string;
    shootingContent?: string;
    productionRequirements?: string;
    quantitySuggestion?: string;
    usageChannels?: 'Facebook';
    format?: CampaignAssetOrderFormat;
    headline: string;
    subheadline?: string;
    cta?: string;
    visualBrief?: string;
    videoScript?: string;
    references: Array<{
      kind: 'campaign' | 'slot' | 'knowledge_document' | 'knowledge_chunk';
      id: string;
      title?: string;
      excerpt?: string;
    }>;
    warnings: string[];
    createdAt: string;
    appliedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  slot?: {
    _id: string;
    topicBrief: string;
    pillar: string;
    platform: string;
    status: string;
    scheduledAt: string;
    mediaType: string;
  };
}

export interface CampaignAssetOrderAIJob {
  _id: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';
  totalItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  conflictedItems: number;
  progress: number;
  estimatedCost: number;
  actualCost: number;
  errorMessage?: string;
  results: Array<{
    orderId: string;
    expectedRevision: number;
    updatedFields: string[];
    warnings: string[];
    status: 'applied' | 'skipped' | 'conflict' | 'failed';
  }>;
}

export interface CampaignAssetOrderBulkImport {
  sourceName: string;
  campaign: CampaignAssetOrderData['campaign'];
  columns: Array<{
    key: string;
    label: string;
    type: 'text' | 'image';
    samples: string[];
  }>;
  rows: Array<{
    id: string;
    selected: boolean;
    cells: Record<string, string>;
  }>;
  skipped: Array<{ orderId: string; reason: string }>;
  missingPrimaryAssetCount: number;
  maxBulkRows: number;
}

export interface CampaignAssetOrderData {
  campaign: { id: string; title: string; timezone: string; platforms: Array<'Facebook' | 'TikTok'> };
  slots: Array<{
    _id: string;
    topicBrief: string;
    pillar: string;
    platform: string;
    status: string;
    scheduledAt: string;
    mediaType: string;
    page: string;
  }>;
  customFieldColumns: Array<{ key: string; label: string }>;
  orders: CampaignAssetOrder[];
}

export interface CampaignDriveImportPreview {
  totalOrders: number;
  totalFiles: number;
  mappedOrders: number;
  missingOrders: Array<{
    orderId: string;
    slotId: string;
    title: string;
    scheduledAt: string;
    position: number;
  }>;
  unmatchedFiles: DriveFileItem[];
  mappings: Array<{
    orderId: string;
    slotId: string;
    title: string;
    scheduledAt: string;
    position: number;
    files: DriveFileItem[];
  }>;
  appliedOrders?: number;
  queuedSlots?: number;
}

export interface CampaignAssetOrderBulkPreview {
  orderId: string;
  template: { _id: string; name: string; canvas: { width: number; height: number } };
  values: Record<string, string>;
  mapping: Array<{ layerId: string; fieldName: string; source: string; value: string }>;
  missing: Array<{ layerId: string; fieldName: string; type: 'text' | 'image' }>;
  ready: boolean;
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
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
        ...options?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI xử lý quá lâu. Hãy kiểm tra lại trạng thái campaign trước khi thử lại.');
    }
    throw error;
  }
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
    imageMode?: 'ai' | 'real' | 'order';
    publishNow?: boolean;
    initialVideoUrl?: string;
    googleDriveFolderUrl?: string;
    mediaPolicy: 'text' | 'image' | 'video' | 'auto';
    captionMode?: 'none' | 'speech' | 'context' | 'combined';
    images?: string[];
    customSchedule?: Record<string, string[]>;
    apifySources?: string[];
  }) {
    return request<{
      campaign: MarketingCampaignSummary;
      preparation: { enqueued: number; deferred: number };
    }>('/api/v1/marketing-campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(240_000),
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

  approveSlot(campaignId: string, slotId: string, tiktokPublishOptions?: TikTokCampaignPublishOptions) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/approve`, {
      method: 'POST',
      body: JSON.stringify(tiktokPublishOptions ? { tiktokPublishOptions } : {}),
    });
  },

  publishNowSlot(campaignId: string, slotId: string, tiktokPublishOptions?: TikTokCampaignPublishOptions) {
    return request<unknown>(`/api/v1/marketing-campaigns/${campaignId}/slots/${slotId}/publish-now`, {
      method: 'POST',
      body: JSON.stringify(tiktokPublishOptions ? { tiktokPublishOptions } : {}),
    });
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

  getSheet(campaignId: string) {
    return request<CampaignSheetData>(`/api/v1/marketing-campaigns/${campaignId}/sheet`);
  },

  getAssetOrders(campaignId: string) {
    return request<CampaignAssetOrderData>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders`);
  },

  previewAssetOrderDriveImport(campaignId: string, googleDriveFolderUrl: string) {
    return request<CampaignDriveImportPreview>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/drive-import/preview`, {
      method: 'POST',
      body: JSON.stringify({ googleDriveFolderUrl }),
    });
  },

  applyAssetOrderDriveImport(campaignId: string, googleDriveFolderUrl: string) {
    return request<CampaignDriveImportPreview>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/drive-import/apply`, {
      method: 'POST',
      body: JSON.stringify({ googleDriveFolderUrl }),
    });
  },

  createAssetOrder(campaignId: string, input: {
    slotId?: string;
    title?: string;
    contentGroup?: string;
    shootingContent?: string;
    productionRequirements?: string;
    quantitySuggestion?: string;
    usageChannels?: 'Facebook';
    source?: CampaignAssetSource;
    format?: CampaignAssetOrderFormat;
    aspectRatio?: CampaignAssetOrder['aspectRatio'];
    templateId?: string;
    headline?: string;
    subheadline?: string;
    cta?: string;
    visualBrief?: string;
    videoScript?: string;
    assets?: CampaignAssetOrderAsset[];
    customFields?: Record<string, string>;
  }) {
    return request<CampaignAssetOrder>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateAssetOrder(campaignId: string, orderId: string, input: {
    expectedRevision: number;
    slotId?: string;
    title?: string;
    contentGroup?: string;
    shootingContent?: string;
    productionRequirements?: string;
    quantitySuggestion?: string;
    usageChannels?: 'Facebook';
    source?: CampaignAssetSource;
    format?: CampaignAssetOrderFormat;
    aspectRatio?: CampaignAssetOrder['aspectRatio'];
    templateId?: string;
    headline?: string;
    subheadline?: string;
    cta?: string;
    visualBrief?: string;
    videoScript?: string;
    assets?: CampaignAssetOrderAsset[];
    customFields?: Record<string, string>;
  }) {
    return request<CampaignAssetOrder>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  archiveAssetOrder(campaignId: string, orderId: string) {
    return request<CampaignAssetOrder>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}`, {
      method: 'DELETE',
    });
  },

  previewAssetOrderAI(campaignId: string, orderId: string, input: { idempotencyKey: string; instruction?: string }) {
    return request<CampaignAssetOrder>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}/ai/preview`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  addAssetOrderCustomField(campaignId: string, label: string) {
    return request<{ key: string; label: string }>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/custom-fields`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  },

  archiveAssetOrderCustomField(campaignId: string, fieldKey: string) {
    return request<{ key: string; archived: boolean }>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/custom-fields/${fieldKey}`, {
      method: 'DELETE',
    });
  },

  fillAllAssetOrdersAI(campaignId: string, input: { idempotencyKey: string; instruction?: string; overwritePolicy?: 'empty_only' | 'replace_ai' }) {
    return request<CampaignAssetOrderAIJob>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/ai/fill-all`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getFillAllAssetOrdersAIJob(campaignId: string, jobId: string) {
    return request<CampaignAssetOrderAIJob>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/ai/jobs/${jobId}`);
  },

  cancelFillAllAssetOrdersAIJob(campaignId: string, jobId: string) {
    return request<CampaignAssetOrderAIJob>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/ai/jobs/${jobId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  exportAssetOrdersForBulk(campaignId: string) {
    return request<CampaignAssetOrderBulkImport>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/bulk-import`);
  },

  syncAssetOrdersFromBulkImport(campaignId: string, jobId: string) {
    return request<{ updatedCount: number; unmatchedOrderIds: string[]; jobStatus: string }>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/bulk-import/sync`, {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  },

  applyAssetOrderAI(campaignId: string, orderId: string, input: {
    expectedRevision: number;
    fieldKeys?: Array<
      | 'contentGroup'
      | 'shootingContent'
      | 'productionRequirements'
      | 'quantitySuggestion'
      | 'usageChannels'
      | 'format'
      | 'headline'
      | 'subheadline'
      | 'cta'
      | 'visualBrief'
      | 'videoScript'
    >;
  }) {
    return request<CampaignAssetOrder>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}/ai/apply`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  previewAssetOrderBulk(campaignId: string, orderId: string, templateId: string) {
    return request<CampaignAssetOrderBulkPreview>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}/bulk/preview`, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
  },

  createAssetOrderBulk(campaignId: string, orderId: string, input: { templateId: string; idempotencyKey: string }) {
    return request<{ order: CampaignAssetOrder; job: { _id: string; status: string } }>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}/bulk`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  syncAssetOrderBulk(campaignId: string, orderId: string) {
    return request<CampaignAssetOrder>(`/api/v1/marketing-campaigns/${campaignId}/asset-orders/${orderId}/bulk/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  addSheetColumn(campaignId: string, input: {
    label: string;
    key?: string;
    dataType: CampaignSheetDataType;
    required?: boolean;
    options?: string[];
    fieldPolicy?: CampaignSheetColumn['fieldPolicy'];
    ai?: Partial<CampaignSheetColumn['ai']>;
  }) {
    return request<CampaignSheetData['config']>(`/api/v1/marketing-campaigns/${campaignId}/sheet/columns`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  addSheetRow(campaignId: string, input: {
    date: string;
    time: string;
    platform: 'Facebook' | 'TikTok';
    pillar?: string;
    objective: string;
    topicBrief: string;
    funnelStage?: 'TOFU' | 'MOFU' | 'BOFU';
    mediaType: 'text' | 'image' | 'video' | 'human-video';
  }) {
    return request<CampaignSlot>(`/api/v1/marketing-campaigns/${campaignId}/sheet/rows`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateSheetColumn(campaignId: string, columnId: string, input: Partial<CampaignSheetColumn>) {
    return request<CampaignSheetData['config']>(`/api/v1/marketing-campaigns/${campaignId}/sheet/columns/${encodeURIComponent(columnId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  archiveSheetColumn(campaignId: string, columnId: string) {
    return request<CampaignSheetData['config']>(`/api/v1/marketing-campaigns/${campaignId}/sheet/columns/${encodeURIComponent(columnId)}`, {
      method: 'DELETE',
    });
  },

  updateSheetRow(campaignId: string, slotId: string, input: {
    expectedRevision: number;
    changes: Array<{ key: string; value?: unknown; locked?: boolean }>;
  }) {
    return request<{
      slotId: string;
      revision: number;
      system: Record<string, unknown>;
      fields: Record<string, CampaignSheetField>;
    }>(`/api/v1/marketing-campaigns/${campaignId}/sheet/rows/${slotId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  updateSheetCells(campaignId: string, input: {
    rows: Array<{
      slotId: string;
      expectedRevision: number;
      changes: Array<{ key: string; value?: unknown; locked?: boolean }>;
    }>;
  }) {
    return request<{
      results: Array<{
        slotId: string;
        revision: number;
        system: Record<string, unknown>;
        fields: Record<string, CampaignSheetField>;
      }>;
      conflicts: Array<{ slotId: string; code?: string; message: string }>;
      updatedCells: number;
    }>(`/api/v1/marketing-campaigns/${campaignId}/sheet/cells`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  previewSheetAI(campaignId: string, input: {
    slotId: string;
    targetFieldKeys: string[];
    expectedRevision: number;
    overwritePolicy?: 'empty_only' | 'suggest_only' | 'replace_selected';
    instruction?: string;
    idempotencyKey: string;
  }) {
    return request<CampaignSheetAIJob>(`/api/v1/marketing-campaigns/${campaignId}/sheet/ai/preview`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  applySheetAI(campaignId: string, jobId: string, fieldKeys?: string[]) {
    return request<{ job: CampaignSheetAIJob; applied: number; conflicted: number }>(
      `/api/v1/marketing-campaigns/${campaignId}/sheet/ai/jobs/${jobId}/apply`,
      {
        method: 'POST',
        body: JSON.stringify({ fieldKeys }),
      }
    );
  },

  createSheetAIJob(campaignId: string, input: {
    slotIds: string[];
    targetFieldKeys: string[];
    overwritePolicy?: 'empty_only' | 'suggest_only' | 'replace_selected';
    idempotencyKey: string;
  }) {
    return request<CampaignSheetAIJob>(`/api/v1/marketing-campaigns/${campaignId}/sheet/ai/jobs`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getSheetAIJob(campaignId: string, jobId: string) {
    return request<CampaignSheetAIJob>(`/api/v1/marketing-campaigns/${campaignId}/sheet/ai/jobs/${jobId}`);
  },

  cancelSheetAIJob(campaignId: string, jobId: string) {
    return request<CampaignSheetAIJob>(`/api/v1/marketing-campaigns/${campaignId}/sheet/ai/jobs/${jobId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  retrySheetAIJob(campaignId: string, jobId: string) {
    return request<CampaignSheetAIJob>(`/api/v1/marketing-campaigns/${campaignId}/sheet/ai/jobs/${jobId}/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  listSheetRevisions(campaignId: string, limit = 50) {
    return request<CampaignSheetRevision[]>(
      `/api/v1/marketing-campaigns/${campaignId}/sheet/revisions?limit=${limit}`
    );
  },

  revertSheetRevision(campaignId: string, revisionId: string) {
    return request<{ revertedRows: number; conflicts: string[] }>(
      `/api/v1/marketing-campaigns/${campaignId}/sheet/revisions/${revisionId}/revert`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  },
};

export interface DriveFileItem {
  id: string;
  name: string;
  directUrl: string;
  isVideo: boolean;
  isMedia?: boolean;
}
