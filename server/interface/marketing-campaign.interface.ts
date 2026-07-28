import { Document, Types } from "mongoose";

export type MarketingCampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled" | "failed";
export type MarketingCampaignPlatform = "Facebook" | "TikTok";
export type MarketingCampaignMediaPolicy = "text" | "image" | "video" | "auto";
export type MarketingCampaignType = "single" | "campaign";

export interface ICampaignAssetOrderCustomField {
  key: string;
  label: string;
  archived: boolean;
  createdAt: Date;
}

export interface IMarketingCampaign extends Document {
  companyCode: string;
  createdBy: string;
  title: string;
  sourceBrief: string;
  campaignType: MarketingCampaignType;
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
  captionMode?: "none" | "speech" | "context" | "combined";
  contentPillars: string[];
  rules: {
    requiredCta?: string;
    requiredHashtags?: string[];
    forbiddenTerms?: string[];
    allowTextOnlyFallback?: boolean;
  };
  qualityMode?: "premium" | "budget";
  publishMode?: "auto" | "manual";
  imageMode?: "ai" | "real";
  googleDriveFolderUrl?: string;
  customSchedule?: Record<string, string[]>;
  researchReport?: string;
  apifySources?: string[];
  /** Columns the team adds to the campaign's production-brief spreadsheet. */
  assetOrderCustomFields: ICampaignAssetOrderCustomField[];
  contentMatrix?: Array<{
    pillar: string;
    direction: string;
    targetPercentage: number;
    angles: Array<{
      title: string;
      funnel: "TOFU" | "MOFU" | "BOFU";
    }>;
  }>;
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
