import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { ShotstackRenderStatus } from "../../integration/shotstack/shotstack.types";
import { ShotstackProviderError } from "../../integration/shotstack/shotstack.client";
import { VideoProjectRenderModel } from "../../model/video-project-render.model";
import { VideoTemplateModel } from "../../model/video-template.model";
import { VideoTemplateVersionModel } from "../../model/video-template-version.model";
import {
  buildShotstackCallbackUrl,
  createShotstackRenderService,
  diagnosticMessage,
  fetchShotstackOutput,
  getVideoTemplateRenderEngine,
  MongooseShotstackRenderRepository,
  ShotstackWebhookError,
  validateCloudinaryOutputUrl,
  validateShotstackOutputUrl,
  type ShotstackRenderRecord,
  type ShotstackRenderRepository,
} from "../shotstack-render.service";

const NOW = new Date("2026-07-24T08:00:00.000Z");

function snapshot() {
  return {
    title: "Immutable project",
    tracks: [{ id: "track-1" }],
    items: [{
      id: "video-1",
      type: "video",
      sourceUrl: "https://cdn.example.com/video.mp4",
      start: 0,
      duration: 5,
    }],
    settings: { aspectRatio: "16:9", resolution: "1080p", fps: 30 },
    sourceEdit: {
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
  };
}

class MemoryRepository implements ShotstackRenderRepository {
  public render: ShotstackRenderRecord;

  constructor(overrides: Partial<ShotstackRenderRecord> = {}) {
    this.render = {
      _id: "render-1",
      status: "queued",
      snapshot: snapshot(),
      progress: 0,
      attempt: 0,
      transferAttempt: 0,
      ...overrides,
    };
  }

  async claimForSubmission(renderId: string, attemptId: string, now: Date) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "queued" ||
      this.render.providerRenderId
    ) return null;
    this.render = {
      ...this.render,
      status: "rendering",
      engine: "shotstack",
      providerSubmissionState: "attempting",
      providerSubmissionAttemptId: attemptId,
      providerSubmissionStartedAt: now,
      progress: Math.max(1, this.render.progress),
      attempt: this.render.attempt + 1,
      startedAt: now,
    };
    return structuredClone(this.render);
  }

  async persistProviderSubmission(
    renderId: string,
    attemptId: string,
    providerRenderId: string,
    providerStatus: string
  ) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "rendering" ||
      this.render.providerSubmissionState !== "attempting" ||
      this.render.providerSubmissionAttemptId !== attemptId ||
      this.render.providerRenderId
    ) return false;
    this.render = {
      ...this.render,
      providerRenderId,
      providerStatus,
      providerSubmissionState: "confirmed",
    };
    return true;
  }

  async markSubmissionUncertain(
    renderId: string,
    attemptId: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "rendering" ||
      this.render.providerSubmissionState !== "attempting" ||
      this.render.providerSubmissionAttemptId !== attemptId ||
      this.render.providerRenderId
    ) return false;
    this.render = { ...this.render, ...patch };
    return true;
  }

  async findById(renderId: string) {
    return this.render._id === renderId ? structuredClone(this.render) : null;
  }

  async findByProviderRenderId(providerRenderId: string) {
    return this.render.providerRenderId === providerRenderId
      ? structuredClone(this.render)
      : null;
  }

  async claimProviderPoll(renderId: string, now: Date, leaseUntil: Date) {
    if (
      this.render._id !== renderId ||
      !["rendering", "uploading"].includes(this.render.status) ||
      !this.render.providerRenderId ||
      (this.render.providerNextPollAt && this.render.providerNextPollAt > now)
    ) return null;
    this.render = { ...this.render, providerNextPollAt: leaseUntil };
    return structuredClone(this.render);
  }

  async recordProviderProgress(renderId: string, patch: Partial<ShotstackRenderRecord>) {
    if (this.render._id !== renderId || this.render.status !== "rendering") return null;
    this.render = { ...this.render, ...patch };
    return structuredClone(this.render);
  }

  async recordProviderCompletion(renderId: string, patch: Partial<ShotstackRenderRecord>) {
    if (
      this.render._id !== renderId ||
      !["rendering", "uploading"].includes(this.render.status)
    ) return null;
    this.render = { ...this.render, ...patch, status: "uploading" };
    return structuredClone(this.render);
  }

  async recordProviderFailure(renderId: string, patch: Partial<ShotstackRenderRecord>) {
    if (this.render._id !== renderId || this.render.status !== "rendering") return false;
    this.render = { ...this.render, ...patch, status: "failed" };
    return true;
  }

  async recordPollFailure(renderId: string, patch: Partial<ShotstackRenderRecord>) {
    if (this.render._id !== renderId || this.render.status !== "rendering") return false;
    this.render = { ...this.render, ...patch };
    return true;
  }

  async claimTransfer(
    renderId: string,
    leaseOwner: string,
    now: Date,
    leaseUntil: Date
  ) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "uploading" ||
      !this.render.providerOutputUrl ||
      (this.render.transferLeaseUntil && this.render.transferLeaseUntil > now)
    ) return null;
    this.render = {
      ...this.render,
      status: "uploading",
      progress: Math.max(85, this.render.progress),
      transferAttempt: this.render.transferAttempt + 1,
      transferLeaseOwner: leaseOwner,
      transferLeaseUntil: leaseUntil,
    };
    return structuredClone(this.render);
  }

  async completeTransfer(
    renderId: string,
    leaseOwner: string,
    outputUrl: string,
    completedAt: Date
  ) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "uploading" ||
      this.render.transferLeaseOwner !== leaseOwner
    ) return false;
    this.render = {
      ...this.render,
      status: "completed",
      progress: 100,
      outputUrl,
      completedAt,
    };
    return true;
  }

  async recordTransferFailure(
    renderId: string,
    leaseOwner: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "uploading" ||
      this.render.transferLeaseOwner !== leaseOwner
    ) return false;
    this.render = { ...this.render, ...patch };
    return true;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(
  repository: MemoryRepository,
  statuses: ShotstackRenderStatus[] = []
) {
  const submissions: Array<Record<string, unknown>> = [];
  const uploads: string[] = [];
  let statusIndex = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit(edit) {
        submissions.push(structuredClone(edit) as unknown as Record<string, unknown>);
        return { renderId: "provider-render-1" };
      },
      async getRender() {
        const status = statuses[Math.min(statusIndex, statuses.length - 1)];
        statusIndex += 1;
        if (!status) throw new Error("No provider status prepared.");
        return status;
      },
    },
    converter(projectSnapshot, sourceEdit) {
      return {
        timeline: sourceEdit?.timeline || { tracks: [] },
        output: {
          ...(sourceEdit?.output || { format: "mp4" }),
          aspectRatio: String(projectSnapshot.settings.aspectRatio),
        },
      };
    },
    async uploadMedia(url) {
      uploads.push(url);
      return "https://res.cloudinary.com/app/video/upload/render-1.mp4";
    },
    getEnvironment: () => ({
      SHOTSTACK_WEBHOOK_URL: "https://app.example.com/api/v1/webhooks/shotstack",
      SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
      CLOUDINARY_CLOUD_NAME: "app",
    }),
    now: () => new Date(NOW),
  });
  return { service, submissions, uploads };
}

