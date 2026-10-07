import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { MessengerOrderModel } from "../model/messenger-order.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { googleOrderSheetService, parseGoogleSpreadsheetId } from "../service/google-order-sheet.service";
import { messengerOrderService } from "../service/messenger-order.service";

async function integrationForUser(req: AuthenticatedRequest) {
  const companyCode = req.user?.companyCode || "SYSTEM";
  return SocialIntegrationModel.findOne({
    _id: req.params.integrationId,
    ...(req.user?.role === "superadmin" && companyCode === "SYSTEM" ? {} : { companyCode }),
    platform: "Facebook",
  });
}

export const orderSheetController = {
  async serviceAccount(_req: AuthenticatedRequest, res: Response) {
    try {
      return res.status(200).json({
        status: "success",
        data: { serviceAccountEmail: googleOrderSheetService.serviceAccountEmail() },
      });
    } catch (error) {
      return res.status(503).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async test(req: AuthenticatedRequest, res: Response) {
    try {
      const integration = await integrationForUser(req);
      if (!integration) return res.status(404).json({ status: "error", message: "Khong tim thay Fanpage." });
      const config = integration.orderSheetConfig;
      if (!config?.spreadsheetUrl && !config?.spreadsheetId) {
        return res.status(400).json({ status: "error", message: "Vui long luu link Google Sheet truoc." });
      }
      const spreadsheetId = config.spreadsheetId || parseGoogleSpreadsheetId(config.spreadsheetUrl);
      const data = await googleOrderSheetService.test(spreadsheetId);
      if (config.spreadsheetId !== spreadsheetId) {
        integration.orderSheetConfig = { ...config, spreadsheetId };
        await integration.save();
      }
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async initializeTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const integration = await integrationForUser(req);
      if (!integration) return res.status(404).json({ status: "error", message: "Khong tim thay Fanpage." });
      const config = integration.orderSheetConfig;
      if (!config?.spreadsheetUrl && !config?.spreadsheetId) {
        return res.status(400).json({ status: "error", message: "Vui long luu link Google Sheet truoc." });
      }
      const spreadsheetId = config.spreadsheetId || parseGoogleSpreadsheetId(config.spreadsheetUrl);
      await googleOrderSheetService.initializeTemplate(
        spreadsheetId,
        config.ordersSheetName || "Orders",
        config.itemsSheetName || "OrderItems"
      );
      integration.orderSheetConfig = { ...config, spreadsheetId, updatedAt: new Date() };
      await integration.save();
      return res.status(200).json({
        status: "success",
        data: { spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` },
      });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async listOrders(req: AuthenticatedRequest, res: Response) {
    const companyCode = req.user?.companyCode || "SYSTEM";
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const orders = await MessengerOrderModel.find({ companyCode }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.status(200).json({ status: "success", data: orders });
  },

  async retry(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = req.user?.companyCode || "SYSTEM";
      const order = await messengerOrderService.retry(req.params.orderId, companyCode);
      return res.status(200).json({ status: "success", data: order });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },
};
