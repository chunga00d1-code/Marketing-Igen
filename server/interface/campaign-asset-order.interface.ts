import { Document, Types } from "mongoose";

export type CampaignAssetOrderFormat = "image" | "video" | "image_video";
export type CampaignAssetOrderStatus = "draft" | "needs_assets" | "ready" | "bulk_queued" | "completed" | "cancelled";
export type CampaignAssetSource = "manual" | "sheet" | "drive" | "upload";
export type CampaignAssetRole = "primary" | "secondary" | "logo" | "video" | "other";

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
  contentGroup?: string;
  shootingContent?: string;
  productionRequirements?: string;
  quantitySuggestion?: string;
  usageChannels?: string;
  headline: string;
  subheadline?: string;
  cta?: string;
  visualBrief?: string;
  references: ICampaignAssetOrderReference[];
  warnings: string[];
  createdAt: Date;
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
  assets: ICampaignAssetOrderAsset[];
  status: CampaignAssetOrderStatus;
  revision: number;
  bulkJobId?: Types.ObjectId;
  outputUrls: string[];
  aiProposal?: ICampaignAssetOrderAiProposal;
  createdAt: Date;
  updatedAt: Date;
}
