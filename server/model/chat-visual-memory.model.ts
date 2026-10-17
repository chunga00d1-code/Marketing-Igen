import { Schema, model } from "mongoose";
import type { ChatVisualResult, PreparedChatImage } from "../service/chat-visual-context";

export interface ChatVisualMemory {
  companyCode: string;
  channel: "facebook" | "zalo" | "tiktok";
  platformId: string;
  conversationId: string;
  sessionId: string;
  sourceMessageId: string;
  sourceTimestamp: Date;
  images: Omit<PreparedChatImage, "dataUrl">[];
  visual: ChatVisualResult;
  expiresAt: Date;
}
const schema = new Schema<ChatVisualMemory>({
  companyCode: { type: String, required: true }, channel: { type: String, required: true },
  platformId: { type: String, required: true }, conversationId: { type: String, required: true },
  sessionId: { type: String, required: true }, sourceMessageId: { type: String, required: true },
  sourceTimestamp: { type: Date, required: true },
  images: [{ _id: false, id: String, url: String, messageId: String, hash: String, width: Number, height: Number }],
  visual: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ companyCode: 1, channel: 1, platformId: 1, conversationId: 1, sessionId: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ChatVisualMemoryModel = model<ChatVisualMemory>("ChatVisualMemory", schema);
