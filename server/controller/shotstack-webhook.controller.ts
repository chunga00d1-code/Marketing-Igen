import type { Request, Response } from "express";
import {
  acceptShotstackWebhook,
  ShotstackWebhookError,
} from "../service/shotstack-render.service";

type ShotstackWebhookControllerDependencies = {
  acceptWebhook: typeof acceptShotstackWebhook;
};

const defaultDependencies: ShotstackWebhookControllerDependencies = {
  acceptWebhook: acceptShotstackWebhook,
};

export function createShotstackWebhookHandler(
  dependencies: ShotstackWebhookControllerDependencies = defaultDependencies
) {
  return async (req: Request, res: Response) => {
    try {
      await dependencies.acceptWebhook(req.body, req.params.secret);
      return res.status(202).json({ status: "success" });
    } catch (error: unknown) {
      if (error instanceof ShotstackWebhookError) {
        return res.status(error.status).json({
          status: "error",
          message: error.message,
        });
      }
      return res.status(500).json({
        status: "error",
        message: "Shotstack webhook could not be processed.",
      });
    }
  };
}

export const shotstackWebhookController = {
  receive: createShotstackWebhookHandler(),
};
