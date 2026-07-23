import { FacebookIntegration, TikTokIntegration, ZaloIntegration } from "./integrations";
import { AIChatConfig } from "./crm";

export type TabType =
  | "TONG QUAN"
  | "MARKETING"
  | "XUONG NOI DUNG"
  | "SALES CRM"
  | "QUAN TRI USER"
  | "VI & NAP TIEN"
  | "CAI DAT"
  | "HUONG DAN SU DUNG";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: "user" | "manager" | "admin" | "superadmin";
  createdAt: string | Date;
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
  connectedAt?: string | Date | null;
  lastSyncAt?: string | Date | null;
}

export interface CompanyProfile {
  id: string;
  code: string;
  name: string;
  createdAt: string | Date;
  ownerEmail: string;
  heygenConfig?: CompanyHeyGenConfig;
}

export interface TelegramLinkStatus {
  linked: boolean;
  telegramChatId: number | null;
  telegramUserId: number | null;
  linkedAt: string | Date | null;
  pendingCode: string | null;
  pendingCodeExpiresAt: string | Date | null;
  botUsername: string;
}
