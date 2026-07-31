import { model, Schema } from "mongoose";
import { IBulkRenderJob } from "../interface/bulk-create.interface";

const BulkRenderJobSchema = new Schema<IBulkRenderJob>(
  {
    companyCode: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: "BulkTemplate", index: true },
    templateName: { type: String, required: true },
    templateSnapshot: { type: Schema.Types.Mixed, required: true },
    targetType: { type: String, enum: ["standalone", "campaign"], default: "standalone", index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", index: true },
    sourceType: { type: String, enum: ["manual", "campaign_orders", "sheet"], default: "manual" },
    mappingMode: { type: String, enum: ["order", "position", "manual"] },
    status: { type: String, enum: ["queued", "processing", "completed", "partial", "failed", "cancelled"], default: "queued", index: true },
    totalItems: { type: Number, required: true, min: 1, max: 500 },
    completedItems: { type: Number, default: 0 },
    failedItems: { type: Number, default: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    idempotencyKey: { type: String, required: true },
    errorMessage: { type: String },
    lockId: { type: String },
    lockedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelRequestedAt: { type: Date },
  },
  { timestamps: true }
);

BulkRenderJobSchema.index({ companyCode: 1, createdAt: -1 });
BulkRenderJobSchema.index({ companyCode: 1, campaignId: 1, createdAt: -1 });
BulkRenderJobSchema.index({ companyCode: 1, idempotencyKey: 1 }, { unique: true });
BulkRenderJobSchema.index({ status: 1, lockExpiresAt: 1 });

export const BulkRenderJobModel = model<IBulkRenderJob>("BulkRenderJob", BulkRenderJobSchema);
