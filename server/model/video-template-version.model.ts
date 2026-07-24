import { model, Schema } from "mongoose";
import type { IVideoTemplateVersion } from "../interface/video-template.interface";

const VideoTemplateVersionSchema = new Schema<IVideoTemplateVersion>({
  templateId: { type: Schema.Types.ObjectId, ref: "VideoTemplate", required: true, index: true },
  version: { type: Number, required: true, min: 1 },
  sourceHash: { type: String },
  sourceEdit: { type: Schema.Types.Mixed },
  normalizedEditorState: { type: Schema.Types.Mixed },
  compatibilityWarnings: { type: [String], default: undefined },
  providerUpdatedAt: { type: Date },
  blueprint: { type: Schema.Types.Mixed, required: true },
  slots: [
    {
      key: { type: String, required: true },
      type: { type: String, enum: ["video", "image", "text"], required: true },
      label: { type: String, required: true },
      required: { type: Boolean, default: false },
      maxLength: { type: Number },
      bindings: [
        {
          timelineItemId: { type: String, required: true },
          property: { type: String, required: true },
          _id: false,
        },
      ],
      _id: false,
    },
  ],
  defaultValues: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

VideoTemplateVersionSchema.index({ templateId: 1, version: 1 }, { unique: true });

export const VideoTemplateVersionModel = model<IVideoTemplateVersion>(
  "VideoTemplateVersion",
  VideoTemplateVersionSchema
);
