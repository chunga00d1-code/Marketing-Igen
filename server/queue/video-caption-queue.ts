import { Job, Queue, Worker } from "bullmq";
import net from "net";
import { VideoCaptionQueuePayload } from "../../shared/video-caption.contract";
import { VideoCaptionJobModel } from "../model/video-caption-job.model";
import { videoCaptionService } from "../service/video-caption.service";

const QUEUE_NAME = "video-caption-pipeline-queue";
const REDIS_RECHECK_MS = 30_000;
const TRANSCRIPTION_RECONCILE_MS = 60_000;
const FALLBACK_CONCURRENCY = 2;
const WORKER_CONCURRENCY = Math.min(
  4,
  Math.max(
    1,
    Number(process.env.VIDEO_CAPTION_ANALYSIS_CONCURRENCY) || 2
  )
);

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

let queue: Queue<VideoCaptionQueuePayload> | null = null;
let worker: Worker<VideoCaptionQueuePayload> | null = null;
let redisAvailable: boolean | null = null;
let redisCheckedAt = 0;
let workerStarting = false;
let workerRetryTimer: NodeJS.Timeout | null = null;
let fallbackActive = 0;
let transcriptionReconcileTimer: NodeJS.Timeout | null = null;
const fallbackPending: string[] = [];
const fallbackScheduled = new Set<string>();
const fallbackRunning = new Set<string>();

function checkRedis() {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(redisConfig.port, redisConfig.host);
  });
}

async function ensureQueue() {
  if (
    redisAvailable === null ||
    (!redisAvailable &&
      Date.now() - redisCheckedAt >= REDIS_RECHECK_MS)
  ) {
    redisAvailable = await checkRedis();
    redisCheckedAt = Date.now();
  }

  if (redisAvailable && !queue) {
    queue = new Queue(QUEUE_NAME, { connection: redisConfig });
    queue.on("error", (error) => {
      redisAvailable = false;
      redisCheckedAt = Date.now();
      console.error("[Video Caption Queue] Redis error:", error);
    });
  }
  return Boolean(redisAvailable);
}

function scheduleFallbackRetry(jobId: string, attempt: number) {
  const delayMs = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  const timer = setTimeout(() => {
    fallbackScheduled.delete(jobId);
    enqueueDatabaseFallback(jobId);
  }, delayMs);
  timer.unref();
}

function drainDatabaseFallback() {
  while (
    fallbackActive < FALLBACK_CONCURRENCY &&
    fallbackPending.length > 0
  ) {
    const jobId = fallbackPending.shift();
    if (!jobId) return;
    fallbackScheduled.delete(jobId);
    fallbackRunning.add(jobId);
    fallbackActive += 1;

    setImmediate(() => {
      void videoCaptionService
        .processJob(jobId)
        .catch(async (error) => {
          const job = await VideoCaptionJobModel.findById(jobId);
          if (
            job?.status === "retrying" &&
            job.attempt < job.maxAttempts
          ) {
            scheduleFallbackRetry(jobId, job.attempt);
            return;
          }
          await videoCaptionService.failJob(jobId, error);
        })
        .finally(() => {
          fallbackActive = Math.max(0, fallbackActive - 1);
          fallbackRunning.delete(jobId);
          drainDatabaseFallback();
        });
    });
  }
}

function enqueueDatabaseFallback(jobId: string) {
  if (
    !fallbackScheduled.has(jobId) &&
    !fallbackRunning.has(jobId)
  ) {
    fallbackScheduled.add(jobId);
    fallbackPending.push(jobId);
    drainDatabaseFallback();
  }
  return { id: `database:${jobId}` };
}

export async function enqueueVideoCaptionJob(
  jobId: string,
  forceNewQueueEntry = false
) {
  if (!(await ensureQueue()) || !queue) {
    console.warn(
      `[Video Caption Queue] Redis unavailable; job ${jobId} will use the database fallback.`
    );
    return enqueueDatabaseFallback(jobId);
  }

  const queueJobId = `video-caption:${jobId}`;
  try {
    const existing = await queue.getJob(queueJobId);
    if (existing) {
      const state = await existing.getState();
      if (
        ["active", "waiting", "delayed", "prioritized"].includes(state)
      ) {
        return existing;
      }
      if (forceNewQueueEntry || ["completed", "failed"].includes(state)) {
        await existing.remove();
      } else {
        return existing;
      }
    }

    return queue.add(
      "video-caption-operation",
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
    console.error(
      `[Video Caption Queue] Failed to enqueue ${jobId}; using database fallback:`,
      error
    );
    return enqueueDatabaseFallback(jobId);
  }
}

function scheduleWorkerRetry() {
  if (worker || workerRetryTimer) return;
  workerRetryTimer = setTimeout(() => {
    workerRetryTimer = null;
    initVideoCaptionWorker();
  }, REDIS_RECHECK_MS);
  workerRetryTimer.unref();
}

export function initVideoCaptionWorker() {
  if (worker || workerStarting) return;
  workerStarting = true;

  if (!transcriptionReconcileTimer) {
    void videoCaptionService.reconcileAwaitingTranscriptions();
    transcriptionReconcileTimer = setInterval(() => {
      void videoCaptionService.reconcileAwaitingTranscriptions();
    }, TRANSCRIPTION_RECONCILE_MS);
    transcriptionReconcileTimer.unref();
  }

  void ensureQueue()
    .then(async (available) => {
      const recoveredJobIds =
        await videoCaptionService.recoverStaleJobs();

      if (!available) {
        for (const jobId of recoveredJobIds) {
          enqueueDatabaseFallback(jobId);
        }
        scheduleWorkerRetry();
        return;
      }

      const createdWorker = new Worker<VideoCaptionQueuePayload>(
        QUEUE_NAME,
        async (job: Job<VideoCaptionQueuePayload>) => {
          const jobId = String(job.data.jobId);
          try {
            await videoCaptionService.processJob(jobId);
          } catch (error) {
            const maxAttempts = Number(job.opts.attempts || 1);
            if (job.attemptsMade + 1 >= maxAttempts) {
              await videoCaptionService.failJob(jobId, error);
            }
            throw error;
          }
        },
        {
          connection: redisConfig,
          concurrency: WORKER_CONCURRENCY,
          limiter: { max: 12, duration: 60_000 },
        }
      );

      createdWorker.on("failed", (job, error) => {
        console.error(
          `[Video Caption Worker] Job ${job?.id} failed:`,
          error
        );
      });
      createdWorker.on("error", (error) => {
        redisAvailable = false;
        redisCheckedAt = Date.now();
        console.error("[Video Caption Worker] Redis error:", error);
      });

      try {
        await createdWorker.waitUntilReady();
        worker = createdWorker;
      } catch (error) {
        await createdWorker.close(true).catch(() => undefined);
        for (const jobId of recoveredJobIds) {
          enqueueDatabaseFallback(jobId);
        }
        throw error;
      }

      for (const jobId of recoveredJobIds) {
        await enqueueVideoCaptionJob(jobId, true);
      }
      console.log(
        `[Video Caption Worker] Ready (analysis concurrency: ${WORKER_CONCURRENCY}).`
      );
    })
    .catch((error) => {
      redisAvailable = false;
      redisCheckedAt = Date.now();
      console.error("[Video Caption Worker] Initialization failed:", error);
      scheduleWorkerRetry();
    })
    .finally(() => {
      workerStarting = false;
    });
}
