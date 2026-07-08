import mongoose, { Schema, Document } from "mongoose";

export interface ITelegramProcessedUpdate extends Document {
  updateId: number;
  processedAt: Date;
}

const TelegramProcessedUpdateSchema = new Schema<ITelegramProcessedUpdate>(
  {
    updateId: { type: Number, required: true, unique: true, index: true },
    processedAt: { type: Date, default: Date.now, expires: 86400 }, // Tự động xóa sau 24 giờ
  }
);

export const TelegramProcessedUpdateModel = mongoose.model<ITelegramProcessedUpdate>(
  "TelegramProcessedUpdate",
  TelegramProcessedUpdateSchema
);
