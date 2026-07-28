import { model, Schema } from "mongoose";
import {
  VIDEO_CAPTION_LANES,
  VIDEO_CAPTION_SOURCE_REFERENCE_KINDS,
} from "../../shared/video-caption.contract";
import { IVideoCaptionSegment } from "../interface/video-caption.interface";

const SourceReferenceSchema = new Schema(
  {
    kind: {
      type: String,
      enum: VIDEO_CAPTION_SOURCE_REFERENCE_KINDS,
      required: true,
    },
    sourceId: { type: String },
    documentId: { type: String },
    chunkId: { type: String },
    title: { type: String },
    version: { type: String },
    excerpt: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const VideoCaptionSegmentSchema = new Schema<IVideoCaptionSegment>(
  {
    companyCode: { type: String, required: true, index: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "VideoCaptionProject",
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    lane: { type: String, enum: VIDEO_CAPTION_LANES, required: true },
    startMs: { type: Number, required: true, min: 0 },
    endMs: { type: Number, required: true, min: 1 },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    sceneId: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
    sourceReferences: { type: [SourceReferenceSchema], default: [] },
    styleOverride: { type: Schema.Types.Mixed },
    lockedByUser: { type: Boolean, default: false },
    sortOrder: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

VideoCaptionSegmentSchema.index({
  companyCode: 1,
  projectId: 1,
  version: 1,
  lane: 1,
  sortOrder: 1,
});
VideoCaptionSegmentSchema.index(
  { projectId: 1, version: 1, lane: 1, sortOrder: 1 },
  { unique: true }
);

export const VideoCaptionSegmentModel = model<IVideoCaptionSegment>(
  "VideoCaptionSegment",
  VideoCaptionSegmentSchema
);
