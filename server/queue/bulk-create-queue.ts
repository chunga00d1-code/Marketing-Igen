import { Job, Queue, Worker } from "bullmq";
import net from "net";
import { bulkCreateService } from "../service/bulk-create.service";

const QUEUE_NAME = "bulk-create-render-queue";
const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

let queue: Queue | null = null;
let worker: Worker | null = null;
let redisAvailable: boolean | null = null;

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
  if (redisAvailable === null) redisAvailable = await checkRedis();
  if (redisAvailable && !queue) queue = new Queue(QUEUE_NAME, { connection: redisConfig });
  return redisAvailable;
}

function runWithDatabaseFallback(jobId: string) {
  setImmediate(() => void bulkCreateService.processJob(jobId).catch(async (error) => {
    console.error(`[Bulk Create Fallback] Job ${jobId} lỗi:`, error);
    await bulkCreateService.failJob(jobId, error);
  }));
  return { id: `direct:${jobId}` };
}

export async function enqueueBulkCreateJob(jobId: string, forceNewQueueEntry = false) {
  if (!(await ensureQueue()) || !queue) {
    console.warn(`[Bulk Create Queue] Redis không khả dụng, chạy job ${jobId} bằng background fallback.`);
    return runWithDatabaseFallback(jobId);
  }
  const queueJobId = forceNewQueueEntry ? `bulk:${jobId}:retry:${Date.now()}` : `bulk:${jobId}`;
  try {
    return await queue.add(
      "render",
      { jobId },
      {
        jobId: queueJobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (error) {
    console.error(
      `[Bulk Create Queue] Không thể đưa job ${jobId} vào Redis, chuyển sang database fallback:`,
      error
    );
    return runWithDatabaseFallback(jobId);
  }
}

export function initBulkCreateWorker() {
  if (worker) return;
  void ensureQueue().then(async (available) => {
    const recoveredJobIds = await bulkCreateService.recoverStaleJobs();
    if (!available) {
      console.warn("[Bulk Create Worker] Redis không khả dụng, sử dụng background fallback.");
      for (const jobId of recoveredJobIds) {
        runWithDatabaseFallback(jobId);
      }
      return;
    }
    worker = new Worker(QUEUE_NAME, async (job: Job) => {
      const jobId = String(job.data.jobId);
      try {
        await bulkCreateService.processJob(jobId);
      } catch (error) {
        const maxAttempts = Number(job.opts.attempts || 1);
        if (job.attemptsMade + 1 >= maxAttempts) {
          await bulkCreateService.failJob(jobId, error);
        }
        throw error;
      }
    }, {
      connection: redisConfig,
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 },
    });
    worker.on("failed", (job, error) => console.error(`[Bulk Create Worker] Job ${job?.id} lỗi:`, error));
    worker.on("error", (error) => console.error("[Bulk Create Worker] Redis lỗi:", error));
    if (queue) {
      for (const jobId of recoveredJobIds) {
        await queue.add(
          "render",
          { jobId },
          {
            jobId: `bulk:${jobId}:recovery:${Date.now()}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 1_000 },
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
      }
    }
    console.log("[Bulk Create Worker] Đã khởi tạo worker (concurrency: 2).");
  }).catch((error) => console.error("[Bulk Create Worker] Không thể khởi tạo:", error));
}
