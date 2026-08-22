import { model, Schema, type Types } from "mongoose";
import type { HtmlVideoPromptAssumptions } from "../interface/html-video-pipeline.interface";

export type HtmlVideoPromptHistoryDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId | string;
  companyCode: string;
  projectName: string;
  prompt: string;
  masterPrompt?: string;
  inferredAssumptions?: HtmlVideoPromptAssumptions;
  aspectRatio: "16:9" | "9:16" | "1:1";
  referenceNames: string[];
  parentHistoryId?: Types.ObjectId;
  renderId?: Types.ObjectId;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

const HtmlVideoPromptHistorySchema = new Schema<HtmlVideoPromptHistoryDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    companyCode: { type: String, required: true, index: true, immutable: true },
    projectName: { type: String, required: true, trim: true, maxlength: 180 },
    prompt: { type: String, required: true, trim: true, maxlength: 23_000 },
    masterPrompt: { type: String, trim: true, maxlength: 23_000 },
    inferredAssumptions: { type: Schema.Types.Mixed },
    aspectRatio: {
      type: String,
      enum: ["16:9", "9:16", "1:1"],
      required: true,
    },
    referenceNames: { type: [String], default: [] },
    parentHistoryId: {
      type: Schema.Types.ObjectId,
      ref: "HtmlVideoPromptHistory",
      immutable: true,
    },
    renderId: { type: Schema.Types.ObjectId, ref: "HtmlVideoRender", index: true },
    revision: { type: Number, required: true, min: 1, default: 1 },
  },
  { timestamps: true }
);

HtmlVideoPromptHistorySchema.index({ userId: 1, companyCode: 1, createdAt: -1 });

export const HtmlVideoPromptHistoryModel = model<HtmlVideoPromptHistoryDocument>(
  "HtmlVideoPromptHistory",
  HtmlVideoPromptHistorySchema
);
