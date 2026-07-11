import { model, Schema } from "mongoose";
import { IMarketingCandidate } from "../interface/marketing-candidate.interface";

const MarketingCandidateSchema = new Schema<IMarketingCandidate>(
  {
    companyCode: { type: String, required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    slotId: { type: Schema.Types.ObjectId, ref: "MarketingCampaignSlot", required: true, index: true },
    variant: { type: String, required: true },
    title: { type: String, required: true },
    outline: { type: String, required: true },
    bodyText: { type: String, required: true },
    mediaPrompt: { type: String, required: true },
    voiceScript: { type: String },
    score: { type: Number, min: 0, max: 100, default: 0, index: true },
    scoreDetails: {
      fidelity: { type: Number, default: 0 },
      objective: { type: Number, default: 0 },
      platform: { type: Number, default: 0 },
      hook: { type: Number, default: 0 },
      conversion: { type: Number, default: 0 },
      readability: { type: Number, default: 0 },
      novelty: { type: Number, default: 0 },
    },
    rejectionReasons: { type: [String], default: [] },
    selected: { type: Boolean, default: false, index: true },
    contentHash: { type: String, required: true, index: true },
    usage: {
      model: { type: String },
      estimatedCost: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

MarketingCandidateSchema.index({ companyCode: 1, slotId: 1, score: -1 });
MarketingCandidateSchema.index({ campaignId: 1, contentHash: 1 });

export const MarketingCandidateModel = model<IMarketingCandidate>("MarketingCandidate", MarketingCandidateSchema);
