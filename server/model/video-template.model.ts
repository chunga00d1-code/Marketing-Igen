import { model, Schema } from "mongoose";
import type { IVideoTemplate } from "../interface/video-template.interface";

const VideoTemplateSchema = new Schema<IVideoTemplate>(
  {
    systemKey: { type: String, unique: true, sparse: true, index: true },
    sourceProvider: { type: String, enum: ["shotstack"] },
    externalTemplateId: { type: String },
    providerCreatedAt: { type: Date },
    providerUpdatedAt: { type: Date },
    lastSyncedAt: { type: Date },
    compatibilityWarnings: { type: [String], default: undefined },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    thumbnailUrl: { type: String, required: true },
    previewVideoUrl: { type: String },
    duration: { type: Number, required: true, min: 1 },
    aspectRatio: { type: String, enum: ["9:16", "1:1", "16:9", "3:4"], required: true },
    categoryId: { type: String, required: true, index: true },
    categoryName: { type: String, required: true },
    tags: { type: [String], default: [] },
    badges: { type: [String], enum: ["new", "popular", "mine"], default: [] },
    usageCount: { type: Number, default: 0, min: 0 },
    visibility: { type: String, enum: ["system", "tenant", "private"], required: true, index: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    ownerUserId: { type: String, index: true },
    companyCode: { type: String, index: true },
    publishedVersionId: { type: Schema.Types.ObjectId, ref: "VideoTemplateVersion" },
  },
  { timestamps: true }
);

VideoTemplateSchema.index({ visibility: 1, status: 1, categoryId: 1, usageCount: -1 });
VideoTemplateSchema.index({ companyCode: 1, ownerUserId: 1, updatedAt: -1 });
VideoTemplateSchema.index(
  { sourceProvider: 1, externalTemplateId: 1 },
  { unique: true, sparse: true }
);

export const VideoTemplateModel = model<IVideoTemplate>("VideoTemplate", VideoTemplateSchema);
