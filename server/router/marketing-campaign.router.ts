import { Router } from "express";
import Joi from "joi";
import { marketingCampaignController } from "../controller/marketing-campaign.controller";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const marketingCampaignRouter = Router();

const createSchema = {
  body: Joi.object({
    sourceBrief: Joi.string().trim().min(3).max(30000).required(),
    campaignType: Joi.string().valid("single", "campaign").default("campaign"),
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
    captionMode: Joi.string()
      .valid("none", "speech", "context", "combined")
      .default("none"),
    qualityMode: Joi.string().valid("premium", "budget").default("premium"),
    publishMode: Joi.string().valid("auto", "manual").default("manual"),
    imageMode: Joi.string().valid("ai", "real", "order").default("ai"),
    publishNow: Joi.boolean().default(false),
    initialVideoUrl: Joi.string().uri({ scheme: ["https"] }).max(2048).optional(),
    googleDriveFolderUrl: Joi.string().allow("").optional(),
    customSchedule: Joi.object().optional(),
    images: Joi.array().items(Joi.string()).optional(),
    apifySources: Joi.array().items(Joi.string().valid("google", "facebook", "tiktok")).min(1).max(3).default(["google", "facebook", "tiktok"]),
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

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required();

const tiktokPublishOptionsSchema = Joi.object({
  caption: Joi.string().allow("").max(2200).required(),
  privacyLevel: Joi.string().valid("PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY").required(),
  allowComment: Joi.boolean().required(),
  allowDuet: Joi.boolean().required(),
  allowStitch: Joi.boolean().required(),
  brandContentToggle: Joi.boolean().required(),
  brandContent: Joi.boolean().required(),
  brandOrganic: Joi.boolean().required(),
  isAigc: Joi.boolean().required(),
  videoDurationSeconds: Joi.number().positive().required(),
  consentAccepted: Joi.boolean().valid(true).required(),
});

const tiktokBatchPublishOptionsSchema = tiktokPublishOptionsSchema.keys({
  caption: Joi.forbidden(),
  videoDurationSeconds: Joi.forbidden(),
});

const slotPublishSchema = {
  params: Joi.object({ id: objectId, slotId: objectId }),
  body: Joi.object({
    tiktokPublishOptions: tiktokPublishOptionsSchema.optional(),
  }),
};

const tiktokBatchApproveSchema = {
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    slotIds: Joi.array().items(objectId).min(1).max(100).unique().required(),
    tiktokPublishOptions: tiktokBatchPublishOptionsSchema.required(),
    videoDurations: Joi.object()
      .pattern(/^[0-9a-fA-F]{24}$/, Joi.number().positive().required())
      .min(1)
      .required(),
  }),
};

const calendarSchema = {
  query: Joi.object({
    startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  }),
};

const sheetDataType = Joi.string().valid(
  "short_text", "long_text", "number", "currency", "date", "datetime",
  "select", "multi_select", "url", "media_url", "boolean"
);
const sheetColumnBody = Joi.object({
  key: Joi.string().trim().max(100).optional(),
  label: Joi.string().trim().min(1).max(100).required(),
  dataType: sheetDataType.required(),
  required: Joi.boolean().default(false),
  options: Joi.array().items(Joi.string().trim().max(200)).max(100).default([]),
  defaultValue: Joi.any().optional(),
  fieldPolicy: Joi.string().valid("input", "constraint", "approved_override", "note").default("input"),
  ai: Joi.object({
    enabled: Joi.boolean().default(true),
    instruction: Joi.string().allow("").max(2000),
    allowedSources: Joi.array().items(Joi.string().valid("row", "campaign", "knowledge")).min(1).max(3),
    sensitiveBusinessField: Joi.boolean().default(false),
    knowledgeDocumentTypes: Joi.array().items(Joi.string().max(100)).max(20),
  }).default({}),
  display: Joi.object({ width: Joi.number().integer().min(80).max(800) }).default({}),
});
const updateSheetColumnSchema = {
  params: Joi.object({ id: objectId, columnId: Joi.string().required() }),
  body: Joi.object({
    label: Joi.string().trim().min(1).max(100),
    required: Joi.boolean(),
    options: Joi.array().items(Joi.string().trim().max(200)).max(100),
    fieldPolicy: Joi.string().valid("input", "constraint", "approved_override", "note"),
    ai: Joi.object({
      enabled: Joi.boolean(),
      instruction: Joi.string().allow("").max(2000),
      allowedSources: Joi.array().items(Joi.string().valid("row", "campaign", "knowledge")).min(1).max(3),
      sensitiveBusinessField: Joi.boolean(),
      knowledgeDocumentTypes: Joi.array().items(Joi.string().max(100)).max(20),
    }),
    display: Joi.object({
      order: Joi.number().integer().min(0).max(100),
      width: Joi.number().integer().min(80).max(800),
      hidden: Joi.boolean(),
      frozen: Joi.boolean(),
    }),
  }).min(1),
};
const updateSheetRowSchema = {
  params: Joi.object({ id: objectId, slotId: objectId }),
  body: Joi.object({
    expectedRevision: Joi.number().integer().min(0).required(),
    changes: Joi.array().items(Joi.object({
      key: Joi.string().trim().min(1).max(100).required(),
      value: Joi.any().allow(null),
      locked: Joi.boolean(),
    })).min(1).max(1000).required(),
  }),
};
const updateSheetCellsSchema = {
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    rows: Joi.array().items(Joi.object({
      slotId: objectId,
      expectedRevision: Joi.number().integer().min(0).required(),
      changes: Joi.array().items(Joi.object({
        key: Joi.string().trim().min(1).max(100).required(),
        value: Joi.any().allow(null),
        locked: Joi.boolean(),
      })).min(1).max(1000).required(),
    })).min(1).max(500).required(),
  }),
};
const sheetAIPreviewSchema = {
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    slotId: objectId,
    targetFieldKeys: Joi.array().items(Joi.string().trim().min(1).max(100)).min(1).max(30).required(),
    expectedRevision: Joi.number().integer().min(0).required(),
    overwritePolicy: Joi.string().valid("empty_only", "suggest_only", "replace_selected").default("empty_only"),
    instruction: Joi.string().allow("").max(3000),
    idempotencyKey: Joi.string().trim().min(8).max(200).required(),
  }),
};
const sheetAIJobSchema = {
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    slotIds: Joi.array().items(objectId).min(1).max(100).required(),
    targetFieldKeys: Joi.array().items(Joi.string().trim().min(1).max(100)).min(1).max(30).required(),
    overwritePolicy: Joi.string().valid("empty_only", "suggest_only", "replace_selected").default("empty_only"),
    idempotencyKey: Joi.string().trim().min(8).max(200).required(),
  }),
};

