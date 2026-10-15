import mongoose, { Schema, Document } from "mongoose";

export type FacebookAutoReplyJobStatus = "pending" | "processing" | "completed" | "cancelled" | "failed";

export interface IFacebookAutoReplyJob extends Document {
  channel: "facebook";
  conversationId: mongoose.Types.ObjectId;
  pageId: string;
  messageId: string;
  messageTimestamp: Date;
  messageCreatedAt: Date;
  text: string;
  status: FacebookAutoReplyJobStatus;
  nextAttemptAt: Date;
  attempts: number;
  leaseToken?: string;
  leaseUntil?: Date;
  deliveryStartedAt?: Date;
  lastError?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FacebookAutoReplyJobSchema = new Schema<IFacebookAutoReplyJob>({
  channel: { type: String, enum: ["facebook"], default: "facebook", required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: "FBConversation", required: true },
  pageId: { type: String, required: true, trim: true },
  messageId: { type: String, required: true, trim: true },
  messageTimestamp: { type: Date, required: true, index: true },
  messageCreatedAt: { type: Date, required: true },
  text: { type: String, default: "" },
  status: { type: String, enum: ["pending", "processing", "completed", "cancelled", "failed"], default: "pending", index: true },
  nextAttemptAt: { type: Date, required: true, index: true },
  attempts: { type: Number, default: 0, min: 0 },
  leaseToken: { type: String },
  leaseUntil: { type: Date },
  deliveryStartedAt: { type: Date },
  lastError: { type: String, default: "" },
  completedAt: { type: Date },
}, { timestamps: true });

FacebookAutoReplyJobSchema.index({ channel: 1, conversationId: 1 }, { unique: true });
FacebookAutoReplyJobSchema.index({ channel: 1, status: 1, nextAttemptAt: 1, leaseUntil: 1 });
FacebookAutoReplyJobSchema.index({ channel: 1, status: 1, leaseUntil: 1 });

export const FacebookAutoReplyJobModel = mongoose.model<IFacebookAutoReplyJob>(
  "FacebookAutoReplyJob",
  FacebookAutoReplyJobSchema,
);
