import type {
  NormalizedVideoTemplateListQuery,
  VideoTemplateIdentity,
  VideoTemplateScope,
} from "../interface/video-template.interface";

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeVideoTemplateListQuery(
  query: Record<string, unknown>
): NormalizedVideoTemplateListQuery {
  const scope = query.scope === "mine" ? "mine" : "discover";
  const aspectRatio = ["9:16", "1:1", "16:9"].includes(String(query.aspectRatio))
    ? (String(query.aspectRatio) as "9:16" | "1:1" | "16:9")
    : "all";
  const duration = ["short", "medium", "long"].includes(String(query.duration))
    ? (String(query.duration) as "short" | "medium" | "long")
    : "all";
  const normalized: NormalizedVideoTemplateListQuery = {
    scope,
    category: typeof query.category === "string" && query.category.trim() ? query.category.trim() : "all",
    aspectRatio,
    duration,
    search: typeof query.search === "string" ? query.search.trim() : "",
    sort: query.sort === "newest" ? "newest" : "popular",
    page: boundedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(query.limit, 20, 1, 50),
  };
  if (duration === "short") normalized.durationMax = 15;
  if (duration === "medium") {
    normalized.durationMin = 16;
    normalized.durationMax = 30;
  }
  if (duration === "long") normalized.durationMin = 31;
  return normalized;
}

export function buildVideoTemplateVisibilityFilter(
  identity: VideoTemplateIdentity,
  scope: VideoTemplateScope
): Record<string, unknown> {
  if (scope === "mine") {
    return {
      ownerUserId: identity.userId,
      companyCode: identity.companyCode,
      visibility: { $in: ["private", "tenant"] },
      status: { $ne: "archived" },
    };
  }
  return {
    status: "published",
    $or: [
      { visibility: "system" },
      { visibility: "tenant", companyCode: identity.companyCode },
    ],
  };
}
