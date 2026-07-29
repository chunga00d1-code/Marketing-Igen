import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createHtmlVideoIdempotencyKey,
  HtmlVideoWorkspace,
  isActiveHtmlVideoStatus,
  pollHtmlVideoRender,
} from "../HtmlVideoWorkspace";
import type {
  HtmlVideoRenderDetail,
  HtmlVideoRenderStatus,
} from "../../../services/htmlVideoRenderService";

function render(status: HtmlVideoRenderStatus): HtmlVideoRenderDetail {
  return {
    id: "render-1",
    status,
    progress: status === "completed" ? 100 : 50,
    stageMessage: status,
    aspectRatio: "16:9",
    resolution: "720p",
    durationSeconds: 5,
    outputUrl:
      status === "completed" ? "https://cdn.example/final.mp4" : null,
    error: status === "failed" ? "Render failed safely." : null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:01:00.000Z",
  };
}

test("renders HTML/CSS editors, settings, and a scriptless preview sandbox", () => {
  const markup = renderToStaticMarkup(React.createElement(HtmlVideoWorkspace));
  const source = readFileSync(
    "src/components/content-studio/HtmlVideoWorkspace.tsx",
    "utf8"
  );

  assert.match(markup, /Nội dung HTML/);
  assert.match(markup, /CSS &amp; animation/);
  assert.match(markup, /Thời lượng/);
  assert.match(markup, /Tỷ lệ khung hình/);
  assert.match(markup, /Độ phân giải/);
  assert.match(source, /sandbox=""/);
  assert.match(source, /srcDoc=\{preview\.compositionHtml\}/);
  assert.doesNotMatch(source, /allow-scripts|allow-same-origin/);
  assert.match(markup, /Kết xuất video/);
});

test("recognizes only non-terminal statuses as active", () => {
  assert.equal(isActiveHtmlVideoStatus("queued"), true);
  assert.equal(isActiveHtmlVideoStatus("rendering"), true);
  assert.equal(isActiveHtmlVideoStatus("uploading"), true);
  assert.equal(isActiveHtmlVideoStatus("completed"), false);
  assert.equal(isActiveHtmlVideoStatus("failed"), false);
});

test("generates a valid unique idempotency key per submission", () => {
  const first = createHtmlVideoIdempotencyKey();
  const second = createHtmlVideoIdempotencyKey();

  assert.match(first, /^[a-zA-Z0-9_-]{12,100}$/);
  assert.match(second, /^[a-zA-Z0-9_-]{12,100}$/);
  assert.notEqual(first, second);
});

test("polls active renders until completed", async () => {
  const statuses: HtmlVideoRenderStatus[] = [
    "rendering",
    "uploading",
    "completed",
  ];
  const updates: HtmlVideoRenderStatus[] = [];
  let calls = 0;

  const result = await pollHtmlVideoRender({
    renderId: "render-1",
    signal: new AbortController().signal,
    getRender: async () => {
      const next = statuses[calls];
      calls += 1;
      return render(next);
    },
    onUpdate: (detail) => updates.push(detail.status),
    wait: async () => undefined,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(updates, ["rendering", "uploading", "completed"]);
  assert.equal(calls, 3);
});

test("stops polling on failed status", async () => {
  let calls = 0;
  const result = await pollHtmlVideoRender({
    renderId: "render-1",
    signal: new AbortController().signal,
    getRender: async () => {
      calls += 1;
      return render("failed");
    },
    onUpdate: () => undefined,
    wait: async () => undefined,
  });

  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
  assert.equal(result.error, "Render failed safely.");
});

test("aborts polling before a stale response can update the UI", async () => {
  const controller = new AbortController();
  let updates = 0;

  await assert.rejects(
    pollHtmlVideoRender({
      renderId: "render-1",
      signal: controller.signal,
      getRender: async () => render("rendering"),
      onUpdate: () => {
        updates += 1;
      },
      wait: async () => {
        controller.abort();
      },
    }),
    /aborted/i
  );
  assert.equal(updates, 0);
});
