import { model, Schema, type Types } from "mongoose";
import type {
  RealEstateMapProjectSnapshot,
  RealEstateMapVideoSpec,
} from "../interface/real-estate-map-video.interface";
import type { RealEstateMapComposition } from "../service/real-estate-map-video/map-scene-engine.service";

export type RealEstateMapRenderStatus =
  | "queued"
  | "preparing"
  | "rendering"
  | "muxing"
  | "uploading"
  | "verifying"
  | "completed"
  | "failed";

export type RealEstateMapVideoRenderDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  companyCode: string;
  idempotencyKey: string;
  draftId?: Types.ObjectId;
  status: RealEstateMapRenderStatus;
  progress: number;
  stageMessage: string;
  snapshot: RealEstateMapProjectSnapshot;
  composition: RealEstateMapComposition;
  videoSpec: RealEstateMapVideoSpec;
  outputUrl?: string;
  outputDurationSeconds?: number;
  outputResolution?: string;
  audioStreamVerified: boolean;
  videoStreamVerified: boolean;
  attempts: number;
  error?: string;
  errorCode?: string;
  cost?: {
    ttsTokens?: number;
    mapTransactions?: number;
    renderSeconds?: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const RenderSchema = new Schema<RealEstateMapVideoRenderDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true, immutable: true },
    companyCode: { type: String, required: true, index: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    draftId: { type: Schema.Types.ObjectId, ref: "RealEstateMapVideoDraft" },
    status: {
      type: String,
      enum: ["queued", "preparing", "rendering", "muxing", "uploading", "verifying", "completed", "failed"],
      default: "queued",
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    stageMessage: { type: String, default: "Đang xếp hàng chờ xử lý..." },
    snapshot: { type: Schema.Types.Mixed, required: true },
    composition: { type: Schema.Types.Mixed, required: true },
    videoSpec: {
      aspectRatio: { type: String, enum: ["9:16", "16:9", "1:1"], default: "9:16" },
      resolution: { type: String, enum: ["720p", "1080p"], default: "1080p" },
      durationSeconds: { type: Number, default: 24 },
    },
    outputUrl: { type: String },
    outputDurationSeconds: { type: Number },
    outputResolution: { type: String },
    audioStreamVerified: { type: Boolean, default: false },
    videoStreamVerified: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    error: { type: String },
    errorCode: { type: String },
    cost: {
      ttsTokens: { type: Number, default: 0 },
      mapTransactions: { type: Number, default: 0 },
      renderSeconds: { type: Number, default: 0 },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

RenderSchema.index({ userId: 1, companyCode: 1, idempotencyKey: 1 }, { unique: true });
RenderSchema.index({ userId: 1, companyCode: 1, createdAt: -1 });

export const RealEstateMapVideoRenderModel = model<RealEstateMapVideoRenderDocument>(
  "RealEstateMapVideoRender",
  RenderSchema
);
