import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCampaignSchedule,
  formatDateInTimezone,
  resolveCampaignMonthWindow,
  resolveMonthlyPrepareAt,
} from "../marketing-campaign-schedule.service";

test("groups slots into campaign-relative months", () => {
  assert.deepEqual(resolveCampaignMonthWindow("2026-07-15", "2026-08-14"), {
    monthIndex: 0,
    startsOn: "2026-07-15",
  });
  assert.deepEqual(resolveCampaignMonthWindow("2026-07-15", "2026-08-15"), {
    monthIndex: 1,
    startsOn: "2026-08-15",
  });
});

test("clamps campaign month boundaries for month-end start dates", () => {
  assert.deepEqual(resolveCampaignMonthWindow("2026-01-31", "2026-02-28"), {
    monthIndex: 1,
    startsOn: "2026-02-28",
  });
  assert.deepEqual(resolveCampaignMonthWindow("2026-01-31", "2026-03-30"), {
    monthIndex: 1,
    startsOn: "2026-02-28",
  });
  assert.deepEqual(resolveCampaignMonthWindow("2026-01-31", "2026-03-31"), {
    monthIndex: 2,
    startsOn: "2026-03-31",
  });
});

test("prepares the first month immediately and later months ten days early", () => {
  const campaignCreatedAt = new Date("2026-07-01T03:00:00.000Z");

  assert.equal(
    resolveMonthlyPrepareAt({
      campaignStartDate: "2026-07-15",
      slotDate: "2026-08-14",
      timezone: "Asia/Bangkok",
      campaignCreatedAt,
    }).toISOString(),
    campaignCreatedAt.toISOString()
  );
  assert.equal(
    resolveMonthlyPrepareAt({
      campaignStartDate: "2026-07-15",
      slotDate: "2026-08-15",
      timezone: "Asia/Bangkok",
      campaignCreatedAt,
    }).toISOString(),
    "2026-08-04T17:00:00.000Z"
  );
});

test("reads persisted UTC slot instants back in the campaign timezone", () => {
  assert.equal(
    formatDateInTimezone(new Date("2026-08-14T17:30:00.000Z"), "Asia/Bangkok"),
    "2026-08-15"
  );
});

test("assigns one prepare instant to every slot in the same monthly batch", () => {
  const campaignCreatedAt = new Date("2026-07-01T03:00:00.000Z");
  const schedule = buildCampaignSchedule({
    startDate: "2026-07-15",
    endDate: "2026-09-16",
    postsPerDay: 1,
    postingTimes: ["09:00"],
    timezone: "Asia/Bangkok",
    platforms: ["Facebook"],
    generationLeadMinutes: 60,
    verificationLeadMinutes: 15,
    campaignCreatedAt,
    monthlyPreparationLeadDays: 10,
  });

  assert.equal(schedule[0].prepareAt.toISOString(), campaignCreatedAt.toISOString());
  assert.equal(schedule[30].prepareAt.toISOString(), campaignCreatedAt.toISOString());
  assert.equal(schedule[31].prepareAt.toISOString(), "2026-08-04T17:00:00.000Z");
  assert.equal(schedule[61].prepareAt.toISOString(), "2026-08-04T17:00:00.000Z");
  assert.equal(schedule[62].prepareAt.toISOString(), "2026-09-04T17:00:00.000Z");
});

test("schedules verification using the configured lead time", () => {
  const schedule = buildCampaignSchedule({
    startDate: "2026-07-15",
    endDate: "2026-07-15",
    postsPerDay: 1,
    postingTimes: ["09:00"],
    timezone: "Asia/Bangkok",
    platforms: ["TikTok"],
    generationLeadMinutes: 60,
    verificationLeadMinutes: 15,
    campaignCreatedAt: new Date("2026-07-01T03:00:00.000Z"),
  });

  assert.equal(schedule[0].scheduledAt.toISOString(), "2026-07-15T02:00:00.000Z");
  assert.equal(schedule[0].verifyAt.toISOString(), "2026-07-15T01:45:00.000Z");
});
