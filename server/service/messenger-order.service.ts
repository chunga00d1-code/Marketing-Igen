import { createHash, randomUUID } from "node:crypto";
import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { MessengerOrderModel } from "../model/messenger-order.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { googleOrderSheetService, parseGoogleSpreadsheetId } from "./google-order-sheet.service";
import { openrouterChat } from "./openrouter.service";
import { selectCurrentOrderContext } from "./messenger-order-context";
import { companyTelegramOrderService } from "./company-telegram-order.service";

interface ExtractedOrderItem {
  productCode?: string;
  productName?: string;
  variantSummary?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  attributesJson?: string;
}

interface ExtractedOrder {
  confirmed?: boolean;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  items?: ExtractedOrderItem[];
  subtotal?: number;
  shippingFee?: number;
  discountAmount?: number;
  totalAmount?: number;
  paymentMethod?: string;
  fulfillmentMethod?: string;
  fulfillmentLocation?: string;
  requestedFulfillmentTime?: string;
  customerNote?: string;
  internalNote?: string;
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .toLowerCase()
    .trim();
}

function hasExplicitConfirmation(value: string) {
  const text = normalizeText(value);
  return /(^|\s)(chot|xac nhan|dong y|dung roi|ok chot|dat hang|lay don|len don)(\s|$|[.!?])/.test(text);
}

function finiteMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function positiveMoney(value: unknown) {
  const number = finiteMoney(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function cleanExtractedOrder(value: ExtractedOrder) {
  const items = (Array.isArray(value.items) ? value.items : [])
    .map((item) => {
      const productName = String(item?.productName || "").trim();
      const quantity = Math.max(1, Math.min(10000, Math.round(Number(item?.quantity) || 1)));
      const unitPrice = positiveMoney(item?.unitPrice);
      const lineTotal = positiveMoney(item?.lineTotal) ?? (unitPrice === undefined ? undefined : unitPrice * quantity);
      let rawAttributes: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(item?.attributesJson || "{}"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) rawAttributes = parsed;
      } catch {
        rawAttributes = {};
      }
      const attributes = Object.fromEntries(
        Object.entries(rawAttributes).slice(0, 30).map(([key, entry]) => [String(key).slice(0, 80), String(entry).slice(0, 300)])
      );
      return {
        productCode: String(item?.productCode || "").trim().slice(0, 160),
        productName: productName.slice(0, 500),
        variantSummary: String(item?.variantSummary || "").trim().slice(0, 500),
        quantity,
        unitPrice,
        lineTotal,
        attributes,
      };
    })
    .filter((item) => item.productName);

  const customerName = String(value.customerName || "").trim().slice(0, 300);
  const customerPhone = String(value.customerPhone || "").replace(/[^0-9+]/g, "").slice(0, 30);
  const deliveryAddress = String(value.deliveryAddress || "").trim().slice(0, 1500);
  const normalizedFulfillmentMethod = normalizeText(String(value.fulfillmentMethod || ""));
  const fulfillmentMethod: "" | "pickup" | "delivery" = normalizedFulfillmentMethod === "pickup" || normalizedFulfillmentMethod === "nhan tai cua hang"
    ? "pickup"
    : normalizedFulfillmentMethod === "delivery" || normalizedFulfillmentMethod === "giao hang"
      ? "delivery"
      : "";
  const fulfillmentLocation = String(value.fulfillmentLocation || "").trim().slice(0, 1500);
  const requestedFulfillmentTime = String(value.requestedFulfillmentTime || "").trim().slice(0, 300);
  const missingFields = [
    !customerName ? "customer_name" : "",
    !customerPhone ? "customer_phone" : "",
    !fulfillmentMethod ? "fulfillment_method" : "",
    fulfillmentMethod === "delivery" && !deliveryAddress && !fulfillmentLocation ? "delivery_address" : "",
    items.length === 0 ? "items" : "",
  ].filter(Boolean);

  const calculatedSubtotal = items.every((item) => item.lineTotal !== undefined)
    ? items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0)
    : undefined;
  const subtotal = positiveMoney(value.subtotal) ?? calculatedSubtotal;
  const shippingFee = finiteMoney(value.shippingFee);
  const discountAmount = finiteMoney(value.discountAmount);
  const calculatedTotal = subtotal === undefined ? undefined : Math.max(0, subtotal + (shippingFee || 0) - (discountAmount || 0));

  return {
    customerName,
    customerPhone,
    deliveryAddress,
    items,
    subtotal,
    shippingFee,
    discountAmount,
    totalAmount: positiveMoney(value.totalAmount) ?? calculatedTotal,
    paymentMethod: String(value.paymentMethod || "").trim().slice(0, 200),
    fulfillmentMethod,
    fulfillmentLocation,
    requestedFulfillmentTime,
    customerNote: String(value.customerNote || "").trim().slice(0, 3000),
    internalNote: String(value.internalNote || "").trim().slice(0, 3000),
    missingFields,
  };
}

