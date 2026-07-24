import test from "node:test";
import assert from "node:assert/strict";
import type { ShotstackRenderStatus } from "../../integration/shotstack/shotstack.types";
import {
  buildShotstackCallbackUrl,
  createShotstackRenderService,
  getVideoTemplateRenderEngine,
  ShotstackWebhookError,
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

  async claimForSubmission(renderId: string, now: Date) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "queued" ||
      this.render.providerRenderId
    ) return null;
    this.render = {
      ...this.render,
      status: "rendering",
      engine: "shotstack",
      progress: Math.max(1, this.render.progress),
      attempt: this.render.attempt + 1,
      startedAt: now,
    };
    return structuredClone(this.render);
  }

  async persistProviderSubmission(renderId: string, providerRenderId: string, providerStatus: string) {
    if (
      this.render._id !== renderId ||
      this.render.status !== "rendering" ||
      this.render.providerRenderId
    ) return false;
    this.render = { ...this.render, providerRenderId, providerStatus };
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

  async updateActive(renderId: string, patch: Partial<ShotstackRenderRecord>) {
    if (
      this.render._id !== renderId ||
      !["rendering", "uploading"].includes(this.render.status)
    ) return null;
    this.render = { ...this.render, ...patch };
    return structuredClone(this.render);
  }

  async claimTransfer(renderId: string, now: Date, leaseUntil: Date) {
    if (
      this.render._id !== renderId ||
      !["rendering", "uploading"].includes(this.render.status) ||
      !this.render.providerOutputUrl ||
      (this.render.transferLeaseUntil && this.render.transferLeaseUntil > now)
    ) return null;
    this.render = {
      ...this.render,
      status: "uploading",
      progress: Math.max(85, this.render.progress),
      transferAttempt: this.render.transferAttempt + 1,
      transferLeaseUntil: leaseUntil,
    };
    return structuredClone(this.render);
  }

  async completeTransfer(renderId: string, outputUrl: string, completedAt: Date) {
    if (this.render._id !== renderId || this.render.status !== "uploading") return false;
    this.render = {
      ...this.render,
      status: "completed",
      progress: 100,
      outputUrl,
      completedAt,
    };
    return true;
  }
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
    getEnvironment: () => ({}),
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
