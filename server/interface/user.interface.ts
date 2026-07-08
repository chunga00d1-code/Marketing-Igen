import { Document } from "mongoose";

export interface IFacebookIntegration {
  isConnected: boolean;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  appSecret?: string;
  verifyToken?: string;
  connectedAt?: Date;
  isMock?: boolean;
}

export interface ITikTokIntegration {
  isConnected: boolean;
  username: string;
  displayName: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiredAt?: Date;
  clientKey?: string;
  clientSecret?: string;
  scopes?: string[];
  connectedAt?: Date;
  privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  isMock?: boolean;
}

export interface IZaloIntegration {
  isConnected: boolean;
  oaId: string;
  oaName: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiredAt: Date;
  connectedAt?: Date;
  isMock?: boolean;
}

export interface IAiAutoReplyConfig {
  enabled: boolean;
  commentReplyEnabled?: boolean;
  autoClassify: boolean;
  autoCloseDeal: boolean;
  autoFeedback: boolean;
  replyDelay: number;
  advancedInstructions: string;
  trainingKnowledge: string;
  model?: string;
  disabledAt?: string | null;
}

export interface IHeyGenAccessConfig {
  avatarIds?: string[];
  avatarId?: string;
  voiceId?: string;
  apiKey?: string;
}

export interface IElevenLabsAccessConfig {
  apiKey?: string;
}

export interface IUser extends Document {
  email: string;
  password?: string; // Hashed password
  displayName: string;
  photoURL?: string;
  role: string;
  createdAt: Date;
  facebookIntegration?: IFacebookIntegration | null;
  tiktokIntegration?: ITikTokIntegration | null;
  zaloIntegration?: IZaloIntegration | null;
  aiAutoReplyConfig?: IAiAutoReplyConfig | null;
  heygenAccess?: IHeyGenAccessConfig | null;
  elevenlabsAccess?: IElevenLabsAccessConfig | null;
  
  // Org Chart & SaaS fields
  jobTitle?: string;
  department?: string;
  phone?: string;
  level?: number;
  parentId?: string;
  status?: "online" | "offline";
  division?: string;
  companyCode?: string;
  companyName?: string;
  permissions?: string[];
}
