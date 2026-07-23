/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import { bulkCreateController } from "../controller/bulk-create.controller";
import { BULK_FONT_FAMILIES } from "../interface/bulk-create.interface";

export const bulkCreateRouter = Router();

const hexColor = Joi.string().pattern(/^#[0-9a-f]{6}$/i);
const layerSchema = Joi.object({
  id: Joi.string().max(100).required(),
  type: Joi.string().valid("text", "image").required(),
  fieldName: Joi.string().trim().max(100).required(),
  x: Joi.number().min(0).max(100).required(),
  y: Joi.number().min(0).max(100).required(),
  width: Joi.number().min(1).max(100).required(),
  height: Joi.number().min(1).max(100).required(),
  rotation: Joi.number().min(-360).max(360).default(0),
  zIndex: Joi.number().integer().min(0).max(1000).required(),
  locked: Joi.boolean().optional(),
  fit: Joi.string().valid("cover", "contain").optional(),
  fontSize: Joi.number().min(8).max(300).optional(),
  fontFamily: Joi.string().valid(...BULK_FONT_FAMILIES).optional(),
  fontWeight: Joi.number().valid(100, 200, 300, 400, 500, 600, 700, 800, 900).optional(),
  fontStyle: Joi.string().valid("normal", "italic").optional(),
  color: hexColor.optional(),
  textAlign: Joi.string().valid("left", "center", "right").optional(),
  textDecoration: Joi.string().valid("none", "underline", "line-through").optional(),
  textTransform: Joi.string().valid("none", "uppercase", "lowercase", "capitalize").optional(),
  letterSpacing: Joi.number().min(-5).max(30).optional(),
  lineHeight: Joi.number().min(0.8).max(3).optional(),
  defaultValue: Joi.string().max(14_000_000).allow("").optional(),
  dataBinding: Joi.object({
    columnKey: Joi.string().trim().min(1).max(120).required(),
    columnLabel: Joi.string().trim().min(1).max(120).required(),
  }).optional(),
});
const templateFields = {
  sceneVersion: Joi.number().integer().min(1).max(10).optional(),
  name: Joi.string().trim().min(1).max(120).required(),
  canvas: Joi.object({ width: Joi.number().integer().min(320).max(4096).required(), height: Joi.number().integer().min(320).max(4096).required() }).required(),
  background: Joi.object({
    type: Joi.string().valid("color", "gradient", "image").required(),
    color: hexColor.optional(),
    colors: Joi.array().items(hexColor).max(2).optional(),
    imageUrl: Joi.string().max(14_000_000).optional(),
  }).required(),
  layers: Joi.array().items(layerSchema).min(1).max(20).required(),
  thumbnailUrl: Joi.string().uri().optional().allow(""),
};
const templateSchema = { body: Joi.object(templateFields) };
const updateTemplateSchema = { body: Joi.object({ ...templateFields, name: templateFields.name.optional(), canvas: templateFields.canvas.optional(), background: templateFields.background.optional(), layers: templateFields.layers.optional() }).min(1) };
const idSchema = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };
const previewSchema = { body: Joi.object({ templateId: Joi.string().hex().length(24).optional(), template: Joi.object(templateFields).optional(), values: Joi.object().pattern(Joi.string().max(100), Joi.string().max(14_000_000)).required() }).or("templateId", "template") };
const createJobSchema = { body: Joi.object({ templateId: Joi.string().hex().length(24).required(), idempotencyKey: Joi.string().min(8).max(150).required(), rows: Joi.array().items(Joi.object().pattern(Joi.string().max(100), Joi.string().max(14_000_000))).min(1).max(100).required() }) };
const uploadAssetSchema = {
  body: Joi.object({
    file: Joi.string().dataUri().max(14_000_000).required(),
    originalName: Joi.string().trim().max(255).optional(),
  }),
};
const googleSheetPreviewSchema = {
  body: Joi.object({
    url: Joi.string().uri({ scheme: ["https"] }).max(2_000).required(),
    range: Joi.string().trim().max(120).allow("").optional(),
  }),
};

bulkCreateRouter.use(requireAuth as any, requirePermission("marketing:post") as any);
bulkCreateRouter.post("/google-sheets/preview", validateRequest(googleSheetPreviewSchema), bulkCreateController.previewGoogleSheet as any);
bulkCreateRouter.post("/assets", validateRequest(uploadAssetSchema), bulkCreateController.uploadAsset as any);
bulkCreateRouter.get("/assets", bulkCreateController.listAssets as any);
bulkCreateRouter.delete("/assets/:id", validateRequest(idSchema), bulkCreateController.archiveAsset as any);
bulkCreateRouter.post("/templates", validateRequest(templateSchema), bulkCreateController.createTemplate as any);
bulkCreateRouter.get("/templates", bulkCreateController.listTemplates as any);
bulkCreateRouter.get("/templates/community", bulkCreateController.listCommunityTemplates as any);
bulkCreateRouter.post("/templates/:id/publish", validateRequest(idSchema), bulkCreateController.publishTemplate as any);
bulkCreateRouter.post("/templates/:id/unpublish", validateRequest(idSchema), bulkCreateController.unpublishTemplate as any);
bulkCreateRouter.post("/templates/:id/use", validateRequest(idSchema), bulkCreateController.useCommunityTemplate as any);
bulkCreateRouter.get("/templates/:id", validateRequest(idSchema), bulkCreateController.getTemplate as any);
bulkCreateRouter.patch("/templates/:id", validateRequest({ ...idSchema, ...updateTemplateSchema }), bulkCreateController.updateTemplate as any);
bulkCreateRouter.delete("/templates/:id", validateRequest(idSchema), bulkCreateController.archiveTemplate as any);
bulkCreateRouter.post("/preview", validateRequest(previewSchema), bulkCreateController.preview as any);
bulkCreateRouter.post("/jobs", validateRequest(createJobSchema), bulkCreateController.createJob as any);
bulkCreateRouter.get("/jobs", bulkCreateController.listJobs as any);
bulkCreateRouter.get("/jobs/:id", validateRequest(idSchema), bulkCreateController.getJob as any);
bulkCreateRouter.get("/jobs/:id/items", validateRequest(idSchema), bulkCreateController.listItems as any);
bulkCreateRouter.get("/jobs/:id/download", validateRequest(idSchema), bulkCreateController.downloadZip as any);
bulkCreateRouter.post("/jobs/:id/retry", validateRequest(idSchema), bulkCreateController.retry as any);
bulkCreateRouter.post("/jobs/:id/cancel", validateRequest(idSchema), bulkCreateController.cancel as any);
