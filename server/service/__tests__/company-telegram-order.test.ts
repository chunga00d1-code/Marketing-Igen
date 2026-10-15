import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { CompanyModel } from "../../model/company.model";
import { CakeOrderAutomationModel } from "../../model/cake-order-automation.model";
import { MessengerOrderModel } from "../../model/messenger-order.model";
import { companyTelegramOrderService } from "../company-telegram-order.service";

function setup(t: TestContext) {
  const prior = process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY;
  process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY = "telegram-fixture-key";
  t.after(() => { if (prior === undefined) delete process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY; else process.env.TELEGRAM_CONFIG_ENCRYPTION_KEY = prior; });
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update("telegram-fixture-key").digest(), iv);
  const body = Buffer.concat([cipher.update("fixture-bot-token"), cipher.final()]);
  const config = { enabled: true, notifyNewOrder: true, groupChatId: "-1001234567890", messageThreadId: 12,
    botTokenEncrypted: ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".") };
  const order = new MessengerOrderModel({ orderId: "telegram-fixture-order", companyCode: "TEST", status: "synced",
    depositStatus: "verified", customerName: "Khách giả lập", customerPhone: "0900000001", totalAmount: 330000,
    items: [{ productName: "Bánh trái tim", quantity: 1, lineTotal: 330000 }] });
  const cakeOrder = new CakeOrderAutomationModel({ orderId: "cake-telegram-fixture-order", companyCode: "TEST",
    status: "CONFIRMED", customerName: "Khách giả lập", customerPhone: "0900000001", cakeType: "fresh_cream",
    sizeLabel: "8 người", totalAmount: 330000, pickupDate: "2026-10-20", pickupTime: "10:00",
    fulfillmentMethod: "pickup", productionNotificationStatus: "not_requested" });
  const state = { apiCalls: 0, fail: false };
  t.mock.method(MessengerOrderModel, "findOne", async () => order);
  t.mock.method(MessengerOrderModel, "updateOne", async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    order.set(update.$set); return { modifiedCount: 1 };
  });
  t.mock.method(CakeOrderAutomationModel, "findOne", async () => cakeOrder);
  t.mock.method(CakeOrderAutomationModel, "findOneAndUpdate", async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    cakeOrder.set(update.$set); return cakeOrder;
  });
  t.mock.method(CakeOrderAutomationModel, "updateOne", async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    cakeOrder.set(update.$set); return { modifiedCount: 1 };
  });
  t.mock.method(CompanyModel, "findOne", (filter: { code: string }) => {
    assert.equal(filter.code, "TEST");
    return { select: async (fields: string) => { assert.match(fields, /botTokenEncrypted/); return { code: "TEST", telegramOrderConfig: config }; } };
  });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    state.apiCalls++;
    assert.equal(String(url), "https://api.telegram.org/botfixture-bot-token/sendMessage");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.chat_id, config.groupChatId); assert.equal(payload.message_thread_id, 12);
    assert.match(payload.text, /Bánh trái tim|fresh_cream/);
    return new Response(JSON.stringify(state.fail ? { ok: false, description: "Bad Request: chat not found" }
      : { ok: true, result: { message_id: 100 } }), { status: state.fail ? 400 : 200 });
  });
  return { order, cakeOrder, config, state };
}

test("order notification uses the saved tenant bot/group/topic and skips orders already notified", async t => {
  const s = setup(t);
  assert.equal((await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId)).status, "sent");
  assert.ok(s.order.telegramNotifiedAt);
  assert.equal((await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId)).status, "already_sent");
  assert.equal(s.state.apiCalls, 1);
});

test("Telegram errors remain retryable instead of being treated as a successful notification", async t => {
  const s = setup(t); s.state.fail = true;
  const result = await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId);
  assert.equal(result.status, "failed"); assert.match(result.error!, /chat not found/);
  assert.match(s.order.telegramNotificationError!, /chat not found/);
  assert.equal(s.order.telegramNotifiedAt, undefined);
  s.state.fail = false;
  assert.equal((await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId)).status, "sent");
  assert.equal(s.order.telegramNotificationError, "");
});

test("disabled notifications are skipped while incomplete enabled config reports a failure", async t => {
  const s = setup(t); s.config.enabled = false;
  assert.equal((await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId)).status, "skipped");
  s.config.enabled = true; s.config.notifyNewOrder = false;
  assert.equal((await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId)).status, "skipped");
  s.config.notifyNewOrder = true; s.config.botTokenEncrypted = "";
  assert.equal((await companyTelegramOrderService.notifyMessengerOrder(s.order.orderId)).status, "failed");
  assert.equal(s.state.apiCalls, 0);
});

test("confirmed automated cake orders are announced to production once", async t => {
  const s = setup(t);
  assert.equal((await companyTelegramOrderService.notifyCakeAutomationProduction(s.cakeOrder.orderId)).status, "sent");
  assert.equal(s.cakeOrder.productionNotificationStatus, "sent");
  assert.ok(s.cakeOrder.productionNotifiedAt);
  assert.equal((await companyTelegramOrderService.notifyCakeAutomationProduction(s.cakeOrder.orderId)).status, "already_sent");
  assert.equal(s.state.apiCalls, 1);
});

test("uncertain Telegram production failures are not automatically sent a second time", async t => {
  const s = setup(t); s.state.fail = true;
  const first = await companyTelegramOrderService.notifyCakeAutomationProduction(s.cakeOrder.orderId);
  assert.equal(first.status, "failed");
  assert.equal(s.cakeOrder.productionNotificationStatus, "failed");
  s.state.fail = false;
  assert.equal((await companyTelegramOrderService.notifyCakeAutomationProduction(s.cakeOrder.orderId)).status, "failed");
  assert.equal(s.state.apiCalls, 1);
});
