import { Job, Queue, Worker } from "bullmq";
import net from "net";
import { creativeImageService } from "../service/creative-image/creative-image.service";

const QUEUE_NAME = "creative-image-render-queue";
const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export function buildCreativeImageQueueJobId(renderId: string) {
  return `creative-image-${renderId}`;
}
let queue: Queue | null = null;
let worker: Worker | null = null;
let redisAvailable: boolean | null = null;
const fallbackPending = new Set<string>();

function checkRedis() {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1_500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(redisConfig.port, redisConfig.host);
  });
}

async function ensureQueue() {
  if (redisAvailable === null) redisAvailable = await checkRedis();
  if (redisAvailable && !queue) {
    queue = new Queue(QUEUE_NAME, { connection: redisConfig });
    queue.on("error", () => { redisAvailable = false; });
  }
  return redisAvailable;
}

function processInBackground(renderId: string) {
  if (fallbackPending.has(renderId)) return;
  fallbackPending.add(renderId);
  setImmediate(() => {
    void (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await creativeImageService.processRender(renderId);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
        }
      }
      await creativeImageService.failRender(renderId, lastError);
    })().finally(() => fallbackPending.delete(renderId));
  });
}

export async function enqueueCreativeImageRender(renderId: string) {
  if (!(await ensureQueue()) || !queue) {
    processInBackground(renderId);
    return { id: `direct:${renderId}` };
  }
  try {
    return await queue.add("render", { renderId }, {
      jobId: buildCreativeImageQueueJobId(renderId),
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  } catch (error) {
    redisAvailable = false;
    processInBackground(renderId);
    return { id: `direct:${renderId}`, error };
  }
}

export function initCreativeImageWorker() {
  if (worker) return;
  void ensureQueue().then((available) => {
    if (worker) return;
    const recover = async () => {
      const pending = await creativeImageService.recoverPendingRenders();
      for (const renderId of pending) await enqueueCreativeImageRender(renderId);
    };
    if (!available) {
      void recover();
      return;
    }
    const createdWorker = new Worker(QUEUE_NAME, async (job: Job<{ renderId: string }>) => {
      try {
        await creativeImageService.processRender(job.data.renderId);
      } catch (error) {
        if (job.attemptsMade + 1 >= Number(job.opts.attempts || 1)) {
          await creativeImageService.failRender(job.data.renderId, error);
        }
        throw error;
      }
    }, { connection: redisConfig, concurrency: Math.min(Math.max(Number(process.env.CREATIVE_IMAGE_CONCURRENCY) || 2, 1), 4) });
    createdWorker.on("error", () => { redisAvailable = false; });
    createdWorker.on("failed", (job, error) => console.error(`[Creative Image] Render ${job?.data.renderId || "unknown"} thất bại:`, error.message));
    worker = createdWorker;
    void recover();
  }).catch(() => { redisAvailable = false; });
}
