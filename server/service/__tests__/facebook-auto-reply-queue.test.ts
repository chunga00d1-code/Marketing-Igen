import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { FacebookAutoReplyJobModel } from "../../model/facebook-auto-reply-job.model";
import { AIReplyLogModel } from "../../model/ai-reply-log.model";
import { FBConversationModel } from "../../model/fb-messenger.model";
import { enqueueFacebookReply, claimFacebookReply, facebookReplyOutcome, facebookReplyLease,
  markFacebookReplySending, requireFacebookReplyText } from "../facebook-auto-reply-queue";
import { reportFacebookReplyFailure } from "../facebook-reply-failure.service";
import { expireFacebookReplyJobs } from "../facebook-auto-reply-queue";

type Row = Record<string, unknown>;
type Update = { $set?: Row; $setOnInsert?: Row; $unset?: Row; $inc?: Row; $max?: Row; $addToSet?: Row };
const value = (input: unknown): string | number => input instanceof Date ? input.getTime()
  : typeof input === "number" ? input : String(input);

// Deterministic atomic storage double: models competing workers without external DB/API calls.
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return (expected as Row[]).some(item => matches(row, item));
    if (key === "$and") return (expected as Row[]).every(item => matches(row, item));
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected instanceof Types.ObjectId)) {
      return Object.entries(expected).every(([operator, operand]) => {
        if (operator === "$exists") return (actual !== undefined) === operand;
        if (operator === "$ne") return value(actual) !== value(operand);
        if (operator === "$lt") return actual !== undefined && value(actual) < value(operand);
        if (operator === "$lte") return actual !== undefined && value(actual) <= value(operand);
        if (operator === "$gt") return actual !== undefined && value(actual) > value(operand);
        if (operator === "$gte") return actual !== undefined && value(actual) >= value(operand);
        throw new Error(`Unsupported filter operator: ${operator}`);
      });
    }
    return value(actual) === value(expected);
  });
}

class Store {
  rows: Row[] = [];
  find(filter: Row) { return this.rows.find(row => matches(row, filter)); }
  update(filter: Row, update: Update, options: { upsert?: boolean } = {}) {
    let row = this.find(filter);
    const inserting = !row && options.upsert;
    if (!row && !inserting) return { matchedCount: 0, modifiedCount: 0 };
    if (!row) {
      row = { ...filter, ...update.$setOnInsert };
      this.rows.push(row);
    }
    Object.assign(row, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete row[key];
    for (const [key, increment] of Object.entries(update.$inc || {})) row[key] = Number(row[key] || 0) + Number(increment);
    for (const [key, minimum] of Object.entries(update.$max || {})) row[key] = Math.max(Number(row[key] || 0), Number(minimum));
    for (const [key, entry] of Object.entries(update.$addToSet || {})) row[key] = [...new Set([...(row[key] as unknown[] || []), entry])];
    return { matchedCount: inserting ? 0 : 1, modifiedCount: 1 };
  }
}

function setup(t: TestContext) {
  const store = new Store();
  t.mock.method(FacebookAutoReplyJobModel, "updateMany", async (filter: Row, update: Update) => {
    for (const row of store.rows.filter(row => matches(row, filter))) store.update({ conversationId: row.conversationId }, update);
  });
  t.mock.method(FacebookAutoReplyJobModel, "init", async () => FacebookAutoReplyJobModel);
  t.mock.method(FacebookAutoReplyJobModel, "updateOne", async (filter: Row, update: Update, options?: { upsert?: boolean }) => store.update(filter, update, options));
  t.mock.method(FacebookAutoReplyJobModel, "findOne", (filter: Row) => ({ lean: async () => {
    const row = store.find(filter); return row ? { ...row } : null;
  } }));
  t.mock.method(FacebookAutoReplyJobModel, "exists", async (filter: Row) => store.find(filter) ? { _id: "job" } : null);
  t.mock.method(FacebookAutoReplyJobModel, "findOneAndUpdate", async (filter: Row, update: Update) => {
    const row = store.find(filter);
    if (!row) return null;
    store.update(filter, update);
    return { ...row };
  });
  return store;
}

const conversationId = "507f1f77bcf86cd799439011";
function incoming(messageId = "m1", offset = 0) {
  return { conversationId, pageId: "page-a", companyCode: "SHOP-A", messageId,
    messageTimestamp: new Date(1000 + offset), messageCreatedAt: new Date(2000 + offset),
    text: "Tôi muốn đặt bánh", nextAttemptAt: new Date(Date.now() - 1000) };
}

test("concurrent duplicate triggers preserve due time and allow only one claim", async t => {
  const store = setup(t);
  const input = incoming();
  await Promise.all(Array.from({ length: 12 }, () => enqueueFacebookReply(input)));
  assert.equal(store.rows.length, 1);
  const claims = await Promise.all(Array.from({ length: 12 }, () => claimFacebookReply(conversationId, "m1")));
  assert.equal(claims.filter(Boolean).length, 1);
  const token = store.rows[0].leaseToken;
  assert.equal(await enqueueFacebookReply({ ...input, nextAttemptAt: new Date(Date.now() + 60_000) }), null);
  assert.equal(store.rows[0].leaseToken, token);
  assert.equal(store.rows[0].attempts, 1);
  assert.equal(value(store.rows[0].nextAttemptAt), value(input.nextAttemptAt));
});

test("concurrent first inserts retain the newer inbound regardless of trigger order", async t => {
  const store = setup(t);
  await Promise.all([enqueueFacebookReply(incoming()), enqueueFacebookReply(incoming("m2", 100))]);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].messageId, "m2");
  await enqueueFacebookReply(incoming());
  assert.equal(store.rows[0].messageId, "m2");
});

