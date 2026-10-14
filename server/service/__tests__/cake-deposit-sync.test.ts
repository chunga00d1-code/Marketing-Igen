import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { googleOrderSheetService, ORDER_HEADERS, type SheetOrder } from "../google-order-sheet.service";
import { MessengerOrderModel } from "../../model/messenger-order.model";
import { messengerOrderService } from "../messenger-order.service";
import { companySepayService } from "../company-sepay.service";
import { processCakeDeposits } from "../cake-deposit-worker";
import { cakeCustomerMemory } from "../cake-customer-memory";
import { companyTelegramOrderService } from "../company-telegram-order.service";

test("Sheet writes only the requested columns and finds the same order on retry and updates", async t => {
  const keys = ["GOOGLE_SHEETS_PROJECT_ID", "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SHEETS_PRIVATE_KEY"];
  const prior = keys.map(key => process.env[key]);
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" } });
  process.env.GOOGLE_SHEETS_PROJECT_ID = "test-project";
  process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_SHEETS_PRIVATE_KEY = privateKey;
  t.after(() => keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; }));
  const orderRows: unknown[][] = [];
  const compactRows: unknown[][] = [];
  const updates: Array<{ range: string; values: unknown[][] }> = [];
  const batchRequests: Array<Record<string, unknown>> = [];
  let legacyMode = false;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = decodeURIComponent(String(input));
    const body = init?.body ? JSON.parse(String(init.body).startsWith("{") ? String(init.body) : "{}") as { range?: string; values?: unknown[][]; requests?: Array<Record<string, unknown>> } : {};
    let response: object = {};
    if (url.includes("oauth2.googleapis.com")) response = { access_token: "fixture-token", expires_in: 3600 };
    else if (url.includes("?fields=")) response = { sheets: legacyMode
      ? [{ properties: { title: "Orders", sheetId: 1 } }, { properties: { title: "Orders - 12 cột", sheetId: 2 } }, { properties: { title: "OrderItems", sheetId: 3 } }]
      : [{ properties: { title: "Orders", sheetId: 1, gridProperties: { columnCount: 13 } } }] };
    else if (url.endsWith("'Orders'!A1:L1")) response = { values: [legacyMode ? ["Mã đơn hàng"] : ORDER_HEADERS] };
    else if (url.endsWith("'Orders - 12 cột'!A1:L1")) response = { values: [ORDER_HEADERS] };
    else if (url.endsWith("'Orders - 12 cột'!M:M")) response = { values: [["Mã đơn hàng"], ...compactRows.map(row => [row[12]])] };
    else if (url.endsWith("'Orders'!M:M")) response = { values: [["Mã đơn hàng"], ...orderRows.map(row => [row[12]])] };
    else if (url.endsWith("'Orders'!A:A")) response = { values: [["Mã đơn hàng"], ["legacy-1"]] };
    else if (url.endsWith("'Orders'!A1:AK")) {
      const header = Array(37).fill(""); header[0] = "Mã đơn hàng"; header[6] = "Tên khách hàng"; header[13] = "Tổng thanh toán";
      const row = Array(37).fill("");
      row[0] = "legacy-1"; row[6] = "Lan"; row[7] = "0912345678"; row[9] = "Bánh x1";
      row[13] = 330000; row[21] = "Quận 1"; row[22] = "2026-10-15"; row[23] = "Có";
      row[24] = 99000; row[26] = "https://example.com/old"; row[32] = "https://example.com/old-cake"; row[36] = 231000;
      response = { values: [header, row] };
    }
    else if (url.endsWith("'OrderItems'!A1:I")) response = { values: [["Mã đơn hàng"], ["legacy-1", 1, "", "Bánh", "20 cm", 1, 330000, 330000, '{"size":"20 cm"}']] };
    else if (url.includes(":append") && url.includes("'Orders - 12 cột'")) compactRows.push(...body.values!);
    else if (url.includes(":append") && url.includes("'Orders'")) orderRows.push(...body.values!);
    else if (url.includes(":batchUpdate")) batchRequests.push(...(body.requests || []));
    else if (init?.method === "PUT" && body.range?.includes("'Orders'!")) updates.push({ range: body.range, values: body.values! });
    return new Response(JSON.stringify(response), { status: 200 });
  });
  const order: SheetOrder = { orderId: "cake-1", createdAt: new Date(), confirmedAt: new Date(), sourceAccount: "Page", conversationId: "conv",
    customerName: "Mai", customerPhone: "0901234567", deliveryAddress: "", sourceMessageId: "message",
    items: [{ productName: "Bánh trái tim", quantity: 1, unitPrice: 330000, lineTotal: 330000, attributes: { size: "20 cm" } }],
    totalAmount: 330000, depositAmount: 99000, depositPercent: 30, remainingBalance: 231000, depositStatus: "verified", paymentStatus: "Đã thanh toán cọc" };
  assert.equal((await googleOrderSheetService.appendOrder("sheet", "Orders", "OrderItems", order)).duplicate, false);
  assert.equal((await googleOrderSheetService.appendOrder("sheet", "Orders", "OrderItems", order)).duplicate, true);
  assert.equal(orderRows.length, 1);
  assert.deepEqual(orderRows[0], ["Mai", "0901234567", "Bánh trái tim x1", "20 cm", "", 330000, "", "Không", 99000, "", "", 231000, "cake-1"]);
  await googleOrderSheetService.updatePaymentReceipt("sheet", "Orders", "cake-1", { depositAmount: 99000, receiptUrl: "https://example.com/receipt", receiptReceivedAt: new Date() });
  await googleOrderSheetService.updateProductSelection("sheet", "Orders", "cake-1", { imageUrl: "https://example.com/cake", selectedAt: new Date(), categoryName: "Bánh" });
  await googleOrderSheetService.updateSepayPayment("sheet", "Orders", "cake-1", { transactionId: "tx", transferAmount: 99000, verifiedAt: new Date() });
  assert.deepEqual(updates.map(update => update.range), ["'Orders'!A1:M1", "'Orders'!A1:M1", "'Orders'!H2:J2", "'Orders'!K2:K2", "'Orders'!I2:I2"]);
  legacyMode = true;
  updates.length = 0;
  await googleOrderSheetService.updatePaymentReceipt("sheet", "Orders", "legacy-1", { depositAmount: 99000, receiptUrl: "https://example.com/old", receiptReceivedAt: new Date() });
  await googleOrderSheetService.updateProductSelection("sheet", "Orders", "legacy-1", { imageUrl: "https://example.com/old-cake", selectedAt: new Date(), categoryName: "Bánh" });
  await googleOrderSheetService.updateSepayPayment("sheet", "Orders", "legacy-1", { transactionId: "old-tx", transferAmount: 99000, verifiedAt: new Date() });
  assert.deepEqual(new Set(updates.map(update => update.range)), new Set([
    "'Orders'!X2:AB2", "'Orders'!P2:P2", "'Orders'!AG2:AI2", "'Orders'!Z2:Z2", "'Orders'!AD2:AF2",
  ]));
  await googleOrderSheetService.initializeTemplate("sheet", "Orders", "OrderItems");
  assert.deepEqual(compactRows, [["Lan", "0912345678", "Bánh x1", "20 cm", "2026-10-15", 330000,
    "Quận 1", "Có", 99000, "https://example.com/old", "https://example.com/old-cake", 231000, "legacy-1"]]);
  assert.deepEqual(batchRequests.filter(request =>
    (request.updateSheetProperties as { properties?: { hidden?: boolean } } | undefined)?.properties?.hidden).map(request =>
    (request.updateSheetProperties as { properties: { sheetId: number } }).properties.sheetId), [1, 3]);
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
