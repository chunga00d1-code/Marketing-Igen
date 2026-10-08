/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { companySepayController } from "../controller/company-sepay.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companySepayRouter = Router();

const updateSchema = {
  body: Joi.object({
    enabled: Joi.boolean().optional(),
    webhookSecret: Joi.string().max(500).allow("").optional(),
    accountNumbers: Joi.array().items(Joi.string().trim().max(50)).max(20).optional(),
    paymentCodePrefix: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{2,5}$/).optional(),
  }),
};

companySepayRouter.post("/webhooks/sepay/:webhookId", companySepayController.webhook as any);
companySepayRouter.get("/company-sepay", requireAuth as any, companySepayController.get as any);
companySepayRouter.put(
  "/company-sepay",
  requireAuth as any,
  requireRole(["admin", "superadmin"]) as any,
  validateRequest(updateSchema),
  companySepayController.update as any,
);
