import { Schema, model } from "mongoose";
import { ICompany } from "../interface/company.interface";

const CompanyHeyGenConfigSchema = new Schema(
  {
    apiKey: { type: String, default: "" },
    defaultAvatarId: { type: String, default: "" },
    defaultVoiceId: { type: String, default: "" },
    isConnected: { type: Boolean, default: false },
    connectedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
  },
  { _id: false }
);

const CompanyElevenLabsConfigSchema = new Schema(
  {
    apiKey: { type: String, default: "" },
  },
  { _id: false }
);

const CompanySchema = new Schema<ICompany>({
  code: { type: String, required: true, unique: true, index: true, uppercase: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  ownerEmail: { type: String, required: true },
  heygenConfig: { type: CompanyHeyGenConfigSchema, default: () => ({}) },
  elevenlabsConfig: { type: CompanyElevenLabsConfigSchema, default: () => ({}) },
});

export const CompanyModel = model<ICompany>("Company", CompanySchema);