test("defaults template rendering to Shotstack and uses local rendering only when explicit", () => {
  assert.equal(getVideoTemplateRenderEngine({}), "shotstack");
  assert.equal(getVideoTemplateRenderEngine({ VIDEO_TEMPLATE_RENDER_ENGINE: "shotstack" }), "shotstack");
  assert.equal(getVideoTemplateRenderEngine({ VIDEO_TEMPLATE_RENDER_ENGINE: "remotion" }), "remotion");
  assert.equal(getVideoTemplateRenderEngine({ VIDEO_TEMPLATE_RENDER_ENGINE: "REMOTION" }), "shotstack");
});

test("builds a callback only from a valid URL and safe configured secret", () => {
  assert.equal(buildShotstackCallbackUrl({
    SHOTSTACK_WEBHOOK_URL: "https://app.example.com/api/v1/webhooks/shotstack/",
    SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
  }), "https://app.example.com/api/v1/webhooks/shotstack/safe_webhook_secret_12345");
  assert.equal(buildShotstackCallbackUrl({
    SHOTSTACK_WEBHOOK_URL: "https://app.example.com/callback",
    SHOTSTACK_WEBHOOK_SECRET: "short",
  }), undefined);
  assert.equal(buildShotstackCallbackUrl({
    SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
  }), undefined);
  assert.equal(buildShotstackCallbackUrl({
    SHOTSTACK_WEBHOOK_URL: "https://DOMAIN_BACKEND_PUBLIC/api/v1/webhooks/shotstack",
    SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
  }), undefined);
  assert.equal(buildShotstackCallbackUrl({
    SHOTSTACK_WEBHOOK_URL: "https://localhost:3000/api/v1/webhooks/shotstack",
    SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
  }), undefined);
});

