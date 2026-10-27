/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { companyLeadSheetController } from "../controller/company-lead-sheet.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companyLeadSheetRouter = Router();

const configSchema = {
  body: Joi.object({
    enabled: Joi.boolean().optional(),
    spreadsheetUrl: Joi.string().trim().max(1000).allow("").optional(),
    sheetName: Joi.string().trim().max(80).optional(),
    chatSaveMode: Joi.string().valid("both", "lead", "order").optional(),
  }),
};

const pageParams = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };
const pageSchema = { ...pageParams, body: configSchema.body.keys({
  chatSaveMode: Joi.string().valid("inherit", "both", "lead", "order").optional(),
  leadSheetMode: Joi.string().valid("inherit", "custom").optional(),
}) };
companyLeadSheetRouter.get("/pages/:id", requireAuth as any, validateRequest(pageParams), companyLeadSheetController.getPage as any);
companyLeadSheetRouter.put("/pages/:id", requireAuth as any, requireRole(["admin", "superadmin"]) as any,
  validateRequest(pageSchema), companyLeadSheetController.updatePage as any);
companyLeadSheetRouter.post("/pages/:id/test", requireAuth as any, requireRole(["admin", "superadmin"]) as any,
  validateRequest(pageSchema), companyLeadSheetController.testPage as any);

companyLeadSheetRouter.get("/", requireAuth as any, companyLeadSheetController.get as any);
companyLeadSheetRouter.put("/", requireAuth as any, requireRole(["admin", "superadmin"]) as any,
  validateRequest(configSchema), companyLeadSheetController.update as any);
companyLeadSheetRouter.post("/test", requireAuth as any, requireRole(["admin", "superadmin"]) as any,
  validateRequest(configSchema), companyLeadSheetController.test as any);
