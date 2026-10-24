import assert from "node:assert/strict";
import test from "node:test";
import { createChatAiTrace, withChatAiTrace, describeChatAiTrace } from "../chat-ai-trace";
import { openrouterChat } from "../openrouter.service";

test("AI request metrics stay isolated between concurrent conversations", async t => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
  const first = createChatAiTrace();
  const second = createChatAiTrace();
  await Promise.all([
    withChatAiTrace(first, () => openrouterChat({ model: "vision", maxRetries: 1, messages: [{ role: "user", content: [
      { type: "text", text: "Mẫu này" }, { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
    ] }] })),
    withChatAiTrace(second, () => openrouterChat({ model: "text", maxRetries: 1, messages: [{ role: "user", content: "Giờ mở cửa" }] })),
  ]);
  assert.equal(describeChatAiTrace(first).requestCount, 1);
  assert.equal(describeChatAiTrace(first).imageRequestCount, 1);
  assert.equal(describeChatAiTrace(second).imageRequestCount, 0);
  assert.deepEqual(describeChatAiTrace(second).models, ["text"]);
  assert.doesNotMatch(JSON.stringify(first), /data:image|base64|Mẫu/);
});

test("expired turn deadlines stop before any provider request", async t => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; });
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("No request allowed"); });
  await assert.rejects(openrouterChat({ model: "test", deadlineAt: Date.now() - 1,
    messages: [{ role: "user", content: "test" }] }), /deadline exceeded/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("a provider error cannot echo private image data into application logs", async t => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async () => new Response("private-data:image/png;base64,AQID", { status: 400 }));
  await assert.rejects(openrouterChat({ model: "test", maxRetries: 1, messages: [{ role: "user",
    content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } }] }] }), error => {
    assert.doesNotMatch(String(error), /private|base64/);
    assert.doesNotMatch(JSON.stringify(error), /private|base64/);
    return true;
  });
});
