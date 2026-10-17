import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { CakeCheckoutModel } from "../../model/cake-checkout.model";
import { CompanyModel } from "../../model/company.model";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { AIKnowledgeChunkModel, AIKnowledgeDocumentModel } from "../../model/ai-knowledge.model";
import { MessengerOrderModel } from "../../model/messenger-order.model";
import { cakeCheckoutService, cakeConversationInstructions, preservesCakeReplyFacts, splitCakeReply } from "../cake-checkout.service";
import { cloudinaryService } from "../cloudinary.service";
import { createCipheriv, createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { Types } from "mongoose";
import { SepayWebhookTransactionModel } from "../../model/sepay-webhook-transaction.model";
import { companySepayService } from "../company-sepay.service";
import { processCakeDeposits } from "../cake-deposit-worker";
import { googleOrderSheetService, type SheetOrder } from "../google-order-sheet.service";
import { cakePaidMessage } from "../cake-shipping";
import { cakeCustomerMemory } from "../cake-customer-memory";
import { CakeConsultationSessionModel } from "../../model/cake-customer-memory.model";
import { geminiChatService } from "../gemini/chat.service";
import { cakeOrderConfirmation, type CakeConfirmationDecision } from "../cake-order-confirmation";
import { isCakeSummaryConfirmation } from "../cake-price-catalog";
import { companyTelegramOrderService } from "../company-telegram-order.service";

function query<T>(value: T) {
  const chain = { lean: async () => value, select: () => chain, sort: () => chain, limit: () => chain };
  return chain;
}
const details = { groupId: "TIM", name: "Bánh trái tim", size: "18", height: 10, budget: 0, packQuantity: 0,
  customerName: "Mai", customerPhone: "0901234567", pickupLocation: "Chi nhánh A", pickupAt: "2099-10-20T17:30",
  inscription: "Mừng sinh nhật", decoration: "Kem trắng", quantity: 1, imageUrl: "", wantsOrder: true, needsStaff: false,
  cakeType: "Kem tươi", fulfillmentMethod: "pickup" as const, adviceOnly: false };

function setup(t: TestContext) {
  t.mock.method(cakeCustomerMemory, "refreshPurchases", async () => undefined);
  t.mock.method(companyTelegramOrderService, "notifyMessengerOrder", async () => ({ status: "skipped" as const }));
  const config = { enabled: true, depositEnabled: true, depositPercent: 30, qrBankId: "970422",
    qrAccountNumber: "123456789", qrAccountName: "SHOP TEST", accountNumbers: ["123456789"], paymentCodePrefix: "DH" };
  const draft = new CakeCheckoutModel({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV" });
  const state = { output: { ...details }, latestId: "m1", aiCalls: 0, createdOrders: 0,
    confirmationDecision: undefined as CakeConfirmationDecision | undefined,
    confirmationInputs: [] as Array<Parameters<typeof cakeOrderConfirmation.classify>[0]> };
  t.mock.method(cakeOrderConfirmation, "classify", async (input: Parameters<typeof cakeOrderConfirmation.classify>[0]) => {
    state.confirmationInputs.push(input);
    return state.confirmationDecision || {
      intent: isCakeSummaryConfirmation(input.message) ? "confirm_order" : "change_order",
      confidence: "high", target: "whole_order", changesRequested: !isCakeSummaryConfirmation(input.message),
      evidence: input.message, clarification: "",
    };
  });
  let order: InstanceType<typeof MessengerOrderModel> | null = null;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey; });
  t.mock.method(globalThis, "fetch", async () => {
    state.aiCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(state.output) } }] }), { status: 200 });
  });
  t.mock.method(CompanyModel, "findOne", () => query({ sepayConfig: config }));
  t.mock.method(SocialIntegrationModel, "findOne", () => query({ _id: "integration", companyCode: "TEST", orderSheetConfig: { enabled: true } }));
  t.mock.method(FBConversationModel, "findOne", () => query({ pageId: "PAGE" }));
  t.mock.method(FBMessageModel, "find", () => query([]));
  t.mock.method(FBMessageModel, "findOne", () => query({ messageId: state.latestId, direction: "inbound" }));
  t.mock.method(AIKnowledgeDocumentModel, "find", (filter: Record<string, unknown>) => {
    assert.equal(filter.companyCode, "TEST");
    assert.ok(filter.$or, "Page scope is mandatory");
    return query([{ _id: "doc", version: 1 }]);
  });
  t.mock.method(AIKnowledgeChunkModel, "find", (filter: Record<string, unknown>) => {
    assert.equal(filter.companyCode, "TEST"); assert.ok(filter.$and);
    return query([{ text: "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 18cm cao 7cm giá 270k, size 18cm cao 10cm giá 330k." }]);
  });
  t.mock.method(CakeCheckoutModel, "findOne", async () => draft);
  t.mock.method(CakeCheckoutModel, "findOneAndUpdate", async () => draft);
  t.mock.method(CakeCheckoutModel, "exists", async () => ({ _id: draft._id }));
  t.mock.method(CakeCheckoutModel, "updateOne", async (_filter: unknown, update: { $set?: { summarySentAt?: Date } }) => {
    if (update.$set?.summarySentAt) draft.summarySentAt = update.$set.summarySentAt;
    return { modifiedCount: 1 };
  });
  t.mock.method(draft, "save", async () => draft);
  t.mock.method(MessengerOrderModel, "findOne", async () => order);
  t.mock.method(MessengerOrderModel, "findOneAndUpdate", async () => null);
  t.mock.method(MessengerOrderModel, "create", async (value: Record<string, unknown>) => {
    state.createdOrders++;
    order = new MessengerOrderModel(value);
    return order;
  });
  t.mock.method(MessengerOrderModel, "updateOne", async (_filter: unknown, update: { $set?: { paymentRequestStatus?: string } }) => {
    if (order && update.$set?.paymentRequestStatus) order.paymentRequestStatus = "superseded";
    return { modifiedCount: 1 };
  });
  const run = async (message: string, id: string, businessContext?: string) => {
    state.latestId = id;
    return cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: id, message, imageUrls: [], businessContext });
  };
  return { draft, config, state, run, getOrder: () => order };
}

