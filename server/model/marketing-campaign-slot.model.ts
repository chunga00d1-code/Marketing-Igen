import { model, Schema } from "mongoose";
import { IMarketingCampaignSlot } from "../interface/marketing-campaign-slot.interface";

const MarketingCampaignSlotSchema = new Schema<IMarketingCampaignSlot>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    prepareAt: { type: Date, required: true, index: true },
    verifyAt: { type: Date, required: true, index: true },
    platform: { type: String, enum: ["Facebook", "TikTok"], required: true, index: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "SocialIntegration", index: true },
    pillar: { type: String, default: "" },
    objective: { type: String, required: true },
    topicBrief: { type: String, required: true },
    mediaType: { type: String, enum: ["text", "image", "video", "human-video"], required: true },
    status: {
      type: String,
      enum: ["planned", "queued", "generating", "researching", "writing", "scoring", "generating_media", "verifying", "pending_approval", "ready_to_publish", "publishing", "published", "retrying", "needs_attention", "failed", "skipped", "cancelled"],
      default: "planned",
      index: true,
    },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    attemptCount: { type: Number, default: 0, min: 0 },
    lockId: { type: String, index: true },
    lockedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    selectedCandidateId: { type: Schema.Types.ObjectId, ref: "MarketingCandidate" },
    marketingContentId: { type: Schema.Types.ObjectId, ref: "MarketingContent" },
    realImageDriveUrls: { type: [String], default: [] },
    realImageDirectUrls: { type: [String], default: [] },
    customBodyText: { type: String },
    publishIdempotencyKey: { type: String, required: true, unique: true },
    publishRequestedAt: { type: Date },
    publishedPostId: { type: String },
    publishedUrl: { type: String },
    lastError: {
      type: { type: String, enum: ["retryable", "validation", "authentication", "budget", "provider", "terminal"] },
      message: { type: String },
      occurredAt: { type: Date },
    },
    transitions: [{
      from: { type: String },
      to: { type: String, required: true },
      reason: { type: String },
      at: { type: Date, required: true, default: Date.now },
      _id: false,
    }],
  },
  { timestamps: true }
);

MarketingCampaignSlotSchema.index({ companyCode: 1, campaignId: 1, scheduledAt: 1 });
MarketingCampaignSlotSchema.index({ status: 1, prepareAt: 1, lockExpiresAt: 1 });
MarketingCampaignSlotSchema.index({ status: 1, verifyAt: 1, lockExpiresAt: 1 });
MarketingCampaignSlotSchema.index({ status: 1, scheduledAt: 1, lockExpiresAt: 1 });

export const MarketingCampaignSlotModel = model<IMarketingCampaignSlot>("MarketingCampaignSlot", MarketingCampaignSlotSchema);
