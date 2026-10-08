import { Document } from "mongoose";

export interface ICompanyHeyGenConfig {
  apiKey: string;
  defaultAvatarId: string;
  defaultVoiceId: string;
  isConnected: boolean;
  connectedAt?: Date | null;
  lastSyncAt?: Date | null;
}

export interface ICompanyElevenLabsConfig {
  apiKey: string;
}

export interface ICompanyTelegramOrderConfig {
  enabled: boolean;
  notifyNewOrder: boolean;
  botTokenEncrypted: string;
  groupChatId: string;
  messageThreadId?: number | null;
  botUsername: string;
  lastTestedAt?: Date | null;
  lastTestStatus?: "success" | "failed" | "untested";
  lastTestError?: string;
}

export interface ICompanySepayConfig {
  enabled: boolean;
  webhookId: string;
  webhookSecretEncrypted: string;
  accountNumbers: string[];
  paymentCodePrefix: string;
  depositEnabled?: boolean;
  depositPercent?: number;
  qrBankId?: string;
  qrAccountNumber?: string;
  qrAccountName?: string;
  lastWebhookAt?: Date | null;
  lastWebhookStatus?: "success" | "failed" | "untested";
  lastWebhookError?: string;
}

export interface ICompanyCakeCatalogConfig {
  enabled: boolean;
  rootFolderUrl: string;
  maxImagesPerReply: number;
}

export interface ICompany extends Document {
  code: string;
  name: string;
  createdAt: Date;
  ownerEmail: string;
  heygenConfig?: ICompanyHeyGenConfig;
  elevenlabsConfig?: ICompanyElevenLabsConfig;
  telegramOrderConfig?: ICompanyTelegramOrderConfig;
  sepayConfig?: ICompanySepayConfig;
  cakeCatalogConfig?: ICompanyCakeCatalogConfig;
}