test("a newer message revokes the previous worker before sending", async t => {
  setup(t);
  await enqueueFacebookReply(incoming());
  const old = await claimFacebookReply(conversationId, "m1");
  assert.ok(old);
  await enqueueFacebookReply(incoming("m2", 100));
  assert.equal(await markFacebookReplySending(conversationId, "m1", old.leaseToken), false);
  assert.ok(await claimFacebookReply(conversationId, "m2"));
});

test("restart recovers an expired unsent lease while fencing the old worker", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  const old = await claimFacebookReply(conversationId, "m1");
  assert.ok(old);
  store.rows[0].leaseUntil = new Date(0);
  assert.equal(await markFacebookReplySending(conversationId, "m1", old.leaseToken), false);
  const recovered = await claimFacebookReply(conversationId, "m1");
  assert.ok(recovered);
  assert.notEqual(recovered.leaseToken, old.leaseToken);
  assert.equal(recovered.job.attempts, 2);
  assert.equal(matches(store.rows[0], facebookReplyLease(conversationId, "m1", old.leaseToken)), false);
});

test("restart never replays a send whose outcome is unknown", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  const claim = await claimFacebookReply(conversationId, "m1");
  assert.ok(claim);
  assert.equal(await markFacebookReplySending(conversationId, "m1", claim.leaseToken), true);
  store.rows[0].leaseUntil = new Date(0);
  assert.equal(await enqueueFacebookReply(incoming()), null);
  assert.equal(await claimFacebookReply(conversationId, "m1"), null);
  assert.ok(store.rows[0].deliveryStartedAt);
  await expireFacebookReplyJobs();
  assert.equal(store.rows[0].status, "failed");
  assert.equal(store.rows[0].leaseToken, undefined);
});

test("human cancellation and terminal completion survive duplicate callbacks", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  for (const status of ["cancelled", "completed", "failed"]) {
    store.rows[0].status = status;
    assert.equal(await enqueueFacebookReply(incoming()), null);
    assert.equal(await claimFacebookReply(conversationId, "m1"), null);
    assert.equal(store.rows[0].status, status);
  }
});

