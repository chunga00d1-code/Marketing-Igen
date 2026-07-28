import { Router } from "express";
import { videoTemplateController } from "../controller/video-template.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  useVideoTemplateBodySchema,
  videoTemplateListQuerySchema,
} from "./video-template.schemas";

export const videoTemplateRouter = Router();

videoTemplateRouter.post(
  "/admin/video-templates/shotstack/sync",
  requireAuth,
  requireRole(["admin", "superadmin"]),
  videoTemplateController.sync
);
videoTemplateRouter.post(
  "/admin/video-templates/:templateId/preview/retry",
  requireAuth,
  requireRole(["admin", "superadmin"]),
  videoTemplateController.retryPreview
);
videoTemplateRouter.get(
  "/admin/video-templates/shotstack/status",
  requireAuth,
  requireRole(["admin", "superadmin"]),
  videoTemplateController.status
);
videoTemplateRouter.get(
  "/video-template-categories",
  requireAuth,
  videoTemplateController.categories
);
videoTemplateRouter.get(
  "/video-templates",
  requireAuth,
  validateRequest({ query: videoTemplateListQuerySchema }),
  videoTemplateController.list
);
videoTemplateRouter.get(
  "/video-templates/:templateId",
  requireAuth,
  videoTemplateController.detail
);
videoTemplateRouter.post(
  "/video-templates/:templateId/use",
  requireAuth,
  validateRequest({ body: useVideoTemplateBodySchema }),
  videoTemplateController.use
);
