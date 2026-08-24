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
import {
  assertSemanticSceneMapping,
  htmlVideoRenderService,
  rewriteMeasuredNarrationFromApprovedText,
} from "../html-video-render.service";
import type { HtmlVideoPipelineMetadata } from "../../../interface/html-video-pipeline.interface";
import { htmlVideoTtsService } from "../html-video-tts.service";

const renderId = new Types.ObjectId().toString();
const compositionHtml =
  '<!doctype html><html data-composition-id="html-video"></html>';

test("uses approved on-screen text for one measured resynthesis without dropping numbers", () => {
  const baseScene = {
    id: "scene-1",
    order: 0,
    purpose: "content" as const,
    sourceUnitIds: ["unit-1"],
    onScreenText: ["Teacher"],
    narration: "This is a much longer explanation about the teacher role.",
    startSeconds: 0,
    endSeconds: 2,
    transition: "crossfade" as const,
    assetIds: [],
  };
  const rewritten = rewriteMeasuredNarrationFromApprovedText([baseScene], [7.2], 2);
  assert.deepEqual(rewritten.adjustedSceneIds, ["scene-1"]);
  assert.equal(rewritten.scenes[0].narration, "Teacher.");

  const numeric = rewriteMeasuredNarrationFromApprovedText([{
    ...baseScene,
    narration: "The verified price is 50 dollars for this teacher course.",
  }], [7.2], 2);
  assert.deepEqual(numeric.adjustedSceneIds, []);
});

test("semantic QA rejects a highlight mapped to a different narrated unit", () => {
  const pipeline = {
    version: "2.0",
    sourceText: "Teacher",
    sourceContextRefs: [],
    videoBrief: {
      objective: "Teach one job",
      tone: "educational",
      visualStyle: "board",
      voiceRequired: true,
      exactPhrases: ["Teacher"],
      videoSpec: {
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 5,
        language: "en",
        audience: "beginners",
        platform: "generic",
        cta: "",
      },
    },
    contentUnits: [{
      id: "unit-1",
      sourceText: "Teacher",
      normalizedText: "Teacher",
      sourceRefs: ["reference-1"],
      sourceKind: "image_ocr",
      required: true,
      requiredVerbatim: true,
      order: 0,
      region: {
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        coordinateSpace: "normalized",
      },
    }],
    scenePlan: [{
      id: "scene-1",
      order: 0,
      purpose: "content",
      sourceUnitIds: ["unit-1"],
      onScreenText: ["Teacher"],
      narration: "Teacher.",
      startSeconds: 0,
      endSeconds: 5,
      transition: "crossfade",
      assetIds: [],
    }],
    findings: [],
  } satisfies HtmlVideoPipelineMetadata;
  const html = '<main class="background-sequence"><section class="scene" data-scene-id="scene-1" data-unit-id="unit-1" data-unit-ids="unit-1"><div class="scene-focus" data-unit-id="unit-2"></div></section></main>';

  assert.throws(
    () => assertSemanticSceneMapping(html, pipeline),
    /visible highlight does not match/
  );
});

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

test("passes representative scene midpoints to final frame verification", async (context) => {
  mockClaim(context, claimedRender({
    pipelineSnapshot: {
      scenePlan: [
        { startSeconds: 0, endSeconds: 2 },
        { startSeconds: 2, endSeconds: 4 },
        { startSeconds: 4, endSeconds: 5 },
      ],
    },
  }));
  context.mock.method(HtmlVideoRenderModel, "updateOne", async () => ({
    matchedCount: 1,
  }));
  let receivedInput: VideoRenderInput | undefined;
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    async render(input) {
      receivedInput = input;
      return {
        engine: "hyperframes",
        outputUrl: "https://cdn.example/verified-scenes.mp4",
      };
    },
  };
  context.mock.method(defaultVideoRenderAdapterRegistry, "get", () => adapter);

  await htmlVideoRenderService.processRender(renderId);

  assert.deepEqual(receivedInput?.verificationTimesSeconds, [1, 3, 4.5]);
});

