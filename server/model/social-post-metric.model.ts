import { Schema, model } from "mongoose";
import { ISocialPostMetric } from "../interface/social-post-metric.interface";

const SocialPostMetricSchema = new Schema<ISocialPostMetric>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    slotId: { type: Schema.Types.ObjectId, ref: "MarketingCampaignSlot", required: true, unique: true, index: true },
    platform: { type: String, enum: ["Facebook", "TikTok"], required: true, index: true },
    postId: { type: String, required: true, index: true },
    postUrl: { type: String },

    // Facebook Specific Metrics
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },

    // Common Metrics
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },

    syncedAt: { type: Date, default: Date.now, index: true },
    syncCount: { type: Number, default: 0 },
    syncError: { type: String },
  },
  {
    timestamps: true,
  }
);

SocialPostMetricSchema.index({ postId: 1, platform: 1 }, { unique: true });
SocialPostMetricSchema.index({ companyCode: 1, campaignId: 1, platform: 1 });

export const SocialPostMetricModel = model<ISocialPostMetric>(
  "SocialPostMetric",
  SocialPostMetricSchema
);
