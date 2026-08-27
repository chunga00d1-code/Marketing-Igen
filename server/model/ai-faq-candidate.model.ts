import mongoose, { Schema, Document } from "mongoose";

export type FaqCandidateStatus = "pending" | "approved" | "rejected";
export type FaqCandidateCategory =
  | "pricing"
  | "shipping"
  | "product"
  | "warranty"
  | "payment"
  | "service"
  | "policy"
  | "general";

export interface IAIFaqCandidate extends Document {
  companyCode: string;
  question: string;
  suggestedAnswer: string;
  sampleCustomerMessages: string[];
  frequency: number;
  category: FaqCandidateCategory;
  source: "customer_chat" | "agent_response" | "negative_feedback" | "comment";
  confidenceScore: number;
  status: FaqCandidateStatus;
  lastAskedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  approvedDocumentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AIFaqCandidateSchema = new Schema<IAIFaqCandidate>(
  {
    companyCode: { type: String, required: true, index: true },
    question: { type: String, required: true },
    suggestedAnswer: { type: String, required: true },
    sampleCustomerMessages: { type: [String], default: [] },
    frequency: { type: Number, default: 1, index: true },
    category: {
      type: String,
      enum: ["pricing", "shipping", "product", "warranty", "payment", "service", "policy", "general"],
      default: "general",
      index: true,
    },
    source: {
      type: String,
      enum: ["customer_chat", "agent_response", "negative_feedback", "comment"],
      default: "customer_chat",
    },
    confidenceScore: { type: Number, default: 80 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    lastAskedAt: { type: Date, default: Date.now },
    reviewedBy: { type: String, default: "" },
    reviewedAt: { type: Date },
    approvedDocumentId: { type: Schema.Types.ObjectId, ref: "AIKnowledgeDocument" },
  },
  { timestamps: true }
);

AIFaqCandidateSchema.index({ companyCode: 1, status: 1, frequency: -1 });
AIFaqCandidateSchema.index({ companyCode: 1, question: 1 });

export const AIFaqCandidateModel = mongoose.model<IAIFaqCandidate>(
  "AIFaqCandidate",
  AIFaqCandidateSchema
);