const assetOrderAssetSchema = Joi.object({
  role: Joi.string().valid("primary", "secondary", "logo", "video", "other").required(),
  sourceUrl: Joi.string().uri({ scheme: ["http", "https"] }).max(14_000_000).required(),
  originalName: Joi.string().trim().max(500).allow("").optional(),
  source: Joi.string().valid("manual", "sheet", "drive", "upload").required(),
  order: Joi.number().integer().min(0).max(100).required(),
});
const optionalAssetOrderId = Joi.string().pattern(/^[a-f\d]{24}$/i).allow("").optional();
const assetOrderCustomFields = Joi.object()
  .pattern(/^custom_[a-f\d]{12}$/i, Joi.string().trim().max(500).allow(""))
  .max(15);
const assetOrderBody = Joi.object({
  slotId: optionalAssetOrderId,
  title: Joi.string().trim().max(240).allow("").default(""),
  contentGroup: Joi.string().trim().max(240).allow("").default(""),
  shootingContent: Joi.string().trim().max(1000).allow("").default(""),
  productionRequirements: Joi.string().trim().max(2000).allow("").default(""),
  quantitySuggestion: Joi.string().trim().max(120).allow("").default(""),
  usageChannels: Joi.string().valid("Facebook").default("Facebook"),
  source: Joi.string().valid("manual", "sheet", "drive", "upload").default("manual"),
  format: Joi.string().valid("image", "video", "image_video").default("image"),
  aspectRatio: Joi.string().valid("1:1", "4:5", "9:16", "16:9").default("4:5"),
  templateId: optionalAssetOrderId,
  headline: Joi.string().trim().max(120).allow("").default(""),
  subheadline: Joi.string().trim().max(220).allow("").default(""),
  cta: Joi.string().trim().max(80).allow("").default(""),
  visualBrief: Joi.string().trim().max(1000).allow("").default(""),
  videoScript: Joi.string().trim().max(4000).allow("").default(""),
  assets: Joi.array().items(assetOrderAssetSchema).max(20).default([]),
  customFields: assetOrderCustomFields.optional(),
});
const updateAssetOrderBody = {
  body: Joi.object({
    expectedRevision: Joi.number().integer().min(0).required(),
    slotId: optionalAssetOrderId,
    title: Joi.string().trim().max(240).allow(""),
    contentGroup: Joi.string().trim().max(240).allow(""),
    shootingContent: Joi.string().trim().max(1000).allow(""),
    productionRequirements: Joi.string().trim().max(2000).allow(""),
    quantitySuggestion: Joi.string().trim().max(120).allow(""),
    usageChannels: Joi.string().valid("Facebook"),
    source: Joi.string().valid("manual", "sheet", "drive", "upload"),
    format: Joi.string().valid("image", "video", "image_video"),
    aspectRatio: Joi.string().valid("1:1", "4:5", "9:16", "16:9"),
    templateId: optionalAssetOrderId,
    headline: Joi.string().trim().max(120).allow(""),
    subheadline: Joi.string().trim().max(220).allow(""),
    cta: Joi.string().trim().max(80).allow(""),
    visualBrief: Joi.string().trim().max(1000).allow(""),
    videoScript: Joi.string().trim().max(4000).allow(""),
    assets: Joi.array().items(assetOrderAssetSchema).max(20),
    customFields: assetOrderCustomFields,
  }).min(2),
};

