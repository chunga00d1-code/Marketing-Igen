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

test("uses strict JSON Schema and downgrades once when a provider rejects it", async (context) => {
  const previousApiKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  context.after(() => {
    if (previousApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousApiKey;
  });
  context.mock.method(console, "warn", () => undefined);
  const requestBodies: Array<Record<string, unknown>> = [];
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    if (requestBodies.length === 1) return new Response("unsupported", { status: 400 });
    return Response.json({
      model: "qwen/qwen3.8-max",
      choices: [{ message: { content: '{"scene":{"purpose":"content"}}' } }],
    });
  });

  const result = await openrouterChat({
    model: "qwen/qwen3.8-max",
    messages: [{ role: "user", content: "Return a scene" }],
    responseSchema: { scene: { purpose: "opening|content|closing" } },
    strictJsonSchema: true,
    maxRetries: 1,
  });

  assert.equal(result.text, '{"scene":{"purpose":"content"}}');
  const strictFormat = requestBodies[0].response_format as {
    type?: string;
    json_schema?: { schema?: { additionalProperties?: boolean } };
  };
  assert.equal(strictFormat.type, "json_schema");
  assert.equal(strictFormat.json_schema?.schema?.additionalProperties, false);
  assert.deepEqual(requestBodies[1].response_format, { type: "json_object" });
});

test("empty completions retain safe token diagnostics without treating reasoning as a reply", async t => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  t.mock.method(globalThis, "fetch", async () => Response.json({
    choices: [{ finish_reason: "length", message: { content: "", reasoning: "Internal reasoning must not become the customer reply" } }],
    usage: { completion_tokens: 1200, completion_tokens_details: { reasoning_tokens: 1200 } },
  }));
  await assert.rejects(openrouterChat({ model: "openai/gpt-6-luna", messages: [{ role: "user", content: "Check reply" }], maxRetries: 1 }), error => {
    const detail = error as Error & { finishReason?: string; completionTokens?: number; reasoningTokens?: number };
    assert.equal(detail.message, "OpenRouter returned an empty completion.");
    assert.equal(detail.finishReason, "length");
    assert.equal(detail.completionTokens, 1200);
    assert.equal(detail.reasoningTokens, 1200);
    return true;
  });
});

test("nonempty structured output exposes token diagnostics internally without changing the response shape", async t => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey; });
  let body: Record<string, unknown>;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ model: "openai/gpt-6-luna", choices: [{ finish_reason: "length", message: { content: '{"unfinished":' } }],
      usage: { completion_tokens: 4096, completion_tokens_details: { reasoning_tokens: 4000 } } });
  });
  let diagnostics: unknown;
  const result = await openrouterChat({ model: "openai/gpt-6-luna", messages: [{ role: "user", content: "Check" }],
    operation: "reply_rule_review", onDiagnostics: value => { diagnostics = value; } });
  assert.deepEqual(Object.keys(result), ["text"]);
  assert.deepEqual(diagnostics, { model: "openai/gpt-6-luna", finishReason: "length", completionTokens: 4096, reasoningTokens: 4000 });
  assert.equal(body.operation, undefined);
  assert.equal(body.onDiagnostics, undefined);
});
