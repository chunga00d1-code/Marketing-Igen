import { Schema, Types, model } from "mongoose";

const canvasSchema = new Schema({
  format: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
}, { _id: false });

const CreativeImageProjectSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  companyCode: { type: String, required: true, index: true },
  templateId: { type: String, required: true, index: true },
  templateVersion: { type: Number, required: true },
  canvas: { type: canvasSchema, required: true },
  data: { type: Schema.Types.Mixed, required: true, default: {} },
  lastRenderId: { type: Schema.Types.ObjectId, ref: "CreativeImageRender" },
}, { timestamps: true });

CreativeImageProjectSchema.index({ companyCode: 1, userId: 1, updatedAt: -1 });

export type CreativeImageProjectDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  companyCode: string;
  templateId: string;
  templateVersion: number;
  canvas: { format: string; width: number; height: number };
  data: Record<string, string>;
  lastRenderId?: Types.ObjectId;
};

export const CreativeImageProjectModel = model("CreativeImageProject", CreativeImageProjectSchema);
