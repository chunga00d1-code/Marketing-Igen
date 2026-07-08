import { Schema, model } from "mongoose";
import { IUser } from "../interface/user.interface";

const FacebookIntegrationSchema = new Schema(
  {
    isConnected: { type: Boolean, default: false },
    pageId: { type: String, default: "" },
    pageName: { type: String, default: "" },
    pageAccessToken: { type: String, default: "" },
    appSecret: { type: String, default: "" },
    verifyToken: { type: String, default: "" },
    connectedAt: { type: Date },
    isMock: { type: Boolean, default: false },
  },
  { _id: false }
);

const TikTokIntegrationSchema = new Schema(
  {
    isConnected: { type: Boolean, default: false },
    username: { type: String, default: "" },
    displayName: { type: String, default: "" },
    avatarUrl: { type: String },
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiredAt: { type: Date },
    clientKey: { type: String },
    clientSecret: { type: String },
    scopes: { type: [String], default: [] },
    connectedAt: { type: Date },
    privacyLevel: { type: String, default: "SELF_ONLY" },
    isMock: { type: Boolean, default: false },
  },
  { _id: false }
);

const ZaloIntegrationSchema = new Schema(
  {
    isConnected: { type: Boolean, default: false },
    oaId: { type: String, default: "" },
    oaName: { type: String, default: "" },
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    tokenExpiredAt: { type: Date },
    connectedAt: { type: Date },
    isMock: { type: Boolean, default: false },
  },
  { _id: false }
);

export const AiAutoReplyConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    commentReplyEnabled: { type: Boolean, default: false },
    autoClassify: { type: Boolean, default: true },
    autoCloseDeal: { type: Boolean, default: false },
    autoFeedback: { type: Boolean, default: false },
    replyDelay: { type: Number, default: 15 },
    advancedInstructions: { type: String, default: "" },
    trainingKnowledge: { type: String, default: "" },
    model: { type: String, default: "gemini-3.5-flash" },
    disabledAt: { type: Date, default: null },
  },
  { _id: false }
);

const HeyGenAccessSchema = new Schema(
  {
    avatarIds: { type: [String], default: [] },
    avatarId: { type: String, default: "" },
    voiceId: { type: String, default: "" },
    apiKey: { type: String, default: "" },
  },
  { _id: false }
);

const ElevenLabsAccessSchema = new Schema(
  {
    apiKey: { type: String, default: "" },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, index: true, lowercase: true },
  password: { type: String },
  displayName: { type: String, required: true },
  photoURL: { type: String },
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now },
  facebookIntegration: { type: FacebookIntegrationSchema, default: null },
  tiktokIntegration: { type: TikTokIntegrationSchema, default: null },
  zaloIntegration: { type: ZaloIntegrationSchema, default: null },
  aiAutoReplyConfig: { type: AiAutoReplyConfigSchema, default: () => ({}) },
  heygenAccess: { type: HeyGenAccessSchema, default: () => ({}) },
  elevenlabsAccess: { type: ElevenLabsAccessSchema, default: () => ({}) },
  jobTitle: { type: String },
  department: { type: String },
  phone: { type: String },
  level: { type: Number },
  parentId: { type: String },
  status: { type: String, enum: ["online", "offline"], default: "offline" },
  division: { type: String },
  companyCode: { type: String, index: true },
  companyName: { type: String },
  permissions: { type: [String], default: [] },
});

export const UserModel = model<IUser>("User", UserSchema);
