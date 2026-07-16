import { IMarketingCampaign } from "../interface/marketing-campaign.interface";
import { IMarketingCampaignSlot } from "../interface/marketing-campaign-slot.interface";

const APIFY_API_BASE_URL = "https://api.apify.com/v2";
const MAX_GOOGLE_QUERIES = 3;
const MAX_RESULTS_PER_SOURCE = 20;
const REQUEST_TIMEOUT_MS = 125000;

export type ResearchEvidenceSource = "google" | "facebook" | "tiktok";

export type ResearchEvidence = {
  source: ResearchEvidenceSource;
  sourceUrl: string;
  title?: string;
  text: string;
  author?: string;
  publishedAt?: Date;
  collectedAt: Date;
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
};

export type ApifyRunAudit = {
  source: ResearchEvidenceSource;
  actorId: string;
  runId?: string;
  datasetId?: string;
  status: "succeeded" | "failed" | "skipped";
  itemCount: number;
  estimatedCostUsd: number;
  providerCostUsd: number;
  billingMode: "shadow" | "live";
  executedAt: Date;
  error?: string;
};

type ApifyRun = {
  id?: string;
  defaultDatasetId?: string;
  status?: string;
  usageTotalUsd?: number;
};

type CollectorResult = {
  evidence: ResearchEvidence[];
  audit: ApifyRunAudit;
};

