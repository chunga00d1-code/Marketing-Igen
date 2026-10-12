import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CompanyModel } from "../model/company.model";
import { MessengerOrderModel } from "../model/messenger-order.model";
import { SepayWebhookTransactionModel } from "../model/sepay-webhook-transaction.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { googleOrderSheetService, parseGoogleSpreadsheetId } from "./google-order-sheet.service";
import { companyTelegramOrderService } from "./company-telegram-order.service";
import { cakePaidMessage } from "./cake-shipping";
import { CakeConsultationSessionModel } from "../model/cake-customer-memory.model";

export interface SepayConfigInput {
  enabled?: boolean;
  webhookSecret?: string;
  accountNumbers?: string[];
  paymentCodePrefix?: string;
  depositEnabled?: boolean;
  depositPercent?: number;
  qrBankId?: string;
  qrAccountNumber?: string;
  qrAccountName?: string;
}

export interface SepayPayload {
  id?: string | number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string | null;
  code?: string | null;
  content?: string | null;
  transferType?: string;
  description?: string | null;
  transferAmount?: number;
  accumulated?: number;
  referenceCode?: string | null;
  [key: string]: unknown;
}

function encryptionKey() {
  const secret = String(
    process.env.SEPAY_CONFIG_ENCRYPTION_KEY
    || process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY
    || process.env.JWT_ACCESS_SECRET
    || ""
  ).trim();
  if (!secret) throw new Error("SePay encryption key is missing.");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

function decrypt(value: string) {
  const [version, iv, tag, body] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Stored SePay webhook secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeAccount(value: unknown) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizePrefix(value: unknown) {
  const result = String(value || "DH").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(result)) throw new Error("Tiền tố mã thanh toán phải gồm 2-5 chữ cái hoặc chữ số.");
  return result;
}

async function companyWithSecret(filter: Record<string, unknown>) {
  return CompanyModel.findOne(filter).select("+sepayConfig.webhookSecretEncrypted");
}

function publicConfig(record: Awaited<ReturnType<typeof companyWithSecret>>, baseUrl: string) {
  if (!record) throw new Error("Company was not found.");
  const config = record.sepayConfig;
  const webhookId = String(config?.webhookId || "");
  return {
    companyCode: record.code,
    companyName: record.name,
    enabled: Boolean(config?.enabled),
    hasWebhookSecret: Boolean(config?.webhookSecretEncrypted),
    webhookId,
    webhookUrl: webhookId ? `${baseUrl.replace(/\/$/, "")}/api/v1/webhooks/sepay/${webhookId}` : "",
    accountNumbers: config?.accountNumbers || [],
    paymentCodePrefix: config?.paymentCodePrefix || "DH",
    depositEnabled: Boolean(config?.depositEnabled),
    depositPercent: Number(config?.depositPercent || 30),
    qrBankId: String(config?.qrBankId || ""),
    qrAccountNumber: String(config?.qrAccountNumber || ""),
    qrAccountName: String(config?.qrAccountName || ""),
    lastWebhookAt: config?.lastWebhookAt || null,
    lastWebhookStatus: config?.lastWebhookStatus || "untested",
    lastWebhookError: String(config?.lastWebhookError || ""),
  };
}

async function ensureCompany(companyCode: string) {
  const record = await companyWithSecret({ code: String(companyCode || "").trim().toUpperCase() });
  if (!record) throw new Error("Company was not found.");
  if (!record.sepayConfig?.webhookId) {
    record.set("sepayConfig.webhookId", randomUUID());
    await record.save();
  }
  return record;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifySepaySignature(rawBody: string, signature: string, timestamp: string, secret: string, nowMs = Date.now()) {
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(nowMs / 1000 - timestampNumber) > 300) {
    throw new Error("Webhook SePay đã hết hạn.");
  }
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  if (!safeEqual(expected, signature)) throw new Error("Chữ ký webhook SePay không hợp lệ.");
}

export function buildVietQrImageUrl(bankId: string, accountNumber: string, accountName: string, amount: number, paymentCode: string) {
  const query = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: paymentCode.slice(0, 25),
    accountName,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNumber)}-compact2.png?${query.toString()}`;
}

export function sepayPaymentCode(payload: SepayPayload, prefix: string) {
  const supplied = String(payload.code || "").trim().toUpperCase();
  if (supplied) return supplied;
  if (!/^[A-Z0-9]{2,5}$/.test(prefix)) return "";
  const matches = [...String(payload.content || "").toUpperCase().matchAll(new RegExp(`(?:^|[^A-Z0-9])(${prefix}[A-F0-9]{12})(?=$|[^A-Z0-9])`, "g"))];
  return matches.length === 1 ? matches[0][1] : "";
}

async function notifyCustomerPayment(orderId: string) {
  const order = await MessengerOrderModel.findOne({ orderId });
  if (!order?.sepayVerifiedAt || order.sepayCustomerNotifiedAt) return;
  const amount = Number(order.sepayTransferAmount || 0).toLocaleString("vi-VN");
  const message = order.checkoutFlow === "cake_deposit" && order.checkoutSnapshot ? cakePaidMessage(order.checkoutSnapshot) : [
    `Shop đã nhận được khoản đặt cọc ${amount} đ cho đơn hàng ${order.orderId}.`,
    order.paymentCode ? `Mã thanh toán: ${order.paymentCode}.` : "",
    "Giao dịch đã được xác nhận thành công. Shop sẽ tiếp tục xử lý đơn hàng và thông báo khi có cập nhật mới. Cảm ơn bạn!",
  ].filter(Boolean).join("\n");
  try {
    // Dynamic import avoids the Messenger -> order -> SePay service cycle during module initialization.
    const { fbMessengerService } = await import("./fb-messenger.service");
    const parts = order.checkoutFlow === "cake_deposit"
      ? (await import("./cake-checkout.service")).splitCakeReply(message) : [message];
    const session = order.checkoutFlow === "cake_deposit" ? await CakeConsultationSessionModel.findOne({
      companyCode: order.companyCode, pageId: order.pageId, conversationId: order.conversationId.toString(), orderId: order.orderId,
    }).lean() : undefined;
    for (const part of parts) await fbMessengerService.sendReply(order.pageId, order.conversationId.toString(), part, "ai",
      order.checkoutFlow === "cake_deposit" ? { companyCode: order.companyCode, source: "company" } : undefined,
      order.checkoutFlow === "cake_deposit" ? session?.sessionId || `order-${order.orderId}` : undefined);
    await MessengerOrderModel.updateOne(
      { _id: order._id, sepayCustomerNotifiedAt: { $exists: false } },
      { $set: { sepayCustomerNotifiedAt: new Date(), sepayCustomerNotificationError: "" } },
    );
    console.log("[SePay][CUSTOMER_NOTIFIED]", JSON.stringify({ companyCode: order.companyCode, orderId: order.orderId }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await MessengerOrderModel.updateOne(
      { _id: order._id },
      { $set: { sepayCustomerNotificationError: errorMessage.slice(0, 1000) } },
    ).catch(() => undefined);
    console.error(`[SePay] Không thể thông báo khách hàng orderId=${order.orderId}:`, errorMessage);
  }
}

async function syncVerifiedPayment(orderId: string) {
  const order = await MessengerOrderModel.findOne({ orderId });
  if (!order?.sepayVerifiedAt) return;
  // Cake deposits are persisted first, then handled by the retryable backend worker.
  if (order.checkoutFlow === "cake_deposit") return;
  void notifyCustomerPayment(order.orderId);
  const integration = await SocialIntegrationModel.findById(order.integrationId).lean();
  const config = integration?.orderSheetConfig;
  if (config?.enabled) {
    try {
      const spreadsheetId = config.spreadsheetId || parseGoogleSpreadsheetId(config.spreadsheetUrl);
      await googleOrderSheetService.updateSepayPayment(
        spreadsheetId,
        config.ordersSheetName || "Orders",
        order.orderId,
        {
          transactionId: order.sepayTransactionId || "",
          transferAmount: order.sepayTransferAmount || 0,
          verifiedAt: order.sepayVerifiedAt,
        },
      );
    } catch (error) {
      console.error(`[SePay] Không thể cập nhật Sheet orderId=${order.orderId}:`, error);
    }
  }
  void companyTelegramOrderService.notifySepayPayment(order.orderId);
}

export const companySepayService = {
  notifyCustomerPayment,
  async getConfig(companyCode: string, baseUrl: string) {
    return publicConfig(await ensureCompany(companyCode), baseUrl);
  },

  async updateConfig(companyCode: string, input: SepayConfigInput, baseUrl: string) {
    const record = await ensureCompany(companyCode);
    const current = record.sepayConfig;
    const suppliedSecret = String(input.webhookSecret || "").trim();
    const accountNumbers = (input.accountNumbers ?? current?.accountNumbers ?? [])
      .map(normalizeAccount)
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
    const enabled = input.enabled ?? current?.enabled ?? false;
    const encryptedSecret = suppliedSecret ? encrypt(suppliedSecret) : String(current?.webhookSecretEncrypted || "");
    if (enabled && (!encryptedSecret || accountNumbers.length === 0)) {
      throw new Error("Cần nhập Secret HMAC và ít nhất một số tài khoản trước khi bật SePay.");
    }
    record.set("sepayConfig.enabled", enabled);
    record.set("sepayConfig.webhookSecretEncrypted", encryptedSecret);
    record.set("sepayConfig.accountNumbers", accountNumbers);
    record.set("sepayConfig.paymentCodePrefix", normalizePrefix(input.paymentCodePrefix ?? current?.paymentCodePrefix));
    const qrBankId = String(input.qrBankId ?? current?.qrBankId ?? "").trim();
    const qrAccountNumber = normalizeAccount(input.qrAccountNumber ?? current?.qrAccountNumber ?? "");
    const qrAccountName = String(input.qrAccountName ?? current?.qrAccountName ?? "").trim().slice(0, 100);
    const depositEnabled = input.depositEnabled ?? current?.depositEnabled ?? false;
    const depositPercent = Number(input.depositPercent ?? current?.depositPercent ?? 30);
    if (!Number.isFinite(depositPercent) || depositPercent < 1 || depositPercent > 100) {
      throw new Error("Phần trăm đặt cọc phải từ 1 đến 100.");
    }
    if (qrBankId && !/^[a-zA-Z0-9]{2,20}$/.test(qrBankId)) throw new Error("Mã ngân hàng VietQR không hợp lệ.");
    if (qrAccountNumber && !/^[a-zA-Z0-9]{6,19}$/.test(qrAccountNumber)) throw new Error("Số tài khoản VietQR phải có 6-19 ký tự chữ hoặc số.");
    if ((qrBankId || qrAccountNumber || qrAccountName) && (!qrBankId || !qrAccountNumber || !qrAccountName)) {
      throw new Error("Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản để gửi VietQR.");
    }
    if (qrAccountNumber && !accountNumbers.includes(qrAccountNumber)) {
      throw new Error("Số tài khoản VietQR phải nằm trong danh sách tài khoản nhận webhook.");
    }
    if (depositEnabled && (!enabled || !qrBankId || !qrAccountNumber || !qrAccountName)) {
      throw new Error("Cần bật SePay và nhập đủ thông tin VietQR trước khi bật yêu cầu đặt cọc.");
    }
    record.set("sepayConfig.qrBankId", qrBankId);
    record.set("sepayConfig.qrAccountNumber", qrAccountNumber);
    record.set("sepayConfig.qrAccountName", qrAccountName);
    record.set("sepayConfig.depositEnabled", depositEnabled);
    record.set("sepayConfig.depositPercent", Math.round(depositPercent));
    if (suppliedSecret) {
      record.set("sepayConfig.lastWebhookStatus", "untested");
      record.set("sepayConfig.lastWebhookError", "");
    }
    await record.save();
    return publicConfig(record, baseUrl);
  },

  async getPaymentQr(companyCode: string, amount: number | undefined, paymentCode: string | undefined) {
    const company = await CompanyModel.findOne({ code: String(companyCode || "").trim().toUpperCase() }).lean();
    const config = company?.sepayConfig;
    const bankId = String(config?.qrBankId || "").trim();
    const accountNumber = normalizeAccount(config?.qrAccountNumber);
    const accountName = String(config?.qrAccountName || "").trim();
    if (!config?.enabled || !bankId || !accountNumber || !accountName || !amount || amount <= 0 || !paymentCode) return null;
    return {
      bankId,
      accountNumber,
      accountName,
      imageUrl: buildVietQrImageUrl(bankId, accountNumber, accountName, amount, paymentCode),
    };
  },

  async processWebhook(webhookId: string, rawBody: string, signature: string, timestamp: string, payload: SepayPayload) {
    const company = await companyWithSecret({ "sepayConfig.webhookId": webhookId });
    const config = company?.sepayConfig;
    if (!company || !config?.enabled || !config.webhookSecretEncrypted) throw new Error("Webhook SePay không tồn tại hoặc chưa được bật.");
    try {
      verifySepaySignature(rawBody, signature, timestamp, decrypt(config.webhookSecretEncrypted));
      console.log("[SePay][SIGNATURE_VERIFIED]", JSON.stringify({ companyCode: company.code }));
      const transactionId = String(payload.id ?? "").trim();
      const transferAmount = Number(payload.transferAmount);
      if (!transactionId || !Number.isSafeInteger(transferAmount) || transferAmount < 0) throw new Error("Dữ liệu giao dịch SePay không hợp lệ.");

      if (transactionId === "0") {
        company.set("sepayConfig.lastWebhookAt", new Date());
        company.set("sepayConfig.lastWebhookStatus", "success");
        company.set("sepayConfig.lastWebhookError", "");
        await company.save();
        return { test: true };
      }

      let transaction;
      try {
        transaction = await SepayWebhookTransactionModel.create({
          companyCode: company.code,
          webhookId,
          transactionId,
          gateway: String(payload.gateway || ""),
          accountNumber: normalizeAccount(payload.accountNumber),
          code: String(payload.code || "").trim().toUpperCase(),
          content: String(payload.content || ""),
          transferType: String(payload.transferType || ""),
          transferAmount,
          transactionDate: String(payload.transactionDate || ""),
          referenceCode: String(payload.referenceCode || ""),
          status: "received",
          rawPayload: payload,
        });
      } catch (error: unknown) {
        if ((error as { code?: number })?.code !== 11000) throw error;
        transaction = await SepayWebhookTransactionModel.findOne({ companyCode: company.code, transactionId });
        if (!transaction || transaction.status !== "received") {
          console.log("[SePay][DUPLICATE]", JSON.stringify({ companyCode: company.code, transactionId: transactionId.slice(0, 100) }));
          return { duplicate: true };
        }
        // Resume an interrupted request using the authenticated payload originally stored.
        payload = transaction.rawPayload as SepayPayload;
      }

      if (String(payload.transferType || "").toLowerCase() !== "in") {
        transaction.status = "ignored";
        transaction.reason = "Không phải giao dịch tiền vào.";
      } else if (!config.accountNumbers.map(normalizeAccount).includes(normalizeAccount(payload.accountNumber))) {
        transaction.status = "ignored";
        transaction.reason = "Số tài khoản không thuộc cấu hình doanh nghiệp.";
      } else {
        const code = sepayPaymentCode(payload, config.paymentCodePrefix || "DH");
        transaction.code = code;
        const order = code ? await MessengerOrderModel.findOne({ companyCode: company.code, paymentCode: code }) : null;
        if (!order) {
          transaction.status = "order_not_found";
          transaction.reason = "Không tìm thấy đơn hàng theo mã thanh toán.";
        } else if (order.checkoutFlow === "cake_deposit" && (order.paymentRequestStatus !== "active"
          || order.checkoutSnapshot?.accountNumber !== normalizeAccount(payload.accountNumber))) {
          transaction.status = "ignored";
          transaction.orderId = order.orderId;
          transaction.reason = "QR đã hết hiệu lực hoặc tài khoản không khớp đơn đã xác nhận; cần shop đối soát.";
        } else if (!order.depositAmount || Number(payload.transferAmount) !== order.depositAmount) {
          transaction.status = "amount_mismatch";
          transaction.orderId = order.orderId;
          transaction.reason = `Số tiền nhận ${transferAmount} không khớp tiền cọc ${order.depositAmount || 0}.`;
        } else {
          const verifiedAt = new Date();
          const verification = await MessengerOrderModel.updateOne(
            { _id: order._id, depositStatus: { $ne: "verified" },
              ...(order.checkoutFlow === "cake_deposit" ? { paymentRequestStatus: "active" } : {}) },
            {
              $set: {
                depositStatus: "verified",
                sepayTransactionId: transactionId,
                sepayTransferAmount: Number(payload.transferAmount),
                sepayVerifiedAt: verifiedAt,
              },
            },
          );
          transaction.orderId = order.orderId;
          const recovered = verification.modifiedCount !== 1
            ? await MessengerOrderModel.exists({ _id: order._id, sepayTransactionId: transactionId, depositStatus: "verified" }) : false;
          if (verification.modifiedCount === 1 || recovered) {
            transaction.status = "matched";
            void syncVerifiedPayment(order.orderId);
          } else {
            transaction.status = "ignored";
            transaction.reason = "Đơn hàng đã được xác nhận bởi một giao dịch SePay trước đó.";
          }
        }
      }
      await transaction.save();
      console.log("[SePay][RECONCILED]", JSON.stringify({
        companyCode: company.code, transactionId: transactionId.slice(0, 100),
        status: transaction.status, orderId: transaction.orderId || null,
        amount: transferAmount, reason: transaction.reason || "",
      }));
      if (transaction.status === "matched" && transaction.orderId) {
        // Wake the leased worker after persisting verification; the periodic tick
        // still recovers failures or process restarts without parallel sends.
        void import("./cake-deposit-worker").then(({ processCakeDeposits }) => processCakeDeposits())
          .catch(error => console.error("[SePay] Không thể kích hoạt xử lý cọc:", error));
      }
      company.set("sepayConfig.lastWebhookAt", new Date());
      company.set("sepayConfig.lastWebhookStatus", "success");
      company.set("sepayConfig.lastWebhookError", "");
      await company.save();
      return { transactionId, status: transaction.status, orderId: transaction.orderId || null };
    } catch (error) {
      company.set("sepayConfig.lastWebhookAt", new Date());
      company.set("sepayConfig.lastWebhookStatus", "failed");
      company.set("sepayConfig.lastWebhookError", (error instanceof Error ? error.message : String(error)).slice(0, 1000));
      await company.save().catch(() => undefined);
      throw error;
    }
  },
};
