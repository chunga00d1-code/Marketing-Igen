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
  assert.equal(title.mergeValue, "");
  assert.equal(title.replaceable, true);
  assert.deepEqual(title.providerBinding, {
    provider: "shotstack",
    trackIndex: 0,
    clipIndex: 3,
    textMergeField: {
      key: "NAME",
      assetType: "title",
      source: "Hello {{NAME}}",
      prefix: "Hello ",
      suffix: "",
    },
  });
  assert.deepEqual(title.style, {
    fontFamily: "Arial",
    fontSize: 64,
    color: "#ff0000",
    align: "center",
    bold: false,
    italic: false,
    x: 70,
    y: 70,
  });
  assert.equal(html.text, "HTML {{COPY}}");
  assert.equal(html.mergeValue, "");
  assert.equal(html.replaceable, true);
  assert.deepEqual(html.providerBinding, {
    provider: "shotstack",
    trackIndex: 0,
    clipIndex: 4,
    textMergeField: {
      key: "COPY",
      assetType: "html",
      source: "<p>HTML <b>{{COPY}}</b></p>",
      prefix: "HTML ",
      suffix: "",
    },
  });
  assert.equal(soundtrack.sourceUrl, "https://cdn.example.com/music.mp3");
  assert.equal(soundtrack.volume, 0.25);
  assert.deepEqual(soundtrack.providerBinding, {
    provider: "shotstack",
    trackIndex: -1,
    clipIndex: -1,
  });
});

