import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { companyLeadSheetService } from "../service/company-lead-sheet.service";
import { pageLeadSheetService } from "../service/page-lead-sheet.service";

function companyCode(req: AuthenticatedRequest) {
  const value = String(req.user?.companyCode || "").trim().toUpperCase();
  if (!value) throw new Error("Tài khoản chưa được gán mã doanh nghiệp.");
  return value;
}

function onError(res: Response, error: unknown) {
  return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
}

export const companyLeadSheetController = {
  async getPage(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await pageLeadSheetService.getConfig(companyCode(req), req.params.id) });
    } catch (error) { return onError(res, error); }
  },
  async updatePage(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await pageLeadSheetService.updateConfig(companyCode(req), req.params.id, req.body) });
    } catch (error) { return onError(res, error); }
  },
  async testPage(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await pageLeadSheetService.testConfig(companyCode(req), req.params.id, req.body) });
    } catch (error) { return onError(res, error); }
  },
  async get(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyLeadSheetService.getConfig(companyCode(req)) });
    } catch (error) { return onError(res, error); }
  },
  async update(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyLeadSheetService.updateConfig(companyCode(req), req.body) });
    } catch (error) { return onError(res, error); }
  },
  async test(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyLeadSheetService.testConfig(companyCode(req), req.body) });
    } catch (error) { return onError(res, error); }
  },
};
