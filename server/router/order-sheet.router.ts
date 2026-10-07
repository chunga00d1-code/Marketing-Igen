/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import Joi from "joi";
import { orderSheetController } from "../controller/order-sheet.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

export const orderSheetRouter = Router();
const integrationParams = { params: Joi.object({ integrationId: Joi.string().hex().length(24).required() }) };
const orderParams = { params: Joi.object({ orderId: Joi.string().guid({ version: ["uuidv4"] }).required() }) };

orderSheetRouter.get("/service-account", requireAuth as any, orderSheetController.serviceAccount as any);
orderSheetRouter.post("/integrations/:integrationId/test", requireAuth as any, validateRequest(integrationParams), orderSheetController.test as any);
orderSheetRouter.post("/integrations/:integrationId/template", requireAuth as any, validateRequest(integrationParams), orderSheetController.initializeTemplate as any);
orderSheetRouter.get("/orders", requireAuth as any, orderSheetController.listOrders as any);
orderSheetRouter.post("/orders/:orderId/retry", requireAuth as any, validateRequest(orderParams), orderSheetController.retry as any);
