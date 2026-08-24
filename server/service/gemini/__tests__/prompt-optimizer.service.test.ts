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
    { durationSeconds: 20, aspectRatio: "9:16" }
  );

  assert.match(result, /# VIDEO BRIEF/);
  assert.match(result, /- Video goal:/);
  assert.match(result, /- Audience:/);
  assert.match(result, /- Tone:/);
  assert.match(result, /- Visual system:/);
  assert.match(result, /- Voice direction:/);
  assert.match(result, /- Content mode: educational/);
  assert.match(result, /- Language: Vietnamese\. Use one narration language throughout/);
  assert.match(result, /- Input image policy: No input image/);
  assert.match(result, /complete HTML\/CSS motion graphics/);
  assert.match(result, /# CREATIVE DECISIONS/);
  assert.match(result, /# ACCEPTANCE CHECKLIST/);
  assert.equal((result.match(/^## SCENE /gm) || []).length, 3);
  assert.equal((result.match(/^- Visual hierarchy:/gm) || []).length, 3);
  assert.equal((result.match(/^- Asset use:/gm) || []).length, 3);
  assert.equal(isValidHtmlVideoMasterPrompt(result, { durationSeconds: 20 }), true);
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
- Video goal: Explain two supported facts clearly.
- Audience: General viewers.
- Tone: Clear and approachable.
- Visual system: Clean editorial motion graphics.
- Voice direction: Natural and steady.
# AUTHORITATIVE SOURCE
- One supported fact.
- Another supported fact.
# CREATIVE DECISIONS
- Do not invent factual claims.
# STORYBOARD
## SCENE 1
- Time: 0.0s-4.0s
- Purpose: OPENING
- Source facts: One supported fact.
- On-screen text: One supported fact.
- Voice-over: One supported fact.
- Visual hierarchy: Fact first, supporting visual second.
- Visual: Full canvas.
- Asset use: CSS shapes only.
- Motion: Reveal and hold.
- Transition: crossfade
## SCENE 2
- Time: 4.0s-8.0s
- Purpose: CLOSING
- Source facts: Another supported fact.
- On-screen text: Another supported fact.
- Voice-over: Another supported fact.
- Visual hierarchy: Fact first, supporting visual second.
- Visual: Full canvas.
- Asset use: CSS shapes only.
- Motion: Reveal and hold.
- Transition: hold
# GLOBAL DIRECTION
- Keep text readable.
# ACCEPTANCE CHECKLIST
- The timeline covers the requested duration.`;

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
  assert.equal(result.assumptions?.requestSpecVersion, "1.0");
  assert.equal(result.assumptions?.mode, "revision");
  assert.equal(result.assumptions?.durationPolicy, "preserve-existing");
  assert.equal(result.assumptions?.sourceOrder, "preserve");
  assert.equal(result.assumptions?.preserveUnrequestedProperties, true);
  assert.equal(result.isLocalFallback, true);
});


test("returns a versioned RequestSpec for a short create prompt", async () => {
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await geminiPromptOptimizerService.optimizeMasterVideoPrompt(
      "tao video doc lan luot tung muc trong bang jobs",
      undefined,
      undefined,
      { durationSeconds: 30, aspectRatio: "9:16", mode: "create" }
    );

    assert.equal(result.assumptions?.requestSpecVersion, "1.0");
    assert.equal(result.assumptions?.mode, "create");
    assert.equal(result.assumptions?.durationPolicy, "inferred");
    assert.equal(result.assumptions?.languageLock, "Vietnamese");
    assert.equal(result.assumptions?.contentMode, "ordered-list");
    assert.equal(result.assumptions?.sourceOrder, "preserve");
    assert.equal(result.assumptions?.preserveUnrequestedProperties, false);

    const explicitDuration = await geminiPromptOptimizerService.optimizeMasterVideoPrompt(
      "tao video 90 giay doc lan luot tung muc trong bang jobs",
      undefined,
      undefined,
      { durationSeconds: 90, aspectRatio: "9:16", mode: "create" }
    );
    assert.equal(explicitDuration.assumptions?.durationPolicy, "explicit");
  } finally {
    if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  }
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

test("removes title and watermark outliers from a repeated OCR grid", () => {
  const result = normalizeHtmlVideoReferenceAnalysis({
    ordered_content_units: [
      { order: 1, text: "Jobs", confidence: 0.99, bounding_box: { x: 0.04, y: 0.02, width: 0.14, height: 0.05 } },
      ...Array.from({ length: 15 }, (_, index) => ({
        order: index + 2,
        text: `job-${index + 1}`,
        confidence: 0.98,
        bounding_box: {
          x: 0.04 + (index % 5) * 0.19,
          y: 0.14 + Math.floor(index / 5) * 0.25,
          width: 0.15,
          height: 0.19,
        },
      })),
      { order: 17, unit_type: "watermark", text: "Publisher", confidence: 0.99 },
    ],
  });

  assert.equal(result.ordered_content_units.length, 15);
  assert.equal(result.ordered_content_units[0]?.text, "job-1");
  assert.equal(result.ordered_content_units[14]?.text, "job-15");
  assert.deepEqual(
    result.ordered_content_units.map((unit) => unit.order),
    Array.from({ length: 15 }, (_, index) => index + 1)
  );
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
