import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoProjectResponse, videoTemplateService } from "../videoTemplateService";

const originalFetch = globalThis.fetch;

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => key === "accessToken" ? "frontend-test-token" : null,
  },
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("parses a wrapped video project API response", () => {
  const project = parseVideoProjectResponse({
    status: "success",
    data: {
      id: "project-1",
      sourceTemplateId: "template-1",
      sourceTemplateVersionId: "version-1",
      title: "Sale",
      status: "draft",
      aspectRatio: "9:16",
      duration: 15,
      mode: "edit-project",
      tracks: [],
      items: [],
      revision: 2,
      sourceMediaUrl: "https://cdn.example/video.mp4",
    },
  });
  assert.equal(project.id, "project-1");
  assert.equal(project.revision, 2);
});

test("parses the Shotstack synchronization summary through the authenticated admin endpoint", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      status: "success",
      data: {
        created: 2,
        updated: 3,
        unchanged: 4,
        archived: 5,
        failedCount: 1,
        failed: [{ externalId: "template-6", message: "Mẫu không tương thích." }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const summary = await videoTemplateService.syncShotstackTemplates();

  assert.equal(requestInit?.method, "POST");
  assert.equal(requestUrl, "/api/v1/admin/video-templates/shotstack/sync");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer frontend-test-token");
  assert.deepEqual(summary, {
    created: 2,
    updated: 3,
    unchanged: 4,
    archived: 5,
    failedCount: 1,
    failed: [{ externalId: "template-6", message: "Mẫu không tương thích." }],
  });
});

test("parses the safe Shotstack synchronization status without provider credentials", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    status: "success",
    data: {
      configured: true,
      environment: "stage",
      status: "partial",
      lastAttemptAt: "2026-07-24T01:00:00.000Z",
      lastSuccessAt: "2026-07-24T00:59:00.000Z",
      summary: {
        created: 1,
        updated: 2,
        unchanged: 3,
        archived: 4,
        failedCount: 2,
        failed: [],
      },
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  const status = await videoTemplateService.getShotstackSyncStatus();

  assert.deepEqual(status, {
    configured: true,
    environment: "stage",
    status: "partial",
    lastAttemptAt: "2026-07-24T01:00:00.000Z",
    lastSuccessAt: "2026-07-24T00:59:00.000Z",
    summary: {
      created: 1,
      updated: 2,
      unchanged: 3,
      archived: 4,
      failedCount: 2,
      failed: [],
    },
  });
  assert.doesNotMatch(JSON.stringify(status), /apiKey|credential|providerRequest/i);
});

test("surfaces the backend safe messages for missing config, busy sync, and unexpected failures", async () => {
  const cases = [
    [503, "Dịch vụ Shotstack chưa được cấu hình hợp lệ."],
    [409, "Đồng bộ mẫu Shotstack đang được thực hiện. Vui lòng thử lại sau."],
    [500, "Không thể đồng bộ thư viện mẫu Shotstack. Vui lòng thử lại sau."],
  ] as const;

  for (const [statusCode, message] of cases) {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      status: "error",
      message,
    }), { status: statusCode, headers: { "Content-Type": "application/json" } })) as typeof fetch;

    await assert.rejects(
      () => videoTemplateService.syncShotstackTemplates(),
      (error: Error) => error.message === message
    );
  }
});
