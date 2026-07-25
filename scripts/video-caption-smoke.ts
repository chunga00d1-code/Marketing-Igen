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
import { buildSpeechCaptionSegments } from "../server/service/video-caption-segmentation.service";
import { serializeVideoCaptionSubtitles } from "../server/service/video-caption-subtitle.service";
import { getVideoCaptionTranscriptionDelivery } from "../server/service/video-caption-transcription.service";

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
  }
);
assert.equal(getVideoCaptionTranscriptionDelivery(19_000), "direct");
assert.equal(getVideoCaptionTranscriptionDelivery(121_000), "webhook");
assert.deepEqual(normalizeCaptionStyle(), DEFAULT_VIDEO_CAPTION_STYLE);
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
]) {
  assert.ok(routePaths.includes(expectedPath), expectedPath);
}

console.log("video-caption smoke passed");