function parsePositiveInt(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimText(value: unknown, maximum = 1400): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function asHttpsUrl(value: unknown): string | undefined {
  const url = trimText(value, 2000);
  return /^https:\/\//i.test(url) ? url : undefined;
}

function dateOrUndefined(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function numericValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function normalizeMetrics(item: Record<string, unknown>) {
  const views = numericValue(item.views ?? item.viewCount ?? item.playCount);
  const likes = numericValue(item.likes ?? item.likeCount ?? item.diggCount);
  const comments = numericValue(item.comments ?? item.commentCount);
  const shares = numericValue(item.shares ?? item.shareCount);
  return views === undefined && likes === undefined && comments === undefined && shares === undefined
    ? undefined
    : { views, likes, comments, shares };
}



export class ApifyResearchService {
  public static isEnabled(): boolean {
    return process.env.APIFY_RESEARCH_ENABLED === "true" && Boolean(process.env.APIFY_TOKEN);
  }

  public static cacheWindowKey(now = new Date()): string {
    const cacheHours = parsePositiveInt(process.env.APIFY_RESEARCH_CACHE_HOURS, 12, 24 * 7);
    return String(Math.floor(now.getTime() / (cacheHours * 60 * 60 * 1000)));
  }

  public static async collect(
    slot: IMarketingCampaignSlot,
    campaign: IMarketingCampaign,
    remainingCampaignBudgetUsd?: number
  ): Promise<{ evidence: ResearchEvidence[]; apifyRuns: ApifyRunAudit[]; providerCostUsd: number; billingMode: "shadow" | "live" }> {
    const billingMode = process.env.APIFY_BILLING_MODE === "live" ? "live" : "shadow";
    if (!this.isEnabled()) {
      return { evidence: [], apifyRuns: [], providerCostUsd: 0, billingMode };
    }

    const queries = this.buildQueries(slot, campaign);
    const results: CollectorResult[] = [];
    let remainingBudgetUsd = remainingCampaignBudgetUsd;
    const collect = async (job: (remaining: number | undefined) => Promise<CollectorResult>) => {
      const result = await job(remainingBudgetUsd);
      results.push(result);
      remainingBudgetUsd = remainingBudgetUsd === undefined
        ? undefined
        : Math.max(0, remainingBudgetUsd - result.audit.estimatedCostUsd);
    };

    const sources = campaign.apifySources && campaign.apifySources.length > 0
      ? campaign.apifySources
      : ["google", slot.platform === "Facebook" ? "facebook" : "", slot.platform === "TikTok" ? "tiktok" : ""].filter(Boolean);

    if (sources.includes("google")) {
      await collect((remaining) => this.collectGoogle(queries, billingMode, remaining));
    }
    if (sources.includes("facebook")) {
      await collect((remaining) => this.collectFacebook(queries, billingMode, remaining));
    }
    if (sources.includes("tiktok")) {
      await collect((remaining) => this.collectTikTok(queries, billingMode, remaining));
    }
    const evidence = this.dedupeEvidence(results.flatMap((result) => result.evidence));
    const apifyRuns = results.map((result) => result.audit);
    return {
      evidence,
      apifyRuns,
      providerCostUsd: apifyRuns.reduce((total, run) => total + run.providerCostUsd, 0),
      billingMode,
    };
  }

  private static buildQueries(slot: IMarketingCampaignSlot, campaign: IMarketingCampaign): string[] {
    return [...new Set([
      slot.topicBrief,
      `${slot.pillar} ${slot.objective}`,
      `${campaign.title} ${slot.topicBrief}`,
    ].map((value) => trimText(value, 180)).filter(Boolean))].slice(0, MAX_GOOGLE_QUERIES);
  }

  private static async collectGoogle(queries: string[], billingMode: "shadow" | "live", remainingBudgetUsd?: number): Promise<CollectorResult> {
    const resultsPerQuery = parsePositiveInt(process.env.APIFY_GOOGLE_MAX_RESULTS, 10, MAX_RESULTS_PER_SOURCE);
    const estimatedCostUsd = queries.length * 0.0045;
    const actorId = process.env.APIFY_GOOGLE_ACTOR_ID || "apify/google-search-scraper";
    const result = await this.runActor("google", actorId, {
      queries: queries.join("\n"),
      maxPagesPerQuery: 1,
      resultsPerPage: resultsPerQuery,
      languageCode: "vi",
      countryCode: "vn",
    }, estimatedCostUsd, billingMode, remainingBudgetUsd);

    return {
      audit: result.audit,
      evidence: result.items.flatMap((item) => {
        const url = asHttpsUrl(item.url ?? item.link);
        const text = trimText(item.description ?? item.snippet ?? item.text);
        if (!url || !text) return [];
        return [{
          source: "google" as const,
          sourceUrl: url,
          title: trimText(item.title, 300) || undefined,
          text,
          collectedAt: new Date(),
        }];
      }),
    };
  }

  private static async collectFacebook(queries: string[], billingMode: "shadow" | "live", remainingBudgetUsd?: number): Promise<CollectorResult> {
    const maxResults = Math.max(
      10,
      parsePositiveInt(process.env.APIFY_FACEBOOK_MAX_RESULTS, 10, MAX_RESULTS_PER_SOURCE)
    );
    const actorId = process.env.APIFY_FACEBOOK_ACTOR_ID || "powerai/facebook-post-search-scraper";
    const query = queries[0] || "marketing";
    const result = await this.runActor("facebook", actorId, {
      query,
      maxResults,
      recent_posts: true,
    }, maxResults * 0.01, billingMode, remainingBudgetUsd);

    return {
      audit: result.audit,
      evidence: result.items.flatMap((item) => {
        const text = trimText(item.text ?? item.message ?? item.postText ?? item.description);
        const url = asHttpsUrl(item.url ?? item.postUrl ?? item.facebookUrl);
        if (!url || !text) return [];
        return [{
          source: "facebook" as const,
          sourceUrl: url,
          title: trimText(item.pageName ?? item.authorName, 300) || undefined,
          text,
          author: trimText(item.pageName ?? item.authorName ?? item.userName, 200) || undefined,
          publishedAt: dateOrUndefined(item.time ?? item.date ?? item.publishedAt),
          collectedAt: new Date(),
          metrics: normalizeMetrics(item),
        }];
      }),
    };
  }

  private static async collectTikTok(queries: string[], billingMode: "shadow" | "live", remainingBudgetUsd?: number): Promise<CollectorResult> {
    const maxResults = parsePositiveInt(process.env.APIFY_TIKTOK_MAX_RESULTS, 20, MAX_RESULTS_PER_SOURCE);
    const actorId = process.env.APIFY_TIKTOK_ACTOR_ID || "clockworks/tiktok-scraper";
    const result = await this.runActor("tiktok", actorId, {
      searchQueries: queries,
      resultsPerPage: maxResults,
      shouldDownloadVideos: false,
    }, maxResults * 0.005, billingMode, remainingBudgetUsd);

    return {
      audit: result.audit,
      evidence: result.items.flatMap((item) => {
        const text = trimText(item.text ?? item.description ?? item.caption);
        const url = asHttpsUrl(item.webVideoUrl ?? item.url ?? item.videoUrl);
        if (!url || !text) return [];
        return [{
          source: "tiktok" as const,
          sourceUrl: url,
          title: trimText(item.authorMeta && typeof item.authorMeta === "object" ? (item.authorMeta as Record<string, unknown>).name : item.authorName, 300) || undefined,
          text,
          author: trimText(item.authorMeta && typeof item.authorMeta === "object" ? (item.authorMeta as Record<string, unknown>).name : item.authorName, 200) || undefined,
          publishedAt: dateOrUndefined(item.createTimeISO ?? item.createTime ?? item.publishedAt),
          collectedAt: new Date(),
          metrics: normalizeMetrics(item),
        }];
      }),
    };
  }

  private static async runActor(
    source: ResearchEvidenceSource,
    actorId: string,
    input: Record<string, unknown>,
    estimatedCostUsd: number,
    billingMode: "shadow" | "live",
    remainingCampaignBudgetUsd?: number
  ): Promise<{ items: Array<Record<string, unknown>>; audit: ApifyRunAudit }> {
    const executedAt = new Date();
    const maxCostUsd = Math.min(
      parsePositiveNumber(process.env.APIFY_MAX_COST_PER_SLOT_USD, 0.25),
      remainingCampaignBudgetUsd ?? Number.POSITIVE_INFINITY
    );
    if (estimatedCostUsd > maxCostUsd) {
      return {
        items: [],
        audit: { source, actorId, status: "skipped", itemCount: 0, estimatedCostUsd, providerCostUsd: 0, billingMode, executedAt, error: "Ước tính chi phí vượt giới hạn test của slot." },
      };
    }

    try {
      const token = process.env.APIFY_TOKEN as string;
      const runResponse = await fetch(
        `${APIFY_API_BASE_URL}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}&waitForFinish=120`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      if (!runResponse.ok) {
        throw new Error(`Apify trả về HTTP ${runResponse.status}.`);
      }
      const payload = await runResponse.json() as { data?: ApifyRun };
      const run = payload.data;
      if (!run?.id || !run.defaultDatasetId || run.status !== "SUCCEEDED") {
        throw new Error(`Apify run chưa hoàn thành (${run?.status || "không rõ trạng thái"}).`);
      }

      const itemLimit = MAX_RESULTS_PER_SOURCE;
      const datasetResponse = await fetch(
        `${APIFY_API_BASE_URL}/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?token=${encodeURIComponent(token)}&clean=true&limit=${itemLimit}`,
        { signal: AbortSignal.timeout(30000) }
      );
      if (!datasetResponse.ok) {
        throw new Error(`Không thể đọc Apify Dataset (HTTP ${datasetResponse.status}).`);
      }
      const items = await datasetResponse.json() as Array<Record<string, unknown>>;
      return {
        items: Array.isArray(items) ? items : [],
        audit: {
          source,
          actorId,
          runId: run.id,
          datasetId: run.defaultDatasetId,
          status: "succeeded",
          itemCount: Array.isArray(items) ? items.length : 0,
          estimatedCostUsd,
          providerCostUsd: Number(run.usageTotalUsd || 0),
          billingMode,
          executedAt,
        },
      };
    } catch (error: unknown) {
      return {
        items: [],
        audit: {
          source,
          actorId,
          status: "failed",
          itemCount: 0,
          estimatedCostUsd,
          providerCostUsd: 0,
          billingMode,
          executedAt,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private static dedupeEvidence(evidence: ResearchEvidence[]): ResearchEvidence[] {
    const seen = new Set<string>();
    return evidence.filter((item) => {
      const key = `${item.source}:${item.sourceUrl}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_RESULTS_PER_SOURCE * 3);
  }
}
