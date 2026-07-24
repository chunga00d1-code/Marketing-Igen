import { model, Schema } from "mongoose";
import type { IVideoProject } from "../interface/video-template.interface";

const VideoProjectSchema = new Schema<IVideoProject>(
  {
    userId: { type: String, required: true, index: true },
    companyCode: { type: String, required: true, index: true },
    sourceTemplateId: { type: Schema.Types.ObjectId, ref: "VideoTemplate" },
    sourceTemplateVersionId: { type: Schema.Types.ObjectId, ref: "VideoTemplateVersion" },
    title: { type: String, required: true },
    status: { type: String, enum: ["draft"], default: "draft" },
    blueprint: { type: Schema.Types.Mixed, required: true },
    slotValues: { type: Schema.Types.Mixed, default: {} },
    aspectRatio: { type: String, enum: ["9:16", "1:1", "16:9", "3:4"], required: true },
    sourceMediaUrl: { type: String },
    editorState: { type: Schema.Types.Mixed, default: {} },
    revision: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

VideoProjectSchema.index({ companyCode: 1, userId: 1, updatedAt: -1 });

export const VideoProjectModel = model<IVideoProject>("VideoProject", VideoProjectSchema);
