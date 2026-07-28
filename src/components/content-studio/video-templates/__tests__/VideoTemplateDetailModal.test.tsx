import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoTemplateDetailModal } from "../VideoTemplateDetailModal";
import type { VideoTemplateDetail } from "../../../../types/video-template";
import { resolveTemplatePreviewPresentation } from "../video-template-preview-state";

test("renders pending preview message without video element in detail modal", () => {
  const template: VideoTemplateDetail = {
    id: "t-1",
    title: "Pending Shotstack Template",
    description: "Description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewVideoUrl: undefined,
    previewStatus: "pending",
    duration: 15,
    aspectRatio: "9:16",
    category: { id: "sales", name: "Sales" },
    tags: ["tag1"],
    usageCount: 5,
    isFavorite: false,
    ownerType: "system",
    canEdit: false,
    actions: { canUse: true, canEditTemplate: false, canArchive: false },
  };

  const markup = renderToStaticMarkup(createElement(VideoTemplateDetailModal, {
    template,
    isOpen: true,
    onClose: () => undefined,
    onSelectEditMode: () => undefined,
  }));

  assert.match(markup, /Đang tạo bản xem trước…/);
  assert.doesNotMatch(markup, /<video/);
  assert.match(markup, /Dùng mẫu này/);
});

test("renders video element when previewStatus is ready in detail modal", () => {
  const template: VideoTemplateDetail = {
    id: "t-2",
    title: "Ready Shotstack Template",
    description: "Description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewVideoUrl: "https://res.cloudinary.com/app/video/upload/preview.mp4",
    previewStatus: "ready",
    duration: 15,
    aspectRatio: "9:16",
    category: { id: "sales", name: "Sales" },
    tags: ["tag1"],
    usageCount: 5,
    isFavorite: false,
    ownerType: "system",
    canEdit: false,
    actions: { canUse: true, canEditTemplate: false, canArchive: false },
  };

  const markup = renderToStaticMarkup(createElement(VideoTemplateDetailModal, {
    template,
    isOpen: true,
    onClose: () => undefined,
    onSelectEditMode: () => undefined,
  }));

  assert.doesNotMatch(markup, /Đang tạo bản xem trước…/);
  assert.match(markup, /<video/);
  assert.match(markup, /Dùng mẫu này/);
});

test("renders failed preview message without spinner in detail modal and keeps action button active", () => {
  const template: VideoTemplateDetail = {
    id: "t-3",
    title: "Failed Shotstack Template",
    description: "Description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewVideoUrl: undefined,
    previewStatus: "failed",
    duration: 15,
    aspectRatio: "9:16",
    category: { id: "sales", name: "Sales" },
    tags: ["tag1"],
    usageCount: 5,
    isFavorite: false,
    ownerType: "system",
    canEdit: false,
    actions: { canUse: true, canEditTemplate: false, canArchive: false },
  };

  const markup = renderToStaticMarkup(createElement(VideoTemplateDetailModal, {
    template,
    isOpen: true,
    onClose: () => undefined,
    onSelectEditMode: () => undefined,
  }));

  assert.match(markup, /Không thể tạo bản xem trước/);
  assert.doesNotMatch(markup, /animate-spin/);
  assert.doesNotMatch(markup, /<video/);
  assert.match(markup, /Dùng mẫu này/);
});

test("a transient playback error uses an explicit retry state instead of an endless pending spinner", () => {
  assert.equal(
    resolveTemplatePreviewPresentation("ready", "https://cdn.example.com/preview.mp4", true),
    "playback-error"
  );
});

test("a ready preview remains playable when there is no playback error", () => {
  assert.equal(
    resolveTemplatePreviewPresentation("ready", "https://cdn.example.com/preview.mp4", false),
    "video"
  );
});
