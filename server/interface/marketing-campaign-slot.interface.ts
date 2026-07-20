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
  funnelStage?: "TOFU" | "MOFU" | "BOFU";
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
  mediaIngestionFingerprint?: string;
  ingestedMedia?: Array<{
    sourceUrl: string;
    url: string;
    uploadedAt: Date;
  }>;
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
  researchAnalysis?: {
    fingerprint: string;
    context: string;
    model: string;
    researchedAt: Date;
    cost: number;
    evidence: Array<{
      source: "google" | "facebook" | "tiktok";
      sourceUrl: string;
      title?: string;
      text: string;
      author?: string;
      publishedAt?: Date;
      collectedAt: Date;
      metrics?: {
        views?: number;
        likes?: number;
        comments?: number;
        shares?: number;
      };
    }>;
    apifyRuns: Array<{
      source: "google" | "facebook" | "tiktok";
      actorId: string;
      runId?: string;
      datasetId?: string;
      status: "succeeded" | "failed" | "skipped";
      itemCount: number;
      estimatedCostUsd: number;
      providerCostUsd: number;
      billingMode: "shadow" | "live";
      executedAt: Date;
      error?: string;
    }>;
    providerCostUsd: number;
    billingMode: "shadow" | "live";
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
