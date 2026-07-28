import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { VideoProjectRenderModel } from "../../model/video-project-render.model";
import { videoProjectRenderQueue } from "../../queue/video-project-render-queue";
import { requestVideoTemplatePreview } from "../video-template-preview.service";

test("creates and enqueues one preview render for a new template version", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (renderId: string) => {
    queuedIds.push(renderId);
    return { id: `job-${renderId}` };
  });

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => null,
  }));

  const createdRecord = {
    _id: new Types.ObjectId(),
    purpose: "template-preview",
    templateId: new Types.ObjectId(templateId),
    templateVersionId: new Types.ObjectId(templateVersionId),
    templateSourceHash: sourceHash,
  };

  context.mock.method(VideoProjectRenderModel, "create", async (data: Record<string, unknown>) => {
    assert.equal(data.purpose, "template-preview");
    assert.equal(data.engine, "shotstack");
    assert.equal(data.resolution, "720p");
    assert.equal(data.userId, "system");
    assert.equal(data.companyCode, "system");
    assert.equal(data.idempotencyKey, `template-preview:${templateVersionId}:${sourceHash}`);
    const snapshot = data.snapshot as Record<string, unknown>;
    assert.equal(snapshot.title, "Test Template");
    assert.deepEqual(snapshot.settings, { resolution: "720p", aspectRatio: "9:16", fps: 30 });
    return createdRecord;
  });

  const result = await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Test Template",
    aspectRatio: "9:16",
    duration: 5,
    normalizedEditorState: { tracks: [{ id: "track-1" }], items: [{ id: "item-1" }] },
    sourceEdit: { timeline: { tracks: [] }, output: { format: "mp4" } },
  });

  assert.deepEqual(result, {
    renderId: createdRecord._id.toString(),
    created: true,
  });
  assert.deepEqual(queuedIds, [createdRecord._id.toString()]);
});

test("returns the existing render for the same version and source hash", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";
  const existingRenderId = new Types.ObjectId().toString();

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (renderId: string) => {
    queuedIds.push(renderId);
    return { id: `job-${renderId}` };
  });

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: existingRenderId,
      purpose: "template-preview",
      templateId,
      templateVersionId,
      templateSourceHash: sourceHash,
    }),
  }));

  const result = await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Test Template",
    aspectRatio: "9:16",
    duration: 5,
    normalizedEditorState: {},
    sourceEdit: {},
  });

  assert.deepEqual(result, {
    renderId: existingRenderId,
    created: false,
  });
  assert.equal(queuedIds.length, 0);
});

test("builds an immutable render snapshot containing sourceEdit", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";
  let capturedSnapshot: Record<string, unknown> | undefined;

  context.mock.method(videoProjectRenderQueue, "add", async () => ({ id: "job-1" }));
  context.mock.method(VideoProjectRenderModel, "findOne", () => ({ lean: async () => null }));
  context.mock.method(VideoProjectRenderModel, "create", async (data: Record<string, unknown>) => {
    capturedSnapshot = data.snapshot as Record<string, unknown>;
    return { _id: new Types.ObjectId() };
  });

  const sourceEdit = { timeline: { tracks: [{ id: "t1" }] }, output: { format: "mp4" } };
  const normalizedEditorState = { tracks: [{ id: "t1" }], items: [{ id: "i1" }] };

  await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Immutable Test",
    aspectRatio: "16:9",
    duration: 10,
    normalizedEditorState,
    sourceEdit,
  });

  assert.ok(capturedSnapshot);
  assert.equal(capturedSnapshot.title, "Immutable Test");
  assert.deepEqual(capturedSnapshot.tracks, [{ id: "t1" }]);
  assert.deepEqual(capturedSnapshot.items, [{ id: "i1" }]);
  assert.deepEqual(capturedSnapshot.settings, { resolution: "720p", aspectRatio: "16:9", fps: 30 });
  assert.deepEqual(capturedSnapshot.sourceEdit, sourceEdit);
});

test("recovers a duplicate-key race without enqueueing twice", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";
  const duplicateId = new Types.ObjectId().toString();

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (renderId: string) => {
    queuedIds.push(renderId);
    return { id: `job-${renderId}` };
  });

  let findOneCalls = 0;
  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => {
      findOneCalls++;
      if (findOneCalls === 1) return null;
      return {
        _id: duplicateId,
        purpose: "template-preview",
        templateVersionId,
        templateSourceHash: sourceHash,
      };
    },
  }));

  context.mock.method(VideoProjectRenderModel, "create", async () => {
    const error = new Error("Duplicate key") as Error & { code: number };
    error.code = 11000;
    throw error;
  });

  const result = await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Test Template",
    aspectRatio: "9:16",
    duration: 5,
    normalizedEditorState: {},
    sourceEdit: {},
  });

  assert.deepEqual(result, {
    renderId: duplicateId,
    created: false,
  });
  assert.equal(queuedIds.length, 0);
});

test("retries a previously failed preview render on new request", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";
  const failedId = new Types.ObjectId().toString();

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (renderId: string) => {
    queuedIds.push(renderId);
    return { id: `job-${renderId}` };
  });

  let updateCalled = false;
  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: failedId,
      purpose: "template-preview",
      templateVersionId,
      templateSourceHash: sourceHash,
      status: "failed",
    }),
  }));
  context.mock.method(VideoProjectRenderModel, "updateOne", async (filter: Record<string, unknown>) => {
    assert.equal(filter._id, failedId);
    assert.equal(filter.status, "failed");
    updateCalled = true;
    return { matchedCount: 1 };
  });

  const result = await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Retry Failed",
    aspectRatio: "9:16",
    duration: 5,
    normalizedEditorState: {},
    sourceEdit: {},
  });

  assert.deepEqual(result, {
    renderId: failedId,
    created: true,
  });
  assert.equal(updateCalled, true);
  assert.deepEqual(queuedIds, [failedId]);
});

test("re-enqueues a queued preview render without duplicate DB creation", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";
  const queuedId = new Types.ObjectId().toString();

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (renderId: string) => {
    queuedIds.push(renderId);
    return { id: `job-${renderId}` };
  });

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: queuedId,
      purpose: "template-preview",
      templateVersionId,
      templateSourceHash: sourceHash,
      status: "queued",
    }),
  }));

  const result = await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Re-enqueue Queued",
    aspectRatio: "9:16",
    duration: 5,
    normalizedEditorState: {},
    sourceEdit: {},
  });

  assert.deepEqual(result, {
    renderId: queuedId,
    created: false,
  });
  assert.deepEqual(queuedIds, [queuedId]);
});

test("does not auto-retry failed render when submission state is uncertain without force: true", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const templateVersionId = new Types.ObjectId().toString();
  const sourceHash = "hash-123456";
  const failedId = new Types.ObjectId().toString();

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (renderId: string) => {
    queuedIds.push(renderId);
    return { id: `job-${renderId}` };
  });

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: failedId,
      purpose: "template-preview",
      templateVersionId,
      templateSourceHash: sourceHash,
      status: "failed",
      providerSubmissionState: "uncertain",
      errorCode: "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN",
    }),
  }));

  const result = await requestVideoTemplatePreview({
    templateId,
    templateVersionId,
    sourceHash,
    title: "Uncertain Render",
    aspectRatio: "9:16",
    duration: 5,
    normalizedEditorState: {},
    sourceEdit: {},
  });

  assert.deepEqual(result, {
    renderId: failedId,
    created: false,
    uncertain: true,
  });
  assert.equal(queuedIds.length, 0);
});


