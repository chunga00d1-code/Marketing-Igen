import type { Document, Types } from "mongoose";

export type VideoTemplateScope = "discover" | "mine";
export type VideoTemplateAspectRatio = "9:16" | "1:1" | "16:9" | "3:4";
export type VideoTemplateVisibility = "system" | "tenant" | "private";
export type VideoTemplateStatus = "draft" | "published" | "archived";
export type VideoTemplateSlotType = "video" | "image" | "text";

export interface VideoTemplateSlot {
  key: string;
  type: VideoTemplateSlotType;
  label: string;
  required: boolean;
  maxLength?: number;
  bindings?: Array<{ timelineItemId: string; property: string }>;
}

export interface VideoTemplateProviderBinding {
  provider: "shotstack";
  trackIndex: number;
  clipIndex: number;
  rawTransition?: Record<string, unknown>;
}

export interface VideoTemplateEditorItemProviderFields {
  providerBinding?: VideoTemplateProviderBinding;
  trim?: number;
  opacity?: number;
  scale?: number;
}

export interface IVideoTemplate extends Document {
  systemKey?: string;
  sourceProvider?: "shotstack";
  externalTemplateId?: string;
  providerCreatedAt?: Date;
  providerUpdatedAt?: Date;
  lastSyncedAt?: Date;
  compatibilityWarnings?: string[];
  title: string;
  description: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  duration: number;
  aspectRatio: VideoTemplateAspectRatio;
  categoryId: string;
  categoryName: string;
  tags: string[];
  badges: Array<"new" | "popular" | "mine">;
  usageCount: number;
  visibility: VideoTemplateVisibility;
  status: VideoTemplateStatus;
  ownerUserId?: string;
  companyCode?: string;
  publishedVersionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVideoTemplateVersion extends Document {
  templateId: Types.ObjectId;
  version: number;
  sourceHash?: string;
  sourceEdit?: Record<string, unknown>;
  normalizedEditorState?: Record<string, unknown>;
  compatibilityWarnings?: string[];
  providerUpdatedAt?: Date;
  blueprint: Record<string, unknown>;
  slots: VideoTemplateSlot[];
  defaultValues: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
}

export type VideoTemplateSyncStatus = "success" | "partial" | "failed";

export interface VideoTemplateSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  failed: Array<{ externalId: string; message: string }>;
}

export interface IVideoTemplateSync extends Document {
  provider: "shotstack";
  environment: "stage" | "v1";
  lastAttemptAt: Date;
  lastSuccessAt?: Date;
  status: VideoTemplateSyncStatus;
  summary: VideoTemplateSyncSummary;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVideoProject extends Document {
  userId: string;
  companyCode: string;
  sourceTemplateId?: Types.ObjectId;
  sourceTemplateVersionId?: Types.ObjectId;
  title: string;
  status: "draft";
  blueprint: Record<string, unknown>;
  slotValues: Record<string, unknown>;
  aspectRatio: VideoTemplateAspectRatio;
  sourceMediaUrl?: string;
  editorState: Record<string, unknown>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoTemplateIdentity {
  userId: string;
  companyCode: string;
  role: string;
}

export interface NormalizedVideoTemplateListQuery {
  scope: VideoTemplateScope;
  category: string;
  aspectRatio: "all" | VideoTemplateAspectRatio;
  duration: "all" | "short" | "medium" | "long";
  search: string;
  sort: "popular" | "newest";
  page: number;
  limit: number;
  durationMin?: number;
  durationMax?: number;
}
