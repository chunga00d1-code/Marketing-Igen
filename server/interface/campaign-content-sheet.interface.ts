import { Document, Types } from "mongoose";

export type CampaignSheetDataType =
  | "short_text"
  | "long_text"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "select"
  | "multi_select"
  | "url"
  | "media_url"
  | "boolean";

export type CampaignSheetFieldSource = "system" | "user" | "ai" | "knowledge" | "import";
export type CampaignSheetFieldPolicy = "input" | "constraint" | "approved_override" | "note";

export interface ICampaignSheetColumn {
  id: string;
  key: string;
  label: string;
  kind: "system" | "custom";
  dataType: CampaignSheetDataType;
  systemField?: string;
  required: boolean;
  archived: boolean;
  options?: string[];
  defaultValue?: unknown;
  fieldPolicy: CampaignSheetFieldPolicy;
  ai: {
    enabled: boolean;
    instruction?: string;
    allowedSources: Array<"row" | "campaign" | "knowledge">;
    sensitiveBusinessField: boolean;
    knowledgeDocumentTypes?: string[];
  };
  display: {
    order: number;
    width?: number;
    hidden?: boolean;
    frozen?: boolean;
  };
}

export interface ICampaignSheetConfig extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  columns: ICampaignSheetColumn[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignSheetReference {
  kind: "campaign" | "slot" | "knowledge_document" | "knowledge_chunk";
  id: string;
  title?: string;
  version?: string;
  excerpt?: string;
}

export interface ICampaignSheetStoredField {
  key: string;
  value: unknown;
  source: CampaignSheetFieldSource;
  locked: boolean;
  updatedBy: string;
  updatedAt: Date;
  generationId?: string;
  references?: ICampaignSheetReference[];
}

export interface ICampaignSheetRow extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  slotId: Types.ObjectId;
  revision: number;
  fields: ICampaignSheetStoredField[];
  lastEditedBy?: string;
  lastEditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignSheetRevisionChange {
  slotId: Types.ObjectId;
  fieldKey: string;
  before?: unknown;
  after?: unknown;
}

export interface ICampaignSheetRevision extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  actorType: "user" | "ai";
  actorId: string;
  operation: string;
  baseRevision: number;
  changes: ICampaignSheetRevisionChange[];
  generationJobId?: Types.ObjectId;
  createdAt: Date;
}

export type CampaignSheetAIJobStatus =
  | "queued"
  | "processing"
  | "awaiting_review"
  | "applying"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface ICampaignSheetAIProposal {
  slotId: Types.ObjectId;
  expectedRevision: number;
  fields: Array<{
    key: string;
    value: unknown;
    confidence: number;
    references: ICampaignSheetReference[];
    warning?: string;
  }>;
  warnings: string[];
  status: "proposed" | "applied" | "conflict" | "failed";
}

export interface ICampaignSheetAIJob extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  createdBy: string;
  operation: "cell" | "row" | "column" | "selection";
  overwritePolicy: "empty_only" | "suggest_only" | "replace_selected";
  targetSlotIds: Types.ObjectId[];
  targetFieldKeys: string[];
  status: CampaignSheetAIJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  conflictedItems: number;
  progress: number;
  modelName: string;
  estimatedCost: number;
  actualCost: number;
  idempotencyKey: string;
  proposals: ICampaignSheetAIProposal[];
  attemptCount: number;
  lockId?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  cancelRequestedAt?: Date;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
