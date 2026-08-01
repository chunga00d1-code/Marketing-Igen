import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  htmlVideoContextService,
  type HtmlVideoContextActor,
} from "../service/html-video/html-video-context.service";

function actorFrom(req: AuthenticatedRequest): HtmlVideoContextActor {
  if (!req.user?.id) throw new Error("Bạn cần đăng nhập để tạo video bằng AI.");
  const requestedCompany = req.headers["x-company-code"];
  const requested = Array.isArray(requestedCompany) ? requestedCompany[0] : requestedCompany;
  const companyCode = (
    req.user.role === "superadmin"
      ? requested || req.user.companyCode || "SYSTEM"
      : req.user.companyCode || ""
  ).trim().toUpperCase();
  if (!companyCode) throw new Error("Tài khoản chưa được gán doanh nghiệp.");
  return { id: req.user.id, companyCode };
}

function respondError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(400).json({ success: false, message });
}

export const htmlVideoContextController = {
  async preview(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await htmlVideoContextService.preview(actorFrom(req), req.body);
      return res.json({ success: true, data });
    } catch (error) {
      return respondError(res, error);
    }
  },
};
