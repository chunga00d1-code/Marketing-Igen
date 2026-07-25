import { Job, Queue, Worker } from "bullmq";
import net from "net";
import { campaignContentSheetService } from "../service/campaign-content-sheet.service";

const QUEUE_NAME = "campaign-content-sheet-ai";
const REDIS_RECHECK_MS = 30_000;
const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

let queue: Queue | null = null;
let worker: Worker | null = null;
let redisAvailable: boolean | null = null;
let redisCheckedAt = 0;
let workerStarting = false;
let workerRetryTimer: NodeJS.Timeout | null = null;
const fallbackPending: string[] = [];
const fallbackScheduled = new Set<string>();
let fallbackActive = 0;

function checkRedis() {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(redisConfig.port, redisConfig.host);
  });
}

async function ensureQueue() {
  if (redisAvailable === null || (!redisAvailable && Date.now() - redisCheckedAt >= REDIS_RECHECK_MS)) {
    redisAvailable = await checkRedis();
    redisCheckedAt = Date.now();
  }
  if (redisAvailable && !queue) {
    queue = new Queue(QUEUE_NAME, { connection: redisConfig });
    queue.on("error", (error) => {
      redisAvailable = false;
      redisCheckedAt = Date.now();
      console.error("[Campaign Sheet AI Queue] Redis lỗi:", error);
    });
  }
  return redisAvailable;
}

function drainFallback() {
  while (fallbackActive < 2 && fallbackPending.length > 0) {
    const jobId = fallbackPending.shift();
    if (!jobId) return;
    fallbackActive += 1;
    setImmediate(() => {
      void campaignContentSheetService.processBulkAIJob(jobId)
        .catch(async (error) => {
          console.error(`[Campaign Sheet AI Fallback] Job ${jobId} lỗi:`, error);
          await campaignContentSheetService.failBulkAIJob(jobId, error);
        })
        .finally(() => {
          fallbackScheduled.delete(jobId);
          fallbackActive = Math.max(0, fallbackActive - 1);
          drainFallback();
        });
    });
  }
}

function enqueueFallback(jobId: string) {
  if (!fallbackScheduled.has(jobId)) {
    fallbackScheduled.add(jobId);
    fallbackPending.push(jobId);
    drainFallback();
  }
  return { id: `direct-${jobId}` };
}

export async function enqueueCampaignSheetAIJob(jobId: string, force = false) {
  if (!(await ensureQueue()) || !queue) {
    console.warn(`[Campaign Sheet AI Queue] Redis không khả dụng; job ${jobId} dùng database fallback.`);
    return enqueueFallback(jobId);
  }
  const queueJobId = `sheet-ai-${jobId}`;
  try {
    const existing = await queue.getJob(queueJobId);
    if (existing) {
      const state = await existing.getState();
      if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state)) return existing;
      if (force || ["completed", "failed"].includes(state)) await existing.remove();
      else return existing;
    }
    return queue.add(
      "generate",
      { jobId },
      {
        jobId: queueJobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (error) {
    redisAvailable = false;
    redisCheckedAt = Date.now();
    console.error("[Campaign Sheet AI Queue] Không thể enqueue, chuyển fallback:", error);
    return enqueueFallback(jobId);
  }
}

function scheduleWorkerRetry() {
  if (worker || workerRetryTimer) return;
  workerRetryTimer = setTimeout(() => {
    workerRetryTimer = null;
    initCampaignContentSheetAIWorker();
  }, REDIS_RECHECK_MS);
  workerRetryTimer.unref();
}

export function initCampaignContentSheetAIWorker() {
  if (worker || workerStarting) return;
  workerStarting = true;
  void ensureQueue().then(async (available) => {
    const recovered = await campaignContentSheetService.recoverStaleAIJobs();
    if (!available) {
      recovered.forEach(enqueueFallback);
      scheduleWorkerRetry();
      return;
    }
    const createdWorker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const jobId = String(job.data.jobId);
        try {
          return await campaignContentSheetService.processBulkAIJob(jobId);
        } catch (error) {
          const maxAttempts = Number(job.opts.attempts || 1);
          if (job.attemptsMade + 1 >= maxAttempts) {
            await campaignContentSheetService.failBulkAIJob(jobId, error);
          }
          throw error;
        }
      },
      {
        connection: redisConfig,
        concurrency: Math.min(4, Math.max(1, Number(process.env.CAMPAIGN_SHEET_AI_CONCURRENCY) || 2)),
        limiter: { max: 20, duration: 60_000 },
      }
    );
    createdWorker.on("failed", (job, error) => console.error(`[Campaign Sheet AI Worker] Job ${job?.id} lỗi:`, error));
    createdWorker.on("error", (error) => {
      redisAvailable = false;
      redisCheckedAt = Date.now();
      console.error("[Campaign Sheet AI Worker] Redis lỗi:", error);
    });
    await createdWorker.waitUntilReady();
    worker = createdWorker;
    for (const jobId of recovered) await enqueueCampaignSheetAIJob(jobId, true);
    console.log("[Campaign Sheet AI Worker] Đã khởi tạo.");
  }).catch((error) => {
    redisAvailable = false;
    redisCheckedAt = Date.now();
    console.error("[Campaign Sheet AI Worker] Không thể khởi tạo:", error);
    scheduleWorkerRetry();
  }).finally(() => {
    workerStarting = false;
  });
}
