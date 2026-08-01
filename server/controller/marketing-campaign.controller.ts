import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { marketingCampaignService } from "../service/marketing-campaign.service";
import { walletService, API_COSTS } from "../service/wallet.service";
import { marketingCampaignWorkerService } from "../service/marketing-campaign-worker.service";
import { marketingCampaignFacebookWorkerService } from "../service/marketing-campaign-facebook-worker.service";
import { cloudinaryService } from "../service/cloudinary.service";
import { MetricsSyncService } from "../service/metrics-sync.service";
import { MarketingAnalyticsService } from "../service/marketing-analytics.service";
import { campaignContentSheetService } from "../service/campaign-content-sheet.service";
import { enqueueCampaignSheetAIJob } from "../queue/campaign-content-sheet-queue";
import { campaignAssetOrderService } from "../service/campaign-asset-order.service";
import { enqueueCampaignAssetOrderAIJob } from "../queue/campaign-asset-order-ai-queue";
import { enqueueBulkCreateJob } from "../queue/bulk-create-queue";
import type { MarketingCampaignPlatform } from "../interface/marketing-campaign.interface";
import { tiktokService } from "../service/tiktok.service";

function getIdentity(req: AuthenticatedRequest) {
  const userId = req.user?.id;
  let companyCode = req.user?.companyCode;
  if (req.user?.role === "superadmin") {
    companyCode = (req.body?.companyCode || req.query?.companyCode || companyCode || "SYSTEM") as string;
  }
  if (!userId || !companyCode) throw new Error("Không xác định được người dùng hoặc doanh nghiệp.");
  return { userId, companyCode };
}

function assertWorkerSecret(req: AuthenticatedRequest) {
  const expectedSecret = process.env.CAMPAIGN_WORKER_SECRET || process.env.N8N_WEBHOOK_SECRET;
  if (!expectedSecret || req.headers["x-webhook-token"] !== expectedSecret) throw new Error("Worker token không hợp lệ.");
}

function getWorkerPlatform(req: AuthenticatedRequest): MarketingCampaignPlatform | undefined {
  const platform = req.body?.platform;
  if (platform === undefined) return undefined;
  if (platform === "Facebook" || platform === "TikTok") return platform;
  throw new Error("Nền tảng worker không hợp lệ.");
}

