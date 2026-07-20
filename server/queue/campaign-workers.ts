import { Worker, Job } from "bullmq";
import { randomUUID } from "crypto";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { CampaignOrchestratorService } from "../service/agents/campaign-orchestrator.service";
import { campaignQueueService } from "./campaign-queue";

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const QUEUE_NAME = "campaign-task-queue";
let worker: Worker | null = null;

export function initCampaignWorkers() {
  if (worker) return;

  campaignQueueService.checkRedis().then((hasRedis) => {
    if (!hasRedis) {
      console.log("[Campaign Worker] Chạy chế độ fallback: không khởi tạo Worker do Redis không hoạt động.");
      return;
    }

    console.log(`[Campaign Worker] Khởi tạo worker xử lý chiến dịch marketing (Concurrency: 20, Rate limit: 60 jobs/min)...`);
    
    worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const { slotId } = job.data;
        const jobName = job.name;
        
        console.log(`[Campaign Worker] Bắt đầu xử lý job ${job.id} (${jobName}) cho slot: ${slotId}`);

        const lockId = randomUUID();
        const now = new Date();
        const leaseExpires = new Date(now.getTime() + 20 * 60000);

        if (jobName === "prepare") {
          const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
            { 
              _id: slotId, 
              status: { $in: ["planned", "retrying"] }, 
              $or: [
                { lockExpiresAt: { $exists: false } }, 
                { lockExpiresAt: null }, 
                { lockExpiresAt: { $lte: now } }
              ] 
            },
            {
              $set: { 
                status: "generating", 
                lockId, 
                lockedAt: now, 
                lockExpiresAt: leaseExpires 
              },
              $push: { 
                transitions: { 
                  from: "planned", 
                  to: "generating", 
                  reason: `Queue worker ${job.id} claimed slot for prepare`, 
                  at: now 
                } 
              },
            },
            { new: true }
          );

          if (!claimed) {
            console.warn(`[Campaign Worker] Slot ${slotId} đã bị khóa hoặc trạng thái không hợp lệ. Bỏ qua job prepare.`);
            return { status: "skipped_or_locked" };
          }

          try {
            await CampaignOrchestratorService.orchestratePrepare(slotId, lockId);
            console.log(`[Campaign Worker] Hoàn thành prepare cho slot: ${slotId}`);

            // Auto-chaining next phase
            const updatedSlot = await MarketingCampaignSlotModel.findById(slotId);
            if (updatedSlot) {
              if (updatedSlot.status === "generating_media") {
                await campaignQueueService.addMediaJob(slotId);
              } else if (updatedSlot.status === "verifying") {
                await campaignQueueService.addVerifyJob(slotId);
              }
            }

            return { status: "success" };
          } catch (err: unknown) {
            console.error(`[Campaign Worker] Lỗi prepare slot ${slotId}:`, err);
            throw err;
          }
        } else if (jobName === "media") {
          const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
            {
              _id: slotId,
              status: "generating_media",
              $or: [
                { lockExpiresAt: { $exists: false } },
                { lockExpiresAt: null },
                { lockExpiresAt: { $lte: now } }
              ]
            },
            {
              $set: { lockId, lockedAt: now, lockExpiresAt: leaseExpires }
            },
            { new: true }
          );

          if (!claimed) return { status: "skipped_or_locked" };

          try {
            await CampaignOrchestratorService.orchestrateMedia(slotId, lockId);
            console.log(`[Campaign Worker] Hoàn thành media cho slot: ${slotId}`);

            const updatedSlot = await MarketingCampaignSlotModel.findById(slotId);
            if (updatedSlot && updatedSlot.status === "verifying") {
              await campaignQueueService.addVerifyJob(slotId);
            }

            return { status: "success" };
          } catch (err: unknown) {
            console.error(`[Campaign Worker] Lỗi media slot ${slotId}:`, err);
            throw err;
          }
        } else if (jobName === "verify") {
          const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
            {
              _id: slotId,
              status: "verifying",
              $or: [
                { lockExpiresAt: { $exists: false } },
                { lockExpiresAt: null },
                { lockExpiresAt: { $lte: now } }
              ]
            },
            {
              $set: { lockId, lockedAt: now, lockExpiresAt: leaseExpires }
            },
            { new: true }
          );

          if (!claimed) return { status: "skipped_or_locked" };

          try {
            await CampaignOrchestratorService.orchestrateVerify(slotId, lockId);
            console.log(`[Campaign Worker] Hoàn thành verify cho slot: ${slotId}`);
            return { status: "success" };
          } catch (err: unknown) {
            console.error(`[Campaign Worker] Lỗi verify slot ${slotId}:`, err);
            throw err;
          }
        } else if (jobName === "publish") {
          const claimed = await MarketingCampaignSlotModel.findOneAndUpdate(
            {
              _id: slotId,
              status: { $in: ["ready_to_publish", "publishing"] },
              $or: [
                { lockExpiresAt: { $exists: false } },
                { lockExpiresAt: null },
                { lockExpiresAt: { $lte: now } }
              ]
            },
            {
              $set: { status: "publishing", lockId, lockedAt: now, lockExpiresAt: leaseExpires }
            },
            { new: true }
          );

          if (!claimed) return { status: "skipped_or_locked" };

          try {
            await CampaignOrchestratorService.orchestratePublish(slotId, lockId);
            console.log(`[Campaign Worker] Hoàn thành publish cho slot: ${slotId}`);
            return { status: "success" };
          } catch (err: unknown) {
            console.error(`[Campaign Worker] Lỗi publish slot ${slotId}:`, err);
            throw err;
          }
        }
        
        return { status: "unknown_job" };
      },
      {
        connection: redisConfig,
        concurrency: 20,
        limiter: {
          max: 60,
          duration: 60000,
        },
      }
    );

    worker.on("error", (err) => {
      console.error("[Campaign Worker] Redis connection error:", err.message);
    });

    worker.on("completed", (job) => {
      console.log(`[Campaign Worker] Job ${job.id} hoàn thành thành công.`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[Campaign Worker] Job ${job?.id} thất bại:`, err.message);
    });
  }).catch((err) => {
    console.error("[Campaign Worker] Lỗi khi kiểm tra kết nối Redis trước khởi tạo:", err);
  });
}
