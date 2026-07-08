import { Schema, model, Document } from "mongoose";

export interface IWallet extends Document {
  userId: string;
  balance: number;
  currency: string;
  updatedAt: Date;
}

const WalletSchema = new Schema<IWallet>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "USD" },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const WalletModel = model<IWallet>("Wallet", WalletSchema);
