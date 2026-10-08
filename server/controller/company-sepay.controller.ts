import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { companySepayService } from "../service/company-sepay.service";

function companyCode(req: AuthenticatedRequest) {
  const value = String(req.user?.companyCode || "").trim();
  if (!value) throw new Error("Tài khoản chưa được gán mã doanh nghiệp.");
  return value;
}

function baseUrl(req: AuthenticatedRequest) {
  return `${req.protocol}://${req.get("host")}`;
}

export const companySepayController = {
  async get(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companySepayService.getConfig(companyCode(req), baseUrl(req)) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      return res.json({ status: "success", data: await companySepayService.updateConfig(companyCode(req), req.body, baseUrl(req)) });
    } catch (error) {
      return res.status(400).json({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  },

  async webhook(req: AuthenticatedRequest, res: Response) {
    try {
      await companySepayService.processWebhook(
        String(req.params.webhookId || ""),
        String((req as AuthenticatedRequest & { rawBody?: string }).rawBody || ""),
        String(req.headers["x-sepay-signature"] || ""),
        String(req.headers["x-sepay-timestamp"] || ""),
        req.body,
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unauthorized = /chữ ký|hết hạn|không tồn tại|chưa được bật/i.test(message);
      return res.status(unauthorized ? 401 : 400).json({ success: false, message });
    }
  },
};
