import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { HtmlVideoRenderModel } from "../../../model/html-video-render.model";
import { htmlVideoRenderService } from "../html-video-render.service";

const actor = { id: new Types.ObjectId().toString(), companyCode: "ACME" };
const input = {
  html: '<main class="hero">Xin chào</main>',
  css: ".hero { color: white; }",
  durationSeconds: 5,
  aspectRatio: "16:9" as const,
  resolution: "720p" as const,
  idempotencyKey: "html_render_123456",
};
const now = new Date("2026-07-29T00:00:00.000Z");

function privateRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    userId: actor.id,
    companyCode: actor.companyCode,
    status: "queued",
    progress: 0,
    stageMessage: "Đã xếp hàng kết xuất video.",
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    durationSeconds: input.durationSeconds,
    outputUrl: "",
    error: "",
    errorCode: "",
    sourceHtml: input.html,
    sourceCss: input.css,
    sanitizedHtml: input.html,
    sanitizedCss: input.css,
    compositionHtml: "<html>private composition</html>",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("creates an immutable sanitized tenant-scoped render snapshot", async (context) => {
  context.mock.method(HtmlVideoRenderModel, "findOne", () => ({
    lean: async () => null,
  }));
  let captured: Record<string, unknown> | undefined;
  context.mock.method(
    HtmlVideoRenderModel,
    "create",
    async (data: Record<string, unknown>) => {
      captured = data;
      return privateRecord(data);
    }
  );

  const result = await htmlVideoRenderService.createRender(actor, input);

  assert.equal(result.created, true);
  assert.equal(captured?.userId, actor.id);
  assert.equal(captured?.companyCode, actor.companyCode);
  assert.equal(captured?.idempotencyKey, input.idempotencyKey);
  assert.match(String(captured?.compositionHtml), /data-composition-id="html-video"/);
  assert.equal(result.render.status, "queued");
  assert.equal("sourceHtml" in result.render, false);
  assert.equal("sourceCss" in result.render, false);
  assert.equal("sanitizedHtml" in result.render, false);
  assert.equal("compositionHtml" in result.render, false);
});

test("returns the existing scoped render for an idempotent replay", async (context) => {
  let filter: Record<string, unknown> | undefined;
  context.mock.method(HtmlVideoRenderModel, "findOne", (received) => {
    filter = received as Record<string, unknown>;
    return { lean: async () => privateRecord() };
  });
  context.mock.method(HtmlVideoRenderModel, "create", async () => {
    throw new Error("create must not be called");
  });

  const result = await htmlVideoRenderService.createRender(actor, input);

  assert.equal(result.created, false);
  assert.equal(filter?.userId, actor.id);
  assert.equal(filter?.companyCode, actor.companyCode);
  assert.equal(filter?.idempotencyKey, input.idempotencyKey);
});

test("recovers a duplicate-key race using the same tenant scope", async (context) => {
  const duplicate = privateRecord();
  let findCalls = 0;
  context.mock.method(HtmlVideoRenderModel, "findOne", (received) => {
    const filter = received as Record<string, unknown>;
    assert.equal(filter.userId, actor.id);
    assert.equal(filter.companyCode, actor.companyCode);
    findCalls += 1;
    return { lean: async () => (findCalls === 1 ? null : duplicate) };
  });
  context.mock.method(HtmlVideoRenderModel, "create", async () => {
    const error = new Error("duplicate") as Error & { code: number };
    error.code = 11000;
    throw error;
  });

  const result = await htmlVideoRenderService.createRender(actor, input);

  assert.equal(result.created, false);
  assert.equal(result.render.id, String(duplicate._id));
  assert.equal(findCalls, 2);
});

test("reads a render only through user and company ownership scope", async (context) => {
  const renderId = new Types.ObjectId().toString();
  let filter: Record<string, unknown> | undefined;
  context.mock.method(HtmlVideoRenderModel, "findOne", (received) => {
    filter = received as Record<string, unknown>;
    return { lean: async () => privateRecord({ _id: renderId }) };
  });

  const result = await htmlVideoRenderService.getRender(actor, renderId);

  assert.deepEqual(filter, {
    _id: renderId,
    userId: actor.id,
    companyCode: actor.companyCode,
  });
  assert.equal(result.id, renderId);
  assert.equal("compositionHtml" in result, false);
});

test("uses the same not-found error for missing and unauthorized renders", async (context) => {
  context.mock.method(HtmlVideoRenderModel, "findOne", () => ({
    lean: async () => null,
  }));

  await assert.rejects(
    htmlVideoRenderService.getRender(actor, new Types.ObjectId().toString()),
    /Không tìm thấy lần kết xuất video/
  );
});

test("rejects malformed render identifiers before querying", async (context) => {
  let queried = false;
  context.mock.method(HtmlVideoRenderModel, "findOne", () => {
    queried = true;
    return { lean: async () => null };
  });

  await assert.rejects(
    htmlVideoRenderService.getRender(actor, "not-an-object-id"),
    /không hợp lệ/
  );
  assert.equal(queried, false);
});
