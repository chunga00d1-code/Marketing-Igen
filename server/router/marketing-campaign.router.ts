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
    timezone: Joi.string().max(100).default("Asia/Ho_Chi_Minh"),
    platforms: Joi.array().items(Joi.string().valid("Facebook", "TikTok")).min(1).required(),
    integrationIds: Joi.object({ Facebook: Joi.string().allow(""), TikTok: Joi.string().allow("") }).default({}),
    candidateCount: Joi.number().integer().min(1).max(5).default(1),
    generationLeadMinutes: Joi.number().integer().min(15).max(1440).default(60),
    verificationLeadMinutes: Joi.number().integer().min(5).max(180).default(15),
    latePublishWindowMinutes: Joi.number().integer().min(0).max(1440).default(30),
    minimumScore: Joi.number().integer().min(0).max(100).default(80),
    mediaPolicy: Joi.string().valid("text", "image", "video", "auto").default("auto"),
    qualityMode: Joi.string().valid("premium", "budget").default("premium"),
    publishMode: Joi.string().valid("auto", "manual").default("manual"),
    imageMode: Joi.string().valid("ai", "real").default("ai"),
    googleDriveFolderUrl: Joi.string().allow("").optional(),
    customSchedule: Joi.object().optional(),
    images: Joi.array().items(Joi.string()).optional(),
    rules: Joi.object({
      requiredCta: Joi.string().allow(""),
      requiredHashtags: Joi.array().items(Joi.string()),
      forbiddenTerms: Joi.array().items(Joi.string()),
      allowTextOnlyFallback: Joi.boolean(),
    }).default({}),
  }),
};

const updateContentSchema = {
  body: Joi.object({
    title: Joi.string().trim().max(500).optional(),
    bodyText: Joi.string().trim().max(10000).optional(),
    outline: Joi.string().trim().max(5000).allow("").optional(),
    mediaPrompt: Joi.string().trim().max(5000).allow("").optional(),
  }),
};

const replaceImageSchema = {
  body: Joi.object({
    image: Joi.string().required(),
  }),
};

marketingCampaignRouter.post("/internal/prepare", marketingCampaignController.prepareWorker as never);
marketingCampaignRouter.post("/internal/media", marketingCampaignController.mediaWorker as never);
marketingCampaignRouter.post("/internal/verify", marketingCampaignController.verifyWorker as never);
marketingCampaignRouter.post("/internal/publish", marketingCampaignController.publishWorker as never);

// Public endpoints (no auth required)
marketingCampaignRouter.get("/public/slots/:token", marketingCampaignController.getPublicSlot as never);
marketingCampaignRouter.post("/public/slots/:token/:action", marketingCampaignController.publicSlotAction as never);
marketingCampaignRouter.get("/public/dates/:token", marketingCampaignController.getPublicDailySlots as never);
marketingCampaignRouter.post("/public/dates/:token/slots/:slotId/:action", marketingCampaignController.publicDailySlotAction as never);
marketingCampaignRouter.patch("/public/dates/:token/slots/:slotId/content", marketingCampaignController.publicDailySlotUpdateContent as never);

marketingCampaignRouter.use(requireAuth as never, requirePermission("marketing:post") as never);
marketingCampaignRouter.post("/preview-drive", marketingCampaignController.previewDrive as never);
marketingCampaignRouter.post("/", validateRequest(createSchema), marketingCampaignController.create as never);
marketingCampaignRouter.get("/", marketingCampaignController.list as never);
marketingCampaignRouter.get("/:id", marketingCampaignController.detail as never);
marketingCampaignRouter.post("/:id/retry-all", marketingCampaignController.retryAllSlots as never);
marketingCampaignRouter.post("/:id/slots/:slotId/retry", marketingCampaignController.retrySlot as never);
marketingCampaignRouter.post("/:id/slots/:slotId/approve", marketingCampaignController.approveSlot as never);
marketingCampaignRouter.post("/:id/slots/:slotId/reject", marketingCampaignController.rejectSlot as never);
marketingCampaignRouter.get("/:id/slots/:slotId/share-link", marketingCampaignController.getShareLink as never);
marketingCampaignRouter.get("/:id/dates/:date/share-link", marketingCampaignController.getDailyShareLink as never);
marketingCampaignRouter.patch("/:id/slots/:slotId/content", validateRequest(updateContentSchema), marketingCampaignController.updateSlotContent as never);
marketingCampaignRouter.post("/:id/slots/:slotId/replace-image", validateRequest(replaceImageSchema), marketingCampaignController.replaceSlotImage as never);
marketingCampaignRouter.post("/:id/:action", (req, res, next) => {
  if (!["pause", "resume", "cancel"].includes(req.params.action)) {
    return res.status(404).json({ status: "error", message: "Thao tác chiến dịch không hợp lệ." });
  }
  return next();
}, marketingCampaignController.lifecycle as never);
