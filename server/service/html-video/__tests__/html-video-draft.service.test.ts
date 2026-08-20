import assert from "node:assert/strict";
import test from "node:test";
import { API_COSTS } from "../../wallet.service";
import {
  createHtmlVideoDraftService,
  type HtmlVideoDraftActor,
  type HtmlVideoDraftDependencies,
} from "../html-video-draft.service";
import { buildSafeHtmlVideoComposition } from "../html-video-security.service";

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
  assert.equal(
    params.model,
    process.env.HTML_VIDEO_MODEL ||
    process.env.GEMINI_MODEL ||
    "google/gemini-2.5-flash"
  );
  assert.equal(params.temperature, 0.2);
  assert.equal(params.jsonMode, true);
  assert.deepEqual(params.responseSchema, {
    videoBrief: {
      objective: "string", tone: "string", visualStyle: "string", voiceRequired: "boolean",
      language: "string", audience: "string", cta: "string", exactPhrases: ["string"],
    },
    scenePlan: [{
      id: "string", purpose: "opening|content|closing", sourceUnitIds: ["unit-id"],
      onScreenText: ["string"], narration: "string", startSeconds: "number",
      endSeconds: "number", transition: "crossfade|slide-left|slide-right", assetIds: ["asset-id"],
    }],
  });
  assert.equal(params.maxRetries, 1);
  assert.equal(params.maxTokens, 8_192);
  assert.equal(params.timeoutMs, 120_000);
  assert.equal(params.messages.at(-1)?.role, "user");
  assert.match(String(params.messages.at(-1)?.content), new RegExp(validInput.prompt.trim()));
  assert.match(JSON.stringify(params.messages), /1080\s*(x|×)\s*1920/);
  assert.match(JSON.stringify(params.messages), /8\s*(giây|seconds)/);
  assert.match(JSON.stringify(params.messages), /Requirement and Storyboard Planner/i);
  assert.match(JSON.stringify(params.messages), /structured plan only/i);
  assert.match(JSON.stringify(params.messages), /exactly once and in order/i);
  assert.match(JSON.stringify(params.messages), /contiguous without overlap/i);
  assert.match(JSON.stringify(params.messages), /RUNTIME HTML-TO-VIDEO SKILL/);
  assert.match(JSON.stringify(params.messages), /final deliverable is a rendered MP4/i);
  assert.match(JSON.stringify(params.messages), /source facts, scene purposes, on-screen text, narration, and time ranges/i);
  assert.match(JSON.stringify(params.messages), /visible text, narration, scene order, and duration semantically aligned/i);
  assert.match(JSON.stringify(params.messages), /AUTHORITATIVE CONTENT UNITS/i);
});

test("retries a scrollable page composition and accepts a fixed composition", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: "<main>Scrollable</main>",
        css: "main{overflow-y:auto}",
      }),
      JSON.stringify({
        html: "<main>Fixed</main>",
        css: "main{overflow:hidden}",
      }),
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(result, {
    html: "<main>Fixed</main>",
    css: "main{overflow:hidden}",
  });
  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 1);
});

test("repairs model vertical movement into a horizontal transition before validation", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: "<main>Vertical</main>",
        css: "@keyframes enter{from{transform:translateY(-20px)}}",
      }),
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(result, {
    html: "<main>Vertical</main>",
    css: "@keyframes enter{from{transform:translateX(-20px)}}",
  });
  assert.equal(harness.chatCalls(), 1);
  assert.equal(harness.deductCalls(), 1);
});

test("repairs viewport-sized model CSS to the fixed composition canvas", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: "<main>Fixed canvas</main>",
        css: "main{width:100dvw;height:100vh;min-height:100dvh;max-width:100vw}",
      }),
    ],
  });
  const result = await harness.service.generate(actor, validInput);
  assert.deepEqual(result, {
    html: "<main>Fixed canvas</main>",
    css: "main{width:100%;height:100%;min-height:100%;max-width:100%}",
  });
  assert.equal(harness.chatCalls(), 1);
  assert.equal(harness.deductCalls(), 1);
});

