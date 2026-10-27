import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { FacebookAutoReplyJobModel } from "../../model/facebook-auto-reply-job.model";
import { FACEBOOK_AI_METADATA, HUMAN_REPLY_PAUSE_MS, assertFacebookAiReplyAllowed,
  recordFacebookHumanEcho } from "../facebook-human-intervention";

function setup(t: TestContext) {
  const conversation = { _id: "conversation", pageId: "page", recipientId: "customer" };
  let existing: { senderType: "human" | "ai" } | null = null;
  t.mock.method(FBConversationModel, "findOne", async filter => {
    assert.deepEqual(filter, { pageId: "page", recipientId: "customer" });
    return conversation;
  });
  t.mock.method(FBMessageModel, "findOne", async () => existing);
  const pause = t.mock.method(FBConversationModel, "findOneAndUpdate", async (filter, update) => {
    assert.deepEqual(filter, { _id: "conversation", pageId: "page" });
    return { ...conversation, aiPausedUntil: update.$max.aiPausedUntil };
  });
  const cancel = t.mock.method(FacebookAutoReplyJobModel, "updateOne", async () => ({}));
  const message = t.mock.method(FBMessageModel, "findOneAndUpdate", async (_filter, update) => {
    existing = { senderType: update.$set.senderType };
    return { ...update.$setOnInsert, ...update.$set };
  });
  t.mock.method(FBConversationModel, "updateOne", async () => ({}));
  return { pause, cancel, message, setExisting: (type: "human" | "ai") => { existing = { senderType: type }; } };
}

const echo = () => ({ sender: { id: "page" }, recipient: { id: "customer" }, timestamp: Date.now(),
  message: { is_echo: true, mid: "human-message", text: "Để tôi tư vấn cho bạn" } });

test("a human Page echo pauses AI for 30 minutes and cancels pending and processing jobs", async t => {
  const state = setup(t);
  const event = echo();
  const result = await recordFacebookHumanEcho("page", event);
  assert.equal(result?.shouldCancel, true);
  assert.equal(result?.conversation.aiPausedUntil?.getTime(), event.timestamp + HUMAN_REPLY_PAUSE_MS);
  assert.deepEqual(state.cancel.mock.calls[0].arguments[0], { channel: "facebook", conversationId: "conversation",
    status: { $in: ["pending", "processing"] } });
  const cancellation = state.cancel.mock.calls[0].arguments[1];
  assert.ok(cancellation && !Array.isArray(cancellation));
  assert.deepEqual(cancellation.$unset, { leaseToken: 1, leaseUntil: 1 });
  assert.equal(state.message.mock.calls[0].arguments[1].$set.senderType, "human");
  await recordFacebookHumanEcho("page", event);
  assert.equal(state.pause.mock.callCount(), 1, "duplicate webhook must not extend or restore a pause");
});

test("own AI echo arriving before message persistence never pauses the conversation", async t => {
  const state = setup(t);
  await recordFacebookHumanEcho("page", { ...echo(), message: { ...echo().message, metadata: FACEBOOK_AI_METADATA } });
  assert.equal(state.pause.mock.callCount(), 0);
  assert.equal(state.message.mock.callCount(), 0);
});

test("persisted AI sends without echo metadata are not treated as humans", async t => {
  const state = setup(t);
  state.setExisting("ai");
  assert.equal(await recordFacebookHumanEcho("page", echo()), null);
  assert.equal(state.pause.mock.callCount(), 0);
});

test("echo attachments also trigger handoff; old events do not restart the pause", async t => {
  const state = setup(t);
  const event = echo();
  const result = await recordFacebookHumanEcho("page", { ...event, timestamp: Date.now() - HUMAN_REPLY_PAUSE_MS - 1000,
    message: { is_echo: true, mid: "old-image", attachments: [{ type: "image", payload: { url: "https://example.com/photo.jpg" } }] } });
  assert.equal(result?.shouldCancel, false);
  assert.equal(state.pause.mock.callCount(), 0);
  assert.equal(state.cancel.mock.callCount(), 0);
  assert.equal(state.message.mock.calls[0].arguments[1].$setOnInsert.attachments[0].type, "image");
});

test("rejects echoes for another Page and malformed events", async t => {
  const state = setup(t);
  assert.equal(await recordFacebookHumanEcho("other-page", echo()), null);
  assert.equal(await recordFacebookHumanEcho("page", { ...echo(), timestamp: NaN }), null);
  assert.equal(await recordFacebookHumanEcho("page", { ...echo(), message: { is_echo: false } }), null);
  assert.equal(state.pause.mock.callCount(), 0);
});

test("last-minute send guard checks persisted pause even if a newer inbound message exists", async t => {
  const read = t.mock.method(FBConversationModel, "exists", async filter => {
    assert.equal(filter.pageId, "page");
    assert.equal(filter._id, "conversation");
    assert.ok(filter.aiPausedUntil.$gt instanceof Date);
    return { _id: "conversation" };
  });
  await assert.rejects(assertFacebookAiReplyAllowed("page", "conversation"), { code: "FB_AI_PAUSED" });
  read.mock.restore();
  t.mock.method(FBConversationModel, "exists", async () => null);
  await assertFacebookAiReplyAllowed("page", "conversation");
});
