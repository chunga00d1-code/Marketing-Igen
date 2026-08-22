import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { HtmlVideoGenerationModel } from "../../../model/html-video-generation.model";
import {
  htmlVideoGenerationService,
  isRetryableHtmlVideoGenerationError,
} from "../html-video-generation.service";
import {
  HtmlVideoDraftError,
  htmlVideoDraftService,
} from "../html-video-draft.service";

const generationRecord = {
  _id: new Types.ObjectId(),
  userId: new Types.ObjectId(),
  companyCode: "ACME",
  input: {
    prompt: "Create a video",
    durationSeconds: 10,
    aspectRatio: "9:16" as const,
    resolution: "1080p" as const,
  },
  checkpoint: {},
};

function mockClaim(context: test.TestContext) {
  context.mock.method(HtmlVideoGenerationModel, "findOneAndUpdate", () => {
    const query = {
      select() {
        return query;
      },
      lean: async () => generationRecord,
    };
    return query as never;
  });
}

test("only treats provider unavailability as queue-retryable", () => {
  assert.equal(
    isRetryableHtmlVideoGenerationError(new HtmlVideoDraftError("AI_UNAVAILABLE")),
    true
  );
  assert.equal(
    isRetryableHtmlVideoGenerationError(new HtmlVideoDraftError("INVALID_OUTPUT")),
    false
  );
});

test("marks invalid JSON output terminal instead of queueing the whole job again", async (context) => {
  mockClaim(context);
  const updates: Array<Record<string, unknown>> = [];
  context.mock.method(HtmlVideoGenerationModel, "updateOne", async (_filter, update) => {
    updates.push(update as Record<string, unknown>);
    return { acknowledged: true } as never;
  });
  context.mock.method(htmlVideoDraftService, "generate", async () => {
    throw new HtmlVideoDraftError("INVALID_OUTPUT");
  });

  await htmlVideoGenerationService.processGeneration(String(generationRecord._id));

  assert.ok(updates.some((update) => (
    (update.$set as Record<string, unknown> | undefined)?.status === "failed"
  )));
  assert.ok(!updates.some((update) => (
    (update.$set as Record<string, unknown> | undefined)?.status === "queued"
  )));
});

test("keeps transient provider failures queued for bounded worker retry", async (context) => {
  mockClaim(context);
  const updates: Array<Record<string, unknown>> = [];
  context.mock.method(HtmlVideoGenerationModel, "updateOne", async (_filter, update) => {
    updates.push(update as Record<string, unknown>);
    return { acknowledged: true } as never;
  });
  context.mock.method(htmlVideoDraftService, "generate", async () => {
    throw new HtmlVideoDraftError("AI_UNAVAILABLE");
  });

  await assert.rejects(
    htmlVideoGenerationService.processGeneration(String(generationRecord._id)),
    /Dịch vụ AI hiện không khả dụng/
  );
  assert.ok(updates.some((update) => (
    (update.$set as Record<string, unknown> | undefined)?.status === "queued"
  )));
});
