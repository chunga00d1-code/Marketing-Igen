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

function getRenderPurpose(value: unknown) {
  if (!value || typeof value !== "object" || !("purpose" in value)) return undefined;
  return (value as { purpose?: unknown }).purpose;
}

const VideoProjectRenderSchema = new Schema<IVideoProjectRender>(
  {
    purpose: {
      type: String,
      enum: ["project-export", "template-preview"],
      required: true,
      default: "project-export",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "VideoProject",
      required: function (this: IVideoProjectRender) {
        return this.purpose === "project-export";
      },
      validate: {
        validator: function (this: unknown, value: unknown) {
          return getRenderPurpose(this) !== "template-preview" || value == null;
        },
        message: "Template preview renders cannot include a project ID.",
      },
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "VideoTemplate",
      required: function (this: IVideoProjectRender) {
        return this.purpose === "template-preview";
      },
      validate: {
        validator: function (this: unknown, value: unknown) {
          return getRenderPurpose(this) === "template-preview" || value == null;
        },
        message: "Project export renders cannot include a template ID.",
      },
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      ref: "VideoTemplateVersion",
      required: function (this: IVideoProjectRender) {
        return this.purpose === "template-preview";
      },
      validate: {
        validator: function (this: unknown, value: unknown) {
          return getRenderPurpose(this) === "template-preview" || value == null;
        },
        message: "Project export renders cannot include a template version ID.",
      },
    },
    templateSourceHash: {
      type: String,
      required: function (this: IVideoProjectRender) {
        return this.purpose === "template-preview";
      },
      validate: {
        validator: function (this: unknown, value: unknown) {
          return getRenderPurpose(this) === "template-preview" || value == null;
        },
        message: "Project export renders cannot include a template source hash.",
      },
    },
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
    engine: { type: String, enum: ["shotstack", "remotion", "ffmpeg"] },
    providerRenderId: { type: String },
    providerSubmissionState: {
      type: String,
      enum: ["attempting", "confirmed", "uncertain", "rejected"],
    },
    providerSubmissionAttemptId: { type: String },
    providerSubmissionStartedAt: { type: Date },
    providerSubmissionUnknownAt: { type: Date },
    providerStatus: { type: String },
    providerOutputUrl: { type: String },
    providerPollAttempt: { type: Number, min: 0, default: 0 },
    providerLastCheckedAt: { type: Date },
    providerNextPollAt: { type: Date },
    providerErrorCode: { type: String },
    providerErrorMessage: { type: String },
    transferAttempt: { type: Number, required: true, min: 0, default: 0 },
    transferLeaseOwner: { type: String },
    transferLeaseUntil: { type: Date },
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
VideoProjectRenderSchema.index(
  { purpose: 1, userId: 1, companyCode: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { purpose: "project-export" },
  }
);
VideoProjectRenderSchema.index(
  { purpose: 1, templateVersionId: 1, templateSourceHash: 1 },
  {
    unique: true,
    partialFilterExpression: { purpose: "template-preview" },
  }
);
VideoProjectRenderSchema.index(
  { providerRenderId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerRenderId: { $type: "string" } },
  }
);

export const VideoProjectRenderModel = model<IVideoProjectRender>(
  "VideoProjectRender",
  VideoProjectRenderSchema
);
