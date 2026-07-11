import { Router } from "express";
import Joi from "joi";
import { marketingCampaignController } from "../controller/marketing-campaign.controller";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const marketingCampaignRouter = Router();

const createSchema = {
  body: Joi.object({
    sourceBrief: Joi.string().trim().min(3).max(30000).required(),
    startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    postsPerDay: Joi.number().integer().min(1).max(5).required(),
    postingTimes: Joi.array().items(Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(5).required(),
    timezone: Joi.string().max(100).default("Asia/Bangkok"),
    platforms: Joi.array().items(Joi.string().valid("Facebook", "TikTok")).min(1).required(),
    integrationIds: Joi.object({ Facebook: Joi.string().allow(""), TikTok: Joi.string().allow("") }).default({}),
    candidateCount: Joi.number().integer().min(2).max(5).default(3),
    generationLeadMinutes: Joi.number().integer().min(15).max(1440).default(60),
    verificationLeadMinutes: Joi.number().integer().min(5).max(180).default(15),
    latePublishWindowMinutes: Joi.number().integer().min(0).max(1440).default(30),
    minimumScore: Joi.number().integer().min(0).max(100).default(80),
    mediaPolicy: Joi.string().valid("text", "image", "video", "auto").default("auto"),
    images: Joi.array().items(Joi.string()).optional(),
    rules: Joi.object({
      requiredCta: Joi.string().allow(""),
      requiredHashtags: Joi.array().items(Joi.string()),
      forbiddenTerms: Joi.array().items(Joi.string()),
      allowTextOnlyFallback: Joi.boolean(),
    }).default({}),
  }),
};

marketingCampaignRouter.post("/internal/prepare", marketingCampaignController.prepareWorker as never);
marketingCampaignRouter.post("/internal/media", marketingCampaignController.mediaWorker as never);
marketingCampaignRouter.post("/internal/verify", marketingCampaignController.verifyWorker as never);
marketingCampaignRouter.post("/internal/publish", marketingCampaignController.publishWorker as never);
marketingCampaignRouter.use(requireAuth as never, requirePermission("marketing:post") as never);
marketingCampaignRouter.post("/", validateRequest(createSchema), marketingCampaignController.create as never);
marketingCampaignRouter.get("/", marketingCampaignController.list as never);
marketingCampaignRouter.get("/:id", marketingCampaignController.detail as never);
marketingCampaignRouter.post("/:id/retry-all", marketingCampaignController.retryAllSlots as never);
marketingCampaignRouter.post("/:id/slots/:slotId/retry", marketingCampaignController.retrySlot as never);
marketingCampaignRouter.post("/:id/:action", (req, res, next) => {
  if (!["pause", "resume", "cancel"].includes(req.params.action)) {
    return res.status(404).json({ status: "error", message: "Thao tác chiến dịch không hợp lệ." });
  }
  return next();
}, marketingCampaignController.lifecycle as never);
