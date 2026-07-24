import { Router } from "express";
import { shotstackWebhookController } from "../controller/shotstack-webhook.controller";

export const shotstackWebhookRouter = Router();

shotstackWebhookRouter.post(
  "/webhooks/shotstack/:secret",
  shotstackWebhookController.receive
);