marketingCampaignRouter.post("/internal/prepare", marketingCampaignController.prepareWorker as never);
marketingCampaignRouter.post("/internal/media", marketingCampaignController.mediaWorker as never);
marketingCampaignRouter.post("/internal/verify", marketingCampaignController.verifyWorker as never);
marketingCampaignRouter.post("/internal/publish", marketingCampaignController.publishWorker as never);
marketingCampaignRouter.post("/internal/tiktok-status", marketingCampaignController.tiktokStatusWorker as never);
marketingCampaignRouter.post("/internal/sync-metrics", marketingCampaignController.syncMetricsWorker as never);

// Public endpoints (no auth required)
marketingCampaignRouter.get("/public/slots/:token", marketingCampaignController.getPublicSlot as never);
marketingCampaignRouter.post("/public/slots/:token/:action", marketingCampaignController.publicSlotAction as never);
marketingCampaignRouter.get("/public/dates/:token", marketingCampaignController.getPublicDailySlots as never);
marketingCampaignRouter.post("/public/dates/:token/slots/:slotId/:action", marketingCampaignController.publicDailySlotAction as never);
marketingCampaignRouter.patch("/public/dates/:token/slots/:slotId/content", marketingCampaignController.publicDailySlotUpdateContent as never);
marketingCampaignRouter.get("/public/monthly/:token", marketingCampaignController.getPublicMonthlySlots as never);
marketingCampaignRouter.post("/public/monthly/:token/slots/:slotId/:action", marketingCampaignController.publicMonthlySlotAction as never);
marketingCampaignRouter.post("/public/monthly/:token/bulk-action", marketingCampaignController.publicMonthlyBulkAction as never);

