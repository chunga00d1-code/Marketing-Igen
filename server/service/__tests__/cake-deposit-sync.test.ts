import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { googleOrderSheetService, type SheetOrder } from "../google-order-sheet.service";
import { MessengerOrderModel } from "../../model/messenger-order.model";
import { messengerOrderService } from "../messenger-order.service";
import { companySepayService } from "../company-sepay.service";
import { processCakeDeposits } from "../cake-deposit-worker";
import { cakeCustomerMemory } from "../cake-customer-memory";
import { companyTelegramOrderService } from "../company-telegram-order.service";

test("Sheet retry repairs missing item rows without appending a second order", async t => {
  const keys = ["GOOGLE_SHEETS_PROJECT_ID", "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SHEETS_PRIVATE_KEY"];
  const prior = keys.map(key => process.env[key]);
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" } });
  process.env.GOOGLE_SHEETS_PROJECT_ID = "test-project";
  process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_SHEETS_PRIVATE_KEY = privateKey;
  t.after(() => keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; }));
  const orderRows: unknown[][] = [];
  const itemRows: unknown[][] = [];
  let failItemOnce = true;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = decodeURIComponent(String(input));
    const body = init?.body ? JSON.parse(String(init.body).startsWith("{") ? String(init.body) : "{}") as { values?: unknown[][] } : {};
    let response: object = {};
    if (url.includes("oauth2.googleapis.com")) response = { access_token: "fixture-token", expires_in: 3600 };
    else if (url.includes("?fields=")) response = { sheets: ["Orders", "OrderItems"].map(title => ({ properties: { title } })) };
    else if (url.endsWith("'Orders'!A:A")) response = { values: [["Mã đơn hàng"], ...orderRows.map(row => [row[0]])] };
    else if (url.endsWith("'OrderItems'!A:B")) response = { values: [["Mã đơn hàng", "STT"], ...itemRows.map(row => row.slice(0, 2))] };
    else if (url.includes(":append") && url.includes("'Orders'")) orderRows.push(...body.values!);
    else if (url.includes(":append") && url.includes("'OrderItems'")) {
      if (failItemOnce) { failItemOnce = false; return new Response(JSON.stringify({ error: { message: "temporary Sheet error" } }), { status: 503 }); }
      itemRows.push(...body.values!);
    }
    return new Response(JSON.stringify(response), { status: 200 });
  });
  const order: SheetOrder = { orderId: "cake-1", createdAt: new Date(), confirmedAt: new Date(), sourceAccount: "Page", conversationId: "conv",
    customerName: "Mai", customerPhone: "0901234567", deliveryAddress: "", sourceMessageId: "message",
    items: [{ productName: "Bánh trái tim", quantity: 1, unitPrice: 330000, lineTotal: 330000 }],
    totalAmount: 330000, depositAmount: 99000, depositPercent: 30, remainingBalance: 231000, depositStatus: "verified", paymentStatus: "Đã thanh toán cọc" };
  await assert.rejects(googleOrderSheetService.appendOrder("sheet", "Orders", "OrderItems", order), /temporary/);
  assert.equal(orderRows.length, 1); assert.equal(itemRows.length, 0);
  assert.equal((await googleOrderSheetService.appendOrder("sheet", "Orders", "OrderItems", order)).duplicate, true);
  assert.equal(orderRows.length, 1); assert.equal(itemRows.length, 1);
  await googleOrderSheetService.appendOrder("sheet", "Orders", "OrderItems", order);
  assert.equal(orderRows.length, 1); assert.equal(itemRows.length, 1);
  assert.deepEqual(orderRows[0].slice(-2), [30, 231000]);
});

