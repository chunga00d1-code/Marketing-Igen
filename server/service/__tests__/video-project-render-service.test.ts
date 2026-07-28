import test from "node:test";
import assert from "node:assert/strict";
import { Job } from "bullmq";
import { Types } from "mongoose";
import { VideoProjectRenderModel } from "../../model/video-project-render.model";
import {
  buildVideoProjectRenderSnapshot,
  serializeVideoProjectRender,
} from "../video-project-render.service";
import { sanitizeRenderError } from "../video-project-render-runner";

test("accepts a template preview render without a project ID", () => {
  const render = new VideoProjectRenderModel({
    purpose: "template-preview",
    templateId: new Types.ObjectId(),
    templateVersionId: new Types.ObjectId(),
    templateSourceHash: "template-source-hash",
    userId: "user-1",
    companyCode: "company-1",
    aspectRatio: "9:16",
    duration: 10,
    snapshot: { title: "Template preview", tracks: [], items: [], settings: {} },
    idempotencyKey: "template-preview-1",
  });

  assert.equal(render.validateSync(), undefined);
});

test("rejects a template preview render missing template identity", () => {
  const render = new VideoProjectRenderModel({
    purpose: "template-preview",
    templateId: new Types.ObjectId(),
    userId: "user-1",
    companyCode: "company-1",
    aspectRatio: "9:16",
    duration: 10,
    snapshot: { title: "Template preview", tracks: [], items: [], settings: {} },
    idempotencyKey: "template-preview-1",
  });

  const validationError = render.validateSync();
  assert.ok(validationError?.errors.templateVersionId);
  assert.ok(validationError?.errors.templateSourceHash);
});

test("rejects a template preview render with project-export identity", () => {
  const render = new VideoProjectRenderModel({
    purpose: "template-preview",
    projectId: new Types.ObjectId(),
    templateId: new Types.ObjectId(),
    templateVersionId: new Types.ObjectId(),
    templateSourceHash: "template-source-hash",
    userId: "user-1",
    companyCode: "company-1",
    aspectRatio: "9:16",
    duration: 10,
    snapshot: { title: "Template preview", tracks: [], items: [], settings: {} },
    idempotencyKey: "template-preview-1",
  });

  assert.ok(render.validateSync()?.errors.projectId);
});

test("preserves project-export render validation", () => {
  const render = new VideoProjectRenderModel({
    purpose: "project-export",
    projectId: new Types.ObjectId(),
    userId: "user-1",
    companyCode: "company-1",
    aspectRatio: "9:16",
    duration: 10,
    snapshot: { title: "Project export", tracks: [], items: [], settings: {} },
    idempotencyKey: "project-export-1",
  });

  assert.equal(render.validateSync(), undefined);
});

test("uses purpose-specific unique indexes for render identities", () => {
  const indexes = VideoProjectRenderModel.schema.indexes();
  const projectExportIndex = indexes.find(([fields]) => (
    fields.purpose === 1 &&
    fields.userId === 1 &&
    fields.companyCode === 1 &&
    fields.idempotencyKey === 1
  ));
  const templatePreviewIndex = indexes.find(([fields]) => (
    fields.purpose === 1 &&
    fields.templateVersionId === 1 &&
    fields.templateSourceHash === 1
  ));

  assert.equal(projectExportIndex?.[1].unique, true);
  assert.deepEqual(projectExportIndex?.[1].partialFilterExpression, { purpose: "project-export" });
  assert.equal(templatePreviewIndex?.[1].unique, true);
  assert.deepEqual(templatePreviewIndex?.[1].partialFilterExpression, { purpose: "template-preview" });
  assert.equal(
    indexes.some(([fields]) => (
      fields.userId === 1 &&
      fields.companyCode === 1 &&
      fields.idempotencyKey === 1 &&
      fields.purpose === undefined
    )),
    false
  );
});

test("classifies structured render domain errors without matching their messages", async () => {
  const renderService = await import("../video-project-render.service") as unknown as Record<string, unknown>;

  assert.equal(typeof renderService.getVideoProjectRenderErrorStatus, "function");
  assert.equal(typeof renderService.VideoProjectRenderError, "function");

  const getStatus = renderService.getVideoProjectRenderErrorStatus as (error: unknown) => number | undefined;
  const RenderError = renderService.VideoProjectRenderError as new (status: 400 | 404, message: string) => Error;

  assert.equal(getStatus(new RenderError(400, "Render media sourceUrl must use HTTPS.")), 400);
  assert.equal(getStatus(new RenderError(404, "Không tìm thấy dự án video.")), 404);
  assert.equal(getStatus(new Error("Render media sourceUrl must use HTTPS.")), undefined);
});

