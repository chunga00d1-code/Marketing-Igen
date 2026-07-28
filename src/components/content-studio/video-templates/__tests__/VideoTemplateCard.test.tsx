import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoTemplateCard } from "../VideoTemplateCard";
import type { VideoTemplateSummary } from "../../../../types/video-template";

test("renders pending preview message and omits video tag when previewStatus is pending", () => {
  const template: VideoTemplateSummary = {
    id: "t-1",
    title: "Pending Shotstack Template",
    description: "Description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewVideoUrl: undefined,
    previewStatus: "pending",
    duration: 15,
    aspectRatio: "9:16",
    category: { id: "sales", name: "Sales" },
    tags: [],
    usageCount: 5,
    isFavorite: false,
    ownerType: "system",
    canEdit: false,
  };

  const markup = renderToStaticMarkup(createElement(VideoTemplateCard, {
    template,
    onClick: () => undefined,
  }));

  assert.match(markup, /Đang tạo bản xem trước…/);
  assert.doesNotMatch(markup, /<video/);
});

test("renders video tag and omits pending message when previewStatus is ready", () => {
  const template: VideoTemplateSummary = {
    id: "t-2",
    title: "Ready Shotstack Template",
    description: "Description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewVideoUrl: "https://res.cloudinary.com/app/video/upload/preview.mp4",
    previewStatus: "ready",
    duration: 15,
    aspectRatio: "9:16",
    category: { id: "sales", name: "Sales" },
    tags: [],
    usageCount: 5,
    isFavorite: false,
    ownerType: "system",
    canEdit: false,
  };

  const markup = renderToStaticMarkup(createElement(VideoTemplateCard, {
    template,
    onClick: () => undefined,
  }));

  assert.doesNotMatch(markup, /Đang tạo bản xem trước…/);
  assert.match(markup, /<video/);
});

test("renders failed preview message without spinner when previewStatus is failed", () => {
  const template: VideoTemplateSummary = {
    id: "t-3",
    title: "Failed Shotstack Template",
    description: "Description",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewVideoUrl: undefined,
    previewStatus: "failed",
    duration: 15,
    aspectRatio: "9:16",
    category: { id: "sales", name: "Sales" },
    tags: [],
    usageCount: 5,
    isFavorite: false,
    ownerType: "system",
    canEdit: false,
  };

  const markup = renderToStaticMarkup(createElement(VideoTemplateCard, {
    template,
    onClick: () => undefined,
  }));

  assert.match(markup, /Không thể tạo bản xem trước/);
  assert.doesNotMatch(markup, /animate-spin/);
  assert.doesNotMatch(markup, /<video/);
});