test("empty or whitespace AI output retries and eventually requires staff", () => {
  for (const text of [undefined, null, "", "  \n "]) {
    let error: unknown;
    try { requireFacebookReplyText(text); } catch (caught) { error = caught; }
    assert.ok(error);
    assert.equal(facebookReplyOutcome(1, false, error).status, "pending");
    assert.equal(facebookReplyOutcome(8, false, error).status, "failed");
  }
  assert.doesNotThrow(() => requireFacebookReplyText("Dạ shop nhận đơn ạ"));
  assert.equal(facebookReplyOutcome(1, true, new Error("timeout")).status, "failed");
});

test("failed jobs remain available for staff handoff before accepting a newer turn", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  store.rows[0].status = "failed";
  assert.equal(await enqueueFacebookReply(incoming("m2", 100)), null);
  assert.equal(store.rows[0].messageId, "m1");
  store.rows[0].failureNotifiedAt = new Date();
  assert.ok(await enqueueFacebookReply(incoming("m2", 100)));
  assert.equal(store.rows[0].messageId, "m2");
});

test("staff handoff is scoped to page/company and retries without duplicate logs or tags", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  store.rows[0].status = "failed";
  const logs = new Store();
  const conversations = new Store();
  conversations.rows.push({ _id: new Types.ObjectId(conversationId), pageId: "page-a", tags: [], unreadCount: 0, status: "closed" });
  conversations.rows.push({ _id: new Types.ObjectId(), pageId: "page-b", tags: [], unreadCount: 0 });
  t.mock.method(AIReplyLogModel, "updateOne", async (filter: Row, update: Update, options: { upsert?: boolean }) => logs.update(filter, update, options));
  t.mock.method(FBConversationModel, "findOneAndUpdate", async (filter: Row, update: Update) => {
    conversations.update(filter, update); return conversations.find(filter);
  });
  const failed = { conversationId: new Types.ObjectId(conversationId), pageId: "page-a", messageId: "m1",
    text: "Xin chào", deliveryStartedAt: new Date(), lastError: "network timeout" };
  const interrupted = t.mock.method(FBConversationModel, "findOneAndUpdate", async () => { throw new Error("DB interrupted"); });
  await assert.rejects(reportFacebookReplyFailure(failed, "SHOP-A"), /DB interrupted/);
  assert.equal(store.rows[0].failureNotifiedAt, undefined);
  assert.equal(logs.rows.length, 1);
  interrupted.mock.restore();
  await reportFacebookReplyFailure(failed, "SHOP-A");
  await reportFacebookReplyFailure(failed, "SHOP-A");
  assert.equal(logs.rows.length, 1);
  assert.equal(logs.rows[0].companyCode, "SHOP-A");
  assert.match(String(logs.rows[0].aiResponse), /gửi một phần/);
  assert.deepEqual(conversations.rows[0].tags, ["AI cần kiểm tra"]);
  assert.equal(conversations.rows[0].unreadCount, 1);
  assert.deepEqual(conversations.rows[1].tags, []);
  assert.ok(store.rows[0].failureNotifiedAt);
});

test("exhausted expired jobs fail without changing another customer's active lease", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  await claimFacebookReply(conversationId, "m1");
  store.rows[0].attempts = 8;
  store.rows[0].leaseUntil = new Date(0);
  const otherId = "507f1f77bcf86cd799439012";
  await enqueueFacebookReply({ ...incoming(), conversationId: otherId });
  const active = await claimFacebookReply(otherId, "m1");
  assert.ok(active);
  await expireFacebookReplyJobs();
  assert.equal(store.rows[0].status, "failed");
  assert.equal(store.rows[1].status, "processing");
  assert.equal(store.rows[1].leaseToken, active.leaseToken);
});

test("duplicate callbacks preserve retry backoff and attempt count", async t => {
  const store = setup(t);
  await enqueueFacebookReply(incoming());
  const due = new Date(Date.now() + 60_000);
  store.rows[0].attempts = 3;
  store.rows[0].nextAttemptAt = due;
  assert.equal(value(await enqueueFacebookReply(incoming())), value(due));
  assert.equal(store.rows[0].attempts, 3);
  assert.equal(await claimFacebookReply(conversationId, "m1"), null);
});
