import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Types } from "mongoose";
import { HtmlVideoRenderModel } from "../../../model/html-video-render.model";
import { defaultVideoRenderAdapterRegistry } from "../../video-edit/video-render-adapters";
import type {
  VideoRenderAdapter,
  VideoRenderInput,
} from "../../video-edit/render-adapter";
import { VideoRenderAdapterError } from "../../video-edit/render-adapter";
import { htmlVideoRenderService } from "../html-video-render.service";
import { htmlVideoTtsService } from "../html-video-tts.service";

const renderId = new Types.ObjectId().toString();
const compositionHtml =
  '<!doctype html><html data-composition-id="html-video"></html>';

function claimedRender(overrides: Record<string, unknown> = {}) {
  return {
    _id: renderId,
    companyCode: "ACME",
    status: "rendering",
    compositionHtml,
    aspectRatio: "16:9",
    resolution: "720p",
    durationSeconds: 5,
    ...overrides,
  };
}

function mockClaim(context: test.TestContext, record = claimedRender()) {
  context.mock.method(HtmlVideoRenderModel, "findOneAndUpdate", () => ({
    select: () => ({
      lean: async () => record,
    }),
  }) as never);
}

test("claims a queued job and renders its sanitized document directly", async (context) => {
  mockClaim(context);
  const updates: Array<{
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
  }> = [];
  context.mock.method(
    HtmlVideoRenderModel,
    "updateOne",
    async (filter, update) => {
      updates.push({
        filter: filter as Record<string, unknown>,
        update: update as Record<string, unknown>,
      });
      return { matchedCount: 1 };
    }
  );

  let receivedInput: VideoRenderInput | undefined;
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    async render(input, executionContext) {
      receivedInput = input;
      await executionContext.onProgress({
        stage: "rendering",
        progress: 60,
        message: "Rendering video frames.",
      });
      await executionContext.onProgress({
        stage: "uploading",
        progress: 90,
        message: "Uploading rendered video.",
      });
      return {
        engine: "hyperframes",
        outputUrl: "https://cdn.example/html-video.mp4",
      };
    },
  };
  context.mock.method(
    defaultVideoRenderAdapterRegistry,
    "get",
    () => adapter
  );

  await htmlVideoRenderService.processRender(renderId);

  assert.deepEqual(receivedInput, {
    jobId: renderId,
    compositionHtml,
    aspectRatio: "16:9",
    resolution: "720p",
    durationSeconds: 5,
  });
  assert.ok(
    updates.some(({ update }) =>
      JSON.stringify(update).includes('"status":"uploading"')
    )
  );
  assert.ok(
    updates.some(
      ({ filter, update }) =>
        filter._id === renderId &&
        JSON.stringify(update).includes('"status":"completed"') &&
        JSON.stringify(update).includes("https://cdn.example/html-video.mp4")
    )
  );
});

test("returns an adapter failure to queued state for capped queue retry", async (context) => {
  mockClaim(context);
  context.mock.method(console, "error", () => undefined);
  const updates: Array<Record<string, unknown>> = [];
  context.mock.method(HtmlVideoRenderModel, "updateOne", async (_filter, update) => {
    updates.push(update as Record<string, unknown>);
    return { matchedCount: 1 };
  });
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    render: async () => {
      throw new Error("C:\\private\\renderer failed with SECRET=value");
    },
  };
  context.mock.method(
    defaultVideoRenderAdapterRegistry,
    "get",
    () => adapter
  );

  await assert.rejects(
    htmlVideoRenderService.processRender(renderId),
    /renderer failed/
  );

  const serialized = JSON.stringify(updates);
  assert.match(serialized, /"status":"queued"/);
  assert.doesNotMatch(serialized, /C:\\\\private|SECRET=value/);
});

