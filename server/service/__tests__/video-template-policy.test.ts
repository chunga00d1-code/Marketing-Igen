import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoTemplateVisibilityFilter,
  normalizeVideoTemplateListQuery,
} from "../video-template-policy";

test("normalizes pagination and duration filters", () => {
  assert.deepEqual(
    normalizeVideoTemplateListQuery({
      page: "0",
      limit: "999",
      duration: "medium",
      search: "  sale  ",
    }),
    {
      scope: "discover",
      category: "all",
      aspectRatio: "all",
      duration: "medium",
      search: "sale",
      sort: "popular",
      page: 1,
      limit: 50,
      durationMin: 16,
      durationMax: 30,
    }
  );
});

test("builds a public discovery filter", () => {
  assert.deepEqual(
    buildVideoTemplateVisibilityFilter(
      { userId: "user-1", companyCode: "acme", role: "user" },
      "discover"
    ),
    {
      status: "published",
      $or: [
        { visibility: "system" },
        { visibility: "tenant", companyCode: "acme" },
      ],
    }
  );
});

test("builds a private owner filter for my templates", () => {
  assert.deepEqual(
    buildVideoTemplateVisibilityFilter(
      { userId: "user-1", companyCode: "acme", role: "user" },
      "mine"
    ),
    {
      ownerUserId: "user-1",
      companyCode: "acme",
      visibility: { $in: ["private", "tenant"] },
      status: { $ne: "archived" },
    }
  );
});