test("submits the immutable snapshot once, preserves the provider edit, and persists provider ID", async () => {
  const repository = new MemoryRepository();
  const { service, submissions } = createHarness(repository);

  await Promise.all([
    service.submitShotstackRender("render-1"),
    service.submitShotstackRender("render-1"),
  ]);

  assert.equal(submissions.length, 1);
  assert.deepEqual(submissions[0].timeline, snapshot().sourceEdit.timeline);
  assert.equal(submissions[0].callback, "https://app.example.com/api/v1/webhooks/shotstack/safe_webhook_secret_12345");
  assert.equal(repository.render.providerRenderId, "provider-render-1");
  assert.equal(repository.render.engine, "shotstack");
  assert.equal(repository.render.status, "rendering");
});

test("submits template previews through the template render endpoint with saved merge values", async () => {
  const templateSnapshot = snapshot();
  const sourceEditWithMerge: Record<string, unknown> = {
    ...templateSnapshot.sourceEdit,
    merge: [
      { find: "MAIN_VIDEO", replace: "https://cdn.example.com/default.mp4" },
    ],
  };
  const previewSnapshot = {
    ...templateSnapshot,
    sourceEdit: sourceEditWithMerge,
  };
  const repository = new MemoryRepository({
    purpose: "template-preview",
    templateId: "local-template-1",
    snapshot: previewSnapshot,
  });
  let templateSubmission: Record<string, unknown> | undefined;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        throw new Error("Template preview must not use the raw edit endpoint.");
      },
      async renderTemplate(input: Record<string, unknown>) {
        templateSubmission = structuredClone(input);
        return { renderId: "provider-template-render-1" };
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    async resolveTemplateProviderId(templateId: string) {
      assert.equal(templateId, "local-template-1");
      return "shotstack-template-1";
    },
    getEnvironment: () => ({
      SHOTSTACK_WEBHOOK_URL: "https://app.example.com/api/v1/webhooks/shotstack",
      SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
    }),
    now: () => new Date(NOW),
  } as Parameters<typeof createShotstackRenderService>[0] & Record<string, unknown>);

  await service.submitShotstackRender("render-1");

  assert.deepEqual(templateSubmission, {
    templateId: "shotstack-template-1",
    merge: [
      { find: "MAIN_VIDEO", replace: "https://cdn.example.com/default.mp4" },
    ],
  });
  assert.equal(repository.render.providerRenderId, "provider-template-render-1");
  assert.equal(repository.render.providerSubmissionState, "confirmed");
});

test("persists the durable attempting marker before issuing the provider POST", async () => {
  const repository = new MemoryRepository();
  let markerObserved = false;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        markerObserved = repository.render.providerSubmissionState === "attempting"
          && Boolean(repository.render.providerSubmissionAttemptId)
          && repository.render.status === "rendering";
        return { renderId: "provider-render-1" };
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    converter: (projectSnapshot, sourceEdit) => ({
      timeline: sourceEdit?.timeline || { tracks: [] },
      output: {
        ...(sourceEdit?.output || { format: "mp4" }),
        aspectRatio: String(projectSnapshot.settings.aspectRatio),
      },
    }),
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  await service.submitShotstackRender("render-1");

  assert.equal(markerObserved, true);
  assert.equal(repository.render.providerSubmissionState, "confirmed");
  assert.equal(repository.render.providerRenderId, "provider-render-1");
});

test("a simultaneous delivery does not abandon a fresh in-flight submission", async () => {
  const repository = new MemoryRepository();
  const postStarted = deferred<void>();
  const providerResponse = deferred<{ renderId: string }>();
  let posts = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        posts += 1;
        postStarted.resolve();
        return providerResponse.promise;
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    converter: (projectSnapshot, sourceEdit) => ({
      timeline: sourceEdit?.timeline || { tracks: [] },
      output: {
        ...(sourceEdit?.output || { format: "mp4" }),
        aspectRatio: String(projectSnapshot.settings.aspectRatio),
      },
    }),
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  const first = service.submitShotstackRender("render-1");
  await postStarted.promise;
  await service.submitShotstackRender("render-1");

  assert.equal(repository.render.status, "rendering");
  assert.equal(repository.render.providerSubmissionState, "attempting");
  providerResponse.resolve({ renderId: "provider-render-1" });
  await first;

  assert.equal(posts, 1);
  assert.equal(repository.render.providerSubmissionState, "confirmed");
  assert.equal(repository.render.providerRenderId, "provider-render-1");
});