test("generates and passes scene-aligned voice segments to the renderer", async (context) => {
  mockClaim(context, claimedRender({
    voiceScript: "Scene one. Scene two.",
    pipelineSnapshot: {
      scenePlan: [
        { narration: "Scene one.", startSeconds: 0, endSeconds: 2 },
        { narration: "Scene two.", startSeconds: 2, endSeconds: 5 },
      ],
    },
  }));
  context.mock.method(HtmlVideoRenderModel, "updateOne", async () => ({
    matchedCount: 1,
  }));
  const generated: Array<{ text: string; durationSeconds?: number }> = [];
  context.mock.method(
    htmlVideoTtsService,
    "generate",
    async (text, options: { durationSeconds?: number } = {}) => {
      generated.push({ text, durationSeconds: options.durationSeconds });
      return {
        buffer: Buffer.alloc(480, 1),
        model: "test-tts",
        voice: "test-voice",
        format: "pcm" as const,
        sampleRate: 24_000,
        channels: 1,
        playbackRate: 1,
        durationSeconds: Number(options.durationSeconds) * 0.9,
      };
    }
  );

  let receivedInput: VideoRenderInput | undefined;
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    async render(input, executionContext) {
      receivedInput = input;
      await rm(executionContext.temporaryDirectory, { recursive: true, force: true });
      return {
        engine: "hyperframes",
        outputUrl: "https://cdn.example/scene-voice.mp4",
      };
    },
  };
  context.mock.method(defaultVideoRenderAdapterRegistry, "get", () => adapter);

  await htmlVideoRenderService.processRender(renderId);

  assert.deepEqual(generated, [
    { text: "Scene one.", durationSeconds: 2 },
    { text: "Scene two.", durationSeconds: 3 },
  ]);
  assert.equal(receivedInput?.voiceAudioPath, undefined);
  assert.deepEqual(
    receivedInput?.voiceSegments?.map((segment) => ({
      startSeconds: segment.startSeconds,
      durationSeconds: segment.durationSeconds,
      sourceDurationSeconds: segment.sourceDurationSeconds,
    })),
    [
      { startSeconds: 0, durationSeconds: 2, sourceDurationSeconds: 1.8 },
      { startSeconds: 2, durationSeconds: 3, sourceDurationSeconds: 2.7 },
    ]
  );
});

test("logs bounded sanitized Hyperframes diagnostics server-side", async (context) => {
  mockClaim(context);
  context.mock.method(HtmlVideoRenderModel, "updateOne", async () => ({
    matchedCount: 1,
  }));
  const logged: unknown[][] = [];
  context.mock.method(console, "error", (...values: unknown[]) => {
    logged.push(values);
  });
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    render: async () => {
      throw new VideoRenderAdapterError(
        "RENDER_PROCESS_FAILED",
        "Hyperframes rendering failed.",
        {
          exitCode: 1,
          stdout: "Lint failed: TOKEN=stdout-private",
          stderr: "Chrome failed: API_KEY=private-value Bearer bearer-value",
        }
      );
    },
  };
  context.mock.method(defaultVideoRenderAdapterRegistry, "get", () => adapter);

  await assert.rejects(
    htmlVideoRenderService.processRender(renderId),
    /Hyperframes rendering failed/
  );

  const serializedLog = JSON.stringify(logged);
  assert.match(serializedLog, /RENDER_PROCESS_FAILED/);
  assert.match(serializedLog, /Chrome failed/);
  assert.match(serializedLog, /Lint failed/);
  assert.match(serializedLog, /\[redacted\]/);
  assert.doesNotMatch(serializedLog, /stdout-private|private-value|bearer-value/);
});

test("persists a safe terminal failure", async (context) => {
  let capturedUpdate: Record<string, unknown> | undefined;
  context.mock.method(HtmlVideoRenderModel, "findOneAndUpdate", (_filter, update) => {
    capturedUpdate = update as Record<string, unknown>;
    return Promise.resolve({ _id: renderId });
  });

  await htmlVideoRenderService.failRender(
    renderId,
    new Error("C:\\private\\renderer failed with SECRET=value")
  );

  const serialized = JSON.stringify(capturedUpdate);
  assert.match(serialized, /"status":"failed"/);
  assert.match(serialized, /RENDER_PROCESS_FAILED/);
  assert.doesNotMatch(serialized, /C:\\\\private|SECRET=value/);
});

test("recovers stale active renders and returns queued identifiers", async (context) => {
  let recoveryFilter: Record<string, unknown> | undefined;
  context.mock.method(HtmlVideoRenderModel, "updateMany", async (filter) => {
    recoveryFilter = filter as Record<string, unknown>;
    return { modifiedCount: 2 };
  });
  context.mock.method(HtmlVideoRenderModel, "find", () => ({
    sort: () => ({
      limit: () => ({
        select: () => ({
          lean: async () => [
            { _id: new Types.ObjectId("000000000000000000000001") },
            { _id: new Types.ObjectId("000000000000000000000002") },
          ],
        }),
      }),
    }),
  }) as never);

  const recovered = await htmlVideoRenderService.recoverPendingRenders();

  assert.deepEqual(recovered, [
    "000000000000000000000001",
    "000000000000000000000002",
  ]);
  assert.deepEqual(recoveryFilter?.status, { $in: ["rendering", "uploading"] });
});

test("worker source has no render waterfall or fallback engines", () => {
  const serviceSource = readFileSync(
    "server/service/html-video/html-video-render.service.ts",
    "utf8"
  );
  const queueSource = readFileSync(
    "server/queue/html-video-render-queue.ts",
    "utf8"
  );

  assert.doesNotMatch(
    `${serviceSource}\n${queueSource}`,
    /runRenderWaterfall|remotionService|runFFmpegFallback/
  );
  assert.match(serviceSource, /defaultVideoRenderAdapterRegistry\.get\("hyperframes"\)/);
});
