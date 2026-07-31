import { model, Schema } from "mongoose";
import { IBulkRenderItem } from "../interface/bulk-create.interface";

const BulkRenderItemSchema = new Schema<IBulkRenderItem>(
  {
    companyCode: { type: String, required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "BulkRenderJob", required: true, index: true },
    rowIndex: { type: Number, required: true, min: 0 },
    campaignAssetOrderId: { type: Schema.Types.ObjectId, ref: "CampaignAssetOrder", index: true },
    campaignSlotId: { type: Schema.Types.ObjectId, ref: "MarketingCampaignSlot", index: true },
    sourceRowId: { type: String, maxlength: 160 },
    values: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["queued", "processing", "completed", "failed", "cancelled"], default: "queued", index: true },
    outputUrl: { type: String },
    errorMessage: { type: String },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

BulkRenderItemSchema.index({ jobId: 1, rowIndex: 1 }, { unique: true });
BulkRenderItemSchema.index({ companyCode: 1, jobId: 1, status: 1 });
BulkRenderItemSchema.index({ companyCode: 1, campaignSlotId: 1, jobId: 1 });

export const BulkRenderItemModel = model<IBulkRenderItem>("BulkRenderItem", BulkRenderItemSchema);