export const marketingCampaignController = {
  async prepareWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignWorkerService.prepareDueSlots(Number(req.body?.limit || 3), getWorkerPlatform(req));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Prepare worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async mediaWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignFacebookWorkerService.generateDueMedia(Number(req.body?.limit || 2), getWorkerPlatform(req));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Media worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async verifyWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignFacebookWorkerService.verifyDueSlots(Number(req.body?.limit || 5), getWorkerPlatform(req));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Verify worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async publishWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignFacebookWorkerService.publishDueSlots(Number(req.body?.limit || 3), getWorkerPlatform(req));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Publish worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, companyCode } = getIdentity(req);
      await walletService.checkBalance(userId, API_COSTS.CAMPAIGN_STRATEGY);
      const result = await marketingCampaignService.create(companyCode, userId, req.body);
      await walletService.deductBalance(userId, API_COSTS.CAMPAIGN_STRATEGY, "Chi phí lập kế hoạch chiến dịch tự động bằng AI");
      return res.status(201).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo chiến dịch.";
      return res.status(400).json({ status: "error", message });
    }
  },

  async list(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const result = await marketingCampaignService.list(companyCode, { page, limit });
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải chiến dịch." });
    }
  },

  async calendar(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const result = await marketingCampaignService.getCalendar(
        companyCode,
        String(req.query.startDate),
        String(req.query.endDate)
      );
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải lịch chiến dịch." });
    }
  },

  async detail(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const detail = await marketingCampaignService.getDetail(companyCode, req.params.id);
      return res.status(200).json({ status: "success", data: detail });
    } catch (error: unknown) {
      return res.status(404).json({ status: "error", message: error instanceof Error ? error.message : "Không tìm thấy chiến dịch." });
    }
  },

  async getSheet(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignContentSheetService.getSheet(companyCode, req.params.id);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải Content Sheet." });
    }
  },

  async listAssetOrders(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.list(companyCode, req.params.id);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải Order ảnh, video." });
    }
  },

  async tiktokStatusWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await tiktokService.reconcilePendingPublishes({ limit: Number(req.body?.limit || 10) });
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "TikTok status worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async previewAssetOrderDriveImport(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.previewDriveImport(
        companyCode,
        req.params.id,
        req.body.googleDriveFolderUrl
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể quét ảnh Drive cho các Order.",
      });
    }
  },

  async applyAssetOrderDriveImport(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.applyDriveImport(
        companyCode,
        req.params.id,
        req.body.googleDriveFolderUrl
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể nhập ảnh Drive vào các Order.",
      });
    }
  },

  async addAssetOrderCustomField(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.addCustomField(companyCode, req.params.id, req.body.label);
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thêm cột tùy chỉnh." });
    }
  },

  async archiveAssetOrderCustomField(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.archiveCustomField(companyCode, req.params.id, req.params.fieldKey);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể ẩn cột tùy chỉnh." });
    }
  },

  async createAssetOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignAssetOrderService.create(companyCode, req.params.id, userId, req.body);
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tạo Order ảnh, video." });
    }
  },

  async updateAssetOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignAssetOrderService.update(companyCode, req.params.id, req.params.orderId, userId, req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({ status: "error", code, message: error instanceof Error ? error.message : "Không thể lưu Order ảnh, video." });
    }
  },

  async archiveAssetOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.archive(companyCode, req.params.id, req.params.orderId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể hủy Order ảnh, video." });
    }
  },

  async previewAssetOrderAI(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const estimate = await campaignAssetOrderService.getAiCost(companyCode, req.params.id);
      await walletService.checkBalance(userId, estimate);
      const data = await campaignAssetOrderService.createAiProposal(
        companyCode,
        req.params.id,
        req.params.orderId,
        req.body
      );
      await walletService.deductBalance(
        userId,
        estimate,
        "Chi phí AI tạo brief Order ảnh, video",
        `asset-order-ai:${companyCode}:${req.params.orderId}:${req.body.idempotencyKey}`
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number; status?: number })?.statusCode || (error as { status?: number })?.status || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "AI không thể tạo brief cho Order." });
    }
  },

  async fillAllAssetOrdersAI(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const estimate = await campaignAssetOrderService.getFillAllAiCost(companyCode, req.params.id, req.body.orderIds);
      if (!estimate.orderCount) {
        return res.status(409).json({ status: "error", message: "Chưa có Order gắn với bài viết để AI điền." });
      }
      await walletService.checkBalance(userId, estimate.cost);
      const data = await campaignAssetOrderService.createFillAllAIJob(companyCode, req.params.id, userId, req.body);
      if (data.status === "queued") await enqueueCampaignAssetOrderAIJob(String(data._id));
      return res.status(202).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number; status?: number })?.statusCode || (error as { status?: number })?.status || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "AI không thể điền toàn bộ Order." });
    }
  },

  async exportAssetOrdersForBulk(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.exportForBulkCreate(companyCode, req.params.id);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể nhập Order vào Bulk Create." });
    }
  },

  async syncAssetOrdersFromBulkImport(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.syncBulkCreateImport(
        companyCode,
        req.params.id,
        req.body.jobId,
        req.body.mode
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể đồng bộ ảnh Bulk Create về Order." });
    }
  },

  async listAssetOrderBulkJobs(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.listBulkCreateImportJobs(companyCode, req.params.id);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải Bulk Create của chiến dịch." });
    }
  },

  async previewAssetOrdersFromBulkImport(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.previewBulkCreateImport(companyCode, req.params.id, req.body.jobId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể xem trước kết quả Bulk Create." });
    }
  },

  async getFillAllAssetOrdersAIJob(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.getFillAllAIJob(companyCode, req.params.id, req.params.jobId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải tiến trình AI điền Order." });
    }
  },

  async cancelFillAllAssetOrdersAIJob(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.cancelFillAllAIJob(companyCode, req.params.id, req.params.jobId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể hủy AI job Order." });
    }
  },

  async applyAssetOrderAI(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.applyAiProposal(companyCode, req.params.id, req.params.orderId, req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({ status: "error", code, message: error instanceof Error ? error.message : "Không thể áp dụng đề xuất AI." });
    }
  },

  async dismissAssetOrderAI(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.dismissAiProposal(companyCode, req.params.id, req.params.orderId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể bỏ qua đề xuất AI." });
    }
  },

  async previewAssetOrderBulk(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.previewBulkMapping(companyCode, req.params.id, req.params.orderId, req.body.templateId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({ status: "error", code, message: error instanceof Error ? error.message : "Không thể kiểm tra map Bulk Create." });
    }
  },

  async createAssetOrderBulk(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignAssetOrderService.createBulkJob(companyCode, req.params.id, userId, req.params.orderId, req.body);
      await enqueueBulkCreateJob(String(data.job._id));
      return res.status(202).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({ status: "error", code, message: error instanceof Error ? error.message : "Không thể tạo Bulk Create job." });
    }
  },

  async syncAssetOrderBulk(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignAssetOrderService.syncBulkJob(companyCode, req.params.id, req.params.orderId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật kết quả Bulk Create." });
    }
  },

  async addSheetColumn(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.addColumn(companyCode, req.params.id, userId, req.body);
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thêm cột." });
    }
  },

  async addSheetRow(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.addRow(companyCode, req.params.id, userId, req.body);
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thêm bài viết." });
    }
  },

  async updateSheetColumn(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.updateColumn(companyCode, req.params.id, req.params.columnId, userId, req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật cột." });
    }
  },

  async archiveSheetColumn(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.archiveColumn(companyCode, req.params.id, req.params.columnId, userId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể xóa cột." });
    }
  },

  async updateSheetRow(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.updateRow(
        companyCode,
        req.params.id,
        req.params.slotId,
        userId,
        req.body
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({ status: "error", code, message: error instanceof Error ? error.message : "Không thể lưu dòng dữ liệu." });
    }
  },

  async updateSheetCells(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.updateCells(
        companyCode,
        req.params.id,
        userId,
        req.body
      );
      return res.status(data.conflicts.length ? 207 : 200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({
        status: "error",
        code,
        message: error instanceof Error ? error.message : "Không thể lưu vùng dữ liệu.",
      });
    }
  },

  async previewSheetAI(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const estimate = await campaignContentSheetService.getAICostEstimate(companyCode, req.params.id);
      await walletService.checkBalance(userId, estimate);
      const data = await campaignContentSheetService.createAIPreview(
        companyCode,
        req.params.id,
        userId,
        req.body
      );
      await walletService.deductBalance(
        userId,
        Number(data.actualCost || estimate),
        "Chi phí AI hỗ trợ Campaign Content Sheet",
        `campaign-sheet-ai:${companyCode}:${req.body.idempotencyKey}`
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number; status?: number })?.statusCode || (error as { status?: number })?.status || 400);
      const code = (error as { code?: string })?.code;
      return res.status(statusCode).json({ status: "error", code, message: error instanceof Error ? error.message : "AI không thể tạo đề xuất." });
    }
  },

  async applySheetAI(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.applyAIProposal(
        companyCode,
        req.params.id,
        req.params.jobId,
        userId,
        req.body.fieldKeys
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể áp dụng đề xuất AI." });
    }
  },

  async createSheetAIJob(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const unitCost = await campaignContentSheetService.getAICostEstimate(companyCode, req.params.id);
      await walletService.checkBalance(userId, unitCost * req.body.slotIds.length);
      const job = await campaignContentSheetService.createBulkAIJob(
        companyCode,
        req.params.id,
        userId,
        req.body
      );
      await enqueueCampaignSheetAIJob(String(job._id));
      return res.status(202).json({ status: "success", data: job });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number; status?: number })?.statusCode || (error as { status?: number })?.status || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tạo AI job hàng loạt." });
    }
  },

  async getSheetAIJob(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignContentSheetService.getAIJob(companyCode, req.params.id, req.params.jobId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải AI job." });
    }
  },

  async cancelSheetAIJob(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignContentSheetService.cancelAIJob(companyCode, req.params.id, req.params.jobId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể hủy AI job." });
    }
  },

  async retrySheetAIJob(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignContentSheetService.retryAIJob(companyCode, req.params.id, req.params.jobId);
      await enqueueCampaignSheetAIJob(String(data._id), true);
      return res.status(202).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thử lại AI job." });
    }
  },

  async listSheetRevisions(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await campaignContentSheetService.listRevisions(
        companyCode,
        req.params.id,
        Number(req.query.limit || 50)
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải lịch sử Sheet." });
    }
  },

  async revertSheetRevision(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const data = await campaignContentSheetService.revertRevision(
        companyCode,
        req.params.id,
        req.params.revisionId,
        userId
      );
      return res.status(data.conflicts.length ? 207 : 200).json({ status: "success", data });
    } catch (error: unknown) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 400);
      return res.status(statusCode).json({ status: "error", message: error instanceof Error ? error.message : "Không thể hoàn tác phiên bản." });
    }
  },

  async lifecycle(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const campaign = await marketingCampaignService.changeStatus(companyCode, req.params.id, req.params.action as "pause" | "resume" | "cancel");
      return res.status(200).json({ status: "success", data: campaign });
    } catch (error: unknown) {
      return res.status(409).json({ status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật chiến dịch." });
    }
  },

  async retrySlot(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const slot = await marketingCampaignService.retrySlot(companyCode, req.params.id, req.params.slotId);
      return res.status(200).json({ status: "success", data: slot });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thử lại slot." });
    }
  },

  async retryAllSlots(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const result = await marketingCampaignService.retryAllSlots(companyCode, req.params.id);
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thử lại các slot." });
    }
  },

  async approveSlot(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const slot = await marketingCampaignService.approveSlot(companyCode, req.params.id, req.params.slotId, userId, req.body.tiktokPublishOptions);
      return res.status(200).json({ status: "success", data: slot });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể duyệt slot." });
    }
  },

  async approveTikTokSlots(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const result = await marketingCampaignService.approveTikTokSlots(
        companyCode,
        req.params.id,
        req.body.slotIds,
        userId,
        req.body.tiktokPublishOptions,
        req.body.videoDurations,
      );
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể duyệt các video TikTok." });
    }
  },

  async publishNowSlot(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const slot = await marketingCampaignService.publishNowSlot(companyCode, req.params.id, req.params.slotId, userId, req.body.tiktokPublishOptions);
      return res.status(200).json({ status: "success", data: slot });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể đăng ngay slot này." });
    }
  },

  async updateSlotContent(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const content = await marketingCampaignService.updateSlotContent(companyCode, req.params.id, req.params.slotId, req.body);
      return res.status(200).json({ status: "success", data: content });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật nội dung slot." });
    }
  },

  async replaceSlotImage(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp ảnh để thay thế." });
      }
      const folder = "igen_erp/marketing/campaign_manual";
      const secureUrl = await cloudinaryService.uploadMedia(image, folder);
      
      const content = await marketingCampaignService.replaceSlotImage(companyCode, req.params.id, req.params.slotId, secureUrl);
      return res.status(200).json({ status: "success", data: content });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thay đổi ảnh slot." });
    }
  },

  async getShareLink(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const result = await marketingCampaignService.generateShareLink(companyCode, req.params.id, req.params.slotId);
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tạo link chia sẻ." });
    }
  },

  async getPublicSlot(req: AuthenticatedRequest, res: Response) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp mã xác thực." });
      }
      const data = await marketingCampaignService.getPublicSlotDetail(token);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể lấy thông tin bài viết." });
    }
  },

  async publicSlotAction(req: AuthenticatedRequest, res: Response) {
    try {
      const { token, action } = req.params;
      const { reason } = req.body;
      if (!token || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ status: "error", message: "Thao tác không hợp lệ." });
      }
      const data = await marketingCampaignService.executePublicSlotAction(token, action as "approve" | "reject", reason);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thực hiện phê duyệt bài viết." });
    }
  },

  async rejectSlot(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ status: "error", message: "Yêu cầu nhập lý do từ chối." });
      }
      const slot = await marketingCampaignService.rejectSlot(companyCode, req.params.id, req.params.slotId, reason, userId);
      return res.status(200).json({ status: "success", data: slot });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể từ chối slot." });
    }
  },

  async previewDrive(req: AuthenticatedRequest, res: Response) {
    try {
      const { googleDriveFolderUrl } = req.body;
      if (!googleDriveFolderUrl) {
        return res.status(400).json({ status: "error", message: "Đường dẫn thư mục Google Drive không được để trống." });
      }
      const files = await marketingCampaignService.previewDrive(googleDriveFolderUrl);
      return res.status(200).json({ status: "success", data: files });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải trước ảnh từ thư mục Google Drive." });
    }
  },

  async getDailyShareLink(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const { date } = req.params;
      if (!date) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp ngày." });
      }
      const result = await marketingCampaignService.generateDailyShareLink(companyCode, req.params.id, date);
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tạo link chia sẻ theo ngày." });
    }
  },

  async getPublicDailySlots(req: AuthenticatedRequest, res: Response) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp mã xác thực." });
      }
      const data = await marketingCampaignService.getPublicDailySlotsDetail(token);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể lấy danh sách bài viết theo ngày." });
    }
  },

  async publicDailySlotAction(req: AuthenticatedRequest, res: Response) {
    try {
      const { token, slotId, action } = req.params;
      const { reason } = req.body;
      if (!token || !slotId || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ status: "error", message: "Thao tác không hợp lệ." });
      }
      const data = await marketingCampaignService.executePublicDailySlotAction(token, slotId, action as "approve" | "reject", reason);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thực hiện phê duyệt bài viết." });
    }
  },

  async publicDailySlotUpdateContent(req: AuthenticatedRequest, res: Response) {
    try {
      const { token, slotId } = req.params;
      const { title, bodyText } = req.body;
      if (!token || !slotId) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp đầy đủ thông tin." });
      }
      const data = await marketingCampaignService.updatePublicDailySlotContent(token, slotId, { title, bodyText });
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật nội dung bài viết." });
    }
  },

  async getMonthlyShareLink(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const { startDate, endDate } = req.params;
      if (!startDate || !endDate) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp ngày bắt đầu và kết thúc." });
      }
      const result = await marketingCampaignService.generateMonthlyShareLink(companyCode, req.params.id, startDate, endDate);
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tạo link chia sẻ theo tháng." });
    }
  },

  async getPublicMonthlySlots(req: AuthenticatedRequest, res: Response) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp mã xác thực." });
      }
      const data = await marketingCampaignService.getPublicMonthlySlotsDetail(token);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể lấy danh sách bài viết theo tháng." });
    }
  },

  async publicMonthlySlotAction(req: AuthenticatedRequest, res: Response) {
    try {
      const { token, slotId, action } = req.params;
      const { reason } = req.body;
      if (!token || !slotId || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ status: "error", message: "Thao tác không hợp lệ." });
      }
      const data = await marketingCampaignService.executePublicMonthlySlotAction(token, slotId, action as "approve" | "reject", reason);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thực hiện phê duyệt bài viết." });
    }
  },

  async publicMonthlyBulkAction(req: AuthenticatedRequest, res: Response) {
    try {
      const { token } = req.params;
      const { slotIds, action, reason } = req.body;
      if (!token || !Array.isArray(slotIds) || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ status: "error", message: "Thao tác không hợp lệ." });
      }
      const data = await marketingCampaignService.executePublicMonthlyBulkAction(token, slotIds, action as "approve" | "reject", reason);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể thực hiện phê duyệt hàng loạt bài viết." });
    }
  },

  async batchPrepare(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) {
        return res.status(400).json({ status: "error", message: "Yêu cầu cung cấp ngày bắt đầu và ngày kết thúc." });
      }
      const result = await marketingCampaignService.batchPrepareMonth(companyCode, req.params.id, startDate, endDate);
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Chuẩn bị nội dung hàng loạt thất bại." });
    }
  },

  async syncMetricsWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const limit = Number(req.body?.limit || 20);
      const result = await MetricsSyncService.syncFacebookMetrics(limit);
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sync metrics worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async getAnalytics(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const { campaignId, platform, startDate, endDate } = req.query;
      const result = await MarketingAnalyticsService.getCampaignAnalytics(companyCode, {
        campaignId: campaignId as string,
        platform: platform as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể lấy dữ liệu báo cáo." });
    }
  },
};
