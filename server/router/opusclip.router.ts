/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { opusclipController } from "../controller/opusclip.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  createProjectSchema,
  getProjectSchema,
  getProjectsSchema,
} from "../validation/opusclip.validation";

export const opusclipRouter = Router();

// API tạo dự án cắt video ngắn (Yêu cầu �Ēng nhập)
opusclipRouter.post(
  "/projects",
  requireAuth as any,
  validateRequest(createProjectSchema),
  opusclipController.createProject as any
);

// API lấy danh sách dự án của người dùng hi�!n tại (Yêu cầu �Ēng nhập)
opusclipRouter.get(
  "/projects",
  requireAuth as any,
  validateRequest(getProjectsSchema),
  opusclipController.getProjects as any
);

// API lấy chi tiết và sync trạng thái dự án (Yêu cầu �Ēng nhập)
opusclipRouter.get(
  "/projects/:projectId",
  requireAuth as any,
  validateRequest(getProjectSchema),
  opusclipController.getProjectDetail as any
);

// API nhận webhook callback từ OpusClip (Public - Không dùng requireAuth)
opusclipRouter.post(
  "/webhook",
  opusclipController.handleWebhook as any
);
