import assert from "node:assert/strict";
import test from "node:test";
import type { VideoProjectRenderSnapshot } from "../../../interface/video-project-render.interface";
import {
  editorProjectToShotstackEdit,
  shotstackEditToEditorProject,
} from "../shotstack.converter";
import type { ShotstackEdit } from "../shotstack.types";

function visualEdit(output: ShotstackEdit["output"] = { format: "mp4", aspectRatio: "16:9" }): ShotstackEdit {
  return {
    timeline: {
      tracks: [{
        clips: [{
          asset: { type: "video", src: "https://cdn.example.com/video.mp4" },
          start: 0,
          length: 5,
        }],
      }],
    },
    output,
  };
}

function snapshot(
  items: Array<Record<string, unknown>>,
  aspectRatio = "16:9"
): VideoProjectRenderSnapshot {
  return {
    title: "Edited project",
    tracks: [
      { id: "track-video", type: "video", name: "Video" },
      { id: "track-text", type: "text", name: "Text" },
      { id: "track-audio", type: "audio", name: "Audio" },
    ],
    items,
    settings: { aspectRatio, duration: 12 },
  };
}

test("converts supported clips, soundtrack, timing, and representable properties", () => {
  const edit: ShotstackEdit = {
    timeline: {
      soundtrack: { src: "https://cdn.example.com/music.mp3", volume: 0.25, effect: "fadeIn" },
      tracks: [{
        clips: [
          {
            asset: {
              type: "video",
              src: "https://cdn.example.com/{{VIDEO}}.mp4",
              trim: 1.5,
              volume: 0.6,
            },
            start: 2,
            length: 4,
            fit: "contain",
            scale: 0.8,
            opacity: 0.7,
            transform: { rotate: { angle: 15 } },
          },
          {
            asset: { type: "image", src: "https://cdn.example.com/image.jpg" },
            start: 1,
            length: 3,
            fit: "crop",
          },
          {
            asset: { type: "audio", src: "https://cdn.example.com/voice.mp3", volume: 0.4 },
            start: 0,
            length: 6,
          },
          {
            asset: {
              type: "title",
              text: "Hello {{NAME}}",
              color: "#ff0000",
              size: "large",
              position: "center",
              offset: { x: 0.2, y: -0.2 },
            },
            start: 0.5,
            length: 2,
          },
          {
            asset: {
              type: "html",
              html: "<p>HTML <b>{{COPY}}</b></p>",
              position: "bottom",
            },
            start: 3,
            length: 2,
          },
        ],
      }],
    },
    output: { format: "mp4", aspectRatio: "9:16" },
  };

  const result = shotstackEditToEditorProject(edit);
  const [video, image, audio, title, html, soundtrack] = result.project.items;

  assert.equal(result.project.settings.aspectRatio, "9:16");
  assert.equal(result.project.settings.duration, 6);
  assert.deepEqual(
    result.project.items.map((item) => item.type),
    ["video", "image", "audio", "text", "text", "audio"]
  );
  assert.deepEqual(video, {
    id: "shotstack-0-0",
    trackId: "track-video",
    type: "video",
    start: 2,
    duration: 4,
    sourceUrl: "https://cdn.example.com/{{VIDEO}}.mp4",
    replaceable: true,
    volume: 0.6,
    fitMode: "fit",
    rotation: 15,
    trim: 1.5,
    opacity: 0.7,
    scale: 0.8,
    label: "Video",
    order: 1,
    providerBinding: { provider: "shotstack", trackIndex: 0, clipIndex: 0 },
  });
  assert.equal(image.fitMode, "cover");
  assert.equal(audio.volume, 0.4);
  assert.equal(title.text, "Hello {{NAME}}");
  assert.equal(title.replaceable, true);
  assert.deepEqual(title.style, {
    fontFamily: "Arial",
    fontSize: 64,
    color: "#ff0000",
    align: "center",
    bold: false,
    italic: false,
    x: 60,
    y: 40,
  });
  assert.equal(html.text, "HTML {{COPY}}");
  assert.equal(html.replaceable, true);
  assert.equal(soundtrack.sourceUrl, "https://cdn.example.com/music.mp3");
  assert.equal(soundtrack.volume, 0.25);
  assert.deepEqual(soundtrack.providerBinding, {
    provider: "shotstack",
    trackIndex: -1,
    clipIndex: -1,
  });
});

test("derives every supported aspect ratio from provider ratio or dimensions", () => {
  for (const aspectRatio of ["9:16", "16:9", "1:1", "3:4"] as const) {
    assert.equal(
      shotstackEditToEditorProject(visualEdit({ format: "mp4", aspectRatio })).project.settings.aspectRatio,
      aspectRatio
    );
  }

  assert.equal(
    shotstackEditToEditorProject(visualEdit({
      format: "mp4",
      size: { width: 900, height: 1200 },
    })).project.settings.aspectRatio,
    "3:4"
  );
});

test("uses stable provider IDs, preserves transitions, and clones the source edit", () => {
  const edit = visualEdit();
  edit.timeline.tracks[0].clips[0].transition = { in: "fade", out: "slideLeft" };

  const first = shotstackEditToEditorProject(edit);
  const second = shotstackEditToEditorProject(edit);

  assert.equal(first.project.items[0].id, second.project.items[0].id);
  assert.deepEqual(first.project.items[0].providerBinding, {
    provider: "shotstack",
    trackIndex: 0,
    clipIndex: 0,
    rawTransition: { in: "fade", out: "slideLeft" },
  });
  assert.deepEqual(first.sourceEdit, edit);
  assert.notEqual(first.sourceEdit, edit);
  assert.notEqual(first.sourceEdit.timeline, edit.timeline);

  const roundTrip = editorProjectToShotstackEdit(first.project, first.sourceEdit);
  assert.deepEqual(roundTrip.timeline.tracks[0].clips[0].transition, {
    in: "fade",
    out: "slideLeft",
  });
});

