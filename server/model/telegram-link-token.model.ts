import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITelegramLinkToken extends Document {
  userId: Types.ObjectId;
  email: string;
  displayName: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramLinkTokenSchema = new Schema<ITelegramLinkToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true },
    displayName: { type: String, default: "" },
    code: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

TelegramLinkTokenSchema.index({ userId: 1 }, { unique: true });
TelegramLinkTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TelegramLinkTokenModel = mongoose.model<ITelegramLinkToken>(
  "TelegramLinkToken",
  TelegramLinkTokenSchema
);
