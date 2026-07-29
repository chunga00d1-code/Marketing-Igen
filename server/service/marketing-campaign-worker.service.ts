import { scanAndEnqueueDueSlots } from "./campaign-scheduler.service";

export const marketingCampaignWorkerService = {
  async prepareDueSlots(limit = 3) {
    const queued = await scanAndEnqueueDueSlots({
      limit: Math.max(1, Math.min(limit, 10)),
    });
    return {
      claimed: queued.enqueued,
      results: queued.slotIds.map((slotId) => ({ slotId, status: "queued" })),
      deferred: queued.deferred,
    };
  },
};
