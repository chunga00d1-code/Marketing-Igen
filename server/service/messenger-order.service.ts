import { createHash, randomUUID } from "node:crypto";
import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { MessengerOrderModel } from "../model/messenger-order.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { googleOrderSheetService, parseGoogleSpreadsheetId } from "./google-order-sheet.service";
import { openrouterChat } from "./openrouter.service";
import { selectCurrentOrderContext } from "./messenger-order-context";
import { companyTelegramOrderService } from "./company-telegram-order.service";
import { cloudinaryService } from "./cloudinary.service";
import { CompanyModel } from "../model/company.model";
import { companySepayService } from "./company-sepay.service";
import { companyProductCatalogService } from "./company-product-catalog.service";

const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;
const RECEIPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
        depositRequired: order.depositRequired,
        depositAmount: order.depositAmount,
        depositStatus: order.depositStatus,
        receiptUrl: order.receiptUrl,
        receiptReceivedAt: order.receiptReceivedAt,
        paymentCode: order.paymentCode,
        sepayTransactionId: order.sepayTransactionId,
        sepayTransferAmount: order.sepayTransferAmount,
        sepayVerifiedAt: order.sepayVerifiedAt,
        selectedProductImageUrl: order.selectedProductImageUrl || order.selectedCakeImageUrl,
        selectedProductSelectedAt: order.selectedProductSelectedAt || order.selectedCakeSelectedAt,
        selectedProductCategory: order.selectedProductCategory,
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

