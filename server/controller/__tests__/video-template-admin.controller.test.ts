import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, RequestHandler, Response } from "express";
import { requireAuth } from "../../middleware/auth";
import { ShotstackSyncBusyError } from "../../service/shotstack-template-sync.service";
import type { VideoTemplateSyncSummary } from "../../interface/video-template.interface";
import {
  createShotstackAdminHandlers,
  videoTemplateController,
} from "../video-template.controller";
import { videoTemplateRouter } from "../../router/video-template.router";

type CapturedResponse = {
  response: Response;
  statusCode: number | undefined;
  payload: unknown;
};

function captureResponse(): CapturedResponse {
  const captured: CapturedResponse = {
    response: undefined as unknown as Response,
    statusCode: undefined,
    payload: undefined,
  };
  captured.response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.payload = payload;
      return this;
    },
  } as Response;
  return captured;
}

function authenticatedRequest(role = "admin") {
  return {
    user: {
      id: `${role}-1`,
      email: `${role}@example.com`,
      role,
    },
  } as never;
}

async function withShotstackEnvironment(
  environment: string | undefined,
  apiKey: string | undefined,
  run: () => Promise<void>
) {
  const originalEnvironment = process.env.SHOTSTACK_ENV;
  const originalApiKey = process.env.SHOTSTACK_API_KEY;
  if (environment === undefined) delete process.env.SHOTSTACK_ENV;
  else process.env.SHOTSTACK_ENV = environment;
  if (apiKey === undefined) delete process.env.SHOTSTACK_API_KEY;
  else process.env.SHOTSTACK_API_KEY = apiKey;
  try {
    await run();
  } finally {
    if (originalEnvironment === undefined) delete process.env.SHOTSTACK_ENV;
    else process.env.SHOTSTACK_ENV = originalEnvironment;
    if (originalApiKey === undefined) delete process.env.SHOTSTACK_API_KEY;
    else process.env.SHOTSTACK_API_KEY = originalApiKey;
  }
}

type RouterLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RequestHandler }>;
  };
};

function findRoute(method: string, path: string) {
  const layer = (videoTemplateRouter.stack as unknown as RouterLayer[]).find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method]
  );
  assert.ok(layer?.route, `${method.toUpperCase()} ${path} should be mounted`);
  return layer.route;
}

test("sync returns the exact success envelope and passes the authenticated actor ID", async () => {
  const summary: VideoTemplateSyncSummary = {
    created: 2,
    updated: 3,
    unchanged: 4,
    archived: 5,
    failedCount: 0,
    failed: [],
  };
  let actorId: string | undefined;
  const handlers = createShotstackAdminHandlers({
    validateConfig: () => ({
      environment: "stage",
      baseUrl: "https://api.shotstack.io/stage",
      apiKey: "server-only-key",
    }),
    synchronizeTemplates: async (id) => {
      actorId = id;
      return summary;
    },
  });
  const captured = captureResponse();

  await handlers.sync(authenticatedRequest(), captured.response);

  assert.equal(actorId, "admin-1");
  assert.equal(captured.statusCode, 200);
  assert.deepEqual(captured.payload, {
    status: "success",
    data: {
      created: 2,
      updated: 3,
      unchanged: 4,
      archived: 5,
      failedCount: 0,
      failed: [],
    },
  });
});

test("sync maps missing or invalid Shotstack configuration to a safe 503", async () => {
  let synchronized = false;
  const handlers = createShotstackAdminHandlers({
    synchronizeTemplates: async () => {
      synchronized = true;
      throw new Error("unreachable");
    },
  });
  await withShotstackEnvironment("stage", undefined, async () => {
    const captured = captureResponse();

    await handlers.sync(authenticatedRequest(), captured.response);

    assert.equal(synchronized, false);
    assert.equal(captured.statusCode, 503);
    assert.deepEqual(captured.payload, {
      status: "error",
      message: "Dịch vụ Shotstack chưa được cấu hình hợp lệ.",
    });
    assert.doesNotMatch(JSON.stringify(captured.payload), /SHOTSTACK_API_KEY/);
  });
});

test("sync maps an active synchronization lease to a safe 409", async () => {
  const handlers = createShotstackAdminHandlers({
    validateConfig: () => ({
      environment: "stage",
      baseUrl: "https://api.shotstack.io/stage",
      apiKey: "server-only-key",
    }),
    synchronizeTemplates: async () => {
      throw new ShotstackSyncBusyError();
    },
  });
  const captured = captureResponse();

  await handlers.sync(authenticatedRequest(), captured.response);

  assert.equal(captured.statusCode, 409);
  assert.deepEqual(captured.payload, {
    status: "error",
    message: "Đồng bộ mẫu Shotstack đang được thực hiện. Vui lòng thử lại sau.",
  });
});

test("sync hides unexpected provider and persistence diagnostics behind a safe 500", async () => {
  const handlers = createShotstackAdminHandlers({
    validateConfig: () => ({
      environment: "stage",
      baseUrl: "https://api.shotstack.io/stage",
      apiKey: "server-only-key",
    }),
    synchronizeTemplates: async () => {
      throw new Error("Provider returned server-only-key at C:\\internal\\sync.ts");
    },
  });
  const captured = captureResponse();

  await handlers.sync(authenticatedRequest(), captured.response);

  assert.equal(captured.statusCode, 500);
  assert.deepEqual(captured.payload, {
    status: "error",
    message: "Không thể đồng bộ thư viện mẫu Shotstack. Vui lòng thử lại sau.",
  });
  assert.doesNotMatch(JSON.stringify(captured.payload), /server-only-key|internal|sync\.ts/);
});

