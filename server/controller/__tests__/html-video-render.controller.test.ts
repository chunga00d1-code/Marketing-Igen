import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import {
  createHtmlVideoRenderController,
  type HtmlVideoRenderControllerDependencies,
} from "../html-video-render.controller";
import {
  createHtmlVideoPromptHistoryBodySchema,
  createHtmlVideoGenerationBodySchema,
  createHtmlVideoRenderBodySchema,
  htmlVideoPreviewBodySchema,
  retryHtmlVideoGenerationBodySchema,
} from "../../router/html-video-render.schemas";

const validBody = {
  html: '<main class="hero">Xin chào</main>',
  css: ".hero { color: white; }",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "720p",
  idempotencyKey: "html_render_123456",
};

function responseRecorder() {
  const state: { status: number; body?: unknown } = { status: 200 };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  };
  return { response, state };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: new Types.ObjectId().toString(),
      email: "user@example.com",
      role: "user",
      companyCode: "acme",
    },
    headers: {},
    body: validBody,
    params: {},
    ...overrides,
  };
}

type DependencyOverrides = {
  service?: Partial<HtmlVideoRenderControllerDependencies["service"]>;
  draftService?: HtmlVideoRenderControllerDependencies["draftService"];
  promptHistoryService?: Partial<
    HtmlVideoRenderControllerDependencies["promptHistoryService"]
  >;
  enqueue?: HtmlVideoRenderControllerDependencies["enqueue"];
};

const validPromptHistoryBody = {
  projectName: "Video giới thiệu sản phẩm",
  prompt: "Tạo video giới thiệu sản phẩm mới với ưu đãi và CTA mua ngay.",
  aspectRatio: "9:16",
  referenceNames: ["brand-guideline.md"],
};

function dependencies(overrides: DependencyOverrides = {}) {
  const base: HtmlVideoRenderControllerDependencies = {
    service: {
      createRender: async () => ({
        created: true,
        render: {
          id: new Types.ObjectId().toString(),
          status: "queued",
        },
      }),
      getRender: async () => ({
        id: new Types.ObjectId().toString(),
        status: "completed",
      }),
      listRenders: async () => [],
    },
    promptHistoryService: {
      createHistory: async () => ({
        id: new Types.ObjectId().toString(),
      }),
      listHistory: async () => [],
    },
    draftService: {
      generate: async () => ({ html: "<main>AI</main>", css: "" }),
    },
    enqueue: async () => ({ id: "job-1" }),
  };
  return {
    ...base,
    ...overrides,
    service: {
      ...base.service,
      ...overrides.service,
    },
    promptHistoryService: {
      ...base.promptHistoryService,
      ...overrides.promptHistoryService,
    },
  };
}

test("validates preview and render request bounds", () => {
  const { idempotencyKey: _idempotencyKey, ...previewBody } = validBody;
  assert.equal(
    htmlVideoPreviewBodySchema.validate(previewBody).error,
    undefined
  );
  assert.equal(createHtmlVideoRenderBodySchema.validate(validBody).error, undefined);
  assert.equal(
    createHtmlVideoPromptHistoryBodySchema.validate(validPromptHistoryBody).error,
    undefined
  );

  const invalidCases = [
    { ...validBody, durationSeconds: 0 },
    { ...validBody, durationSeconds: 181 },
    { ...validBody, aspectRatio: "4:3" },
    { ...validBody, resolution: "4k" },
    { ...validBody, idempotencyKey: "short" },
    { ...validBody, html: "a".repeat(100 * 1024 + 1) },
    { ...validBody, css: "a".repeat(100 * 1024 + 1) },
  ];
  for (const invalid of invalidCases) {
    assert.ok(createHtmlVideoRenderBodySchema.validate(invalid).error);
  }
});

test("returns a server-built safe preview without persistence", async () => {
  let createCalls = 0;
  const controller = createHtmlVideoRenderController(
    dependencies({
      service: {
        createRender: async () => {
          createCalls += 1;
          throw new Error("not expected");
        },
      },
    })
  );
  const { response, state } = responseRecorder();
  const { idempotencyKey: _idempotencyKey, ...previewBody } = validBody;

  await controller.preview(
    request({
      body: previewBody,
    }) as never,
    response as never
  );

  assert.equal(state.status, 200);
  assert.equal(createCalls, 0);
  const payload = state.body as {
    success: boolean;
    data: { compositionHtml: string; width: number; height: number };
  };
  assert.equal(payload.success, true);
  assert.match(payload.data.compositionHtml, /data-composition-id="html-video"/);
  assert.deepEqual([payload.data.width, payload.data.height], [1280, 720]);
});

test("creates, enqueues, and returns 202 for a new render", async () => {
  const renderId = new Types.ObjectId().toString();
  let receivedActor: unknown;
  let queuedId = "";
  const controller = createHtmlVideoRenderController(
    dependencies({
      service: {
        createRender: async (actor) => {
          receivedActor = actor;
          return {
            created: true,
            render: { id: renderId, status: "queued" },
          };
        },
      },
      enqueue: async (id) => {
        queuedId = id;
        return { id: `job:${id}` };
      },
    })
  );
  const { response, state } = responseRecorder();
  const req = request();

  await controller.create(req as never, response as never);

  assert.equal(state.status, 202);
  assert.deepEqual(receivedActor, {
    id: req.user.id,
    companyCode: "ACME",
  });
  assert.equal(queuedId, renderId);
  assert.deepEqual(state.body, {
    success: true,
    data: { id: renderId, status: "queued" },
  });
});

