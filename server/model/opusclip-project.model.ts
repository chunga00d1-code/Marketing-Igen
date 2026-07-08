import { Schema, model } from "mongoose";
import { IOpusClipProject } from "../interface/opusclip-project.interface";

const OpusClipProjectSchema = new Schema<IOpusClipProject>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: String, required: true, unique: true, index: true },
    videoUrl: { type: String, required: true },
    name: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    lengthOption: { type: String, default: "auto" },
    language: { type: String, default: "auto" },
    brandTemplateId: { type: String, default: "" },
    clips: [
      {
        clipId: { type: String, required: true },
        videoUrl: { type: String, required: true },
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        hashtags: { type: String, default: "" },
        viralityScore: { type: Number, default: 0 },
        viralReason: { type: String, default: "" },
        duration: { type: Number, default: 0 },
        startTime: { type: Number, default: 0 },
        endTime: { type: Number, default: 0 },
      },
    ],
    error: { type: String, default: "" },
  },
  {
    timestamps: true, // Tự động tạo createdAt, updatedAt và tự động đánh chỉ mục nếu cần
  }
);

// Thêm chỉ mục cho createdAt để hỗ trợ sắp xếp theo thời gian mới nhất nhanh hơn
OpusClipProjectSchema.index({ createdAt: -1 });

export const OpusClipProjectModel = model<IOpusClipProject>("OpusClipProject", OpusClipProjectSchema);
