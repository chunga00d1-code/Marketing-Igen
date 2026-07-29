import { Schema, Types, model } from "mongoose";

const canvasSchema = new Schema({
  format: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
}, { _id: false });

const aiHtmlMessageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true, maxlength: 120_000 },
  html: { type: String, default: "", maxlength: 120_000 },
  attachments: [{
    type: { type: String, enum: ["image", "document"], required: true },
    name: { type: String, required: true, maxlength: 200 },
    url: { type: String, default: "", maxlength: 2_000 },
    text: { type: String, default: "", maxlength: 20_000 },
    _id: false,
  }],
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const CreativeImageProjectSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  companyCode: { type: String, required: true, index: true },
  templateId: { type: String, required: true, index: true },
  templateVersion: { type: Number, required: true },
  canvas: { type: canvasSchema, required: true },
  data: { type: Schema.Types.Mixed, required: true, default: {} },
  mode: { type: String, enum: ["template", "ai_html"], default: "template", index: true },
  prompt: { type: String, default: "" },
  html: { type: String, default: "" },
  conversation: { type: [aiHtmlMessageSchema], default: [] },
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
  mode?: "template" | "ai_html";
  prompt?: string;
  html?: string;
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
    html?: string;
    attachments?: Array<{ type: "image" | "document"; name: string; url?: string; text?: string }>;
    createdAt?: Date;
  }>;
  lastRenderId?: Types.ObjectId;
};

export const CreativeImageProjectModel = model("CreativeImageProject", CreativeImageProjectSchema);
