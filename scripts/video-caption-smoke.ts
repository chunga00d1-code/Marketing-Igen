import assert from "node:assert/strict";
import {
  canTransitionVideoCaptionStatus,
  DEFAULT_VIDEO_CAPTION_STYLE,
} from "../shared/video-caption.contract";
import { AIKnowledgeChunkModel } from "../server/model/ai-knowledge.model";
import { MarketingCampaignModel } from "../server/model/marketing-campaign.model";
import { VideoCaptionJobModel } from "../server/model/video-caption-job.model";
import { VideoCaptionProjectModel } from "../server/model/video-caption-project.model";
import { VideoCaptionSegmentModel } from "../server/model/video-caption-segment.model";
import { videoCaptionRouter } from "../server/router/video-caption.router";
import {
  buildCaptionJobIdempotencyKey,
  normalizeCaptionStyle,
} from "../server/service/video-caption-domain.service";
import { resolveVideoCaptionDurations } from "../server/service/video-caption-media.service";
import {
  alignSpeechCaptionSegmentsToAudioPauses,
  buildSpeechCaptionSegments,
  measureSpeechTimelineQuality,
  normalizeSpeechWordTimeline,
} from "../server/service/video-caption-segmentation.service";
import { serializeVideoCaptionSubtitles } from "../server/service/video-caption-subtitle.service";
import { scoreSpeechWordTimings } from "../server/service/video-caption-quality.service";
import {
  getVideoCaptionTranscriptionDelivery,
  normalizeOpenRouterTranscript,
} from "../server/service/video-caption-transcription.service";

const words = [
  { text: "Xin", startMs: 0, endMs: 220, confidence: 0.9 },
  { text: "chào", startMs: 230, endMs: 500, confidence: 0.8 },
  { text: "bạn.", startMs: 510, endMs: 850, confidence: 0.95 },
  { text: "iGen", startMs: 1_600, endMs: 1_900 },
  { text: "Marketing.", startMs: 1_910, endMs: 2_400 },
];
const speechSegments = buildSpeechCaptionSegments(words, 3_000);
assert.equal(speechSegments.length, 2);
assert.equal(speechSegments[0].text, "Xin chào bạn.");
assert.ok(
  speechSegments.every(
    (segment, index) =>
      segment.endMs > segment.startMs &&
      (index === 0 ||
        segment.startMs >= speechSegments[index - 1].endMs)
  )
);
const orphanSafeSegments = buildSpeechCaptionSegments(
  [
    { text: "Bạn", startMs: 0, endMs: 300 },
    { text: "có", startMs: 320, endMs: 700 },
    { text: "biết", startMs: 1_100, endMs: 1_350 },
    { text: "không?", startMs: 1_360, endMs: 1_900 },
    { text: "Siêu", startMs: 2_000, endMs: 2_300 },
    { text: "thông", startMs: 2_310, endMs: 2_620 },
    { text: "minh.", startMs: 2_630, endMs: 2_900 },
  ],
  3_000
);
assert.deepEqual(
  orphanSafeSegments.map((segment) => segment.text),
  ["Bạn có biết không?", "Siêu thông minh."]
);
const sentenceFragmentSafeSegments = buildSpeechCaptionSegments(
  [
    { text: "Khám", startMs: 0, endMs: 1_900 },
    { text: "phá", startMs: 1_900, endMs: 3_900 },
    { text: "tuyệt", startMs: 3_900, endMs: 5_500 },
    { text: "vời", startMs: 5_500, endMs: 6_000 },
    { text: "này", startMs: 6_010, endMs: 6_150 },
    { text: "nhé.", startMs: 6_150, endMs: 6_300 },
    { text: "Câu", startMs: 6_310, endMs: 6_500 },
    { text: "mới", startMs: 6_500, endMs: 6_700 },
    { text: "không?", startMs: 6_700, endMs: 7_000 },
  ],
  7_200
);
assert.deepEqual(
  sentenceFragmentSafeSegments.map((segment) => segment.text),
  ["Khám phá tuyệt vời này nhé.", "Câu mới không?"]
);
const pauseAlignedSegments =
  alignSpeechCaptionSegmentsToAudioPauses(
    [
      { text: "Bạn có biết GPT là gì không?", startMs: 0, endMs: 1_982 },
      {
        text: "Đây là trợ lý AI siêu thông minh, giúp bạn viết bài,",
        startMs: 1_982,
        endMs: 5_184,
      },
      {
        text: "trả lời câu hỏi và sáng tạo nội dung.",
        startMs: 5_184,
        endMs: 8_768,
      },
      {
        text: "Khám phá ngay công cụ tuyệt vời này nhé.",
        startMs: 8_768,
        endMs: 11_350,
      },
      {
        text: "GPT là gì mà ai cũng nhắc đến.",
        startMs: 11_390,
        endMs: 13_993,
      },
      {
        text: "Khám phá ngay trợ lý AI đa năng, giúp bạn mọi việc,",
        startMs: 13_993,
        endMs: 16_794,
      },
      {
        text: "từ học tập đến công việc. Siêu tiện lợi, siêu thông minh.",
        startMs: 16_834,
        endMs: 19_177,
      },
    ],
    [
      { startMs: 0, endMs: 193, durationMs: 193 },
      { startMs: 2_365, endMs: 2_653, durationMs: 288 },
      { startMs: 5_484, endMs: 5_627, durationMs: 143 },
      { startMs: 7_450, endMs: 7_841, durationMs: 391 },
      { startMs: 9_533, endMs: 9_834, durationMs: 301 },
      { startMs: 11_946, endMs: 12_885, durationMs: 939 },
      { startMs: 15_613, endMs: 15_891, durationMs: 278 },
      { startMs: 18_916, endMs: 19_179, durationMs: 263 },
    ],
    19_177
  );
