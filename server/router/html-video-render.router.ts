import { Router } from "express";
import { htmlVideoRenderController } from "../controller/html-video-render.controller";
import { htmlVideoContextController } from "../controller/html-video-context.controller";
import { htmlVideoGenerationController } from "../controller/html-video-generation.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  createHtmlVideoRenderBodySchema,
  createHtmlVideoGenerationBodySchema,
  createHtmlVideoPromptHistoryBodySchema,
  htmlVideoContextPreviewBodySchema,
  htmlVideoDraftBodySchema,
  htmlVideoPreviewBodySchema,
  htmlVideoRenderListQuerySchema,
  htmlVideoRenderParamsSchema,
  htmlVideoGenerationParamsSchema,
  retryHtmlVideoGenerationBodySchema,
} from "./html-video-render.schemas";

export const htmlVideoRenderRouter = Router();

htmlVideoRenderRouter.post(
  "/html-video-generations",
  requireAuth as never,
  validateRequest({ body: createHtmlVideoGenerationBodySchema }),
  htmlVideoGenerationController.create as never
);
htmlVideoRenderRouter.get(
  "/html-video-generations/:generationId",
  requireAuth as never,
  validateRequest({ params: htmlVideoGenerationParamsSchema }),
  htmlVideoGenerationController.get as never
);
htmlVideoRenderRouter.post(
  "/html-video-generations/:generationId/retry",
  requireAuth as never,
  validateRequest({
    params: htmlVideoGenerationParamsSchema,
    body: retryHtmlVideoGenerationBodySchema,
  }),
  htmlVideoGenerationController.retry as never
);

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
  validateRequest({ query: htmlVideoRenderListQuerySchema }),
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
  "/html-video-renders/:renderId/edit-source",
  requireAuth as never,
  validateRequest({ params: htmlVideoRenderParamsSchema }),
  htmlVideoRenderController.getEditSource as never
);
htmlVideoRenderRouter.get(
  "/html-video-renders/:renderId",
  requireAuth as never,
  validateRequest({ params: htmlVideoRenderParamsSchema }),
  htmlVideoRenderController.get as never
);
htmlVideoRenderRouter.delete(
  "/html-video-renders/:renderId",
  requireAuth as never,
  validateRequest({ params: htmlVideoRenderParamsSchema }),
  htmlVideoRenderController.delete as never
);
