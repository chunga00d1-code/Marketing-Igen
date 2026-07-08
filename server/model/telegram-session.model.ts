import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITelegramSession extends Document {
  telegramChatId: number;
  telegramUserId?: number;
  userId: Types.ObjectId;
  email: string;
  displayName: string;
  role: string;
  companyCode: string;
  linkedAt: Date;
}

const TelegramSessionSchema = new Schema<ITelegramSession>(
  {
    telegramChatId: { type: Number, required: true, unique: true },
    telegramUserId: { type: Number, default: undefined },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true },
    displayName: { type: String, default: "" },
    role: { type: String, default: "user" },
    companyCode: { type: String, default: "" },
    linkedAt: { type: Date, default: Date.now },
  }
);

// Đảm bảo mỗi userId chỉ liên kết với 1 tài khoản Telegram duy nhất
TelegramSessionSchema.index({ userId: 1 }, { unique: true });
TelegramSessionSchema.index(
  { telegramUserId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      telegramUserId: { $exists: true, $type: "number" },
    },
  }
);

export const TelegramSessionModel = mongoose.model<ITelegramSession>(
  "TelegramSession",
  TelegramSessionSchema
);
