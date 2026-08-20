import assert from "node:assert/strict";
import test from "node:test";
import {
  htmlVideoRenderService,
  parseHtmlVideoDraftResponse,
  parseHtmlVideoGenerationResponse,
  parseHtmlVideoPreviewResponse,
  parseHtmlVideoRenderResponse,
  pollHtmlVideoGeneration,
} from "../htmlVideoRenderService";

const originalFetch = globalThis.fetch;
const previewInput = {
  html: '<main class="hero">Xin chào</main>',
  css: ".hero { color: white; }",
  durationSeconds: 5,
  aspectRatio: "16:9" as const,
  resolution: "720p" as const,
};
const draftInput = {
  prompt: "Tạo intro công nghệ với tiêu đề chuyển động.",
  durationSeconds: 5,
  aspectRatio: "16:9" as const,
  resolution: "720p" as const,
};
const activeRender = {
  id: "render-1",
  status: "rendering",
  progress: 60,
  stageMessage: "Rendering video frames.",
  aspectRatio: "16:9",
  resolution: "720p",
  durationSeconds: 5,
  outputUrl: "https://cdn.example/not-ready.mp4",
  error: null,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:01:00.000Z",
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) =>
      key === "accessToken" ? "html-video-test-token" : null,
  },
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("parses a safe preview response", () => {
  const preview = parseHtmlVideoPreviewResponse({
    success: true,
    data: {
      compositionHtml:
        '<!doctype html><html data-composition-id="html-video"></html>',
      width: 1280,
      height: 720,
    },
  });

  assert.equal(preview.width, 1280);
  assert.equal(preview.height, 720);
  assert.match(preview.compositionHtml, /data-composition-id="html-video"/);
});

test("parses a strict HTML video draft response with trimmed HTML and CSS", () => {
  assert.deepEqual(
    parseHtmlVideoDraftResponse({
      success: true,
      data: { html: "  <main>AI</main>  ", css: "  main{color:white}  " },
    }),
    { html: "<main>AI</main>", css: "main{color:white}" }
  );
});

test("accepts an empty CSS string in an HTML video draft response", () => {
  assert.deepEqual(
    parseHtmlVideoDraftResponse({
      success: true,
      data: { html: "<main>AI</main>", css: "" },
    }),
    { html: "<main>AI</main>", css: "" }
  );
});

test("parses the single contextual voice script returned with a draft", () => {
  assert.deepEqual(
    parseHtmlVideoDraftResponse({
      success: true,
      data: {
        html: "<main>AI</main>",
        css: "",
        voiceScript: "  Welcome to the product story.  ",
      },
    }),
    {
      html: "<main>AI</main>",
      css: "",
      voiceScript: "Welcome to the product story.",
    }
  );
});

test("parses structured pipeline provenance returned with a draft", () => {
  const pipeline = {
    version: "2.0",
    sourceText: "Tạo video hai cảnh",
    sourceContextRefs: [],
    videoBrief: { objective: "Tạo video" },
    contentUnits: [{ id: "unit-1" }],
    scenePlan: [{ id: "scene-1" }],
    findings: [],
  };
  const result = parseHtmlVideoDraftResponse({
    success: true,
    data: {
      html: "<main>Video</main>",
      css: "",
      voiceScript: "Lời đọc.",
      pipeline,
    },
  });
  assert.equal(result.pipeline?.version, "2.0");
  assert.equal(result.pipeline?.scenePlan.length, 1);
});

test("rejects unknown keys in the HTML video draft envelope and data", () => {
  const invalidDraftMessage =
    "Dữ liệu bản nháp HTML-to-video không hợp lệ.";
  for (const payload of [
    {
      success: true,
      data: { html: "<main>AI</main>", css: "" },
      providerTrace: "must-not-be-accepted",
    },
    {
      success: true,
      data: {
        html: "<main>AI</main>",
        css: "",
        previewHtml: "<script>must-not-be-accepted</script>",
      },
    },
  ]) {
    assert.throws(
      () => parseHtmlVideoDraftResponse(payload),
      (error: unknown) =>
        error instanceof Error && error.message === invalidDraftMessage
    );
  }
});

