import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import net from "net";
import { executeLocalRenderJob } from "./job-runner";

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const QUEUE_NAME = "remotion-render-queue";

let remotionQueue: Queue | null = null;
let worker: Worker | null = null;
let isRedisAvailable: boolean | null = null;

function handleRedisAuthError(err: Error) {
  const msg = err.message || "";
  if (msg.includes("NOAUTH") || msg.includes("WRONGPASS") || msg.includes("Authentication required")) {
    if (isRedisAvailable !== false) {
      console.warn(`[Remotion Queue] Redis xác thực thất bại (${msg}). Chuyển sang Direct Render.`);
      isRedisAvailable = false;
      if (remotionQueue) { remotionQueue.close().catch(() => {}); remotionQueue = null; }
      if (worker) { worker.close().catch(() => {}); worker = null; }
    }
  }
}

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
  console.log(`[Remotion Queue] Đang kiểm tra kết nối Redis tại ${host}:${port}...`);
  const connected = await checkRedisConnection(host, port);
  if (connected) {
    console.log(`[Remotion Queue] Kết nối Redis thành công.`);
    isRedisAvailable = true;
    try {
      remotionQueue = new Queue(QUEUE_NAME, { connection: redisConfig });
      remotionQueue.on("error", (err) => {
        handleRedisAuthError(err);
        if (isRedisAvailable) console.warn("[Remotion Queue] Redis Queue error:", err.message);
      });
    } catch (e: any) {
      console.error("[Remotion Queue] Lỗi khi tạo Queue:", e.message);
      isRedisAvailable = false;
    }
  } else {
    console.warn(`[Remotion Queue] Không tìm thấy Redis tại ${host}:${port}. Chuyển sang Direct Render.`);
    isRedisAvailable = false;
  }
  return isRedisAvailable;
}

const redisClient = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  maxRetriesPerRequest: null,
  connectTimeout: 2000,
  lazyConnect: true,
});
redisClient.on("error", () => {}); // silence connection errors in dev

export const remotionQueueService = {
  async checkRedis(): Promise<boolean> {
    return ensureRedisConnection();
  },

  /**
   * Đẩy tác vụ render vào hàng đợi Redis, hoặc chạy trực tiếp nếu Redis không có.
   */
  async addRenderJob(recordId: string, videoUrl: string, blueprint: any, userId: string) {
    const hasRedis = await ensureRedisConnection();

    if (!hasRedis || !remotionQueue) {
      console.log(`[Remotion Queue] Redis không khả dụng. Chạy render trực tiếp cho record ${recordId}...`);
      executeLocalRenderJob(recordId, videoUrl, blueprint, userId).catch((err) => {
        console.error(`[Remotion Queue Direct Render] Lỗi khi render trực tiếp cho record ${recordId}:`, err);
      });
      return { id: "direct-render" } as any;
    }

    console.log(`[Remotion Queue] Đang đẩy record ${recordId} vào hàng đợi Redis...`);
    try {
      return await remotionQueue.add(
        "render-video-job",
        { recordId, videoUrl, blueprint, userId },
        { removeOnComplete: true, removeOnFail: false }
      );
    } catch (err) {
      console.warn(`[Remotion Queue] Lỗi khi add job: ${err}. Chuyển sang Direct Render...`);
      executeLocalRenderJob(recordId, videoUrl, blueprint, userId).catch((directErr) => {
        console.error(`[Remotion Queue Direct Render Fallback] Lỗi cho record ${recordId}:`, directErr);
      });
      return { id: "direct-render-fallback" } as any;
    }
  },

  /**
   * Khởi tạo BullMQ Worker xử lý các tác vụ render.
   */
  async initWorker() {
    const hasRedis = await ensureRedisConnection();
    if (!hasRedis) {
      console.log("[Remotion Queue] Chạy chế độ fallback: không khởi tạo Worker.");
      return;
    }
    if (worker) {
      console.log("[Remotion Queue] Worker đã được khởi tạo trước đó.");
      return;
    }

    const concurrency = Number(process.env.REMOTION_CONCURRENCY) || 3;
    console.log(`[Remotion Queue] Khởi tạo Worker, concurrency=${concurrency}`);

    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const { recordId, videoUrl, blueprint, userId } = job.data;
        console.log(`[Remotion Queue Worker] Bắt đầu Job ${job.id} cho record ${recordId}`);
        await executeLocalRenderJob(recordId, videoUrl, blueprint, userId);
      },
      { connection: redisConfig, concurrency }
    );

    worker.on("error", (err) => {
      handleRedisAuthError(err);
      if (isRedisAvailable) console.warn("[Remotion Queue Worker] Redis error:", err.message);
    });
    worker.on("completed", (job) => console.log(`[Remotion Queue Worker] Job ${job.id} hoàn thành.`));
    worker.on("failed", (job, err) => console.error(`[Remotion Queue Worker] Job ${job?.id} thất bại:`, err));
  },
};
