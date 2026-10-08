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

const CompanyTelegramOrderConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    notifyNewOrder: { type: Boolean, default: true },
    botTokenEncrypted: { type: String, default: "", select: false },
    groupChatId: { type: String, default: "", trim: true },
    messageThreadId: { type: Number, default: null },
    botUsername: { type: String, default: "", trim: true },
    lastTestedAt: { type: Date, default: null },
    lastTestStatus: { type: String, enum: ["success", "failed", "untested"], default: "untested" },
    lastTestError: { type: String, default: "" },
  },
  { _id: false }
);

const CompanySepayConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    webhookId: { type: String, trim: true },
    webhookSecretEncrypted: { type: String, default: "", select: false },
    accountNumbers: { type: [String], default: [] },
    paymentCodePrefix: { type: String, default: "DH", trim: true, uppercase: true },
    qrBankId: { type: String, default: "", trim: true },
    qrAccountNumber: { type: String, default: "", trim: true },
    qrAccountName: { type: String, default: "", trim: true, maxlength: 100 },
    lastWebhookAt: { type: Date, default: null },
    lastWebhookStatus: { type: String, enum: ["success", "failed", "untested"], default: "untested" },
    lastWebhookError: { type: String, default: "" },
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
  telegramOrderConfig: { type: CompanyTelegramOrderConfigSchema, default: () => ({}) },
  sepayConfig: { type: CompanySepayConfigSchema, default: () => ({}) },
});

CompanySchema.index({ "sepayConfig.webhookId": 1 }, { unique: true, sparse: true });

export const CompanyModel = model<ICompany>("Company", CompanySchema);