test("accepts small decorative labels when the scene deck has readable hierarchy", async () => {
  const harness = createHarness({
    responses: [JSON.stringify({
      html: '<main class="scene-deck"><section class="scene">Readable <small>Label</small></section></main>',
      css: ".scene-deck{background:linear-gradient(135deg,#172554,#0f766e);box-shadow:0 24px 80px #020617}.scene{font-size:96px}.scene small{font-size:18px}",
    })],
  });
  const result = await harness.service.generate(actor, validInput);
  assert.match(result.css, /font-size:18px/);
  assert.equal(harness.chatCalls(), 1);
  assert.equal(harness.deductCalls(), 1);
});

test("accepts a full-height white scene when the deck still has an intentional theme", async () => {
  const harness = createHarness({
    responses: [JSON.stringify({
      html: '<main class="scene-deck"><section class="scene">White scene</section></main>',
      css: ".scene-deck{background:linear-gradient(135deg,#172554,#0f766e);box-shadow:0 24px 80px #020617}.scene{height:100%;background:white;font-size:96px}",
    })],
  });
  const result = await harness.service.generate(actor, validInput);
  assert.match(result.css, /height:100%;background:white/);
  assert.equal(harness.chatCalls(), 1);
  assert.equal(harness.deductCalls(), 1);
});

test("retries an under-scaled flat scene deck and accepts a designed readable deck", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: '<main class="scene-deck"><section class="scene">Small</section></main>',
        css: ".scene{font-size:18px;background:#fff}",
      }),
      JSON.stringify({
        html: '<main class="scene-deck"><section class="scene">Readable</section></main>',
        css: [
          ".scene-deck{background:linear-gradient(135deg,#172554,#0f766e);border-radius:48px;box-shadow:0 24px 80px #020617}",
          ".scene{font-size:96px;border:2px solid #fbbf24}",
          ".scene::before{content:'';filter:blur(20px)}",
        ].join(""),
      }),
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(result, {
    html: '<main class="scene-deck"><section class="scene">Readable</section></main>',
    css: [
      ".scene-deck{background:linear-gradient(135deg,#172554,#0f766e);border-radius:48px;box-shadow:0 24px 80px #020617}",
      ".scene{font-size:96px;border:2px solid #fbbf24}",
      ".scene::before{content:'';filter:blur(20px)}",
    ].join(""),
  });
  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 1);
});


test("enforces the explicit storyboard scene count and continuous narration", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: '<main class="scene-deck"><section class="scene">One</section></main>',
        css: ".scene{font-size:96px}",
      }),
      JSON.stringify({
        html: '<main class="scene-deck"><section class="scene">One</section><section class="scene">Two</section></main>',
        css: ".scene-deck{background:linear-gradient(135deg,#172554,#0f766e);border-radius:48px;box-shadow:0 24px 80px #020617}.scene{font-size:96px;border:2px solid #fbbf24}.scene::before{content:'';filter:blur(20px)}",
        voiceScript: "Một câu chuyện ngắn nối hai cảnh một cách tự nhiên.",
      }),
    ],
  });

  const result = await harness.service.generate(actor, {
    ...validInput,
    durationSeconds: 5,
    primaryPromptContext: "SCENE 01 — Opening\nSCENE 02 — Closing",
  });

  assert.deepEqual(result, {
    html: '<main class="scene-deck"><section class="scene">One</section><section class="scene">Two</section></main>',
    css: ".scene-deck{background:linear-gradient(135deg,#172554,#0f766e);border-radius:48px;box-shadow:0 24px 80px #020617}.scene{font-size:96px;border:2px solid #fbbf24}.scene::before{content:'';filter:blur(20px)}",
    voiceScript: "Một câu chuyện ngắn nối hai cảnh một cách tự nhiên.",
  });

  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 1);
});
test("passes analyzed reference context to the model as a reusable template constraint", async () => {
  const harness = createHarness();

  await harness.service.generate(actor, {
    ...validInput,
    referenceContext: "dominant background: warm cream; layout: centered card; avoid black background",
  });

  const userMessage = harness.chatParams[0].messages.at(-1)?.content;
  assert.equal(typeof userMessage, "string");
  assert.match(String(userMessage), /VISUAL\/DOCUMENT REFERENCE CONTEXT/);
  assert.match(String(userMessage), /warm cream/);
  assert.match(String(userMessage), /reusable HTML\/CSS template/);
  assert.match(String(userMessage), /current user request control the new theme/);
});

