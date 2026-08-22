import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHtmlVideoMasterPromptFallback,
  geminiPromptOptimizerService,
  isValidHtmlVideoMasterPrompt,
  normalizeHtmlVideoReferenceAnalysis,
} from "../prompt-optimizer.service";

test("builds a source-faithful storyboard for the requested duration and aspect ratio", () => {
  const prompt = [
    "Introduce the Riverside apartment project.",
    "Highlight the riverside location.",
    "Mention the supplied legal-status document.",
  ].join("\n");
  const spec = { durationSeconds: 12, aspectRatio: "16:9" as const };
  const result = buildHtmlVideoMasterPromptFallback(prompt, spec);

  assert.match(result, /- Duration: 12 seconds/);
  assert.match(result, /- Aspect ratio: 16:9/);
  assert.equal((result.match(/^## SCENE /gm) || []).length, 3);
  assert.match(result, /- Time: 0\.0s-4\.0s/);
  assert.match(result, /- Time: 8\.0s-12\.0s/);
  assert.match(result, /- Source facts: Highlight the riverside location\./);
  assert.doesNotMatch(result, /limited quantity|free consultation|special offer/i);
  assert.equal(isValidHtmlVideoMasterPrompt(result, spec), true);
});

test("expands a short Vietnamese request without an image into a complete CSS motion brief", () => {
  const result = buildHtmlVideoMasterPromptFallback(
    "Tạo video hướng dẫn quản lý công việc",
    { durationSeconds: 10, aspectRatio: "9:16" }
  );

  assert.match(result, /- Content mode: educational/);
  assert.match(result, /- Language: Vietnamese\. Use one narration language throughout/);
  assert.match(result, /- Input image policy: No input image/);
  assert.match(result, /complete HTML\/CSS motion graphics/);
  assert.equal(isValidHtmlVideoMasterPrompt(result, { durationSeconds: 10 }), true);
});

test("makes an attached ordered-board image explicit in the master prompt", () => {
  const result = buildHtmlVideoMasterPromptFallback(
    "Đọc lần lượt từng mục trong bảng theo thứ tự",
    {
      durationSeconds: 30,
      aspectRatio: "16:9",
      inputImageCount: 1,
      imagePolicy: "embed",
    }
  );

  assert.match(result, /- Content mode: ordered-list/);
  assert.match(result, /1 input image\(s\) must appear in the final video/);
  assert.match(result, /keep it visible and highlight each item in source order/);
  assert.equal(isValidHtmlVideoMasterPrompt(result, { durationSeconds: 30 }), true);
});

test("recognizes a short unaccented Vietnamese ordered-board request", () => {
  const result = buildHtmlVideoMasterPromptFallback(
    "tao video doc lan luot tung muc trong bang jobs",
    { durationSeconds: 30, inputImageCount: 1, imagePolicy: "embed" }
  );

  assert.match(result, /- Content mode: ordered-list/);
  assert.match(result, /- Language: Vietnamese/);
});

test("keeps style-only reference images out of media slots", () => {
  const result = buildHtmlVideoMasterPromptFallback(
    "Tạo video giới thiệu hiện đại",
    {
      durationSeconds: 15,
      inputImageCount: 1,
      imagePolicy: "reference",
    }
  );

  assert.match(result, /used only as visual references/);
  assert.match(result, /do not reserve an empty media slot/);
});

test("rejects optimized storyboards with timing gaps or rushed scene narration", () => {
  const base = `# VIDEO BRIEF
# STORYBOARD
## SCENE 1
- Time: 0.0s-4.0s
- Purpose: OPENING
- Source facts: One supported fact.
- On-screen text: One supported fact.
- Voice-over: One supported fact.
- Visual: Full canvas.
- Motion: Reveal and hold.
- Transition: crossfade
## SCENE 2
- Time: 4.0s-8.0s
- Purpose: CLOSING
- Source facts: Another supported fact.
- On-screen text: Another supported fact.
- Voice-over: Another supported fact.
- Visual: Full canvas.
- Motion: Reveal and hold.
- Transition: hold
# GLOBAL DIRECTION`;

  assert.equal(isValidHtmlVideoMasterPrompt(base, { durationSeconds: 8 }), true);
  assert.equal(
    isValidHtmlVideoMasterPrompt(base.replace("- Time: 4.0s-8.0s", "- Time: 5.0s-8.0s"), { durationSeconds: 8 }),
    false
  );
  assert.equal(
    isValidHtmlVideoMasterPrompt(
      base.replace("- Voice-over: One supported fact.", `- Voice-over: ${"word ".repeat(20).trim()}`),
      { durationSeconds: 8 }
    ),
    false
  );
  assert.equal(
    isValidHtmlVideoMasterPrompt(
      base.replace("- Source facts: One supported fact.", "- Source facts: Limited free offer."),
      { durationSeconds: 8 },
      "Describe one supported fact and another supported fact."
    ),
    false
  );
});

test("turns a short follow-up into an in-place revision contract without resetting duration", async () => {
  const result = await geminiPromptOptimizerService.optimizeMasterVideoPrompt(
    "Làm khung highlight nhỏ hơn và giữ nguyên các phần khác",
    undefined,
    undefined,
    { durationSeconds: 90, aspectRatio: "9:16", mode: "revision" }
  );

  assert.match(result.master_prompt, /VIDEO REVISION REQUEST/);
  assert.match(result.master_prompt, /Modify the current approved video in place/);
  assert.match(result.master_prompt, /90 seconds/);
  assert.equal(result.assumptions?.durationSeconds, 90);
  assert.equal(result.isLocalFallback, true);
});


test("normalizes ordered OCR units and clamps image bounding boxes", () => {
  const result = normalizeHtmlVideoReferenceAnalysis({
    detectedLanguage: "English",
    orderedContentUnits: [
      {
        order: 2,
        text: " singer ",
        confidence: 1.4,
        boundingBox: { x: 0.82, y: 0.1, width: 0.4, height: 0.2 },
      },
      {
        order: 1,
        label: "teacher",
        confidence: 0.98,
        region: { left: 0.05, top: 0.1, w: 0.2, h: 0.2 },
      },
      { order: 3, text: "   ", confidence: 0.5 },
    ],
  });

  assert.equal(result.detected_language, "English");
  assert.deepEqual(result.ordered_content_units, [
    {
      order: 1,
      text: "teacher",
      confidence: 0.98,
      bounding_box: { x: 0.05, y: 0.1, width: 0.2, height: 0.2 },
    },
    {
      order: 2,
      text: "singer",
      confidence: 1,
      bounding_box: { x: 0.82, y: 0.1, width: 0.18, height: 0.2 },
    },
  ]);
});

test("keeps the image-analysis response contract stable when OCR finds no items", () => {
  assert.deepEqual(
    normalizeHtmlVideoReferenceAnalysis({ motion_analysis: "subtle motion" }),
    {
      motion_analysis: "subtle motion",
      detected_language: "",
      ordered_content_units: [],
    }
  );
});


test("requests ordered OCR units and normalized bounding boxes in the provider schema", () => {
  const source = readFileSync(
    new URL("../prompt-optimizer.service.ts", import.meta.url),
    "utf8"
  );
  const videoOptimizer = source.slice(
    source.indexOf("async optimizeVideoPrompt"),
    source.indexOf("async optimizeEditPrompt")
  );

  assert.match(videoOptimizer, /Return detected_language and ordered_content_units even when the array is empty/);
  assert.match(videoOptimizer, /"ordered_content_units": \[/);
  assert.match(videoOptimizer, /"bounding_box": \{ "x": 0\.05, "y": 0\.10, "width": 0\.20, "height": 0\.18 \}/);
});
