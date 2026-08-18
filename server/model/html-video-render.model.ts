import { model, Schema, type Types } from "mongoose";

export type HtmlVideoRenderStatus =
  | "queued"
  | "rendering"
  | "uploading"
  | "completed"
  | "failed";

export type HtmlVideoRenderDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId | string;
  companyCode: string;
  idempotencyKey: string;
  promptHistoryId?: Types.ObjectId;
  sourceHtml: string;
  sourceCss: string;
  sanitizedHtml: string;
  sanitizedCss: string;
  compositionHtml: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p";
  status: HtmlVideoRenderStatus;
  progress: number;
  stageMessage: string;
  outputUrl: string;
  errorCode: string;
  error: string;
  attempts: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const HtmlVideoRenderSchema = new Schema<HtmlVideoRenderDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    companyCode: {
      type: String,
      required: true,
      index: true,
      immutable: true,
    },
    idempotencyKey: { type: String, required: true, immutable: true },
    promptHistoryId: { type: Schema.Types.ObjectId, ref: "HtmlVideoPromptHistory", index: true, immutable: true },
    sourceHtml: { type: String, required: true, immutable: true, select: false },
    sourceCss: { type: String, default: "", immutable: true, select: false },
    sanitizedHtml: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    sanitizedCss: {
      type: String,
      default: "",
      immutable: true,
      select: false,
    },
    compositionHtml: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 1,
      max: 180,
      immutable: true,
    },
    aspectRatio: {
      type: String,
      enum: ["16:9", "9:16", "1:1"],
      required: true,
      immutable: true,
    },
    resolution: {
      type: String,
      enum: ["720p", "1080p"],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["queued", "rendering", "uploading", "completed", "failed"],
      default: "queued",
      index: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    stageMessage: {
      type: String,
      default: "Đã xếp hàng kết xuất video.",
    },
    outputUrl: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    error: { type: String, default: "" },
    attempts: { type: Number, min: 0, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

HtmlVideoRenderSchema.index(
  { userId: 1, companyCode: 1, idempotencyKey: 1 },
  { unique: true }
);
HtmlVideoRenderSchema.index({ status: 1, updatedAt: 1 });

export const HtmlVideoRenderModel = model<HtmlVideoRenderDocument>(
  "HtmlVideoRender",
  HtmlVideoRenderSchema
);
