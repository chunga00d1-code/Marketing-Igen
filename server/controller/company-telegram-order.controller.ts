import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { companyTelegramOrderService } from "../service/company-telegram-order.service";

function scope(req: AuthenticatedRequest) {
  const companyCode = String(req.user?.companyCode || "").trim();
  if (!companyCode) throw new Error("Tai khoan chua duoc gan ma doanh nghiep.");
  return companyCode;
}

export const companyTelegramOrderController = {
  async get(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyTelegramOrderService.getConfig(scope(req)) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyTelegramOrderService.updateConfig(scope(req), req.body) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async test(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyTelegramOrderService.testConfig(scope(req), req.body) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },
};
