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

export interface ICompany extends Document {
  code: string;
  name: string;
  createdAt: Date;
  ownerEmail: string;
  heygenConfig?: ICompanyHeyGenConfig;
  elevenlabsConfig?: ICompanyElevenLabsConfig;
}
