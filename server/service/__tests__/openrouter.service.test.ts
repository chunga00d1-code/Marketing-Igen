import assert from "node:assert/strict";
import test from "node:test";
import { openrouterChat } from "../openrouter.service";

test("retries an empty successful completion and forwards bounded reasoning", async (context) => {
  const previousApiKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => {
    if (previousApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousApiKey;
  });

  const requestBodies: Record<string, unknown>[] = [];
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    calls += 1;
    requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({
      model: "qwen/qwen3.7-flash",
      choices: [{ message: { content: calls === 1 ? "" : '{"ok":true}' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const result = await openrouterChat({
    model: "qwen/qwen3.7-flash",
    messages: [{ role: "user", content: "Return JSON" }],
    jsonMode: true,
    maxRetries: 2,
    reasoning: { maxTokens: 1_024, exclude: true },
  });

  assert.equal(result.text, '{"ok":true}');
  assert.equal(calls, 2);
  assert.deepEqual(requestBodies[0].reasoning, {
    max_tokens: 1_024,
    exclude: true,
  });
});
