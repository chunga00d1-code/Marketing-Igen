import { model, Schema } from "mongoose";
import { IBulkAsset } from "../interface/bulk-create.interface";

const BulkAssetSchema = new Schema<IBulkAsset>(
  {
    companyCode: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    url: { type: String, required: true },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
  },
  { timestamps: true }
);

BulkAssetSchema.index({ companyCode: 1, createdBy: 1, status: 1, createdAt: -1 });

export const BulkAssetModel = model<IBulkAsset>("BulkAsset", BulkAssetSchema);
