import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { campaignQueueService } from "../queue/campaign-queue";

const COMPANY_CONCURRENCY_LIMIT = 3;

/**
 * Checks whether a given company can process a new campaign slot based on active slots count.
 */
export async function canCompanyProcessSlot(companyCode: string): Promise<boolean> {
  const activeCount = await MarketingCampaignSlotModel.countDocuments({
    companyCode,
    status: {
      $in: [
        "generating",
        "researching",
        "writing",
        "scoring",
        "generating_media",
        "verifying",
        "publishing"
      ]
    }
  });

  return activeCount < COMPANY_CONCURRENCY_LIMIT;
}

/**
 * Scans campaign slots that are scheduled within the next 24 hours and automatically
 * enqueues them for prepare execution if they are in 'planned' status.
 */
export async function scanAndEnqueueUpcomingSlots(): Promise<{ enqueued: number; deferred: number }> {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find active campaigns
  const activeCampaigns = await MarketingCampaignModel.find({ status: "active" }).select("_id companyCode");
  if (activeCampaigns.length === 0) return { enqueued: 0, deferred: 0 };

  const activeCampaignIds = activeCampaigns.map((c) => c._id);
  const companyByCampaign = new Map<string, string>();
  activeCampaigns.forEach((c) => companyByCampaign.set(String(c._id), c.companyCode));

  // Find upcoming slots that need preparation
  const dueSlots = await MarketingCampaignSlotModel.find({
    campaignId: { $in: activeCampaignIds },
    status: "planned",
    scheduledAt: { $lte: next24h },
  }).sort({ scheduledAt: 1 }).limit(100);

  let enqueued = 0;
  let deferred = 0;

  for (const slot of dueSlots) {
    const companyCode = slot.companyCode || companyByCampaign.get(String(slot.campaignId)) || "";
    if (companyCode) {
      const canProceed = await canCompanyProcessSlot(companyCode);
      if (!canProceed) {
        deferred++;
        continue;
      }
    }

    try {
      await campaignQueueService.addPrepareJob(String(slot._id));
      enqueued++;
    } catch (err) {
      console.error(`[Campaign Scheduler] Error enqueuing slot ${slot._id}:`, err);
    }
  }

  if (enqueued > 0 || deferred > 0) {
    console.log(`[Campaign Scheduler] Auto-prepare scan: ${enqueued} slots enqueued, ${deferred} slots deferred due to company concurrency cap.`);
  }

  return { enqueued, deferred };
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function initCampaignScheduler(intervalMs = 15 * 60 * 1000) {
  if (schedulerInterval) return;

  // Run initial scan on startup
  scanAndEnqueueUpcomingSlots().catch((err) => {
    console.error("[Campaign Scheduler] Initial scan error:", err);
  });

  // Schedule recurring scan every 15 mins
  schedulerInterval = setInterval(() => {
    scanAndEnqueueUpcomingSlots().catch((err) => {
      console.error("[Campaign Scheduler] Recurring scan error:", err);
    });
  }, intervalMs);

  console.log(`[Campaign Scheduler] Initialized auto-prepare scheduler (Interval: ${intervalMs / 1000}s).`);
}
