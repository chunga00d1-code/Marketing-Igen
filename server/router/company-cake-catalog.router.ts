/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { companyCakeCatalogController } from "../controller/company-cake-catalog.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companyCakeCatalogRouter = Router();

const configSchema = {
  body: Joi.object({
    enabled: Joi.boolean().optional(),
    rootFolderUrl: Joi.string().trim().max(1000).allow("").optional(),
    maxImagesPerReply: Joi.number().integer().min(1).max(10).optional(),
  }),
};

companyCakeCatalogRouter.get("/", requireAuth as any, companyCakeCatalogController.get as any);
companyCakeCatalogRouter.put("/", requireAuth as any, requireRole(["admin", "superadmin"]) as any, validateRequest(configSchema), companyCakeCatalogController.update as any);
companyCakeCatalogRouter.post("/test", requireAuth as any, requireRole(["admin", "superadmin"]) as any, validateRequest(configSchema), companyCakeCatalogController.test as any);
