/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { companyOrderAutomationController } from "../controller/company-order-automation.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companyOrderAutomationRouter = Router();

const configSchema = {
  body: Joi.object({
    enabled: Joi.boolean().optional(),
    webhookUrl: Joi.string().uri({ scheme: ["http", "https"] }).max(2000).allow("").optional(),
    webhookSecret: Joi.string().trim().min(24).max(500).allow("").optional(),
  }),
};

companyOrderAutomationRouter.get("/", requireAuth as any, companyOrderAutomationController.get as any);
companyOrderAutomationRouter.put(
  "/",
  requireAuth as any,
  requireRole(["admin", "superadmin"]) as any,
  validateRequest(configSchema),
  companyOrderAutomationController.update as any,
);
companyOrderAutomationRouter.post(
  "/test",
  requireAuth as any,
  requireRole(["admin", "superadmin"]) as any,
  validateRequest({
    body: Joi.object({
      webhookUrl: Joi.string().uri({ scheme: ["http", "https"] }).max(2000).allow("").optional(),
      webhookSecret: Joi.string().trim().min(24).max(500).allow("").optional(),
    }),
  }),
  companyOrderAutomationController.test as any,
);

