import { Schema, model } from "mongoose";
import { ISocialIntegration } from "../interface/social-integration.interface";
import { AiAutoReplyConfigSchema } from "./user.model";

const SocialIntegrationSchema = new Schema<ISocialIntegration>({
  companyCode: { type: String, required: true, index: true },
  platform: { type: String, enum: ["Facebook", "TikTok", "Zalo"], required: true, index: true },
  displayName: { type: String, required: true },
  username: { type: String, index: true },
  avatarUrl: { type: String },
  isConnected: { type: Boolean, default: true, index: true },
  connectedAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true },
  blotatoAccountId: { type: String, index: true },
  fbAppId: { type: String },      // Facebook App ID (từ Meta Developer, mỗi công ty có riêng)
  accessToken: { type: String },
  refreshToken: { type: String },
  tokenExpiredAt: { type: Date },
  appSecret: { type: String },    // Facebook App Secret (từ Meta Developer, mỗi công ty có riêng)
  verifyToken: { type: String },
  isMock: { type: Boolean, default: false },
  aiAutoReplyConfig: { type: AiAutoReplyConfigSchema, default: () => ({}) },
});


SocialIntegrationSchema.index({ platform: 1, username: 1, isConnected: 1 });
SocialIntegrationSchema.index({ companyCode: 1, platform: 1, isConnected: 1 });

export const SocialIntegrationModel = model<ISocialIntegration>(
  "SocialIntegration",
  SocialIntegrationSchema
);