test("returns 200 and re-enqueues an existing queued idempotent render", async () => {
  const renderId = new Types.ObjectId().toString();
  const queued: string[] = [];
  const controller = createHtmlVideoRenderController(
    dependencies({
      service: {
        createRender: async () => ({
          created: false,
          render: { id: renderId, status: "queued" },
        }),
      },
      enqueue: async (id) => {
        queued.push(id);
        return { id };
      },
    })
  );
  const { response, state } = responseRecorder();

  await controller.create(request() as never, response as never);

  assert.equal(state.status, 200);
  assert.deepEqual(queued, [renderId]);
});

test("creates prompt history with the authenticated user and company scope", async () => {
  let received: unknown[] = [];
  const history = { id: new Types.ObjectId().toString(), revision: 1 };
  const controller = createHtmlVideoRenderController(
    dependencies({
      promptHistoryService: {
        createHistory: async (...args: unknown[]) => {
          received = args;
          return history;
        },
      },
    })
  );
  const { response, state } = responseRecorder();
  const req = request({ body: validPromptHistoryBody });

  await controller.createPromptHistory(req as never, response as never);

  assert.equal(state.status, 201);
  assert.deepEqual(received, [
    { id: req.user.id, companyCode: "ACME" },
    validPromptHistoryBody,
  ]);
  assert.deepEqual(state.body, { success: true, data: history });
});

test("lists prompt history through the authenticated user and company scope", async () => {
  let received: unknown;
  const histories = [{ id: new Types.ObjectId().toString(), revision: 2 }];
  const controller = createHtmlVideoRenderController(
    dependencies({
      promptHistoryService: {
        listHistory: async (actor) => {
          received = actor;
          return histories;
        },
      },
    })
  );
  const { response, state } = responseRecorder();
  const req = request();

  await controller.listPromptHistory(req as never, response as never);

  assert.deepEqual(received, { id: req.user.id, companyCode: "ACME" });
  assert.deepEqual(state.body, { success: true, data: histories });
});

test("validates async generation idempotency and selective retry stages", () => {
  const generationBody = {
    prompt: "Tạo video giới thiệu sản phẩm.",
    durationSeconds: 30,
    aspectRatio: "9:16",
    resolution: "1080p",
    idempotencyKey: "html_video_generation_123",
  };
  assert.equal(
    createHtmlVideoGenerationBodySchema.validate(generationBody).error,
    undefined
  );
  assert.ok(
    createHtmlVideoGenerationBodySchema.validate({
      ...generationBody,
      idempotencyKey: "short",
    }).error
  );
  for (const stage of ["planning", "visual", "voice", "validation"]) {
    assert.equal(
      retryHtmlVideoGenerationBodySchema.validate({ stage }).error,
      undefined
    );
  }
  assert.ok(
    retryHtmlVideoGenerationBodySchema.validate({ stage: "render" }).error
  );
});

test("lists persisted renders through the authenticated user and company scope", async () => {
  let received: unknown[] = [];
  const renderPage = {
    items: [{ id: new Types.ObjectId().toString(), status: "completed" }],
    pagination: {
      page: 1,
      pageSize: 12,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  const controller = createHtmlVideoRenderController(
    dependencies({
      service: {
        listRenders: async (...args: unknown[]) => {
          received = args;
          return renderPage;
        },
      },
    })
  );
  const { response, state } = responseRecorder();
  const req = request();

  await controller.list(req as never, response as never);

  assert.deepEqual(received, [
    { id: req.user.id, companyCode: "ACME" },
    {},
  ]);
  assert.deepEqual(state.body, { success: true, data: renderPage });
});

test("reads render status through the scoped service", async () => {
  const renderId = new Types.ObjectId().toString();
  let received: unknown[] = [];
  const controller = createHtmlVideoRenderController(
    dependencies({
      service: {
        getRender: async (...args: unknown[]) => {
          received = args;
          return { id: renderId, status: "completed" };
        },
      },
    })
  );
  const { response, state } = responseRecorder();
  const req = request({ params: { renderId } });

  await controller.get(req as never, response as never);

  assert.deepEqual(received, [
    { id: req.user.id, companyCode: "ACME" },
    renderId,
  ]);
  assert.equal(state.status, 200);
});

test("maps missing ownership-scoped records to 404", async () => {
  const controller = createHtmlVideoRenderController(
    dependencies({
      service: {
        getRender: async () => {
          throw new Error(
            "Không tìm thấy lần kết xuất video hoặc bạn không có quyền truy cập."
          );
        },
      },
    })
  );
  const { response, state } = responseRecorder();

  await controller.get(
    request({ params: { renderId: new Types.ObjectId().toString() } }) as never,
    response as never
  );

  assert.equal(state.status, 404);
  assert.deepEqual(state.body, {
    success: false,
    message:
      "Không tìm thấy lần kết xuất video hoặc bạn không có quyền truy cập.",
  });
});