test("serializes render records without exposing the immutable snapshot", () => {
  const serialized = serializeVideoProjectRender({
    _id: { toString: () => "render-1" },
    projectId: { toString: () => "project-1" },
    status: "queued",
    progress: 0,
    resolution: "1080p",
    aspectRatio: "9:16",
    duration: 12,
    attempt: 0,
    snapshot: {
      title: "Private snapshot",
      tracks: [{ id: "track-1" }],
      items: [{ id: "video-1", sourceUrl: "https://cdn.example.com/video.mp4" }],
      settings: { fps: 30 },
    },
    createdAt: new Date("2026-07-24T01:00:00.000Z"),
    updatedAt: new Date("2026-07-24T01:00:00.000Z"),
  });

  assert.deepEqual(serialized, {
    id: "render-1",
    projectId: "project-1",
    status: "queued",
    progress: 0,
    stageMessage: undefined,
    outputUrl: undefined,
    engine: undefined,
    resolution: "1080p",
    aspectRatio: "9:16",
    duration: 12,
    attempt: 0,
    errorCode: undefined,
    errorMessage: undefined,
    startedAt: undefined,
    completedAt: undefined,
    createdAt: new Date("2026-07-24T01:00:00.000Z"),
    updatedAt: new Date("2026-07-24T01:00:00.000Z"),
  });
  assert.equal("snapshot" in serialized, false);
});

test("copies the project blueprint into the immutable render snapshot for provider round trips", () => {
  const project = {
    title: "Provider project",
    aspectRatio: "16:9",
    blueprint: {
      timeline: {
        tracks: [{
          clips: [{
            asset: { type: "video", src: "https://provider.example.com/original.mp4" },
            start: 0,
            length: 5,
            transition: { in: "fade" },
          }],
        }],
      },
      output: { format: "mp4", aspectRatio: "16:9" },
    },
    editorState: {
      duration: 5,
      tracks: [{ id: "track-1" }],
      items: [{
        id: "video-1",
        type: "video",
        sourceUrl: "https://cdn.example.com/edited.mp4",
        start: 0,
        duration: 5,
      }],
    },
  };

  const immutableSnapshot = buildVideoProjectRenderSnapshot(project, "1080p");
  (project.blueprint.timeline as { tracks: unknown[] }).tracks.length = 0;

  assert.equal(immutableSnapshot.title, "Provider project");
  assert.equal(immutableSnapshot.settings.aspectRatio, "16:9");
  assert.equal(
    ((immutableSnapshot.sourceEdit?.timeline as { tracks: unknown[] }).tracks).length,
    1
  );
  assert.notEqual(immutableSnapshot.sourceEdit, project.blueprint);
});

test("redacts every provider-only field from public render serialization", () => {
  const serialized = serializeVideoProjectRender({
    _id: "render-1",
    projectId: "project-1",
    status: "uploading",
    progress: 85,
    engine: "shotstack",
    resolution: "1080p",
    aspectRatio: "16:9",
    duration: 5,
    attempt: 1,
    transferAttempt: 2,
    providerRenderId: "provider-render-secret",
    providerSubmissionState: "uncertain",
    providerSubmissionAttemptId: "private-attempt",
    providerSubmissionStartedAt: new Date("2026-07-24T01:00:00.000Z"),
    providerSubmissionUnknownAt: new Date("2026-07-24T01:01:00.000Z"),
    providerStatus: "done",
    providerOutputUrl: "https://cdn.shotstack.io/temporary.mp4",
    providerErrorCode: "provider-code",
    providerErrorMessage: "provider diagnostic",
    transferLeaseOwner: "private-owner",
    snapshot: {
      title: "Private",
      tracks: [],
      items: [],
      settings: {},
    },
  });

  assert.equal(serialized.engine, "shotstack");
  for (const field of [
    "snapshot",
    "providerRenderId",
    "providerSubmissionState",
    "providerSubmissionAttemptId",
    "providerSubmissionStartedAt",
    "providerSubmissionUnknownAt",
    "providerStatus",
    "providerOutputUrl",
    "providerErrorCode",
    "providerErrorMessage",
    "transferLeaseOwner",
    "transferAttempt",
  ]) {
    assert.equal(field in serialized, false);
  }
  assert.equal(JSON.stringify(serialized).includes("shotstack.io"), false);
  assert.equal(JSON.stringify(serialized).includes("provider diagnostic"), false);
});

test("sanitizes render errors without exposing stack text or internal newlines", () => {
  const error = new Error("Chromium render failed\ninternal renderer detail");
  error.stack = "Error: Chromium render failed\n    at renderInternal (C:\\secret\\renderer.ts:42:9)";

  const sanitized = sanitizeRenderError(error);

  assert.equal(sanitized.errorCode, "VIDEO_PROJECT_RENDER_FAILED");
  assert.equal(sanitized.errorMessage, "Video rendering failed.");
  assert.equal(/[\r\n]/.test(sanitized.errorMessage), false);
  assert.equal(sanitized.errorMessage.includes("renderInternal"), false);
  assert.equal(sanitized.errorMessage.includes("C:\\secret"), false);
});

