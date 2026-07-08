import { Document, Types } from "mongoose";

export interface IAIMedia extends Document {
  userId: Types.ObjectId;
  mediaType: "image" | "video" | "voice";
  url: string;
  prompt: string;
  metadata?: {
    voiceName?: string;
    duration?: number | string;
    aspectRatio?: string;
    resolution?: string;
    originalVeoUrl?: string;
    heygenVideoId?: string;
    heygenAvatarId?: string;
    heygenVoiceId?: string;
    heygenAudioUrl?: string;
    heygenAudioRecordId?: string;
    heygenLastWebhookEvent?: string;
    heygenWebhookUpdatedAt?: string;
    provider?: string;
    status?: string;
    title?: string;
    description?: string;
    captionedVideoUrl?: string;
    subtitleUrl?: string;
    thumbnailUrl?: string;
    piapiTaskId?: string;
    activeCardId?: string;
    progress?: number;
    error?: string;
    renderLogs?: string[];
    blueprint?: string;
    hermesSessionId?: string;
    referenceVideoUrl?: string;
  };
  createdAt: Date;
}
