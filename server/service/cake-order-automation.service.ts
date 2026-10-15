import { createHash, randomUUID } from "node:crypto";
import { AutomationEventModel } from "../model/automation-event.model";
import {
  CakeOrderAutomationModel,
  CakeOrderStatus,
  ICakeOrderAutomation,
} from "../model/cake-order-automation.model";
import { CompanyModel } from "../model/company.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { CakeCustomerProfileModel } from "../model/cake-customer-profile.model";
import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { TikTokConversationModel, TikTokMessageModel } from "../model/tiktok-messenger.model";
import { ZaloConversationModel, ZaloMessageModel } from "../model/zalo-messenger.model";
import { aiKnowledgeService } from "./ai-knowledge.service";
import { companySepayService } from "./company-sepay.service";
import { companyTelegramOrderService } from "./company-telegram-order.service";
import { fbMessengerService } from "./fb-messenger.service";
import { openrouterChat } from "./openrouter.service";
import { tiktokMessengerService } from "./tiktok-messenger.service";
import { zaloMessengerService } from "./zalo-messenger.service";
import { getCakePriceRule } from "./cake-order-pricing";

type Channel = "facebook" | "zalo" | "tiktok";

interface NextActionInput {
  eventId: string;
  companyCode: string;
  channel: Channel;
  accountId: string;
  conversationId: string;
  messageId?: string;
  customerMessage: string;
  attachmentUrls?: string[];
  history?: Array<{ sender: "user" | "model"; text: string }>;
}

interface ExtractedCakeFacts {
  customerName: string;
  customerPhone: string;
  designSource: "" | "customer" | "company";
  recipientGroup: "" | "adult" | "child";
  recipientGender: "" | "male" | "female" | "neutral";
  occasion: string;
  cakeType: "" | "fresh_cream" | "mousse" | "salted_egg" | "tiramisu";
  guestCount: number;
  selectedPrice: number;
  inscription: string;
  pickupDate: string;
  pickupTime: string;
  fulfillmentMethod: "" | "pickup" | "delivery";
  deliveryAddress: string;
  customerConfirmed: boolean;
  asksQuestion: boolean;
  ragAnswer: string;
  confidence: number;
}

export class OrderAutomationError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

const TERMINAL_STATUSES: CakeOrderStatus[] = ["COMPLETED", "CANCELLED"];

const TRANSITIONS: Record<string, { from: CakeOrderStatus[]; to: CakeOrderStatus }> = {
  CUSTOMER_CONFIRMED: { from: ["WAITING_CUSTOMER_CONFIRMATION"], to: "CONFIRMED" },
  DEPOSIT_REQUESTED: { from: ["WAITING_CUSTOMER_CONFIRMATION", "WAITING_DEPOSIT"], to: "WAITING_DEPOSIT" },
  DEPOSIT_VERIFIED: { from: ["WAITING_DEPOSIT"], to: "CONFIRMED" },
  SENT_TO_PRODUCTION: { from: ["CONFIRMED"], to: "IN_PRODUCTION" },
  PRODUCTION_COMPLETED: { from: ["IN_PRODUCTION", "REVISION_REQUESTED"], to: "WAITING_CAKE_APPROVAL" },
  REVISION_REQUESTED: { from: ["WAITING_CAKE_APPROVAL"], to: "REVISION_REQUESTED" },
  CAKE_APPROVED: { from: ["WAITING_CAKE_APPROVAL"], to: "CAKE_APPROVED" },
  READY_FOR_DELIVERY: { from: ["CAKE_APPROVED"], to: "READY_FOR_DELIVERY" },
  DRIVER_PICKED_UP: { from: ["READY_FOR_DELIVERY"], to: "OUT_FOR_DELIVERY" },
  DELIVERED: { from: ["OUT_FOR_DELIVERY"], to: "DELIVERED" },
  COMPLETED: { from: ["DELIVERED"], to: "COMPLETED" },
  MANUAL_REVIEW: { from: [
    "COLLECTING_INFORMATION",
    "WAITING_CUSTOMER_CONFIRMATION",
    "WAITING_DEPOSIT",
    "CONFIRMED",
    "IN_PRODUCTION",
    "WAITING_CAKE_APPROVAL",
    "REVISION_REQUESTED",
    "CAKE_APPROVED",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
  ], to: "MANUAL_REVIEW" },
  CANCELLED: { from: [
    "COLLECTING_INFORMATION",
    "WAITING_CUSTOMER_CONFIRMATION",
    "WAITING_DEPOSIT",
    "CONFIRMED",
    "MANUAL_REVIEW",
  ], to: "CANCELLED" },
};

function normalizeCompanyCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