async function extractOrder(transcript: string, model: string) {
  const response = await openrouterChat({
    model,
    temperature: 0,
    maxTokens: 1800,
    jsonMode: true,
    strictJsonSchema: true,
    responseSchema: {
      confirmed: false,
      customerName: "",
      customerPhone: "",
      deliveryAddress: "",
      items: [{
        productCode: "",
        productName: "",
        variantSummary: "",
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        attributesJson: "{}",
      }],
      subtotal: 0,
      shippingFee: 0,
      discountAmount: 0,
      totalAmount: 0,
      paymentMethod: "",
      fulfillmentMethod: "",
      fulfillmentLocation: "",
      requestedFulfillmentTime: "",
      customerNote: "",
      internalNote: "",
    },
    messages: [
      {
        role: "system",
        content: [
          "Ban la bo trich xuat don hang tu hoi thoai ban hang.",
          "Chi lay thong tin da xuat hien ro rang trong hoi thoai, khong tu bia gia, san pham, dia chi hoac thong tin khach.",
          "confirmed chi la true khi KHACH da xac nhan/chot don mot cach ro rang sau khi noi dung mua hang da duoc trao doi.",
          "Chi su dung thong tin cua don hien tai. Khong ke thua san pham, gia, cach nhan hang, dia chi hoac thoi gian tu don cu.",
          "Neu khach xac nhan tom tat cuoi cung cua shop thi co the coi cac truong trong tom tat do la da duoc khach xac nhan.",
          "fulfillmentMethod chi la pickup hoac delivery. Don pickup khong bat buoc deliveryAddress. Don delivery bat buoc co dia chi.",
          "Neu khong co gia thi tra ve 0. Moi san pham la mot item. Thuoc tinh dac thu dua vao attributesJson duoi dang chuoi JSON.",
        ].join("\n"),
      },
      { role: "user", content: transcript },
    ],
  });
  return JSON.parse(response.text) as ExtractedOrder;
}

