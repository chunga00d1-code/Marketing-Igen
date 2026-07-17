import { Document, Schema } from "mongoose";

export interface ISocialPostMetric extends Document {
  companyCode: string;
  campaignId: Schema.Types.ObjectId;
  slotId: Schema.Types.ObjectId;
  platform: "Facebook" | "TikTok";
  postId: string;
  postUrl?: string;

  // Facebook metrics
  impressions?: number;
  reach?: number;
  clicks?: number;

  // Common metrics
  likes: number;
  comments: number;
  shares: number;
  views?: number;

  syncedAt: Date;
  syncCount: number;
  syncError?: string;
  createdAt: Date;
  updatedAt: Date;
}
