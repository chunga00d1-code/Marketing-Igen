import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { CampaignOrchestratorService } from "./agents/campaign-orchestrator.service";

const LEASE_MS = 20 * 60000;

async function processImageSlot(slotId: unknown, lockId: string) {
  try {
    await CampaignOrchestratorService.orchestrateMedia(String(slotId), lockId);
    const slot = await MarketingCampaignSlotModel.findById(slotId).select("status").lean();
    return { slotId: String(slotId), status: slot?.status || "done" };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { slotId: String(slotId), status: "failed", error: msg };
  }
}

async function processVerifySlot(slotId: unknown, lockId: string) {
  try {
    await CampaignOrchestratorService.orchestrateVerify(String(slotId), lockId);
    const slot = await MarketingCampaignSlotModel.findById(slotId).select("status").lean();
    return { slotId: String(slotId), status: slot?.status || "done" };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { slotId: String(slotId), status: "failed", error: msg };
  }
}

async function processPublishSlot(slotId: unknown, lockId: string) {
  try {
    await CampaignOrchestratorService.orchestratePublish(String(slotId), lockId);
    const slot = await MarketingCampaignSlotModel.findById(slotId).select("status").lean();
    return { slotId: String(slotId), status: slot?.status || "done" };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { slotId: String(slotId), status: "failed", error: msg };
  }
}

async function claimSlots(input: {
  statuses: MarketingCampaignSlotStatus[];
  dueField?: "verifyAt" | "scheduledAt";
  limit: number;
  nextStatus?: MarketingCampaignSlotStatus;
}) {
  const now = new Date();
  const leaseFilter = [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }];
  const baseFilter = { status: { $in: input.statuses }, $or: leaseFilter };
  
  const candidates = input.dueField === "verifyAt"
    ? await MarketingCampaignSlotModel.find({ ...baseFilter, verifyAt: { $lte: now } }).sort({ verifyAt: 1 }).limit(input.limit).select("_id status").lean()
    : input.dueField === "scheduledAt"
      ? await MarketingCampaignSlotModel.find({ ...baseFilter, scheduledAt: { $lte: now } }).sort({ scheduledAt: 1 }).limit(input.limit).select("_id status").lean()
      : await MarketingCampaignSlotModel.find(baseFilter).sort({ updatedAt: 1 }).limit(input.limit).select("_id status").lean();
      
  const claims: Array<{ slotId: Types.ObjectId; lockId: string }> = [];
  for (const candidate of candidates) {
    const lockId = randomUUID();
    const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
      { _id: candidate._id, status: { $in: input.statuses }, $or: [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }] },
      { $set: { status: input.nextStatus || candidate.status, lockId, lockedAt: now, lockExpiresAt: new Date(now.getTime() + LEASE_MS) } },
      { new: true }
    );
    if (claimed) claims.push({ slotId: claimed._id, lockId });
  }
  return claims;
}

export const marketingCampaignFacebookWorkerService = {
  async generateDueMedia(limit = 2) {
    const claims = await claimSlots({ statuses: ["generating_media"], limit: Math.max(1, Math.min(limit, 5)) });
    return { claimed: claims.length, results: await Promise.all(claims.map((claim) => processImageSlot(claim.slotId, claim.lockId))) };
  },

  async verifyDueSlots(limit = 5) {
    const claims = await claimSlots({ statuses: ["verifying"], dueField: "verifyAt", limit: Math.max(1, Math.min(limit, 10)) });
    return { claimed: claims.length, results: await Promise.all(claims.map((claim) => processVerifySlot(claim.slotId, claim.lockId))) };
  },

  async publishDueSlots(limit = 3) {
    const claims = await claimSlots({ statuses: ["ready_to_publish", "publishing"], dueField: "scheduledAt", limit: Math.max(1, Math.min(limit, 10)), nextStatus: "publishing" });
    return { claimed: claims.length, results: await Promise.all(claims.map((claim) => processPublishSlot(claim.slotId, claim.lockId))) };
  },
};
