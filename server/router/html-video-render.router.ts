import { Router } from "express";
import { htmlVideoRenderController } from "../controller/html-video-render.controller";
import { htmlVideoContextController } from "../controller/html-video-context.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  createHtmlVideoRenderBodySchema,
  createHtmlVideoPromptHistoryBodySchema,
  htmlVideoContextPreviewBodySchema,
  htmlVideoDraftBodySchema,
  htmlVideoPreviewBodySchema,
  htmlVideoRenderParamsSchema,
} from "./html-video-render.schemas";

export const htmlVideoRenderRouter = Router();

htmlVideoRenderRouter.post(
  "/html-video-renders/context-preview",
  requireAuth as never,
  validateRequest({ body: htmlVideoContextPreviewBodySchema }),
  htmlVideoContextController.preview as never
);

htmlVideoRenderRouter.post(
  "/html-video-renders/generate-draft",
  requireAuth as never,
  validateRequest({ body: htmlVideoDraftBodySchema }),
  htmlVideoRenderController.generateDraft as never
);
htmlVideoRenderRouter.post(
  "/html-video-renders/preview",
  requireAuth as never,
  validateRequest({ body: htmlVideoPreviewBodySchema }),
  htmlVideoRenderController.preview as never
);
htmlVideoRenderRouter.post(
  "/html-video-renders",
  requireAuth as never,
  validateRequest({ body: createHtmlVideoRenderBodySchema }),
  htmlVideoRenderController.create as never
);
htmlVideoRenderRouter.get(
  "/html-video-renders",
  requireAuth as never,
  htmlVideoRenderController.list as never
);
htmlVideoRenderRouter.get(
  "/html-video-prompt-history",
  requireAuth as never,
  htmlVideoRenderController.listPromptHistory as never
);
htmlVideoRenderRouter.post(
  "/html-video-prompt-history",
  requireAuth as never,
  validateRequest({ body: createHtmlVideoPromptHistoryBodySchema }),
  htmlVideoRenderController.createPromptHistory as never
);
htmlVideoRenderRouter.get(
  "/html-video-renders/:renderId",
  requireAuth as never,
  validateRequest({ params: htmlVideoRenderParamsSchema }),
  htmlVideoRenderController.get as never
);