test("live short replies with synthetic customer data", { skip: process.env.CAKE_LIVE_TEST !== "1", timeout: 600000 }, async t => {
  const liveFetch = globalThis.fetch;
  const liveClassify = cakeOrderConfirmation.classify;
  const key = process.env.OPENROUTER_API_KEY;
  assert.ok(key);
  const s = setup(t);
  t.mock.method(cakeOrderConfirmation, "classify", liveClassify);
  process.env.OPENROUTER_API_KEY = key;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname, "openrouter.ai");
    return liveFetch(input, init);
  });
  const catalog = "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 18cm cao 7cm giá 270k, size 18cm cao 10cm giá 330k, size 22cm cao 7cm giá 380k.";
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text: catalog }]));
  const rows: Array<{ direction: string; text: string }> = [];
  t.mock.method(FBMessageModel, "find", () => query([...rows].reverse()));
  const photo = "https://res.cloudinary.com/test/image/upload/fixture-cake.jpg";
  s.draft.details = { ...details, imageUrl: photo, size: "", height: null, name: "", quantity: 0, cakeType: "",
    customerName: "", customerPhone: "", inscription: "", decoration: "", pickupAt: "", pickupLocation: "", fulfillmentMethod: "" };
  s.draft.imageObservation = { status: "ready", description: "Một bánh trái tim màu hồng, ảnh mẫu khách đã chọn." };
  const messages = ["380k nhé", "1", "tại quán", "Khách thử 0900000001", "chúc mừng sinh nhật Tuna, ngày 15/10/2099, chi nhánh Bắc Ninh", "15h", "ảnh trên đó", "không ghi chữ nữa", "16h nhé", "xác nhận", "ck rồi"];
  const failures: string[] = [];
  for (const [index, message] of messages.entries()) {
    const history = rows.map(row => ({ sender: row.direction === "inbound" ? "user" : "model", text: row.text }));
    rows.push({ direction: "inbound", text: message });
    s.state.latestId = `live-${index}`;
    const result = await cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV",
      messageId: s.state.latestId, message, imageUrls: [], customerAddressStyle: "bạn",
      businessContext: "Tự xưng mình, gọi khách bạn. Chi nhánh Bắc Ninh có nhận tại quán. Không hỏi chất bánh." });
    assert.ok(result);
    let answer = result.text;
    if (result.consultationContext) {
      const generated = await geminiChatService.chat(message, history, {
        customerAddressStyle: "bạn", advancedInstructions: `Tự xưng mình, gọi khách bạn.\n${cakeConversationInstructions}`,
      }, { contextText: `${catalog}\nChi nhánh Bắc Ninh có nhận tại quán.\nThông tin đơn đang tư vấn: ${result.consultationContext}` }).catch(error => {
        console.log("LIVE_REVIEW_FALLBACK", JSON.stringify({ message, error: String(error) }));
        return result;
      });
      assert.equal(generated.isMock, false);
      answer = result.wordingSource && !preservesCakeReplyFacts(result.wordingSource, generated.text) ? result.text : generated.text;
    }
    rows.push({ direction: "outbound", text: answer });
    await cakeCheckoutService.markDelivered(result);
    console.log("LIVE_CASE", JSON.stringify({ message, answer, state: s.draft.state, details: s.draft.details, hasQr: !!result.qrUrl }));
    try {
      assert.equal(s.draft.details?.imageUrl, photo);
      if (index === 0) assert.equal(s.draft.details?.budget, 380000);
      if (index >= 1) assert.equal(s.draft.details?.quantity, 1);
      if (index >= 2) assert.equal(s.draft.details?.fulfillmentMethod, "pickup");
      if (index === 2 || index === 3) { assert.equal(s.draft.details?.pickupLocation, ""); assert.doesNotMatch(answer, /Bắc Ninh/i); }
      if (index >= 3) assert.equal(s.draft.details?.customerPhone, "0900000001");
      if (index === 4) assert.equal(s.draft.details?.pickupAt, "2099-10-15");
      if (index === 5) assert.equal(s.draft.details?.pickupAt, "2099-10-15T15:00");
      if (index === 6) assert.equal(s.draft.state, "awaiting_confirmation");
      if (index === 7) assert.match(s.draft.details?.inscription || "", /không ghi/i);
      if (index === 8) assert.equal(s.draft.details?.pickupAt, "2099-10-15T16:00");
      if (index === 9) assert.ok(result.qrUrl);
      if (index === 10) {
        assert.equal(result.qrUrl, undefined);
        assert.equal(s.draft.state, "payment_pending");
        assert.equal(result.isSummary, undefined);
      }
    } catch (error) { failures.push(`${message}: ${String(error)}`); }
  }
  assert.deepEqual(failures, []);
});

test("contextual confirmation decisions gate the frozen order and avoid repeating unchanged summaries", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "context-summary");
  assert.ok(summary?.isSummary);
  await cakeCheckoutService.markDelivered(summary!);
  const originalSnapshot = JSON.stringify(s.draft.snapshot);
  const originalRevision = s.draft.revision;
  const cases: Array<{ message: string; decision: CakeConfirmationDecision }> = [
    { message: "khác chút", decision: { intent: "unclear", confidence: "low", target: "unclear", changesRequested: false,
      evidence: "khác chút", clarification: "Bạn muốn đổi phần nào của bánh nhỉ?" } },
    { message: "ok", decision: { intent: "acknowledge_detail", confidence: "high", target: "detail", changesRequested: false,
      evidence: "ok", clarification: "Vậy mình giữ giờ nhận bánh nhé." } },
    { message: "cọc bao nhiêu?", decision: { intent: "question", confidence: "high", target: "detail", changesRequested: false,
      evidence: "cọc bao nhiêu", clarification: "" } },
    { message: "được", decision: { intent: "confirm_order", confidence: "low", target: "whole_order", changesRequested: false,
      evidence: "được", clarification: "Bạn đang đồng ý phần nào nhỉ?" } },
    { message: "ok nhưng đổi giờ", decision: { intent: "confirm_order", confidence: "high", target: "whole_order", changesRequested: true,
      evidence: "ok", clarification: "Bạn muốn nhận lúc mấy giờ nhỉ?" } },
  ];
  for (const [index, item] of cases.entries()) {
    s.state.confirmationDecision = item.decision;
    const result = await s.run(item.message, `context-${index}`);
    assert.equal(result?.isSummary, undefined);
    assert.equal(result?.qrUrl, undefined);
    assert.ok(result?.consultationContext);
    assert.doesNotMatch(result!.text, /Tổng tiền:|SĐT:|xác nhận lại thông tin/);
    assert.equal(s.draft.state, "awaiting_confirmation");
    assert.equal(s.draft.revision, originalRevision);
    assert.equal(JSON.stringify(s.draft.snapshot), originalSnapshot);
    assert.equal(s.state.createdOrders, 0);
  }
  s.state.confirmationDecision = { intent: "confirm_order", confidence: "high", target: "whole_order", changesRequested: false,
    evidence: "chị lấy như trên nhé", clarification: "" };
  const confirmed = await s.run("chị lấy như trên nhé", "context-confirm");
  assert.ok(confirmed?.qrUrl);
  assert.equal(s.state.createdOrders, 1);
  assert.equal(s.draft.state, "payment_pending");
});

test("a contextual approval with a changed time requires a revised summary before QR", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "time-summary");
  await cakeCheckoutService.markDelivered(summary!);
  s.state.confirmationDecision = { intent: "change_order", confidence: "high", target: "detail", changesRequested: true,
    evidence: "16h", clarification: "" };
  s.state.output.pickupAt = "2099-10-20T16:00";
  const revised = await s.run("ừ nhưng đổi sang 16h nhé", "time-change");
  assert.equal(revised?.qrUrl, undefined);
  assert.equal(revised?.isSummary, true);
  assert.equal(s.draft.snapshot!.details.pickupAt, "2099-10-20T16:00");
  assert.equal(s.draft.summarySentAt, undefined);
  assert.equal(s.state.createdOrders, 0);
});