test("rejects an invalid webhook secret and an unknown provider render", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const { service } = createHarness(repository);

  await assert.rejects(
    () => service.acceptShotstackWebhook(
      { id: "provider-render-1", status: "rendering" },
      "wrong-secret"
    ),
    (error: unknown) => error instanceof ShotstackWebhookError && error.status === 401
  );
  await assert.rejects(
    () => service.acceptShotstackWebhook(
      { id: "unknown-render", status: "rendering" },
      "safe_webhook_secret_12345"
    ),
    (error: unknown) => error instanceof ShotstackWebhookError && error.status === 404
  );
});

test("a duplicate completion webhook is idempotent and transfers to Cloudinary once", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const { service, uploads } = createHarness(repository);
  const payload = {
    id: "provider-render-1",
    status: "done",
    url: "https://cdn.shotstack.io/temp/render-1.mp4",
  };

  await service.acceptShotstackWebhook(payload, "safe_webhook_secret_12345");
  await service.acceptShotstackWebhook(payload, "safe_webhook_secret_12345");

  assert.deepEqual(uploads, ["https://cdn.shotstack.io/temp/render-1.mp4"]);
  assert.equal(repository.render.status, "completed");
  assert.equal(repository.render.outputUrl, "https://res.cloudinary.com/app/video/upload/render-1.mp4");
  assert.equal(repository.render.providerOutputUrl, "https://cdn.shotstack.io/temp/render-1.mp4");
  assert.equal(repository.render.transferAttempt, 1);
});

test("authenticated local polling reconciles completion and transfers provider output", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const { service, uploads } = createHarness(repository, [{
    id: "provider-render-1",
    status: "done",
    url: "https://cdn.shotstack.io/temp/render-1.mp4",
  }]);

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "completed");
  assert.equal(repository.render.providerStatus, "done");
  assert.equal(repository.render.transferAttempt, 1);
  assert.equal(uploads.length, 1);
});

test("provider failure becomes terminal without exposing provider diagnostics as output", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const { service } = createHarness(repository, [{
    id: "provider-render-1",
    status: "failed",
    error: "provider internal failure",
  }]);

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "failed");
  assert.equal(repository.render.errorCode, "VIDEO_PROJECT_RENDER_FAILED");
  assert.equal(repository.render.errorMessage, "Video rendering failed.");
  assert.equal(repository.render.providerErrorMessage, "provider internal failure");
  assert.equal(repository.render.outputUrl, undefined);
});

test("rejects a provider completion URL that is not HTTPS", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const { service, uploads } = createHarness(repository, [{
    id: "provider-render-1",
    status: "done",
    url: "http://cdn.shotstack.io/temp/render-1.mp4",
  }]);

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "failed");
  assert.equal(repository.render.errorMessage, "Video rendering failed.");
  assert.equal(uploads.length, 0);
});

test("a transfer failure keeps provider state and retries without resubmitting", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const submissions: unknown[] = [];
  let uploadAttempt = 0;
  let currentTime = new Date(NOW);
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit(edit) {
        submissions.push(edit);
        return { renderId: "unexpected-resubmit" };
      },
      async getRender() {
        return {
          id: "provider-render-1",
          status: "done",
          url: "https://cdn.shotstack.io/temp/render-1.mp4",
        };
      },
    },
    async uploadMedia() {
      uploadAttempt += 1;
      if (uploadAttempt === 1) throw new Error("Cloudinary unavailable");
      return "https://res.cloudinary.com/app/video/upload/render-1.mp4";
    },
    getEnvironment: () => ({ CLOUDINARY_CLOUD_NAME: "app" }),
    now: () => new Date(currentTime),
  });

  await service.reconcileShotstackRender("render-1");
  assert.equal(repository.render.status, "uploading");
  assert.equal(repository.render.providerRenderId, "provider-render-1");
  assert.equal(repository.render.providerOutputUrl, "https://cdn.shotstack.io/temp/render-1.mp4");

  currentTime = new Date(NOW.getTime() + 20 * 60_000);
  await service.reconcileShotstackRender("render-1");

  assert.equal(submissions.length, 0);
  assert.equal(uploadAttempt, 2);
  assert.equal(repository.render.transferAttempt, 2);
  assert.equal(repository.render.status, "completed");
});

test("terminal local state never regresses on later provider events", async () => {
  const repository = new MemoryRepository({
    status: "completed",
    progress: 100,
    providerRenderId: "provider-render-1",
    outputUrl: "https://res.cloudinary.com/app/final.mp4",
  });
  const { service, uploads } = createHarness(repository);

  await service.acceptShotstackWebhook({
    id: "provider-render-1",
    status: "failed",
    error: "late failure",
  }, "safe_webhook_secret_12345");
  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "completed");
  assert.equal(repository.render.outputUrl, "https://res.cloudinary.com/app/final.mp4");
  assert.equal(uploads.length, 0);
});