test("maps paths, URLs, and command fragments to a safe public render error", () => {
  const sanitized = sanitizeRenderError(new Error(
    "FFMPEG command ffmpeg -i https://private.example/video.mp4 failed at C:\\secret\\render.tmp /var/tmp/output.mp4"
  ));

  assert.deepEqual(sanitized, {
    errorCode: "VIDEO_PROJECT_RENDER_FAILED",
    errorMessage: "FFmpeg fallback failed.",
  });
  assert.equal(sanitized.errorMessage.includes("https://"), false);
  assert.equal(sanitized.errorMessage.includes("C:\\"), false);
  assert.equal(sanitized.errorMessage.includes("/var/"), false);
  assert.equal(sanitized.errorMessage.includes("ffmpeg -i"), false);
});

test("builds colon-free render job options accepted by BullMQ 5.78.1", async () => {
  const queueModule = await import("../../queue/video-project-render-queue") as unknown as Record<string, unknown>;
  assert.equal(typeof queueModule.buildVideoProjectRenderJobOptions, "function");
  const buildOptions = queueModule.buildVideoProjectRenderJobOptions as (renderId: string) => Record<string, unknown>;
  const options = buildOptions("6650f0f0f0f0f0f0f0f0f0f0");

  assert.deepEqual(options, {
    jobId: "video-project-render-6650f0f0f0f0f0f0f0f0f0f0",
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
  assert.equal(String(options.jobId).includes(":"), false);

  const validateOptions = (
    Job.prototype as unknown as {
      validateOptions(
        this: { opts: Record<string, unknown>; name: string; parentKey?: string },
        jobData: { data: string }
      ): void;
    }
  ).validateOptions;
  assert.doesNotThrow(() => {
    validateOptions.call(
      { opts: options, name: "video-project-render" },
      { data: "{}" }
    );
  });
});

test("builds Redis configuration lazily from the supplied environment", async () => {
  const queueModule = await import("../../queue/video-project-render-queue") as unknown as Record<string, unknown>;
  assert.equal(typeof queueModule.buildVideoProjectRenderRedisConfig, "function");
  const buildConfig = queueModule.buildVideoProjectRenderRedisConfig as (
    env: NodeJS.ProcessEnv
  ) => Record<string, unknown>;

  assert.deepEqual(buildConfig({
    REDIS_HOST: "redis-after-dotenv",
    REDIS_PORT: "6381",
    REDIS_PASSWORD: "secret",
  }), {
    host: "redis-after-dotenv",
    port: 6381,
    password: "secret",
    maxRetriesPerRequest: null,
  });
  assert.equal(
    buildConfig({ REDIS_HOST: "second-host" }).host,
    "second-host"
  );
});

test("routes every post-claim exception through the terminal failure handler", async () => {
  const runnerModule = await import("../video-project-render-runner") as unknown as Record<string, unknown>;
  assert.equal(typeof runnerModule.runWithPostClaimFailureBoundary, "function");
  const runWithBoundary = runnerModule.runWithPostClaimFailureBoundary as (
    work: () => Promise<void>,
    onFailure: (error: unknown) => Promise<void>
  ) => Promise<void>;
  const failures: unknown[] = [];
  const adapterError = new Error("adapter failed");

  await runWithBoundary(
    async () => {
      throw adapterError;
    },
    async (error) => {
      failures.push(error);
    }
  );

  assert.deepEqual(failures, [adapterError]);
});

test("builds a sanitized terminal failure update scoped to active render states", async () => {
  const runnerModule = await import("../video-project-render-runner") as unknown as Record<string, unknown>;
  assert.equal(typeof runnerModule.buildRenderFailurePersistence, "function");
  const buildFailure = runnerModule.buildRenderFailurePersistence as (
    renderId: string,
    error: unknown,
    completedAt: Date
  ) => {
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
  };
  const completedAt = new Date("2026-07-24T06:00:00.000Z");

  const persistence = buildFailure(
    "render-1",
    new Error("adapter failed at C:\\internal\\adapter.ts"),
    completedAt
  );

  assert.deepEqual(persistence, {
    filter: {
      _id: "render-1",
      status: { $in: ["rendering", "uploading"] },
    },
    update: {
      $set: {
        status: "failed",
        stageMessage: "Video render failed.",
        errorCode: "VIDEO_PROJECT_RENDER_FAILED",
        errorMessage: "Video rendering failed.",
        completedAt,
      },
    },
  });
});