test("production confirmation context tracks the latest shop topic without sending stored identity", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "topic-summary");
  await cakeCheckoutService.markDelivered(summary!);
  let shopText = summary!.text;
  t.mock.method(FBMessageModel, "find", () => query([{ direction: "outbound", text: shopText }]));
  s.state.confirmationDecision = { intent: "unclear", confidence: "low", target: "unclear", changesRequested: false,
    evidence: "cái đó", clarification: "Bạn đang nói phần nào nhỉ?" };
  await s.run("cái đó", "topic-unclear");
  assert.equal(s.state.confirmationInputs.at(-1)?.lastShopTurn, "summary");
  shopText = "Bạn muốn nhận lúc mấy giờ ạ?";
  s.state.confirmationDecision = { intent: "acknowledge_detail", confidence: "high", target: "detail", changesRequested: false,
    evidence: "ok", clarification: "" };
  const result = await s.run("ok", "topic-ack");
  const sentContext = s.state.confirmationInputs.at(-1)!;
  assert.equal(sentContext.lastShopTurn, "detail_question");
  assert.equal(sentContext.topic, "time");
  assert.doesNotMatch(JSON.stringify(sentContext), /Mai|0901234567|Chi nhánh A|Mừng sinh nhật/);
  assert.equal(result?.qrUrl, undefined);
  assert.equal(result?.isSummary, undefined);
  assert.doesNotMatch(result!.text, /nói rõ hơn|Tổng tiền/);
  assert.equal(s.draft.state, "awaiting_confirmation");
});

test("short payment reports retain the confirmed order without asking to confirm again", async t => {
  const s = setup(t);
  const summary = await s.run("Đặt bánh", "short-summary");
  assert.ok(summary?.isSummary);
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận", "short-confirm");
  const callsBefore = s.state.aiCalls;
  for (const [index, message] of ["ck rồi", "ck xong", "chuyển khoản rồi", "cọc xong"].entries()) {
    const result = await s.run(message, `short-paid-${index}`);
    assert.equal(s.draft.state, "payment_pending");
    assert.equal(result?.isSummary, undefined);
    assert.equal(result?.qrUrl, undefined);
    assert.match(result!.text, /khi nhận được tiền cọc/);
  }
  assert.equal(s.state.aiCalls, callsBefore);
});

test("summary must be delivered and explicitly confirmed before generating a frozen deposit QR", async t => {
  const s = setup(t);
  const summary = await s.run("Đặt bánh trái tim 18cm cao 10cm", "m1");
  assert.equal(summary?.isSummary, true);
  assert.equal(summary?.qrUrl, undefined);
  assert.equal(s.state.createdOrders, 0);
  assert.match(summary!.text, /330.000đ/);
  assert.match(summary!.text, /99.000đ/);
  assert.match(summary!.text, /231.000đ/);
  await s.run("xác nhận chốt đơn", "m2"); // Summary not delivered yet.
  assert.equal(s.state.createdOrders, 0);
  await cakeCheckoutService.markDelivered({ ...summary!, revision: s.draft.revision });
  s.config.depositPercent = 50; // Snapshot must retain the confirmed 30%.
  const payment = await s.run("xác nhận chốt đơn", "m3");
  assert.equal(s.state.createdOrders, 1);
  assert.equal(new URL(payment!.qrUrl!).searchParams.get("amount"), "99000");
  assert.equal(s.getOrder()!.checkoutSnapshot!.depositPercent, 30);
  assert.equal(s.getOrder()!.depositStatus, "awaiting_receipt");
  assert.equal(s.getOrder()!.status, "confirmed");
  const again = await s.run("xác nhận chốt đơn", "m3");
  assert.equal(again?.qrUrl, payment?.qrUrl);
  assert.equal(s.state.createdOrders, 1);
});

test("cake ordering remains available when the shop has disabled deposits", async t => {
  const s = setup(t);
  s.config.depositEnabled = false;
  const summary = await s.run("Đặt bánh trái tim 18cm cao 10cm", "no-deposit-summary");
  assert.equal(summary?.isSummary, true);
  assert.equal(s.draft.snapshot?.deposit, 0);
  assert.match(summary!.text, /Đơn này không yêu cầu đặt cọc/);
  await cakeCheckoutService.markDelivered(summary!);

  const confirmation = await s.run("xác nhận chốt đơn", "no-deposit-confirm");

  assert.equal(s.state.createdOrders, 1);
  assert.equal(confirmation?.qrUrl, undefined);
  assert.match(confirmation!.text, /đơn bánh đã được xác nhận/i);
  assert.doesNotMatch(confirmation!.text, /khách quen/);
  assert.equal(s.getOrder()?.depositRequired, false);
  assert.equal(s.getOrder()?.depositStatus, "not_required");
});

test("ambiguous size or unmatched price asks the customer and cannot create a QR", async t => {
  const s = setup(t);
  s.state.output.height = 0;
  const result = await s.run("size 18", "m1");
  assert.match(result!.text, /270.000đ/);
  assert.match(result!.text, /330.000đ/);
  assert.equal(s.draft.state, "collecting");
  s.state.output.budget = 300000;
  await s.run("lấy bánh 300k", "m2");
  assert.equal(s.state.createdOrders, 0);
  assert.equal(s.draft.snapshot, undefined);
});

test("changing size invalidates both old confirmation and old payment code", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "m1");
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận chốt đơn", "m2");
  s.state.output.height = 7;
  const revised = await s.run("đổi sang cao 7cm", "m3");
  assert.equal(s.getOrder()!.paymentRequestStatus, "superseded");
  assert.equal(revised?.isSummary, true);
  assert.equal(revised?.qrUrl, undefined);
  assert.equal(s.draft.summarySentAt, undefined);
  assert.equal(s.draft.snapshot!.total, 270000);
});

test("requests outside the price sheet remain in staff review on a subsequent confirmation", async t => {
  const s = setup(t);
  s.state.output.needsStaff = true;
  await s.run("làm ba tầng và giao hàng", "m1");
  assert.equal(s.draft.state, "manual_review");
  const result = await s.run("xác nhận chốt đơn", "m2");
  assert.equal(result?.qrUrl, undefined);
  assert.equal(s.state.createdOrders, 0);
  assert.equal(s.state.aiCalls, 2, "Re-read the customer's follow-up instead of locking the conversation");
  assert.ok(result?.consultationContext);
});

test("contact details are requested together and known fields are not requested again", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { customerName: "", customerPhone: "", customerAddress: "anh", sellerAddress: "em" });
  const first = await s.run("Anh lấy bánh này", "m1");
  assert.match(first!.text, /tên người nhận và số điện thoại/);
  assert.ok(first?.wordingSource && first.consultationContext, "Use conversational wording for collection");
  s.state.output.customerName = "Khách kiểm thử";
  const next = await s.run("Tên anh là Khách kiểm thử", "m2");
  assert.match(next!.text, /số điện thoại/);
  assert.doesNotMatch(next!.text, /tên người nhận|anh chị/);
  assert.equal(s.state.createdOrders, 0);
});

test("shipping follow-ups preserve the address and continue consultation without a false handoff", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { needsStaff: false, reviewReason: "delivery", fulfillmentMethod: "delivery", deliveryAddress: "Số 1 Lạc Long Quân", pickupLocation: "", pickupAt: "" });
  const first = await s.run("Shop có ship không, anh bị đau chân. Số 1 Lạc Long Quân nhé", "m1");
  assert.match(first!.text, /ngày.*giờ/);
  assert.doesNotMatch(first!.text, /xin.*địa chỉ|chuyển shop|chưa chuyển tiền/);
  const next = await s.run("Giờ làm sao?", "m2");
  assert.ok(next?.consultationContext);
  assert.equal(JSON.parse(next!.consultationContext!).details.deliveryAddress, "Số 1 Lạc Long Quân");
  assert.equal(next?.qrUrl, undefined);
  assert.equal(s.state.createdOrders, 0, "Delivery checkout is still unsupported; do not pretend it is complete");
});

