import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { AI_REPLY_PRIMARY_MODEL, AI_REPLY_FALLBACK_MODEL } from "../../../shared/ai-reply-models";
import { GeminiChatService } from "../gemini/chat.service";
import { generateText } from "../gemini/core";
import { generateReplyCompletion } from "../ai-reply-provider";

function mockProvider(context: TestContext, outputs: string[]) {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFallback = process.env.FALLBACK_MODEL;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.FALLBACK_MODEL = "google/legacy-model";
  context.after(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalFallback === undefined) delete process.env.FALLBACK_MODEL;
    else process.env.FALLBACK_MODEL = originalFallback;
  });
  const requests: Array<{ model: string; messages: unknown[]; max_tokens?: number }> = [];
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const content = outputs[requests.length];
    requests.push(body);
    assert.notEqual(content, undefined, "Unexpected provider request");
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  return requests;
}

test("inbox generation and both reviews ignore a saved legacy model", async context => {
  const requests = mockProvider(context, ["Chị xem mẫu nhé", JSON.stringify({ compliant: true, correctedParts: ["Chị xem mẫu nhé"] }), JSON.stringify({ compliant: true })]);
  await new GeminiChatService().chat("Cho xem mẫu", [], {
    companyName: "Test", model: "deepseek-v4-flash-0731", customerAddressStyle: "chị",
  });
  assert.deepEqual(requests.map(item => item.model), Array(3).fill(AI_REPLY_PRIMARY_MODEL));
});

test("comment and follow-up ignore saved model overrides", async context => {
  const requests = mockProvider(context, [JSON.stringify({ publicComment: "Mình đã gửi thông tin", privateInbox: "Gói CRM hỗ trợ quản lý khách hàng" }), "Mình có thể hỗ trợ thêm về CRM nhé"]);
  const service = new GeminiChatService();
  const aiConfig = { companyName: "Test", model: "google/gemini-3.1-pro" };
  await service.chatComment("Gói CRM có gì?", aiConfig);
  await service.generateFollowUpMessage({ history: [{ sender: "user", text: "Quan tâm CRM" }], aiConfig });
  assert.deepEqual(requests.map(item => item.model), [AI_REPLY_PRIMARY_MODEL, AI_REPLY_PRIMARY_MODEL]);
});

test("reply generation falls back to DeepSeek 4.1 despite conflicting env and call options", async context => {
  const requests = mockProvider(context, ["", "Dạ chị xem mẫu nhé"]);
  const result = await generateText(AI_REPLY_PRIMARY_MODEL, "Cho xem mẫu", { maxRetries: 1, fallbackModel: "google/another-model" });
  assert.equal(result.text, "Dạ chị xem mẫu nhé");
  assert.deepEqual(requests.map(item => item.model), [AI_REPLY_PRIMARY_MODEL, AI_REPLY_FALLBACK_MODEL]);
});

test("catalog and order provider retries invalid JSON with the same schema on DeepSeek 4.1", async context => {
  const requests = mockProvider(context, ["invalid JSON", '{"categoryIndex":0}']);
  const result = await generateReplyCompletion({
    messages: [{ role: "user", content: "Chọn danh mục" }], jsonMode: true,
    responseSchema: { categoryIndex: -1 }, maxRetries: 1, maxTokens: 1800,
  });
  assert.deepEqual(JSON.parse(result.text), { categoryIndex: 0 });
  assert.deepEqual(requests.map(item => item.model), [AI_REPLY_PRIMARY_MODEL, AI_REPLY_FALLBACK_MODEL]);
  assert.deepEqual(requests[0].messages, requests[1].messages);
  assert.equal(requests[1].max_tokens, 1800);
});

test("both failed models block output instead of selecting a third model", async context => {
  const requests = mockProvider(context, ["", ""]);
  await assert.rejects(generateReplyCompletion({ messages: [{ role: "user", content: "Trích xuất đơn" }], maxRetries: 1 }), /empty completion/);
  assert.deepEqual(requests.map(item => item.model), [AI_REPLY_PRIMARY_MODEL, AI_REPLY_FALLBACK_MODEL]);
});
