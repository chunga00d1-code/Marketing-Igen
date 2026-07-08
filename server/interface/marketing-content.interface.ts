import { Document, Types } from "mongoose";

export interface IMarketingContent extends Document {
  title: string;
  channel: "Facebook" | "TikTok" | "LinkedIn" | "Instagram" | "Zalo";
  contentType: string;
  status: "draft" | "pending" | "approved" | "scheduled" | "published" | "processing" | "failed";
  bodyText: string;
  outline?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaPrompt?: string;
  voiceScript?: string;
  motionText?: string;
  audioUrl?: string;
  audioRecordId?: string;
  videoProvider?: string;
  generatedAt: Date;
  feedback?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  authorUid?: string;
  publishedAt?: Date;
  facebookPostId?: string;
  postUrl?: string;
  publishError?: string | null;
  tiktokPostId?: string;
  tiktokPublishId?: string;
  tiktokShareUrl?: string;
  tiktokProvider?: string;
  tiktokLastWebhookEvent?: string;
  tiktokWebhookUpdatedAt?: Date;
  companyCode: string;
  integrationId?: Types.ObjectId | string; // ID tài khoản mạng xã hội liên kết dùng để đăng bài
  referenceImage?: string;
  sourceBrief?: string;
  mediaType?: "image" | "video" | "human-video";
  engineType?: string;
  avatarId?: string;
  voiceId?: string;
  inputText?: string;
}
