import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac } from "node:crypto";
import { CompanyModel } from "../../model/company.model";
import { MessengerOrderModel } from "../../model/messenger-order.model";
import { SepayWebhookTransactionModel } from "../../model/sepay-webhook-transaction.model";
import { companySepayService, sepayPaymentCode, type SepayPayload } from "../company-sepay.service";

function setup(t: TestContext) {
  const secret = "fixture-hmac-secret";
  const oldKey = process.env.SEPAY_CONFIG_ENCRYPTION_KEY;
  process.env.SEPAY_CONFIG_ENCRYPTION_KEY = "fixture-key";
  t.after(() => { if (oldKey === undefined) delete process.env.SEPAY_CONFIG_ENCRYPTION_KEY; else process.env.SEPAY_CONFIG_ENCRYPTION_KEY = oldKey; });
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update("fixture-key").digest(), iv);
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  const company = { code: "TENANT", sepayConfig: { enabled: true, accountNumbers: ["123456789"], paymentCodePrefix: "DH",
    webhookSecretEncrypted: ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".") },
    set: () => undefined, save: async () => undefined };
  const order = new MessengerOrderModel({ orderId: "order", companyCode: "TENANT", checkoutFlow: "cake_deposit", paymentRequestStatus: "active",
    depositStatus: "awaiting_receipt", depositAmount: 99000, checkoutSnapshot: { accountNumber: "123456789" } });
  const payload: SepayPayload = { id: "txn1", transferType: "in", transferAmount: 99000, accountNumber: "123456789", code: "DH123456ABCDEF" };
  let transaction: InstanceType<typeof SepayWebhookTransactionModel> | undefined;
  let createDuplicate = false;
  let updates = 0;
  t.mock.method(globalThis, "fetch", () => { throw new Error("No external requests allowed in webhook tests"); });
  t.mock.method(CompanyModel, "findOne", () => ({ select: async () => company }));
  t.mock.method(SepayWebhookTransactionModel, "create", async (value: Record<string, unknown>) => {
    if (createDuplicate) throw Object.assign(new Error("duplicate"), { code: 11000 });
    transaction = new SepayWebhookTransactionModel(value);
    t.mock.method(transaction, "save", async () => transaction);
    return transaction;
  });
  t.mock.method(SepayWebhookTransactionModel, "findOne", async () => transaction);
  t.mock.method(MessengerOrderModel, "findOne", async (filter: Record<string, unknown>) => {
    if (filter.paymentCode) assert.equal(filter.companyCode, "TENANT");
    return order;
  });
  t.mock.method(MessengerOrderModel, "updateOne", async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
    assert.equal(filter.paymentRequestStatus, "active");
    if (order.depositStatus === "verified" || order.paymentRequestStatus !== "active") return { modifiedCount: 0 };
    order.set(update.$set); updates++; return { modifiedCount: 1 };
  });
  t.mock.method(MessengerOrderModel, "exists", async () => order.sepayTransactionId === String(payload.id) ? { _id: order._id } : null);
  const run = async () => {
    const body = JSON.stringify(payload); const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    return companySepayService.processWebhook("webhook", body, signature, timestamp, payload);
  };
  return { order, payload, run, updates: () => updates, transaction: () => transaction!,
    replay: () => { createDuplicate = true; } };
}

test("verified deposit is persisted once; repeated webhook does not collect the balance", async t => {
  const s = setup(t);
  assert.equal((await s.run()).status, "matched");
  assert.equal(s.order.depositStatus, "verified");
  assert.equal(s.order.sepayTransferAmount, 99000);
  s.replay();
  assert.equal((await s.run()).duplicate, true);
  assert.equal(s.updates(), 1);
});
test("webhook recovers when the process stopped after order verification but before transaction completion", async t => {
  const s = setup(t);
  await s.run();
  s.transaction().status = "received";
  s.replay();
  assert.equal((await s.run()).status, "matched");
  assert.equal(s.updates(), 1);
});
test("wrong amount remains pending and is recorded for manual reconciliation", async t => {
  const s = setup(t); s.payload.transferAmount = 100000;
  assert.equal((await s.run()).status, "amount_mismatch");
  assert.equal(s.order.depositStatus, "awaiting_receipt");
  assert.equal(s.updates(), 0);
});
test("superseded QR is never applied to a revised cake order", async t => {
  const s = setup(t); s.order.paymentRequestStatus = "superseded";
  assert.equal((await s.run()).status, "ignored");
  assert.equal(s.updates(), 0);
});
test("receiving account must match the confirmed order snapshot", async t => {
  const s = setup(t); s.order.checkoutSnapshot!.accountNumber = "999999999";
  assert.equal((await s.run()).status, "ignored");
  assert.equal(s.updates(), 0);
});
test("a single exact payment code can be recovered from transfer content", () => {
  assert.equal(sepayPaymentCode({ content: "CK DH123456ABCDEF mua banh" }, "DH"), "DH123456ABCDEF");
  assert.equal(sepayPaymentCode({ content: "DH123456ABCDEF DHABCDEF123456" }, "DH"), "");
  assert.equal(sepayPaymentCode({ content: "XXDH123456ABCDEF" }, "DH"), "");
});
