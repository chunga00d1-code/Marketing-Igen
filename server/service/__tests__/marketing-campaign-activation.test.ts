import assert from "node:assert/strict";
import test from "node:test";
import { assertCampaignDraftCanActivate, CampaignActivationValidationError } from "../marketing-campaign-activation.service";

const now = new Date("2026-08-26T03:00:00.000Z");

test("accepts a reviewed multi-platform draft with future planned slots", () => {
  assert.doesNotThrow(() => assertCampaignDraftCanActivate({
    enabledPlatforms: ["Facebook", "TikTok"],
    timezone: "Asia/Bangkok",
    now,
    slots: [
      { status: "planned", scheduledAt: new Date("2026-08-26T04:00:00.000Z"), platform: "Facebook", mediaType: "image" },
      { status: "planned", scheduledAt: new Date("2026-08-26T05:00:00.000Z"), platform: "TikTok", mediaType: "video" },
    ],
  }));
});

test("rejects a TikTok slot without video media", () => {
  assert.throws(() => assertCampaignDraftCanActivate({
    enabledPlatforms: ["TikTok"],
    timezone: "Asia/Bangkok",
    now,
    slots: [
      { status: "planned", scheduledAt: new Date("2026-08-26T05:00:00.000Z"), platform: "TikTok", mediaType: "image" },
    ],
  }), /TikTok.*video/);
});

test("rejects a draft whose schedule is less than fifteen minutes away", () => {
  assert.throws(() => assertCampaignDraftCanActivate({
    enabledPlatforms: ["Facebook"],
    timezone: "Asia/Bangkok",
    now,
    slots: [
      { status: "planned", scheduledAt: new Date("2026-08-26T03:10:00.000Z"), platform: "Facebook", mediaType: "image" },
    ],
  }), /ít nhất 15 phút/);
});

test("rejects a draft when a slot has already left planning", () => {
  assert.throws(() => assertCampaignDraftCanActivate({
    enabledPlatforms: ["Facebook"],
    timezone: "Asia/Bangkok",
    now,
    slots: [
      { status: "queued", scheduledAt: new Date("2026-08-26T04:00:00.000Z"), platform: "Facebook", mediaType: "image" },
    ],
  }), /không còn.*lên kế hoạch/);
});

test("returns every setup issue so the UI can explain what to fix", () => {
  assert.throws(
    () => assertCampaignDraftCanActivate({
      slots: [
        { _id: "slot-1", status: "pending_approval", scheduledAt: new Date("2026-01-01T00:05:00.000Z"), platform: "TikTok", mediaType: "image" },
      ],
      enabledPlatforms: ["Facebook"],
      timezone: "Asia/Bangkok",
      now: new Date("2026-01-01T00:00:00.000Z"),
    }),
    (error: unknown) => error instanceof CampaignActivationValidationError
      && error.issues.length === 4
      && error.issues.some((issue) => issue.code === "TIKTOK_VIDEO_REQUIRED")
  );
});
