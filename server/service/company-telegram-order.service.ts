import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ICRMTicket } from "../interface/crm-ticket.interface";
import { ICompanyTelegramOrderConfig } from "../interface/company.interface";
import { CompanyModel } from "../model/company.model";
import { MessengerOrderModel } from "../model/messenger-order.model";

const API = "https://api.telegram.org";

export interface TelegramOrderConfigInput {
  enabled?: boolean;
  notifyNewOrder?: boolean;
  botToken?: string;
  groupChatId?: string;
  messageThreadId?: number | null;
}

function key() {
  const secret = String(process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET || "").trim();
  if (!secret) throw new Error("Telegram encryption key is missing.");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

function decrypt(value: string) {
  const [version, iv, tag, body] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Stored Telegram token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeChatId(value: unknown) {
  const result = String(value || "").trim();
  if (result && !/^-\d+$/.test(result)) throw new Error("Group chat ID must be a negative number.");
  return result;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function request<T>(token: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram API error ${response.status}.`);
  return data.result;
}

async function send(token: string, target: string, text: string, thread?: number) {
  return request(token, "sendMessage", {
    chat_id: target,
    text,
    parse_mode: "HTML",
    ...(thread ? { message_thread_id: thread } : {}),
  });
}

async function findCompany(companyCode: string) {
  const record = await CompanyModel.findOne({ code: String(companyCode || "").trim().toUpperCase() })
    .select("+telegramOrderConfig.botTokenEncrypted");
  if (!record) throw new Error("Company was not found.");
  return record;
}

function publicConfig(record: { code: string; name: string; telegramOrderConfig?: Partial<ICompanyTelegramOrderConfig> }) {
  const config = record.telegramOrderConfig || {};
  return {
    companyCode: record.code,
    companyName: record.name,
    enabled: Boolean(config.enabled),
    notifyNewOrder: config.notifyNewOrder !== false,
    hasBotToken: Boolean(config.botTokenEncrypted),
    groupChatId: String(config.groupChatId || ""),
    messageThreadId: config.messageThreadId ?? null,
    botUsername: String(config.botUsername || ""),
    lastTestedAt: config.lastTestedAt || null,
    lastTestStatus: config.lastTestStatus || "untested",
    lastTestError: String(config.lastTestError || ""),
  };
}

async function sendCompany(companyCode: string, text: string) {
  const record = await findCompany(companyCode);
  const config = record.telegramOrderConfig;
  if (!config?.enabled || !config.notifyNewOrder || !config.botTokenEncrypted || !config.groupChatId) return false;
  await send(decrypt(config.botTokenEncrypted), config.groupChatId, text, config.messageThreadId || undefined);
  return true;
}

export const companyTelegramOrderService = {
  async getConfig(companyCode: string) {
    return publicConfig(await findCompany(companyCode));
  },

  async updateConfig(companyCode: string, input: TelegramOrderConfigInput) {
    const record = await findCompany(companyCode);
    const current = record.telegramOrderConfig;
    const token = String(input.botToken || "").trim();
    const target = normalizeChatId(input.groupChatId !== undefined ? input.groupChatId : current?.groupChatId);
    const thread = input.messageThreadId == null ? null : Math.max(1, Math.round(Number(input.messageThreadId)));
    const changed = Boolean(token) || target !== current?.groupChatId || thread !== (current?.messageThreadId ?? null);
    const encryptedToken = token ? encrypt(token) : String(current?.botTokenEncrypted || "");
    const enabled = input.enabled ?? current?.enabled ?? false;
    if (enabled && (!encryptedToken || !target)) {
      throw new Error("Bot Token and group Chat ID are required before enabling notifications.");
    }
    record.telegramOrderConfig = {
      enabled,
      notifyNewOrder: input.notifyNewOrder ?? current?.notifyNewOrder ?? true,
      botTokenEncrypted: encryptedToken,
      groupChatId: target,
      messageThreadId: thread,
      botUsername: String(current?.botUsername || ""),
      lastTestedAt: current?.lastTestedAt || null,
      lastTestStatus: changed ? "untested" : (current?.lastTestStatus || "untested"),
      lastTestError: changed ? "" : String(current?.lastTestError || ""),
    };
    await record.save();
    return publicConfig(record);
  },

  async testConfig(companyCode: string, input: TelegramOrderConfigInput) {
    const record = await findCompany(companyCode);
    const stored = record.telegramOrderConfig;
    const supplied = String(input.botToken || "").trim();
    const token = supplied || (stored?.botTokenEncrypted ? decrypt(stored.botTokenEncrypted) : "");
    const target = normalizeChatId(input.groupChatId !== undefined ? input.groupChatId : stored?.groupChatId);
    const thread = input.messageThreadId !== undefined ? input.messageThreadId : stored?.messageThreadId;
    if (!token || !target) throw new Error("Bot Token and group Chat ID are required.");
    try {
      const bot = await request<{ username?: string; first_name?: string }>(token, "getMe");
      const group = await request<{ title?: string }>(token, `getChat?chat_id=${encodeURIComponent(target)}`);
      await send(token, target, `\u2705 <b>K\u1ebft n\u1ed1i th\u00e0nh c\u00f4ng</b>\nBot s\u1eb5n s\u00e0ng nh\u1eadn th\u00f4ng b\u00e1o \u0111\u01a1n h\u00e0ng cho <b>${escapeHtml(record.name)}</b>.`, thread || undefined);
      record.set("telegramOrderConfig.botUsername", bot?.username || "");
      record.set("telegramOrderConfig.lastTestedAt", new Date());
      record.set("telegramOrderConfig.lastTestStatus", "success");
      record.set("telegramOrderConfig.lastTestError", "");
      await record.save();
      return { ok: true, botUsername: bot?.username || bot?.first_name || "", chatTitle: group?.title || target };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record.set("telegramOrderConfig.lastTestedAt", new Date());
      record.set("telegramOrderConfig.lastTestStatus", "failed");
      record.set("telegramOrderConfig.lastTestError", message.slice(0, 500));
      await record.save().catch(() => undefined);
      throw error;
    }
  },

  async notifyMessengerOrder(orderId: string) {
    const order = await MessengerOrderModel.findOne({ orderId });
    if (!order || order.status !== "synced" || order.telegramNotifiedAt) return;
    const items = order.items.map((item) => {
      const price = item.lineTotal !== undefined ? ` - ${item.lineTotal.toLocaleString("vi-VN")} d` : "";
      return `\u2022 <b>${escapeHtml(item.productName)}</b> x ${item.quantity}${price}`;
    }).join("\n");
    const message = [
      "\ud83d\uded2 <b>C\u00d3 \u0110\u01a0N H\u00c0NG M\u1edaI</b>",
      `M\u00e3 \u0111\u01a1n: <code>${escapeHtml(order.orderId)}</code>`,
      `Kh\u00e1ch h\u00e0ng: <b>${escapeHtml(order.customerName)}</b>`,
      `\u0110i\u1ec7n tho\u1ea1i: <code>${escapeHtml(order.customerPhone)}</code>`,
      order.deliveryAddress ? `\u0110\u1ecba ch\u1ec9: ${escapeHtml(order.deliveryAddress)}` : "",
      items,
      `T\u1ed5ng ti\u1ec1n: <b>${Number(order.totalAmount || 0).toLocaleString("vi-VN")} \u0111</b>`,
      (order.selectedProductImageUrl || order.selectedCakeImageUrl)
        ? `Ảnh ${escapeHtml(order.productCatalogItemLabel || "sản phẩm")}: ${escapeHtml(order.selectedProductImageUrl || order.selectedCakeImageUrl)}`
        : "",
      order.selectedProductCategory ? `Danh mục: ${escapeHtml(order.selectedProductCategory)}` : "",
    ].filter(Boolean).join("\n");
    try {
      const sent = await sendCompany(order.companyCode, message);
      if (sent) await MessengerOrderModel.updateOne({ _id: order._id }, { $set: { telegramNotifiedAt: new Date(), telegramNotificationError: "" } });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await MessengerOrderModel.updateOne({ _id: order._id }, { $set: { telegramNotificationError: messageText.slice(0, 1000) } });
      console.error(`[CompanyTelegramOrder] Failed to notify order ${order.orderId}:`, messageText);
    }
  },

  async notifySepayPayment(orderId: string) {
    const order = await MessengerOrderModel.findOne({ orderId });
    if (!order?.sepayVerifiedAt || !order.sepayTransactionId) return;
    await sendCompany(order.companyCode, [
      "✅ <b>ĐÃ XÁC NHẬN TIỀN CỌC QUA SEPAY</b>",
      `Mã đơn: <code>${escapeHtml(order.orderId)}</code>`,
      `Mã thanh toán: <code>${escapeHtml(order.paymentCode || "")}</code>`,
      `Khách hàng: <b>${escapeHtml(order.customerName)}</b>`,
      `Số tiền: <b>${Number(order.sepayTransferAmount || 0).toLocaleString("vi-VN")} đ</b>`,
      `Mã giao dịch: <code>${escapeHtml(order.sepayTransactionId)}</code>`,
    ].join("\n"));
  },

  async notifyProductSelection(orderId: string) {
    const order = await MessengerOrderModel.findOne({ orderId });
    const imageUrl = order?.selectedProductImageUrl || order?.selectedCakeImageUrl;
    if (!order || !imageUrl) return;
    await sendCompany(order.companyCode, [
      "🖼️ <b>KHÁCH ĐÃ CHỌN ẢNH SẢN PHẨM</b>",
      `Mã đơn: <code>${escapeHtml(order.orderId)}</code>`,
      `Khách hàng: <b>${escapeHtml(order.customerName)}</b>`,
      order.selectedProductCategory ? `Danh mục: <b>${escapeHtml(order.selectedProductCategory)}</b>` : "",
      `Ảnh tham khảo: ${escapeHtml(imageUrl)}`,
    ].filter(Boolean).join("\n"));
  },

  async notifyLeadWon(lead: ICRMTicket) {
    const products = Array.isArray(lead.selectedProducts) && lead.selectedProducts.length
      ? lead.selectedProducts.map((item) => `\u2022 <b>${escapeHtml(item.name)}</b> x ${item.quantity} - ${(item.price * item.quantity).toLocaleString("vi-VN")} d`).join("\n")
      : `\u2022 ${escapeHtml(lead.productOfChoice || "Chua co thong tin san pham")}`;
    await sendCompany(lead.companyCode, [
      "\ud83c\udf89 <b>CH\u1ed0T \u0110\u01a0N TH\u00c0NH C\u00d4NG</b>",
      `Kh\u00e1ch h\u00e0ng: <b>${escapeHtml(lead.customerName)}</b>`,
      `\u0110i\u1ec7n tho\u1ea1i: <code>${escapeHtml(lead.phone || "Chua bo sung")}</code>`,
      products,
      `T\u1ed5ng gi\u00e1 tr\u1ecb: <b>${Number(lead.value || 0).toLocaleString("vi-VN")} \u0111</b>`,
    ].join("\n"));
  },
};