test("a stale provider event cannot regress uploading back to rendering", async () => {
  const repository = new MemoryRepository({
    status: "uploading",
    progress: 85,
    providerRenderId: "provider-render-1",
    providerStatus: "done",
  });
  const { service } = createHarness(repository);

  await service.acceptShotstackWebhook({
    id: "provider-render-1",
    status: "rendering",
  }, "safe_webhook_secret_12345");

  assert.equal(repository.render.status, "uploading");
  assert.equal(repository.render.progress, 85);
});

test("a stale in-flight poll cannot regress a concurrent webhook transfer or duplicate upload", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const statusStarted = deferred<void>();
  const providerStatus = deferred<ShotstackRenderStatus>();
  const uploadStarted = deferred<void>();
  const uploaded = deferred<string>();
  const uploads: string[] = [];
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        throw new Error("Unexpected submission.");
      },
      async getRender() {
        statusStarted.resolve();
        return providerStatus.promise;
      },
    },
    async uploadMedia(url) {
      uploads.push(url);
      uploadStarted.resolve();
      return uploaded.promise;
    },
    getEnvironment: () => ({
      SHOTSTACK_WEBHOOK_SECRET: "safe_webhook_secret_12345",
      CLOUDINARY_CLOUD_NAME: "app",
    }),
    now: () => new Date(NOW),
  });

  const poll = service.reconcileShotstackRender("render-1");
  await statusStarted.promise;
  const webhook = service.acceptShotstackWebhook({
    id: "provider-render-1",
    status: "done",
    url: "https://cdn.shotstack.io/au/stage/account/render-1.mp4",
  }, "safe_webhook_secret_12345");
  await uploadStarted.promise;

  providerStatus.resolve({ id: "provider-render-1", status: "rendering" });
  await poll;
  assert.equal(repository.render.status, "uploading");

  uploaded.resolve("https://res.cloudinary.com/app/video/upload/render-1.mp4");
  await webhook;

  assert.equal(repository.render.status, "completed");
  assert.equal(uploads.length, 1);
});

test("a durable pre-call submission marker prevents a crash redelivery from posting", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    engine: "shotstack",
    providerSubmissionState: "attempting",
    providerSubmissionAttemptId: "attempt-before-crash",
  } as Partial<ShotstackRenderRecord>);
  let posts = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        posts += 1;
        return { renderId: "must-not-submit" };
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  await service.submitShotstackRender("render-1");

  assert.equal(posts, 0);
  assert.equal(repository.render.status, "failed");
  assert.equal(repository.render.providerSubmissionState, "uncertain");
  assert.equal(repository.render.errorCode, "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN");
});

test("status reconciliation surfaces an abandoned pre-call marker for manual retry", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    engine: "shotstack",
    providerSubmissionState: "attempting",
    providerSubmissionAttemptId: "attempt-before-crash",
  } as Partial<ShotstackRenderRecord>);
  let providerRequests = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        providerRequests += 1;
        return { renderId: "must-not-submit" };
      },
      async getRender() {
        providerRequests += 1;
        throw new Error("Must not poll without a provider ID.");
      },
    },
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  await service.reconcileShotstackRender("render-1");

  assert.equal(providerRequests, 0);
  assert.equal(repository.render.status, "failed");
  assert.equal(repository.render.errorCode, "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN");
});

test("a timeout after POST is terminal-uncertain and never auto-posts again", async () => {
  const repository = new MemoryRepository();
  let posts = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        posts += 1;
        throw new Error("request timed out after provider acceptance");
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  await service.submitShotstackRender("render-1");
  await service.submitShotstackRender("render-1");

  assert.equal(posts, 1);
  assert.equal(repository.render.status, "failed");
  assert.equal(repository.render.providerSubmissionState, "uncertain");
  assert.equal(repository.render.errorCode, "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN");
});

test("a provider validation rejection is a definite failure and preserves diagnostics", async () => {
  const repository = new MemoryRepository();
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        throw new ShotstackProviderError("Callback URL is invalid.", {
          status: 400,
          code: "BAD_REQUEST",
        });
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  await service.submitShotstackRender("render-1");

  assert.equal(repository.render.status, "failed");
  assert.equal(repository.render.providerSubmissionState, "rejected");
  assert.equal(repository.render.providerErrorCode, "BAD_REQUEST");
  assert.equal(repository.render.providerErrorMessage, "Callback URL is invalid.");
  assert.equal(repository.render.errorCode, "VIDEO_PROJECT_RENDER_SUBMISSION_REJECTED");
});

