import net from "node:net";
import { Queue, Worker } from "bullmq";
import { realEstateMapVideoRenderService } from "../service/real-estate-map-video/real-estate-map-video-render.service";

const queueName = "real-estate-map-video-render-queue";
const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

let queue: Queue | null = null;
let worker: Worker | null = null;
let redisAvailable: boolean | null = null;
const fallbackPending = new Set<string>();

function checkRedis() {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1_500);
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
  if (redisAvailable === null) redisAvailable = await checkRedis();
  if (redisAvailable && !queue) {
    queue = new Queue(queueName, { connection: redisConfig });
    queue.on("error", () => {
      redisAvailable = false;
    });
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
          await realEstateMapVideoRenderService.processRender(renderId);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
          }
        }
      }
      await realEstateMapVideoRenderService.failRender(renderId, lastError);
    })().finally(() => fallbackPending.delete(renderId));
  });
}

export async function enqueueRealEstateMapVideoRender(renderId: string) {
  if (!(await ensureQueue()) || !queue) {
    processInBackground(renderId);
    return { id: `direct:${renderId}` };
  }
  try {
    return await queue.add(
      "render",
      { renderId },
      {
        jobId: `remv:${renderId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (error) {
    redisAvailable = false;
    processInBackground(renderId);
    return { id: `direct:${renderId}`, error };
  }
}

export function initRealEstateMapVideoRenderWorker() {
  if (worker) return;
  void ensureQueue()
    .then((available) => {
      if (worker) return;
      if (available) {
        worker = new Worker(
          queueName,
          async (job) => {
            const { renderId } = job.data as { renderId: string };
            await realEstateMapVideoRenderService.processRender(renderId);
          },
          { connection: redisConfig, concurrency: 2 }
        );
        worker.on("failed", (job, error) => {
          if (job?.data?.renderId) {
            void realEstateMapVideoRenderService.failRender(job.data.renderId as string, error);
          }
        });
      }
    })
    .catch(() => {});
}