test("passes a long prompt as an authoritative primary prompt file context", async () => {
  const harness = createHarness();
  const primaryPrompt = [
    "30-second vertical product video.",
    "Keep the Vietnamese narration continuous and preserve every scene requirement.",
    "Do not invent product specifications.",
  ].join("\n");

  await harness.service.generate(actor, {
    ...validInput,
    prompt: "Hãy dùng toàn bộ nội dung trong tệp prompt-day-du.txt làm yêu cầu chính.",
    primaryPromptContext: primaryPrompt,
    primaryPromptFileName: "prompt-day-du.txt",
  });

  const userMessage = String(harness.chatParams[0].messages.at(-1)?.content);
  assert.match(userMessage, /PRIMARY USER PROMPT FILE/);
  assert.match(userMessage, /prompt-day-du\.txt/);
  assert.match(userMessage, /continuous and preserve every scene requirement/);
  assert.match(userMessage, /Do not summarize, omit/);
});

test("keeps the primary prompt within the generation budget before auxiliary context", async () => {
  const harness = createHarness();
  const primaryPrompt = "P".repeat(23_000);
  const referenceContext = "R".repeat(24_000);

  await harness.service.generate(actor, {
    ...validInput,
    prompt: "Hãy dùng toàn bộ nội dung trong tệp prompt-day-du.txt.",
    primaryPromptContext: primaryPrompt,
    primaryPromptFileName: "prompt-day-du.txt",
    referenceContext,
  });

  const userMessage = String(harness.chatParams[0].messages.at(-1)?.content);
  assert.ok(userMessage.length <= 42_000);
  assert.match(userMessage, new RegExp(`P{${primaryPrompt.length}}`));
  assert.match(userMessage, /CURRENT USER REQUEST/);
  assert.ok(!userMessage.includes(referenceContext));
});

