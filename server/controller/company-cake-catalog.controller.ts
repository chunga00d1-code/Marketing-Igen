import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { companyCakeCatalogService } from "../service/company-cake-catalog.service";

function companyCode(req: AuthenticatedRequest) {
  const value = String(req.user?.companyCode || "").trim();
  if (!value) throw new Error("Tài khoản chưa được gán mã doanh nghiệp.");
  return value;
}

export const companyCakeCatalogController = {
  async get(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyCakeCatalogService.getConfig(companyCode(req)) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyCakeCatalogService.updateConfig(companyCode(req), req.body) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async test(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companyCakeCatalogService.testConfig(companyCode(req), req.body.rootFolderUrl) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },
};
