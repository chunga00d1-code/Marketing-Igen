import { NextFunction, Request, Response } from "express";
import { companyOrderAutomationService } from "../service/company-order-automation.service";

export async function requireN8nOrderAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const companyCode = String(req.body?.companyCode || req.query?.companyCode || "").trim().toUpperCase();
    if (!companyCode) {
      return res.status(400).json({ status: "error", message: "Thiếu companyCode để xác định doanh nghiệp." });
    }
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const supplied = String(req.headers["x-n8n-secret"] || bearer).trim();
    if (!await companyOrderAutomationService.authenticate(companyCode, supplied)) {
      return res.status(401).json({
        status: "error",
        message: "Khóa xác thực n8n không hợp lệ cho doanh nghiệp này.",
      });
    }
    return next();
  } catch (error) {
    console.error("[Order Automation Auth]", error);
    return res.status(503).json({ status: "error", message: "Không thể xác thực cấu hình n8n của doanh nghiệp." });
  }
}

