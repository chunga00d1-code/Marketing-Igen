import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHtmlVideoMasterPromptFallback,
  isValidHtmlVideoMasterPrompt,
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