test("provider-ID persistence failure is terminal-uncertain and never posts twice", async () => {
  class PersistenceFailureRepository extends MemoryRepository {
    override async persistProviderSubmission() {
      return false;
    }
  }
  const repository = new PersistenceFailureRepository();
  let posts = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        posts += 1;
        return { renderId: "provider-render-not-persisted" };
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    getEnvironment: () => ({}),
    now: () => new Date(NOW),
  });

  await service.submitShotstackRender("render-1");
  await service.submitShotstackRender("render-1");

  assert.equal(posts, 1);
  assert.equal(repository.render.providerRenderId, undefined);
  assert.equal(repository.render.providerSubmissionState, "uncertain");
  assert.equal(repository.render.errorCode, "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN");
});

test("accepts only documented Shotstack output hosts without URL ambiguity", () => {
  for (const url of [
    "https://cdn.shotstack.io/au/stage/account/render.mp4",
    "https://shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com/account/render.mp4",
    "https://shotstack-api-v1-output.s3-ap-southeast-2.amazonaws.com/account/render.mp4",
  ]) {
    assert.equal(validateShotstackOutputUrl(url), url);
  }

  for (const url of [
    "https://localhost/render.mp4",
    "https://127.0.0.1/render.mp4",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/render.mp4",
    "https://[::1]/render.mp4",
    "https://cdn.shotstack.io.evil.example/render.mp4",
    "https://evilcdn.shotstack.io/render.mp4",
    "https://user:password@cdn.shotstack.io/render.mp4",
    "https://cdn.shotstack.io:8443/render.mp4",
  ]) {
    assert.throws(() => validateShotstackOutputUrl(url), /Shotstack output URL/i);
  }
});

test("manual redirect handling rejects an unapproved redirect before fetching it", async () => {
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/internal" },
    });
  }) as typeof fetch;

  await assert.rejects(
    () => fetchShotstackOutput(
      "https://cdn.shotstack.io/au/stage/account/render.mp4",
      fetchImpl
    ),
    /Shotstack output URL/i
  );
  assert.deepEqual(requested, [
    "https://cdn.shotstack.io/au/stage/account/render.mp4",
  ]);
});

test("validates the final Cloudinary URL against the configured account path", () => {
  assert.equal(
    validateCloudinaryOutputUrl(
      "https://res.cloudinary.com/app/video/upload/render-1.mp4",
      { CLOUDINARY_CLOUD_NAME: "app" }
    ),
    "https://res.cloudinary.com/app/video/upload/render-1.mp4"
  );
  for (const url of [
    "http://res.cloudinary.com/app/video/upload/render-1.mp4",
    "https://res.cloudinary.com/another/video/upload/render-1.mp4",
    "https://res.cloudinary.com.evil.example/app/video.mp4",
    "https://user:password@res.cloudinary.com/app/video.mp4",
    "https://res.cloudinary.com:8443/app/video.mp4",
  ]) {
    assert.throws(
      () => validateCloudinaryOutputUrl(url, { CLOUDINARY_CLOUD_NAME: "app" }),
      /Cloudinary output URL/i
    );
  }
});

test("does not publicly complete when the uploader returns a foreign URL", async () => {
  const repository = new MemoryRepository({
    status: "rendering",
    providerRenderId: "provider-render-1",
  });
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        throw new Error("Unexpected submission.");
      },
      async getRender() {
        return {
          id: "provider-render-1",
          status: "done",
          url: "https://cdn.shotstack.io/au/stage/account/render-1.mp4",
        };
      },
    },
    async uploadMedia() {
      return "https://attacker.example/render-1.mp4";
    },
    getEnvironment: () => ({ CLOUDINARY_CLOUD_NAME: "app" }),
    now: () => new Date(NOW),
  });

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "uploading");
  assert.equal(repository.render.outputUrl, undefined);
  assert.equal(repository.render.providerErrorCode, "CLOUDINARY_TRANSFER_FAILED");
});

