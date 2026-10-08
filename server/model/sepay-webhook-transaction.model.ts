import { Schema, model } from "mongoose";

export interface ISepayWebhookTransaction {
  companyCode: string;
  webhookId: string;
  transactionId: string;
  gateway: string;
  accountNumber: string;
  code: string;
  content: string;
  transferType: string;
  transferAmount: number;
  transactionDate: string;
  referenceCode: string;
  status: "received" | "matched" | "ignored" | "amount_mismatch" | "order_not_found";
  orderId?: string;
  reason?: string;
  rawPayload: Record<string, unknown>;
}

const SepayWebhookTransactionSchema = new Schema<ISepayWebhookTransaction>({
  companyCode: { type: String, required: true, index: true },
  webhookId: { type: String, required: true, index: true },
  transactionId: { type: String, required: true },
  gateway: { type: String, default: "", trim: true },
  accountNumber: { type: String, default: "", trim: true },
  code: { type: String, default: "", trim: true, uppercase: true, index: true },
  content: { type: String, default: "", trim: true },
  transferType: { type: String, default: "", trim: true },
  transferAmount: { type: Number, required: true, min: 0 },
  transactionDate: { type: String, default: "", trim: true },
  referenceCode: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["received", "matched", "ignored", "amount_mismatch", "order_not_found"],
    default: "received",
    index: true,
  },
  orderId: { type: String, default: "", trim: true, index: true },
  reason: { type: String, default: "", trim: true },
  rawPayload: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

SepayWebhookTransactionSchema.index({ companyCode: 1, transactionId: 1 }, { unique: true });

export const SepayWebhookTransactionModel = model<ISepayWebhookTransaction>(
  "SepayWebhookTransaction",
  SepayWebhookTransactionSchema,
);
