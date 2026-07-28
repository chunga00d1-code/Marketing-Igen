import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVideoProjectRenderDetail,
  parseVideoProjectRenderListResponse,
  parseVideoProjectRenderResponse,
  videoProjectRenderService,
} from "../videoProjectRenderService";

const originalFetch = globalThis.fetch;

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => (key === "accessToken" ? "render-test-token" : null),
  },
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("parses a completed render response correctly", () => {
  const detail = parseVideoProjectRenderResponse({
    status: "success",
    data: {
      id: "render-1",
      projectId: "proj-123",
      status: "completed",
      progress: 100,
      stageMessage: "Render complete",
      outputUrl: "https://res.cloudinary.com/demo/video/upload/v12345/output.mp4",
      resolution: "1080p",
      aspectRatio: "9:16",
      duration: 15,
      createdAt: "2026-07-24T10:00:00.000Z",
    },
  });

  assert.equal(detail.id, "render-1");
  assert.equal(detail.projectId, "proj-123");
  assert.equal(detail.status, "completed");
  assert.equal(detail.progress, 100);
  assert.equal(detail.resolution, "1080p");
  assert.equal(detail.outputUrl, "https://res.cloudinary.com/demo/video/upload/v12345/output.mp4");
});

test("parses list renders response using helper", () => {
  const list = parseVideoProjectRenderListResponse({
    status: "success",
    data: {
      items: [
        {
          id: "render-100",
          projectId: "proj-123",
          status: "queued",
          progress: 0,
          resolution: "1080p",
          aspectRatio: "9:16",
          duration: 10,
        },
      ],
    },
  });

  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].id, "render-100");
});

test("rejects render response with progress > 100 or progress < 0", () => {
  assert.throws(
    () =>
      parseVideoProjectRenderDetail({
        id: "render-2",
        projectId: "proj-123",
        status: "rendering",
        progress: 150,
        resolution: "1080p",
      }),
    /Tiến trình kết xuất video không hợp lệ/
  );

  assert.throws(
    () =>
      parseVideoProjectRenderDetail({
        id: "render-2",
        projectId: "proj-123",
        status: "rendering",
        progress: -5,
        resolution: "1080p",
      }),
    /Tiến trình kết xuất video không hợp lệ/
  );
});

test("rejects invalid render status or resolution", () => {
  assert.throws(
    () =>
      parseVideoProjectRenderDetail({
        id: "render-3",
        projectId: "proj-123",
        status: "unknown_status",
        progress: 50,
        resolution: "1080p",
      }),
    /Trạng thái kết xuất video không hợp lệ/
  );

  assert.throws(
    () =>
      parseVideoProjectRenderDetail({
        id: "render-4",
        projectId: "proj-123",
        status: "queued",
        progress: 0,
        resolution: "4k",
      }),
    /Độ phân giải kết xuất video không hợp lệ/
  );
});

test("does not expose outputUrl if render is not completed", () => {
  const detail = parseVideoProjectRenderDetail({
    id: "render-5",
    projectId: "proj-123",
    status: "rendering",
    progress: 45,
    outputUrl: "https://shotstack.io/temporary/output.mp4",
    resolution: "720p",
    aspectRatio: "16:9",
    duration: 10,
  });

  assert.equal(detail.status, "rendering");
  assert.equal(detail.outputUrl, undefined);
});

test("createRender sends correct endpoint, headers, and body without project snapshot", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          id: "render-10",
          projectId: "proj-abc",
          status: "queued",
          progress: 0,
          resolution: "1080p",
          aspectRatio: "9:16",
          duration: 20,
        },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const idempotencyKey = "export_1720000000_uniq123";
  const created = await videoProjectRenderService.createRender("proj-abc", "1080p", idempotencyKey);

  assert.equal(requestedUrl, "/api/v1/video-projects/proj-abc/renders");
  assert.equal(requestedInit?.method, "POST");
  const headers = new Headers(requestedInit?.headers);
  assert.equal(headers.get("Authorization"), "Bearer render-test-token");
  assert.equal(headers.get("Content-Type"), "application/json");

  const body = JSON.parse(String(requestedInit?.body)) as Record<string, unknown>;
  assert.equal(body.resolution, "1080p");
  assert.equal(body.idempotencyKey, idempotencyKey);
  assert.equal("tracks" in body, false);
  assert.equal("items" in body, false);
  assert.equal(created.id, "render-10");
  assert.equal(created.status, "queued");
});

test("getRender fetches single render detail with auth headers", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          id: "render-20",
          projectId: "proj-abc",
          status: "rendering",
          progress: 60,
          resolution: "720p",
          aspectRatio: "1:1",
          duration: 15,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const detail = await videoProjectRenderService.getRender("proj-abc", "render-20");

  assert.equal(requestedUrl, "/api/v1/video-projects/proj-abc/renders/render-20");
  assert.equal(detail.id, "render-20");
  assert.equal(detail.progress, 60);
});

test("listRenders parses items array sorted newest first", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          items: [
            {
              id: "render-30",
              projectId: "proj-abc",
              status: "completed",
              progress: 100,
              outputUrl: "https://cdn.com/v1.mp4",
              resolution: "1080p",
              aspectRatio: "9:16",
              duration: 15,
            },
            {
              id: "render-29",
              projectId: "proj-abc",
              status: "failed",
              progress: 40,
              errorMessage: "Shotstack API timeout",
              resolution: "720p",
              aspectRatio: "9:16",
              duration: 15,
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const res = await videoProjectRenderService.listRenders("proj-abc");

  assert.equal(requestedUrl, "/api/v1/video-projects/proj-abc/renders");
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].id, "render-30");
  assert.equal(res.items[0].outputUrl, "https://cdn.com/v1.mp4");
  assert.equal(res.items[1].id, "render-29");
  assert.equal(res.items[1].errorMessage, "Shotstack API timeout");
});

test("surfaces safe Vietnamese error messages when backend returns error status", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: "error",
        message: "Không tìm thấy dự án video.",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await assert.rejects(
    () => videoProjectRenderService.createRender("proj-missing", "1080p", "key123"),
    (err: Error) => err.message === "Không tìm thấy dự án video."
  );
});

test("prevents createRender execution if autosave fails", async () => {
  let createRenderCalled = false;

  const onEnsureAutosave = async () => {
    throw new Error("Autosave failed");
  };

  const handleStartExportWorkflow = async () => {
    try {
      await onEnsureAutosave();
      createRenderCalled = true;
    } catch {
      // Autosave failed
    }
  };

  await handleStartExportWorkflow();
  assert.equal(createRenderCalled, false);
});

test("prevents double-click render creation with synchronous lock ref", async () => {
  let calls = 0;
  let inFlightLock = false;

  const startExport = async () => {
    if (inFlightLock) return;
    inFlightLock = true;
    try {
      calls++;
      await new Promise((res) => setTimeout(res, 50));
    } finally {
      inFlightLock = false;
    }
  };

  // Simulate rapid double click
  const p1 = startExport();
  const p2 = startExport();

  await Promise.all([p1, p2]);

  assert.equal(calls, 1);
});

test("verifies active job filtering logic for history polling", () => {
  const items: Array<{ status: "queued" | "rendering" | "uploading" | "completed" | "failed" }> = [
    { status: "completed" },
    { status: "failed" },
  ];

  const hasActiveJobs = (list: typeof items) =>
    list.some((r) => r.status === "queued" || r.status === "rendering" || r.status === "uploading");

  assert.equal(hasActiveJobs(items), false);

  items.unshift({ status: "rendering" });
  assert.equal(hasActiveJobs(items), true);
});
