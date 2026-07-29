import { Router } from "express";
import { htmlVideoRenderController } from "../controller/html-video-render.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  createHtmlVideoRenderBodySchema,
  htmlVideoPreviewBodySchema,
  htmlVideoRenderParamsSchema,
} from "./html-video-render.schemas";

export const htmlVideoRenderRouter = Router();

htmlVideoRenderRouter.use(requireAuth as never);
htmlVideoRenderRouter.post(
  "/html-video-renders/preview",
  validateRequest({ body: htmlVideoPreviewBodySchema }),
  htmlVideoRenderController.preview as never
);
htmlVideoRenderRouter.post(
  "/html-video-renders",
  validateRequest({ body: createHtmlVideoRenderBodySchema }),
  htmlVideoRenderController.create as never
);
htmlVideoRenderRouter.get(
  "/html-video-renders/:renderId",
  validateRequest({ params: htmlVideoRenderParamsSchema }),
  htmlVideoRenderController.get as never
);