test("resolves saved merge values and imports auto/end clips using the provider timeline duration", () => {
  const edit: ShotstackEdit = {
    timeline: {
      tracks: [
        {
          clips: [
            {
              asset: { type: "video", src: "{{ MAIN_VIDEO }}", volume: 1 },
              start: 0,
              length: "auto",
            },
          ],
        },
        {
          clips: [
            {
              asset: { type: "image", src: "{{ FOOTAGE_2 }}" },
              start: 5,
              length: 2,
            },
            {
              asset: { type: "audio", src: "{{ MUSIC }}", volume: 0.3 },
              start: 0,
              length: "end",
            },
            {
              asset: { type: "title", text: "Hello {{ NAME }}" },
              start: 12,
              length: 4,
            },
          ],
        },
      ],
    },
    output: { format: "mp4", aspectRatio: "9:16" },
    merge: [
      { find: "MAIN_VIDEO", replace: "https://cdn.example.com/main.mp4" },
      { find: "FOOTAGE_2", replace: "https://cdn.example.com/image.jpg" },
      { find: "MUSIC", replace: "https://cdn.example.com/music.mp3" },
      { find: "NAME", replace: "Shotstack" },
    ],
  };

  const result = shotstackEditToEditorProject(edit);
  const mainVideo = result.project.items.find((item) => item.id === "shotstack-0-0");
  const image = result.project.items.find((item) => item.id === "shotstack-1-0");
  const music = result.project.items.find((item) => item.id === "shotstack-1-1");
  const title = result.project.items.find((item) => item.id === "shotstack-1-2");

  assert.equal(result.project.settings.duration, 16);
  assert.equal(mainVideo?.sourceUrl, "https://cdn.example.com/main.mp4");
  assert.equal(mainVideo?.duration, 16);
  assert.equal(mainVideo?.replaceable, true);
  assert.equal(image?.sourceUrl, "https://cdn.example.com/image.jpg");
  assert.equal(image?.replaceable, true);
  assert.equal(music?.sourceUrl, "https://cdn.example.com/music.mp3");
  assert.equal(music?.duration, 16);
  assert.equal(title?.text, "Hello Shotstack");
  assert.equal(title?.mergeValue, "Shotstack");
  assert.equal(title?.replaceable, true);
  assert.deepEqual(result.sourceEdit, edit);
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

test("preserves every unchanged Shotstack fit mode during round trip", () => {
  for (const fit of ["crop", "cover", "contain", "none"]) {
    const source = visualEdit();
    source.timeline.tracks[0].clips[0].fit = fit;
    const converted = shotstackEditToEditorProject(source);

    const output = editorProjectToShotstackEdit(converted.project, source);

    assert.equal(output.timeline.tracks[0].clips[0].fit, fit);
  }
});

test("preserves provider-bound title positioning from the source blueprint", () => {
  const source: ShotstackEdit = {
    timeline: {
      tracks: [{
        clips: [{
          asset: {
            type: "title",
            text: "Positioned title",
            position: "bottomRight",
            offset: { x: -0.2, y: 0.2 },
          },
          start: 0,
          length: 4,
        }],
      }],
    },
    output: { format: "mp4", aspectRatio: "16:9" },
  };
  const converted = shotstackEditToEditorProject(source);
  const title = converted.project.items[0];

  assert.equal((title.style as Record<string, unknown>).x, 80);
  assert.equal((title.style as Record<string, unknown>).y, 80);

  const output = editorProjectToShotstackEdit(
    snapshot([{
      ...title,
      style: { ...(title.style as Record<string, unknown>), x: 25, y: 25 },
    }]),
    source
  );
  assert.deepEqual(output, source);
});

test("preserves provider-bound HTML positioning from the source blueprint", () => {
  const source: ShotstackEdit = {
    timeline: {
      tracks: [{
        clips: [{
          asset: {
            type: "html",
            html: "<p>Positioned HTML</p>",
          },
          start: 0,
          length: 4,
          position: "bottomRight",
          offset: { x: -0.2, y: 0.2 },
        }],
      }],
    },
    output: { format: "mp4", aspectRatio: "16:9" },
  };
  const converted = shotstackEditToEditorProject(source);
  const html = converted.project.items[0];

  assert.equal((html.style as Record<string, unknown>).x, 80);
  assert.equal((html.style as Record<string, unknown>).y, 80);

  const output = editorProjectToShotstackEdit(
    snapshot([{
      ...html,
      style: { ...(html.style as Record<string, unknown>), x: 25, y: 25 },
    }]),
    source
  );
  assert.deepEqual(output, source);
});

test("updates only a validated provider title merge-field value after serialization and reload", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips.push({
    asset: {
      type: "title",
      text: "Headline: {{ HEADLINE }}",
      color: "#ff3366",
      size: "large",
    },
    start: 1,
    length: 3,
    transition: { in: "fade" },
  });
  source.merge = [{
    find: "HEADLINE",
    replace: "Original",
    customMergeProperty: "preserved",
  }];
  const sourceBefore = structuredClone(source);
  const converted = shotstackEditToEditorProject(source);
  const title = converted.project.items.find((item) => item.id === "shotstack-0-1");

  assert.equal(title?.replaceable, true);
  assert.equal(title?.text, "Headline: Original");
  assert.equal(title?.mergeValue, "Original");
  assert.deepEqual(title?.providerBinding, {
    provider: "shotstack",
    trackIndex: 0,
    clipIndex: 1,
    rawTransition: { in: "fade" },
    textMergeField: {
      key: "HEADLINE",
      assetType: "title",
      source: "Headline: {{ HEADLINE }}",
      prefix: "Headline: ",
      suffix: "",
    },
  });
  assert.ok(title);
  if (!title) return;

  const reloadedTitle = JSON.parse(JSON.stringify(title)) as Record<string, unknown>;
  const output = editorProjectToShotstackEdit(
    snapshot([{
      ...reloadedTitle,
      text: "Headline: Updated",
      mergeValue: "Updated",
      start: 9,
      duration: 10,
      style: {
        ...(title.style as Record<string, unknown>),
        color: "#000000",
      },
    }]),
    source
  );
  const expected = structuredClone(source);
  (expected.merge as Array<Record<string, unknown>>)[0].replace = "Updated";

  assert.deepEqual(output, expected);
  assert.deepEqual(output.timeline.tracks[0].clips[1], source.timeline.tracks[0].clips[1]);
  assert.deepEqual(source, sourceBefore);
});

test("updates an HTML merge value without flattening its structure or inline styles", () => {
  const source = visualEdit();
  const originalHtml = [
    '<div style="font-family:Inter;color:#fff">',
    '<span style="font-weight:400">Offer: </span>',
    '<strong style="color:#ff0">{{ COPY }}</strong>',
    "</div>",
  ].join("");
  source.timeline.tracks[0].clips.push({
    asset: {
      type: "html",
      html: originalHtml,
      customHtmlProperty: { preserve: true },
    },
    start: 0,
    length: 5,
    effect: "zoomIn",
  });
  source.merge = [{ find: "COPY", replace: "Original offer" }];
  const converted = shotstackEditToEditorProject(source);
  const html = converted.project.items.find((item) => item.id === "shotstack-0-1");

  assert.equal(html?.replaceable, true);
  assert.equal(html?.text, "Offer: Original offer");
  assert.equal(html?.mergeValue, "Original offer");
  assert.deepEqual(html?.providerBinding, {
    provider: "shotstack",
    trackIndex: 0,
    clipIndex: 1,
    textMergeField: {
      key: "COPY",
      assetType: "html",
      source: originalHtml,
      prefix: "Offer: ",
      suffix: "",
    },
  });
  assert.ok(html);
  if (!html) return;

  const output = editorProjectToShotstackEdit(
    snapshot([{
      ...JSON.parse(JSON.stringify(html)) as Record<string, unknown>,
      text: "Offer: Fresh campaign",
      mergeValue: "Fresh campaign",
    }]),
    source
  );

  assert.equal(output.timeline.tracks[0].clips[1].asset.html, originalHtml);
  assert.deepEqual(
    output.timeline.tracks[0].clips[1],
    source.timeline.tracks[0].clips[1]
  );
  assert.deepEqual(output.merge, [{ find: "COPY", replace: "Fresh campaign" }]);
});

test("accumulates validated edits for multiple independent text merge fields", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips.push(
    {
      asset: { type: "title", text: "Name: {{ NAME }}" },
      start: 0,
      length: 2,
    },
    {
      asset: { type: "html", html: "<p>Offer: <strong>{{ OFFER }}</strong></p>" },
      start: 2,
      length: 2,
    }
  );
  source.merge = [
    { find: "NAME", replace: "Original name" },
    { find: "OFFER", replace: "Original offer" },
  ];
  const converted = shotstackEditToEditorProject(source);
  const title = converted.project.items.find((item) => item.id === "shotstack-0-1");
  const html = converted.project.items.find((item) => item.id === "shotstack-0-2");

  assert.ok(title && html);
  if (!title || !html) return;
  const output = editorProjectToShotstackEdit(
    snapshot([
      { ...title, text: "Name: Updated name", mergeValue: "Updated name" },
      { ...html, text: "Offer: Updated offer", mergeValue: "Updated offer" },
    ]),
    source
  );

  assert.deepEqual(output.merge, [
    { find: "NAME", replace: "Updated name" },
    { find: "OFFER", replace: "Updated offer" },
  ]);
  assert.deepEqual(output.timeline, source.timeline);
});