assert.equal(
  pauseAlignedSegments.pauseBoundaryCoverageRatio,
  1
);
assert.deepEqual(
  pauseAlignedSegments.segments.map((segment) => [
    segment.startMs,
    segment.endMs,
  ]),
  [
    [193, 2_653],
    [2_653, 5_627],
    [5_627, 7_841],
    [7_841, 9_834],
    [9_834, 12_885],
    [12_885, 15_891],
    [15_891, 19_177],
  ]
);

const dtoSegments = speechSegments.map((segment, index) => ({
  ...segment,
  id: String(index),
  projectId: "project",
  version: 1,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}));
assert.match(
  serializeVideoCaptionSubtitles(dtoSegments, "srt"),
  /00:00:00,000 --> 00:00:00,850/
);
assert.ok(
  serializeVideoCaptionSubtitles(dtoSegments, "vtt").startsWith(
    "WEBVTT"
  )
);

assert.equal(
  canTransitionVideoCaptionStatus(
    "rendering",
    "ready_for_review"
  ),
  true
);
assert.equal(
  canTransitionVideoCaptionStatus("draft", "completed"),
  false
);
assert.deepEqual(
  resolveVideoCaptionDurations(
    { format: { duration: "19" } },
    { codec_type: "video", duration: "3" },
    { codec_type: "audio", duration: "19" }
  ),
  {
    durationSeconds: 19,
    durationSource: "audio_stream",
    containerDurationSeconds: 19,
    videoStreamDurationSeconds: 3,
    audioStreamDurationSeconds: 19,
    containerStartMs: undefined,
    videoStreamStartMs: undefined,
    audioStreamStartMs: undefined,
  }
);
assert.equal(
  resolveVideoCaptionDurations(
    { format: { duration: "10", start_time: "0.5" } },
    { codec_type: "video", duration: "9.5", start_time: "0.5" },
    { codec_type: "audio", duration: "9.4", start_time: "0.6" }
  ).durationSeconds,
  10.5
);
assert.equal(getVideoCaptionTranscriptionDelivery(19_000), "direct");
assert.equal(getVideoCaptionTranscriptionDelivery(121_000), "direct");
const normalizedOpenRouter = normalizeOpenRouterTranscript({
  language: "Vietnamese",
  duration: 1.25,
  usage: { cost: 0.0001 },
  words: [
    {
      word: " Xin ",
      start: 0,
      end: 0.536,
      probability: Math.exp(-0.1),
    },
    {
      word: " chào ",
      start: 0.536,
      end: 1.25,
      probability: Math.exp(-0.1),
    },
  ],
});
assert.equal(normalizedOpenRouter.language, "vi");
assert.equal(normalizedOpenRouter.durationMs, 1_250);
assert.equal(normalizedOpenRouter.cost, 0.0001);
assert.deepEqual(
  normalizedOpenRouter.words.map((word) => [word.text, word.startMs, word.endMs]),
  [["Xin", 0, 536], ["chào", 536, 1_250]]
);
assert.equal(normalizedOpenRouter.words[0].confidence, Math.exp(-0.1));
assert.equal(
  normalizeOpenRouterTranscript({
    text: "Xin chào",
    segments: [{ text: "Xin chào", start: 0, end: 1.25 }],
  }).words.length,
  0
);
const reconciledTimeline = normalizeSpeechWordTimeline(
  [
    { text: "Xin", startMs: 0, endMs: 500 },
    { text: "chào", startMs: 500, endMs: 1_000 },
  ],
  1_040,
  1_000
);
assert.equal(reconciledTimeline.applied, true);
assert.equal(reconciledTimeline.words[1].endMs, 1_040);
const offsetTimeline = normalizeSpeechWordTimeline(
  [{ text: "Xin", startMs: 0, endMs: 500 }],
  1_500,
  1_000,
  500
);
assert.equal(offsetTimeline.words[0].startMs, 500);
assert.equal(offsetTimeline.words[0].endMs, 1_000);
assert.deepEqual(
  measureSpeechTimelineQuality(reconciledTimeline.words, 1_040),
  {
    wordCount: 2,
    validWordCount: 2,
    overlapCount: 0,
    outOfBoundsCount: 0,
    coverageRatio: 1,
    firstWordStartMs: 0,
    lastWordEndMs: 1_040,
  }
);
const largeTimelineMismatch = normalizeSpeechWordTimeline(
  [{ text: "Xin", startMs: 0, endMs: 1_000 }],
  10_000,
  1_000
);
assert.equal(largeTimelineMismatch.applied, false);
assert.equal(largeTimelineMismatch.words[0].endMs, 1_000);
const timingScore = scoreSpeechWordTimings(
  [
    { text: "Xin", startMs: 0, endMs: 220 },
    { text: "chào", startMs: 230, endMs: 500 },
  ],
  [
    { text: "xin", startMs: 40, endMs: 250 },
    { text: "chào", startMs: 260, endMs: 530 },
  ],
  50
);
assert.equal(timingScore.wordCoverageRatio, 1);
assert.equal(timingScore.timingAccuracyRatio, 1);
assert.equal(timingScore.p95AbsoluteErrorMs, 40);
assert.deepEqual(normalizeCaptionStyle(), DEFAULT_VIDEO_CAPTION_STYLE);
assert.deepEqual(
  normalizeCaptionStyle({
    backgroundColor: undefined,
    textColor: "#112233",
  }),
  {
    ...DEFAULT_VIDEO_CAPTION_STYLE,
    textColor: "#112233",
  }
);
assert.equal(
  buildCaptionJobIdempotencyKey({
    companyCode: " acme ",
    projectId: "project",
    fingerprint: "fingerprint",
    mode: "combined",
    inputVersion: 3,
    settingsHash: "settings",
    operation: "render_final",
  }),
  "ACME:project:fingerprint:combined:3:settings:render_final"
);

assert.ok(
  VideoCaptionProjectModel.schema.indexes().some(
    ([fields, options]) =>
      fields.companyCode === 1 &&
      fields.creationIdempotencyKey === 1 &&
      options.unique === true
  )
);
assert.ok(
  VideoCaptionJobModel.schema.indexes().some(
    ([fields, options]) =>
      fields.companyCode === 1 &&
      fields.idempotencyKey === 1 &&
      options.unique === true
  )
);
assert.ok(VideoCaptionSegmentModel.schema.path("companyCode"));
assert.ok(VideoCaptionProjectModel.schema.path("video.timing.status"));
assert.ok(MarketingCampaignModel.schema.path("captionMode"));
assert.ok(AIKnowledgeChunkModel.schema.path("purposeScope"));

const routePaths = videoCaptionRouter.stack
  .map((layer) => layer.route?.path)
  .filter(Boolean);
for (const expectedPath of [
  "/context-options",
  "/:id/transcribe",
  "/:id/generate-context",
  "/:id/render",
  "/:id/subtitles/:format",
  "/:id/download",
]) {
  assert.ok(routePaths.includes(expectedPath), expectedPath);
}

console.log("video-caption smoke passed");
