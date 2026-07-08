import mongoose, { Schema, Document } from "mongoose";

export interface IAIKnowledgeDocument extends Document {
  companyCode: string;
  sourceType: "manual" | "google_doc";
  sourceTitle: string;
  sourceUrl?: string;
  status: "active" | "syncing" | "failed";
  version: number;
  channelScope: Array<"facebook" | "zalo" | "all">;
  contentHash: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAIKnowledgeChunk extends Document {
  companyCode: string;
  documentId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  embedding: number[];
  tokensApprox: number;
  channelScope: Array<"facebook" | "zalo" | "all">;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const AIKnowledgeDocumentSchema = new Schema<IAIKnowledgeDocument>(
  {
    companyCode: { type: String, required: true, index: true },
    sourceType: { type: String, enum: ["manual", "google_doc"], required: true },
    sourceTitle: { type: String, required: true },
    sourceUrl: { type: String, default: "" },
    status: { type: String, enum: ["active", "syncing", "failed"], default: "active", index: true },
    version: { type: Number, default: 1 },
    channelScope: { type: [String], enum: ["facebook", "zalo", "all"], default: ["all"] },
    contentHash: { type: String, required: true },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

const AIKnowledgeChunkSchema = new Schema<IAIKnowledgeChunk>(
  {
    companyCode: { type: String, required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: "AIKnowledgeDocument", required: true, index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    tokensApprox: { type: Number, default: 0 },
    channelScope: { type: [String], enum: ["facebook", "zalo", "all"], default: ["all"] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

AIKnowledgeDocumentSchema.index({ companyCode: 1, sourceType: 1, sourceUrl: 1 });
AIKnowledgeDocumentSchema.index({ companyCode: 1, contentHash: 1 });
AIKnowledgeChunkSchema.index({ companyCode: 1, documentId: 1, chunkIndex: 1 }, { unique: true });
AIKnowledgeChunkSchema.index({ companyCode: 1, updatedAt: -1 });
AIKnowledgeChunkSchema.index({ companyCode: 1, channelScope: 1, updatedAt: -1 });

export const AIKnowledgeDocumentModel = mongoose.model<IAIKnowledgeDocument>(
  "AIKnowledgeDocument",
  AIKnowledgeDocumentSchema
);

export const AIKnowledgeChunkModel = mongoose.model<IAIKnowledgeChunk>(
  "AIKnowledgeChunk",
  AIKnowledgeChunkSchema
);
