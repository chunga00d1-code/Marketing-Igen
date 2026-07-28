import { model, Schema } from "mongoose";
import { ICampaignAssetOrder } from "../interface/campaign-asset-order.interface";

const assetSchema = new Schema(
  {
    role: { type: String, enum: ["primary", "secondary", "logo", "video", "other"], required: true },
    sourceUrl: { type: String, required: true, maxlength: 14000000 },
    originalName: { type: String, maxlength: 500 },
    source: { type: String, enum: ["manual", "sheet", "drive", "upload"], required: true },
    order: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false }
);

const aiReferenceSchema = new Schema(
  {
    kind: { type: String, enum: ["campaign", "slot", "knowledge_document", "knowledge_chunk"], required: true },
    id: { type: String, required: true },
    title: { type: String, maxlength: 500 },
    excerpt: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const CampaignAssetOrderSchema = new Schema<ICampaignAssetOrder>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    slotId: { type: Schema.Types.ObjectId, ref: "MarketingCampaignSlot", index: true },
    createdBy: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 240 },
    source: { type: String, enum: ["manual", "sheet", "drive", "upload"], default: "manual", required: true },
    format: { type: String, enum: ["image", "video", "image_video"], default: "image", required: true },
    aspectRatio: { type: String, enum: ["1:1", "4:5", "9:16", "16:9"], default: "4:5", required: true },
    templateId: { type: Schema.Types.ObjectId, ref: "BulkTemplate" },
    headline: { type: String, default: "", maxlength: 120 },
    subheadline: { type: String, default: "", maxlength: 220 },
    cta: { type: String, default: "", maxlength: 80 },
    visualBrief: { type: String, default: "", maxlength: 1000 },
    assets: { type: [assetSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "needs_assets", "ready", "bulk_queued", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    revision: { type: Number, default: 0 },
    bulkJobId: { type: Schema.Types.ObjectId, ref: "BulkRenderJob" },
    outputUrls: { type: [String], default: [] },
    aiProposal: {
      idempotencyKey: { type: String },
      headline: { type: String, maxlength: 120 },
      subheadline: { type: String, maxlength: 220 },
      cta: { type: String, maxlength: 80 },
      visualBrief: { type: String, maxlength: 1000 },
      references: { type: [aiReferenceSchema], default: [] },
      warnings: { type: [String], default: [] },
      createdAt: { type: Date },
      _id: false,
    },
  },
  { timestamps: true }
);

CampaignAssetOrderSchema.index({ companyCode: 1, campaignId: 1, updatedAt: -1 });
CampaignAssetOrderSchema.index({ companyCode: 1, campaignId: 1, slotId: 1, status: 1 });

export const CampaignAssetOrderModel = model<ICampaignAssetOrder>("CampaignAssetOrder", CampaignAssetOrderSchema);
