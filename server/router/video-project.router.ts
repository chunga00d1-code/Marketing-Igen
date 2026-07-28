import { Router } from "express";
import { videoTemplateController } from "../controller/video-template.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  createVideoProjectBodySchema,
  createVideoProjectRenderBodySchema,
  signVideoProjectMediaBodySchema,
  updateVideoProjectBodySchema,
} from "./video-template.schemas";

export const videoProjectRouter = Router();

videoProjectRouter.get("/video-projects", requireAuth, videoTemplateController.projects);
videoProjectRouter.post(
  "/video-projects",
  requireAuth,
  validateRequest({ body: createVideoProjectBodySchema }),
  videoTemplateController.createProject
);
videoProjectRouter.post(
  "/video-projects/media/sign-upload",
  requireAuth,
  validateRequest({ body: signVideoProjectMediaBodySchema }),
  videoTemplateController.signProjectMediaUpload
);
videoProjectRouter.post(
  "/video-projects/:projectId/renders",
  requireAuth,
  validateRequest({ body: createVideoProjectRenderBodySchema }),
  videoTemplateController.createProjectRender
);
videoProjectRouter.get(
  "/video-projects/:projectId/renders",
  requireAuth,
  videoTemplateController.projectRenders
);
videoProjectRouter.get(
  "/video-projects/:projectId/renders/:renderId",
  requireAuth,
  videoTemplateController.projectRender
);
videoProjectRouter.get(
  "/video-projects/:projectId",
  requireAuth,
  videoTemplateController.project
);
videoProjectRouter.patch(
  "/video-projects/:projectId",
  requireAuth,
  validateRequest({ body: updateVideoProjectBodySchema }),
  videoTemplateController.updateProject
);
