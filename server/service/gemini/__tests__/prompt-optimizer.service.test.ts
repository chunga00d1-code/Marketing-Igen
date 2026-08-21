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