test("escapes HTML merge values as text while title merge values remain plain", () => {
  const source = visualEdit();
  const originalHtml = '<div class="offer">Offer: <strong>{{ HTML_COPY }}</strong></div>';
  source.timeline.tracks[0].clips.push(
    {
      asset: { type: "html", html: originalHtml },
      start: 0,
      length: 2,
    },
    {
      asset: { type: "title", text: "Headline: {{ TITLE_COPY }}" },
      start: 2,
      length: 2,
    }
  );
  source.merge = [
    { find: "HTML_COPY", replace: "Original HTML copy" },
    { find: "TITLE_COPY", replace: "Original title copy" },
  ];
  const converted = shotstackEditToEditorProject(source);
  const html = converted.project.items.find((item) => item.id === "shotstack-0-1");
  const title = converted.project.items.find((item) => item.id === "shotstack-0-2");
  const value = `Rock & <em>"Sale"</em> 'today'`;

  assert.ok(html && title);
  if (!html || !title) return;
  const output = editorProjectToShotstackEdit(
    snapshot([
      { ...html, text: `Offer: ${value}`, mergeValue: value },
      { ...title, text: `Headline: ${value}`, mergeValue: value },
    ]),
    source
  );

  assert.deepEqual(output.merge, [
    {
      find: "HTML_COPY",
      replace: "Rock &amp; &lt;em&gt;&quot;Sale&quot;&lt;/em&gt; &#39;today&#39;",
    },
    { find: "TITLE_COPY", replace: value },
  ]);
  assert.equal(output.timeline.tracks[0].clips[1].asset.html, originalHtml);
  assert.deepEqual(output.timeline, source.timeline);
});