test("known pickup details and inscription produce a summary without more collection questions", async t => {
  const s = setup(t);
  const result = await s.run("Mai, 0901234567, lấy Chi nhánh A ngày 20/10/2099 lúc 17:30, ghi Mừng sinh nhật, kem trắng", "m1");
  assert.equal(result?.isSummary, true);
  assert.match(result!.text, /Mừng sinh nhật/);
  assert.doesNotMatch(result!.text, /xin tên|xin số điện thoại|muốn nhận bánh ngày nào/);
  assert.equal(result?.wordingSource, undefined, "Keep payment summary outside free wording");
  assert.equal(s.state.createdOrders, 0);
});

test("wording guard rejects changed prices, missing sizes and extra numbers", () => {
  const source = "Bánh size 14cm, cao 7cm — 180.000đ";
  assert.equal(preservesCakeReplyFacts(source, "Dạ size 14cm, cao 7cm giá 180.000đ ạ."), true);
  assert.equal(preservesCakeReplyFacts(source, "Dạ size 14cm, cao 7cm giá 100.000đ ạ."), false);
  assert.equal(preservesCakeReplyFacts(source, "Dạ giá 180.000đ ạ."), false);
  assert.equal(preservesCakeReplyFacts(source, `${source}, ship 30.000đ`), false);
  assert.equal(preservesCakeReplyFacts("14cm 180.000đ; 18cm 270.000đ", "14cm 270.000đ; 18cm 180.000đ"), false);
});

test("order preview extracts choices and checks the catalogue without saving, uploading or creating payment", async t => {
  const s = setup(t);
  t.mock.method(CakeCheckoutModel, "findOne", () => query(s.draft));
  const save = t.mock.method(s.draft, "save", async () => { throw new Error("Preview cannot save"); });
  const create = t.mock.method(MessengerOrderModel, "create", async () => { throw new Error("Preview cannot create an order"); });
  const lease = t.mock.method(CakeCheckoutModel, "findOneAndUpdate", async () => { throw new Error("Preview cannot acquire a write lease"); });
  const upload = t.mock.method(cloudinaryService, "uploadMediaBuffer", async () => { throw new Error("Preview cannot upload images"); });
  const before = JSON.stringify(s.draft.toObject());
  const result = await cakeCheckoutService.preview({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV",
    messageId: "preview", message: "Lấy size 18 cao 10", imageUrls: [], visualMode: true });
  assert.equal(result?.dryRun, true);
  assert.equal(result?.requiresConfirmation, true);
  assert.equal(result?.matchedVariants[0]?.price, 330000);
  assert.equal(JSON.stringify(s.draft.toObject()), before);
  for (const mock of [save, create, lease, upload]) assert.equal(mock.mock.callCount(), 0);
});

test("a readable new design with unknown shape does not inherit a previous price group", async t => {
  const s = setup(t);
  s.draft.details = { ...details, imageUrl: "https://res.cloudinary.com/test/old.jpg" };
  s.state.output = { ...details, adviceOnly: true };
  const photo = "https://res.cloudinary.com/test/new.jpg";
  const result = await cakeCheckoutService.process({
    companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: "m1",
    message: "Chỗ này thay bằng ảnh giúp em", imageUrls: [photo], visualMode: true,
    observation: { status: "ready", description: "Mẫu trắng và vùng đánh dấu, chưa xác định hình dạng",
      cakeShape: "unknown", shapeConfidence: "low", selectedImageUrl: photo,
      visualContext: { version: 1, readable: true, needsSelection: false, selectedImageId: "new", summary: "Mẫu mới",
        facts: [], customerRequests: [{ detail: "Thay vùng đánh dấu bằng ảnh", sourceMessageId: "m1" }], uncertainties: ["Hình dạng"] } },
  });
  assert.ok(result?.consultationContext);
  assert.equal(s.draft.details?.groupId, "");
  assert.doesNotMatch(result!.text, /330|270|hình tròn, trái tim/);
  assert.equal(s.state.createdOrders, 0);
});

test("delivery ignores fee documents and charges cake only, preserving booking preference", async t => {
  const s = setup(t);
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text:
    "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 18cm cao 10cm giá 330k.\n"
    + "Dòng 3: Khu vực giao: phường thử A | Phí giao (VND): 30000\n"
    + "Dòng 4: Khu vực giao: phường thử B | Phí giao (VND): 50000" }]));
  Object.assign(s.state.output, { fulfillmentMethod: "delivery", deliveryBooking: "customer", deliveryAddress: "1 Đường thử, phường thử A", pickupLocation: "" });
  const summary = await s.run("Giao đến phường thử A nhé", "m1");
  assert.equal(summary?.isSummary, true);
  assert.equal(s.draft.snapshot?.subtotal, 330000);
  assert.equal(s.draft.snapshot?.shippingFee, 0);
  assert.equal(s.draft.snapshot?.total, 330000);
  assert.equal(s.draft.snapshot?.deposit, 99000);
  assert.equal(s.draft.snapshot?.balance, 231000);
  assert.match(summary!.text, /Khách tự book xe/);
  assert.doesNotMatch(summary!.text, /Phí giao:|miễn phí/);
  await cakeCheckoutService.markDelivered(summary!);
  const qr = await s.run("xác nhận chốt đơn", "m2");
  assert.equal(new URL(qr!.qrUrl!).searchParams.get("amount"), "99000");
  assert.equal(s.getOrder()?.fulfillmentMethod, "delivery");
  assert.equal(s.getOrder()?.items[0].lineTotal, 330000);
  assert.equal(s.getOrder()?.shippingFee, 0);
  assert.match(s.getOrder()!.customerNote!, /Khách tự book xe/);
  Object.assign(s.state.output, { deliveryAddress: "2 Đường thử, phường thử B" });
  const revised = await s.run("Đổi sang địa chỉ phường thử B", "m3");
  assert.equal(s.getOrder()?.paymentRequestStatus, "superseded");
  assert.equal(revised?.qrUrl, undefined);
  assert.equal(s.draft.summarySentAt, undefined);
  assert.equal(s.draft.snapshot?.total, 330000);
});

test("missing shipping rates do not block cake summary or deposit QR", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { fulfillmentMethod: "delivery", deliveryAddress: "1 Đường thử, phường ngoài vùng", pickupLocation: "" });
  const response = await s.run("Giao tận nơi nhé", "m1");
  assert.equal(response?.isSummary, true);
  assert.equal(s.draft.snapshot?.total, 330000);
  assert.equal(s.state.createdOrders, 0);
  await cakeCheckoutService.markDelivered(response!);
  const payment = await s.run("xác nhận chốt đơn", "m2");
  assert.equal(new URL(payment!.qrUrl!).searchParams.get("amount"), "99000");
  assert.match(payment!.text, /Phí vận chuyển khách thanh toán riêng/);
});

test("an unpaid QR with an elapsed pickup date requires fresh confirmation", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "m1");
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận chốt đơn", "m2");
  s.draft.snapshot!.details.pickupAt = "2020-01-01T10:00";
  const refreshed = await s.run("gửi lại mã cọc", "m3");
  assert.equal(s.getOrder()?.paymentRequestStatus, "superseded");
  assert.equal(refreshed?.qrUrl, undefined);
});

