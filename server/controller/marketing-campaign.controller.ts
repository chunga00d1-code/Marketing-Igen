import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { marketingCampaignService } from "../service/marketing-campaign.service";
import { walletService, API_COSTS } from "../service/wallet.service";
import { marketingCampaignWorkerService } from "../service/marketing-campaign-worker.service";
import { marketingCampaignFacebookWorkerService } from "../service/marketing-campaign-facebook-worker.service";

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

export const marketingCampaignController = {
  async prepareWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignWorkerService.prepareDueSlots(Number(req.body?.limit || 3));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Prepare worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async mediaWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignFacebookWorkerService.generateDueMedia(Number(req.body?.limit || 2));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Media worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async verifyWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignFacebookWorkerService.verifyDueSlots(Number(req.body?.limit || 5));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Verify worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async publishWorker(req: AuthenticatedRequest, res: Response) {
    try {
      assertWorkerSecret(req);
      const result = await marketingCampaignFacebookWorkerService.publishDueSlots(Number(req.body?.limit || 3));
      return res.status(200).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Publish worker thất bại.";
      return res.status(message.includes("token") ? 401 : 500).json({ status: "error", message });
    }
  },

  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, companyCode } = getIdentity(req);
      await walletService.checkBalance(userId, API_COSTS.GEMINI_MARKETING);
      const result = await marketingCampaignService.create(companyCode, userId, req.body);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_MARKETING, "Chi phí lập kế hoạch chiến dịch tự động bằng AI");
      return res.status(201).json({ status: "success", data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo chiến dịch.";
      return res.status(400).json({ status: "error", message });
    }
  },

  async list(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const campaigns = await marketingCampaignService.list(companyCode);
      return res.status(200).json({ status: "success", data: campaigns });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể tải chiến dịch." });
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

  async lifecycle(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const campaign = await marketingCampaignService.changeStatus(companyCode, req.params.id, req.params.action as "pause" | "resume" | "cancel");
      return res.status(200).json({ status: "success", data: campaign });
    } catch (error: unknown) {
      return res.status(409).json({ status: "error", message: error instanceof Error ? error.message : "Không thể cập nhật chiến dịch." });
    }
  },
};