test("an expired transfer lease cannot let the old owner overwrite the new result", async () => {
  const repository = new MemoryRepository({
    status: "uploading",
    progress: 85,
    providerRenderId: "provider-render-1",
    providerOutputUrl: "https://cdn.shotstack.io/au/stage/account/render-1.mp4",
  });
  let currentTime = new Date(NOW);
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const firstUpload = deferred<string>();
  const secondUpload = deferred<string>();
  let uploadCount = 0;
  const service = createShotstackRenderService({
    repository,
    client: {
      async renderEdit() {
        throw new Error("Unexpected submission.");
      },
      async getRender() {
        throw new Error("Unexpected polling.");
      },
    },
    async uploadMedia() {
      uploadCount += 1;
      if (uploadCount === 1) {
        firstStarted.resolve();
        return firstUpload.promise;
      }
      secondStarted.resolve();
      return secondUpload.promise;
    },
    getEnvironment: () => ({ CLOUDINARY_CLOUD_NAME: "app" }),
    now: () => new Date(currentTime),
  });

  const first = service.reconcileShotstackRender("render-1");
  await firstStarted.promise;
  currentTime = new Date(NOW.getTime() + 16 * 60_000);
  const second = service.reconcileShotstackRender("render-1");
  await secondStarted.promise;

  secondUpload.resolve("https://res.cloudinary.com/app/video/upload/new.mp4");
  await second;
  firstUpload.resolve("https://res.cloudinary.com/app/video/upload/old.mp4");
  await first;

  assert.equal(uploadCount, 2);
  assert.equal(repository.render.status, "completed");
  assert.equal(
    repository.render.outputUrl,
    "https://res.cloudinary.com/app/video/upload/new.mp4"
  );
});

test("completed current template preview publishes the managed MP4 URL", async () => {
  const templateId = "template-1";
  const versionId = "version-1";
  const sourceHash = "hash-1";

  const templateStore = new Map<string, { publishedVersionId: string; previewVideoUrl?: string }>();
  templateStore.set(templateId, { publishedVersionId: versionId });

  const versionStore = new Map<string, { sourceHash: string }>();
  versionStore.set(versionId, { sourceHash });

  class TemplatePreviewRepository extends MemoryRepository {
    override async completeTransfer(renderId: string, leaseOwner: string, outputUrl: string, completedAt: Date) {
      const ok = await super.completeTransfer(renderId, leaseOwner, outputUrl, completedAt);
      if (!ok) return false;
      if (
        this.render.purpose === "template-preview" &&
        this.render.templateId &&
        this.render.templateVersionId &&
        this.render.templateSourceHash
      ) {
        const t = templateStore.get(this.render.templateId);
        const v = versionStore.get(this.render.templateVersionId);
        if (t && t.publishedVersionId === this.render.templateVersionId && v && v.sourceHash === this.render.templateSourceHash) {
          t.previewVideoUrl = outputUrl;
        }
      }
      return true;
    }
  }

  const repository = new TemplatePreviewRepository({
    purpose: "template-preview" as const,
    templateId,
    templateVersionId: versionId,
    templateSourceHash: sourceHash,
    status: "rendering",
    providerRenderId: "provider-render-1",
  } as Partial<ShotstackRenderRecord>);

  const { service } = createHarness(repository, [{
    id: "provider-render-1",
    status: "done",
    url: "https://cdn.shotstack.io/temp/render-1.mp4",
  }]);

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "completed");
  assert.equal(
    templateStore.get(templateId)?.previewVideoUrl,
    "https://res.cloudinary.com/app/video/upload/render-1.mp4"
  );
});

test("completed stale template preview cannot overwrite the current URL", async () => {
  const templateId = "template-1";
  const staleVersionId = "version-1";
  const newVersionId = "version-2";

  const templateStore = new Map<string, { publishedVersionId: string; previewVideoUrl?: string }>();
  templateStore.set(templateId, { publishedVersionId: newVersionId, previewVideoUrl: "https://res.cloudinary.com/app/video/upload/current.mp4" });

  const versionStore = new Map<string, { sourceHash: string }>();
  versionStore.set(staleVersionId, { sourceHash: "hash-1" });
  versionStore.set(newVersionId, { sourceHash: "hash-2" });

  class TemplatePreviewRepository extends MemoryRepository {
    override async completeTransfer(renderId: string, leaseOwner: string, outputUrl: string, completedAt: Date) {
      const ok = await super.completeTransfer(renderId, leaseOwner, outputUrl, completedAt);
      if (!ok) return false;
      if (
        this.render.purpose === "template-preview" &&
        this.render.templateId &&
        this.render.templateVersionId &&
        this.render.templateSourceHash
      ) {
        const t = templateStore.get(this.render.templateId);
        const v = versionStore.get(this.render.templateVersionId);
        if (t && t.publishedVersionId === this.render.templateVersionId && v && v.sourceHash === this.render.templateSourceHash) {
          t.previewVideoUrl = outputUrl;
        }
      }
      return true;
    }
  }

  const repository = new TemplatePreviewRepository({
    purpose: "template-preview" as const,
    templateId,
    templateVersionId: staleVersionId,
    templateSourceHash: "hash-1",
    status: "rendering",
    providerRenderId: "stale-render-1",
  } as Partial<ShotstackRenderRecord>);

  const { service } = createHarness(repository, [{
    id: "stale-render-1",
    status: "done",
    url: "https://cdn.shotstack.io/temp/stale.mp4",
  }]);

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "completed");
  assert.equal(
    templateStore.get(templateId)?.previewVideoUrl,
    "https://res.cloudinary.com/app/video/upload/current.mp4"
  );
});