test("reports unsupported clips instead of converting them", () => {
  const edit = visualEdit();
  edit.timeline.tracks[0].clips.push({
    asset: { type: "luma", src: "https://cdn.example.com/mask.mp4" },
    start: 0,
    length: 5,
  });

  const result = shotstackEditToEditorProject(edit);

  assert.equal(result.project.items.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /track 0.*clip 1.*luma/i);
});

test("rejects edits without a usable visual clip", () => {
  const edit: ShotstackEdit = {
    timeline: {
      tracks: [{
        clips: [{
          asset: { type: "audio", src: "https://cdn.example.com/audio.mp3" },
          start: 0,
          length: 5,
        }],
      }],
    },
    output: { format: "mp4", aspectRatio: "16:9" },
  };

  assert.throws(
    () => shotstackEditToEditorProject(edit),
    /no usable visual clip/i
  );
});

test("updates bound clips while preserving provider-specific output and effects", () => {
  const source = visualEdit({
    format: "webm",
    aspectRatio: "16:9",
    quality: "high",
    destinations: [{ provider: "shotstack", exclude: false }],
  });
  Object.assign(source.timeline.tracks[0].clips[0], {
    effect: "zoomIn",
    filter: "boost",
    transition: { in: "fade" },
  });
  const converted = shotstackEditToEditorProject(source);
  const boundItem = {
    ...converted.project.items[0],
    start: 1,
    duration: 8,
    sourceUrl: "https://cdn.example.com/replacement.mp4",
    trim: 2,
    volume: 0.3,
    fitMode: "fit",
    scale: 0.75,
    opacity: 0.5,
    rotation: 30,
  };

  const output = editorProjectToShotstackEdit(
    snapshot([boundItem], "9:16"),
    source
  );
  const clip = output.timeline.tracks[0].clips[0];

  assert.equal(output.output.format, "mp4");
  assert.equal(output.output.aspectRatio, "9:16");
  assert.equal(output.output.quality, "high");
  assert.deepEqual(output.output.destinations, [{ provider: "shotstack", exclude: false }]);
  assert.equal(clip.effect, "zoomIn");
  assert.equal(clip.filter, "boost");
  assert.equal(clip.start, 1);
  assert.equal(clip.length, 8);
  assert.equal(clip.asset.src, "https://cdn.example.com/replacement.mp4");
  assert.equal(clip.asset.trim, 2);
  assert.equal(clip.asset.volume, 0.3);
  assert.equal(clip.fit, "contain");
  assert.equal(clip.scale, 0.75);
  assert.equal(clip.opacity, 0.5);
  assert.deepEqual(clip.transform, { rotate: { angle: 30 } });
  assert.deepEqual(clip.transition, { in: "fade" });
});

test("omits bound clips deleted in the editor", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips.push({
    asset: { type: "image", src: "https://cdn.example.com/second.jpg" },
    start: 5,
    length: 5,
  });
  const converted = shotstackEditToEditorProject(source);

  const output = editorProjectToShotstackEdit(
    snapshot([converted.project.items[1]]),
    source
  );

  assert.equal(output.timeline.tracks[0].clips.length, 1);
  assert.equal(output.timeline.tracks[0].clips[0].asset.type, "image");
});

test("appends newly added video, image, audio, and text items as provider clips", () => {
  const output = editorProjectToShotstackEdit(snapshot([
    {
      id: "new-video",
      trackId: "track-video",
      type: "video",
      start: 0,
      duration: 4,
      sourceUrl: "https://cdn.example.com/new.mp4",
      order: 1,
    },
    {
      id: "new-image",
      trackId: "track-video",
      type: "image",
      start: 4,
      duration: 2,
      sourceUrl: "https://cdn.example.com/new.jpg",
      order: 2,
    },
    {
      id: "new-audio",
      trackId: "track-audio",
      type: "audio",
      start: 0,
      duration: 6,
      sourceUrl: "https://cdn.example.com/new.mp3",
      volume: 0.5,
      order: 1,
    },
    {
      id: "new-text",
      trackId: "track-text",
      type: "text",
      start: 1,
      duration: 3,
      text: "New title",
      order: 1,
    },
  ], "1:1"));

  const appended = output.timeline.tracks.flatMap((track) => track.clips);
  assert.deepEqual(appended.map((clip) => clip.asset.type), ["video", "image", "audio", "title"]);
  assert.equal(output.output.format, "mp4");
  assert.equal(output.output.aspectRatio, "1:1");
});

test("serializes bound items when the original provider edit is unavailable", () => {
  const converted = shotstackEditToEditorProject(visualEdit());

  const output = editorProjectToShotstackEdit(converted.project);

  assert.equal(output.timeline.tracks.length, 1);
  assert.equal(output.timeline.tracks[0].clips[0].asset.src, "https://cdn.example.com/video.mp4");
});

test("does not mutate the snapshot or source edit during reverse conversion", () => {
  const source = visualEdit();
  const converted = shotstackEditToEditorProject(source);
  const inputSnapshot = snapshot(converted.project.items);
  const sourceBefore = structuredClone(source);
  const snapshotBefore = structuredClone(inputSnapshot);

  const output = editorProjectToShotstackEdit(inputSnapshot, source);
  output.timeline.tracks[0].clips[0].asset.src = "changed-after-conversion";

  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(inputSnapshot, snapshotBefore);
});
