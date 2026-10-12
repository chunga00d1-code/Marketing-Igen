import { Schema, model } from "mongoose";

export interface CakeCustomerMemory {
  companyCode: string; pageId: string; recipientId: string; conversationId: string;
  buyerName?: string; buyerPhone?: string; customerAddress?: string;
  purchaseCount: number; lastPurchasedAt?: Date;
  sessionId?: string; windowStart?: Date; lastInboundAt?: Date; lastInboundMessageId?: string;
  needsClarification?: boolean; revision: number;
}
const memorySchema = new Schema<CakeCustomerMemory>({
  companyCode: { type: String, required: true }, pageId: { type: String, required: true },
  recipientId: { type: String, required: true }, conversationId: { type: String, required: true },
  buyerName: String, buyerPhone: String, customerAddress: String,
  purchaseCount: { type: Number, default: 0 }, lastPurchasedAt: Date,
  sessionId: String, windowStart: Date, lastInboundAt: Date, lastInboundMessageId: String,
  needsClarification: Boolean, revision: { type: Number, default: 0 },
}, { timestamps: true });
memorySchema.index({ companyCode: 1, pageId: 1, recipientId: 1 }, { unique: true });
export const CakeCustomerMemoryModel = model<CakeCustomerMemory>("CakeCustomerMemory", memorySchema);

export interface CakeConsultationSession {
  companyCode: string; pageId: string; conversationId: string; sessionId: string;
  startedAt: Date; lastInboundAt: Date; orderId?: string;
  draft?: Record<string, unknown>;
  closed?: boolean;
}
const sessionSchema = new Schema<CakeConsultationSession>({
  companyCode: { type: String, required: true }, pageId: { type: String, required: true },
  conversationId: { type: String, required: true }, sessionId: { type: String, required: true },
  startedAt: Date, lastInboundAt: Date, orderId: String, draft: Schema.Types.Mixed, closed: Boolean,
}, { timestamps: true });
sessionSchema.index({ companyCode: 1, pageId: 1, conversationId: 1, sessionId: 1 }, { unique: true });
export const CakeConsultationSessionModel = model<CakeConsultationSession>("CakeConsultationSession", sessionSchema);
