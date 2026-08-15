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
    modelName?: string;
    negativePrompt?: string;
    status?: string;
    title?: string;
    description?: string;
    captionedVideoUrl?: string;
    subtitleUrl?: string;
    thumbnailUrl?: string;
    piapiTaskId?: string;
    openrouterVideoJobId?: string;
    activeCardId?: string;
    progress?: number;
    error?: string;
    renderLogs?: string[];
    blueprint?: string;
    hermesSessionId?: string;
    referenceVideoUrl?: string;
    parentMediaId?: string;
    rootMediaId?: string;
    revision?: number;
    editType?: "region" | "global" | "crop";
    sourceImageUrl?: string;
    referenceImageUrls?: string[];
    editInstruction?: string;
    regionNote?: string;
    editStrokes?: Array<{
      color?: string;
      width?: number;
      points: Array<{ x: number; y: number }>;
    }>;
    requestId?: string;
    editRegion?: { x: number; y: number; width: number; height: number };
    cropRegion?: { x: number; y: number; width: number; height: number };
    preserveOutsideRegion?: boolean;
  };
  createdAt: Date;
}
