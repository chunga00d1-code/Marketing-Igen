import { Schema, model } from "mongoose";
import { IUserDataDeletion } from "../interface/user-data-deletion.interface";

const UserDataDeletionSchema = new Schema<IUserDataDeletion>({
  facebookUserId: { type: String, required: true, index: true },
  confirmationCode: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "completed", // Xóa xong hoặc ngắt xong đánh dấu completed luôn
  },
  requestedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: Date.now },
  details: { type: String },
});

export const UserDataDeletionModel = model<IUserDataDeletion>(
  "UserDataDeletion",
  UserDataDeletionSchema
);
