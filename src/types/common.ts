import { FacebookIntegration, TikTokIntegration, ZaloIntegration } from "./integrations";
import { AIChatConfig } from "./crm";

export type TabType =
  | "MARKETING"
  | "SALES CRM"
  | "QUẢN TRỊ USER"
  | "VÍ & NẠP TIỀN"
  | "CÀI ĐẶT";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: "user" | "manager" | "admin" | "superadmin";
  createdAt: any;
  facebookIntegration?: FacebookIntegration | null;
  tiktokIntegration?: TikTokIntegration | null;
  zaloIntegration?: ZaloIntegration | null;
  aiAutoReplyConfig?: AIChatConfig | null;
  heygenAccess?: {
    avatarIds?: string[];
    avatarId?: string;
    voiceId?: string;
    apiKey?: string;
  } | null;
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

export interface CompanyHeyGenConfig {
  apiKey: string;
  defaultAvatarId: string;
  defaultVoiceId: string;
  isConnected: boolean;
  connectedAt?: any | null;
  lastSyncAt?: any | null;
}

export interface CompanyProfile {
  id: string;
  code: string;
  name: string;
  createdAt: any;
  ownerEmail: string;
  heygenConfig?: CompanyHeyGenConfig;
}

export interface TelegramLinkStatus {
  linked: boolean;
  telegramChatId: number | null;
  telegramUserId: number | null;
  linkedAt: any | null;
  pendingCode: string | null;
  pendingCodeExpiresAt: any | null;
  botUsername: string;
}