test("project export completion remains unchanged", async () => {
  const repository = new MemoryRepository({
    purpose: "project-export" as const,
    status: "rendering",
    providerRenderId: "export-render-1",
  } as Partial<ShotstackRenderRecord>);

  const { service } = createHarness(repository, [{
    id: "export-render-1",
    status: "done",
    url: "https://cdn.shotstack.io/temp/export.mp4",
  }]);

  await service.reconcileShotstackRender("render-1");

  assert.equal(repository.render.status, "completed");
  assert.equal("templateId" in repository.render, false);
});

test("Mongoose completeTransfer executes transactional render and template preview updates", async (context) => {
  const renderId = "6650f0f0f0f0f0f0f0f0f0f1";
  const templateId = "6650f0f0f0f0f0f0f0f0f0f2";
  const templateVersionId = "6650f0f0f0f0f0f0f0f0f0f3";
  const sourceHash = "hash-prod-1";
  const leaseOwner = "lease-owner-1";

  const session = {
    async withTransaction(callback: () => Promise<void>) {
      await callback();
    },
    async endSession() {},
  };

  context.mock.method(
    mongoose,
    "startSession",
    async () => session as unknown as Awaited<ReturnType<typeof mongoose.startSession>>
  );

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: renderId,
      purpose: "template-preview",
      templateId,
      templateVersionId,
      templateSourceHash: sourceHash,
      status: "uploading",
      transferLeaseOwner: leaseOwner,
    }),
  }));

  const renderUpdates: Array<Record<string, unknown>> = [];
  context.mock.method(VideoProjectRenderModel, "updateOne", async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    renderUpdates.push({ filter, update });
    return { matchedCount: 1 };
  });

  context.mock.method(VideoTemplateModel, "findOne", () => ({
    session: () => ({
      lean: async () => ({ _id: templateId, publishedVersionId: templateVersionId }),
    }),
  }));

  context.mock.method(VideoTemplateVersionModel, "findOne", () => ({
    session: () => ({
      lean: async () => ({ _id: templateVersionId, templateId, sourceHash }),
    }),
  }));

  const templateUpdates: Array<Record<string, unknown>> = [];
  context.mock.method(VideoTemplateModel, "updateOne", async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    templateUpdates.push({ filter, update });
    return { matchedCount: 1 };
  });

  const repository = new MongooseShotstackRenderRepository();
  const outputUrl = "https://res.cloudinary.com/app/video/upload/final.mp4";
  const completedAt = new Date("2026-07-24T12:00:00.000Z");

  const success = await repository.completeTransfer(renderId, leaseOwner, outputUrl, completedAt);

  const renderFilter = renderUpdates[0].filter as Record<string, unknown>;
  const templateFilter = templateUpdates[0].filter as Record<string, unknown>;

  assert.equal(success, true);
  assert.equal(renderUpdates.length, 1);
  assert.equal(renderFilter._id, renderId);
  assert.equal(templateUpdates.length, 1);
  assert.equal(templateFilter._id, templateId);
  assert.equal(templateFilter.publishedVersionId, templateVersionId);
  assert.deepEqual(templateUpdates[0].update, { $set: { previewVideoUrl: outputUrl } });
});

test("diagnosticMessage extracts message from Error object and redacts API key", () => {
  const env = { SHOTSTACK_API_KEY: "secret-key-12345" };
  const err = new Error("Shotstack render failed with secret-key-12345 on line 1\nSecond line stack trace");

  const message = diagnosticMessage(err, env);
  assert.equal(message, "Shotstack render failed with [REDACTED] on line 1");
});

test("diagnosticMessage extracts message from object with message property and limits length", () => {
  const env = {};
  const obj = { message: "A".repeat(600) };

  const message = diagnosticMessage(obj, env);
  assert.equal(message?.length, 500);
});
