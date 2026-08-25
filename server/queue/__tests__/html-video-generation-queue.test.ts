import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHtmlVideoGenerationQueueJobId,
  htmlVideoGenerationRetryDelayMs,
} from "../html-video-generation-queue";

test("builds BullMQ-safe HTML-video generation job IDs", () => {
  const jobId = buildHtmlVideoGenerationQueueJobId("6a69cf627be46b2a97c0c4f7");

  assert.equal(jobId, "html-video-generation-6a69cf627be46b2a97c0c4f7");
  assert.equal(jobId.includes(":"), false);
});

test("uses a safe exponential retry delay and honors provider Retry-After", () => {
  assert.equal(htmlVideoGenerationRetryDelayMs(undefined, 0), 15_000);
  assert.equal(htmlVideoGenerationRetryDelayMs(undefined, 1), 30_000);
  assert.equal(
    htmlVideoGenerationRetryDelayMs({ cause: { retryAfterMs: 45_000 } }, 0),
    45_000
  );
  assert.equal(
    htmlVideoGenerationRetryDelayMs({ cause: { retryAfterMs: 999_000 } }, 0),
    120_000
  );
});
