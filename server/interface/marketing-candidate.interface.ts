import { Document, Types } from "mongoose";

export interface IMarketingCandidate extends Document {
  companyCode: string;
  campaignId: Types.ObjectId;
  slotId: Types.ObjectId;
  variant: string;
  title: string;
  outline: string;
  bodyText: string;
  mediaPrompt: string;
  voiceScript?: string;
  score: number;
  scoreDetails: {
    fidelity: number;
    objective: number;
    platform: number;
    hook: number;
    conversion: number;
    readability: number;
    novelty: number;
  };
  rejectionReasons: string[];
  selected: boolean;
  contentHash: string;
  usage: { model?: string; estimatedCost: number };
  createdAt: Date;
  updatedAt: Date;
}