test("checks every scene midpoint for an ordered background board", async (context) => {
  mockClaim(context, claimedRender({
    compositionHtml: '<!doctype html><html><div class="background-sequence"></div></html>',
    durationSeconds: 10,
    pipelineSnapshot: {
      scenePlan: Array.from({ length: 5 }, (_, index) => ({
        startSeconds: index * 2,
        endSeconds: (index + 1) * 2,
      })),
    },
  }));
  context.mock.method(HtmlVideoRenderModel, "updateOne", async () => ({ matchedCount: 1 }));
  let receivedInput: VideoRenderInput | undefined;
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    async render(input) {
      receivedInput = input;
      return { engine: "hyperframes", outputUrl: "https://cdn.example/board.mp4" };
    },
  };
  context.mock.method(defaultVideoRenderAdapterRegistry, "get", () => adapter);

  await htmlVideoRenderService.processRender(renderId);

  assert.deepEqual(receivedInput?.verificationTimesSeconds, [1, 3, 5, 7, 9]);
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
      videoBrief: { videoSpec: { language: "English" } },
      scenePlan: [
        { narration: "Scene one.", startSeconds: 0, endSeconds: 2 },
        { narration: "Scene two.", startSeconds: 2, endSeconds: 5 },
      ],
    },
  }));
  context.mock.method(HtmlVideoRenderModel, "updateOne", async () => ({
    matchedCount: 1,
  }));
  const generated: Array<{ text: string; durationSeconds?: number; language?: string }> = [];
  context.mock.method(
    htmlVideoTtsService,
    "generate",
    async (text, options: { durationSeconds?: number; language?: string } = {}) => {
      generated.push({ text, durationSeconds: options.durationSeconds, language: options.language });
      return {
        buffer: Buffer.alloc(480, 1),
        provider: "openrouter" as const,
        model: "test-tts",
        voice: "test-voice",
        format: "pcm" as const,
        sampleRate: 24_000,
        channels: 1,
        playbackRate: 1,
        durationSeconds: text.includes("one") ? 1.8 : 2.7,
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
    { text: "Scene one.", durationSeconds: undefined, language: "English" },
    { text: "Scene two.", durationSeconds: undefined, language: "English" },
  ]);
  assert.equal(receivedInput?.voiceAudioPath, undefined);
  assert.deepEqual(
    receivedInput?.voiceSegments?.map((segment) => ({
      startSeconds: segment.startSeconds,
      durationSeconds: segment.durationSeconds,
      sourceDurationSeconds: segment.sourceDurationSeconds,
    })),
    [
      { startSeconds: 0, durationSeconds: 2.036, sourceDurationSeconds: 1.8 },
      { startSeconds: 2.036, durationSeconds: 2.964, sourceDurationSeconds: 2.7 },
    ]
  );
});

test("marks narration that cannot fit naturally as a terminal input failure", async (context) => {
  mockClaim(context, claimedRender({
    voiceScript: "A narration that is much too long.",
    pipelineSnapshot: {
      videoBrief: { videoSpec: { language: "English" } },
      scenePlan: [{
        id: "scene-1",
        narration: "A narration that is much too long.",
        startSeconds: 0,
        endSeconds: 2,
      }],
    },
  }));
  context.mock.method(console, "error", () => undefined);
  const updates: Array<Record<string, unknown>> = [];
  context.mock.method(HtmlVideoRenderModel, "updateOne", async (_filter, update) => {
    updates.push(update as Record<string, unknown>);
    return { matchedCount: 1 };
  });
  context.mock.method(htmlVideoTtsService, "generate", async () => ({
    buffer: Buffer.alloc(480, 1),
    provider: "openrouter" as const,
    model: "test-tts",
    voice: "test-voice",
    format: "pcm" as const,
    sampleRate: 24_000,
    channels: 1,
    playbackRate: 1,
    durationSeconds: 7.2,
  }));
  let rendered = false;
  const adapter: VideoRenderAdapter = {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    async render() {
      rendered = true;
      return { engine: "hyperframes", outputUrl: "https://cdn.example/should-not-render.mp4" };
    },
  };
  context.mock.method(defaultVideoRenderAdapterRegistry, "get", () => adapter);

  await htmlVideoRenderService.processRender(renderId);

  assert.equal(rendered, false);
  const serialized = JSON.stringify(updates);
  assert.match(serialized, /"status":"failed"/);
  assert.match(serialized, /RENDER_INPUT_INVALID/);
  assert.doesNotMatch(serialized, /"status":"queued"/);
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
