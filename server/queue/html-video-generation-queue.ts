import net from "node:net";
import { Job, Queue, Worker } from "bullmq";
import { htmlVideoGenerationService } from "../service/html-video/html-video-generation.service";

const queueName = "html-video-generation-queue";
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

function processInBackground(generationId: string) {
  if (fallbackPending.has(generationId)) return;
  fallbackPending.add(generationId);
  setImmediate(() => {
    void (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await htmlVideoGenerationService.processGeneration(generationId);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
          }
        }
      }
      await htmlVideoGenerationService.failGeneration(generationId, lastError);
    })().finally(() => fallbackPending.delete(generationId));
  });
}

export async function enqueueHtmlVideoGeneration(generationId: string) {
  if (!(await ensureQueue()) || !queue) {
    processInBackground(generationId);
    return { id: `direct:${generationId}` };
  }
  try {
    return await queue.add(
      "generate",
      { generationId },
      {
        jobId: `html-video-generation:${generationId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (error) {
    redisAvailable = false;
    processInBackground(generationId);
    return { id: `direct:${generationId}`, error };
  }
}

export function initHtmlVideoGenerationWorker() {
  if (worker) return;
  void ensureQueue()
    .then((available) => {
      if (worker) return;
      const recover = async () => {
        const pending = await htmlVideoGenerationService.recoverPendingGenerations();
        for (const generationId of pending) {
          await enqueueHtmlVideoGeneration(generationId);
        }
      };
      if (!available) {
        void recover();
        return;
      }
      const createdWorker = new Worker(
        queueName,
        async (job: Job<{ generationId: string }>) => {
          try {
            await htmlVideoGenerationService.processGeneration(job.data.generationId);
          } catch (error) {
            if (job.attemptsMade + 1 >= Number(job.opts.attempts || 1)) {
              await htmlVideoGenerationService.failGeneration(job.data.generationId, error);
            }
            throw error;
          }
        },
        {
          connection: redisConfig,
          concurrency: Math.min(
            Math.max(Number(process.env.HTML_VIDEO_GENERATION_CONCURRENCY) || 2, 1),
            4
          ),
        }
      );
      createdWorker.on("error", () => {
        redisAvailable = false;
      });
      createdWorker.on("failed", (job, error) => {
        console.error(
          `[HTML Video] Generation ${job?.data.generationId || "unknown"} thất bại:`,
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
