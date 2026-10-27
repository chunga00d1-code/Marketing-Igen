import assert from "node:assert/strict";
import test from "node:test";
import { fbMessengerService } from "../fb-messenger.service";
import { FBConversationModel, FBMessageModel } from "../../model/fb-messenger.model";
import { FACEBOOK_AI_METADATA } from "../facebook-human-intervention";

test("AI send rechecks pause after loading credentials and never calls Facebook after handoff", async t => {
  let paused = false;
  t.mock.method(FBConversationModel, "findOne", async () => ({ _id: "conversation", pageId: "page", recipientId: "customer" }));
  t.mock.method(FBConversationModel, "exists", async () => paused ? { _id: "conversation" } : null);
  t.mock.method(fbMessengerService, "getPageAccessTokenByPageId", async () => { paused = true; return "test-token"; });
  t.mock.method(FBMessageModel, "findOne", () => ({ sort: async () => ({ timestamp: new Date() }) }));
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not send"); });
  await assert.rejects(fbMessengerService.sendReply("page", "conversation", "AI answer", "ai"), { code: "FB_AI_PAUSED" });
  assert.equal(fetch.mock.callCount(), 0);
});

test("AI echo is handled without triggering inbound AI or pausing the conversation", async t => {
  const inbound = t.mock.method(fbMessengerService, "processIncomingMessage", async () => undefined);
  const pause = t.mock.method(FBConversationModel, "findOneAndUpdate", async () => { throw new Error("Must not pause"); });
  await fbMessengerService.handleWebhookEvent({ object: "page", entry: [{ id: "page", messaging: [{
    sender: { id: "page" }, recipient: { id: "customer" }, timestamp: Date.now(),
    message: { is_echo: true, mid: "ai-mid", text: "AI answer", metadata: FACEBOOK_AI_METADATA },
  }] }] });
  assert.equal(inbound.mock.callCount(), 0);
  assert.equal(pause.mock.callCount(), 0);
});

test("Page webhook subscription includes human outbound echo events", async t => {
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(String(input));
    assert.ok(url.searchParams.get("subscribed_fields")?.split(",").includes("message_echoes"));
    return new Response(JSON.stringify({ success: true }));
  });
  assert.equal((await fbMessengerService.subscribePageWebhooks("real-page", "test-token")).success, true);
});
