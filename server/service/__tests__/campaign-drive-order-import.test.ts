import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignDriveImportPreview } from "../campaign-drive-order-import.service";

const file = (name: string) => ({
  id: name,
  name,
  directUrl: `https://drive.test/${name}`,
  isVideo: /\.mp4$/i.test(name),
});

const orders = [1, 2, 3].map((position) => ({
  orderId: `order-${position}`,
  slotId: `slot-${position}`,
  title: `Bài ${position}`,
  scheduledAt: `2026-08-${String(position).padStart(2, "0")}T02:00:00.000Z`,
}));

test("maps Drive files to post order without shifting when a number is missing", () => {
  const preview = buildCampaignDriveImportPreview(orders, [
    file("03_2.png"),
    file("01.jpg"),
    file("03_1.png"),
  ]);

  assert.equal(preview.mappedOrders, 2);
  assert.deepEqual(preview.mappings.map((mapping) => mapping.files.map((item) => item.name)), [
    ["01.jpg"],
    [],
    ["03_1.png", "03_2.png"],
  ]);
  assert.deepEqual(preview.missingOrders.map((item) => item.position), [2]);
});

test("does not silently assign unnumbered or out-of-range files", () => {
  const preview = buildCampaignDriveImportPreview(orders, [
    file("cover.png"),
    file("04.jpg"),
    file("2.mp4"),
  ]);

  assert.deepEqual(preview.unmatchedFiles.map((item) => item.name), ["04.jpg", "cover.png"]);
  assert.equal(preview.mappings[1].files[0].name, "2.mp4");
});

test("accepts a video identified from Drive MIME type when its displayed name has no extension", () => {
  const preview = buildCampaignDriveImportPreview(orders, [{
    id: "video-file",
    name: "1",
    directUrl: "https://drive.test/video-file",
    isVideo: true,
    isMedia: true,
  }]);

  assert.equal(preview.totalFiles, 1);
  assert.equal(preview.mappings[0].files[0].name, "1");
});
