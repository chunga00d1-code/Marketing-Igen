import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCloudinaryUploadResponse,
  validateEditorMediaMetadata,
} from "../videoProjectMediaService";

test("maps an audio file to audio media", () => {
  assert.equal(validateEditorMediaMetadata({
    name: "music.mp3",
    type: "audio/mpeg",
    size: 1024,
  }).mediaType, "audio");
});

test("rejects a video above 200 MB", () => {
  assert.throws(() => validateEditorMediaMetadata({
    name: "large.mp4",
    type: "video/mp4",
    size: 201 * 1024 * 1024,
  }), /200MB/);
});

test("rejects unsupported file formats", () => {
  assert.throws(() => validateEditorMediaMetadata({
    name: "document.pdf",
    type: "application/pdf",
    size: 1024,
  }), /định dạng/);
});

test("parses a secure Cloudinary URL", () => {
  assert.equal(parseCloudinaryUploadResponse({
    secure_url: "https://res.cloudinary.com/demo/video/upload/clip.mp4",
    duration: 12.5,
  }).url, "https://res.cloudinary.com/demo/video/upload/clip.mp4");
});

test("rejects an insecure Cloudinary response URL", () => {
  assert.throws(() => parseCloudinaryUploadResponse({
    secure_url: "http://example.com/clip.mp4",
  }), /không hợp lệ/);
});
