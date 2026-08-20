import { model, Schema, type Types } from "mongoose";
import type { HtmlVideoPipelineMetadata } from "../interface/html-video-pipeline.interface";
import type { HtmlVideoDraftInput } from "../service/html-video/html-video-draft.service";
import type { HtmlVideoPipelineCheckpoint } from "../service/html-video/html-video-pipeline.service";

export type HtmlVideoGenerationStage =
  | "queued"
  | "grounding"
  | "planning"
  | "composing"
  | "validating"
  | "ready"
  | "failed";

export type HtmlVideoGenerationRetryStage =
  | "planning"
  | "visual"
  | "voice"
  | "validation";

export type HtmlVideoGenerationDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId | string;
  companyCode: string;
  idempotencyKey: string;
  input: HtmlVideoDraftInput;
  checkpoint?: HtmlVideoPipelineCheckpoint;
  html: string;
  css: string;
  voiceScript: string;
  pipeline?: HtmlVideoPipelineMetadata;
  status: HtmlVideoGenerationStage;
  currentStage: HtmlVideoGenerationStage;
  progress: number;
  stageMessage: string;
  errorCode: string;
  error: string;
  attempts: number;
  leaseOwner: string;
  leaseExpiresAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const HtmlVideoGenerationSchema = new Schema<HtmlVideoGenerationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    companyCode: { type: String, required: true, index: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    input: { type: Schema.Types.Mixed, required: true, immutable: true, select: false },
    checkpoint: { type: Schema.Types.Mixed, select: false },
    html: { type: String, default: "", select: false },
    css: { type: String, default: "", select: false },
    voiceScript: { type: String, default: "", select: false },
    pipeline: { type: Schema.Types.Mixed, select: false },
    status: {
      type: String,
      enum: ["queued", "grounding", "planning", "composing", "validating", "ready", "failed"],
      default: "queued",
      index: true,
    },
    currentStage: {
      type: String,
      enum: ["queued", "grounding", "planning", "composing", "validating", "ready", "failed"],
      default: "queued",
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    stageMessage: { type: String, default: "Đang chờ phân tích prompt." },
    errorCode: { type: String, default: "" },
    error: { type: String, default: "" },
    attempts: { type: Number, min: 0, default: 0 },
    leaseOwner: { type: String, default: "", select: false },
    leaseExpiresAt: { type: Date, select: false },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

HtmlVideoGenerationSchema.index(
  { userId: 1, companyCode: 1, idempotencyKey: 1 },
  { unique: true }
);
HtmlVideoGenerationSchema.index({ status: 1, updatedAt: 1 });

export const HtmlVideoGenerationModel = model<HtmlVideoGenerationDocument>(
  "HtmlVideoGeneration",
  HtmlVideoGenerationSchema
);
