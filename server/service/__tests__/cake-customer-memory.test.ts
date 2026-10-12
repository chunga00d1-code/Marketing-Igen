import test from "node:test";
import assert from "node:assert/strict";
import { buyerProfilePatch, cakeCustomerMemory, CUSTOMER_SESSION_MS, decideCakeSession, pendingSessionInput } from "../cake-customer-memory";
import { CakeCustomerMemoryModel, CakeConsultationSessionModel } from "../../model/cake-customer-memory.model";
import { CakeCheckoutModel } from "../../model/cake-checkout.model";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { SocialIntegrationModel } from "../../model/social-integration.model";
import { MessengerOrderModel } from "../../model/messenger-order.model";

const now = new Date("2026-10-20T10:00:00Z");
const old = new Date(now.getTime() - CUSTOMER_SESSION_MS);
function query<T>(value: T) { const chain = { lean: async () => value, sort: () => chain, limit: () => chain }; return chain; }

test("24 hours are measured from this customer's inbound, including the exact boundary", () => {
  assert.equal(decideCakeSession("Chị đặt bánh nhé", now, old).action, "new");
  assert.equal(decideCakeSession("Chị đặt bánh nhé", now, new Date(old.getTime() + 1)).action, "continue");
  assert.equal(decideCakeSession("Chị đặt thêm bánh", now, now).action, "new");
  assert.equal(decideCakeSession("Đơn đã cọc hôm trước", now, old).action, "old");
  assert.equal(decideCakeSession("Cho chị giống lần trước", now, old).reorder, true);
  assert.equal(decideCakeSession("Chào em", now, old).action, "ask");
  assert.equal(decideCakeSession("Chị đặt bánh nhé", now, now, false, true).action, "new");
});

test("a debounced burst retains the first message after the gap", () => {
  const rows = [{ messageId: "old", timestamp: new Date(old.getTime() - 5000), text: "bánh hôm trước" },
    { messageId: "new1", timestamp: new Date(now.getTime() - 2000), text: "Chị đặt bánh mới" },
    { messageId: "new2", timestamp: now, text: "cho bé gái" }];
  const pending = pendingSessionInput(rows, "old");
  assert.equal(pending.message, "Chị đặt bánh mới\ncho bé gái");
  assert.equal(pending.startedAt, rows[1].timestamp);
  assert.equal(decideCakeSession(pending.message, now, pending.previousAt).action, "new");
});

test("recipient contact fields cannot overwrite the buyer profile", () => {
  assert.deepEqual(buyerProfilePatch({}), {});
  assert.deepEqual(buyerProfilePatch({ buyerName: " Khách thử ", buyerPhone: "0900 000 001", customerAddress: "chị" }),
    { buyerName: "Khách thử", buyerPhone: "0900000001", customerAddress: "chị" });
  assert.deepEqual(buyerProfilePatch({ buyerPhone: "không phải số" }), {});
});

test("prepare isolates Page/customer sessions, retries safely and never changes old payment orders", async t => {
  const scope = { companyCode: "TEST", pageId: "PAGE_A", conversationId: "507f1f77bcf86cd799439011" };
  const memory = { ...scope, recipientId: "CUSTOMER_A", sessionId: "old-session", windowStart: old,
    lastInboundAt: old, lastInboundMessageId: "old", revision: 0, purchaseCount: 2 };
  const rows = [{ messageId: "old", timestamp: new Date(old.getTime() - 5000), text: "đơn cũ" },
    { messageId: "m1", timestamp: new Date(now.getTime() - 2000), text: "Chị đặt bánh mới" },
    { messageId: "m2", timestamp: now, text: "cho bé gái", direction: "inbound" }];
  const tagging: Record<string, unknown>[] = [];
  t.mock.method(cakeCustomerMemory, "refreshPurchases", async () => undefined);
  t.mock.method(SocialIntegrationModel, "exists", async filter => { assert.equal(filter.companyCode, "TEST"); assert.equal(filter.username, "PAGE_A"); return { _id: "integration" }; });
  t.mock.method(FBConversationModel, "findOne", () => query({ recipientId: "CUSTOMER_A" }));
  t.mock.method(FBMessageModel, "findOne", filter => { assert.equal(filter.direction, "inbound"); return query(rows[2]); });
  t.mock.method(FBMessageModel, "find", filter => { assert.equal(filter.direction, "inbound"); return query([...rows].reverse()); });
  t.mock.method(FBMessageModel, "updateMany", async (filter, update) => { tagging.push({ filter, update }); return { modifiedCount: 1 }; });
  t.mock.method(CakeCustomerMemoryModel, "findOne", filter => {
    assert.equal(filter.recipientId, "CUSTOMER_A"); assert.equal(filter.pageId, "PAGE_A"); return query({ ...memory });
  });
  t.mock.method(CakeCustomerMemoryModel, "updateOne", async (filter, update) => {
    assert.equal(filter.revision, memory.revision); Object.assign(memory, update.$set); memory.revision++; return { modifiedCount: 1 };
  });
  t.mock.method(CakeCheckoutModel, "findOne", () => query({ sessionId: "old-session", orderId: "old-paid" }));
  t.mock.method(MessengerOrderModel, "find", filter => {
    assert.equal(filter.companyCode, "TEST"); assert.equal(filter.pageId, "PAGE_A");
    return query([{ orderId: "old-paid", depositStatus: "verified" }]);
  });
  t.mock.method(CakeConsultationSessionModel, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(CakeConsultationSessionModel, "findOne", () => query(null));
  const first = await cakeCustomerMemory.prepare(scope, "m2");
  assert.notEqual(first.sessionId, "old-session"); assert.equal(first.resetDraft, true);
  assert.equal("profile" in first, false);
  assert.equal(memory.lastInboundAt, now); assert.equal(memory.windowStart, rows[1].timestamp);
  const retry = await cakeCustomerMemory.prepare(scope, "m2");
  assert.equal(retry.sessionId, first.sessionId); assert.equal(memory.revision, 1);
  assert.ok(tagging.length > 0);
});

test("purchase statistics recompute distinct verified orders and never increment per webhook", async t => {
  const scope = { companyCode: "TEST", pageId: "PAGE", conversationId: "507f1f77bcf86cd799439011" };
  t.mock.method(FBConversationModel, "findOne", () => query({ recipientId: "CUSTOMER" }));
  t.mock.method(MessengerOrderModel, "aggregate", async pipeline => {
    assert.equal(pipeline[0].$match.depositStatus, "verified");
    assert.equal(pipeline[0].$match.companyCode, "TEST");
    assert.equal(pipeline[1].$group._id, "$orderId");
    return [{ count: 2, lastPurchasedAt: now }];
  });
  let writes = 0;
  t.mock.method(CakeCustomerMemoryModel, "updateOne", async (filter, update) => {
    assert.equal(filter.recipientId, "CUSTOMER"); assert.equal(update.$max.purchaseCount, 2);
    assert.equal(update.$inc, undefined); writes++; return { modifiedCount: 1 };
  });
  await cakeCustomerMemory.refreshPurchases(scope);
  await cakeCustomerMemory.refreshPurchases(scope);
  assert.equal(writes, 2);
});
