import { Schema, model } from "mongoose";
import { IMarketingContent } from "../interface/marketing-content.interface";

const MarketingContentSchema = new Schema<IMarketingContent>(
  {
    title: { type: String, required: true, index: true },
    channel: { type: String, enum: ["Facebook", "TikTok", "LinkedIn", "Instagram", "Zalo"], required: true, index: true },
    contentType: { type: String, required: true },
    status: { type: String, enum: ["draft", "pending", "approved", "scheduled", "published", "processing", "failed"], default: "draft", index: true },
    bodyText: { type: String, required: true },
    outline: { type: String },
    imageUrl: { type: String },
    videoUrl: { type: String },
    mediaPrompt: { type: String },
    voiceScript: { type: String },
    motionText: { type: String },
    audioUrl: { type: String },
    audioRecordId: { type: String },
    videoProvider: { type: String },
    generatedAt: { type: Date, default: Date.now, index: true },
    feedback: { type: String },
    scheduledDate: { type: String },
    scheduledTime: { type: String },
    authorUid: { type: String, index: true },
    publishedAt: { type: Date },
    facebookPostId: { type: String },
    postUrl: { type: String },
    publishError: { type: String },
    tiktokPostId: { type: String },
    tiktokPublishId: { type: String, index: true },
    tiktokShareUrl: { type: String },
    tiktokProvider: { type: String },
    tiktokLastWebhookEvent: { type: String },
    tiktokWebhookUpdatedAt: { type: Date },
    companyCode: { type: String, required: true, index: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "SocialIntegration", index: true },
    referenceImage: { type: String },
    sourceBrief: { type: String },
    mediaType: { type: String, enum: ["image", "video", "human-video"] },
    engineType: { type: String },
    avatarId: { type: String },
    voiceId: { type: String },
    inputText: { type: String },
  },
  { timestamps: false }
);

export const MarketingContentModel = model<IMarketingContent>("MarketingContent", MarketingContentSchema);