test("old unpaid QR with shipping requires a fresh cake-only summary", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "m1");
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận chốt đơn", "m2");
  Object.assign(s.draft.snapshot!, { shippingFee: 30000, total: 360000, balance: 261000 });
  const refreshed = await s.run("xác nhận chốt đơn", "m3");
  assert.equal(s.getOrder()?.paymentRequestStatus, "superseded");
  assert.equal(refreshed?.isSummary, true);
  assert.equal(refreshed?.qrUrl, undefined);
  assert.equal(s.draft.snapshot?.total, 330000);
  assert.equal(s.draft.snapshot?.balance, 231000);
});

test("already paid orders retain their historical shipping and totals", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "m1");
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận chốt đơn", "m2");
  Object.assign(s.draft.snapshot!, { shippingFee: 30000, total: 360000, balance: 261000 });
  s.getOrder()!.depositStatus = "verified";
  const paid = await s.run("đã chuyển cọc", "m3");
  assert.equal(s.getOrder()?.paymentRequestStatus, "active");
  assert.equal(s.draft.snapshot?.total, 360000);
  assert.equal(s.draft.snapshot?.balance, 261000);
  assert.match(paid!.text, /nhận được tiền cọc rồi/);
  assert.doesNotMatch(paid!.text, /261.000đ|Tổng tiền:|Phí giao/);
  assert.equal(paid?.qrUrl, undefined);
});

test("shop booking preference is saved without adding a shipping charge", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { fulfillmentMethod: "delivery", deliveryBooking: "shop", deliveryAddress: "Địa chỉ thử", pickupLocation: "" });
  const summary = await s.run("Nhờ tiệm book xe hộ", "m1");
  assert.match(summary!.text, /nhờ tiệm hỗ trợ book/);
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận chốt đơn", "m2");
  assert.match(s.getOrder()!.customerNote!, /nhờ tiệm book hộ/);
  assert.equal(s.getOrder()?.totalAmount, 330000);
});

test("a shipping policy question keeps the unpaid QR, but changing the phone invalidates it", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "m1");
  await cakeCheckoutService.markDelivered(summary!);
  await s.run("xác nhận chốt đơn", "m2");
  s.state.output.adviceOnly = true;
  const advice = await s.run("Shop có ship không?", "m3");
  assert.ok(advice?.consultationContext);
  assert.equal(s.getOrder()?.paymentRequestStatus, "active");
  assert.equal(s.draft.state, "payment_pending");
  s.state.output.adviceOnly = false;
  s.state.output.customerPhone = "0900000001";
  const amended = await s.run("0900000001", "m4");
  assert.equal(s.getOrder()?.paymentRequestStatus, "superseded");
  assert.equal(amended?.isSummary, true);
  assert.equal(amended?.qrUrl, undefined);
});

test("optional cake type does not block checkout and mousse never uses ordinary cake prices", async t => {
  const s = setup(t);
  s.state.output.cakeType = "";
  const ask = await s.run("Theo ảnh này nhé", "m1");
  assert.doesNotMatch(ask!.text, /chất bánh/);
  assert.equal(ask?.isSummary, true);
  s.state.output.cakeType = "Mousse";
  const mismatch = await s.run("Lấy mousse nhé", "m2");
  assert.equal(mismatch?.isSummary, undefined);
  assert.doesNotMatch(mismatch!.text, /330.000/);
});

test("sample follow-ups retain the photo and available-size questions stay in consultation", async t => {
  const s = setup(t);
  s.draft.details = { ...details, imageUrl: "https://res.cloudinary.com/test/image/upload/cake.jpg" };
  s.draft.imageObservation = { status: "ready", description: "Một bánh trái tim" };
  s.state.output.cakeType = "";
  s.state.output.size = "";
  s.state.output.height = 0;
  const sizes = await s.run("có những size nào", "m1");
  assert.ok(sizes?.consultationContext);
  const context = JSON.parse(sizes!.consultationContext!);
  assert.equal(context.hasSelectedSample, true);
  assert.deepEqual(context.catalog.map((v: { price: number }) => v.price), [270000, 330000]);
  assert.equal(sizes?.isSummary, undefined);
  assert.doesNotMatch(sizes!.text, /chất bánh|ưng ý thì gửi/);
  assert.match(sizes!.text, /270.000đ/);
  assert.match(sizes!.text, /330.000đ/);
  Object.assign(s.state.output, { newOrder: true, groupId: "" });
  const reminder = await s.run("ảnh trên hình kìa", "m2");
  assert.equal(s.draft.details?.imageUrl, "https://res.cloudinary.com/test/image/upload/cake.jpg");
  assert.equal(s.draft.details?.groupId, "TIM");
  assert.doesNotMatch(reminder!.text, /đã có mẫu|chất bánh/);
  assert.equal(s.state.createdOrders, 0);
  t.diagnostic(`Hỏi size → ${sizes!.text} [chuyển tư vấn với 18cm cao 7cm: 270.000đ; cao 10cm: 330.000đ]`);
  t.diagnostic(`Nhắc ảnh → ${reminder!.text}`);
});

test("photo pricing discards a conflicting cake group and only offers sizes for the observed body shape", async t => {
  const s = setup(t);
  s.state.output.adviceOnly = true;
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text:
    "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 18cm cao 7cm giá 270k, size 18cm cao 10cm giá 330k.\n"
    + "Dòng 3: Mã nhóm: ROUND | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Size 10cm giá 100k, size 14cm cao 7cm giá 180k." }]));
  const result = await cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV",
    messageId: "m1", message: "vậy mẫu gửi này giá bao nhiêu", imageUrls: ["https://res.cloudinary.com/test/image/upload/round-cake.jpg"],
    observation: { status: "ready", description: "Thân bánh tròn màu vàng, nơ đỏ trên đế chữ nhật.", cakeShape: "round", shapeConfidence: "high" } });
  assert.equal(s.draft.details?.groupId, "ROUND");
  assert.equal(s.draft.details?.size, "");
  assert.match(result!.text, /Bánh tròn/);
  assert.match(result!.text, /100.000đ/);
  assert.doesNotMatch(result!.text, /trái tim|270.000đ|330.000đ/);
  assert.equal(result?.qrUrl, undefined);
  assert.equal(s.state.createdOrders, 0);
});

test("an unreadable new sample cannot quote the previous cake through the advice branch", async t => {
  const s = setup(t);
  s.draft.details = { ...details, imageUrl: "https://res.cloudinary.com/test/image/upload/old.jpg" };
  s.state.output.adviceOnly = true;
  const result = await cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: "m1",
    message: "bánh này thì sao nhỉ giá bao nhiêu", imageUrls: ["https://res.cloudinary.com/test/image/upload/new.jpg"],
    observation: { status: "unavailable", cakeShape: "unknown", shapeConfidence: "low", reason: "uncertain_shape", description: "Chưa rõ hình dạng" } });
  assert.match(result!.text, /xác nhận.*hình tròn, trái tim/);
  assert.doesNotMatch(result!.text, /270|330|bảng giá/);
  assert.equal(result?.consultationContext, undefined);
  assert.equal(result?.qrUrl, undefined);
  assert.equal(s.draft.details?.groupId, "");
  assert.equal(s.draft.details?.imageUrl, "https://res.cloudinary.com/test/image/upload/new.jpg");
  assert.equal(s.state.aiCalls, 0);
  assert.equal(s.state.createdOrders, 0);
  const confirmation = await s.run("trái tim nha", "m2");
  assert.equal(s.draft.imageObservation?.cakeShape, "heart");
  assert.equal(s.draft.details?.groupId, "TIM");
  assert.doesNotMatch(confirmation!.text, /xác nhận.*hình tròn, trái tim/);
  const price = await s.run("giá bao nhiêu", "m3");
  assert.match(price!.text, /270.000đ|330.000đ/);
  assert.doesNotMatch(price!.text, /xác nhận.*hình tròn, trái tim/);
});

