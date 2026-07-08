import { Schema, model, Document } from "mongoose";

export interface ITransaction extends Document {
  userId: string;
  orderCode: number;
  amount: number;
  type: "deposit" | "payment" | "withdraw";
  status: "pending" | "success" | "failed";
  paymentLinkId?: string;
  checkoutUrl?: string;
  description?: string;
  createdAt: Date;
  completedAt?: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  userId: { type: String, required: true, index: true },
  orderCode: { type: Number, required: true, unique: true, index: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["deposit", "payment", "withdraw"], default: "deposit" },
  status: { type: String, enum: ["pending", "success", "failed"], default: "pending", index: true },
  paymentLinkId: { type: String },
  checkoutUrl: { type: String },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
});

export const TransactionModel = model<ITransaction>("Transaction", TransactionSchema);
