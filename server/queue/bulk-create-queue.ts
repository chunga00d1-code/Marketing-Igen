import { Job, Queue, Worker } from "bullmq";
import net from "net";
import { bulkCreateService } from "../service/bulk-create.service";

const QUEUE_NAME = "bulk-create-render-queue";
const REDIS_RECHECK_MS = 30_000;

function boundedInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(1, Math.floor(parsed)))
    : fallback;
}

const FALLBACK_CONCURRENCY = boundedInteger(
  process.env.BULK_CREATE_FALLBACK_CONCURRENCY,
  2,
  3
);
const WORKER_CONCURRENCY = boundedInteger(
  process.env.BULK_CREATE_WORKER_CONCURRENCY,
  2,
  4
);
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
let fallbackActive = 0;
const fallbackPending: string[] = [];
const fallbackScheduled = new Set<string>();
const fallbackRunning = new Set<string>();

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

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref();
    operation.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function ensureQueue() {
  if (
    redisAvailable === null ||
    (!redisAvailable && Date.now() - redisCheckedAt >= REDIS_RECHECK_MS)
  ) {
    redisAvailable = await checkRedis();
    redisCheckedAt = Date.now();
  }
  if (redisAvailable && !queue) {
    queue = new Queue(QUEUE_NAME, { connection: redisConfig });
    queue.on("error", (error) => {
      redisAvailable = false;
      redisCheckedAt = Date.now();
      console.error("[Bulk Create Queue] Kết nối Redis lỗi:", error);
    });
  }
  return redisAvailable;
}

function drainDatabaseFallback() {
  while (fallbackActive < FALLBACK_CONCURRENCY && fallbackPending.length > 0) {
    const jobId = fallbackPending.shift();
    if (!jobId) return;
    fallbackScheduled.delete(jobId);
    fallbackRunning.add(jobId);
    fallbackActive += 1;
    setImmediate(() => {
      void bulkCreateService.processJob(jobId)
        .catch(async (error) => {
          console.error(`[Bulk Create Fallback] Job ${jobId} lỗi:`, error);
          await bulkCreateService.failJob(jobId, error);
        })
        .finally(() => {
          fallbackActive = Math.max(0, fallbackActive - 1);
          fallbackRunning.delete(jobId);
          drainDatabaseFallback();
        });
    });
  }
}

function runWithDatabaseFallback(jobId: string) {
  if (!fallbackScheduled.has(jobId) && !fallbackRunning.has(jobId)) {
    fallbackScheduled.add(jobId);
    fallbackPending.push(jobId);
    drainDatabaseFallback();
  }
  return { id: `direct:${jobId}` };
}

export async function enqueueBulkCreateJob(jobId: string, forceNewQueueEntry = false) {
  if (!(await ensureQueue()) || !queue) {
    console.warn(`[Bulk Create Queue] Redis không khả dụng, chạy job ${jobId} bằng background fallback.`);
    return runWithDatabaseFallback(jobId);
  }
  const queueJobId = `bulk:${jobId}`;
  try {
    const activeQueue = queue;
    return await withTimeout((async () => {
      const existing = await activeQueue.getJob(queueJobId);
      if (existing) {
        const state = await existing.getState();
        if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state)) {
          return existing;
        }
        if (forceNewQueueEntry || ["completed", "failed"].includes(state)) {
          await existing.remove();
        } else {
          return existing;
        }
      }
      return activeQueue.add(
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
    })(), 5_000, "Redis không phản hồi trong 5 giây.");
  } catch (error) {
    redisAvailable = false;
    redisCheckedAt = Date.now();
    console.error(
      `[Bulk Create Queue] Không thể đưa job ${jobId} vào Redis, chuyển sang database fallback:`,
      error
    );
    return runWithDatabaseFallback(jobId);
  }
}

function scheduleWorkerRetry() {
  if (worker || workerRetryTimer) return;
  workerRetryTimer = setTimeout(() => {
    workerRetryTimer = null;
    initBulkCreateWorker();
  }, REDIS_RECHECK_MS);
  workerRetryTimer.unref();
}

export function initBulkCreateWorker() {
  if (worker || workerStarting) return;
  workerStarting = true;
  void ensureQueue().then(async (available) => {
    const recoveredJobIds = await bulkCreateService.recoverStaleJobs();
    if (!available) {
      console.warn("[Bulk Create Worker] Redis không khả dụng, sử dụng background fallback.");
      for (const jobId of recoveredJobIds) {
        runWithDatabaseFallback(jobId);
      }
      scheduleWorkerRetry();
      return;
    }
    const createdWorker = new Worker(QUEUE_NAME, async (job: Job) => {
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
      concurrency: WORKER_CONCURRENCY,
      limiter: { max: 10, duration: 60_000 },
    });
    createdWorker.on("failed", (job, error) => console.error(`[Bulk Create Worker] Job ${job?.id} lỗi:`, error));
    createdWorker.on("error", (error) => {
      redisAvailable = false;
      redisCheckedAt = Date.now();
      console.error("[Bulk Create Worker] Redis lỗi:", error);
    });
    try {
      await withTimeout(
        createdWorker.waitUntilReady(),
        5_000,
        "Worker không thể kết nối Redis trong 5 giây."
      );
      worker = createdWorker;
    } catch (error) {
      await createdWorker.close(true).catch(() => undefined);
      for (const jobId of recoveredJobIds) {
        runWithDatabaseFallback(jobId);
      }
      throw error;
    }
    for (const jobId of recoveredJobIds) {
      await enqueueBulkCreateJob(jobId, true);
    }
    console.log(`[Bulk Create Worker] Đã khởi tạo worker (concurrency: ${WORKER_CONCURRENCY}).`);
  }).catch((error) => {
    redisAvailable = false;
    redisCheckedAt = Date.now();
    console.error("[Bulk Create Worker] Không thể khởi tạo:", error);
    scheduleWorkerRetry();
  }).finally(() => {
    workerStarting = false;
  });
}
