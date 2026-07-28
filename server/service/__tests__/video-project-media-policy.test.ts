import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoProjectMediaFolder,
  sanitizeCloudinaryPathSegment,
  validateVideoProjectMedia,
} from "../video-project-media-policy";

test("accepts an MP4 below 200 MB", () => {
  assert.deepEqual(validateVideoProjectMedia({
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    fileSize: 10 * 1024 * 1024,
    mediaType: "video",
  }), {
    mediaType: "video",
    resourceType: "video",
    maxBytes: 200 * 1024 * 1024,
  });
});

test("rejects a MIME type that does not match the media type", () => {
  assert.throws(() => validateVideoProjectMedia({
    fileName: "clip.mp3",
    mimeType: "audio/mpeg",
    fileSize: 1024,
    mediaType: "video",
  }), /không phù hợp/);
});

test("rejects an image larger than 20 MB", () => {
  assert.throws(() => validateVideoProjectMedia({
    fileName: "photo.png",
    mimeType: "image/png",
    fileSize: 21 * 1024 * 1024,
    mediaType: "image",
  }), /20MB/);
});

test("sanitizes identity values before using them in a folder", () => {
  assert.equal(sanitizeCloudinaryPathSegment("ACME VN/2026"), "acme_vn_2026");
  assert.equal(
    buildVideoProjectMediaFolder(
      { companyCode: "ACME VN", userId: "User/123" },
      "audio"
    ),
    "igen_erp/template_editor/acme_vn/user_123/audio"
  );
});
