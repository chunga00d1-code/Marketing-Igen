import test from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { videoTemplateService } from "../video-template.service";
import { normalizeVideoTemplateListQuery } from "../video-template-policy";
import { VideoTemplateModel } from "../../model/video-template.model";
import { VideoProjectRenderModel } from "../../model/video-project-render.model";

test("resolves previewStatus as failed when render for publishedVersionId is failed", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const publishedVersionId = new Types.ObjectId().toString();
  const identity = { userId: "user-1", companyCode: "company-1", role: "admin" };

  context.mock.method(VideoTemplateModel, "find", () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => [
            {
              _id: templateId,
              title: "Shotstack Template",
              description: "Desc",
              thumbnailUrl: "https://example.com/thumb.jpg",
              previewVideoUrl: undefined,
              publishedVersionId,
              sourceProvider: "shotstack",
              duration: 15,
              aspectRatio: "9:16",
              categoryId: "shotstack",
              categoryName: "Shotstack",
              visibility: "system",
            },
          ],
        }),
      }),
    }),
  }));

  context.mock.method(VideoTemplateModel, "countDocuments", async () => 1);

  let batchRenderQueryFilter: Record<string, unknown> | null = null;
  context.mock.method(VideoProjectRenderModel, "find", (filter: Record<string, unknown>) => {
    batchRenderQueryFilter = filter;
    return {
      select: () => ({
        lean: async () => [
          {
            templateVersionId: publishedVersionId,
            status: "failed",
          },
        ],
      }),
    };
  });

  const result = await videoTemplateService.listTemplates(
    identity,
    normalizeVideoTemplateListQuery({
      scope: "discover",
      sort: "newest",
      page: 1,
      limit: 20,
    })
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].previewStatus, "failed");
  assert.equal(result.items[0].previewVideoUrl, undefined);
  assert.ok(batchRenderQueryFilter);
  assert.deepEqual((batchRenderQueryFilter as Record<string, unknown>).purpose, "template-preview");
});

test("failed render of old version does not cause current version previewStatus to be failed", async (context) => {
  const templateId = new Types.ObjectId().toString();
  const currentVersionId = new Types.ObjectId().toString();
  const identity = { userId: "user-1", companyCode: "company-1", role: "admin" };

  context.mock.method(VideoTemplateModel, "find", () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => [
            {
              _id: templateId,
              title: "Shotstack Template v2",
              description: "Desc",
              thumbnailUrl: "https://example.com/thumb.jpg",
              previewVideoUrl: undefined,
              publishedVersionId: currentVersionId,
              sourceProvider: "shotstack",
              duration: 15,
              aspectRatio: "9:16",
              categoryId: "shotstack",
              categoryName: "Shotstack",
              visibility: "system",
            },
          ],
        }),
      }),
    }),
  }));

  context.mock.method(VideoTemplateModel, "countDocuments", async () => 1);

  context.mock.method(VideoProjectRenderModel, "find", (filter: Record<string, unknown>) => {
    const versionIn = (filter.templateVersionId as Record<string, unknown>).$in as string[];
    assert.deepEqual(versionIn, [currentVersionId]);
    return {
      select: () => ({
        lean: async () => [],
      }),
    };
  });

  const result = await videoTemplateService.listTemplates(
    identity,
    normalizeVideoTemplateListQuery({
      scope: "discover",
      sort: "newest",
      page: 1,
      limit: 20,
    })
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].previewStatus, "pending");
});
