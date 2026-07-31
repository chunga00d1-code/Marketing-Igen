import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  htmlVideoRenderService,
  type HtmlVideoActor,
} from "../service/html-video/html-video-render.service";
import { buildSafeHtmlVideoComposition } from "../service/html-video/html-video-security.service";
import { enqueueHtmlVideoRender } from "../queue/html-video-render-queue";

type ControllerRender = { id: string; status: string };

type HtmlVideoRenderServiceContract = {
  createRender(
    ...args: Parameters<typeof htmlVideoRenderService.createRender>
  ): Promise<{ render: ControllerRender; created: boolean }>;
  getRender(
    ...args: Parameters<typeof htmlVideoRenderService.getRender>
  ): Promise<unknown>;
};

export type HtmlVideoRenderControllerDependencies = {
  service: HtmlVideoRenderServiceContract;
  enqueue: typeof enqueueHtmlVideoRender;
};

function actorFrom(req: AuthenticatedRequest): HtmlVideoActor {
  if (!req.user?.id) {
    throw new Error("Bạn cần đăng nhập để tạo video từ HTML.");
  }
  const requestedCompany = req.headers["x-company-code"];
  const candidate = Array.isArray(requestedCompany)
    ? requestedCompany[0]
    : requestedCompany;
  const companyCode = (
    req.user.role === "superadmin"
      ? candidate || req.user.companyCode || "SYSTEM"
      : req.user.companyCode || ""
  )
    .trim()
    .toUpperCase();
  if (!companyCode) {
    throw new Error("Tài khoản chưa được gán doanh nghiệp.");
  }
  return { id: req.user.id, companyCode };
}

function respondError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /không tìm thấy|không có quyền/i.test(message) ? 404 : 400;
  return res.status(status).json({ success: false, message });
}

export function createHtmlVideoRenderController(
  dependencies: HtmlVideoRenderControllerDependencies
) {
  return {
    async preview(req: AuthenticatedRequest, res: Response) {
      try {
        actorFrom(req);
        const safe = buildSafeHtmlVideoComposition(req.body);
        return res.json({
          success: true,
          data: {
            compositionHtml: safe.compositionHtml,
            width: safe.width,
            height: safe.height,
          },
        });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async create(req: AuthenticatedRequest, res: Response) {
      try {
        const result = await dependencies.service.createRender(
          actorFrom(req),
          req.body
        );
        if (result.created || result.render.status === "queued") {
          await dependencies.enqueue(result.render.id);
        }
        return res.status(result.created ? 202 : 200).json({
          success: true,
          data: result.render,
        });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async get(req: AuthenticatedRequest, res: Response) {
      try {
        const render = await dependencies.service.getRender(
          actorFrom(req),
          req.params.renderId
        );
        return res.json({ success: true, data: render });
      } catch (error) {
        return respondError(res, error);
      }
    },
  };
}

export const htmlVideoRenderController = createHtmlVideoRenderController({
  service: htmlVideoRenderService,
  enqueue: enqueueHtmlVideoRender,
});
