import assert from "node:assert/strict";
import test from "node:test";
import { API_COSTS } from "../../wallet.service";
import {
  createHtmlVideoDraftService,
  type HtmlVideoDraftActor,
  type HtmlVideoDraftDependencies,
} from "../html-video-draft.service";

const validInput = {
  prompt: "  Tạo intro công nghệ với tiêu đề đi lên từ dưới.  ",
  durationSeconds: 5,
  aspectRatio: "16:9" as const,
  resolution: "720p" as const,
};

const actor: HtmlVideoDraftActor = {
  id: "user-1",
  companyCode: "ACME",
};

type HarnessOptions = {
  responses?: string[];
  validateError?: Error;
  sanitizedHtml?: string;
  sanitizedCss?: string;
};

function createHarness(options: HarnessOptions = {}) {
  const responses = options.responses ?? [
    JSON.stringify({ html: "<main>Hợp lệ</main>", css: "main{color:white}" }),
  ];
  const events: string[] = [];
  const chatParams: Parameters<HtmlVideoDraftDependencies["chat"]>[0][] = [];
  const validatedSources: Parameters<
    HtmlVideoDraftDependencies["validateComposition"]
  >[0][] = [];
  let chatCount = 0;
  let balanceCount = 0;
  let deductCount = 0;

  const dependencies: HtmlVideoDraftDependencies = {
    chat: async (params) => {
      events.push("chat");
      chatParams.push(params);
      const response = responses[Math.min(chatCount, responses.length - 1)];
      chatCount += 1;
      return { text: response };
    },
    checkBalance: async (userId, amount) => {
      events.push("balance");
      balanceCount += 1;
      assert.equal(userId, actor.id);
      assert.equal(amount, API_COSTS.AI_HTML_CHAT);
    },
    validateComposition: (source) => {
      events.push("validate");
      validatedSources.push(source);
      if (options.validateError) throw options.validateError;
      return {
        sanitizedHtml: options.sanitizedHtml ?? source.html,
        sanitizedCss: options.sanitizedCss ?? source.css,
        compositionHtml: "<!doctype html>",
        width: 1280,
        height: 720,
      };
    },
    deductBalance: async (userId, amount, description) => {
      events.push("deduct");
      deductCount += 1;
      assert.equal(userId, actor.id);
      assert.equal(amount, API_COSTS.AI_HTML_CHAT);
      assert.equal(description, "Chi phí tạo HTML/CSS video bằng AI");
    },
  };

  return {
    service: createHtmlVideoDraftService(dependencies),
    events,
    chatParams,
    validatedSources,
    chatCalls: () => chatCount,
    balanceCalls: () => balanceCount,
    deductCalls: () => deductCount,
  };
}

test("checks balance, validates generated source, then deducts exactly once", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: '<main class="hero"><h1>Khóa học AI</h1></main>',
        css: ".hero{animation:enter 1s ease-out both}@keyframes enter{from{opacity:0}to{opacity:1}}",
      }),
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(result, {
    html: '<main class="hero"><h1>Khóa học AI</h1></main>',
    css: ".hero{animation:enter 1s ease-out both}@keyframes enter{from{opacity:0}to{opacity:1}}",
  });
  assert.deepEqual(harness.events, ["balance", "chat", "validate", "deduct"]);
  assert.equal(harness.balanceCalls(), 1);
  assert.equal(harness.deductCalls(), 1);
});

test("sends the trimmed prompt and requested video settings to the model", async () => {
  const harness = createHarness();

  await harness.service.generate(actor, {
    ...validInput,
    durationSeconds: 8,
    aspectRatio: "9:16",
    resolution: "1080p",
  });

  const [params] = harness.chatParams;
  assert.equal(params.model, process.env.AI_HTML_MODEL || "google/gemini-2.5-flash");
  assert.equal(params.temperature, 0.35);
  assert.equal(params.jsonMode, true);
  assert.deepEqual(params.responseSchema, { html: "string", css: "string" });
  assert.equal(params.maxRetries, 1);
  assert.equal(params.maxTokens, 10_000);
  assert.equal(params.timeoutMs, 45_000);
  assert.deepEqual(params.messages.at(-1), {
    role: "user",
    content: validInput.prompt.trim(),
  });
  assert.match(JSON.stringify(params.messages), /1080\s*(x|×)\s*1920/);
  assert.match(JSON.stringify(params.messages), /8\s*(giây|seconds)/);
});

test("rejects empty and overlong prompts before billing or provider calls", async () => {
  const harness = createHarness();

  for (const prompt of ["   ", "a".repeat(4_001)]) {
    await assert.rejects(
      harness.service.generate(actor, { ...validInput, prompt }),
      /nhập mô tả video|4\.000/
    );
  }

  assert.equal(harness.balanceCalls(), 0);
  assert.equal(harness.chatCalls(), 0);
  assert.equal(harness.deductCalls(), 0);
});

test("strictly parses valid JSON and returns validator-sanitized source", async () => {
  const harness = createHarness({
    responses: [' {"html":"  <main>Hợp lệ</main>  ","css":"  main{color:white}  "} '],
    sanitizedHtml: "<main>Đã làm sạch</main>",
    sanitizedCss: "main{color:#fff}",
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(harness.validatedSources, [
    {
      html: "<main>Hợp lệ</main>",
      css: "main{color:white}",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    },
  ]);
  assert.deepEqual(result, {
    html: "<main>Đã làm sạch</main>",
    css: "main{color:#fff}",
  });
});

test("retries malformed output once and charges once after a valid retry", async () => {
  const harness = createHarness({
    responses: [
      "not-json",
      JSON.stringify({ html: "<main>Hợp lệ</main>", css: "main{color:white}" }),
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.equal(result.html, "<main>Hợp lệ</main>");
  assert.equal(harness.balanceCalls(), 1);
  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 1);
});

test("does not charge after two malformed responses", async () => {
  const harness = createHarness({ responses: ["not-json", "{}"] });

  await assert.rejects(
    harness.service.generate(actor, validInput),
    /HTML\/CSS hợp lệ/
  );

  assert.equal(harness.balanceCalls(), 1);
  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 0);
});

test("does not charge when the validator rejects both attempts", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({ html: '<main onclick="alert(1)">X</main>', css: "" }),
      JSON.stringify({ html: "<script>alert(1)</script>", css: "" }),
    ],
    validateError: new Error("HTML chứa nội dung không được phép."),
  });

  await assert.rejects(
    harness.service.generate(actor, validInput),
    /HTML\/CSS hợp lệ/
  );

  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 0);
});

for (const text of [
  '```json\n{"html":"<main>X</main>","css":""}\n```',
  '{"html":"","css":"main{}"}',
  '{"html":"<main>X</main>"}',
  JSON.stringify({ html: "<main>X</main>", css: 4 }),
  JSON.stringify({ html: "é".repeat(51_201), css: "" }),
  JSON.stringify({ html: "<main>X</main>", css: "é".repeat(51_201) }),
]) {
  test(`rejects invalid provider output: ${text.slice(0, 20)}`, async () => {
    const harness = createHarness({ responses: [text, text] });

    await assert.rejects(
      harness.service.generate(actor, validInput),
      /HTML\/CSS hợp lệ/
    );

    assert.equal(harness.chatCalls(), 2);
    assert.equal(harness.deductCalls(), 0);
  });
}
