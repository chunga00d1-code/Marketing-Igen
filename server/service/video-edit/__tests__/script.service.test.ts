import assert from "node:assert/strict";
import test from "node:test";
import {
  blueprintFromEditScript,
  type VideoEditScript,
} from "../script.service";
import { hyperframeService } from "../hyperframe";

function createScript(withVoice = true): VideoEditScript {
  return {
    videoUrl: "https://cdn.example/source.mp4",
    totalDuration: 2,
    globalSettings: {
      aspectRatio: "16:9",
      resolution: "720p",
      musicGenre: "none",
      musicVolume: 0.3,
      overallStyle: "",
    },
    segments: [{
      segmentId: "slide-01",
      label: "Hook",
      startTime: 0,
      endTime: 2,
      contentSummary: "Giới thiệu vấn đề",
      transcriptText: "Đây là transcript lấy từ phụ đề của video.",
      voiceScript: "Đây là lời thoại theo đúng ngữ cảnh của slide.",
      voice: withVoice ? {
        audioUrl: "https://cdn.example/slide-01.mp3",
        durationSeconds: 3.5,
        voiceName: "Aoede",
      } : undefined,
      keep: true,
      playbackRate: 1,
      effects: { transition: "slide-left", zoom: "none", objectFit: "contain" },
      editNotes: "",
    }],
    analysisNotes: "",
    generatedAt: new Date(0).toISOString(),
  };
}

test("aligns a slide voice segment with its visual clip and mutes source audio", () => {
  const blueprint = blueprintFromEditScript(createScript());
  const timeline = blueprint.timeline as Array<Record<string, unknown>>;
  const video = timeline.find((item) => item.type === "video");
  const voice = timeline.find((item) => item.role === "voice");

  assert.equal(blueprint.duration, 3.5);
  assert.equal(video?.volume, 0);
  assert.deepEqual({ start: voice?.start, end: voice?.end, slideId: voice?.slideId }, {
    start: 0,
    end: 3.5,
    slideId: "slide-01",
  });
  assert.match(hyperframeService.compileBlueprintToHtml(blueprint), /<video[\s\S]*muted/);
});

test("keeps legacy source audio contract when a slide has no voice", () => {
  const blueprint = blueprintFromEditScript(createScript(false));
  const timeline = blueprint.timeline as Array<Record<string, unknown>>;
  const video = timeline.find((item) => item.type === "video");
  const html = hyperframeService.compileBlueprintToHtml(blueprint);

  assert.equal(video?.volume, 1);
  assert.equal(video?.audioSource, "original");
  assert.equal(timeline.some((item) => item.role === "voice"), false);
  assert.match(html, /data-has-audio="true"/);
});

test("uses source audio when the transcript selection overrides stale generated voice", () => {
  const script = createScript();
  script.segments[0].voiceSource = "original";
  const blueprint = blueprintFromEditScript(script);
  const timeline = blueprint.timeline as Array<Record<string, unknown>>;
  const video = timeline.find((item) => item.type === "video");

  assert.equal(video?.volume, 1);
  assert.equal(timeline.some((item) => item.role === "voice"), false);
});