async function syncOrder(orderId: string) {
  const order = await MessengerOrderModel.findOne({ orderId });
  if (!order || order.status === "synced") return order;
  const integration = await SocialIntegrationModel.findById(order.integrationId).lean();
  const config = integration?.orderSheetConfig;
  if (!integration || !config?.enabled) return order;

  try {
    const spreadsheetId = config.spreadsheetId || parseGoogleSpreadsheetId(config.spreadsheetUrl);
    await googleOrderSheetService.appendOrder(
      spreadsheetId,
      config.ordersSheetName || "Orders",
      config.itemsSheetName || "OrderItems",
      {
        orderId: order.orderId,
        createdAt: order.createdAt,
        confirmedAt: order.confirmedAt || order.createdAt,
        sourceAccount: integration.displayName,
        conversationId: order.conversationId.toString(),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        items: order.items.map((item) => ({
          productCode: item.productCode,
          productName: item.productName,
          variantSummary: item.variantSummary,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          attributes: item.attributes instanceof Map ? Object.fromEntries(item.attributes) : item.attributes,
        })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        fulfillmentMethod: order.fulfillmentMethod || undefined,
        fulfillmentLocation: order.fulfillmentLocation,
        requestedFulfillmentTime: order.requestedFulfillmentTime,
        customerNote: order.customerNote,
        internalNote: order.internalNote,
        sourceMessageId: order.sourceMessageId,
      }
    );
    order.status = "synced";
    order.syncedAt = new Date();
    order.lastSyncError = "";
  } catch (error) {
    order.status = "failed";
    order.lastSyncError = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
  }
  order.syncAttempts += 1;
  await order.save();
  return order;
}

export const messengerOrderService = {
  isConfirmationMessage: hasExplicitConfirmation,

  async captureConfirmedOrder(pageId: string, conversationId: string, sourceMessageId: string, latestText: string) {
    if (!hasExplicitConfirmation(latestText)) return null;
    console.log(`[Messenger Order] Bắt đầu xử lý xác nhận: pageId=${pageId}, conversationId=${conversationId}, messageId=${sourceMessageId}`);
    const integration = await SocialIntegrationModel.findOne({
      platform: "Facebook",
      username: pageId,
      isConnected: true,
      "orderSheetConfig.enabled": true,
    }).lean();
    if (!integration?.orderSheetConfig) {
      console.warn(`[Messenger Order] Bỏ qua vì chưa bật cấu hình Google Sheets: pageId=${pageId}`);
      return null;
    }

    const existing = await MessengerOrderModel.findOne({ sourceMessageId });
    if (existing) {
      if (existing.status === "confirmed" || existing.status === "failed") await syncOrder(existing.orderId);
      void companyTelegramOrderService.notifyMessengerOrder(existing.orderId);
      return existing;
    }

    const conversation = await FBConversationModel.findById(conversationId).lean();
    if (!conversation) return null;
    const messages = await FBMessageModel.find({ conversationId }).sort({ timestamp: -1 }).limit(24).lean();
    messages.reverse();
    const orderMessages = selectCurrentOrderContext(messages);
    const transcript = [`TEN FACEBOOK: ${conversation.senderName || ""}`, ...orderMessages.map((message) => `${message.direction === "inbound" ? "KHACH" : "SHOP"}: ${message.text || "[dinh kem]"}`)].join("\n").slice(-14000);
    const replyModel = integration.aiAutoReplyConfig?.model
      || process.env.AI_REPLY_MESSAGE_MODEL
      || "deepseek-v4-flash-0731";
    const extracted = await extractOrder(transcript, replyModel);
    if (extracted.confirmed !== true) {
      console.warn(`[Messenger Order] AI không xác nhận đây là đơn đã chốt: conversationId=${conversationId}, messageId=${sourceMessageId}`);
      return null;
    }

    const clean = cleanExtractedOrder(extracted);
    const confirmed = clean.missingFields.length === 0;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ conversationId, ...clean }))
      .digest("hex");
    const duplicateOrder = await MessengerOrderModel.findOne({ fingerprint });
    if (duplicateOrder) return duplicateOrder;
    let order;
    try {
      order = await MessengerOrderModel.create({
        orderId: randomUUID(),
        fingerprint,
        companyCode: integration.companyCode,
        integrationId: integration._id,
        pageId,
        conversationId,
        sourceMessageId,
        ...clean,
        status: confirmed ? "confirmed" : "draft",
        confirmedAt: confirmed ? new Date() : undefined,
      });
    } catch (error: unknown) {
      const duplicate = error as { code?: number };
      if (duplicate?.code === 11000) return MessengerOrderModel.findOne({ $or: [{ sourceMessageId }, { fingerprint }] });
      throw error;
    }

    if (confirmed) {
      const syncedOrder = await syncOrder(order.orderId);
      void companyTelegramOrderService.notifyMessengerOrder(order.orderId);
      console.log(
        `[Messenger Order] Đã lưu đơn: orderId=${order.orderId}, status=${syncedOrder?.status || order.status}, ` +
        `syncError=${syncedOrder?.lastSyncError || "none"}`
      );
    } else {
      console.warn(
        `[Messenger Order] Đã lưu bản nháp nhưng chưa ghi Google Sheets: orderId=${order.orderId}, ` +
        `missingFields=${clean.missingFields.join(",") || "none"}`
      );
    }
    return order;
  },

  async retry(orderId: string, companyCode: string) {
    const order = await MessengerOrderModel.findOne({ orderId, companyCode });
    if (!order) throw new Error("Khong tim thay don Messenger.");
    if (order.missingFields.length) throw new Error("Don hang con thieu thong tin bat buoc.");
    if (!order.confirmedAt) order.confirmedAt = new Date();
    order.status = "confirmed";
    await order.save();
    const syncedOrder = await syncOrder(order.orderId);
    void companyTelegramOrderService.notifyMessengerOrder(order.orderId);
    return syncedOrder;
  },
};
