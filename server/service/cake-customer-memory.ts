import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { CakeCustomerMemoryModel, CakeConsultationSessionModel } from "../model/cake-customer-memory.model";
import { FBConversationModel, FBMessageModel } from "../model/fb-messenger.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { CakeCheckoutModel } from "../model/cake-checkout.model";
import { MessengerOrderModel } from "../model/messenger-order.model";
import { normalizeCakeText } from "./cake-price-catalog";

export const CUSTOMER_SESSION_MS = 24 * 60 * 60 * 1000;
export function pendingSessionInput(rows: { timestamp: Date; messageId: string; text: string }[], lastProcessedId?: string) {
  let start = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].timestamp.getTime() - rows[i - 1].timestamp.getTime() >= CUSTOMER_SESSION_MS) start = i;
  const processed = rows.findIndex(row => row.messageId === lastProcessedId);
  if (processed >= 0 && processed < rows.length - 1) start = Math.max(start, processed + 1);
  if (processed === rows.length - 1) start = processed;
  return { message: rows.slice(start).map(row => row.text).filter(Boolean).join("\n"),
    startedAt: rows[start]?.timestamp, previousAt: rows[start - 1]?.timestamp };
}
type Scope = { companyCode: string; pageId: string; conversationId: string };
export interface CakeSessionContext {
  sessionId: string; resetDraft: boolean; ask?: string;
  order?: { orderId: string; checkoutSnapshot?: unknown; depositStatus: string; paymentCode?: string };
  reference?: unknown;
}

export function decideCakeSession(message: string, currentAt: Date, previousAt?: Date, awaitingChoice = false, paidCurrent = false) {
  const text = normalizeCakeText(message);
  const expired = !previousAt || currentAt.getTime() - previousAt.getTime() >= CUSTOMER_SESSION_MS;
  const reorder = /\b(giong|nhu)\b.*\b(lan truoc|hom truoc|don cu)\b/.test(text);
  const explicitNew = /\b(don moi|banh moi|banh khac|mua moi|dat moi|dat them|mua them)\b|\b(hom nay|hnay)\b.*\b(dat|mua)\b/.test(text);
  if (reorder || explicitNew) return { action: "new" as const, reorder, expired };
  if (/\b(don cu|don truoc|banh hom truoc|don hom truoc|don hom qua|da coc|chuyen coc|doi gio|don da dat|tiep tuc don|tiep tuc tu van)\b/.test(text)) {
    return { action: "old" as const, reorder: false, expired };
  }
  if ((expired || paidCurrent || awaitingChoice) && /\b(dat|mua)\b.*\bbanh\b/.test(text)) return { action: "new" as const, reorder: false, expired };
  return { action: expired || awaitingChoice ? "ask" as const : "continue" as const, reorder: false, expired };
}

export function buyerProfilePatch(value: { buyerName?: unknown; buyerPhone?: unknown; customerAddress?: unknown }) {
  const patch: { buyerName?: string; buyerPhone?: string; customerAddress?: string } = {};
  if (typeof value.buyerName === "string" && value.buyerName.trim()) patch.buyerName = value.buyerName.trim().slice(0, 120);
  if (typeof value.buyerPhone === "string" && /^\+?\d{8,15}$/.test(value.buyerPhone.replace(/\s/g, ""))) patch.buyerPhone = value.buyerPhone.replace(/\s/g, "");
  if (typeof value.customerAddress === "string" && /^[\p{L} /-]{1,40}$/u.test(value.customerAddress.trim())) patch.customerAddress = value.customerAddress.trim();
  return patch;
}

