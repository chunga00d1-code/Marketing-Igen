import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { companyOrderAutomationService } from "../service/company-order-automation.service";

function companyCode(req: AuthenticatedRequest) {
  const value = String(req.user?.companyCode || "").trim().toUpperCase();
  if (!value) throw new Error("Tài khoản chưa được gán mã doanh nghiệp.");
  return value;
}

export const companyOrderAutomationController = {
  async get(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyOrderAutomationService.getConfig(companyCode(req)) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyOrderAutomationService.updateConfig(companyCode(req), req.body) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async test(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyOrderAutomationService.testConfig(companyCode(req), req.body) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },
};

