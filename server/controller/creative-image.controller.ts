import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { creativeImageService, type CreativeActor } from "../service/creative-image/creative-image.service";
import { enqueueCreativeImageRender } from "../queue/creative-image-queue";

function actorFrom(req: AuthenticatedRequest): CreativeActor {
  if (!req.user?.id) throw new Error("Bạn cần đăng nhập để sử dụng thiết kế từ mẫu.");
  const requestedCompany = req.headers["x-company-code"];
  const candidate = Array.isArray(requestedCompany) ? requestedCompany[0] : requestedCompany;
  const companyCode = (req.user.role === "superadmin" ? candidate || req.user.companyCode || "SYSTEM" : req.user.companyCode || "").trim().toUpperCase();
  if (!companyCode) throw new Error("Tài khoản chưa được gán doanh nghiệp.");
  return { id: req.user.id, companyCode };
}

function respondError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /không tìm thấy|không có quyền/i.test(message) ? 404 : 400;
  return res.status(status).json({ status: "error", message });
}

export const creativeImageController = {
  listTemplates(_req: AuthenticatedRequest, res: Response) {
    return res.json({ status: "success", data: creativeImageService.listTemplates() });
  },
  async createProject(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json({ status: "success", data: await creativeImageService.createProject(actorFrom(req), req.body) }); }
    catch (error) { return respondError(res, error); }
  },
  async createAiHtmlProject(req: AuthenticatedRequest, res: Response) {
    try { return res.status(201).json({ status: "success", data: await creativeImageService.createAiHtmlProject(actorFrom(req), req.body) }); }
    catch (error) { return respondError(res, error); }
  },
  async sendAiHtmlMessage(req: AuthenticatedRequest, res: Response) {
    try { return res.json({ status: "success", data: await creativeImageService.sendAiHtmlMessage(actorFrom(req), req.params.id, req.body.message, req.body.attachments) }); }
    catch (error) { return respondError(res, error); }
  },
  async getProject(req: AuthenticatedRequest, res: Response) {
    try { return res.json({ status: "success", data: await creativeImageService.getProject(actorFrom(req), req.params.id) }); }
    catch (error) { return respondError(res, error); }
  },
  async listAiHtmlProjects(req: AuthenticatedRequest, res: Response) {
    try {
      res.set("Cache-Control", "private, max-age=30");
      return res.json({ status: "success", data: await creativeImageService.listAiHtmlProjects(actorFrom(req), Number(req.query.limit || 20)) });
    }
    catch (error) { return respondError(res, error); }
  },
  async updateProject(req: AuthenticatedRequest, res: Response) {
    try { return res.json({ status: "success", data: await creativeImageService.updateProject(actorFrom(req), req.params.id, req.body) }); }
    catch (error) { return respondError(res, error); }
  },
  async createRender(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await creativeImageService.createRender(actorFrom(req), req.params.id, req.body.idempotencyKey);
      if (result.created || result.render.status === "queued") await enqueueCreativeImageRender(String(result.render._id));
      return res.status(result.created ? 202 : 200).json({ status: "success", data: result.render });
    } catch (error) { return respondError(res, error); }
  },
  async getRender(req: AuthenticatedRequest, res: Response) {
    try { return res.json({ status: "success", data: await creativeImageService.getRender(actorFrom(req), req.params.id) }); }
    catch (error) { return respondError(res, error); }
  },
  async listRenders(req: AuthenticatedRequest, res: Response) {
    try { return res.json({ status: "success", data: await creativeImageService.listRenders(actorFrom(req), Number(req.query.limit || 30)) }); }
    catch (error) { return respondError(res, error); }
  },
};
