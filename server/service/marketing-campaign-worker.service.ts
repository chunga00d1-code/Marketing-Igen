import { randomUUID } from "crypto";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { CampaignOrchestratorService } from "./agents/campaign-orchestrator.service";

async function processSlot(slotId: string, lockId: string) {
  try {
    await CampaignOrchestratorService.orchestratePrepare(slotId, lockId);
    const slot = await MarketingCampaignSlotModel.findById(slotId).select("status").lean();
    return { slotId, status: slot?.status || "done" };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { slotId, status: "failed", error: msg };
  }
}

export const marketingCampaignWorkerService = {
  async prepareDueSlots(limit = 3) {
    const due = await MarketingCampaignSlotModel.find({
      status: { $in: ["planned", "retrying"] },
      prepareAt: { $lte: new Date() },
      $or: [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: new Date() } }],
    }).sort({ prepareAt: 1 }).limit(Math.max(1, Math.min(limit, 10))).select("_id").lean();

    const claims: Array<{ slotId: string; lockId: string }> = [];
    for (const item of due) {
      const lockId = randomUUID();
      const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
        { _id: item._id, status: { $in: ["planned", "retrying"] }, $or: [{ lockExpiresAt: { $exists: false } }, { lockExpiresAt: null }, { lockExpiresAt: { $lte: new Date() } }] },
        {
          $set: { status: "generating", lockId, lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + 20 * 60000) },
          $push: { transitions: { to: "generating", reason: "Prepare worker claimed slot", at: new Date() } },
        },
        { new: true }
      );
      if (claimed) claims.push({ slotId: String(claimed._id), lockId });
    }
    const results = await Promise.all(claims.map((claim) => processSlot(claim.slotId, claim.lockId)));
    return { claimed: claims.length, results };
  },
};
