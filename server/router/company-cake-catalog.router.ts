/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { companyProductCatalogController } from "../controller/company-cake-catalog.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companyCakeCatalogRouter = Router();

const configSchema = {
  body: Joi.object({
    enabled: Joi.boolean().optional(),
    rootFolderUrl: Joi.string().trim().max(1000).allow("").optional(),
    maxImagesPerReply: Joi.number().integer().min(1).max(10).optional(),
    catalogName: Joi.string().trim().max(100).allow("").optional(),
    itemLabel: Joi.string().trim().max(80).allow("").optional(),
    selectionMessage: Joi.string().trim().max(500).allow("").optional(),
    businessDescription: Joi.string().trim().max(1000).allow("").optional(),
    categoryAliases: Joi.object().pattern(
      Joi.string().trim().max(100),
      Joi.array().items(Joi.string().trim().max(100)).max(20),
    ).max(100).optional(),
  }),
};

companyCakeCatalogRouter.get("/", requireAuth as any, companyProductCatalogController.get as any);
companyCakeCatalogRouter.put("/", requireAuth as any, requireRole(["admin", "superadmin"]) as any, validateRequest(configSchema), companyProductCatalogController.update as any);
companyCakeCatalogRouter.post("/test", requireAuth as any, requireRole(["admin", "superadmin"]) as any, validateRequest(configSchema), companyProductCatalogController.test as any);

export const companyProductCatalogRouter = companyCakeCatalogRouter;
