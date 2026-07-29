import assert from "node:assert/strict";
import test from "node:test";
import { buildBulkCreateQueueJobId } from "../bulk-create-queue";
import { buildCampaignQueueJobId } from "../campaign-queue";
import { buildCreativeImageQueueJobId } from "../creative-image-queue";

test("campaign BullMQ job IDs do not use the reserved colon separator", () => {
  const slotId = "6a69cf627be46b2a97c0c4f7";
  for (const type of ["prepare", "media", "verify", "publish"] as const) {
    const jobId = buildCampaignQueueJobId(type, slotId);
    assert.equal(jobId, `campaign-${type}-${slotId}`);
    assert.equal(jobId.includes(":"), false);
  }
});

test("other BullMQ custom IDs avoid the reserved colon separator", () => {
  const entityId = "6a69cf627be46b2a97c0c4f7";
  const jobIds = [
    buildBulkCreateQueueJobId(entityId),
    buildCreativeImageQueueJobId(entityId),
  ];

  assert.deepEqual(jobIds, [
    `bulk-${entityId}`,
    `creative-image-${entityId}`,
  ]);
  assert.equal(jobIds.every((jobId) => !jobId.includes(":")), true);
});
