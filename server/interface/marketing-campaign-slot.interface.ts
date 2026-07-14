import { Document, Types } from "mongoose";
import { MarketingCampaignPlatform } from "./marketing-campaign.interface";

export type MarketingCampaignSlotStatus =
  | "planned"
  | "queued"
  | "generating"
  | "researching"
  | "writing"
  | "scoring"
  | "generating_media"
  | "verifying"
  | "pending_approval"
  | "ready_to_publish"
  | "publishing"
  | "published"
  | "retrying"
  | "needs_attention"
  | "failed"
  | "skipped"
  | "cancelled";

export interface IMarketingCampaignSlot extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  scheduledAt: Date;
  prepareAt: Date;
  verifyAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  platform: MarketingCampaignPlatform;
  integrationId?: Types.ObjectId;
  pillar: string;
  objective: string;
  topicBrief: string;
  mediaType: "text" | "image" | "video" | "human-video";
  status: MarketingCampaignSlotStatus;
  attemptCount: number;
  lockId?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  selectedCandidateId?: Types.ObjectId;
  marketingContentId?: Types.ObjectId;
  realImageDriveUrls?: string[];
  realImageDirectUrls?: string[];
  visualAnalysis?: {
    fingerprint: string;
    sourceUrls: string[];
    summary: string;
    subjects: string[];
    visibleText: string[];
    setting: string;
    visualStyle: string;
    mood: string;
    factualDetails: string[];
    marketingAngles: string[];
    cautions: string[];
    model: string;
    analyzedAt: Date;
    cost: number;
    billedAt?: Date;
  };
  customBodyText?: string;
  publishIdempotencyKey: string;
  publishRequestedAt?: Date;
  publishedPostId?: string;
  publishedUrl?: string;
  lastError?: {
    type: "retryable" | "validation" | "authentication" | "budget" | "provider" | "terminal";
    message: string;
    occurredAt: Date;
  };
  transitions: Array<{
    from?: MarketingCampaignSlotStatus;
    to: MarketingCampaignSlotStatus;
    reason?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
