import { Job, Queue, Worker } from "bullmq";
import type { JobsOptions } from "bullmq";
import net from "net";
import { executeVideoProjectRender } from "../service/video-project-render-runner";
import { reconcileActiveShotstackRenders } from "../service/shotstack-render.service";

const QUEUE_NAME = "video-project-render-queue";
const JOB_NAME = "video-project-render";
const JOB_ATTEMPTS = 2;
const RECONCILIATION_INTERVAL_MS = 15_000;

type RenderJobData = {
  renderId: string;
};

let renderQueue: Queue<RenderJobData> | null = null;
let renderWorker: Worker<RenderJobData> | null = null;
let redisAvailable: boolean | null = null;
let workerInitialization: Promise<void> | null = null;
let reconciliationTimer: NodeJS.Timeout | null = null;

export function startRenderReconciliationLoop() {
  if (reconciliationTimer) {
    return;
  }
  reconciliationTimer = setInterval(() => {
    void reconcileActiveShotstackRenders().catch((error: unknown) => {
      console.warn(
        "[Video Project Render Queue] Background active render reconciliation failed:",
        error instanceof Error ? error.message : String(error)
      );
    });
  }, RECONCILIATION_INTERVAL_MS);
  if (reconciliationTimer && typeof reconciliationTimer.unref === "function") {
    reconciliationTimer.unref();
  }
}

export function buildVideoProjectRenderRedisConfig(
  env: NodeJS.ProcessEnv = process.env
) {
  const configuredPort = Number(env.REDIS_PORT);
  return {
    host: env.REDIS_HOST || "127.0.0.1",
    port: Number.isInteger(configuredPort) && configuredPort > 0
      ? configuredPort
      : 6379,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export function buildVideoProjectRenderJobOptions(
  renderId: string
): JobsOptions {
  return {
    jobId: `${JOB_NAME}-${renderId}`,
    attempts: JOB_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  };
}

function checkRedisConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
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
    socket.connect(port, host);
  });
}

async function ensureQueue(): Promise<boolean> {
  if (redisAvailable !== null) {
    return redisAvailable;
  }
  const redisConfig = buildVideoProjectRenderRedisConfig();
  redisAvailable = await checkRedisConnection(
    redisConfig.host,
    redisConfig.port
  );
  if (!redisAvailable) {
    console.warn(
      `[Video Project Render Queue] Redis unavailable at ${redisConfig.host}:${redisConfig.port}; using detached execution.`
    );
    return false;
  }

  try {
    renderQueue = new Queue<RenderJobData>(QUEUE_NAME, {
      connection: redisConfig,
    });
    renderQueue.on("error", (error) => {
      console.warn("[Video Project Render Queue] Redis error:", error.message);
    });
    return true;
  } catch (error: unknown) {
    redisAvailable = false;
    console.warn(
      "[Video Project Render Queue] Queue initialization failed; using detached execution.",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

function runDetached(renderId: string) {
  void executeVideoProjectRender(renderId).catch((error: unknown) => {
    console.error(
      `[Video Project Render Queue] Detached render ${renderId} failed:`,
      error instanceof Error ? error.message : String(error)
    );
  });
}

export const videoProjectRenderQueue = {
  async add(renderId: string) {
    const hasRedis = await ensureQueue();
    if (!hasRedis || !renderQueue) {
      runDetached(renderId);
      return { id: `detached:${renderId}` };
    }

    try {
      return await renderQueue.add(
        JOB_NAME,
        { renderId },
        buildVideoProjectRenderJobOptions(renderId)
      );
    } catch (error: unknown) {
      console.warn(
        `[Video Project Render Queue] Could not queue render ${renderId}; using detached execution.`,
        error instanceof Error ? error.message : String(error)
      );
      runDetached(renderId);
      return { id: `detached:${renderId}` };
    }
  },

  async initWorker(): Promise<void> {
    startRenderReconciliationLoop();
    if (renderWorker) {
      return;
    }
    if (workerInitialization) {
      return workerInitialization;
    }

    workerInitialization = (async () => {
      const hasRedis = await ensureQueue();
      if (!hasRedis || renderWorker) {
        return;
      }

      const configuredConcurrency = Number(
        process.env.VIDEO_PROJECT_RENDER_CONCURRENCY
      );
      const concurrency = Number.isInteger(configuredConcurrency) &&
        configuredConcurrency > 0
        ? configuredConcurrency
        : 1;
      const redisConfig = buildVideoProjectRenderRedisConfig();
      renderWorker = new Worker<RenderJobData>(
        QUEUE_NAME,
        async (job: Job<RenderJobData>) => {
          if (job.name !== JOB_NAME) {
            return;
          }
          await executeVideoProjectRender(job.data.renderId);
        },
        {
          connection: redisConfig,
          concurrency,
        }
      );
      renderWorker.on("error", (error) => {
        console.error(
          "[Video Project Render Worker] Redis error:",
          error.message
        );
      });
      renderWorker.on("failed", (job, error) => {
        console.error(
          `[Video Project Render Worker] Job ${job?.id} failed:`,
          error.message
        );
      });
    })();

    return workerInitialization;
  },
};
