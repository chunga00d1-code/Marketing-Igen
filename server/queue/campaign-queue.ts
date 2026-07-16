/* eslint-disable @typescript-eslint/no-explicit-any */
import { Queue } from "bullmq";
import net from "net";
import { randomUUID } from "crypto";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { CampaignOrchestratorService } from "../service/agents/campaign-orchestrator.service";

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const QUEUE_NAME = "campaign-task-queue";

let campaignQueue: Queue | null = null;
let isRedisAvailable: boolean | null = null;

function checkRedisConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function ensureRedisConnection(): Promise<boolean> {
  if (isRedisAvailable !== null) return isRedisAvailable;
  const { host, port } = redisConfig;
  const connected = await checkRedisConnection(host, port);
  if (connected) {
    console.log(`[Campaign Queue] Connected to Redis successfully.`);
    isRedisAvailable = true;
    try {
      campaignQueue = new Queue(QUEUE_NAME, { connection: redisConfig });
    } catch (e: any) {
      console.error("[Campaign Queue] Error creating Queue:", e.message);
      isRedisAvailable = false;
    }
  } else {
    console.warn(`[Campaign Queue] Redis not found at ${host}:${port}. Falling back to direct database worker execution.`);
    isRedisAvailable = false;
  }
  return isRedisAvailable;
}

/**
 * Fallback direct execution in the background when Redis is offline.
 * Utilizes atomic locking and transitions to respect processing boundaries.
 */
async function runDirectFallback(slotId: string, type: 'prepare' | 'media' | 'verify' | 'publish') {
  const lockId = randomUUID();
  const now = new Date();
  const leaseExpires = new Date(now.getTime() + 20 * 60000); // 20 mins lease

  let nextStatus: string;
  let fromStatuses: string[];
  let orchestratorFn: (slotId: string, lockId: string) => Promise<any>;

  if (type === "prepare") {
    nextStatus = "generating";
    fromStatuses = ["planned", "retrying"];
    orchestratorFn = CampaignOrchestratorService.orchestratePrepare;
  } else if (type === "media") {
    nextStatus = "generating_media";
    fromStatuses = ["generating_media", "failed", "needs_attention"];
    orchestratorFn = CampaignOrchestratorService.orchestrateMedia;
  } else if (type === "verify") {
    nextStatus = "verifying";
    fromStatuses = ["verifying"];
    orchestratorFn = CampaignOrchestratorService.orchestrateVerify;
  } else {
    nextStatus = "publishing";
    fromStatuses = ["ready_to_publish", "publishing"];
    orchestratorFn = CampaignOrchestratorService.orchestratePublish;
  }

  try {
    const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
      {
        _id: slotId,
        status: { $in: fromStatuses },
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } }
        ]
      } as any,
      {
        $set: {
          status: nextStatus,
          lockId,
          lockedAt: now,
          lockExpiresAt: leaseExpires
        },
        $push: {
          transitions: {
            from: fromStatuses[0],
            to: nextStatus,
            reason: `Queue fallback direct execution for ${type}`,
            at: now
          }
        }
      } as any,
      { new: true }
    );

    if (!claimed) {
      console.warn(`[Campaign Queue Direct Fallback] Slot ${slotId} for ${type} was already claimed or in invalid status.`);
      return;
    }

    // Trigger orchestrator in background (non-blocking)
    console.log(`[Campaign Queue Direct Fallback] Starting direct ${type} task for slot ${slotId}`);
    orchestratorFn(slotId, lockId).catch((err: any) => {
      console.error(`[Campaign Queue Direct Fallback Error] Error orchestrating ${type} for slot ${slotId}:`, err);
    });
  } catch (error) {
    console.error(`[Campaign Queue Direct Fallback Lock Error] Failed to acquire lock for direct ${type} on slot ${slotId}:`, error);
  }
}

export const campaignQueueService = {
  async checkRedis(): Promise<boolean> {
    return ensureRedisConnection();
  },

  async addPrepareJob(slotId: string) {
    const hasRedis = await ensureRedisConnection();
    if (!hasRedis || !campaignQueue) {
      void runDirectFallback(slotId, "prepare");
      return { id: "direct-prepare" };
    }
    return await campaignQueue.add("prepare", { slotId }, {
      jobId: `prepare:${slotId}`,
      removeOnComplete: true,
      removeOnFail: false,
    });
  },

  async addMediaJob(slotId: string) {
    const hasRedis = await ensureRedisConnection();
    if (!hasRedis || !campaignQueue) {
      void runDirectFallback(slotId, "media");
      return { id: "direct-media" };
    }
    return await campaignQueue.add("media", { slotId }, {
      jobId: `media:${slotId}`,
      removeOnComplete: true,
      removeOnFail: false,
    });
  },

  async addVerifyJob(slotId: string) {
    const hasRedis = await ensureRedisConnection();
    if (!hasRedis || !campaignQueue) {
      void runDirectFallback(slotId, "verify");
      return { id: "direct-verify" };
    }
    return await campaignQueue.add("verify", { slotId }, {
      jobId: `verify:${slotId}`,
      removeOnComplete: true,
      removeOnFail: false,
    });
  },

  async addPublishJob(slotId: string) {
    const hasRedis = await ensureRedisConnection();
    if (!hasRedis || !campaignQueue) {
      void runDirectFallback(slotId, "publish");
      return { id: "direct-publish" };
    }
    return await campaignQueue.add("publish", { slotId }, {
      jobId: `publish:${slotId}`,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
};