test("deposit worker persists retries and resumes without repeating customer confirmation", async t => {
  t.mock.method(cakeCustomerMemory, "refreshPurchases", async () => undefined);
  t.mock.method(companyTelegramOrderService, "notifyMessengerOrder", async () => ({ status: "skipped" as const }));
  const order = new MessengerOrderModel({ orderId: "cake-1", companyCode: "TEST", conversationId: "507f1f77bcf86cd799439011", depositStatus: "verified", checkoutFlow: "cake_deposit" });
  let available = true;
  let notifications = 0;
  let syncs = 0;
  t.mock.method(MessengerOrderModel, "findOneAndUpdate", async (filter: Record<string, unknown>) => {
    assert.equal(filter.depositStatus, "verified");
    assert.equal(filter.checkoutFlow, "cake_deposit");
    assert.deepEqual(filter.depositSyncAttempts, { $lt: 8 });
    if (!available) return null;
    available = false; order.depositSyncAttempts = (order.depositSyncAttempts || 0) + 1;
    return order;
  });
  t.mock.method(MessengerOrderModel, "updateOne", async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
    assert.ok(filter.depositSyncLeaseToken);
    if (update.$set) order.set(update.$set);
    return { modifiedCount: 1 };
  });
  t.mock.method(MessengerOrderModel, "findById", () => ({ lean: async () => order }));
  t.mock.method(companySepayService, "notifyCustomerPayment", async () => {
    if (!order.sepayCustomerNotifiedAt) { notifications++; order.sepayCustomerNotifiedAt = new Date(); }
  });
  t.mock.method(messengerOrderService, "syncConfirmedDepositOrder", async () => {
    syncs++; order.status = syncs === 1 ? "failed" : "synced"; order.lastSyncError = "temporary Sheet error";
    return order;
  });
  await processCakeDeposits();
  assert.equal(order.depositSyncCompletedAt, undefined);
  assert.ok(order.depositSyncNextAt);
  assert.match(order.depositSyncError!, /temporary/);
  available = true;
  await processCakeDeposits();
  assert.ok(order.depositSyncCompletedAt);
  assert.equal(order.depositSyncAttempts, 2);
  assert.equal(notifications, 1);
  assert.equal(syncs, 2);
});

test("a verified cake deposit retries Telegram without sending the customer confirmation or Sheet rows twice", async t => {
  const order = new MessengerOrderModel({ orderId: "cake-telegram", companyCode: "TEST", conversationId: "507f1f77bcf86cd799439011",
    depositStatus: "verified", checkoutFlow: "cake_deposit" });
  let available = true;
  let customerNotifications = 0;
  let sheetAppends = 0;
  let telegramAttempts = 0;
  t.mock.method(cakeCustomerMemory, "refreshPurchases", async () => undefined);
  t.mock.method(MessengerOrderModel, "findOneAndUpdate", async () => {
    if (!available || order.depositSyncCompletedAt) return null;
    available = false; order.depositSyncAttempts = (order.depositSyncAttempts || 0) + 1;
    return order;
  });
  t.mock.method(MessengerOrderModel, "updateOne", async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }) => {
    assert.ok(filter.depositSyncLeaseToken);
    if (update.$set) order.set(update.$set);
    return { modifiedCount: 1 };
  });
  t.mock.method(MessengerOrderModel, "findById", () => ({ lean: async () => order }));
  t.mock.method(companySepayService, "notifyCustomerPayment", async () => {
    if (!order.sepayCustomerNotifiedAt) { customerNotifications++; order.sepayCustomerNotifiedAt = new Date(); }
  });
  t.mock.method(messengerOrderService, "syncConfirmedDepositOrder", async () => {
    if (order.status !== "synced") { sheetAppends++; order.status = "synced"; }
    return order;
  });
  t.mock.method(companyTelegramOrderService, "notifyMessengerOrder", async (orderId: string) => {
    assert.equal(orderId, order.orderId); assert.equal(order.status, "synced"); assert.equal(order.depositStatus, "verified");
    telegramAttempts++;
    return telegramAttempts === 1 ? { status: "failed" as const, error: "Telegram temporary error" } : { status: "sent" as const };
  });
  await processCakeDeposits();
  assert.equal(order.depositSyncCompletedAt, undefined);
  assert.match(order.depositSyncError!, /Telegram temporary error/);
  assert.ok(order.depositSyncNextAt);
  available = true;
  await processCakeDeposits();
  assert.ok(order.depositSyncCompletedAt);
  assert.equal(telegramAttempts, 2);
  assert.equal(customerNotifications, 1);
  assert.equal(sheetAppends, 1);
  available = true;
  await processCakeDeposits();
  assert.equal(telegramAttempts, 2);
});