test("keeps literal provider text and rebound merge-field text locked", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips.push(
    {
      asset: { type: "title", text: "Editable {{ TITLE }}" },
      start: 0,
      length: 2,
    },
    {
      asset: { type: "title", text: "Locked literal title", color: "#00ff00" },
      start: 2,
      length: 2,
    }
  );
  source.merge = [{ find: "TITLE", replace: "original" }];
  const converted = shotstackEditToEditorProject(source);
  const editable = converted.project.items.find((item) => item.id === "shotstack-0-1");
  const literal = converted.project.items.find((item) => item.id === "shotstack-0-2");

  assert.equal(editable?.replaceable, true);
  assert.equal(literal?.replaceable, false);
  assert.ok(editable && literal);
  if (!editable || !literal) return;

  const output = editorProjectToShotstackEdit(
    snapshot([
      {
        ...editable,
        text: "Editable tampered",
        providerBinding: {
          provider: "shotstack",
          trackIndex: 0,
          clipIndex: 2,
        },
      },
      {
        ...literal,
        replaceable: true,
        text: "Forged literal edit",
      },
    ]),
    source
  );

  assert.deepEqual(output, source);
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

test("ignores structural edits to a locked provider-bound visual", () => {
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

  assert.deepEqual(clip, source.timeline.tracks[0].clips[0]);
  assert.deepEqual(output.output, source.output);
});

test("replaces a bound video with an image without retaining video-only trim", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips[0].asset.src = "{{ VIDEO }}";
  source.timeline.soundtrack = {
    src: "https://cdn.example.com/music.mp3",
    volume: 0.25,
    effect: "fadeIn",
  };
  Object.assign(source.timeline.tracks[0].clips[0], {
    effect: "zoomIn",
    transition: { in: "fade", out: "slideLeft" },
    fit: "contain",
    position: "topRight",
    offset: { x: -0.1, y: 0.2 },
    opacity: 0.7,
    transform: { rotate: { angle: 15 }, skew: { x: 2 } },
    customClipProperty: "preserved",
  });
  source.timeline.tracks[0].clips[0].asset = {
    ...source.timeline.tracks[0].clips[0].asset,
    trim: 1.5,
    volume: 0.4,
    transcode: "h264",
    volumeEffect: "fadeOut",
    speed: 1.25,
    chromaKey: "#00ff00",
    crop: { top: 0.1 },
    customAssetProperty: "preserved",
  };

  const converted = shotstackEditToEditorProject(source);
  const replacement = {
    ...converted.project.items[0],
    type: "image",
    sourceUrl: "https://cdn.example.com/replacement.jpg",
    replacement: { originalType: "video", sourceType: "image" },
  };

  const output = editorProjectToShotstackEdit(
    snapshot([replacement, converted.project.items[1]]),
    source
  );
  const clip = output.timeline.tracks[0].clips[0];

  assert.equal(clip.asset.type, "image");
  assert.equal(clip.asset.src, "https://cdn.example.com/replacement.jpg");
  assert.equal(clip.asset.trim, undefined);
  assert.equal(clip.asset.volume, undefined);
  assert.equal(clip.asset.transcode, undefined);
  assert.equal(clip.asset.volumeEffect, undefined);
  assert.equal(clip.asset.speed, undefined);
  assert.equal(clip.asset.chromaKey, undefined);
  assert.deepEqual(clip.asset.crop, { top: 0.1 });
  assert.equal(clip.start, 0);
  assert.equal(clip.length, 5);
  assert.deepEqual(clip.transition, { in: "fade", out: "slideLeft" });
  assert.equal(clip.effect, "zoomIn");
  assert.equal(clip.fit, "contain");
  assert.equal(clip.position, "topRight");
  assert.deepEqual(clip.offset, { x: -0.1, y: 0.2 });
  assert.equal(clip.opacity, 0.7);
  assert.deepEqual(clip.transform, { rotate: { angle: 15 }, skew: { x: 2 } });
  assert.equal(clip.customClipProperty, "preserved");
  assert.equal(clip.asset.customAssetProperty, "preserved");
  assert.deepEqual(output.timeline.soundtrack, source.timeline.soundtrack);
});

