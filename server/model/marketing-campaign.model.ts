import { model, Schema } from "mongoose";
import { IMarketingCampaign } from "../interface/marketing-campaign.interface";

const MarketingCampaignSchema = new Schema<IMarketingCampaign>(
  {
    companyCode: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    title: { type: String, required: true },
    sourceBrief: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "completed", "cancelled", "failed"],
      default: "draft",
      index: true,
    },
    timezone: { type: String, required: true, default: "Asia/Bangkok" },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    postsPerDay: { type: Number, required: true, min: 1, max: 5 },
    postingTimes: { type: [String], required: true },
    platforms: [{ type: String, enum: ["Facebook", "TikTok"], required: true }],
    integrationIds: {
      Facebook: { type: Schema.Types.ObjectId, ref: "SocialIntegration" },
      TikTok: { type: Schema.Types.ObjectId, ref: "SocialIntegration" },
    },
    candidateCount: { type: Number, min: 2, max: 5, default: 3 },
    generationLeadMinutes: { type: Number, min: 15, max: 1440, default: 60 },
    verificationLeadMinutes: { type: Number, min: 5, max: 180, default: 15 },
    latePublishWindowMinutes: { type: Number, min: 0, max: 1440, default: 30 },
    minimumScore: { type: Number, min: 0, max: 100, default: 80 },
    mediaPolicy: { type: String, enum: ["text", "image", "video", "auto"], default: "auto" },
    contentPillars: { type: [String], default: [] },
    rules: {
      requiredCta: { type: String },
      requiredHashtags: { type: [String], default: [] },
      forbiddenTerms: { type: [String], default: [] },
      allowTextOnlyFallback: { type: Boolean, default: false },
    },
    qualityMode: { type: String, enum: ["premium", "budget"], default: "premium" },
    publishMode: { type: String, enum: ["auto", "manual"], default: "manual" },
    customSchedule: { type: Schema.Types.Map, of: [String] },
    statistics: {
      totalSlots: { type: Number, default: 0 },
      publishedSlots: { type: Number, default: 0 },
      failedSlots: { type: Number, default: 0 },
      estimatedCost: { type: Number, default: 0 },
      actualCost: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

MarketingCampaignSchema.index({ companyCode: 1, status: 1, createdAt: -1 });
MarketingCampaignSchema.index({ companyCode: 1, createdBy: 1, createdAt: -1 });

export const MarketingCampaignModel = model<IMarketingCampaign>("MarketingCampaign", MarketingCampaignSchema);