test("a new heart sample overrides round extraction and retains its shape on later size advice", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { groupId: "ROUND", name: "Bánh tròn", cakeType: "", adviceOnly: true });
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text:
    "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 18cm cao 7cm giá 270k, size 18cm cao 10cm giá 330k.\n"
    + "Dòng 3: Mã nhóm: ROUND | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: Size 10cm giá 100k." }]));
  const imageUrl = "https://res.cloudinary.com/test/image/upload/heart.jpg";
  const result = await cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: "m1",
    message: "bánh khác này giá bao nhiêu", imageUrls: [imageUrl, "https://res.cloudinary.com/test/image/upload/repeated.jpg"],
    observation: { status: "ready", cakeShape: "heart", shapeConfidence: "high", description: "Thân bánh trái tim", selectedImageUrl: imageUrl } });
  assert.equal(s.draft.details?.groupId, "TIM");
  assert.equal(s.draft.details?.imageUrl, imageUrl);
  assert.match(result!.text, /Bánh trái tim/);
  assert.doesNotMatch(result!.text, /Bánh tròn|100.000/);
  const followup = await s.run("có những size nào", "m2");
  assert.equal(s.draft.details?.groupId, "TIM");
  assert.match(followup!.text, /Bánh trái tim/);
  assert.doesNotMatch(followup!.text, /Bánh tròn|100.000/);
  assert.equal(s.state.createdOrders, 0);
});

test("show customer questions through summary and deposit without requiring cake type", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { cakeType: "", customerName: "", customerPhone: "", inscription: "", pickupAt: "", pickupLocation: "", fulfillmentMethod: "" });
  const collect = await s.run("Bánh trái tim 18cm cao 10cm nhé", "m1");
  assert.doesNotMatch(collect!.text, /chất bánh/);
  assert.match(collect!.text, /tên người nhận/);
  t.diagnostic(`Chọn size → ${collect!.text}`);
  Object.assign(s.state.output, { ...details, cakeType: "" });
  const summary = await s.run("Mai, 0901234567, ghi Mừng sinh nhật, nhận tại chi nhánh A ngày 20/10/2099 lúc 17:30", "m2");
  assert.equal(summary?.isSummary, true);
  assert.doesNotMatch(summary!.text, /chất bánh/i);
  t.diagnostic(`Đủ thông tin → ${summary!.text}`);
  await cakeCheckoutService.markDelivered(summary!);
  const qr = await s.run("Xác nhận chốt đơn", "m3");
  assert.ok(qr?.qrUrl);
  assert.equal(new URL(qr!.qrUrl!).searchParams.get("amount"), "99000");
  t.diagnostic(`Xác nhận → ${qr!.text}`);
});

test("advice questions remain consultation and do not confirm a suggested size", async t => {
  const s = setup(t);
  s.state.output.adviceOnly = true;
  const result = await s.run("4 đến 5 người thì chọn size nào?", "m1");
  assert.ok(result?.consultationContext);
  assert.equal(result?.wordingSource, undefined);
  assert.equal(result?.isSummary, undefined);
  assert.equal(s.state.createdOrders, 0);
});

test("capacity questions answer the configured serving range even when the extractor attempts checkout", async t => {
  const s = setup(t);
  s.state.output.adviceOnly = false;
  const policy = "Có 6 đến 7 người thì bánh 270k. Có 7 đến 8 người thì bánh 330k.";
  const result = await s.run("Lấy size 18\nCao 10cm\nSize đó mấy người ăn nhỉ", "serving-capacity", policy);
  assert.match(result!.text, /18cm.*10cm.*7–8 người/);
  assert.doesNotMatch(result!.text, /330|dự kiến|bao nhiêu người|tên người nhận|số điện thoại/);
  assert.ok(result?.wordingSource);
  assert.equal(result?.isSummary, undefined);
  assert.equal(s.state.createdOrders, 0);
});

test("capacity advice preserves a delivered summary and a pending payment request", async t => {
  const s = setup(t);
  const policy = "Có 7 đến 8 người thì bánh 330k.";
  const summary = await s.run("đặt bánh", "serving-summary", policy);
  await cakeCheckoutService.markDelivered(summary!);
  const revision = s.draft.revision;
  s.state.confirmationDecision = { intent: "question", confidence: "high", target: "detail", changesRequested: false,
    evidence: "mấy người", clarification: "" };
  const advice = await s.run("Size đó mấy người ăn nhỉ", "serving-after-summary", policy);
  assert.match(advice!.text, /7–8 người/);
  assert.equal(s.draft.state, "awaiting_confirmation");
  assert.equal(s.draft.revision, revision);
  assert.equal(advice?.isSummary, undefined);
  s.state.confirmationDecision = undefined;
  await s.run("xác nhận", "serving-confirm", policy);
  const paidAdvice = await s.run("Size này bao nhiêu người ăn", "serving-after-qr", policy);
  assert.match(paidAdvice!.text, /7–8 người/);
  assert.equal(paidAdvice?.qrUrl, undefined);
  assert.equal(s.draft.state, "payment_pending");
  assert.equal(s.state.createdOrders, 1);
});

test("guest recommendations never store the suggested size or budget as a customer selection", async t => {
  const s = setup(t);
  Object.assign(s.state.output, { groupId: "TIM", name: "Bánh trái tim", size: "14", height: 7, budget: 180000, guestCount: 5, quantity: 1 });
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text: "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 14cm cao 7cm giá 180k, size 18cm cao 10cm giá 330k." }]));
  const result = await s.run("5 người thì nên đặt size nào?", "serving-recommend", "4 đến 5 người bánh 180k. 7 đến 8 người bánh 330k.");
  assert.match(result!.text, /5 người.*size 14cm.*180.000đ/);
  assert.equal(s.draft.details?.size, ""); assert.equal(s.draft.details?.budget, null);
  assert.equal(s.state.createdOrders, 0);
});

