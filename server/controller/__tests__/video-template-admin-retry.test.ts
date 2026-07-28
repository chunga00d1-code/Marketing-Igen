import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { videoTemplateController } from "../video-template.controller";
import { requireRole, type AuthenticatedRequest } from "../../middleware/auth";
import { VideoTemplateModel } from "../../model/video-template.model";
import { VideoTemplateVersionModel } from "../../model/video-template-version.model";
import { VideoProjectRenderModel } from "../../model/video-project-render.model";
import { videoProjectRenderQueue } from "../../queue/video-project-render-queue";

type MockResponse = {
  statusCode: number;
  jsonBody: Record<string, unknown>;
  status: (code: number) => MockResponse;
  json: (body: Record<string, unknown>) => MockResponse;
};

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    jsonBody: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      res.jsonBody = body;
      return res;
    },
  };
  return res;
}

test("admin preview retry endpoint rejects non-admin user with 403", async () => {
  const middleware = requireRole(["admin", "superadmin"]);
  const req = {
    user: { id: "user-normal", email: "user@example.com", role: "user", companyCode: "company-1" },
  } as AuthenticatedRequest;
  const res = createMockResponse();

  let nextCalled = false;
  middleware(req, res as unknown as Parameters<ReturnType<typeof requireRole>>[1], () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.jsonBody.status, "error");
  assert.match(String(res.jsonBody.message), /quyen/i);
});

test("admin retry endpoint returns 409 conflict when render is uncertain and force is not true", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const publishedVersionId = new Types.ObjectId().toString();
  const renderId = new Types.ObjectId().toString();

  context.mock.method(VideoTemplateModel, "findById", () => ({
    lean: async () => ({
      _id: templateId,
      sourceProvider: "shotstack",
      publishedVersionId,
      title: "Shotstack Template",
      aspectRatio: "9:16",
      duration: 10,
    }),
  }));

  context.mock.method(VideoTemplateVersionModel, "findById", () => ({
    lean: async () => ({
      _id: publishedVersionId,
      sourceHash: "hash-123",
      normalizedEditorState: {},
      sourceEdit: {},
    }),
  }));

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: renderId,
      purpose: "template-preview",
      status: "failed",
      providerSubmissionState: "uncertain",
      errorCode: "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN",
    }),
  }));

  const req = {
    user: { id: "admin-1", role: "admin", companyCode: "company-1" },
    params: { templateId },
    body: { force: false },
    query: {},
  } as unknown as Parameters<typeof videoTemplateController.retryPreview>[0];
  const res = createMockResponse();

  await videoTemplateController.retryPreview(req, res as unknown as Parameters<typeof videoTemplateController.retryPreview>[1]);

  assert.equal(res.statusCode, 409);
  assert.equal(res.jsonBody.status, "conflict");
  assert.match(String(res.jsonBody.message), /chưa chắc chắn/);
  assert.equal(res.jsonBody.uncertain, true);
  assert.equal(res.jsonBody.requiresForce, true);
});

test("admin retry endpoint permits retry when force is true and reuses existing render record", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const publishedVersionId = new Types.ObjectId().toString();
  const renderId = new Types.ObjectId().toString();

  context.mock.method(VideoTemplateModel, "findById", () => ({
    lean: async () => ({
      _id: templateId,
      sourceProvider: "shotstack",
      publishedVersionId,
      title: "Shotstack Template",
      aspectRatio: "9:16",
      duration: 10,
    }),
  }));

  context.mock.method(VideoTemplateVersionModel, "findById", () => ({
    lean: async () => ({
      _id: publishedVersionId,
      sourceHash: "hash-123",
      normalizedEditorState: {},
      sourceEdit: {},
    }),
  }));

  context.mock.method(VideoProjectRenderModel, "findOne", () => ({
    lean: async () => ({
      _id: renderId,
      purpose: "template-preview",
      status: "failed",
      providerSubmissionState: "uncertain",
      errorCode: "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN",
    }),
  }));

  let updateCalled = false;
  context.mock.method(VideoProjectRenderModel, "updateOne", async (filter: Record<string, unknown>) => {
    assert.equal(filter._id, renderId);
    updateCalled = true;
    return { matchedCount: 1 };
  });

  const queuedIds: string[] = [];
  context.mock.method(videoProjectRenderQueue, "add", async (id: string) => {
    queuedIds.push(id);
    return { id: `job-${id}` };
  });

  const req = {
    user: { id: "admin-1", role: "admin", companyCode: "company-1" },
    params: { templateId },
    body: { force: true },
    query: {},
  } as unknown as Parameters<typeof videoTemplateController.retryPreview>[0];
  const res = createMockResponse();

  await videoTemplateController.retryPreview(req, res as unknown as Parameters<typeof videoTemplateController.retryPreview>[1]);

  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonBody.status, "success");
  assert.equal(updateCalled, true);
  assert.deepEqual(queuedIds, [renderId]);
});

test("admin retry endpoint returns 400 when preview is already ready", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const publishedVersionId = new Types.ObjectId().toString();

  context.mock.method(VideoTemplateModel, "findById", () => ({
    lean: async () => ({
      _id: templateId,
      sourceProvider: "shotstack",
      publishedVersionId,
      previewVideoUrl: "https://res.cloudinary.com/app/video/upload/ready.mp4",
      title: "Shotstack Template",
      aspectRatio: "9:16",
      duration: 10,
    }),
  }));

  const req = {
    user: { id: "admin-1", role: "admin", companyCode: "company-1" },
    params: { templateId },
    body: {},
    query: {},
  } as unknown as Parameters<typeof videoTemplateController.retryPreview>[0];
  const res = createMockResponse();

  await videoTemplateController.retryPreview(req, res as unknown as Parameters<typeof videoTemplateController.retryPreview>[1]);

  assert.equal(res.statusCode, 400);
  assert.equal(res.jsonBody.status, "error");
  assert.match(String(res.jsonBody.message), /hoàn chỉnh/);
});