test("replaces a bound image with a video without trusting client trim", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips[0] = {
    asset: { type: "image", src: "{{ IMAGE }}" },
    start: 2,
    length: 4,
    transition: { in: "fade" },
  };
  const converted = shotstackEditToEditorProject(source);
  const replacement = {
    ...converted.project.items[0],
    type: "video",
    sourceUrl: "https://cdn.example.com/replacement.mp4",
    trim: 1.25,
    replacement: { originalType: "image", sourceType: "video" },
  };

  const output = editorProjectToShotstackEdit(snapshot([replacement]), source);
  const clip = output.timeline.tracks[0].clips[0];

  assert.equal(clip.asset.type, "video");
  assert.equal(clip.asset.src, "https://cdn.example.com/replacement.mp4");
  assert.equal(clip.asset.trim, undefined);
  assert.equal(clip.start, 2);
  assert.equal(clip.length, 4);
  assert.deepEqual(clip.transition, { in: "fade" });
});

test("keeps unrelated bound clips, raw effects, and soundtrack unchanged during replacement", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips[0].asset.src = "{{ VIDEO }}";
  source.timeline.soundtrack = {
    src: "https://cdn.example.com/music.mp3",
    volume: 0.25,
    effect: "fadeIn",
  };
  source.timeline.tracks[0].clips.unshift({
    asset: { type: "luma", src: "https://cdn.example.com/locked-mask.mp4" },
    start: 0,
    length: 5,
    effect: "mask",
    customClipProperty: { keep: true },
  });
  source.timeline.tracks[0].clips.push({
    asset: {
      type: "image",
      src: "https://cdn.example.com/locked-background.jpg",
      customAssetProperty: { keep: true },
    },
    start: 0,
    length: 5,
    effect: "slideLeft",
    transition: { in: "wipe" },
    customClipProperty: { keep: true },
  });
  const converted = shotstackEditToEditorProject(source);
  const replacement = {
    ...converted.project.items[0],
    type: "image",
    sourceUrl: "https://cdn.example.com/replacement.jpg",
    replacement: { originalType: "video", sourceType: "image" },
  };
  const lockedLayer = converted.project.items[1];
  const soundtrack = converted.project.items[2];

  const output = editorProjectToShotstackEdit(
    snapshot([replacement, lockedLayer, soundtrack]),
    source
  );

  assert.deepEqual(output.timeline.tracks[0].clips[0], source.timeline.tracks[0].clips[0]);
  assert.deepEqual(output.timeline.tracks[0].clips[2], source.timeline.tracks[0].clips[2]);
  assert.deepEqual(output.timeline.soundtrack, source.timeline.soundtrack);
});

