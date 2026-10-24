import test from "node:test";
import assert from "node:assert/strict";
import { cakeOrderConfirmation, canConfirmCakeOrder, redactCakeConfirmationMessage, type CakeConfirmationDecision } from "../cake-order-confirmation";

test("only confident approval of the entire unchanged order can create a deposit request", () => {
  const approval: CakeConfirmationDecision = { intent: "confirm_order", confidence: "high", target: "whole_order",
    changesRequested: false, evidence: "cứ làm như trên nhé", clarification: "" };
  assert.equal(canConfirmCakeOrder(approval), true);
  for (const change of [
    { confidence: "low" as const }, { target: "detail" as const }, { changesRequested: true }, { evidence: "" },
    { intent: "question" as const }, { intent: "unclear" as const }, { intent: "acknowledge_detail" as const },
  ]) assert.equal(canConfirmCakeOrder({ ...approval, ...change }), false);
});

test("confirmation context removes stored contact values before any AI call", () => {
  const sanitized = redactCakeConfirmationMessage("Khách thử, 0900000001; mail test@example.com, số khác 0900 000 002. Chốt như trên nhé", "Khách thử", "0900000001");
  assert.doesNotMatch(sanitized, /Khách thử|0900000001|0900 000 002|test@example.com/i);
  assert.match(sanitized, /Chốt như trên nhé/);
});

test("live contextual confirmation phrases without real customer data", {
  skip: process.env.CAKE_CONFIRMATION_LIVE_TEST !== "1", timeout: 300000,
}, async t => {
  const liveFetch = globalThis.fetch;
  assert.ok(process.env.OPENROUTER_API_KEY);
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname, "openrouter.ai");
    return liveFetch(input, init);
  });
  const cases: Array<{ message: string; lastShopTurn: "summary" | "detail_question" | "unknown";
    confirm: boolean; intent?: CakeConfirmationDecision["intent"] }> = [
    { message: "uk đúng r đó", lastShopTurn: "summary", confirm: true },
    { message: "ừ vậy đi", lastShopTurn: "summary", confirm: true },
    { message: "chị lấy như trên nhé", lastShopTurn: "summary", confirm: true },
    { message: "chuẩn, cứ làm giúp anh", lastShopTurn: "summary", confirm: true },
    { message: "nhất trí", lastShopTurn: "summary", confirm: true },
    { message: "chốt như vậy nha", lastShopTurn: "summary", confirm: true },
    { message: "👍", lastShopTurn: "summary", confirm: true },
    { message: "ok", lastShopTurn: "summary", confirm: true },
    { message: "ok", lastShopTurn: "detail_question", confirm: false, intent: "acknowledge_detail" },
    { message: "đúng rồi", lastShopTurn: "detail_question", confirm: false, intent: "acknowledge_detail" },
    { message: "chị xác nhận toàn bộ đơn như trên", lastShopTurn: "detail_question", confirm: true },
    { message: "ok", lastShopTurn: "unknown", confirm: false },
    { message: "ok nhưng đổi sang 16h nhé", lastShopTurn: "summary", confirm: false, intent: "change_order" },
    { message: "đúng rồi mà bỏ chữ đi nha", lastShopTurn: "summary", confirm: false, intent: "change_order" },
    { message: "được nếu giảm giá", lastShopTurn: "summary", confirm: false, intent: "change_order" },
    { message: "đúng rồi phải không?", lastShopTurn: "summary", confirm: false, intent: "question" },
    { message: "gửi QR đi", lastShopTurn: "summary", confirm: false },
    { message: "cọc bao nhiêu?", lastShopTurn: "summary", confirm: false, intent: "question" },
    { message: "khác chút", lastShopTurn: "summary", confirm: false, intent: "unclear" },
    { message: "chưa", lastShopTurn: "summary", confirm: false },
    { message: "xem lại đơn giúp mình", lastShopTurn: "summary", confirm: false, intent: "show_summary" },
  ];
  const failures: string[] = [];
  // Bounded concurrency: these are independent classifications, not conversations.
  for (let offset = 0; offset < cases.length; offset += 2) {
    await Promise.all(cases.slice(offset, offset + 2).map(async item => {
      const decision = await cakeOrderConfirmation.classify({ message: item.message, lastShopTurn: item.lastShopTurn,
        topic: item.lastShopTurn === "detail_question" ? "time" : "other", customerAddress: "bạn", sellerAddress: "mình" });
      console.log("LIVE_CONFIRMATION", JSON.stringify({ ...item, decision, canConfirm: canConfirmCakeOrder(decision) }));
      try {
        assert.equal(canConfirmCakeOrder(decision), item.confirm);
        if (item.intent) assert.equal(decision.intent, item.intent);
        if (decision.intent === "unclear") assert.ok(decision.clarification, "Ask one contextual clarification");
      } catch (error) { failures.push(`${item.message} (${item.lastShopTurn}): ${String(error)}`); }
    }));
  }
  assert.deepEqual(failures, []);
});
