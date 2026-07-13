import { Document, Types } from "mongoose";

export type MarketingCampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled" | "failed";
export type MarketingCampaignPlatform = "Facebook" | "TikTok";
export type MarketingCampaignMediaPolicy = "text" | "image" | "video" | "auto";

export interface IMarketingCampaign extends Document {
  companyCode: string;
  createdBy: string;
  title: string;
  sourceBrief: string;
  status: MarketingCampaignStatus;
  timezone: string;
  startDate: string;
  endDate: string;
  postsPerDay: number;
  postingTimes: string[];
  platforms: MarketingCampaignPlatform[];
  integrationIds: Partial<Record<MarketingCampaignPlatform, Types.ObjectId | string>>;
  candidateCount: number;
  generationLeadMinutes: number;
  verificationLeadMinutes: number;
  latePublishWindowMinutes: number;
  minimumScore: number;
  mediaPolicy: MarketingCampaignMediaPolicy;
  contentPillars: string[];
  rules: {
    requiredCta?: string;
    requiredHashtags?: string[];
    forbiddenTerms?: string[];
    allowTextOnlyFallback?: boolean;
  };
  qualityMode?: "premium" | "budget";
  publishMode?: "auto" | "manual";
  customSchedule?: Record<string, string[]>;
  statistics: {
    totalSlots: number;
    publishedSlots: number;
    failedSlots: number;
    estimatedCost: number;
    actualCost: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
