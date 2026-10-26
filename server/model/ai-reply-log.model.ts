import mongoose, { Schema, Document } from "mongoose";

export interface IAIReplyLog extends Document {
  companyCode: string;
  channel: "facebook" | "zalo" | "tiktok" | "test" | "facebook_comment";
  conversationId?: string;
  commentId?: string;
  postId?: string;
  customerMessage: string;
  aiResponse: string;
  contextPreview: string;
  contextMatches: number;
  mode: "default" | "trained";
  latencyMs: number;
  status: "sent" | "failed" | "preview";
  leadSaved?: boolean;
  leadSheetSaved?: boolean;
  feedback?: "good" | "bad" | "needs_fix";
  feedbackNote?: string;
  visualDiagnostics?: {
    mode: "legacy" | "multimodal";
    imageCount: number;
    hasMemory: boolean;
    imageSizes: Array<{ width: number; height: number }>;
    failure: string;
    requestCount?: number;
    imageRequestCount?: number;
    providerDurationMs?: number;
    failedRequestCount?: number;
    models?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const AIReplyLogSchema = new Schema<IAIReplyLog>(
  {
    companyCode: { type: String, required: true, index: true },
    channel: { type: String, enum: ["facebook", "zalo", "tiktok", "test", "facebook_comment"], required: true, index: true },
    conversationId: { type: String, default: "", index: true },
    commentId: { type: String, default: "", index: true },
    postId: { type: String, default: "", index: true },
    customerMessage: { type: String, required: true },
    aiResponse: { type: String, required: true },
    contextPreview: { type: String, default: "" },
    contextMatches: { type: Number, default: 0 },
    mode: { type: String, enum: ["default", "trained"], required: true, index: true },
    latencyMs: { type: Number, default: 0 },
    status: { type: String, enum: ["sent", "failed", "preview"], default: "sent", index: true },
    leadSaved: { type: Boolean, default: false },
    leadSheetSaved: { type: Boolean, default: false },
    feedback: { type: String, enum: ["good", "bad", "needs_fix"], default: undefined },
    feedbackNote: { type: String, default: "" },
    visualDiagnostics: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

AIReplyLogSchema.index({ companyCode: 1, createdAt: -1 });

export const AIReplyLogModel = mongoose.model<IAIReplyLog>("AIReplyLog", AIReplyLogSchema);
