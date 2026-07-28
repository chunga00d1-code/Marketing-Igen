import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRenderableProject,
  assertRenderTransition,
  editorProjectToBlueprint,
  getRenderDimensions,
  nextRenderProgress,
} from "../video-project-render-policy";
import { getVideoCompositionMetadata } from "../../remotion/entry";

test("returns the requested dimensions for every supported aspect ratio", () => {
  assert.deepEqual(getRenderDimensions("9:16", "720p"), { width: 720, height: 1280 });
  assert.deepEqual(getRenderDimensions("9:16", "1080p"), { width: 1080, height: 1920 });
  assert.deepEqual(getRenderDimensions("16:9", "720p"), { width: 1280, height: 720 });
  assert.deepEqual(getRenderDimensions("16:9", "1080p"), { width: 1920, height: 1080 });
  assert.deepEqual(getRenderDimensions("1:1", "720p"), { width: 720, height: 720 });
  assert.deepEqual(getRenderDimensions("1:1", "1080p"), { width: 1080, height: 1080 });
  assert.deepEqual(getRenderDimensions("3:4", "720p"), { width: 720, height: 960 });
  assert.deepEqual(getRenderDimensions("3:4", "1080p"), { width: 1080, height: 1440 });
  assert.throws(() => getRenderDimensions("9:16", "4k"), /720p|1080p/);
});

test("rejects empty timelines and non-HTTPS media", () => {
  assert.throws(() => assertRenderableProject({ duration: 5, items: [] }), /timeline/i);
  assert.throws(() => assertRenderableProject({
    duration: 5,
    items: [{ type: "video", sourceUrl: "blob:http://localhost/clip", start: 0, duration: 5 }],
  }), /HTTPS/);
});

test("maps editor timing and presentation fields into a Remotion blueprint", () => {
  const blueprint = editorProjectToBlueprint({
    duration: 12,
    aspectRatio: "9:16",
    items: [
      {
        id: "clip-1",
        type: "video",
        sourceUrl: "https://cdn.example.com/clip.mp4",
        start: 2,
        duration: 5,
        order: 3,
        volume: 0.8,
        fitMode: "cover",
      },
      {
        id: "caption-1",
        type: "text",
        text: "Sale now",
        start: 0,
        duration: 2,
        order: 4,
        style: { fontFamily: "Arial", fontSize: 32, color: "#ffffff", align: "center", bold: true, italic: false },
      },
    ],
  });

  assert.deepEqual(blueprint, {
    duration: 12,
    aspectRatio: "9:16",
    timeline: [
      {
        id: "clip-1",
        type: "video",
        src: "https://cdn.example.com/clip.mp4",
        start: 2,
        end: 7,
        order: 3,
        volume: 0.8,
        fitMode: "cover",
      },
      {
        id: "caption-1",
        type: "text",
        text: "Sale now",
        content: "Sale now",
        start: 0,
        end: 2,
        order: 4,
        style: { fontFamily: "Arial", fontSize: 32, color: "#ffffff", align: "center", bold: true, italic: false },
      },
    ],
  });
});

test("rejects transitions from terminal render states", () => {
  assert.doesNotThrow(() => assertRenderTransition("queued", "rendering"));
  assert.throws(() => assertRenderTransition("completed", "failed"), /terminal/i);
  assert.throws(() => assertRenderTransition("failed", "queued"), /terminal/i);
});

test("clamps render progress without allowing it to decrease", () => {
  assert.equal(nextRenderProgress(40, 25), 40);
  assert.equal(nextRenderProgress(40, 125), 100);
  assert.equal(nextRenderProgress(-10, 15), 15);
  assert.equal(nextRenderProgress(10, -15), 10);
});

test("uses blueprint duration and shared dimensions for Remotion metadata", () => {
  assert.deepEqual(getVideoCompositionMetadata({
    duration: 12,
    aspectRatio: "3:4",
    resolution: "1080p",
    timeline: [{ type: "video", start: 0, end: 1 }],
  }), {
    durationInFrames: 360,
    width: 1080,
    height: 1440,
  });
});
