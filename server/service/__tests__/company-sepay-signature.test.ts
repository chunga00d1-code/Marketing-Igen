import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifySepaySignature } from "../company-sepay.service";

const rawBody = '{"id":92704,"transferAmount":500000}';
const secret = "company-specific-secret";
const nowMs = 1_800_000_000_000;
const timestamp = String(Math.floor(nowMs / 1000));

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
