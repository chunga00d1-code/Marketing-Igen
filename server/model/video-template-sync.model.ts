import { model, Schema } from "mongoose";
import type { IVideoTemplateSync } from "../interface/video-template.interface";

const SyncFailureSchema = new Schema(
  {
    externalId: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const SyncSummarySchema = new Schema(
  {
    created: { type: Number, required: true, min: 0 },
    updated: { type: Number, required: true, min: 0 },
    unchanged: { type: Number, required: true, min: 0 },
    archived: { type: Number, required: true, min: 0 },
    failedCount: { type: Number, required: true, min: 0, default: 0 },
    failed: { type: [SyncFailureSchema], default: [] },
  },
  { _id: false }
);

const VideoTemplateSyncSchema = new Schema<IVideoTemplateSync>(
  {
    provider: { type: String, enum: ["shotstack"], required: true },
    environment: { type: String, enum: ["stage", "v1"], required: true },
    latestSuccessfulListGeneration: { type: Number, min: 1 },
    latestSuccessfulListAt: { type: Date },
    mutationFenceAt: { type: Date },
    mutationFenceSequence: { type: Number, min: 0 },
    leaseOwnerToken: { type: String, select: false },
    leaseExpiresAt: { type: Date },
    lastAttemptAt: { type: Date, required: true },
    lastSuccessAt: { type: Date },
    status: {
      type: String,
      enum: ["success", "partial", "failed"],
      required: true,
    },
    summary: { type: SyncSummarySchema, required: true },
  },
  { timestamps: true }
);

VideoTemplateSyncSchema.index({ provider: 1, environment: 1 }, { unique: true });

export const VideoTemplateSyncModel = model<IVideoTemplateSync>(
  "VideoTemplateSync",
  VideoTemplateSyncSchema
);