test("status before the first synchronization returns null state and an empty summary", async () => {
  const handlers = createShotstackAdminHandlers({
    findSyncState: async () => null,
  });
  await withShotstackEnvironment(undefined, undefined, async () => {
    const captured = captureResponse();

    await handlers.status(authenticatedRequest(), captured.response);

    assert.equal(captured.statusCode, 200);
    assert.deepEqual(captured.payload, {
      status: "success",
      data: {
        configured: false,
        environment: "stage",
        status: null,
        summary: {
          created: 0,
          updated: 0,
          unchanged: 0,
          archived: 0,
          failedCount: 0,
          failed: [],
        },
      },
    });
  });
});

test("status selects stage and v1 independently and never exposes credentials or failure diagnostics", async () => {
  for (const environment of ["stage", "v1"] as const) {
    const selectedEnvironments: string[] = [];
    const lastAttemptAt = new Date("2026-07-24T01:00:00.000Z");
    const lastSuccessAt = new Date("2026-07-24T01:01:00.000Z");
    const handlers = createShotstackAdminHandlers({
      findSyncState: async (selectedEnvironment) => {
        selectedEnvironments.push(selectedEnvironment);
        return {
          status: "partial",
          lastAttemptAt,
          lastSuccessAt,
          summary: {
            created: 1,
            updated: 2,
            unchanged: 3,
            archived: 4,
            failedCount: 1,
            failed: [{
              externalId: "server-only-key",
              message: "Provider payload at C:\\internal\\shotstack.ts",
            }],
          },
        };
      },
    });
    await withShotstackEnvironment(environment, "server-only-key", async () => {
      const captured = captureResponse();

      await handlers.status(authenticatedRequest(), captured.response);

      assert.deepEqual(selectedEnvironments, [environment]);
      assert.equal(captured.statusCode, 200);
      assert.deepEqual(captured.payload, {
        status: "success",
        data: {
          configured: true,
          environment,
          status: "partial",
          lastAttemptAt,
          lastSuccessAt,
          summary: {
            created: 1,
            updated: 2,
            unchanged: 3,
            archived: 4,
            failedCount: 1,
            failed: [],
          },
        },
      });
      assert.doesNotMatch(
        JSON.stringify(captured.payload),
        /server-only-key|Provider payload|internal|shotstack\.ts/
      );
    });
  }
});

test("status maps an invalid Shotstack environment to a safe 503 without querying state", async () => {
  let stateQueries = 0;
  const handlers = createShotstackAdminHandlers({
    findSyncState: async () => {
      stateQueries += 1;
      return null;
    },
  });

  await withShotstackEnvironment("production-secret-environment", "server-only-key", async () => {
    const captured = captureResponse();

    await handlers.status(authenticatedRequest(), captured.response);

    assert.equal(stateQueries, 0);
    assert.equal(captured.statusCode, 503);
    assert.deepEqual(captured.payload, {
      status: "error",
      message: "Dịch vụ Shotstack chưa được cấu hình hợp lệ.",
    });
    assert.doesNotMatch(
      JSON.stringify(captured.payload),
      /production-secret-environment|server-only-key|SHOTSTACK_ENV/
    );
  });
});

test("admin synchronization routes require authentication and admin or superadmin role", () => {
  for (const [method, path] of [
    ["post", "/admin/video-templates/shotstack/sync"],
    ["get", "/admin/video-templates/shotstack/status"],
  ] as const) {
    const route = findRoute(method, path);
    assert.equal(route.stack[0].handle, requireAuth);
    assert.equal(route.stack.length, 3);

    const authorize = route.stack[1].handle;
    for (const role of ["admin", "superadmin"]) {
      const captured = captureResponse();
      let nextCalls = 0;
      authorize(
        authenticatedRequest(role),
        captured.response,
        (() => {
          nextCalls += 1;
        }) as NextFunction
      );
      assert.equal(nextCalls, 1, `${role} should be authorized`);
      assert.equal(captured.statusCode, undefined);
    }

    const captured = captureResponse();
    let nextCalls = 0;
    authorize(
      authenticatedRequest("user"),
      captured.response,
      (() => {
        nextCalls += 1;
      }) as NextFunction
    );
    assert.equal(nextCalls, 0);
    assert.equal(captured.statusCode, 403);
  }

  assert.equal(
    findRoute("post", "/admin/video-templates/shotstack/sync").stack.at(-1)?.handle,
    videoTemplateController.sync
  );
  assert.equal(
    findRoute("get", "/admin/video-templates/shotstack/status").stack.at(-1)?.handle,
    videoTemplateController.status
  );
});

test("manual authoring routes are removed while catalogue routes remain mounted", () => {
  const mounted = (videoTemplateRouter.stack as unknown as RouterLayer[])
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route!.path,
      methods: Object.keys(layer.route!.methods).filter((method) => layer.route!.methods[method]),
    }));

  assert.equal(
    mounted.some(({ path, methods }) => path === "/video-templates" && methods.includes("post")),
    false
  );
  assert.equal(
    mounted.some(({ path, methods }) => path === "/video-templates/:templateId" && methods.includes("patch")),
    false
  );
  assert.equal(
    mounted.some(
      ({ path, methods }) =>
        path === "/video-templates/:templateId/publish" && methods.includes("post")
    ),
    false
  );

  findRoute("get", "/video-template-categories");
  findRoute("get", "/video-templates");
  findRoute("get", "/video-templates/:templateId");
  findRoute("post", "/video-templates/:templateId/use");
});