test("rejects HTML video draft source over 100 KiB by UTF-8 byte length", () => {
  const invalidDraftMessage =
    "Dữ liệu bản nháp HTML-to-video không hợp lệ.";
  for (const data of [
    { html: `<main>${"é".repeat(51_201)}</main>`, css: "" },
    { html: "<main>AI</main>", css: "é".repeat(51_201) },
  ]) {
    assert.throws(
      () => parseHtmlVideoDraftResponse({ success: true, data }),
      (error: unknown) =>
        error instanceof Error && error.message === invalidDraftMessage
    );
  }
});

test("rejects invalid HTML video draft response envelopes and source fields", () => {
  const invalidDraftMessage = "Dữ liệu bản nháp HTML-to-video không hợp lệ.";
  for (const payload of [
    null,
    { success: false, data: { html: "<main>AI</main>", css: "" } },
    { success: true, data: null },
    { success: true, data: { html: "   ", css: "" } },
    { success: true, data: { html: "<main>AI</main>" } },
    { success: true, data: { html: 1, css: "" } },
    { success: true, data: { html: "<main>AI</main>", css: 1 } },
  ]) {
    assert.throws(
      () => parseHtmlVideoDraftResponse(payload),
      (error: unknown) =>
        error instanceof Error && error.message === invalidDraftMessage
    );
  }
});

test("parses a completed render and suppresses premature output URLs", () => {
  const active = parseHtmlVideoRenderResponse({
    success: true,
    data: activeRender,
  });
  assert.equal(active.outputUrl, null);

  const completed = parseHtmlVideoRenderResponse({
    success: true,
    data: {
      ...activeRender,
      status: "completed",
      progress: 100,
      outputUrl: "https://cdn.example/final.mp4",
    },
  });
  assert.equal(completed.outputUrl, "https://cdn.example/final.mp4");
});

test("rejects invalid render status, progress, and settings", () => {
  for (const data of [
    { ...activeRender, status: "unknown" },
    { ...activeRender, progress: 101 },
    { ...activeRender, progress: -1 },
    { ...activeRender, aspectRatio: "4:3" },
    { ...activeRender, resolution: "4k" },
  ]) {
    assert.throws(
      () => parseHtmlVideoRenderResponse({ success: true, data }),
      /không hợp lệ/
    );
  }
});

test("preview sends the authenticated endpoint and source settings", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          compositionHtml:
            '<!doctype html><html data-composition-id="html-video"></html>',
          width: 1280,
          height: 720,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  await htmlVideoRenderService.preview(previewInput);

  assert.equal(requestedUrl, "/api/v1/html-video-renders/preview");
  assert.equal(requestedInit?.method, "POST");
  const headers = new Headers(requestedInit?.headers);
  assert.equal(headers.get("Authorization"), "Bearer html-video-test-token");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), previewInput);
});

test("generateDraft sends only the authenticated prompt and settings request", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        data: { html: "<main>AI</main>", css: "main{color:white}" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const runtimeInput = {
    ...draftInput,
    companyCode: "must-not-be-serialized",
    html: "<script>must-not-be-serialized</script>",
  };

  await htmlVideoRenderService.generateDraft(runtimeInput);

  assert.equal(requestedUrl, "/api/v1/html-video-renders/generate-draft");
  assert.equal(requestedInit?.method, "POST");
  const headers = new Headers(requestedInit?.headers);
  assert.equal(headers.get("Authorization"), "Bearer html-video-test-token");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), draftInput);
});

