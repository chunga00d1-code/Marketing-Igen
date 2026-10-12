import { Schema, model } from "mongoose";
import type { CakeChoice, CakeVariant } from "../service/cake-price-catalog";
import type { ChatImageObservation } from "../service/chat-image-context";

export interface CakeCheckoutDetails extends CakeChoice {
  customerName: string; customerPhone: string; pickupLocation: string; pickupAt: string;
  inscription: string; decoration: string; quantity: number; imageUrl: string;
}
export interface CakeCheckoutSnapshot {
  details: CakeCheckoutDetails; variant: CakeVariant; total: number; deposit: number; balance: number;
  depositPercent: number; bankId: string; accountNumber: string; accountName: string; paymentPrefix: string;
}
export interface CakeCheckout {
  companyCode: string; pageId: string; conversationId: string;
  state: "collecting" | "awaiting_confirmation" | "payment_pending" | "manual_review";
  revision: number; details?: CakeCheckoutDetails; snapshot?: CakeCheckoutSnapshot;
  summaryText?: string; summarySentAt?: Date; orderId?: string;
  lastMessageId?: string; replyText?: string; leaseUntil?: Date; leaseToken?: string;
  imageObservation?: ChatImageObservation;
}
const schema = new Schema<CakeCheckout>({
  companyCode: { type: String, required: true }, pageId: { type: String, required: true }, conversationId: { type: String, required: true },
  state: { type: String, enum: ["collecting", "awaiting_confirmation", "payment_pending", "manual_review"], default: "collecting" },
  revision: { type: Number, default: 0 }, details: Schema.Types.Mixed, snapshot: Schema.Types.Mixed,
  summaryText: String, summarySentAt: Date, orderId: String, lastMessageId: String, replyText: String,
  leaseUntil: Date, leaseToken: String,
  imageObservation: Schema.Types.Mixed,
}, { timestamps: true });
schema.index({ companyCode: 1, pageId: 1, conversationId: 1 }, { unique: true });
export const CakeCheckoutModel = model<CakeCheckout>("CakeCheckout", schema);
