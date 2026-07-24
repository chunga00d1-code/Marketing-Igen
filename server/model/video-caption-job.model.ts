import { model, Schema } from "mongoose";
import {
  VIDEO_CAPTION_ERROR_TYPES,
  VIDEO_CAPTION_JOB_OPERATIONS,
  VIDEO_CAPTION_JOB_STATUSES,
} from "../../shared/video-caption.contract";
import { IVideoCaptionJob } from "../interface/video-caption.interface";

const ProgressSchema = new Schema(
  {
    stage: { type: String, required: true },
    percent: { type: Number, min: 0, max: 100, required: true },
    message: { type: String },
  },
  { _id: false }
);

const ErrorSchema = new Schema(
  {
    type: { type: String, enum: VIDEO_CAPTION_ERROR_TYPES, required: true },
    code: { type: String, required: true },
    message: { type: String, required: true },
    retryable: { type: Boolean, required: true },
    occurredAt: { type: Date, required: true },
  },
  { _id: false }
);

const VideoCaptionJobSchema = new Schema<IVideoCaptionJob>(
  {
    companyCode: { type: String, required: true, index: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "VideoCaptionProject",
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: VIDEO_CAPTION_JOB_OPERATIONS,
      required: true,
    },
    status: {
      type: String,
      enum: VIDEO_CAPTION_JOB_STATUSES,
      default: "queued",
      index: true,
    },
    idempotencyKey: { type: String, required: true },
    inputHash: { type: String, required: true },
    attempt: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1, max: 10 },
    progress: {
      type: ProgressSchema,
      default: () => ({ stage: "queued", percent: 0 }),
    },
    provider: { type: String },
    providerModel: { type: String },
    estimatedCost: { type: Number, min: 0 },
    actualCost: { type: Number, min: 0 },
    providerRequestId: { type: String },
    lockId: { type: String },
    lockedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelRequestedAt: { type: Date },
    lastError: { type: ErrorSchema },
  },
  { timestamps: true }
);

VideoCaptionJobSchema.index(
  { companyCode: 1, idempotencyKey: 1 },
  { unique: true }
);
VideoCaptionJobSchema.index({
  companyCode: 1,
  projectId: 1,
  createdAt: -1,
});
VideoCaptionJobSchema.index({ status: 1, lockExpiresAt: 1 });

export const VideoCaptionJobModel = model<IVideoCaptionJob>(
  "VideoCaptionJob",
  VideoCaptionJobSchema
);
