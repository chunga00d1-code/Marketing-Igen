import test from "node:test";
import assert from "node:assert/strict";
import {
  createProjectSnapshot,
  createProjectSnapshotFromVersion,
  DEFAULT_SYSTEM_VIDEO_TEMPLATES,
} from "../video-template.service";

test("creates an immutable project snapshot from a template version", () => {
  const blueprint = {
    timeline: [{ id: "text-1", type: "text", text: "Original" }],
  };
  const defaultValues = { headline: "Original" };

  const snapshot = createProjectSnapshot({
    title: "Sale",
    aspectRatio: "9:16",
    sourceMediaUrl: "https://cdn.example/preview.mp4",
    blueprint,
    defaultValues,
  });

  (blueprint.timeline[0] as { text: string }).text = "Changed";
  defaultValues.headline = "Changed";

  assert.equal(
    ((snapshot.blueprint.timeline as Array<{ text: string }>)[0]).text,
    "Original"
  );
  assert.equal(snapshot.slotValues.headline, "Original");
});

test("provides default system templates array", () => {
  assert.ok(Array.isArray(DEFAULT_SYSTEM_VIDEO_TEMPLATES));
});

test("clones synchronized provider edit and normalized editor state immutably", () => {
  const sourceEdit = {
    timeline: {
      tracks: [{
        clips: [{
          asset: { type: "video", src: "https://cdn.example/provider.mp4" },
          start: 0,
          length: 6,
        }],
      }],
    },
    output: { format: "mp4", aspectRatio: "9:16" },
  };
  const normalizedEditorState = {
    title: "Provider template",
    tracks: [{ id: "track-video", type: "video", name: "Video" }],
    items: [{
      id: "shotstack-0-0",
      trackId: "track-video",
      type: "video",
      sourceUrl: "https://cdn.example/provider.mp4",
      start: 0,
      duration: 6,
      providerBinding: { provider: "shotstack", trackIndex: 0, clipIndex: 0 },
    }],
    settings: { aspectRatio: "9:16", duration: 6 },
  };

  const snapshot = createProjectSnapshotFromVersion(
    {
      title: "Provider template",
      description: "",
      categoryId: "shotstack",
      tags: [],
      thumbnailUrl: "https://cdn.example/provider.mp4",
      previewVideoUrl: "https://cdn.example/provider.mp4",
      duration: 6,
      aspectRatio: "9:16",
    },
    {
      sourceEdit,
      normalizedEditorState,
      blueprint: normalizedEditorState,
      defaultValues: {},
    }
  );

  sourceEdit.timeline.tracks[0].clips[0].length = 20;
  normalizedEditorState.items[0].sourceUrl = "changed";

  assert.equal(
    (((snapshot.blueprint.timeline as { tracks: Array<{
      clips: Array<{ length: number }>;
    }> }).tracks[0]).clips[0].length),
    6
  );
  assert.equal(
    (snapshot.editorState.items as Array<Record<string, unknown>>)[0].sourceUrl,
    "https://cdn.example/provider.mp4"
  );
  assert.deepEqual(
    (snapshot.editorState.items as Array<Record<string, unknown>>)[0].providerBinding,
    { provider: "shotstack", trackIndex: 0, clipIndex: 0 }
  );
  assert.equal(snapshot.editorState.duration, 6);
});
