/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { orderAutomationController } from "../controller/order-automation.controller";
import { requireN8nOrderAutomation } from "../middleware/n8n-order-automation-auth";
import { validateRequest } from "../middleware/validation";

export const orderAutomationRouter = Router();

const channel = Joi.string().valid("facebook", "zalo", "tiktok");
const companyCode = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{2,80}$/);
const eventId = Joi.string().trim().min(3).max(200);
const orderIdParams = Joi.object({ orderId: Joi.string().guid({ version: "uuidv4" }).required() });

orderAutomationRouter.use(requireN8nOrderAutomation as any);

orderAutomationRouter.post(
  "/conversations/next-action",
  validateRequest({
    body: Joi.object({
      eventId: eventId.required(),
      companyCode: companyCode.required(),
      channel: channel.required(),
      accountId: Joi.string().trim().max(200).required(),
      conversationId: Joi.string().trim().max(200).required(),
      messageId: Joi.string().trim().max(300).allow("").optional(),
      customerMessage: Joi.string().trim().max(10_000).required(),
      attachmentUrls: Joi.array().items(Joi.string().uri().max(3000)).max(10).default([]),
      history: Joi.array().items(Joi.object({
        sender: Joi.string().valid("user", "model").required(),
        text: Joi.string().max(5000).allow("").required(),
      })).max(30).default([]),
    }),
  }),
  orderAutomationController.nextAction as any,
);

orderAutomationRouter.get(
  "/orders/:orderId",
  validateRequest({
    params: orderIdParams,
    query: Joi.object({ companyCode: companyCode.required() }),
  }),
  orderAutomationController.getOrder as any,
);

orderAutomationRouter.post(
  "/orders/:orderId/transitions",
  validateRequest({
    params: orderIdParams,
    body: Joi.object({
      eventId: eventId.required(),
      companyCode: companyCode.required(),
      eventType: Joi.string().valid(
        "CUSTOMER_CONFIRMED",
        "DEPOSIT_REQUESTED",
        "DEPOSIT_VERIFIED",
        "SENT_TO_PRODUCTION",
        "PRODUCTION_COMPLETED",
        "REVISION_REQUESTED",
        "CAKE_APPROVED",
        "READY_FOR_DELIVERY",
        "DRIVER_PICKED_UP",
        "DELIVERED",
        "COMPLETED",
        "MANUAL_REVIEW",
        "CANCELLED",
      ).required(),
      expectedVersion: Joi.number().integer().min(1).required(),
      note: Joi.string().trim().max(1000).allow("").optional(),
      imageUrl: Joi.string().uri().max(3000).allow("").optional(),
    }),
  }),
  orderAutomationController.transition as any,
);

orderAutomationRouter.post(
  "/orders/:orderId/dispatch",
  validateRequest({
    params: orderIdParams,
    body: Joi.object({
      eventId: eventId.required(),
      companyCode: companyCode.required(),
      expectedVersion: Joi.number().integer().min(1).required(),
      text: Joi.string().trim().min(1).max(5000).required(),
    }),
  }),
  orderAutomationController.dispatch as any,
);

