import net from "node:net";
import { Job, Queue, Worker } from "bullmq";
import { htmlVideoRenderService } from "../service/html-video/html-video-render.service";

const queueName = "html-video-render-queue";
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
          await htmlVideoRenderService.processRender(renderId);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1_000 * (attempt + 1))
            );
          }
        }
      }
      await htmlVideoRenderService.failRender(renderId, lastError);
    })().finally(() => fallbackPending.delete(renderId));
  });
}

export async function enqueueHtmlVideoRender(renderId: string) {
  if (!(await ensureQueue()) || !queue) {
    processInBackground(renderId);
    return { id: `direct:${renderId}` };
  }
  try {
    return await queue.add(
      "render",
      { renderId },
      {
        jobId: `html-video:${renderId}`,
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

export function initHtmlVideoRenderWorker() {
  if (worker) return;
  void ensureQueue()
    .then((available) => {
      if (worker) return;
      const recover = async () => {
        const pending = await htmlVideoRenderService.recoverPendingRenders();
        for (const renderId of pending) {
          await enqueueHtmlVideoRender(renderId);
        }
      };
      if (!available) {
        void recover();
        return;
      }
      const createdWorker = new Worker(
        queueName,
        async (job: Job<{ renderId: string }>) => {
          try {
            await htmlVideoRenderService.processRender(job.data.renderId);
          } catch (error) {
            if (job.attemptsMade + 1 >= Number(job.opts.attempts || 1)) {
              await htmlVideoRenderService.failRender(job.data.renderId, error);
            }
            throw error;
          }
        },
        {
          connection: redisConfig,
          concurrency: Math.min(
            Math.max(Number(process.env.HTML_VIDEO_RENDER_CONCURRENCY) || 2, 1),
            4
          ),
        }
      );
      createdWorker.on("error", () => {
        redisAvailable = false;
      });
      createdWorker.on("failed", (job, error) => {
        console.error(
          `[HTML Video] Render ${job?.data.renderId || "unknown"} thất bại:`,
          error.message
        );
      });
      worker = createdWorker;
      void recover();
    })
    .catch(() => {
      redisAvailable = false;
    });
}
