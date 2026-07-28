import { model, Schema } from "mongoose";
import {
  ICampaignSheetAIJob,
  ICampaignSheetConfig,
  ICampaignSheetRevision,
  ICampaignSheetRow,
} from "../interface/campaign-content-sheet.interface";

const referenceSchema = new Schema(
  {
    kind: { type: String, enum: ["campaign", "slot", "knowledge_document", "knowledge_chunk"], required: true },
    id: { type: String, required: true },
    title: { type: String },
    version: { type: String },
    excerpt: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const columnSchema = new Schema(
  {
    id: { type: String, required: true },
    key: { type: String, required: true },
    label: { type: String, required: true },
    kind: { type: String, enum: ["system", "custom"], required: true },
    dataType: {
      type: String,
      enum: ["short_text", "long_text", "number", "currency", "date", "datetime", "select", "multi_select", "url", "media_url", "boolean"],
      required: true,
    },
    systemField: { type: String },
    required: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    defaultValue: { type: Schema.Types.Mixed },
    fieldPolicy: { type: String, enum: ["input", "constraint", "approved_override", "note"], default: "input" },
    ai: {
      enabled: { type: Boolean, default: true },
      instruction: { type: String, maxlength: 2000 },
      allowedSources: { type: [String], enum: ["row", "campaign", "knowledge"], default: ["row", "campaign"] },
      sensitiveBusinessField: { type: Boolean, default: false },
      knowledgeDocumentTypes: { type: [String], default: [] },
      _id: false,
    },
    display: {
      order: { type: Number, required: true },
      width: { type: Number, min: 80, max: 800 },
      hidden: { type: Boolean, default: false },
      frozen: { type: Boolean, default: false },
      _id: false,
    },
  },
  { _id: false }
);

const CampaignSheetConfigSchema = new Schema<ICampaignSheetConfig>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    columns: { type: [columnSchema], default: [] },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true }
);

const storedFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    source: { type: String, enum: ["system", "user", "ai", "knowledge", "import"], required: true },
    locked: { type: Boolean, default: false },
    updatedBy: { type: String, required: true },
    updatedAt: { type: Date, required: true },
    generationId: { type: String },
    references: { type: [referenceSchema], default: [] },
  },
  { _id: false }
);

const CampaignSheetRowSchema = new Schema<ICampaignSheetRow>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    slotId: { type: Schema.Types.ObjectId, ref: "MarketingCampaignSlot", required: true, index: true },
    revision: { type: Number, default: 0 },
    fields: { type: [storedFieldSchema], default: [] },
    lastEditedBy: { type: String },
    lastEditedAt: { type: Date },
  },
  { timestamps: true }
);

const revisionChangeSchema = new Schema(
  {
    slotId: { type: Schema.Types.ObjectId, required: true },
    fieldKey: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const CampaignSheetRevisionSchema = new Schema<ICampaignSheetRevision>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    actorType: { type: String, enum: ["user", "ai"], required: true },
    actorId: { type: String, required: true },
    operation: { type: String, required: true },
    baseRevision: { type: Number, required: true },
    changes: { type: [revisionChangeSchema], required: true },
    generationJobId: { type: Schema.Types.ObjectId, ref: "CampaignSheetAIJob" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const proposalFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    references: { type: [referenceSchema], default: [] },
    warning: { type: String },
  },
  { _id: false }
);

const proposalSchema = new Schema(
  {
    slotId: { type: Schema.Types.ObjectId, required: true },
    expectedRevision: { type: Number, required: true },
    fields: { type: [proposalFieldSchema], default: [] },
    warnings: { type: [String], default: [] },
    status: { type: String, enum: ["proposed", "applied", "conflict", "failed"], default: "proposed" },
  },
  { _id: false }
);

const CampaignSheetAIJobSchema = new Schema<ICampaignSheetAIJob>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    operation: { type: String, enum: ["cell", "row", "column", "selection"], required: true },
    overwritePolicy: { type: String, enum: ["empty_only", "suggest_only", "replace_selected"], default: "empty_only" },
    targetSlotIds: { type: [Schema.Types.ObjectId], required: true },
    targetFieldKeys: { type: [String], required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "awaiting_review", "applying", "completed", "partial", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    totalItems: { type: Number, default: 0 },
    completedItems: { type: Number, default: 0 },
    failedItems: { type: Number, default: 0 },
    conflictedItems: { type: Number, default: 0 },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    modelName: { type: String, default: "" },
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    idempotencyKey: { type: String, required: true },
    proposals: { type: [proposalSchema], default: [] },
    attemptCount: { type: Number, default: 0 },
    lockId: { type: String, index: true },
    lockedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    cancelRequestedAt: { type: Date },
    errorMessage: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

CampaignSheetConfigSchema.index({ companyCode: 1, campaignId: 1 }, { unique: true });
CampaignSheetRowSchema.index({ companyCode: 1, campaignId: 1, slotId: 1 }, { unique: true });
CampaignSheetRevisionSchema.index({ companyCode: 1, campaignId: 1, createdAt: -1 });
CampaignSheetAIJobSchema.index({ companyCode: 1, campaignId: 1, createdAt: -1 });
CampaignSheetAIJobSchema.index({ companyCode: 1, idempotencyKey: 1 }, { unique: true });
CampaignSheetAIJobSchema.index({ status: 1, lockExpiresAt: 1, createdAt: 1 });

export const CampaignSheetConfigModel = model<ICampaignSheetConfig>("CampaignSheetConfig", CampaignSheetConfigSchema);
export const CampaignSheetRowModel = model<ICampaignSheetRow>("CampaignSheetRow", CampaignSheetRowSchema);
export const CampaignSheetRevisionModel = model<ICampaignSheetRevision>("CampaignSheetRevision", CampaignSheetRevisionSchema);
export const CampaignSheetAIJobModel = model<ICampaignSheetAIJob>("CampaignSheetAIJob", CampaignSheetAIJobSchema);