test("preserves bound source clips missing from the editor snapshot", () => {
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

  assert.deepEqual(output, source);
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

test("round-trips an untouched source edit byte-for-byte in data shape", () => {
  const source: ShotstackEdit = {
    name: "Provider blueprint",
    timeline: {
      soundtrack: {
        src: "{{ SOUNDTRACK }}",
        volume: 0.25,
        effect: "fadeIn",
        customSoundtrackProperty: { keep: true },
      },
      tracks: [{
        customTrackProperty: "keep-track",
        clips: [
          {
            asset: {
              type: "video",
              src: "{{ VIDEO }}",
              trim: 1.25,
              volume: 0.4,
              customAssetProperty: { keep: true },
            },
            start: 0,
            length: 5,
            transition: { in: "fade", out: "slideLeft" },
            effect: "zoomIn",
            customClipProperty: { keep: true },
          },
          {
            asset: {
              type: "html",
              html: "<p>Hello {{ NAME }}</p>",
              customHtmlProperty: "keep-html",
            },
            start: 1,
            length: "end",
            transition: { in: "wipe" },
          },
        ],
      }],
    },
    output: {
      format: "webm",
      aspectRatio: "9:16",
      size: { width: 900, height: 1600 },
      quality: "high",
    },
    merge: [
      { find: "VIDEO", replace: "https://cdn.example.com/default.mp4" },
      { find: "NAME", replace: "Default title" },
      { find: "SOUNDTRACK", replace: "https://cdn.example.com/default.mp3" },
    ],
  };
  const converted = shotstackEditToEditorProject(source);
  const snapshotWithoutSoundtrack = snapshot(
    converted.project.items.filter((item) => item.id !== "shotstack-soundtrack"),
    "16:9"
  );

  const output = editorProjectToShotstackEdit(snapshotWithoutSoundtrack, source);

  assert.deepEqual(output, source);
});

test("requires a valid replacement marker before changing a replaceable source clip", () => {
  const source = visualEdit();
  source.timeline.tracks[0].clips[0].asset.src = "{{ VIDEO }}";
  const converted = shotstackEditToEditorProject(source);
  const tamperedItem = {
    ...converted.project.items[0],
    type: "image",
    sourceUrl: "https://cdn.example.com/tampered.jpg",
    start: 9,
    duration: 11,
    fitMode: "fit",
  };

  const output = editorProjectToShotstackEdit(snapshot([tamperedItem]), source);

  assert.deepEqual(output, source);
});

test("validates a replacement binding against the original source track and clip", () => {
  const source: ShotstackEdit = {
    timeline: {
      tracks: [{
        clips: [
          {
            asset: { type: "video", src: "{{ FIRST_VIDEO }}" },
            start: 0,
            length: 4,
          },
          {
            asset: { type: "video", src: "{{ SECOND_VIDEO }}" },
            start: 4,
            length: 4,
          },
        ],
      }],
    },
    output: { format: "mp4", aspectRatio: "16:9" },
  };
  const converted = shotstackEditToEditorProject(source);
  const reboundItem = {
    ...converted.project.items[0],
    sourceUrl: "https://cdn.example.com/rebound.mp4",
    replacement: { originalType: "video", sourceType: "video" },
    providerBinding: {
      provider: "shotstack",
      trackIndex: 0,
      clipIndex: 1,
    },
  };

  const output = editorProjectToShotstackEdit(snapshot([reboundItem]), source);

  assert.deepEqual(output, source);
});

test("ignores forged replacement markers for locked source clips and unbound additions", () => {
  const source = visualEdit();
  const converted = shotstackEditToEditorProject(source);
  const forgedLockedItem = {
    ...converted.project.items[0],
    type: "image",
    sourceUrl: "https://cdn.example.com/forged.jpg",
    replacement: { originalType: "video", sourceType: "image" },
    start: 7,
    duration: 9,
  };
  const unboundItem = {
    id: "client-added",
    trackId: "track-video",
    type: "video",
    sourceUrl: "https://cdn.example.com/added.mp4",
    start: 0,
    duration: 5,
    order: 1,
  };

  const output = editorProjectToShotstackEdit(
    snapshot([forgedLockedItem, unboundItem]),
    source
  );

  assert.deepEqual(output, source);
});

test("imports all-symbolic visual clips with a deterministic positive fallback", () => {
  const source: ShotstackEdit = {
    timeline: {
      tracks: [{
        clips: [
          {
            asset: { type: "video", src: "{{ VIDEO }}" },
            start: 0,
            length: "auto",
          },
          {
            asset: { type: "image", src: "{{ IMAGE }}" },
            start: 4,
            length: "end",
          },
        ],
      }],
    },
    output: { format: "mp4", aspectRatio: "9:16" },
  };

  const converted = shotstackEditToEditorProject(source);

  assert.equal(converted.project.settings.duration, 9);
  assert.deepEqual(
    converted.project.items.map((item) => item.duration),
    [9, 5]
  );
  assert.ok(converted.project.items.every((item) => Number(item.duration) > 0));
});

test("prefers explicit metadata, output, timeline, or template duration for symbolic clips", () => {
  const placements: Array<[string, (edit: ShotstackEdit) => void]> = [
    ["metadata", (edit) => { edit.duration = 12; }],
    ["output", (edit) => { edit.output.duration = 12; }],
    ["timeline", (edit) => { edit.timeline.duration = 12; }],
    ["template", (edit) => { edit.template = { duration: 12 }; }],
  ];

  for (const [placement, addDuration] of placements) {
    const source: ShotstackEdit = {
      timeline: {
        tracks: [{
          clips: [{
            asset: { type: "video", src: "{{ VIDEO }}" },
            start: 2,
            length: "auto",
          }],
        }],
      },
      output: { format: "mp4", aspectRatio: "16:9" },
    };
    addDuration(source);

    const converted = shotstackEditToEditorProject(source);

    assert.equal(converted.project.settings.duration, 12, placement);
    assert.equal(converted.project.items[0].duration, 10, placement);
  }
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
