import { model, Schema } from "mongoose";
import type { IVideoProjectRender } from "../interface/video-project-render.interface";

function hasRequiredSnapshotFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.title === "string" &&
    snapshot.title.trim().length > 0 &&
    Array.isArray(snapshot.tracks) &&
    Array.isArray(snapshot.items) &&
    snapshot.settings !== null &&
    typeof snapshot.settings === "object" &&
    !Array.isArray(snapshot.settings)
  );
}

const VideoProjectRenderSchema = new Schema<IVideoProjectRender>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "VideoProject", required: true },
    userId: { type: String, required: true },
    companyCode: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "rendering", "uploading", "completed", "failed"],
      default: "queued",
    },
    resolution: { type: String, enum: ["720p", "1080p"], default: "1080p" },
    aspectRatio: { type: String, enum: ["9:16", "1:1", "16:9", "3:4"], required: true },
    duration: { type: Number, required: true, min: 0 },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
      validate: {
        validator: hasRequiredSnapshotFields,
        message: "Render snapshot must include title, tracks, items, and settings.",
      },
    },
    progress: { type: Number, required: true, min: 0, max: 100, default: 0 },
    stageMessage: { type: String },
    outputUrl: { type: String },
    engine: { type: String, enum: ["remotion", "ffmpeg"] },
    attempt: { type: Number, required: true, min: 0, default: 0 },
    idempotencyKey: { type: String, required: true },
    errorCode: { type: String },
    errorMessage: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

VideoProjectRenderSchema.index({ projectId: 1, userId: 1, companyCode: 1, createdAt: -1 });
VideoProjectRenderSchema.index({ userId: 1, companyCode: 1, idempotencyKey: 1 }, { unique: true });

export const VideoProjectRenderModel = model<IVideoProjectRender>(
  "VideoProjectRender",
  VideoProjectRenderSchema
);