marketingCampaignRouter.use(requireAuth as never, requirePermission("marketing:post") as never);
marketingCampaignRouter.post("/preview-drive", marketingCampaignController.previewDrive as never);
marketingCampaignRouter.get("/analytics", marketingCampaignController.getAnalytics as never);
marketingCampaignRouter.get("/calendar", validateRequest(calendarSchema), marketingCampaignController.calendar as never);
marketingCampaignRouter.post("/", validateRequest(createSchema), marketingCampaignController.create as never);
marketingCampaignRouter.get("/", marketingCampaignController.list as never);
marketingCampaignRouter.get("/:id/sheet", marketingCampaignController.getSheet as never);
marketingCampaignRouter.get("/:id/asset-orders", validateRequest({ params: Joi.object({ id: objectId } ) }), marketingCampaignController.listAssetOrders as never);
marketingCampaignRouter.post("/:id/asset-orders/drive-import/preview", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    googleDriveFolderUrl: Joi.string().trim().uri().max(2000).required(),
  }),
}), marketingCampaignController.previewAssetOrderDriveImport as never);
marketingCampaignRouter.post("/:id/asset-orders/drive-import/apply", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    googleDriveFolderUrl: Joi.string().trim().uri().max(2000).required(),
  }),
}), marketingCampaignController.applyAssetOrderDriveImport as never);
marketingCampaignRouter.post("/:id/asset-orders/custom-fields", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({ label: Joi.string().trim().min(1).max(120).required() }),
}), marketingCampaignController.addAssetOrderCustomField as never);
marketingCampaignRouter.delete("/:id/asset-orders/custom-fields/:fieldKey", validateRequest({
  params: Joi.object({ id: objectId, fieldKey: Joi.string().pattern(/^custom_[a-f\d]{12}$/i).required() }),
}), marketingCampaignController.archiveAssetOrderCustomField as never);
marketingCampaignRouter.get("/:id/asset-orders/bulk-import", validateRequest({ params: Joi.object({ id: objectId } ) }), marketingCampaignController.exportAssetOrdersForBulk as never);
marketingCampaignRouter.get("/:id/asset-orders/bulk-import/jobs", validateRequest({
  params: Joi.object({ id: objectId }),
}), marketingCampaignController.listAssetOrderBulkJobs as never);
marketingCampaignRouter.post("/:id/asset-orders/bulk-import/preview", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({ jobId: objectId }),
}), marketingCampaignController.previewAssetOrdersFromBulkImport as never);
marketingCampaignRouter.post("/:id/asset-orders/bulk-import/sync", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    jobId: objectId,
    mode: Joi.string().valid("replace", "append").default("replace"),
  }),
}), marketingCampaignController.syncAssetOrdersFromBulkImport as never);
marketingCampaignRouter.post("/:id/asset-orders", validateRequest({
  params: Joi.object({ id: objectId }),
  body: assetOrderBody,
}), marketingCampaignController.createAssetOrder as never);
marketingCampaignRouter.patch("/:id/asset-orders/:orderId", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  ...updateAssetOrderBody,
}), marketingCampaignController.updateAssetOrder as never);
marketingCampaignRouter.delete("/:id/asset-orders/:orderId", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
}), marketingCampaignController.archiveAssetOrder as never);
marketingCampaignRouter.post("/:id/asset-orders/ai/fill-all", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    idempotencyKey: Joi.string().trim().min(8).max(200).required(),
    instruction: Joi.string().trim().max(2000).allow("").optional(),
    overwritePolicy: Joi.string().valid("empty_only", "replace_ai").default("empty_only"),
    orderIds: Joi.array().items(objectId).min(1).max(100).unique().optional(),
  }),
}), marketingCampaignController.fillAllAssetOrdersAI as never);
marketingCampaignRouter.get("/:id/asset-orders/ai/jobs/:jobId", validateRequest({
  params: Joi.object({ id: objectId, jobId: objectId }),
}), marketingCampaignController.getFillAllAssetOrdersAIJob as never);
marketingCampaignRouter.post("/:id/asset-orders/ai/jobs/:jobId/cancel", validateRequest({
  params: Joi.object({ id: objectId, jobId: objectId }),
  body: Joi.object({}),
}), marketingCampaignController.cancelFillAllAssetOrdersAIJob as never);
marketingCampaignRouter.post("/:id/asset-orders/:orderId/ai/preview", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  body: Joi.object({
    idempotencyKey: Joi.string().trim().min(8).max(200).required(),
    instruction: Joi.string().trim().max(2000).allow("").optional(),
  }),
}), marketingCampaignController.previewAssetOrderAI as never);
marketingCampaignRouter.post("/:id/asset-orders/:orderId/ai/apply", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  body: Joi.object({
    expectedRevision: Joi.number().integer().min(0).required(),
    fieldKeys: Joi.array().items(Joi.string().valid(
      "contentGroup",
      "shootingContent",
      "productionRequirements",
      "quantitySuggestion",
      "usageChannels",
      "format",
      "headline",
      "subheadline",
      "cta",
      "visualBrief",
      "videoScript",
      "customFields"
    )).max(12).optional(),
  }),
}), marketingCampaignController.applyAssetOrderAI as never);
marketingCampaignRouter.post("/:id/asset-orders/:orderId/ai/dismiss", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  body: Joi.object({}),
}), marketingCampaignController.dismissAssetOrderAI as never);
marketingCampaignRouter.post("/:id/asset-orders/:orderId/bulk/preview", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  body: Joi.object({ templateId: objectId }),
}), marketingCampaignController.previewAssetOrderBulk as never);
marketingCampaignRouter.post("/:id/asset-orders/:orderId/bulk", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  body: Joi.object({
    templateId: objectId,
    idempotencyKey: Joi.string().trim().min(8).max(200).required(),
  }),
}), marketingCampaignController.createAssetOrderBulk as never);
marketingCampaignRouter.post("/:id/asset-orders/:orderId/bulk/sync", validateRequest({
  params: Joi.object({ id: objectId, orderId: objectId }),
  body: Joi.object({}),
}), marketingCampaignController.syncAssetOrderBulk as never);
marketingCampaignRouter.post("/:id/sheet/columns", validateRequest({
  params: Joi.object({ id: objectId }),
  body: sheetColumnBody,
}), marketingCampaignController.addSheetColumn as never);
marketingCampaignRouter.post("/:id/sheet/rows", validateRequest({
  params: Joi.object({ id: objectId }),
  body: Joi.object({
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    platform: Joi.string().valid("Facebook", "TikTok").required(),
    pillar: Joi.string().allow("").max(500),
    objective: Joi.string().trim().min(1).max(1000).required(),
    topicBrief: Joi.string().trim().min(1).max(5000).required(),
    funnelStage: Joi.string().valid("TOFU", "MOFU", "BOFU").default("MOFU"),
    mediaType: Joi.string().valid("text", "image", "video", "human-video").required(),
    mediaSource: Joi.string().valid("drive", "ai", "upload", "production_order", "none").optional(),
  }),
}), marketingCampaignController.addSheetRow as never);
marketingCampaignRouter.patch("/:id/sheet/columns/:columnId", validateRequest(updateSheetColumnSchema), marketingCampaignController.updateSheetColumn as never);
marketingCampaignRouter.delete("/:id/sheet/columns/:columnId", validateRequest({
  params: Joi.object({ id: objectId, columnId: Joi.string().required() }),
}), marketingCampaignController.archiveSheetColumn as never);
marketingCampaignRouter.patch("/:id/sheet/cells", validateRequest(updateSheetCellsSchema), marketingCampaignController.updateSheetCells as never);
marketingCampaignRouter.patch("/:id/sheet/rows/:slotId", validateRequest(updateSheetRowSchema), marketingCampaignController.updateSheetRow as never);
marketingCampaignRouter.post("/:id/sheet/ai/preview", validateRequest(sheetAIPreviewSchema), marketingCampaignController.previewSheetAI as never);
marketingCampaignRouter.post("/:id/sheet/ai/jobs", validateRequest(sheetAIJobSchema), marketingCampaignController.createSheetAIJob as never);
marketingCampaignRouter.get("/:id/sheet/ai/jobs/:jobId", validateRequest({
  params: Joi.object({ id: objectId, jobId: objectId }),
}), marketingCampaignController.getSheetAIJob as never);
marketingCampaignRouter.post("/:id/sheet/ai/jobs/:jobId/cancel", validateRequest({
  params: Joi.object({ id: objectId, jobId: objectId }),
}), marketingCampaignController.cancelSheetAIJob as never);
marketingCampaignRouter.post("/:id/sheet/ai/jobs/:jobId/retry", validateRequest({
  params: Joi.object({ id: objectId, jobId: objectId }),
}), marketingCampaignController.retrySheetAIJob as never);
marketingCampaignRouter.post("/:id/sheet/ai/jobs/:jobId/apply", validateRequest({
  params: Joi.object({ id: objectId, jobId: objectId }),
  body: Joi.object({ fieldKeys: Joi.array().items(Joi.string().trim().min(1).max(100)).max(30).optional() }),
}), marketingCampaignController.applySheetAI as never);
marketingCampaignRouter.get("/:id/sheet/revisions", marketingCampaignController.listSheetRevisions as never);
marketingCampaignRouter.post("/:id/sheet/revisions/:revisionId/revert", validateRequest({
  params: Joi.object({ id: objectId, revisionId: objectId }),
}), marketingCampaignController.revertSheetRevision as never);
marketingCampaignRouter.get("/:id", marketingCampaignController.detail as never);
marketingCampaignRouter.post("/:id/retry-all", marketingCampaignController.retryAllSlots as never);
marketingCampaignRouter.post("/:id/slots/:slotId/retry", marketingCampaignController.retrySlot as never);
marketingCampaignRouter.post("/:id/tiktok/batch-approve", validateRequest(tiktokBatchApproveSchema), marketingCampaignController.approveTikTokSlots as never);
marketingCampaignRouter.post("/:id/slots/:slotId/approve", validateRequest(slotPublishSchema), marketingCampaignController.approveSlot as never);
marketingCampaignRouter.post("/:id/slots/:slotId/publish-now", validateRequest(slotPublishSchema), marketingCampaignController.publishNowSlot as never);
marketingCampaignRouter.post("/:id/slots/:slotId/reject", marketingCampaignController.rejectSlot as never);
marketingCampaignRouter.get("/:id/slots/:slotId/share-link", marketingCampaignController.getShareLink as never);
marketingCampaignRouter.get("/:id/dates/:date/share-link", marketingCampaignController.getDailyShareLink as never);
marketingCampaignRouter.get("/:id/monthly/:startDate/:endDate/share-link", marketingCampaignController.getMonthlyShareLink as never);
marketingCampaignRouter.post("/:id/batch-prepare", marketingCampaignController.batchPrepare as never);
marketingCampaignRouter.patch("/:id/slots/:slotId/content", validateRequest(updateContentSchema), marketingCampaignController.updateSlotContent as never);
marketingCampaignRouter.post("/:id/slots/:slotId/replace-image", validateRequest(replaceImageSchema), marketingCampaignController.replaceSlotImage as never);
marketingCampaignRouter.post("/:id/activate", marketingCampaignController.activate as never);
marketingCampaignRouter.post("/:id/:action", (req, res, next) => {
  if (!["pause", "resume", "cancel"].includes(req.params.action)) {
    return res.status(404).json({ status: "error", message: "Thao tác chiến dịch không hợp lệ." });
  }
  return next();
}, marketingCampaignController.lifecycle as never);
