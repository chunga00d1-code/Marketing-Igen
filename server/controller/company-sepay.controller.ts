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
    const startedAt = Date.now();
    // Log arrival before lookup/authentication, without exposing the webhook URL,
    // signature, raw payload, account number or customer information.
    console.log("[SePay][WEBHOOK_RECEIVED]", JSON.stringify({
      at: new Date().toISOString(),
      hasSignature: Boolean(req.headers["x-sepay-signature"]),
      hasTimestamp: Boolean(req.headers["x-sepay-timestamp"]),
      hasRawBody: Boolean((req as AuthenticatedRequest & { rawBody?: string }).rawBody),
    }));
    try {
      const result = await companySepayService.processWebhook(
        String(req.params.webhookId || ""),
        String((req as AuthenticatedRequest & { rawBody?: string }).rawBody || ""),
        String(req.headers["x-sepay-signature"] || ""),
        String(req.headers["x-sepay-timestamp"] || ""),
        req.body,
      );
      console.log("[SePay][WEBHOOK_RESPONSE]", JSON.stringify({ httpStatus: 200, ...result, elapsedMs: Date.now() - startedAt }));
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unauthorized = /chữ ký|hết hạn|không tồn tại|chưa được bật/i.test(message);
      console.error("[SePay][WEBHOOK_REJECTED]", JSON.stringify({
        httpStatus: unauthorized ? 401 : 400,
        reason: /hết hạn/i.test(message) ? "timestamp_expired"
          : /chữ ký/i.test(message) ? "invalid_signature"
          : /không tồn tại|chưa được bật/i.test(message) ? "webhook_missing_or_disabled"
          : "processing_error",
        elapsedMs: Date.now() - startedAt,
      }));
      return res.status(unauthorized ? 401 : 400).json({ success: false, message });
    }
  },
};
