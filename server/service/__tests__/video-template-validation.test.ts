import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  createVideoTemplateBodySchema,
  useVideoTemplateBodySchema,
  videoTemplateListQuerySchema,
  createVideoProjectBodySchema,
  createVideoProjectRenderBodySchema,
  updateVideoProjectBodySchema,
} from "../../router/video-template.schemas";
import { VideoProjectRenderModel } from "../../model/video-project-render.model";

test("accepts supported template list filters", () => {
  const result = videoTemplateListQuerySchema.validate({
    scope: "mine",
    aspectRatio: "9:16",
    duration: "short",
    sort: "newest",
    page: 1,
    limit: 20,
  });
  assert.equal(result.error, undefined);
});

test("rejects unsupported use mode", () => {
  const result = useVideoTemplateBodySchema.validate({ mode: "duplicate" });
  assert.ok(result.error);
});

test("accepts a supported video project render request", () => {
  const result = createVideoProjectRenderBodySchema.validate({
    resolution: "1080p",
    idempotencyKey: "export_1720000000_abc123",
  });
  assert.equal(result.error, undefined);
});

test("rejects an unsupported video project render resolution", () => {
  const result = createVideoProjectRenderBodySchema.validate({
    resolution: "4k",
    idempotencyKey: "export_1720000000_abc123",
  });
  assert.ok(result.error);
});

test("defaults an omitted video project render resolution to 1080p", () => {
  const result = createVideoProjectRenderBodySchema.validate({
    idempotencyKey: "export_1720000000_abc123",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.resolution, "1080p");
});

test("rejects a missing video project render idempotency key", () => {
  const result = createVideoProjectRenderBodySchema.validate({ resolution: "1080p" });
  assert.ok(result.error);
});

test("rejects a malformed video project render idempotency key", () => {
  const result = createVideoProjectRenderBodySchema.validate({
    resolution: "1080p",
    idempotencyKey: "invalid key",
  });
  assert.ok(result.error);
});

test("requires a render snapshot to include title, tracks, items, and settings", () => {
  const render = new VideoProjectRenderModel({
    projectId: new Types.ObjectId(),
    userId: "user-1",
    companyCode: "company-1",
    aspectRatio: "9:16",
    duration: 10,
    snapshot: { title: "Project" },
    idempotencyKey: "export_1720000000_abc123",
  });
  assert.ok(render.validateSync());
});

test("accepts a complete video template without AI blueprint or replacement slots", () => {
  const result = createVideoTemplateBodySchema.validate({
    title: "Mẫu bán hàng",
    thumbnailUrl: "/brand-icon.png",
    previewVideoUrl: "https://example.com/template.mp4",
    duration: 15,
    aspectRatio: "9:16",
    categoryId: "sales",
    categoryName: "Bán hàng",
  });
  assert.equal(result.error, undefined);
});

test("accepts a complete editor project timeline", () => {
  const result = createVideoProjectBodySchema.validate({
    title: "Dự án mẫu",
    aspectRatio: "3:4",
    duration: 5,
    mode: "create-template",
    tracks: [{ id: "track-video", type: "video", name: "Video" }],
    items: [{
      id: "item-1",
      trackId: "track-video",
      type: "video",
      start: 0,
      duration: 5,
      order: 1,
    }],
  });
  assert.equal(result.error, undefined);
});

test("requires an expected revision when autosaving a project", () => {
  const result = updateVideoProjectBodySchema.validate({ title: "Tên mới" });
  assert.ok(result.error);
});
