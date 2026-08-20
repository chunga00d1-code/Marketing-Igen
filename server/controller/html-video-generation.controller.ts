import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { htmlVideoGenerationService } from "../service/html-video/html-video-generation.service";
import { enqueueHtmlVideoGeneration } from "../queue/html-video-generation-queue";

function actorFrom(req: AuthenticatedRequest) {
  if (!req.user?.id) throw new Error("Bạn cần đăng nhập để tạo video từ HTML.");
  const requestedCompany = req.headers["x-company-code"];
  const candidate = Array.isArray(requestedCompany) ? requestedCompany[0] : requestedCompany;
  const companyCode = (
    req.user.role === "superadmin"
      ? candidate || req.user.companyCode || "SYSTEM"
      : req.user.companyCode || ""
  ).trim().toUpperCase();
  if (!companyCode) throw new Error("Tài khoản chưa được gán doanh nghiệp.");
  return { id: req.user.id, companyCode };
}

function respondError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = typeof error === "object" && error !== null
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  const status = statusCode === 402
    ? 402
    : /không tìm thấy|không có quyền/i.test(message) ? 404 : 400;
  return res.status(status).json({ success: false, message });
}

export const htmlVideoGenerationController = {
  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await htmlVideoGenerationService.createGeneration(actorFrom(req), req.body);
      const generationId = String((result.generation as { id: string }).id);
      await enqueueHtmlVideoGeneration(generationId);
      return res.status(result.created ? 202 : 200).json({
        success: true,
        data: result.generation,
      });
    } catch (error) {
      return respondError(res, error);
    }
  },

  async get(req: AuthenticatedRequest, res: Response) {
    try {
      const generation = await htmlVideoGenerationService.getGeneration(
        actorFrom(req),
        req.params.generationId
      );
      return res.json({ success: true, data: generation });
    } catch (error) {
      return respondError(res, error);
    }
  },

  async retry(req: AuthenticatedRequest, res: Response) {
    try {
      const generation = await htmlVideoGenerationService.retryGeneration(
        actorFrom(req),
        req.params.generationId,
        req.body.stage
      );
      await enqueueHtmlVideoGeneration(req.params.generationId);
      return res.status(202).json({ success: true, data: generation });
    } catch (error) {
      return respondError(res, error);
    }
  },
};
