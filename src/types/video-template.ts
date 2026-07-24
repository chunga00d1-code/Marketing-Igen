export type VideoTemplateScope = 'discover' | 'mine';
export type VideoTemplateOwnerType = 'system' | 'user';
export type VideoTemplateAspectRatio = '9:16' | '1:1' | '16:9' | '3:4';
export type VideoTemplateSlotType = 'video' | 'image' | 'text';

export interface VideoTemplateCategory {
  id: string;
  name: string;
}

export interface VideoTemplateSlot {
  key: string;
  type: VideoTemplateSlotType;
  label: string;
  required: boolean;
  maxLength?: number;
  bindings?: Array<{ timelineItemId: string; property: string }>;
}

export interface CreateVideoTemplateInput {
  title: string;
  description: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  duration: number;
  aspectRatio: VideoTemplateAspectRatio;
  categoryId: string;
  categoryName: string;
  tags: string[];
}

export interface VideoTemplateMutationResult {
  id: string;
  versionId: string;
  status: 'draft' | 'published';
}

export interface ShotstackSyncFailure {
  externalId: string;
  message: string;
}

export interface ShotstackSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  failedCount: number;
  failed: ShotstackSyncFailure[];
}

export type ShotstackSyncState = 'success' | 'partial' | 'failed';

export interface ShotstackSyncStatus {
  configured: boolean;
  environment: 'stage' | 'v1';
  status: ShotstackSyncState | null;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  summary: ShotstackSyncSummary;
}

export interface VideoTemplateSummary {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  duration: number;
  aspectRatio: VideoTemplateAspectRatio;
  category: VideoTemplateCategory;
  tags: string[];
  usageCount: number;
  isFavorite: boolean;
  ownerType: VideoTemplateOwnerType;
  canEdit: boolean;
  badges?: Array<'new' | 'popular' | 'mine'>;
}

export interface VideoTemplateDetail extends VideoTemplateSummary {
  /** Legacy mock/API data; the simple template flow does not expose replacement slots. */
  slots?: VideoTemplateSlot[];
  actions: {
    canUse: boolean;
    canEditTemplate: boolean;
    canArchive: boolean;
  };
}

export interface VideoTemplateFilterParams {
  scope?: VideoTemplateScope;
  category?: string;
  aspectRatio?: 'all' | VideoTemplateAspectRatio;
  duration?: 'all' | 'short' | 'medium' | 'long';
  search?: string;
  sort?: 'popular' | 'newest';
  page?: number;
  limit?: number;
}

export interface VideoTemplatePagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface VideoTemplateListResponse {
  items: VideoTemplateSummary[];
  pagination: VideoTemplatePagination;
}

export interface UseTemplateOptions {
  mode: 'quick' | 'editor';
}

export interface UseTemplateResponse {
  project: {
    id: string;
    sourceTemplateId: string;
    status: 'draft';
    slotValues: Record<string, unknown>;
  };
  nextStep: 'editor';
}

export interface VideoProjectDetail {
  id: string;
  sourceTemplateId?: string;
  sourceTemplateVersionId?: string;
  title: string;
  status: 'draft';
  blueprint?: Record<string, unknown>;
  slotValues?: Record<string, unknown>;
  aspectRatio: VideoTemplateAspectRatio;
  duration: number;
  description?: string;
  categoryId?: string;
  tags?: string[];
  mode: 'edit-project' | 'create-template';
  tracks: Array<{ id: string; type: 'video' | 'text' | 'audio'; name: string }>;
  items: Array<{
    id: string;
    trackId: string;
    type: 'video' | 'image' | 'text' | 'audio';
    start: number;
    duration: number;
    sourceUrl?: string;
    thumbnailUrl?: string;
    text?: string;
    replaceable?: boolean;
    providerBinding?: {
      provider: 'shotstack';
      trackIndex: number;
      clipIndex: number;
      rawTransition?: Record<string, unknown>;
    };
    trim?: number;
    opacity?: number;
    scale?: number;
    style?: {
      fontFamily: string;
      fontSize: number;
      color: string;
      align: 'left' | 'center' | 'right';
      bold: boolean;
      italic: boolean;
      x?: number;
      y?: number;
    };
    volume?: number;
    fitMode?: 'cover' | 'fit';
    rotation?: number;
    label?: string;
    order: number;
  }>;
  coverUrl?: string;
  revision: number;
  updatedAt?: string;
  sourceMediaUrl?: string;
}

export type SaveVideoProjectInput = Omit<
  VideoProjectDetail,
  'id' | 'status' | 'sourceTemplateId' | 'sourceTemplateVersionId' | 'blueprint' | 'slotValues' | 'revision' | 'updatedAt'
>;