test("generateDraft forwards an optional AbortSignal", async () => {
  let requestedSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestedSignal = init?.signal;
    return new Response(
      JSON.stringify({
        success: true,
        data: { html: "<main>AI</main>", css: "" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  const controller = new AbortController();

  await htmlVideoRenderService.generateDraft(draftInput, controller.signal);

  assert.equal(requestedSignal, controller.signal);
});

test("generateDraft surfaces a safe server error message", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: false, message: "Mô tả video không hợp lệ." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await assert.rejects(
    htmlVideoRenderService.generateDraft(draftInput),
    /Mô tả video không hợp lệ/
  );
});

test("create sends one idempotent render request", async () => {
  let requestedUrl = "";
  let requestedBody: unknown;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        success: true,
        data: { ...activeRender, status: "queued", progress: 0 },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  await htmlVideoRenderService.create({
    ...previewInput,
    idempotencyKey: "html_render_123456",
  });

  assert.equal(requestedUrl, "/api/v1/html-video-renders");
  assert.deepEqual(requestedBody, {
    ...previewInput,
    idempotencyKey: "html_render_123456",
  });
});

test("createGeneration submits an idempotent async generation request", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: "generation-1",
          status: "queued",
          currentStage: "queued",
          progress: 0,
          stageMessage: "Đang chờ.",
          error: null,
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  await htmlVideoRenderService.createGeneration({
    ...draftInput,
    idempotencyKey: "html_video_generation_123",
  });

  assert.equal(requestedUrl, "/api/v1/html-video-generations");
  assert.equal(requestedInit?.method, "POST");
  assert.equal(
    JSON.parse(String(requestedInit?.body)).idempotencyKey,
    "html_video_generation_123"
  );
});

test("parses queued and ready generation jobs without exposing a partial draft", () => {
  const base = {
    id: "generation-1",
    currentStage: "planning",
    progress: 30,
    stageMessage: "Đang lập kịch bản.",
    error: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:01.000Z",
  };
  const queued = parseHtmlVideoGenerationResponse({
    success: true,
    data: { ...base, status: "planning" },
  });
  assert.equal(queued.draft, undefined);

  const ready = parseHtmlVideoGenerationResponse({
    success: true,
    data: {
      ...base,
      status: "ready",
      currentStage: "ready",
      progress: 100,
      draft: { html: "<main>Video</main>", css: "" },
    },
  });
  assert.equal(ready.draft?.html, "<main>Video</main>");
});

test("polls generation stages until the ready draft is available", async () => {
  const statuses = ["planning", "composing", "ready"] as const;
  let index = 0;
  const result = await pollHtmlVideoGeneration({
    generationId: "generation-1",
    signal: new AbortController().signal,
    getGeneration: async () => {
      const status = statuses[Math.min(index++, statuses.length - 1)];
      return {
        id: "generation-1",
        status,
        currentStage: status,
        progress: status === "ready" ? 100 : 50,
        stageMessage: status,
        error: null,
        ...(status === "ready"
          ? { draft: { html: "<main>Video</main>", css: "" } }
          : {}),
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:01.000Z",
      };
    },
    wait: async () => undefined,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.draft?.html, "<main>Video</main>");
  assert.equal(index, 3);
});

test("listRenders restores completed output URLs from server history", async () => {
  let requestedUrl = "";
  let authorization = "";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization") || "";
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          items: [{
            ...activeRender,
            status: "completed",
            progress: 100,
            outputUrl: "https://cdn.example/final.mp4",
            voiceStatus: "disabled",
          }],
          pagination: {
            page: 1,
            pageSize: 12,
            total: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const renderPage = await htmlVideoRenderService.listRenders();

  assert.equal(requestedUrl, "/api/v1/html-video-renders?page=1&pageSize=12&filter=all");
  assert.equal(authorization, "Bearer html-video-test-token");
  assert.equal(renderPage.items[0].status, "completed");
  assert.equal(renderPage.items[0].outputUrl, "https://cdn.example/final.mp4");
  assert.equal(renderPage.pagination.total, 1);
});

test("get fetches one render with authentication", async () => {
  let requestedUrl = "";
  let authorization = "";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization") || "";
    return new Response(
      JSON.stringify({ success: true, data: activeRender }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const detail = await htmlVideoRenderService.get("render/unsafe");

  assert.equal(requestedUrl, "/api/v1/html-video-renders/render%2Funsafe");
  assert.equal(authorization, "Bearer html-video-test-token");
  assert.equal(detail.status, "rendering");
});

test("uses a safe server error message when a request fails", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: false, message: "HTML chứa nội dung không được phép." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await assert.rejects(
    htmlVideoRenderService.preview(previewInput),
    /HTML chứa nội dung không được phép/
  );
});
