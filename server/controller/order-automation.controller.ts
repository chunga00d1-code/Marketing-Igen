import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { cakeOrderAutomationService, OrderAutomationError } from "../service/cake-order-automation.service";

function errorResponse(res: Response, error: unknown) {
  const status = error instanceof OrderAutomationError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Không thể xử lý yêu cầu tự động hóa đơn bánh.";
  if (status >= 500) console.error("[Order Automation Controller]", error);
  return res.status(status).json({ status: "error", message });
}

export const orderAutomationController = {
  async nextAction(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await cakeOrderAutomationService.nextAction(req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return errorResponse(res, error);
    }
  },

  async transition(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await cakeOrderAutomationService.transition({
        ...req.body,
        orderId: req.params.orderId,
      });
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return errorResponse(res, error);
    }
  },

  async getOrder(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await cakeOrderAutomationService.getOrder(String(req.query.companyCode || ""), req.params.orderId);
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return errorResponse(res, error);
    }
  },

  async dispatch(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await cakeOrderAutomationService.dispatch({
        ...req.body,
        orderId: req.params.orderId,
      });
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return errorResponse(res, error);
    }
  },
};

