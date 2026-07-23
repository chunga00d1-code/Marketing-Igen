/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { tiktokController } from "../controller/tiktok.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth, requirePermission } from "../middleware/auth";

export const tiktokRouter = Router();

tiktokRouter.post("/webhook", tiktokController.receiveWebhook as any);
tiktokRouter.get("/oauth/callback", tiktokController.oauthCallback as any);

const publishSchema = {
  body: Joi.object({
    cardId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    caption: Joi.string().optional().allow(""),
    videoUrl: Joi.string().uri().required(),
    privacyLevel: Joi.string()
      .valid("PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY")
      .required(),
    allowComment: Joi.boolean().required(),
    allowDuet: Joi.boolean().required(),
    allowStitch: Joi.boolean().required(),
    brandContentToggle: Joi.boolean().required(),
    brandContent: Joi.boolean().required(),
    brandOrganic: Joi.boolean().required(),
    isAigc: Joi.boolean().required(),
    videoDurationSeconds: Joi.number().positive().required(),
    consentAccepted: Joi.boolean().valid(true).required(),
    scheduledTime: Joi.string().isoDate().optional().allow(""),
    integrationId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional().allow(""),
  }),
};

const validateTokenSchema = {
  body: Joi.object({
    username: Joi.string().optional().allow(""),
    accessToken: Joi.string().required(),
  }),
};

const creatorInfoSchema = {
  body: Joi.object({
    integrationId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional().allow(""),
  }),
};

tiktokRouter.get(
  "/oauth/start",
  requireAuth as any,
  requirePermission("marketing:post") as any,
  tiktokController.startOAuth as any
);

tiktokRouter.post(
  "/publish",
  requireAuth as any,
  requirePermission("marketing:post") as any,
  validateRequest(publishSchema),
  tiktokController.publish as any
);

tiktokRouter.post(
  "/validate-token",
  requireAuth as any,
  requirePermission("marketing:post") as any,
  validateRequest(validateTokenSchema),
  tiktokController.validateToken as any
);

tiktokRouter.post(
  "/creator-info",
  requireAuth as any,
  requirePermission("marketing:post") as any,
  validateRequest(creatorInfoSchema),
  tiktokController.getCreatorInfo as any
);
