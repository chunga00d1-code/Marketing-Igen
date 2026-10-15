import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CompanyModel } from "../model/company.model";

export interface CompanyOrderAutomationInput {
  enabled?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface CompanyOrderAutomationTestInput {
  webhookUrl?: string;
  webhookSecret?: string;
}

function encryptionKey() {
  const secret = String(
    process.env.ORDER_AUTOMATION_CONFIG_ENCRYPTION_KEY
    || process.env.SEPAY_CONFIG_ENCRYPTION_KEY
    || process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY
    || process.env.JWT_ACCESS_SECRET
    || "",
  ).trim();
  if (!secret) throw new Error("Chưa cấu hình khóa mã hóa cho tích hợp n8n.");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

function decrypt(value: string) {
  const [ivText, tagText, dataText] = String(value || "").split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Secret n8n đã lưu không hợp lệ.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64")), decipher.final()]).toString("utf8");
}

function normalizeCompanyCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeWebhookUrl(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Webhook URL n8n không hợp lệ.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Webhook URL n8n phải dùng HTTP hoặc HTTPS.");
  return parsed.toString();
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function companyWithSecret(companyCode: string) {
  return CompanyModel.findOne({ code: normalizeCompanyCode(companyCode) })
    .select("+orderAutomationConfig.webhookSecretEncrypted orderAutomationConfig code name");
}

export const companyOrderAutomationService = {
  async getConfig(companyCode: string) {
    const company = await companyWithSecret(companyCode);
    if (!company) throw new Error("Không tìm thấy doanh nghiệp.");
    const config = company.orderAutomationConfig;
    return {
      companyCode: company.code,
      companyName: company.name,
      enabled: config?.enabled === true,
      webhookUrl: String(config?.webhookUrl || ""),
      hasWebhookSecret: Boolean(config?.webhookSecretEncrypted),
      updatedAt: config?.updatedAt || null,
      lastDeliveryAt: config?.lastDeliveryAt || null,
      lastDeliveryStatus: config?.lastDeliveryStatus || "untested",
      lastDeliveryError: config?.lastDeliveryError || "",
    };
  },

  async updateConfig(companyCode: string, input: CompanyOrderAutomationInput) {
    const company = await companyWithSecret(companyCode);
    if (!company) throw new Error("Không tìm thấy doanh nghiệp.");
    const current = company.orderAutomationConfig;
    const enabled = input.enabled ?? current?.enabled ?? false;
    const webhookUrl = normalizeWebhookUrl(input.webhookUrl ?? current?.webhookUrl ?? "");
    const suppliedSecret = String(input.webhookSecret || "").trim();
    const encryptedSecret = suppliedSecret ? encrypt(suppliedSecret) : String(current?.webhookSecretEncrypted || "");
    if (enabled && (!webhookUrl || !encryptedSecret)) {
      throw new Error("Cần nhập webhook URL và secret trước khi bật tự động hóa đơn bánh.");
    }
    company.set("orderAutomationConfig", {
      enabled,
      webhookUrl,
      webhookSecretEncrypted: encryptedSecret,
      updatedAt: new Date(),
      lastDeliveryAt: current?.lastDeliveryAt || null,
      lastDeliveryStatus: suppliedSecret || input.webhookUrl ? "untested" : current?.lastDeliveryStatus || "untested",
      lastDeliveryError: suppliedSecret || input.webhookUrl ? "" : current?.lastDeliveryError || "",
    });
    await company.save();
    return this.getConfig(company.code);
  },

  async getRuntimeConfig(companyCode: string) {
    const company = await companyWithSecret(companyCode);
    const config = company?.orderAutomationConfig;
    if (!company || !config?.enabled || !config.webhookUrl || !config.webhookSecretEncrypted) return null;
    return {
      companyCode: company.code,
      webhookUrl: config.webhookUrl,
      webhookSecret: decrypt(config.webhookSecretEncrypted),
    };
  },

  async authenticate(companyCode: string, suppliedSecret: string) {
    const runtime = await this.getRuntimeConfig(companyCode);
    return Boolean(runtime && suppliedSecret && safeEqual(suppliedSecret, runtime.webhookSecret));
  },

  async testConfig(companyCode: string, input: CompanyOrderAutomationTestInput) {
    const company = await companyWithSecret(companyCode);
    if (!company) throw new Error("Không tìm thấy doanh nghiệp.");
    const config = company.orderAutomationConfig;
    const webhookUrl = normalizeWebhookUrl(input.webhookUrl ?? config?.webhookUrl ?? "");
    const suppliedSecret = String(input.webhookSecret || "").trim();
    const webhookSecret = suppliedSecret || (config?.webhookSecretEncrypted ? decrypt(config.webhookSecretEncrypted) : "");
    if (!webhookUrl || !webhookSecret) {
      throw new Error("Cần nhập webhook URL và secret trước khi kiểm tra kết nối n8n.");
    }

    const payload = {
      eventId: `configuration-test:${randomUUID()}`,
      eventType: "configuration.test",
      companyCode: company.code,
      occurredAt: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
    const startedAt = Date.now();

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: {
          "Content-Type": "application/json",
          "X-Marketing-Signature": signature,
          "X-N8n-Secret": webhookSecret,
        },
        body: rawBody,
      });
      if (!response.ok) throw new Error(`Webhook n8n trả về HTTP ${response.status}.`);
      await this.recordDelivery(company.code, "success");
      return { ok: true, statusCode: response.status, responseTimeMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordDelivery(company.code, "failed", message).catch(() => undefined);
      throw error;
    }
  },

  async recordDelivery(companyCode: string, status: "success" | "failed", error = "") {
    await CompanyModel.updateOne(
      { code: normalizeCompanyCode(companyCode) },
      {
        $set: {
          "orderAutomationConfig.lastDeliveryAt": new Date(),
          "orderAutomationConfig.lastDeliveryStatus": status,
          "orderAutomationConfig.lastDeliveryError": error.slice(0, 1000),
        },
      },
    );
  },
};