test("passes recommended image slots without exposing their asset data to the model", async () => {
  const harness = createHarness();

  await harness.service.generate(actor, {
    ...validInput,
    referenceAssets: [{
      id: "reference-1",
      name: "Logo",
      kind: "image",
      role: "logo",
      includeInVideo: true,
    }],
  });

  const userMessage = String(harness.chatParams[0].messages.at(-1)?.content);
  assert.match(userMessage, /slot=reference-1/);
  assert.match(JSON.stringify(harness.chatParams[0].messages), /APPROVED ASSET IDS/);
  assert.doesNotMatch(JSON.stringify(harness.chatParams[0].messages), /data:image|https:\/\//i);
});

test("includes the scoped parent prompt chain while keeping the current prompt highest priority", async () => {
  let userMessage = "";
  let receivedHistoryId = "";
  const service = createHtmlVideoDraftService({
    chat: async (params) => {
      const message = params.messages.at(-1);
      userMessage = message?.role === "user" && typeof message.content === "string"
        ? message.content
        : "";
      return { text: JSON.stringify({ html: "<main>AI</main>", css: "" }) };
    },
    checkBalance: async () => undefined,
    deductBalance: async () => undefined,
    validateComposition: buildSafeHtmlVideoComposition,
    loadPromptContext: async (_actor, historyId) => {
      receivedHistoryId = historyId;
      return [
        {
          id: "history-1",
          projectName: "Chiến dịch hè",
          prompt: "Dùng tông xanh và mở đầu bằng vấn đề của khách hàng.",
          revision: 1,
          createdAt: "2026-08-17T00:00:00.000Z",
        },
        {
          id: "history-2",
          projectName: "Chiến dịch hè",
          prompt: "Đổi CTA cuối thành Đăng ký ngay.",
          revision: 2,
          createdAt: "2026-08-17T00:01:00.000Z",
        },
      ];
    },
  });

  await service.generate(actor, {
    ...validInput,
    prompt: "Hãy dùng yêu cầu trong tệp prompt-day-du.txt.",
    promptHistoryId: "history-2",
  });

  assert.equal(receivedHistoryId, "history-2");
  assert.match(userMessage, /LỊCH SỬ PROMPT/);
  assert.match(userMessage, /Dùng tông xanh/);
  assert.match(userMessage, /YÊU CẦU HIỆN TẠI/);
  assert.match(userMessage, /Hãy dùng yêu cầu trong tệp prompt-day-du\.txt/);
  assert.doesNotMatch(userMessage, /Đổi CTA cuối thành Đăng ký ngay\./);
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

test("accepts fenced or wrapped provider JSON while keeping the safe validator as the boundary", async () => {
  const harness = createHarness({
    responses: [
      `Here is the composition:\n\`\`\`json\n${JSON.stringify({
        result: {
          html: "<main>Wrapped</main>",
          css: "main{color:white}",
        },
        providerNote: "ignored",
      })}\n\`\`\``,
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(result, {
    html: "<main>Wrapped</main>",
    css: "main{color:white}",
  });
});

test("moves an accidental style block out of a complete document before validation", async () => {
  const harness = createHarness({
    responses: [
      JSON.stringify({
        html: "<!doctype html><html><head><style>main{color:white}</style></head><body><main>Document</main></body></html>",
        css: "",
      }),
    ],
  });

  const result = await harness.service.generate(actor, validInput);

  assert.deepEqual(result, {
    html: "<main>Document</main>",
    css: "main{color:white}",
  });
});

test("repairs common model-only tags and attributes before the security boundary", async () => {
  const service = createHtmlVideoDraftService({
    chat: async () => ({
      text: JSON.stringify({
        html: '<main style="color:red"><button class="cta" onclick="alert(1)">Mua ngay</button><svg><path /></svg></main>',
        css: ".cta{color:white}",
      }),
    }),
    checkBalance: async () => undefined,
    deductBalance: async () => undefined,
    validateComposition: buildSafeHtmlVideoComposition,
  });

  const result = await service.generate(actor, validInput);

  assert.equal(result.html, '<main><span class="cta">Mua ngay</span></main>');
  assert.equal(result.css, ".cta{color:white}");
});

test("retries an empty sanitized draft once and never charges", async () => {
  let chatCalls = 0;
  let deductCalls = 0;
  const service = createHtmlVideoDraftService({
    chat: async () => {
      chatCalls += 1;
      return { text: JSON.stringify({ html: "<!-- model comment -->", css: "" }) };
    },
    checkBalance: async () => undefined,
    validateComposition: buildSafeHtmlVideoComposition,
    deductBalance: async () => {
      deductCalls += 1;
    },
  });

  await assert.rejects(
    service.generate(actor, validInput),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "AI không tạo được HTML/CSS video hợp lệ. Vui lòng thử lại." &&
      (error as Error & { code?: string }).code === "INVALID_OUTPUT"
  );

  assert.equal(chatCalls, 2);
  assert.equal(deductCalls, 0);
});

test("retries an empty sanitized draft and charges once after a valid result", async () => {
  let chatCalls = 0;
  let validateCalls = 0;
  let deductCalls = 0;
  const service = createHtmlVideoDraftService({
    chat: async () => {
      chatCalls += 1;
      return {
        text: JSON.stringify({
          html:
            chatCalls === 1
              ? "<main>Discarded by sanitizer</main>"
              : "<main>Valid retry</main>",
          css: "",
        }),
      };
    },
    checkBalance: async () => undefined,
    validateComposition: (source) => {
      validateCalls += 1;
      const safe = buildSafeHtmlVideoComposition(source);
      return validateCalls === 1
        ? { ...safe, sanitizedHtml: "   " }
        : safe;
    },
    deductBalance: async () => {
      deductCalls += 1;
    },
  });

  const result = await service.generate(actor, validInput);

  assert.deepEqual(result, { html: "<main>Valid retry</main>", css: "" });
  assert.equal(chatCalls, 2);
  assert.equal(validateCalls, 2);
  assert.equal(deductCalls, 1);
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

test("classifies a provider error without outer retrying, charging, or exposing details", async () => {
  const providerError = new Error(
    "OpenRouter 503 payload={apiKey:'provider-secret'} at C:\\private\\provider.ts"
  );
  let chatCalls = 0;
  let deductCalls = 0;
  const service = createHtmlVideoDraftService({
    chat: async () => {
      chatCalls += 1;
      throw providerError;
    },
    checkBalance: async () => undefined,
    validateComposition: () => {
      throw new Error("validator must not be called");
    },
    deductBalance: async () => {
      deductCalls += 1;
    },
  });

  await assert.rejects(
    service.generate(actor, validInput),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau." &&
      (error as Error & { code?: string; cause?: unknown }).code ===
        "AI_UNAVAILABLE" &&
      (error as Error & { cause?: unknown }).cause === providerError &&
      !error.message.includes("provider-secret") &&
      !error.message.includes("C:\\private")
  );

  assert.equal(chatCalls, 1);
  assert.equal(deductCalls, 0);
});

test("maps OpenRouter model permission failures to an actionable safe error", async () => {
  const providerError = Object.assign(
    new Error("OpenRouter request secret and provider payload"),
    { status: 403 }
  );
  const service = createHtmlVideoDraftService({
    chat: async () => {
      throw providerError;
    },
    checkBalance: async () => undefined,
    validateComposition: buildSafeHtmlVideoComposition,
    deductBalance: async () => undefined,
  });

  await assert.rejects(
    service.generate(actor, validInput),
    (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "MODEL_ACCESS_DENIED" &&
      /chưa được cấp quyền trên OpenRouter/.test(error.message) &&
      !error.message.includes("secret")
  );
});

test("classifies wallet statusCode 402 with a stable safe balance message", async () => {
  const walletError = Object.assign(
    new Error("database payload with wallet-secret"),
    { statusCode: 402 }
  );
  const service = createHtmlVideoDraftService({
    chat: async () => {
      throw new Error("provider must not be called");
    },
    checkBalance: async () => {
      throw walletError;
    },
    validateComposition: buildSafeHtmlVideoComposition,
    deductBalance: async () => undefined,
  });

  await assert.rejects(
    service.generate(actor, validInput),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "Số dư ví không đủ. Vui lòng nạp thêm tiền để tiếp tục." &&
      (error as Error & { code?: string; cause?: unknown }).code ===
        "INSUFFICIENT_BALANCE" &&
      (error as Error & { cause?: unknown }).cause === walletError &&
      !error.message.includes("wallet-secret")
  );
});

test("classifies unknown wallet deduction failures as internal errors", async () => {
  const databaseError = new Error(
    "MongoServerError collection=wallets password=database-secret"
  );
  const service = createHtmlVideoDraftService({
    chat: async () => ({
      text: JSON.stringify({ html: "<main>Valid</main>", css: "" }),
    }),
    checkBalance: async () => undefined,
    validateComposition: buildSafeHtmlVideoComposition,
    deductBalance: async () => {
      throw databaseError;
    },
  });

  await assert.rejects(
    service.generate(actor, validInput),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "Không thể tạo HTML/CSS video lúc này. Vui lòng thử lại sau." &&
      (error as Error & { code?: string; cause?: unknown }).code ===
        "INTERNAL" &&
      (error as Error & { cause?: unknown }).cause === databaseError &&
      !error.message.includes("database-secret")
  );
});

test("does not charge after two malformed responses", async () => {
  const harness = createHarness({ responses: ["not-json", "{}"] });

  await assert.rejects(
    harness.service.generate(actor, validInput),
    /HTML\/CSS video hợp lệ/
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
    /HTML\/CSS video hợp lệ/
  );

  assert.equal(harness.chatCalls(), 2);
  assert.equal(harness.deductCalls(), 0);
});

for (const text of [
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
      /HTML\/CSS video hợp lệ/
    );

    assert.equal(harness.chatCalls(), 2);
    assert.equal(harness.deductCalls(), 0);
  });
}
