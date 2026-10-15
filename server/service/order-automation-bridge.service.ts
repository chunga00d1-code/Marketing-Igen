import { createHmac } from "node:crypto";
import { companyOrderAutomationService } from "./company-order-automation.service";

export const orderAutomationBridgeService = {
  async forwardInbound(input: {
    companyCode: string;
    channel: "facebook" | "zalo" | "tiktok";
    accountId: string;
    conversationId: string;
    messageId?: string;
    text: string;
    attachmentUrls?: string[];
  }) {
    const runtime = await companyOrderAutomationService.getRuntimeConfig(input.companyCode);
    if (!runtime) return false;
    const { webhookUrl, webhookSecret: secret } = runtime;

    const payload = {
      eventId: input.messageId || `${input.channel}:${input.conversationId}:${Date.now()}`,
      eventType: "message.received",
      occurredAt: new Date().toISOString(),
      ...input,
      text: input.text || "[Khách gửi hình ảnh]",
      attachmentUrls: input.attachmentUrls || [],
    };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "Content-Type": "application/json",
          "X-Marketing-Signature": signature,
          "X-N8n-Secret": secret,
        },
        body: rawBody,
      });
      if (!response.ok) {
        await companyOrderAutomationService.recordDelivery(input.companyCode, "failed", `HTTP ${response.status}`);
        console.error(`[Order Automation] n8n webhook trả về HTTP ${response.status}. Dùng AI nội bộ làm fallback.`);
        return false;
      }
      await companyOrderAutomationService.recordDelivery(input.companyCode, "success");
      console.log(`[Order Automation] Đã chuyển messageId=${payload.eventId} sang n8n.`);
      return true;
    } catch (error) {
      await companyOrderAutomationService.recordDelivery(
        input.companyCode,
        "failed",
        error instanceof Error ? error.message : String(error),
      ).catch(() => undefined);
      console.error("[Order Automation] Không thể gọi n8n. Dùng AI nội bộ làm fallback:", error);
      return false;
    }
  },
};

