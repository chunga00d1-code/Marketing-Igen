import { Schema, Types, model } from "mongoose";

const CreativeImageRenderSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: "CreativeImageProject", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  companyCode: { type: String, required: true, index: true },
  status: { type: String, enum: ["queued", "rendering", "completed", "failed"], default: "queued", index: true },
  outputType: { type: String, enum: ["png"], default: "png" },
  outputUrl: { type: String, default: "" },
  templateSnapshot: { type: Schema.Types.Mixed, required: true },
  idempotencyKey: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  error: { type: String, default: "" },
  completedAt: { type: Date },
}, { timestamps: true });

CreativeImageRenderSchema.index({ projectId: 1, idempotencyKey: 1 }, { unique: true });
CreativeImageRenderSchema.index({ companyCode: 1, userId: 1, createdAt: -1 });

export type CreativeImageRenderDocument = {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  status: "queued" | "rendering" | "completed" | "failed";
  attempts: number;
};

export const CreativeImageRenderModel = model("CreativeImageRender", CreativeImageRenderSchema);
