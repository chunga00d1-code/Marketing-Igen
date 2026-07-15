import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { marketingCampaignService } from "../service/marketing-campaign.service";
import { walletService, API_COSTS } from "../service/wallet.service";
import { marketingCampaignWorkerService } from "../service/marketing-campaign-worker.service";
import { marketingCampaignFacebookWorkerService } from "../service/marketing-campaign-facebook-worker.service";
import { cloudinaryService } from "../service/cloudinary.service";

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
      const slot = await marketingCampaignService.approveSlot(companyCode, req.params.id, req.params.slotId, userId);
      return res.status(200).json({ status: "success", data: slot });
    } catch (error: unknown) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : "Không thể duyệt slot." });
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
};
