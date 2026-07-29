import { model, Schema } from "mongoose";
import { ICampaignAssetOrderAIJob } from "../interface/campaign-asset-order.interface";

const resultSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "CampaignAssetOrder", required: true },
    expectedRevision: { type: Number, required: true },
    updatedFields: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    status: { type: String, enum: ["applied", "skipped", "conflict", "failed"], required: true },
  },
  { _id: false }
);

const CampaignAssetOrderAIJobSchema = new Schema<ICampaignAssetOrderAIJob>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    instruction: { type: String, default: "", maxlength: 2000 },
    overwritePolicy: { type: String, enum: ["empty_only", "replace_ai"], default: "empty_only" },
    targetOrderIds: { type: [Schema.Types.ObjectId], required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "partial", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    totalItems: { type: Number, default: 0 },
    completedItems: { type: Number, default: 0 },
    failedItems: { type: Number, default: 0 },
    skippedItems: { type: Number, default: 0 },
    conflictedItems: { type: Number, default: 0 },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    modelName: { type: String, default: "" },
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    idempotencyKey: { type: String, required: true },
    results: { type: [resultSchema], default: [] },
    attemptCount: { type: Number, default: 0 },
    lockId: { type: String, index: true },
    lockedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    cancelRequestedAt: { type: Date },
    errorMessage: { type: String, default: "", maxlength: 1000 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

CampaignAssetOrderAIJobSchema.index({ companyCode: 1, campaignId: 1, createdAt: -1 });
CampaignAssetOrderAIJobSchema.index({ companyCode: 1, idempotencyKey: 1 }, { unique: true });
CampaignAssetOrderAIJobSchema.index({ status: 1, lockExpiresAt: 1, createdAt: 1 });

export const CampaignAssetOrderAIJobModel = model<ICampaignAssetOrderAIJob>(
  "CampaignAssetOrderAIJob",
  CampaignAssetOrderAIJobSchema
);
