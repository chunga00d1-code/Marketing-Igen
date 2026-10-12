import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { CakeCheckoutModel } from "../../model/cake-checkout.model";
import { CompanyModel } from "../../model/company.model";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { AIKnowledgeChunkModel, AIKnowledgeDocumentModel } from "../../model/ai-knowledge.model";
import { MessengerOrderModel } from "../../model/messenger-order.model";
import { cakeCheckoutService, preservesCakeReplyFacts, splitCakeReply } from "../cake-checkout.service";
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

function query<T>(value: T) {
  const chain = { lean: async () => value, select: () => chain, sort: () => chain, limit: () => chain };
  return chain;
}
const details = { groupId: "TIM", name: "Bánh trái tim", size: "18", height: 10, budget: 0, packQuantity: 0,
  customerName: "Mai", customerPhone: "0901234567", pickupLocation: "Chi nhánh A", pickupAt: "2099-10-20T17:30",
  inscription: "Mừng sinh nhật", decoration: "Kem trắng", quantity: 1, imageUrl: "", wantsOrder: true, needsStaff: false,
  cakeType: "Kem tươi", fulfillmentMethod: "pickup", adviceOnly: false };

function setup(t: TestContext) {
  const config = { enabled: true, depositEnabled: true, depositPercent: 30, qrBankId: "970422",
    qrAccountNumber: "123456789", qrAccountName: "SHOP TEST", accountNumbers: ["123456789"], paymentCodePrefix: "DH" };
  const draft = new CakeCheckoutModel({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV" });
  const state = { output: { ...details }, latestId: "m1", aiCalls: 0, createdOrders: 0 };
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
  t.mock.method(MessengerOrderModel, "create", async (value: Record<string, unknown>) => {
    state.createdOrders++;
    order = new MessengerOrderModel(value);
    return order;
  });
  t.mock.method(MessengerOrderModel, "updateOne", async (_filter: unknown, update: { $set?: { paymentRequestStatus?: string } }) => {
    if (order && update.$set?.paymentRequestStatus) order.paymentRequestStatus = "superseded";
    return { modifiedCount: 1 };
  });
  const run = async (message: string, id: string) => {
    state.latestId = id;
    return cakeCheckoutService.process({ companyCode: "TEST", pageId: "PAGE", conversationId: "CONV", messageId: id, message, imageUrls: [] });
  };
  return { draft, config, state, run, getOrder: () => order };
}

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
  assert.match(first!.text, /ngày và giờ/);
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
  assert.match(paid!.text, /261.000đ/);
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

test("material selection is mandatory and mousse never uses ordinary cake prices", async t => {
  const s = setup(t);
  s.state.output.cakeType = "";
  const ask = await s.run("Theo ảnh này nhé", "m1");
  assert.match(ask!.text, /chất bánh/);
  assert.equal(ask?.isSummary, undefined);
  s.state.output.cakeType = "Mousse";
  const mismatch = await s.run("Lấy mousse nhé", "m2");
  assert.equal(mismatch?.isSummary, undefined);
  assert.doesNotMatch(mismatch!.text, /330.000/);
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

test("authorized image persistence stores a stable Cloudinary reference in the summary", async t => {
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
  assert.ok(result!.text.includes(stableUrl));
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
  assert.match(paidMessage, /99.000đ tiền cọc/);
  assert.match(paidMessage, /Chúc mừng sinh nhật mẹ/);
  assert.match(paidMessage, delivery ? /Giao đến: 1 Đường thử/ : /Nhận tại: Chi nhánh A/);
  assert.doesNotMatch(paidMessage, /đã gửi bếp|đã gọi ship|xác nhận chốt đơn/);
  assert.equal((await companySepayService.processWebhook("fixture-webhook", body, signature, timestamp, payload)).duplicate, true);
  await processCakeDeposits();
  assert.equal(savedRows.length, 1); assert.equal(notificationCount, 1);
  console.log("BUYER_WORKFLOW_TRANSCRIPT", JSON.stringify(transcript));
  console.log("BUYER_WORKFLOW_RESULT", JSON.stringify({ orderStatus: order.status, depositStatus: order.depositStatus,
    total: savedRows[0].totalAmount, deposit: savedRows[0].depositAmount, balance: savedRows[0].remainingBalance,
    sheetRows: savedRows.length, notifications: notificationCount, replayDuplicate: true }));
});