async function downloadReceipt(url: string, pageAccessToken?: string) {
  const request = async (withToken: boolean) => globalThis.fetch(url, {
    headers: withToken && pageAccessToken ? { Authorization: `Bearer ${pageAccessToken}` } : undefined,
  });
  let response = await request(false);
  if (!response.ok && pageAccessToken && (response.status === 401 || response.status === 403)) {
    response = await request(true);
  }
  if (!response.ok) throw new Error(`Không thể tải biên lai từ Facebook (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > RECEIPT_MAX_BYTES) throw new Error("Ảnh biên lai vượt quá giới hạn 15 MB.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > RECEIPT_MAX_BYTES) throw new Error("Ảnh biên lai vượt quá giới hạn 15 MB.");
  if (!buffer.length) throw new Error("Ảnh biên lai không có dữ liệu.");
  return buffer;
}

function depositAmount(totalAmount: number | undefined, percent: number) {
  return totalAmount && totalAmount > 0 ? Math.round(totalAmount * percent / 100) : undefined;
}

function depositRequestText(
  orderId: string,
  percent: number,
  amount: number | undefined,
  instructions: string,
  paymentCode?: string,
  paymentQr?: { bankId: string; accountNumber: string; accountName: string } | null,
) {
  if (paymentQr) {
    return [
      `Số tài khoản: ${paymentQr.accountNumber}`,
      "Chuyển khoản xong bạn vui lòng chụp lại biên lai và gửi vào đây nhé.",
    ].join("\n");
  }

  const amountText = amount
    ? `${new Intl.NumberFormat("vi-VN").format(amount)} đ (${percent}% giá trị đơn hàng)`
    : `${percent}% giá trị đơn hàng`;
  return [
    `Đơn hàng ${orderId} đã được ghi nhận.`,
    `Vui lòng đặt cọc ${amountText}.`,
    instructions.trim(),
    paymentQr ? `Ngân hàng: ${paymentQr.bankId}` : "",
    paymentQr ? `Số tài khoản: ${paymentQr.accountNumber}` : "",
    paymentQr ? `Chủ tài khoản: ${paymentQr.accountName}` : "",
    paymentCode ? `Nội dung chuyển khoản: ${paymentCode}` : "",
    "Sau khi chuyển khoản, bạn vui lòng gửi ảnh biên lai ngay tại đây. Shop sẽ xác nhận sau khi đối soát giao dịch.",
  ].filter(Boolean).join("\n");
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
    const company = await CompanyModel.findOne({ code: integration.companyCode }).lean();
    const companyDepositEnabled = company?.sepayConfig?.depositEnabled === true;
    const legacyDepositEnabled = integration.orderSheetConfig.depositEnabled === true
      && Boolean(String(integration.orderSheetConfig.depositInstructions || "").trim());
    const configuredDepositPercent = Math.min(100, Math.max(1, Number(
      companyDepositEnabled
        ? company?.sepayConfig?.depositPercent || 30
        : integration.orderSheetConfig.depositPercent || 30,
    )));
    const depositRequired = confirmed && (companyDepositEnabled || legacyDepositEnabled);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ conversationId, ...clean }))
      .digest("hex");
    const duplicateOrder = await MessengerOrderModel.findOne({ fingerprint });
    if (duplicateOrder) return duplicateOrder;
    const orderId = randomUUID();
    let paymentCode = "";
    if (depositRequired) {
      if (company?.sepayConfig?.enabled) {
        const prefix = String(company.sepayConfig.paymentCodePrefix || "DH").toUpperCase();
        paymentCode = `${prefix}${orderId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
      }
    }
    let order;
    try {
      order = await MessengerOrderModel.create({
        orderId,
        fingerprint,
        companyCode: integration.companyCode,
        integrationId: integration._id,
        pageId,
        conversationId,
        sourceMessageId,
        ...clean,
        status: confirmed ? "confirmed" : "draft",
        confirmedAt: confirmed ? new Date() : undefined,
        depositRequired,
        depositPercent: depositRequired ? configuredDepositPercent : undefined,
        depositAmount: depositRequired ? depositAmount(clean.totalAmount, configuredDepositPercent) : undefined,
        depositStatus: depositRequired ? "awaiting_receipt" : "not_required",
        paymentCode: paymentCode || undefined,
        selectedProductImageUrl: conversation.selectedProductImageUrl || conversation.selectedCakeImageUrl || undefined,
        selectedProductMessageId: conversation.selectedProductMessageId || conversation.selectedCakeMessageId || undefined,
        selectedProductSelectedAt: conversation.selectedProductSelectedAt || conversation.selectedCakeSelectedAt || undefined,
        selectedProductCategory: conversation.productCatalogCategory || conversation.cakeCatalogCategory || undefined,
        productCatalogItemLabel: conversation.productCatalogItemLabel || undefined,
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

  async getDepositRequest(orderId: string) {
    const order = await MessengerOrderModel.findOne({ orderId });
    if (!order || !order.depositRequired || order.depositStatus !== "awaiting_receipt" || order.depositRequestedAt) return null;
    const integration = await SocialIntegrationModel.findById(order.integrationId).lean();
    const instructions = String(integration?.orderSheetConfig?.depositInstructions || "").trim();
    const company = await CompanyModel.findOne({ code: order.companyCode }).lean();
    const companyDepositEnabled = company?.sepayConfig?.depositEnabled === true;
    const legacyDepositEnabled = integration?.orderSheetConfig?.depositEnabled === true && Boolean(instructions);
    if (!companyDepositEnabled && !legacyDepositEnabled) return null;
    const percent = order.depositPercent
      || (companyDepositEnabled ? company?.sepayConfig?.depositPercent : integration?.orderSheetConfig?.depositPercent)
      || 30;
    const paymentQr = await companySepayService.getPaymentQr(order.companyCode, order.depositAmount, order.paymentCode);
    return depositRequestText(order.orderId, percent, order.depositAmount, instructions, order.paymentCode, paymentQr);
  },

  async getDepositPaymentQr(orderId: string) {
    const order = await MessengerOrderModel.findOne({ orderId });
    if (!order?.depositRequired || order.depositStatus !== "awaiting_receipt") return null;
    return companySepayService.getPaymentQr(order.companyCode, order.depositAmount, order.paymentCode);
  },

  async markDepositRequested(orderId: string) {
    return MessengerOrderModel.findOneAndUpdate(
      { orderId, depositStatus: "awaiting_receipt", depositRequestedAt: { $exists: false } },
      { $set: { depositRequestedAt: new Date() } },
      { new: true },
    );
  },

  async capturePaymentReceipt(
    pageId: string,
    conversationId: string,
    sourceMessageId: string,
    attachments: Array<{ type: string; url: string }>,
    pageAccessToken?: string,
  ) {
    const image = attachments.find((attachment) => attachment.type === "image" && attachment.url);
    if (!image) return null;
    const oldestAllowed = new Date(Date.now() - RECEIPT_WINDOW_MS);
    const order = await MessengerOrderModel.findOne({
      pageId,
      conversationId,
      depositStatus: "awaiting_receipt",
      depositRequestedAt: { $gte: oldestAllowed },
    }).sort({ depositRequestedAt: -1 });
    if (!order) return null;
    const conversation = await FBConversationModel.findById(conversationId).lean();
    if (
      (conversation?.productSelectionStatus === "awaiting_selection" || conversation?.cakeCatalogSentAt)
      && (conversation?.productCatalogSentAt || conversation?.cakeCatalogSentAt)
      && order.depositRequestedAt
      && (conversation.productCatalogSentAt || conversation.cakeCatalogSentAt)!.getTime() > order.depositRequestedAt.getTime()
    ) return null;
    if (order.receiptMessageId === sourceMessageId && order.receiptUrl) return order;

    const buffer = await downloadReceipt(image.url, pageAccessToken);
    const safeCompany = order.companyCode.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "company";
    const safeMessageId = sourceMessageId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-100) || order.orderId;
    const receiptUrl = await cloudinaryService.uploadMediaBuffer(
      buffer,
      `messenger_order_receipts/${safeCompany}`,
      `${order.orderId}_${safeMessageId}`,
    );
    order.receiptUrl = receiptUrl;
    order.receiptMessageId = sourceMessageId;
    order.receiptReceivedAt = new Date();
    order.depositStatus = "receipt_received";
    order.receiptSheetSyncError = "";
    await order.save();

    const integration = await SocialIntegrationModel.findById(order.integrationId).lean();
    const config = integration?.orderSheetConfig;
    if (config?.enabled) {
      try {
        const spreadsheetId = config.spreadsheetId || parseGoogleSpreadsheetId(config.spreadsheetUrl);
        await googleOrderSheetService.updatePaymentReceipt(
          spreadsheetId,
          config.ordersSheetName || "Orders",
          order.orderId,
          { depositAmount: order.depositAmount, receiptUrl, receiptReceivedAt: order.receiptReceivedAt },
        );
      } catch (error) {
        order.receiptSheetSyncError = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
        await order.save();
        console.error(`[Messenger Order] Không thể ghi biên lai vào Sheet orderId=${order.orderId}:`, error);
      }
    }
    return order;
  },

  async captureProductSelection(
    pageId: string,
    conversationId: string,
    sourceMessageId: string,
    attachments: Array<{ type: string; url: string }>,
    pageAccessToken?: string,
  ) {
    const image = attachments.find((attachment) => attachment.type === "image" && attachment.url);
    if (!image) return null;
    const conversation = await FBConversationModel.findOne({
      _id: conversationId,
      pageId,
      $or: [
        {
          productSelectionStatus: "awaiting_selection",
          productCatalogSentAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        { cakeCatalogSentAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    });
    if (!conversation || conversation.selectedProductMessageId === sourceMessageId || conversation.selectedCakeMessageId === sourceMessageId) return null;
    const integration = await SocialIntegrationModel.findOne({ platform: "Facebook", username: pageId, isConnected: true }).lean();
    if (!integration?.companyCode) return null;
    const catalogConfig = await companyProductCatalogService.getConfig(integration.companyCode);
    if (!catalogConfig.enabled) return null;

    const buffer = await downloadReceipt(image.url, pageAccessToken);
    const safeCompany = integration.companyCode.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "company";
    const safeMessageId = sourceMessageId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-100) || conversationId;
    const imageUrl = await cloudinaryService.uploadMediaBuffer(buffer, `messenger_product_selections/${safeCompany}`, safeMessageId);
    const selectedAt = new Date();
    conversation.selectedProductImageUrl = imageUrl;
    conversation.selectedProductMessageId = sourceMessageId;
    conversation.selectedProductSelectedAt = selectedAt;
    conversation.productSelectionStatus = "selected";
    conversation.cakeCatalogSentAt = undefined;
    conversation.productCatalogSentAt = undefined;
    await conversation.save();

    const order = await MessengerOrderModel.findOne({ pageId, conversationId }).sort({ createdAt: -1 });
    if (order) {
      order.selectedProductImageUrl = imageUrl;
      order.selectedProductMessageId = sourceMessageId;
      order.selectedProductSelectedAt = selectedAt;
      order.selectedProductCategory = conversation.productCatalogCategory || conversation.cakeCatalogCategory || "";
      order.productCatalogItemLabel = conversation.productCatalogItemLabel || catalogConfig.itemLabel;
      order.selectedProductSheetSyncError = "";
      await order.save();
      const orderIntegration = await SocialIntegrationModel.findById(order.integrationId).lean();
      const sheetConfig = orderIntegration?.orderSheetConfig;
      if (order.status === "synced" && sheetConfig?.enabled) {
        try {
          const spreadsheetId = sheetConfig.spreadsheetId || parseGoogleSpreadsheetId(sheetConfig.spreadsheetUrl);
          await googleOrderSheetService.updateProductSelection(
            spreadsheetId,
            sheetConfig.ordersSheetName || "Orders",
            order.orderId,
            { imageUrl, selectedAt, categoryName: order.selectedProductCategory || "" },
          );
        } catch (error) {
          order.selectedProductSheetSyncError = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
          await order.save();
          console.error(`[Messenger Order] Không thể cập nhật ảnh mẫu vào Sheet orderId=${order.orderId}:`, error);
        }
      }
      void companyTelegramOrderService.notifyProductSelection(order.orderId);
    }
    return {
      orderId: order?.orderId || "",
      imageUrl,
      categoryName: conversation.productCatalogCategory || conversation.cakeCatalogCategory || "",
      itemLabel: conversation.productCatalogItemLabel || catalogConfig.itemLabel,
    };
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
