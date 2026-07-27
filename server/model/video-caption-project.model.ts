import { model, Schema } from "mongoose";
import {
  DEFAULT_VIDEO_CAPTION_STYLE,
  VIDEO_CAPTION_ERROR_TYPES,
  VIDEO_CAPTION_JOB_OPERATIONS,
  VIDEO_CAPTION_MODES,
  VIDEO_CAPTION_PROJECT_STATUSES,
  VIDEO_CAPTION_SOURCE_KINDS,
} from "../../shared/video-caption.contract";
import { IVideoCaptionProject } from "../interface/video-caption.interface";

const SourceSchema = new Schema(
  {
    kind: {
      type: String,
      enum: VIDEO_CAPTION_SOURCE_KINDS,
      required: true,
    },
    url: { type: String, required: true },
    mediaId: { type: String },
    fingerprint: { type: String, index: true },
    originalName: { type: String },
  },
  { _id: false }
);

const VideoMetadataSchema = new Schema(
  {
    durationMs: { type: Number, min: 0 },
    containerDurationMs: { type: Number, min: 0 },
    videoStreamDurationMs: { type: Number, min: 0 },
    audioStreamDurationMs: { type: Number, min: 0 },
    containerStartMs: { type: Number },
    videoStreamStartMs: { type: Number },
    audioStreamStartMs: { type: Number },
    timing: {
      status: {
        type: String,
        enum: ["verified", "rejected"],
      },
      providerDurationMs: { type: Number, min: 0 },
      sourceDurationMs: { type: Number, min: 0 },
      scale: { type: Number, min: 0 },
      offsetMs: { type: Number },
      driftRatio: { type: Number, min: 0 },
      wordCoverageRatio: { type: Number, min: 0, max: 1 },
      alignmentMethod: {
        type: String,
        enum: ["word", "word_pause"],
      },
      pauseBoundaryCoverageRatio: { type: Number, min: 0, max: 1 },
    },
    durationSource: {
      type: String,
      enum: ["container", "video_stream", "audio_stream"],
    },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
    fps: { type: Number, min: 0 },
    hasAudio: { type: Boolean },
    language: { type: String },
    proxyUrl: { type: String },
    contentType: { type: String },
    contentLength: { type: Number, min: 0 },
  },
  { _id: false }
);

const ContextLinksSchema = new Schema(
  {
    marketingContentId: { type: String },
    campaignId: { type: String },
    campaignSlotId: { type: String },
  },
  { _id: false }
);

const KnowledgeSnapshotSchema = new Schema(
  {
    purpose: { type: String, enum: ["caption"], default: "caption" },
    sourceIds: { type: [String], default: [] },
    indexVersion: { type: String },
    retrievedAt: { type: Date },
  },
  { _id: false }
);

const StyleSchema = new Schema(
  {
    preset: {
      type: String,
      enum: ["classic", "clean", "highlight", "custom"],
      default: DEFAULT_VIDEO_CAPTION_STYLE.preset,
    },
    fontFamily: {
      type: String,
      default: DEFAULT_VIDEO_CAPTION_STYLE.fontFamily,
    },
    fontSize: {
      type: Number,
      min: 12,
      max: 180,
      default: DEFAULT_VIDEO_CAPTION_STYLE.fontSize,
    },
    fontWeight: {
      type: Number,
      enum: [400, 500, 600, 700, 800, 900],
      default: DEFAULT_VIDEO_CAPTION_STYLE.fontWeight,
    },
    textColor: {
      type: String,
      default: DEFAULT_VIDEO_CAPTION_STYLE.textColor,
    },
    backgroundColor: {
      type: String,
      default: DEFAULT_VIDEO_CAPTION_STYLE.backgroundColor,
    },
    backgroundOpacity: {
      type: Number,
      min: 0,
      max: 1,
      default: DEFAULT_VIDEO_CAPTION_STYLE.backgroundOpacity,
    },
    position: {
      type: String,
      enum: ["top", "center", "bottom", "safe_auto"],
      default: DEFAULT_VIDEO_CAPTION_STYLE.position,
    },
    maxLines: {
      type: Number,
      enum: [1, 2],
      default: DEFAULT_VIDEO_CAPTION_STYLE.maxLines,
    },
    safeAreaPercent: {
      type: Number,
      min: 0,
      max: 30,
      default: DEFAULT_VIDEO_CAPTION_STYLE.safeAreaPercent,
    },
  },
  { _id: false }
);

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

const OutputSchema = new Schema(
  {
    subtitleUrl: { type: String },
    captionedVideoUrl: { type: String },
    previewUrl: { type: String },
    renderHash: { type: String },
  },
  { _id: false }
);

const TransitionSchema = new Schema(
  {
    from: { type: String, enum: VIDEO_CAPTION_PROJECT_STATUSES },
    to: {
      type: String,
      enum: VIDEO_CAPTION_PROJECT_STATUSES,
      required: true,
    },
    operation: {
      type: String,
      enum: [...VIDEO_CAPTION_JOB_OPERATIONS, "create", "update", "cancel"],
    },
    actorId: { type: String },
    jobId: { type: Schema.Types.ObjectId, ref: "VideoCaptionJob" },
    message: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const VideoCaptionProjectSchema = new Schema<IVideoCaptionProject>(
  {
    companyCode: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    creationIdempotencyKey: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    mode: { type: String, enum: VIDEO_CAPTION_MODES, required: true },
    source: { type: SourceSchema, required: true },
    video: { type: VideoMetadataSchema, default: {} },
    contextLinks: { type: ContextLinksSchema },
    contextBrief: { type: String, trim: true, maxlength: 2000 },
    knowledgeSnapshot: { type: KnowledgeSnapshotSchema },
    style: {
      type: StyleSchema,
      default: () => ({ ...DEFAULT_VIDEO_CAPTION_STYLE }),
    },
    status: {
      type: String,
      enum: VIDEO_CAPTION_PROJECT_STATUSES,
      default: "draft",
      index: true,
    },
    currentVersion: { type: Number, default: 1, min: 1 },
    progress: { type: ProgressSchema },
    output: { type: OutputSchema },
    lastError: { type: ErrorSchema },
    transitions: { type: [TransitionSchema], default: [] },
  },
  { timestamps: true }
);

VideoCaptionProjectSchema.index(
  { companyCode: 1, creationIdempotencyKey: 1 },
  { unique: true }
);
VideoCaptionProjectSchema.index({
  companyCode: 1,
  createdBy: 1,
  updatedAt: -1,
});
VideoCaptionProjectSchema.index({
  companyCode: 1,
  status: 1,
  updatedAt: -1,
});
VideoCaptionProjectSchema.index({
  companyCode: 1,
  "source.fingerprint": 1,
});

export const VideoCaptionProjectModel = model<IVideoCaptionProject>(
  "VideoCaptionProject",
  VideoCaptionProjectSchema
);
