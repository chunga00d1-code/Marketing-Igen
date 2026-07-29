import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { campaignQueueService } from "../queue/campaign-queue";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";
import type { MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";
import {
  formatDateInTimezone,
  resolveMonthlyPrepareAt,
} from "./marketing-campaign-schedule.service";

const COMPANY_CONCURRENCY_LIMIT = 3;
const SCHEDULER_BATCH_LIMIT = 100;
const PUBLISH_SCHEDULER_BATCH_LIMIT = 100;
const STALE_QUEUE_RESERVATION_MS = 15 * 60 * 1000;
const PREPARATION_WORKLOAD_STATUSES: MarketingCampaignSlotStatus[] = [
  "queued",
  "generating",
  "researching",
  "writing",
  "scoring",
  "generating_media",
  "verifying",
  "publishing",
];

async function migrateLegacyMonthlyPreparationSchedules(campaignId?: string) {
  const filter: Record<string, unknown> = {
    status: "active",
    preparationScheduleVersion: { $ne: 2 },
  };
  if (campaignId) filter._id = campaignId;

  const campaigns = await MarketingCampaignModel.find(filter)
    .select("_id companyCode startDate timezone createdAt")
    .lean();

  for (const campaign of campaigns) {
    const slots = await MarketingCampaignSlotModel.find({
      campaignId: campaign._id,
      companyCode: campaign.companyCode,
      status: { $in: ["planned", "retrying"] },
    })
      .select("_id scheduledAt status")
      .lean();

    const preparationGroups = new Map<string, {
      prepareAt: Date;
      status: MarketingCampaignSlotStatus;
      slotIds: Array<typeof slots[number]["_id"]>;
    }>();
    for (const slot of slots) {
      const slotDate = formatDateInTimezone(slot.scheduledAt, campaign.timezone);
      const prepareAt = resolveMonthlyPrepareAt({
        campaignStartDate: campaign.startDate,
        slotDate,
        timezone: campaign.timezone,
        campaignCreatedAt: campaign.createdAt,
        leadDays: 10,
      });
      const key = `${slot.status}:${prepareAt.toISOString()}`;
      const group = preparationGroups.get(key) || {
        prepareAt,
        status: slot.status,
        slotIds: [],
      };
      group.slotIds.push(slot._id);
      preparationGroups.set(key, group);
    }

    for (const group of preparationGroups.values()) {
      await MarketingCampaignSlotModel.updateMany(
        {
          _id: { $in: group.slotIds },
          campaignId: campaign._id,
          companyCode: campaign.companyCode,
          status: group.status,
        },
        {
          $set: { prepareAt: group.prepareAt },
          $push: {
            transitions: {
              from: group.status,
              to: group.status,
              reason: "Preparation schedule migrated to monthly batches",
              at: new Date(),
            },
          },
        }
      );
    }

    await MarketingCampaignModel.updateOne(
      {
        _id: campaign._id,
        companyCode: campaign.companyCode,
        preparationScheduleVersion: { $ne: 2 },
      },
      {
        $set: {
          preparationMode: "monthly",
          monthlyPreparationLeadDays: 10,
          preparationScheduleVersion: 2,
        },
      }
    );
  }
}

/**
 * Checks whether a given company can process a new campaign slot based on active slots count.
 */
export async function canCompanyProcessSlot(companyCode: string): Promise<boolean> {
  const activeCount = await MarketingCampaignSlotModel.countDocuments({
    companyCode,
    status: { $in: PREPARATION_WORKLOAD_STATUSES },
  });

  return activeCount < COMPANY_CONCURRENCY_LIMIT;
}

/**
 * Enqueues monthly preparation batches whose persisted prepareAt instant is due.
 * Slot reservation changes the status to queued before touching BullMQ so recurring
 * scans cannot enqueue the same slot and the per-company cap includes queue depth.
 */
export async function scanAndEnqueueDueSlots(options?: {
  campaignId?: string;
  limit?: number;
  platform?: MarketingCampaignPlatform;
}): Promise<{ enqueued: number; deferred: number; slotIds: string[] }> {
  const now = new Date();
  await migrateLegacyMonthlyPreparationSchedules(options?.campaignId);
  const campaignFilter: Record<string, unknown> = { status: "active" };
  if (options?.campaignId) campaignFilter._id = options.campaignId;
  if (options?.platform) campaignFilter.platforms = options.platform;

  const activeCampaigns = await MarketingCampaignModel.find(campaignFilter).select("_id companyCode");
  if (activeCampaigns.length === 0) return { enqueued: 0, deferred: 0, slotIds: [] };

  const activeCampaignIds = activeCampaigns.map((c) => c._id);
  const companyByCampaign = new Map<string, string>();
  activeCampaigns.forEach((c) => companyByCampaign.set(String(c._id), c.companyCode));

  await MarketingCampaignSlotModel.updateMany(
    {
      campaignId: { $in: activeCampaignIds },
      status: "queued",
      ...(options?.platform ? { platform: options.platform } : {}),
      updatedAt: { $lte: new Date(now.getTime() - STALE_QUEUE_RESERVATION_MS) },
      $or: [
        { lockExpiresAt: { $exists: false } },
        { lockExpiresAt: null },
        { lockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: { status: "planned" },
      $push: {
        transitions: {
          from: "queued",
          to: "planned",
          reason: "Recovered stale monthly queue reservation",
          at: now,
        },
      },
    }
  );

  const dueSlots = await MarketingCampaignSlotModel.find({
    campaignId: { $in: activeCampaignIds },
    status: { $in: ["planned", "retrying"] },
    prepareAt: { $lte: now },
    ...(options?.platform ? { platform: options.platform } : {}),
  })
    .sort({ prepareAt: 1, scheduledAt: 1 })
    .limit(Math.max(1, Math.min(options?.limit || SCHEDULER_BATCH_LIMIT, SCHEDULER_BATCH_LIMIT)));

  let enqueued = 0;
  let deferred = 0;
  const slotIds: string[] = [];

  for (const slot of dueSlots) {
    const companyCode = slot.companyCode || companyByCampaign.get(String(slot.campaignId)) || "";
    if (companyCode) {
      const canProceed = await canCompanyProcessSlot(companyCode);
      if (!canProceed) {
        deferred++;
        continue;
      }
    }

    const previousStatus = slot.status;
    const reserved = await MarketingCampaignSlotModel.findOneAndUpdate(
      {
        _id: slot._id,
        status: previousStatus,
        prepareAt: { $lte: now },
        ...(options?.platform ? { platform: options.platform } : {}),
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: "queued" },
        $push: {
          transitions: {
            from: previousStatus,
            to: "queued",
            reason: "Monthly preparation window is due",
            at: now,
          },
        },
      },
      { new: true }
    );
    if (!reserved) continue;

    try {
      await campaignQueueService.addPrepareJob(String(slot._id));
      enqueued++;
      slotIds.push(String(slot._id));
    } catch (err) {
      await MarketingCampaignSlotModel.updateOne(
        { _id: slot._id, status: "queued" },
        {
          $set: { status: previousStatus },
          $push: {
            transitions: {
              from: "queued",
              to: previousStatus,
              reason: "Unable to enqueue monthly preparation job",
              at: new Date(),
            },
          },
        }
      );
      console.error(`[Campaign Scheduler] Error enqueuing slot ${slot._id}:`, err);
    }
  }

  if (enqueued > 0 || deferred > 0) {
    console.log(`[Campaign Scheduler] Monthly prepare scan: ${enqueued} slots enqueued, ${deferred} slots deferred due to company concurrency cap.`);
  }

  return { enqueued, deferred, slotIds };
}

export const scanAndEnqueueUpcomingSlots = scanAndEnqueueDueSlots;

/**
 * Enqueue approved slots when their scheduled instant is due.
 * The status reservation happens before BullMQ so a recurring scan cannot
 * enqueue the same slot twice. The publish worker claims the reserved
 * `publishing` slot with its normal lease/idempotency guard.
 */
export async function scanAndEnqueueDuePublishSlots(options?: {
  campaignId?: string;
  limit?: number;
  platform?: MarketingCampaignPlatform;
}): Promise<{ enqueued: number; slotIds: string[] }> {
  const now = new Date();
  const campaignFilter: Record<string, unknown> = { status: "active" };
  if (options?.campaignId) campaignFilter._id = options.campaignId;
  if (options?.platform) campaignFilter.platforms = options.platform;

  const activeCampaigns = await MarketingCampaignModel.find(campaignFilter)
    .select("_id companyCode")
    .lean();
  if (activeCampaigns.length === 0) return { enqueued: 0, slotIds: [] };

  const activeCampaignIds = activeCampaigns.map((campaign) => campaign._id);
  await MarketingCampaignSlotModel.updateMany(
    {
      campaignId: { $in: activeCampaignIds },
      status: "publishing",
      publishRequestedAt: { $exists: false },
      ...(options?.platform ? { platform: options.platform } : {}),
      updatedAt: { $lte: new Date(now.getTime() - STALE_QUEUE_RESERVATION_MS) },
      $or: [
        { lockExpiresAt: { $exists: false } },
        { lockExpiresAt: null },
        { lockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: { status: "ready_to_publish" },
      $push: {
        transitions: {
          from: "publishing",
          to: "ready_to_publish",
          reason: "Recovered stale publish queue reservation before provider request",
          at: now,
        },
      },
    }
  );

  const dueSlots = await MarketingCampaignSlotModel.find({
    campaignId: { $in: activeCampaignIds },
    status: "ready_to_publish",
    scheduledAt: { $lte: now },
    ...(options?.platform ? { platform: options.platform } : {}),
    $or: [
      { lockExpiresAt: { $exists: false } },
      { lockExpiresAt: null },
      { lockExpiresAt: { $lte: now } },
    ],
  })
    .sort({ scheduledAt: 1 })
    .limit(Math.max(1, Math.min(options?.limit || PUBLISH_SCHEDULER_BATCH_LIMIT, PUBLISH_SCHEDULER_BATCH_LIMIT)));

  let enqueued = 0;
  const slotIds: string[] = [];

  for (const slot of dueSlots) {
    const reserved = await MarketingCampaignSlotModel.findOneAndUpdate(
      {
        _id: slot._id,
        status: "ready_to_publish",
        scheduledAt: { $lte: now },
        ...(options?.platform ? { platform: options.platform } : {}),
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: { status: "publishing" },
        $push: {
          transitions: {
            from: "ready_to_publish",
            to: "publishing",
            reason: "Scheduled publish window is due",
            at: now,
          },
        },
      },
      { new: true }
    );
    if (!reserved) continue;

    try {
      await campaignQueueService.addPublishJob(String(slot._id));
      enqueued++;
      slotIds.push(String(slot._id));
    } catch (err) {
      await MarketingCampaignSlotModel.updateOne(
        { _id: slot._id, status: "publishing", lockId: { $exists: false } },
        {
          $set: { status: "ready_to_publish" },
          $push: {
            transitions: {
              from: "publishing",
              to: "ready_to_publish",
              reason: "Unable to enqueue scheduled publish job",
              at: new Date(),
            },
          },
        }
      );
      console.error(`[Campaign Scheduler] Error enqueuing publish slot ${slot._id}:`, err);
    }
  }

  if (enqueued > 0) {
    console.log(`[Campaign Scheduler] Publish scan: ${enqueued} slots enqueued.`);
  }
  return { enqueued, slotIds };
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function initCampaignScheduler(intervalMs = 60 * 1000) {
  if (schedulerInterval) return;

  // Run initial scan on startup
  scanAndEnqueueDueSlots().catch((err) => {
    console.error("[Campaign Scheduler] Initial scan error:", err);
  });
  scanAndEnqueueDuePublishSlots().catch((err) => {
    console.error("[Campaign Scheduler] Initial publish scan error:", err);
  });

  schedulerInterval = setInterval(() => {
    scanAndEnqueueDueSlots().catch((err) => {
      console.error("[Campaign Scheduler] Recurring scan error:", err);
    });
    scanAndEnqueueDuePublishSlots().catch((err) => {
      console.error("[Campaign Scheduler] Recurring publish scan error:", err);
    });
  }, intervalMs);

  console.log(`[Campaign Scheduler] Initialized auto-prepare and scheduled-publish scheduler (Interval: ${intervalMs / 1000}s).`);
}