test("live serving advice with configurable rules and synthetic order data", {
  skip: process.env.CAKE_SERVING_LIVE_TEST !== "1", timeout: 180000,
}, async t => {
  const liveFetch = globalThis.fetch;
  const key = process.env.OPENROUTER_API_KEY;
  assert.ok(key);
  const s = setup(t); process.env.OPENROUTER_API_KEY = key;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname, "openrouter.ai");
    return liveFetch(input, init);
  });
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text: "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 14cm cao 7cm giá 180k, size 18cm cao 7cm giá 270k, size 18cm cao 10cm giá 330k." }]));
  const policy = "4 đến 5 người bánh 180k. 6 đến 7 người bánh 270k. 7 đến 8 người bánh 330k.";
  const style = "Tự xưng mình, gọi khách bạn.";
  for (const [index, message] of ["Size đó mấy người ăn nhỉ", "5 người thì nên chọn size nào?"].entries()) {
    s.draft.state = "collecting"; s.draft.snapshot = undefined;
    s.draft.details = { ...details, name: "", cakeType: "", customerName: "", customerPhone: "", pickupAt: "", pickupLocation: "", inscription: "", decoration: "", quantity: 0,
      size: index === 0 ? "18" : "", height: index === 0 ? 10 : null, budget: null, guestCount: 0 };
    const history = [{ sender: "user", text: "Bánh trái tim nhé" }, { sender: "model", text: index === 0 ? "Bạn chọn size 18cm cao 10cm." : "Bạn cần bánh cho khoảng mấy người?" }];
    const rows = history.map(row => ({ direction: row.sender === "user" ? "inbound" : "outbound", text: row.text }));
    t.mock.method(FBMessageModel, "find", () => query([...rows].reverse()));
    const result = await s.run(message, `live-serving-${index}`, `${style}\n${policy}`);
    assert.ok(result?.wordingSource);
    const generated = await geminiChatService.chat(message, history, { customerAddressStyle: "bạn",
      advancedInstructions: `${style}\n${policy}\n${cakeConversationInstructions}` }, { contextText: result.consultationContext });
    const answer = preservesCakeReplyFacts(result.wordingSource, generated.text) ? generated.text : result.text;
    console.log("LIVE_SERVING", JSON.stringify({ message, answer, usedFactFallback: answer !== generated.text, details: s.draft.details }));
    if (index === 0) { assert.match(answer, /7\s*[–-]\s*8\s*người/); assert.doesNotMatch(answer, /dự kiến|bao nhiêu người|330/); }
    else { assert.match(answer, /14\s*cm/); assert.match(answer, /180[.,]000/); assert.equal(s.draft.details?.size, ""); }
    assert.equal(result.isSummary, undefined); assert.equal(result.qrUrl, undefined);
  }
});

test("a new session archives the old draft and excludes its cake, image, dates and QR", async t => {
  const s = setup(t);
  await s.run("đặt bánh", "m1");
  s.draft.sessionId = "old-session";
  s.draft.details!.imageUrl = "https://res.cloudinary.com/test/old-cake.png";
  const archived: string[] = [];
  t.mock.method(cakeCustomerMemory, "archive", async (_scope, sessionId) => { archived.push(sessionId); });
  t.mock.method(cakeCustomerMemory, "learn", async () => undefined);
  t.mock.method(CakeConsultationSessionModel, "findOne", () => query(null));
  t.mock.method(FBMessageModel, "find", filter => {
    assert.equal(filter.consultationSessionId, "new-session"); return query([]);
  });
  Object.assign(s.state.output, { groupId: "", name: "", size: "", height: 0, budget: 0,
    customerName: "", customerPhone: "", pickupLocation: "", pickupAt: "", inscription: "", decoration: "", cakeType: "", fulfillmentMethod: "" });
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    const payload = JSON.parse(request.messages[1].content);
    assert.equal(payload.previous.imageUrl, "");
    assert.equal(payload.previous.size, "");
    assert.equal(payload.previous.pickupAt, "");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(s.state.output) } }] }), { status: 200 });
  });
  s.state.latestId = "m2";
  const result = await cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: "m2",
    message: "Chị muốn đặt bánh", imageUrls: [], session: { sessionId: "new-session", resetDraft: true } });
  assert.deepEqual(archived, ["old-session", "new-session"]);
  assert.equal(s.draft.sessionId, "new-session");
  assert.equal(s.draft.snapshot, undefined);
  assert.equal(s.draft.details?.imageUrl, "");
  assert.equal(result?.qrUrl, undefined);
  assert.equal(s.state.createdOrders, 0);
});

test("newer inbound messages prevent saving an obsolete summary", async t => {
  const s = setup(t);
  s.state.latestId = "newer";
  await assert.rejects(cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV",
    messageId: "older", message: "chốt đơn", imageUrls: [] }), /đã thay đổi/);
  assert.equal(s.state.createdOrders, 0);
});

test("customer can request category links during checkout without approving an old summary", async t => {
  const s = setup(t);
  const summary = await s.run("đặt bánh", "m1");
  await cakeCheckoutService.markDelivered(summary!);
  assert.equal(await s.run("cho mình xem mẫu bé gái", "m2"), undefined);
  assert.equal(s.draft.summarySentAt, undefined);
  assert.equal(s.draft.snapshot, undefined);
  assert.equal(s.draft.details!.customerName, "Mai");
  assert.equal(s.state.createdOrders, 0);
});

test("authorized image persistence keeps the URL in order data and sends the sample separately", async t => {
  const s = setup(t);
  const stableUrl = "https://res.cloudinary.com/test/image/upload/cake.png";
  let uploads = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("fbcdn.net")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(s.state.output) } }] }), { status: 200 });
  });
  t.mock.method(cloudinaryService, "uploadMediaBuffer", async (buffer: Buffer, folder: string) => {
    assert.equal(folder, "cake_checkout/TEST"); assert.equal(buffer.length, 3); uploads++;
    return stableUrl;
  });
  const result = await cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: "m1",
    message: "đặt bánh theo ảnh", imageUrls: ["https://scontent.fbcdn.net/cake.png"], observation: { status: "ready", description: "Bánh trái tim" } });
  assert.equal(uploads, 1);
  assert.equal(s.draft.snapshot!.details.imageUrl, stableUrl);
  assert.ok(!result!.text.includes(stableUrl));
  assert.match(result!.text, /Mẫu bánh: Theo ảnh/);
  assert.equal(result!.sampleImageUrl, stableUrl);
});

test("long summaries fit Messenger while retaining all order information", () => {
  const parts = splitCakeReply(`${"a".repeat(2500)}\nTổng tiền: 330.000đ\nCọc: 99.000đ`);
  assert.ok(parts.every(part => part.length <= 1800));
  assert.equal(parts.join("").replace(/\n/g, ""), `${"a".repeat(2500)}Tổng tiền: 330.000đCọc: 99.000đ`);
});

