import { Document, Types } from "mongoose";

export type CampaignAssetOrderFormat = "image" | "video" | "image_video";
export type CampaignAssetOrderStatus = "draft" | "needs_assets" | "ready" | "bulk_queued" | "completed" | "cancelled";
export type CampaignAssetSource = "manual" | "sheet" | "drive" | "upload";
export type CampaignAssetRole = "primary" | "secondary" | "logo" | "video" | "other";
export type CampaignAssetOrderOverwritePolicy = "empty_only" | "replace_ai";
export type CampaignAssetOrderAIJobStatus = "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled";

export interface ICampaignAssetOrderAsset {
  role: CampaignAssetRole;
  sourceUrl: string;
  originalName?: string;
  source: CampaignAssetSource;
  order: number;
}

export interface ICampaignAssetOrderReference {
  kind: "campaign" | "slot" | "knowledge_document" | "knowledge_chunk";
  id: string;
  title?: string;
  excerpt?: string;
}

export interface ICampaignAssetOrderAiProposal {
  idempotencyKey: string;
  generationJobId?: string;
  modelName?: string;
  contentGroup?: string;
  shootingContent?: string;
  productionRequirements?: string;
  quantitySuggestion?: string;
  usageChannels?: string;
  format?: CampaignAssetOrderFormat;
  headline: string;
  subheadline?: string;
  cta?: string;
  visualBrief?: string;
  videoScript?: string;
  customFields?: Record<string, string>;
  references: ICampaignAssetOrderReference[];
  warnings: string[];
  createdAt: Date;
  appliedAt?: Date;
}

export interface ICampaignAssetOrder extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  slotId?: Types.ObjectId;
  createdBy: string;
  title: string;
  contentGroup?: string;
  shootingContent?: string;
  productionRequirements?: string;
  quantitySuggestion?: string;
  usageChannels?: string;
  source: CampaignAssetSource;
  format: CampaignAssetOrderFormat;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  templateId?: Types.ObjectId;
  headline: string;
  subheadline?: string;
  cta?: string;
  visualBrief?: string;
  videoScript?: string;
  assets: ICampaignAssetOrderAsset[];
  /** Campaign-defined short text values used when mapping this Order into Bulk Create. */
  customFields: Record<string, string>;
  /** Fields explicitly changed by a user and protected from AI fill-all by default. */
  manualFieldKeys: string[];
  status: CampaignAssetOrderStatus;
  revision: number;
  bulkJobId?: Types.ObjectId;
  outputUrls: string[];
  aiProposal?: ICampaignAssetOrderAiProposal;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignAssetOrderAIJobResult {
  orderId: Types.ObjectId;
  expectedRevision: number;
  updatedFields: string[];
  warnings: string[];
  status: "applied" | "skipped" | "conflict" | "failed";
}

export interface ICampaignAssetOrderAIJob extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  createdBy: string;
  instruction?: string;
  overwritePolicy: CampaignAssetOrderOverwritePolicy;
  targetOrderIds: Types.ObjectId[];
  status: CampaignAssetOrderAIJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  conflictedItems: number;
  progress: number;
  modelName: string;
  estimatedCost: number;
  actualCost: number;
  idempotencyKey: string;
  results: ICampaignAssetOrderAIJobResult[];
  attemptCount: number;
  lockId?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  cancelRequestedAt?: Date;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
