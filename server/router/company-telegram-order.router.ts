/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { companyTelegramOrderController } from "../controller/company-telegram-order.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const companyTelegramOrderRouter = Router();

const configSchema = {
  body: Joi.object({
    enabled: Joi.boolean().optional(),
    notifyNewOrder: Joi.boolean().optional(),
    botToken: Joi.string().max(300).allow("").optional(),
    groupChatId: Joi.string().pattern(/^-\d+$/).allow("").optional(),
    messageThreadId: Joi.number().integer().min(1).allow(null).optional(),
  }),
};

companyTelegramOrderRouter.get("/", requireAuth as any, companyTelegramOrderController.get as any);
companyTelegramOrderRouter.put("/", requireAuth as any, requireRole(["admin", "superadmin"]) as any, validateRequest(configSchema), companyTelegramOrderController.update as any);
companyTelegramOrderRouter.post("/test", requireAuth as any, requireRole(["admin", "superadmin"]) as any, validateRequest(configSchema), companyTelegramOrderController.test as any);
