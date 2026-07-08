import { Router } from "express";
import Joi from "joi";
import { klingController } from "../controller/kling.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth } from "../middleware/auth";

export const klingRouter = Router();

const motionControlSchema = {
  body: Joi.object({
    imageUrl: Joi.string().required().messages({
      "any.required": "Ảnh nhân vật tham chiếu là bắt buộc.",
      "string.base": "imageUrl phải là chuỗi.",
    }),
    videoUrl: Joi.string().required().messages({
      "any.required": "Video chuyển động tham chiếu là bắt buộc.",
      "string.base": "videoUrl phải là chuỗi.",
    }),
    modelName: Joi.string().valid("kling-v2-6", "kling-v3").optional().allow(""),
    mode: Joi.string().valid("std", "pro").optional(),
    prompt: Joi.string().max(2500).optional().allow(""),
    characterOrientation: Joi.string().valid("video", "image").optional(),
    keepOriginalSound: Joi.boolean().optional(),
    videoDuration: Joi.number().min(1).max(300).optional(),
  }),
};

klingRouter.post(
  "/motion-control",
  requireAuth as any,
  validateRequest(motionControlSchema),
  klingController.createMotionControl as any
);