export const cakeCustomerMemory = {
  async refreshPurchases(scope: Scope) {
    const conversation = await FBConversationModel.findOne({ _id: scope.conversationId, pageId: scope.pageId }).lean();
    if (!conversation?.recipientId) return;
    // Only distinct, verified cake orders count. Receipts and webhook retries cannot increment it.
    const result = await MessengerOrderModel.aggregate<{ count: number; lastPurchasedAt: Date }>([
      { $match: { ...scope, conversationId: new Types.ObjectId(scope.conversationId), checkoutFlow: "cake_deposit", depositStatus: "verified" } },
      { $group: { _id: "$orderId", paidAt: { $max: "$sepayVerifiedAt" } } },
      { $group: { _id: null, count: { $sum: 1 }, lastPurchasedAt: { $max: "$paidAt" } } },
    ]);
    const stats = result[0];
    await CakeCustomerMemoryModel.updateOne({ companyCode: scope.companyCode, pageId: scope.pageId, recipientId: conversation.recipientId }, {
      $setOnInsert: { ...scope },
      $max: { purchaseCount: stats?.count || 0, ...(stats?.lastPurchasedAt ? { lastPurchasedAt: stats.lastPurchasedAt } : {}) },
    }, { upsert: true });
  },

  async learn(scope: Scope, sessionId: string, values: Parameters<typeof buyerProfilePatch>[0]) {
    const patch = buyerProfilePatch(values);
    if (Object.keys(patch).length) await CakeCustomerMemoryModel.updateOne({ ...scope, sessionId }, { $set: patch });
  },

  async prepare(scope: Scope, messageId: string): Promise<CakeSessionContext> {
    if (!await SocialIntegrationModel.exists({ companyCode: scope.companyCode, username: scope.pageId, platform: "Facebook", isConnected: true })) throw new Error("Page không thuộc doanh nghiệp.");
    const conversation = await FBConversationModel.findOne({ _id: scope.conversationId, pageId: scope.pageId }).lean();
    if (!conversation) throw new Error("Không tìm thấy khách hàng.");
    const latest = await FBMessageModel.findOne({ conversationId: scope.conversationId, direction: "inbound" }).sort({ timestamp: -1 }).lean();
    if (!latest || latest.messageId !== messageId) throw new Error("Tin nhắn khách đã thay đổi.");
    await this.refreshPurchases(scope);
    const key = { companyCode: scope.companyCode, pageId: scope.pageId, recipientId: conversation.recipientId };
    const memory = await CakeCustomerMemoryModel.findOne(key).lean();
    if (!memory) throw new Error("Chưa tạo được hồ sơ khách.");
    const inboundRows = await FBMessageModel.find({ conversationId: scope.conversationId, direction: "inbound", timestamp: { $lte: latest.timestamp } })
      .sort({ timestamp: -1 }).limit(100).lean();
    const pending = pendingSessionInput(inboundRows.reverse(), memory.lastInboundMessageId);
    const currentDraft = await CakeCheckoutModel.findOne(scope).lean();
    const activeSession = memory.sessionId ? await CakeConsultationSessionModel.findOne({ ...scope, sessionId: memory.sessionId }).lean() : null;
    const orders = await MessengerOrderModel.find({ ...scope, checkoutFlow: "cake_deposit" }).sort({ createdAt: -1 }).limit(20).lean();
    const currentPaid = orders.some(order => order.orderId === currentDraft?.orderId && order.depositStatus === "verified");
    const decision = decideCakeSession(pending.message || latest.text, latest.timestamp, pending.previousAt, memory.needsClarification, currentPaid);
    let sessionId = memory.sessionId;
    let windowStart = memory.windowStart;
    let ask: string | undefined;
    let selected: typeof orders[number] | undefined;
    let reference: unknown;
    const explicitOrder = orders.find(order => [order.orderId, order.paymentCode].some(code => code && (pending.message || latest.text).toUpperCase().includes(code.toUpperCase())));
    if (explicitOrder && explicitOrder.depositStatus !== "verified" && explicitOrder.paymentRequestStatus !== "active") {
      ask = "Yêu cầu cọc của mã đơn này đã dừng rồi ạ. Mình muốn tiếp tục đặt bánh theo mẫu nào để em xác nhận lại thông tin nhé?";
    } else if (explicitOrder || decision.action === "old") {
      const eligible = orders.filter(order => order.depositStatus === "verified" || order.paymentRequestStatus === "active");
      selected = explicitOrder || (eligible.length === 1 ? eligible[0] : undefined);
      if (!selected && !eligible.length && currentDraft?.sessionId && !currentDraft.orderId) sessionId = currentDraft.sessionId;
      else if (!selected) ask = eligible.length ? `Mình muốn hỏi đơn nào ạ?\n${eligible.slice(0, 5).map(order => `${order.paymentCode || order.orderId} — nhận ${order.requestedFulfillmentTime || "chưa xác định"}`).join("\n")}`
        : "Mình đang hỏi đơn bánh nào ạ? Cho em xin mã đơn hoặc ngày nhận bánh nhé.";
      else if (selected) {
        const oldSession = await CakeConsultationSessionModel.findOne({ ...scope, orderId: selected.orderId }).lean();
        sessionId = oldSession?.sessionId || (currentDraft?.orderId === selected.orderId ? currentDraft.sessionId : undefined) || `order-${selected.orderId}`;
      }
    } else if (decision.action === "new" || !sessionId || activeSession?.closed) {
      sessionId = createHash("sha256").update(`${scope.companyCode}:${scope.pageId}:${conversation.recipientId}:${messageId}`).digest("hex");
      if (decision.reorder) {
        const prior = orders.find(order => order.depositStatus === "verified");
        if (prior?.checkoutSnapshot) reference = { variant: prior.checkoutSnapshot.variant, imageUrl: prior.checkoutSnapshot.details.imageUrl,
          decoration: prior.checkoutSnapshot.details.decoration, instruction: "Chỉ tham khảo mẫu cũ, xác nhận lại lựa chọn và giá hiện tại; không dùng lại ngày/địa chỉ/QR cũ." };
      }
    } else if (decision.action === "ask") ask = "Mình muốn đặt bánh mới hay hỏi thêm về đơn trước ạ?";
    sessionId ||= createHash("sha256").update(`${scope.companyCode}:${scope.pageId}:${messageId}`).digest("hex");
    const switched = sessionId !== memory.sessionId;
    const resetDraft = sessionId !== currentDraft?.sessionId && (!!memory.sessionId || decision.expired || decision.action === "new");
    if (memory.lastInboundMessageId !== messageId) {
      if (memory.lastInboundAt && memory.lastInboundAt > latest.timestamp) throw new Error("Tin nhắn cũ không được mở lại phiên.");
      if (switched && memory.sessionId && memory.windowStart) await FBMessageModel.updateMany({ conversationId: scope.conversationId,
        consultationSessionId: { $exists: false }, timestamp: { $gte: memory.windowStart, $lt: pending.startedAt || latest.timestamp } }, { $set: { consultationSessionId: memory.sessionId } });
      windowStart = switched ? pending.startedAt || latest.timestamp : windowStart || latest.timestamp;
      const updated = await CakeCustomerMemoryModel.updateOne({ ...key, revision: memory.revision }, {
        $set: { sessionId, windowStart, lastInboundAt: latest.timestamp, lastInboundMessageId: messageId, needsClarification: !!ask }, $inc: { revision: 1 },
      });
      if (!updated.modifiedCount) throw new Error("Phiên khách đang được cập nhật, cần xử lý lại tin mới nhất.");
    }
    await CakeConsultationSessionModel.updateOne({ ...scope, sessionId }, {
      $setOnInsert: { startedAt: latest.timestamp }, $max: { lastInboundAt: latest.timestamp },
      ...(selected ? { $set: { orderId: selected.orderId } } : {}),
    }, { upsert: true });
    await FBMessageModel.updateMany({ conversationId: scope.conversationId, consultationSessionId: { $exists: false },
      timestamp: { $gte: windowStart || latest.timestamp, $lte: latest.timestamp } }, { $set: { consultationSessionId: sessionId } });
    // Persisted buyer identity stays in the backend; never expose it to AI context builders.
    return { sessionId, resetDraft, ask,
      order: selected ? { orderId: selected.orderId, checkoutSnapshot: selected.checkoutSnapshot, depositStatus: selected.depositStatus, paymentCode: selected.paymentCode } : undefined,
      reference };
  },

  async archive(scope: Scope, sessionId: string, draft: Record<string, unknown>) {
    await CakeConsultationSessionModel.updateOne({ ...scope, sessionId }, { $set: { draft, ...(draft.orderId ? { orderId: draft.orderId } : {}) },
      ...(!draft.orderId ? { $unset: { orderId: 1 } } : {}),
      $setOnInsert: { startedAt: new Date(), lastInboundAt: new Date(0) } }, { upsert: true });
  },
};