for (const delivery of [false, true]) test(`complete buyer workflow (${delivery ? "delivery" : "pickup"}): real Excel price, confirmation, signed deposit and Sheet handoff`, async t => {
  const s = setup(t);
  t.mock.method(Date, "now", () => Date.UTC(2026, 9, 12, 3));
  const workbook = XLSX.read(readFileSync("bao-gia-banh-chuan-hoa.xlsx"), { type: "buffer" });
  const priceText = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Gia_chot_don)
    .map((row, index) => `Dòng ${index + 2}: ${Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(" | ")}`).join("\n");
  t.mock.method(AIKnowledgeChunkModel, "find", () => query([{ text: `${priceText}\nDòng 99: Khu vực giao: phường thử A | Phí giao (VND): 30000` }]));
  Object.assign(s.state.output, { groupId: "TRAI_TIM", name: "", size: "", height: 0, budget: 0,
    customerName: "", customerPhone: "", pickupLocation: "", pickupAt: "", inscription: "", decoration: "" });
  const transcript: { customer: string; reply: string }[] = [];
  const turn = async (customer: string, patch: Partial<typeof s.state.output> = {}) => {
    Object.assign(s.state.output, patch);
    const reply = await s.run(customer, `buyer-${transcript.length + 1}`);
    assert.ok(reply);
    transcript.push({ customer, reply: reply.text });
    if (reply.isSummary) await cakeCheckoutService.markDelivered(reply);
    return reply;
  };
  await turn("Mình muốn đặt 1 bánh trái tim");
  const chosen = await turn("Lấy loại 330k nhé", { budget: 330000 });
  assert.match(chosen.text, /tên người nhận/);
  await turn("Mình tên Mai", { customerName: "Mai" });
  await turn("Số điện thoại 0901234567", { customerPhone: "0901234567" });
  if (delivery) {
    Object.assign(s.state.output, { fulfillmentMethod: "delivery", deliveryAddress: "1 Đường thử, phường thử A" });
    await turn("Giao đến số 1 Đường thử, phường thử A nhé");
  } else await turn("Mình lấy ở Chi nhánh A", { pickupLocation: "Chi nhánh A" });
  await turn("17 giờ 30 ngày 14/10/2026", { pickupAt: "2026-10-14T17:30" });
  await turn("Ghi chữ Chúc mừng sinh nhật mẹ", { inscription: "Chúc mừng sinh nhật mẹ" });
  const summary = await turn("Trang trí kem trắng, hoa vàng nhé", { decoration: "Kem trắng, hoa vàng" });
  assert.equal(summary.isSummary, true);
  assert.equal(summary.qrUrl, undefined);
  assert.equal(s.state.createdOrders, 0);
  assert.match(summary.text, /size 18cm; cao 10cm/);
  const payment = await turn("xác nhận chốt đơn");
  assert.equal(s.state.createdOrders, 1);
  const order = s.getOrder()!;
  const qr = new URL(payment.qrUrl!);
  assert.equal(qr.searchParams.get("amount"), "99000");
  assert.equal(qr.searchParams.get("addInfo"), order.paymentCode);
  assert.equal(order.depositStatus, "awaiting_receipt");

  // Only storage and external delivery are replaced; webhook validation and the worker are real.
  order.conversationId = new Types.ObjectId(); order.integrationId = new Types.ObjectId(); order.createdAt = new Date();
  t.mock.method(order, "save", async () => order);
  const savedRows: SheetOrder[] = [];
  t.mock.method(SocialIntegrationModel, "findById", () => query({ companyCode: "TEST", username: "PAGE", isConnected: true,
    displayName: "Shop test", orderSheetConfig: { enabled: true, spreadsheetId: "fixture-sheet", ordersSheetName: "Orders", itemsSheetName: "OrderItems" } }));
  t.mock.method(googleOrderSheetService, "appendOrder", async (_id, _orders, _items, row: SheetOrder) => {
    assert.equal(order.depositStatus, "verified"); savedRows.push(row); return { duplicate: false };
  });
  t.mock.method(MessengerOrderModel, "updateOne", async (_filter: unknown, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
    if (update.$set) order.set(update.$set);
    for (const key of Object.keys(update.$unset || {})) order.set(key, undefined);
    return { modifiedCount: 1 };
  });
  t.mock.method(MessengerOrderModel, "findById", () => query(order));
  t.mock.method(MessengerOrderModel, "findOneAndUpdate", async () => {
    if (order.depositStatus !== "verified" || order.depositSyncCompletedAt) return null;
    order.depositSyncAttempts = (order.depositSyncAttempts || 0) + 1;
    return order;
  });
  let notificationCount = 0;
  t.mock.method(companySepayService, "notifyCustomerPayment", async () => {
    assert.equal(order.depositStatus, "verified");
    notificationCount++; order.sepayCustomerNotifiedAt = new Date();
  });
  await processCakeDeposits();
  assert.equal(savedRows.length, 0, "No Sheet row before verified deposit");

  const secret = "fixture-secret";
  const oldKey = process.env.SEPAY_CONFIG_ENCRYPTION_KEY;
  process.env.SEPAY_CONFIG_ENCRYPTION_KEY = "fixture-key";
  t.after(() => { if (oldKey === undefined) delete process.env.SEPAY_CONFIG_ENCRYPTION_KEY; else process.env.SEPAY_CONFIG_ENCRYPTION_KEY = oldKey; });
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update("fixture-key").digest(), iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  const company = { code: "TEST", sepayConfig: { ...s.config,
    webhookSecretEncrypted: ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".") },
    set: () => undefined, save: async () => undefined };
  t.mock.method(CompanyModel, "findOne", () => ({ select: async () => company }));
  let transaction: InstanceType<typeof SepayWebhookTransactionModel> | undefined;
  t.mock.method(SepayWebhookTransactionModel, "create", async (value: Record<string, unknown>) => {
    if (transaction) throw Object.assign(new Error("duplicate"), { code: 11000 });
    transaction = new SepayWebhookTransactionModel(value);
    t.mock.method(transaction, "save", async () => transaction);
    return transaction;
  });
  t.mock.method(SepayWebhookTransactionModel, "findOne", async () => transaction);
  const payload = { id: "TEST-TXN-001", transferType: "in", transferAmount: 99000, accountNumber: "123456789", code: order.paymentCode };
  const body = JSON.stringify(payload); const timestamp = String(Date.now() / 1000);
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  const result = await companySepayService.processWebhook("fixture-webhook", body, signature, timestamp, payload);
  assert.equal(result.status, "matched");
  await processCakeDeposits();
  assert.equal(order.status, "synced"); assert.ok(order.depositSyncCompletedAt);
  assert.equal(savedRows.length, 1); assert.equal(notificationCount, 1);
  assert.equal(savedRows[0].customerName, "Mai");
  assert.equal(savedRows[0].totalAmount, 330000);
  assert.equal(savedRows[0].depositAmount, 99000);
  assert.equal(savedRows[0].remainingBalance, 231000);
  assert.equal(savedRows[0].shippingFee, 0);
  assert.equal(savedRows[0].fulfillmentMethod, delivery ? "delivery" : "pickup");
  assert.equal(savedRows[0].items[0].unitPrice, 330000);
  assert.match(savedRows[0].items[0].variantSummary!, /18cm cao 10cm/);
  assert.equal(savedRows[0].paymentStatus, "Đã thanh toán cọc");
  const paidMessage = cakePaidMessage(order.checkoutSnapshot!);
  assert.match(paidMessage, /nhận được tiền cọc rồi/);
  assert.match(paidMessage, /Cảm ơn/);
  assert.equal(paidMessage.split("\n").length, 1);
  assert.doesNotMatch(paidMessage, /https?:\/\/|99.000|Chúc mừng sinh nhật mẹ|Giao đến:|Nhận tại:|Người nhận:|Tổng tiền:/);
  assert.doesNotMatch(paidMessage, /đã gửi bếp|đã gọi ship|xác nhận chốt đơn/);
  assert.equal((await companySepayService.processWebhook("fixture-webhook", body, signature, timestamp, payload)).duplicate, true);
  await processCakeDeposits();
  assert.equal(savedRows.length, 1); assert.equal(notificationCount, 1);
  console.log("BUYER_WORKFLOW_TRANSCRIPT", JSON.stringify(transcript));
  console.log("BUYER_WORKFLOW_RESULT", JSON.stringify({ orderStatus: order.status, depositStatus: order.depositStatus,
    total: savedRows[0].totalAmount, deposit: savedRows[0].depositAmount, balance: savedRows[0].remainingBalance,
    sheetRows: savedRows.length, notifications: notificationCount, replayDuplicate: true }));
});