function money(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function phone(value: string) {
  return String(value || "").replace(/[^0-9+]/g, "").slice(0, 30);
}

function limitedUrls(value: string[] | undefined) {
  return [...new Set((value || []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 10);
}

function missingFields(order: ICakeOrderAutomation) {
  const missing = [
    !order.designSource ? "design_source" : "",
    order.designSource === "company" && !order.recipientGroup ? "recipient_group" : "",
    order.designSource === "company" && !order.recipientGender ? "recipient_gender" : "",
    order.designSource === "company" && !order.occasion ? "occasion" : "",
    !order.cakeType ? "cake_type" : "",
    !order.guestCount ? "guest_count" : "",
    order.priceOptions.length > 1 && !order.basePrice ? "price_option" : "",
    !order.inscription ? "inscription" : "",
    !order.pickupDate ? "pickup_date" : "",
    !order.pickupTime ? "pickup_time" : "",
    !order.fulfillmentMethod ? "fulfillment_method" : "",
    order.fulfillmentMethod === "delivery" && !order.deliveryAddress ? "delivery_address" : "",
    !order.customerPhone ? "customer_phone" : "",
  ];
  return missing.filter(Boolean);
}

function nextQuestion(field: string) {
  const questions: Record<string, string> = {
    design_source: "Anh/chị đã có mẫu bánh muốn đặt chưa ạ? Nếu có, anh/chị gửi ảnh mẫu giúp tiệm; nếu chưa, tiệm sẽ gửi mẫu phù hợp để mình chọn.",
    recipient_group: "Anh/chị đặt bánh cho người lớn hay trẻ em ạ?",
    recipient_gender: "Người nhận là nam, nữ hay mình chọn mẫu trung tính ạ?",
    occasion: "Anh/chị đặt bánh cho dịp sinh nhật, ngày kỷ niệm hay sự kiện nào ạ?",
    cake_type: "Anh/chị muốn chọn bánh kem tươi, mousse, trứng muối hay tiramisu ạ?",
    guest_count: "Buổi tiệc dự kiến có bao nhiêu người để tiệm tư vấn size bánh phù hợp ạ?",
    price_option: "Với số người này, anh/chị muốn chọn mức giá nào trong các phương án tiệm vừa tư vấn ạ?",
    inscription: "Anh/chị muốn ghi nội dung gì lên bánh ạ? Nếu không cần ghi, anh/chị nói “không ghi” giúp tiệm nhé.",
    pickup_date: "Anh/chị muốn nhận bánh vào ngày nào ạ?",
    pickup_time: "Anh/chị muốn nhận bánh lúc mấy giờ ạ?",
    fulfillment_method: "Anh/chị đến cửa hàng lấy bánh hay cần tiệm giao tận nơi ạ?",
    delivery_address: "Anh/chị gửi giúp tiệm địa chỉ giao bánh cụ thể nhé.",
    customer_phone: "Anh/chị cho tiệm xin số điện thoại liên hệ để xác nhận đơn ạ?",
  };
  return questions[field] || "Anh/chị bổ sung giúp tiệm thông tin còn thiếu nhé.";
}

function summary(order: ICakeOrderAutomation) {
  const cakeTypeLabels: Record<string, string> = {
    fresh_cream: "Bánh kem tươi",
    mousse: "Bánh mousse",
    salted_egg: "Bánh trứng muối",
    tiramisu: "Tiramisu",
  };
  const design = order.designSource === "customer" ? "Mẫu khách gửi" : "Mẫu của tiệm";
  const priceText = order.priceOptions.length > 1
    ? order.priceOptions.map(money).join(" hoặc ")
    : money(order.basePrice || 0);
  return [
    "Tiệm xin tổng hợp đơn bánh:",
    `- Mã đơn: ${order.orderId}`,
    `- Mẫu bánh: ${design}`,
    `- Chất bánh: ${cakeTypeLabels[order.cakeType] || order.cakeType}`,
    `- Số người: ${order.guestCount}`,
    `- Size đề xuất: ${order.sizeLabel}`,
    `- Giá bánh: ${priceText}`,
    `- Nội dung trên bánh: ${order.inscription}`,
    `- Ngày nhận: ${order.pickupDate}`,
    `- Giờ nhận: ${order.pickupTime}`,
    `- Nhận bánh: ${order.fulfillmentMethod === "delivery" ? `Giao tận nơi – ${order.deliveryAddress}` : "Khách đến cửa hàng"}`,
    `- Số điện thoại: ${order.customerPhone}`,
    "Anh/chị kiểm tra giúp tiệm. Nếu đúng, vui lòng trả lời “Xác nhận đơn”.",
  ].join("\n");
}

function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function replay(companyCode: string, operation: string, eventId: string, hash: string) {
  const event = await AutomationEventModel.findOne({ companyCode, operation, eventId }).lean();
  if (!event) return null;
  if (event.requestHash !== hash) {
    throw new OrderAutomationError("eventId đã được dùng cho một nội dung khác.", 409);
  }
  if (event.state === "processing") {
    throw new OrderAutomationError("Yêu cầu này đang được xử lý. Vui lòng chờ kết quả trước khi gửi lại.", 409);
  }
  return event.response;
}

async function claimEvent(companyCode: string, operation: string, eventId: string, hash: string) {
  const cached = await replay(companyCode, operation, eventId, hash);
  if (cached) return cached;
  try {
    await AutomationEventModel.create({
      companyCode,
      operation,
      eventId,
      requestHash: hash,
      state: "processing",
      response: {},
    });
    return null;
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    return replay(companyCode, operation, eventId, hash);
  }
}

async function completeEvent(
  companyCode: string,
  operation: string,
  eventId: string,
  hash: string,
  response: Record<string, unknown>,
) {
  const result = await AutomationEventModel.updateOne(
    { companyCode, operation, eventId, requestHash: hash, state: "processing" },
    { $set: { state: "completed", response } },
  );
  if (result.matchedCount !== 1) throw new Error("Không thể lưu kết quả xử lý event tự động hóa.");
  return response;
}

async function releaseEvent(companyCode: string, operation: string, eventId: string, hash: string) {
  await AutomationEventModel.deleteOne({ companyCode, operation, eventId, requestHash: hash, state: "processing" });
}

function activeConversationKey(input: NextActionInput) {
  return createHash("sha256")
    .update(JSON.stringify([
      normalizeCompanyCode(input.companyCode),
      input.channel,
      input.accountId,
      input.conversationId,
    ]))
    .digest("hex");
}

async function saveOrder(order: ICakeOrderAutomation) {
  try {
    await order.save();
  } catch (error) {
    if (error instanceof Error && error.name === "VersionError") {
      throw new OrderAutomationError("Đơn vừa được cập nhật bởi một yêu cầu khác. Vui lòng tải lại đơn rồi thử lại.", 409);
    }
    throw error;
  }
}

function applyProductionNotificationResult(
  order: ICakeOrderAutomation,
  result: Awaited<ReturnType<typeof companyTelegramOrderService.notifyCakeAutomationProduction>>,
) {
  if (result.status === "sent" || result.status === "already_sent") {
    order.productionNotificationStatus = "sent";
    order.productionNotifiedAt ||= new Date();
    order.productionNotificationError = "";
  } else if (result.status === "in_progress") {
    order.productionNotificationStatus = "sending";
  } else if (result.status === "skipped") {
    order.productionNotificationStatus = "skipped";
  } else if (result.status === "failed") {
    order.productionNotificationStatus = "failed";
    order.productionNotificationError = result.error || "Không thể gửi thông báo cho bộ phận bếp.";
  }
}

async function extractFacts(input: NextActionInput, order: ICakeOrderAutomation, contextText: string) {
  const fallback: ExtractedCakeFacts = {
    customerName: "",
    customerPhone: "",
    designSource: "",
    recipientGroup: "",
    recipientGender: "",
    occasion: "",
    cakeType: "",
    guestCount: 0,
    selectedPrice: 0,
    inscription: "",
    pickupDate: "",
    pickupTime: "",
    fulfillmentMethod: "",
    deliveryAddress: "",
    customerConfirmed: false,
    asksQuestion: false,
    ragAnswer: "",
    confidence: 0,
  };
  try {
    const model = process.env.AI_REPLY_MESSAGE_MODEL || "deepseek-v4-flash-0731";
    const response = await openrouterChat({
      model,
      temperature: 0,
      maxTokens: 1400,
      jsonMode: true,
      strictJsonSchema: true,
      responseSchema: fallback,
      messages: [
        {
          role: "system",
          content: [
            "Bạn trích xuất thông tin đặt bánh từ tin nhắn mới nhất của khách.",
            "Chỉ lấy dữ kiện khách nói rõ; không tự đoán giá, ngày, giờ, địa chỉ hay sở thích.",
            "designSource=customer khi khách nói đã có mẫu hoặc gửi ảnh; company khi khách muốn tiệm gợi ý mẫu.",
            "cakeType chỉ nhận fresh_cream, mousse, salted_egg, tiramisu.",
            "Ngày phải ở dạng YYYY-MM-DD, giờ HH:mm. Hôm nay theo múi giờ Asia/Bangkok là " + new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) + ".",
            "customerConfirmed chỉ true khi đơn đang chờ xác nhận và khách đồng ý rõ ràng với bản tổng hợp.",
            "ragAnswer chỉ trả lời câu hỏi của khách bằng nội dung trong RAG_CONTEXT. Nếu RAG không có câu trả lời thì để trống.",
            "selectedPrice chỉ lấy khi khách chọn rõ một mức giá đã được Marketing đưa ra.",
            "Không lấy giá trong RAG; Marketing sẽ tính và kiểm tra giá bằng quy tắc có cấu trúc.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `ORDER_STATE: ${order.status}`,
            `CURRENT_ORDER: ${JSON.stringify(order.toObject())}`,
            `RAG_CONTEXT:\n${contextText.slice(0, 9000)}`,
            `CUSTOMER_MESSAGE:\n${input.customerMessage}`,
          ].join("\n\n"),
        },
      ],
    });
    return { ...fallback, ...(JSON.parse(response.text) as Partial<ExtractedCakeFacts>) };
  } catch (error) {
    console.error("[Order Automation] Không thể trích xuất bằng AI, tiếp tục bằng câu hỏi cố định:", error);
    return fallback;
  }
}

function applyFacts(order: ICakeOrderAutomation, facts: ExtractedCakeFacts, attachmentUrls: string[]) {
  if (facts.customerName) order.customerName = String(facts.customerName).trim().slice(0, 300);
  if (facts.customerPhone) order.customerPhone = phone(facts.customerPhone);
  if (facts.designSource) order.designSource = facts.designSource;
  if (attachmentUrls.length) {
    order.designSource = "customer";
    order.designReferenceUrls = limitedUrls([...order.designReferenceUrls, ...attachmentUrls]);
  }
  if (facts.recipientGroup) order.recipientGroup = facts.recipientGroup;
  if (facts.recipientGender) order.recipientGender = facts.recipientGender;
  if (facts.occasion) order.occasion = String(facts.occasion).trim().slice(0, 500);
  if (facts.cakeType) order.cakeType = facts.cakeType;
  if (Number.isFinite(Number(facts.guestCount)) && Number(facts.guestCount) > 0) {
    order.guestCount = Math.round(Number(facts.guestCount));
    const rule = getCakePriceRule(order.guestCount);
    if (rule) {
      order.sizeLabel = rule.sizeLabel;
      order.priceOptions = rule.priceOptions;
      const selectedPrice = Number(facts.selectedPrice);
      if (rule.priceOptions.length === 1) {
        order.basePrice = rule.priceOptions[0];
      } else if (rule.priceOptions.includes(selectedPrice)) {
        order.basePrice = selectedPrice;
      } else if (!rule.priceOptions.includes(Number(order.basePrice))) {
        order.basePrice = undefined;
      }
      order.totalAmount = order.basePrice === undefined
        ? undefined
        : order.basePrice + Number(order.deliveryFee || 0);
      order.humanReviewReason = "";
    } else {
      order.sizeLabel = "Cần nhân viên tư vấn";
      order.priceOptions = [];
      order.basePrice = undefined;
      order.totalAmount = undefined;
      order.humanReviewReason = "Số người nằm ngoài bảng giá tự động từ 2 đến 15 người.";
    }
  }
  const selectedPrice = Number(facts.selectedPrice);
  if (order.priceOptions.length > 1 && order.priceOptions.includes(selectedPrice)) {
    order.basePrice = selectedPrice;
    order.totalAmount = selectedPrice + Number(order.deliveryFee || 0);
  }
  if (facts.inscription) order.inscription = String(facts.inscription).trim().slice(0, 500);
  if (/^\d{4}-\d{2}-\d{2}$/.test(facts.pickupDate || "")) order.pickupDate = facts.pickupDate;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(facts.pickupTime || "")) order.pickupTime = facts.pickupTime;
  if (facts.fulfillmentMethod) order.fulfillmentMethod = facts.fulfillmentMethod;
  if (facts.deliveryAddress) order.deliveryAddress = String(facts.deliveryAddress).trim().slice(0, 1500);
}

async function findOrCreateOrder(input: NextActionInput) {
  const filter = {
    companyCode: normalizeCompanyCode(input.companyCode),
    channel: input.channel,
    accountId: input.accountId,
    conversationId: input.conversationId,
    status: { $nin: TERMINAL_STATUSES },
  };
  const key = activeConversationKey(input);
  const active = await CakeOrderAutomationModel.findOne(filter).sort({ updatedAt: -1 });
  if (active) {
    if (!active.activeConversationKey) active.activeConversationKey = key;
    return active;
  }
  const orderId = randomUUID();
  try {
    return await CakeOrderAutomationModel.create({
      orderId,
      activeConversationKey: key,
      companyCode: filter.companyCode,
      channel: input.channel,
      accountId: input.accountId,
      conversationId: input.conversationId,
      lastInboundMessageId: input.messageId || "",
      history: [{ eventType: "ORDER_STARTED", eventId: input.eventId, at: new Date() }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const racedOrder = await CakeOrderAutomationModel.findOne(filter).sort({ updatedAt: -1 });
    if (!racedOrder) throw error;
    if (!racedOrder.activeConversationKey) racedOrder.activeConversationKey = key;
    return racedOrder;
  }
}

async function loadConversationHistory(input: NextActionInput) {
  const conversation = input.channel === "facebook"
    ? await FBConversationModel.findOne({ _id: input.conversationId, pageId: input.accountId }).select("_id").lean()
    : input.channel === "zalo"
      ? await ZaloConversationModel.findOne({ _id: input.conversationId, oaId: input.accountId }).select("_id").lean()
      : await TikTokConversationModel.findOne({ _id: input.conversationId, businessAccountId: input.accountId }).select("_id").lean();

  if (!conversation) {
    throw new OrderAutomationError("Conversation does not belong to the selected messaging account.", 404);
  }

  if (!input.messageId) {
    throw new OrderAutomationError("An inbound message ID is required to scope this conversation request.", 400);
  }
  const inboundFilter = {
    conversationId: conversation._id,
    messageId: input.messageId,
    direction: "inbound" as const,
  };
  let inboundMessageExists = false;
  let messages: Array<{ messageId: string; direction: string; text: string }> = [];
  if (input.channel === "facebook") {
    inboundMessageExists = !!(await FBMessageModel.findOne(inboundFilter).select("_id").lean());
    messages = (await FBMessageModel.find({ conversationId: conversation._id })
      .sort({ timestamp: -1 }).limit(31).select("messageId direction text").lean())
      .map((message) => ({ messageId: message.messageId, direction: message.direction, text: message.text || "" }));
  } else if (input.channel === "zalo") {
    inboundMessageExists = !!(await ZaloMessageModel.findOne(inboundFilter).select("_id").lean());
    messages = (await ZaloMessageModel.find({ conversationId: conversation._id })
      .sort({ timestamp: -1 }).limit(31).select("messageId direction text").lean())
      .map((message) => ({ messageId: message.messageId, direction: message.direction, text: message.text || "" }));
  } else {
    inboundMessageExists = !!(await TikTokMessageModel.findOne(inboundFilter).select("_id").lean());
    messages = (await TikTokMessageModel.find({ conversationId: conversation._id })
      .sort({ timestamp: -1 }).limit(31).select("messageId direction text").lean())
      .map((message) => ({ messageId: message.messageId, direction: message.direction, text: message.text || "" }));
  }
  if (!inboundMessageExists) {
    throw new OrderAutomationError("Inbound message does not belong to the selected conversation.", 404);
  }
  return messages
    .filter((message) => !input.messageId || message.messageId !== input.messageId)
    .slice(0, 30)
    .reverse()
    .map((message) => ({
      sender: message.direction === "inbound" ? "user" as const : "model" as const,
      text: message.text || "",
    }));
}

function serializedOrder(order: ICakeOrderAutomation) {
  const value = order.toObject();
  return { ...value, _id: String(value._id) };
}

export const cakeOrderAutomationService = {
  async nextAction(input: NextActionInput) {
    const companyCode = normalizeCompanyCode(input.companyCode);
    const hash = requestHash(input);
    const cached = await claimEvent(companyCode, "next_action", input.eventId, hash);
    if (cached) return cached;
    let orderPersisted = false;

    try {
    const company = await CompanyModel.findOne({ code: companyCode }).lean();
    if (!company) throw new OrderAutomationError("Không tìm thấy doanh nghiệp.", 404);
    const platform = input.channel === "facebook" ? "Facebook" : input.channel === "zalo" ? "Zalo" : "TikTok";
    const integration = await SocialIntegrationModel.findOne({
      companyCode,
      platform,
      username: input.accountId,
      isConnected: true,
    }).select("_id").lean();
    if (!integration) throw new OrderAutomationError("Messaging account is not connected to this company.", 403);

    const history = await loadConversationHistory({ ...input, companyCode });
    const order = await findOrCreateOrder({ ...input, companyCode });
    const rag = await aiKnowledgeService.prepareChatContext({
      companyCode,
      message: input.customerMessage,
      history,
      channel: input.channel,
      pageId: input.accountId,
    });
    const ragData = rag as typeof rag & { scenarioContextText?: string; matches?: number };
    const combinedContext = [ragData.contextText, ragData.scenarioContextText].filter(Boolean).join("\n\n");
    const facts = await extractFacts(input, order, combinedContext);
    const previousStatus = order.status;
    if (order.status !== "WAITING_DEPOSIT") {
      applyFacts(order, facts, limitedUrls(input.attachmentUrls));
    }
    order.lastInboundMessageId = input.messageId || order.lastInboundMessageId;
    order.lastKnowledgeMatches = Number(ragData.matches || 0);
    order.missingFields = missingFields(order);

    let nextAction = "ASK_CUSTOMER";
    let suggestedMessage = facts.asksQuestion && facts.ragAnswer ? facts.ragAnswer.trim() : "";
    let requiresHumanApproval = false;
    let needsDepositReview = false;
    let notifyProduction = false;

    if (order.humanReviewReason) {
      order.status = "MANUAL_REVIEW";
      nextAction = "ESCALATE_TO_HUMAN";
      requiresHumanApproval = true;
      suggestedMessage = "Số lượng khách này cần tiệm kiểm tra size và báo giá riêng. Nhân viên sẽ liên hệ lại với anh/chị ngay ạ.";
    } else if (order.status === "WAITING_DEPOSIT") {
      nextAction = "ESCALATE_TO_HUMAN";
      requiresHumanApproval = true;
      needsDepositReview = true;
      suggestedMessage = "Tiệm đã ghi nhận yêu cầu mới. Nhân viên sẽ kiểm tra trạng thái thanh toán rồi hỗ trợ thay đổi hoặc hủy đơn; anh/chị vui lòng chờ xác nhận trước khi chuyển thêm tiền ạ.";
    } else if (!["COLLECTING_INFORMATION", "WAITING_CUSTOMER_CONFIRMATION"].includes(order.status)) {
      nextAction = "ESCALATE_TO_HUMAN";
      requiresHumanApproval = true;
      suggestedMessage = suggestedMessage || "Đơn đã được xác nhận. Nhân viên cửa hàng sẽ kiểm tra yêu cầu mới của anh/chị trước khi thay đổi đơn ạ.";
    } else if (order.status === "WAITING_CUSTOMER_CONFIRMATION" && facts.customerConfirmed) {
      const depositEnabled = company.sepayConfig?.depositEnabled === true;
      if (depositEnabled) {
        const percent = Math.max(1, Math.min(100, Number(company.sepayConfig?.depositPercent || 30)));
        order.depositRequired = true;
        order.depositPercent = percent;
        order.depositAmount = Math.round(Number(order.totalAmount || 0) * percent / 100);
        order.depositStatus = "pending";
        order.paymentCode = `${String(company.sepayConfig?.paymentCodePrefix || "DH").toUpperCase()}${order.orderId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
        const qr = await companySepayService.getPaymentQr(companyCode, order.depositAmount, order.paymentCode);
        order.paymentQrUrl = qr?.imageUrl || "";
        order.status = "WAITING_DEPOSIT";
        nextAction = "REQUEST_DEPOSIT";
        suggestedMessage = [
          `Tiệm đã ghi nhận xác nhận đơn ${order.orderId}.`,
          `Anh/chị vui lòng đặt cọc ${money(order.depositAmount)}.`,
          qr ? `Số tài khoản: ${qr.accountNumber}` : "",
          qr ? `Chủ tài khoản: ${qr.accountName}` : "",
          `Nội dung chuyển khoản: ${order.paymentCode}`,
          "Đơn sẽ được chuyển sang sản xuất sau khi tiệm đối soát được tiền cọc.",
        ].filter(Boolean).join("\n");
      } else {
        order.depositRequired = false;
        order.depositStatus = "not_required";
        order.status = "CONFIRMED";
        nextAction = "NOTIFY_PRODUCTION";
        notifyProduction = true;
      }
    } else if (order.missingFields.length) {
      order.status = "COLLECTING_INFORMATION";
      const question = order.missingFields[0] === "price_option"
        ? `Với ${order.guestCount} người, tiệm có mức ${order.priceOptions.map(money).join(" hoặc ")}. Anh/chị muốn chọn mức nào ạ?`
        : nextQuestion(order.missingFields[0]);
      suggestedMessage = suggestedMessage ? `${suggestedMessage}\n\n${question}` : question;
    } else {
      order.status = "WAITING_CUSTOMER_CONFIRMATION";
      nextAction = "REQUEST_CUSTOMER_CONFIRMATION";
      suggestedMessage = summary(order);
    }

    order.version += 1;
    order.history.push({
      eventType: "MESSAGE_PROCESSED",
      fromStatus: previousStatus,
      toStatus: order.status,
      eventId: input.eventId,
      at: new Date(),
    });
    if (order.history.length > 100) order.history = order.history.slice(-100);
    await saveOrder(order);
    orderPersisted = true;

    const customer = order.customerPhone
      ? await CakeCustomerProfileModel.findOneAndUpdate(
          { companyCode, phone: order.customerPhone },
          {
            $set: {
              ...(order.customerName ? { name: order.customerName } : {}),
              lastSeenAt: new Date(),
            },
            $addToSet: { channels: order.channel },
            $setOnInsert: {
              companyCode,
              phone: order.customerPhone,
              completedOrderCount: 0,
              lifetimeValue: 0,
              marketingConsent: "unknown",
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean()
      : null;

    if (needsDepositReview) {
      const notification = await companyTelegramOrderService.notifyCakeAutomationAttention(order.orderId, input.customerMessage);
      if (notification.status === "failed") {
        console.error("[Order Automation] Không thể báo nhân viên về yêu cầu của khách đang chờ cọc:", notification.error);
      }
    }

    let productionNotificationStatus: string | undefined;
    if (notifyProduction) {
      const notification = await companyTelegramOrderService.notifyCakeAutomationProduction(order.orderId);
      applyProductionNotificationResult(order, notification);
      productionNotificationStatus = notification.status;
      if (notification.status === "sent" || notification.status === "already_sent") {
        suggestedMessage = "Tiệm đã xác nhận đơn và chuyển thông tin cho bộ phận bếp. Tiệm sẽ cập nhật tiến độ cho anh/chị ạ.";
      } else {
        nextAction = "ESCALATE_TO_HUMAN";
        requiresHumanApproval = true;
        suggestedMessage = "Đơn đã được xác nhận nhưng tiệm chưa chuyển được thông tin cho bộ phận bếp. Nhân viên sẽ kiểm tra và cập nhật lại cho anh/chị ạ.";
      }
    }

    const response = {
      order: serializedOrder(order),
      customer: customer ? { ...customer, _id: String(customer._id) } : null,
      nextAction,
      suggestedMessage,
      requiresHumanApproval,
      ...(productionNotificationStatus ? { productionNotificationStatus } : {}),
      confidence: Math.max(0, Math.min(1, Number(facts.confidence || 0))),
      knowledge: {
        matches: order.lastKnowledgeMatches,
        grounded: order.lastKnowledgeMatches > 0,
      },
    };
    return await completeEvent(companyCode, "next_action", input.eventId, hash, response);
    } catch (error) {
      if (!orderPersisted) {
        await releaseEvent(companyCode, "next_action", input.eventId, hash).catch(() => undefined);
      }
      throw error;
    }
  },

  async transition(input: {
    eventId: string;
    companyCode: string;
    orderId: string;
    eventType: string;
    expectedVersion: number;
    note?: string;
    imageUrl?: string;
  }) {
    const companyCode = normalizeCompanyCode(input.companyCode);
    const hash = requestHash(input);
    const cached = await claimEvent(companyCode, "transition", input.eventId, hash);
    if (cached) return cached;
    let orderPersisted = false;
    try {
    const rule = TRANSITIONS[input.eventType];
    if (!rule) throw new OrderAutomationError("Loại chuyển trạng thái không được hỗ trợ.");
    const order = await CakeOrderAutomationModel.findOne({ orderId: input.orderId, companyCode });
    if (!order) throw new OrderAutomationError("Không tìm thấy đơn bánh.", 404);
    if (order.version !== input.expectedVersion) {
      throw new OrderAutomationError("Đơn đã thay đổi. Vui lòng tải phiên bản mới nhất trước khi thao tác.", 409);
    }
    if (!rule.from.includes(order.status)) {
      throw new OrderAutomationError(`Không thể xử lý ${input.eventType} khi đơn đang ở trạng thái ${order.status}.`, 409);
    }
    if (input.eventType === "SENT_TO_PRODUCTION" && order.depositRequired && order.depositStatus !== "verified") {
      throw new OrderAutomationError("Chưa thể chuyển sản xuất vì tiền cọc chưa được xác minh.", 409);
    }
    if (input.eventType === "PRODUCTION_COMPLETED" && !input.imageUrl) {
      throw new OrderAutomationError("Bếp phải gửi ảnh thành phẩm trước khi yêu cầu khách duyệt.");
    }
    if (input.eventType === "DELIVERED" && !input.imageUrl) {
      throw new OrderAutomationError("Cần ảnh xác nhận giao bánh trước khi hoàn tất giao hàng.");
    }

    const previousStatus = order.status;
    order.status = rule.to;
    if (input.eventType === "DEPOSIT_VERIFIED") order.depositStatus = "verified";
    if (input.eventType === "PRODUCTION_COMPLETED") order.productionPhotoUrl = input.imageUrl || "";
    if (input.eventType === "DELIVERED") order.deliveryProofUrl = input.imageUrl || "";
    if (input.eventType === "MANUAL_REVIEW") order.humanReviewReason = input.note || "Cần nhân viên kiểm tra.";
    if (input.eventType === "COMPLETED" || input.eventType === "CANCELLED") {
      order.set("activeConversationKey", undefined);
    }
    order.version += 1;
    order.history.push({
      eventType: input.eventType,
      fromStatus: previousStatus,
      toStatus: order.status,
      eventId: input.eventId,
      note: input.note || "",
      at: new Date(),
    });
    if (order.history.length > 100) order.history = order.history.slice(-100);
    await saveOrder(order);
    orderPersisted = true;
    if (input.eventType === "COMPLETED" && order.customerPhone) {
      await CakeCustomerProfileModel.updateOne(
        {
          companyCode,
          phone: order.customerPhone,
          completedOrderIds: { $ne: order.orderId },
        },
        {
          $set: {
            ...(order.customerName ? { name: order.customerName } : {}),
            lastSeenAt: new Date(),
            lastOrderAt: new Date(),
          },
          $addToSet: { completedOrderIds: order.orderId, channels: order.channel },
          $inc: { completedOrderCount: 1, lifetimeValue: Number(order.totalAmount || 0) },
          $setOnInsert: { companyCode, phone: order.customerPhone, marketingConsent: "unknown" },
        },
        { upsert: true },
      );
    }
    let productionNotificationStatus: string | undefined;
    if (input.eventType === "DEPOSIT_VERIFIED") {
      const notification = await companyTelegramOrderService.notifyCakeAutomationProduction(order.orderId);
      applyProductionNotificationResult(order, notification);
      productionNotificationStatus = notification.status;
    }
    const response = {
      order: serializedOrder(order),
      ...(productionNotificationStatus ? { productionNotificationStatus } : {}),
    };
    return await completeEvent(companyCode, "transition", input.eventId, hash, response);
    } catch (error) {
      if (!orderPersisted) {
        await releaseEvent(companyCode, "transition", input.eventId, hash).catch(() => undefined);
      }
      throw error;
    }
  },

  async getOrder(companyCode: string, orderId: string) {
    const order = await CakeOrderAutomationModel.findOne({
      companyCode: normalizeCompanyCode(companyCode),
      orderId,
    });
    if (!order) throw new OrderAutomationError("Không tìm thấy đơn bánh.", 404);
    return { order: serializedOrder(order) };
  },

  async dispatch(input: {
    eventId: string;
    companyCode: string;
    orderId: string;
    expectedVersion: number;
    text: string;
  }) {
    const companyCode = normalizeCompanyCode(input.companyCode);
    const hash = requestHash(input);
    const cached = await claimEvent(companyCode, "dispatch", input.eventId, hash);
    if (cached) return cached;
    let sideEffectAttempted = false;
    try {
    const order = await CakeOrderAutomationModel.findOne({ orderId: input.orderId, companyCode });
    if (!order) throw new OrderAutomationError("Không tìm thấy đơn bánh.", 404);
    if (order.version !== input.expectedVersion) {
      throw new OrderAutomationError("Không gửi tin vì đơn đã có phiên bản mới hơn.", 409);
    }
    const platform = order.channel === "facebook" ? "Facebook" : order.channel === "zalo" ? "Zalo" : "TikTok";
    const integration = await SocialIntegrationModel.findOne({
      companyCode,
      platform,
      username: order.accountId,
      isConnected: true,
    }).lean();
    if (!integration) throw new OrderAutomationError("Kênh nhắn tin không còn được kết nối với doanh nghiệp.", 409);

    let result: unknown;
    sideEffectAttempted = true;
    if (order.channel === "facebook") {
      result = await fbMessengerService.sendReply(order.accountId, order.conversationId, input.text, "ai", { companyCode, source: "company" });
    } else if (order.channel === "zalo") {
      result = await zaloMessengerService.sendReply(order.accountId, order.conversationId, input.text, "ai");
    } else {
      result = await tiktokMessengerService.sendReply(order.accountId, order.conversationId, input.text, "ai");
    }
    return await completeEvent(companyCode, "dispatch", input.eventId, hash, { sent: true, result });
    } catch (error) {
      if (!sideEffectAttempted) {
        await releaseEvent(companyCode, "dispatch", input.eventId, hash).catch(() => undefined);
      }
      throw error;
    }
  },
};

