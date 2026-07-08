import { Schema, model } from "mongoose";
import { IAIMedia } from "../interface/ai-media.interface";

const AIMediaSchema = new Schema<IAIMedia>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  mediaType: { type: String, enum: ["image", "video", "voice"], required: true, index: true },
  url: { type: String, default: "" },
  prompt: { type: String, default: "" },
  metadata: {
    voiceName: { type: String },
    duration: { type: Schema.Types.Mixed },
    aspectRatio: { type: String },
    resolution: { type: String },
    originalVeoUrl: { type: String },
    heygenVideoId: { type: String, index: true },
    heygenAvatarId: { type: String },
    heygenVoiceId: { type: String },
    heygenAudioUrl: { type: String },
    heygenAudioRecordId: { type: String },
    heygenLastWebhookEvent: { type: String },
    heygenWebhookUpdatedAt: { type: String },
    provider: { type: String },
    status: { type: String },
    title: { type: String },
    description: { type: String },
    captionedVideoUrl: { type: String },
    subtitleUrl: { type: String },
    thumbnailUrl: { type: String },
    piapiTaskId: { type: String },
    activeCardId: { type: String },
    progress: { type: Number },
    error: { type: String },
    renderLogs: { type: [String] },
    blueprint: { type: String },
    hermesSessionId: { type: String, index: true },
    referenceVideoUrl: { type: String },
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const AIMediaModel = model<IAIMedia>("AIMedia", AIMediaSchema);
