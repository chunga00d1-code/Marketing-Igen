import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { buildVietQrImageUrl, companySepayService, sepayPaymentCode, verifySepaySignature } from "../company-sepay.service";
import { CompanyModel } from "../../model/company.model";

const rawBody = '{"id":92704,"transferAmount":500000}';
const secret = "company-specific-secret";
const nowMs = 1_800_000_000_000;
const timestamp = String(Math.floor(nowMs / 1000));

test("recovers SePay's truncated code from the exact transfer content without accepting conflicting codes", () => {
  assert.equal(sepayPaymentCode({ code: "DH518", content: "DH518B845D70C1 Q2CXK8RZ/" }, "DH"), "DH518B845D70C1");
  assert.equal(sepayPaymentCode({ code: "DH518B845D70C1", content: "DH518B845D70C1" }, "DH"), "DH518B845D70C1");
  assert.equal(sepayPaymentCode({ code: "DH999", content: "DH518B845D70C1" }, "DH"), "");
  assert.equal(sepayPaymentCode({ code: "DH518", content: "DH518B845D70C1 DH123456ABCDEF" }, "DH"), "");
});

test("frontend configuration is saved, returned without its secret and preserved on subsequent saves", async t => {
  const previousKey = process.env.SEPAY_CONFIG_ENCRYPTION_KEY;
  process.env.SEPAY_CONFIG_ENCRYPTION_KEY = "test-only-config-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.SEPAY_CONFIG_ENCRYPTION_KEY;
    else process.env.SEPAY_CONFIG_ENCRYPTION_KEY = previousKey;
  });
  const record = new CompanyModel({ code: "TEST", name: "Test", sepayConfig: { webhookId: "fixture-webhook" } });
  let saved = 0;
  t.mock.method(record, "save", async () => { saved++; return record; });
  t.mock.method(CompanyModel, "findOne", (filter: { code: string }) => {
    assert.equal(filter.code, "TEST");
    return { select: async () => record };
  });
  const result = await companySepayService.updateConfig("TEST", {
    enabled: true, webhookSecret: "fixture-secret", accountNumbers: ["123456789"],
    depositEnabled: true, depositPercent: 1, qrBankId: "970422", qrAccountNumber: "123456789", qrAccountName: "TEST SHOP",
  }, "https://example.test");
  assert.equal(saved, 1);
  assert.equal(result.depositPercent, 1);
  assert.equal(result.hasWebhookSecret, true);
  assert.equal(result.webhookUrl, "https://example.test/api/v1/webhooks/sepay/fixture-webhook");
  assert.equal(JSON.stringify(result).includes("fixture-secret"), false);
  const encrypted = record.sepayConfig?.webhookSecretEncrypted;
  assert.ok(encrypted?.startsWith("v1."));
  await companySepayService.updateConfig("TEST", { webhookSecret: "", depositPercent: 30 }, "https://example.test");
  const loaded = await companySepayService.getConfig("TEST", "https://example.test");
  assert.equal(saved, 2);
  assert.equal(loaded.depositPercent, 30);
  assert.equal(record.sepayConfig?.webhookSecretEncrypted, encrypted);
});

function signature(body = rawBody) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

test("accepts an authentic SePay HMAC made from timestamp and raw body", () => {
  assert.doesNotThrow(() => verifySepaySignature(rawBody, signature(), timestamp, secret, nowMs));
});

test("rejects a changed webhook body", () => {
  assert.throws(
    () => verifySepaySignature('{"id":92704,"transferAmount":1}', signature(), timestamp, secret, nowMs),
    /không hợp lệ/i,
  );
});

test("rejects a webhook timestamp older than five minutes", () => {
  assert.throws(
    () => verifySepaySignature(rawBody, signature(), timestamp, secret, nowMs + 301_000),
    /hết hạn/i,
  );
});

test("builds a VietQR image URL with amount, payment code and account details", () => {
  const url = new URL(buildVietQrImageUrl("970422", "123456789", "CONG TY IGEN", 150000, "DH12AB34CD56EF"));
  assert.equal(url.hostname, "img.vietqr.io");
  assert.equal(url.pathname, "/image/970422-123456789-compact2.png");
  assert.equal(url.searchParams.get("amount"), "150000");
  assert.equal(url.searchParams.get("addInfo"), "DH12AB34CD56EF");
  assert.equal(url.searchParams.get("accountName"), "CONG TY IGEN");
});
