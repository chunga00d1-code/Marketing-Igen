import assert from "node:assert/strict";
import test from "node:test";
import type { ShotstackTemplate } from "../../integration/shotstack/shotstack.types";
import {
  shouldUseVideoTemplateSeedFallback,
} from "../video-template.service";
import {
  synchronizeShotstackTemplates,
  type ShotstackTemplateSyncRepository,
  type SyncStateInput,
  type SyncRunContext,
  type SyncTemplateInput,
  type SyncTemplateRecord,
  type SyncVersionInput,
} from "../shotstack-template-sync.service";

function providerTemplate(
  id: string,
  overrides: Record<string, unknown> = {}
): ShotstackTemplate {
  return {
    id,
    name: `Template ${id}`,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    timeline: {
      tracks: [{
        clips: [{
          asset: { type: "video", src: `https://cdn.example.com/${id}.mp4` },
          start: 0,
          length: 5,
        }],
      }],
    },
    output: { format: "mp4", aspectRatio: "9:16" },
    ...overrides,
  };
}

class MemoryRepository implements ShotstackTemplateSyncRepository {
  public readonly templates = new Map<string, SyncTemplateRecord & Record<string, unknown>>();
  public readonly versions: Array<SyncVersionInput & {
    id: string;
    templateId: string;
    version: number;
  }> = [];
  public readonly states: SyncStateInput[] = [];
  public readonly latestSuccessfulLists = new Map<string, Date>();
  public readonly latestSuccessfulListGenerations = new Map<string, number>();
  private nextTemplateId = 1;
  private nextVersionId = 1;

  async findByExternalId(externalId: string) {
    return this.templates.get(externalId) || null;
  }

  async registerSuccessfulList(run: Omit<SyncRunContext, "generation">) {
    const current = this.latestSuccessfulLists.get(run.environment);
    if (!current || current.getTime() <= run.attemptedAt.getTime()) {
      this.latestSuccessfulLists.set(run.environment, new Date(run.attemptedAt));
    }
    const generation = (this.latestSuccessfulListGenerations.get(run.environment) || 0) + 1;
    this.latestSuccessfulListGenerations.set(run.environment, generation);
    return generation;
  }

  async isRunCurrent(run: SyncRunContext) {
    return this.latestSuccessfulListGenerations.get(run.environment) === run.generation;
  }

  async createTemplateWithVersion(
    template: SyncTemplateInput,
    version: SyncVersionInput,
    run: SyncRunContext
  ) {
    if (!(await this.isRunCurrent(run))) return null;
    if (this.templates.has(template.externalTemplateId)) {
      throw new Error("duplicate provider template");
    }
    const templateId = `template-${this.nextTemplateId++}`;
    const versionId = `version-${this.nextVersionId++}`;
    const record = {
      ...structuredClone(template),
      id: templateId,
      publishedVersionId: versionId,
    };
    this.templates.set(template.externalTemplateId, record);
    this.versions.push({
      ...structuredClone(version),
      id: versionId,
      templateId,
      version: 1,
    });
    return record;
  }

  async updateTemplateMetadata(templateId: string, input: SyncTemplateInput) {
    const record = this.byId(templateId);
    if (
      record.lastSyncedAt instanceof Date
      && record.lastSyncedAt.getTime() > input.lastSyncedAt.getTime()
    ) {
      return;
    }
    Object.assign(record, structuredClone(input));
  }

  async createVersionAndPublish(
    templateId: string,
    template: SyncTemplateInput,
    version: SyncVersionInput
  ) {
    const record = this.byId(templateId);
    if (
      record.lastSyncedAt instanceof Date
      && record.lastSyncedAt.getTime() > template.lastSyncedAt.getTime()
    ) {
      return "unchanged" as const;
    }
    if (record.sourceHash === template.sourceHash) {
      Object.assign(record, structuredClone(template));
      return "unchanged" as const;
    }
    const nextVersion = this.versions
      .filter((candidate) => candidate.templateId === templateId)
      .reduce((maximum, candidate) => Math.max(maximum, candidate.version), 0) + 1;
    const versionId = `version-${this.nextVersionId++}`;
    this.versions.push({
      ...structuredClone(version),
      id: versionId,
      templateId,
      version: nextVersion,
    });
    Object.assign(record, structuredClone(template), { publishedVersionId: versionId });
    return "updated" as const;
  }

  async archiveMissing(activeExternalIds: string[], lastSyncedAt: Date) {
    let archived = 0;
    for (const record of this.templates.values()) {
      if (
        record.sourceProvider === "shotstack"
        && !activeExternalIds.includes(record.externalTemplateId)
        && record.status !== "archived"
        && (
          !(record.lastSyncedAt instanceof Date)
          || record.lastSyncedAt.getTime() <= lastSyncedAt.getTime()
        )
      ) {
        record.status = "archived";
        record.lastSyncedAt = lastSyncedAt;
        archived += 1;
      }
    }
    return archived;
  }

  async recordSyncState(input: SyncStateInput) {
    const latestList = this.latestSuccessfulLists.get(input.environment);
    if (latestList && latestList.getTime() > input.lastAttemptAt.getTime()) {
      return;
    }
    const existingIndex = this.states.findIndex((state) => (
      state.provider === input.provider && state.environment === input.environment
    ));
    const existing = existingIndex >= 0 ? this.states[existingIndex] : undefined;
    if (
      existing
      && existing.lastAttemptAt.getTime() > input.lastAttemptAt.getTime()
    ) {
      return;
    }
    const next = structuredClone({
      ...input,
      ...(input.lastSuccessAt || !existing?.lastSuccessAt
        ? {}
        : { lastSuccessAt: existing.lastSuccessAt }),
    });
    if (existingIndex >= 0) this.states[existingIndex] = next;
    else this.states.push(next);
  }

  private byId(templateId: string) {
    const record = [...this.templates.values()].find((candidate) => candidate.id === templateId);
    if (!record) throw new Error(`Missing template ${templateId}`);
    return record;
  }
}

function clientFor(details: ShotstackTemplate[]) {
  return {
    async listTemplates() {
      return details.map(({ id, name }) => ({ id, name: typeof name === "string" ? name : undefined }));
    },
    async getTemplate(id: string) {
      const template = details.find((candidate) => candidate.id === id);
      if (!template) throw new Error("provider detail missing");
      return structuredClone(template);
    },
  };
}

async function sync(repository: MemoryRepository, details: ShotstackTemplate[]) {
  return synchronizeShotstackTemplates("admin-1", {
    client: clientFor(details),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });
}

test("first import creates one published template and immutable version", async () => {
  const repository = new MemoryRepository();

  const result = await sync(repository, [providerTemplate("one")]);

  assert.deepEqual(result, {
    created: 1,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failed: [],
  });
  assert.equal(repository.templates.size, 1);
  assert.equal(repository.versions.length, 1);
  assert.equal(repository.versions[0].version, 1);
  assert.equal(repository.templates.get("one")?.status, "published");
  assert.equal(
    repository.templates.get("one")?.publishedVersionId,
    repository.versions[0].id
  );
  assert.equal(repository.templates.get("one")?.title, "Template one");
  assert.equal(repository.templates.get("one")?.duration, 5);
  assert.equal(repository.templates.get("one")?.aspectRatio, "9:16");
  assert.equal(repository.templates.get("one")?.thumbnailUrl, "https://cdn.example.com/one.mp4");
});

test("same canonical edit with different object key order is unchanged", async () => {
  const repository = new MemoryRepository();
  const first = providerTemplate("one");
  await sync(repository, [first]);
  const reordered = {
    output: { aspectRatio: "9:16", format: "mp4" },
    timeline: {
      tracks: [{
        clips: [{
          length: 5,
          start: 0,
          asset: { src: "https://cdn.example.com/one.mp4", type: "video" },
        }],
      }],
    },
    updatedAt: "2026-07-03T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    name: "Template one",
    id: "one",
  } as ShotstackTemplate;

  const result = await sync(repository, [reordered]);

  assert.equal(result.unchanged, 1);
  assert.equal(result.updated, 0);
  assert.equal(repository.versions.length, 1);
});

test("changed edit creates exactly one new immutable version and publishes it", async () => {
  const repository = new MemoryRepository();
  const original = providerTemplate("one");
  await sync(repository, [original]);
  const firstVersion = structuredClone(repository.versions[0]);
  const changed = providerTemplate("one");
  const timeline = changed.timeline as {
    tracks: Array<{ clips: Array<{ length: number }> }>;
  };
  timeline.tracks[0].clips[0].length = 8;

  const result = await sync(repository, [changed]);

  assert.equal(result.updated, 1);
  assert.equal(repository.versions.length, 2);
  assert.deepEqual(repository.versions[0], firstVersion);
  assert.equal(repository.versions[1].version, 2);
  assert.equal(
    repository.templates.get("one")?.publishedVersionId,
    repository.versions[1].id
  );
});

test("fetches template details with maximum concurrency three", async () => {
  const repository = new MemoryRepository();
  const details = Array.from({ length: 8 }, (_, index) => providerTemplate(String(index)));
  let active = 0;
  let maximum = 0;
  const client = {
    async listTemplates() {
      return details.map(({ id }) => ({ id }));
    },
    async getTemplate(id: string) {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return structuredClone(details.find((candidate) => candidate.id === id)!);
    },
  };

  await synchronizeShotstackTemplates("admin-1", {
    client,
    repository,
    environment: "stage",
  });

  assert.equal(maximum, 3);
});

test("one invalid provider item does not stop valid imports", async () => {
  const repository = new MemoryRepository();
  const invalid = providerTemplate("invalid", {
    timeline: {
      tracks: [{
        clips: [{
          asset: { type: "audio", src: "https://cdn.example.com/audio.mp3" },
          start: 0,
          length: 5,
        }],
      }],
    },
  });

  const result = await sync(repository, [providerTemplate("valid"), invalid]);

  assert.equal(result.created, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].externalId, "invalid");
  assert.doesNotMatch(result.failed[0].message, /audio\.mp3|no usable visual/i);
  assert.ok(repository.templates.has("valid"));
  assert.equal(repository.templates.has("invalid"), false);
  assert.equal(repository.states.at(-1)?.lastSuccessAt, undefined);
});

test("provider template without a name fails instead of inventing catalogue metadata", async () => {
  const repository = new MemoryRepository();
  const unnamed = providerTemplate("unnamed");
  delete unnamed.name;

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: {
      async listTemplates() {
        return [{ id: "unnamed" }];
      },
      async getTemplate() {
        return unnamed;
      },
    },
    repository,
    environment: "stage",
  });

  assert.equal(result.created, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(repository.templates.size, 0);
});

test("list outage preserves cached templates and skips archival", async () => {
  const repository = new MemoryRepository();
  await sync(repository, [providerTemplate("cached")]);
  const cached = structuredClone(repository.templates.get("cached"));

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: {
      async listTemplates() {
        throw new Error("raw provider outage secret");
      },
      async getTemplate() {
        throw new Error("not reached");
      },
    },
    repository,
    environment: "stage",
  });

  assert.deepEqual(repository.templates.get("cached"), cached);
  assert.equal(result.archived, 0);
  assert.equal(result.failed.length, 1);
  assert.doesNotMatch(result.failed[0].message, /raw provider outage secret/);
  assert.equal(repository.states.at(-1)?.status, "failed");
});

test("disappeared provider template is archived rather than deleted", async () => {
  const repository = new MemoryRepository();
  await sync(repository, [providerTemplate("kept"), providerTemplate("gone")]);

  const result = await sync(repository, [providerTemplate("kept")]);

  assert.equal(result.archived, 1);
  assert.equal(repository.templates.size, 2);
  assert.equal(repository.templates.get("gone")?.status, "archived");
});

test("failed changed conversion retains the previous published version", async () => {
  const repository = new MemoryRepository();
  await sync(repository, [providerTemplate("one")]);
  const publishedVersionId = repository.templates.get("one")?.publishedVersionId;
  const invalidUpdate = providerTemplate("one", {
    timeline: { tracks: [] },
    updatedAt: "2026-07-04T00:00:00.000Z",
  });

  const result = await sync(repository, [invalidUpdate]);

  assert.equal(result.failed.length, 1);
  assert.equal(repository.versions.length, 1);
  assert.equal(repository.templates.get("one")?.publishedVersionId, publishedVersionId);
  assert.equal(repository.templates.get("one")?.status, "published");
});

test("sync state records safe attempt, success, and summary", async () => {
  const repository = new MemoryRepository();

  await sync(repository, [providerTemplate("one")]);

  assert.deepEqual(repository.states, [{
    provider: "shotstack",
    environment: "stage",
    lastAttemptAt: new Date("2026-07-24T00:00:00.000Z"),
    lastSuccessAt: new Date("2026-07-24T00:00:00.000Z"),
    status: "success",
    summary: {
      created: 1,
      updated: 0,
      unchanged: 0,
      archived: 0,
      failed: [],
    },
  }]);
});

test("overlapping first imports remain idempotent", async () => {
  const repository = new MemoryRepository();
  const details = [providerTemplate("one")];

  const results = await Promise.all([
    sync(repository, details),
    sync(repository, details),
  ]);

  assert.equal(results.reduce((sum, result) => sum + result.created, 0), 1);
  assert.equal(results.reduce((sum, result) => sum + result.unchanged, 0), 0);
  assert.equal(results.flatMap((result) => result.failed).length, 0);
  assert.equal(repository.templates.size, 1);
  assert.equal(repository.versions.length, 1);
});

test("overlapping changed imports create only one logical version", async () => {
  const repository = new MemoryRepository();
  await sync(repository, [providerTemplate("one")]);
  const changed = providerTemplate("one");
  const timeline = changed.timeline as {
    tracks: Array<{ clips: Array<{ length: number }> }>;
  };
  timeline.tracks[0].clips[0].length = 9;

  const results = await Promise.all([
    sync(repository, [changed]),
    sync(repository, [changed]),
  ]);

  assert.equal(results.reduce((sum, result) => sum + result.updated, 0), 1);
  assert.equal(results.reduce((sum, result) => sum + result.unchanged, 0), 0);
  assert.equal(repository.versions.length, 2);
});

test("duplicate-key timing during changed import is recovered as unchanged", async () => {
  class DuplicateTimingRepository extends MemoryRepository {
    private simulateRace = true;

    override async createVersionAndPublish(
      templateId: string,
      template: SyncTemplateInput,
      version: SyncVersionInput
    ) {
      if (this.simulateRace) {
        this.simulateRace = false;
        await super.createVersionAndPublish(templateId, template, version);
        throw new Error("E11000 duplicate key");
      }
      return super.createVersionAndPublish(templateId, template, version);
    }
  }
  const repository = new DuplicateTimingRepository();
  await sync(repository, [providerTemplate("one")]);
  const changed = providerTemplate("one");
  const timeline = changed.timeline as {
    tracks: Array<{ clips: Array<{ length: number }> }>;
  };
  timeline.tracks[0].clips[0].length = 7;

  const result = await sync(repository, [changed]);

  assert.equal(result.failed.length, 0);
  assert.equal(result.unchanged, 1);
  assert.equal(repository.versions.length, 2);
});

test("older sync cannot archive newer data or regress sync-state timestamps", async () => {
  let releaseOlderArchive!: () => void;
  const allowOlderArchive = new Promise<void>((resolve) => {
    releaseOlderArchive = resolve;
  });
  class OrderedRepository extends MemoryRepository {
    override async archiveMissing(activeExternalIds: string[], lastSyncedAt: Date) {
      if (lastSyncedAt.toISOString() === "2026-07-24T01:00:00.000Z") {
        await allowOlderArchive;
      }
      return super.archiveMissing(activeExternalIds, lastSyncedAt);
    }
  }
  const repository = new OrderedRepository();
  await sync(repository, [providerTemplate("one")]);

  const older = synchronizeShotstackTemplates("admin-1", {
    client: clientFor([]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T01:00:00.000Z"),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const newer = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([providerTemplate("one")]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T02:00:00.000Z"),
  });
  releaseOlderArchive();
  const olderResult = await older;

  assert.equal(newer.unchanged, 1);
  assert.equal(olderResult.archived, 0);
  assert.equal(repository.templates.get("one")?.status, "published");
  assert.equal(
    repository.states.at(-1)?.lastAttemptAt.toISOString(),
    "2026-07-24T02:00:00.000Z"
  );
});

test("older delayed detail cannot recreate a template absent from a newer successful list", async () => {
  let releaseOlderDetail!: () => void;
  const allowOlderDetail = new Promise<void>((resolve) => {
    releaseOlderDetail = resolve;
  });
  let markDetailStarted!: () => void;
  const detailStarted = new Promise<void>((resolve) => {
    markDetailStarted = resolve;
  });
  const repository = new MemoryRepository();
  const removedTemplate = providerTemplate("removed");

  const older = synchronizeShotstackTemplates("admin-1", {
    client: {
      async listTemplates() {
        return [{ id: "removed", name: "Removed" }];
      },
      async getTemplate() {
        markDetailStarted();
        await allowOlderDetail;
        return removedTemplate;
      },
    },
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T01:00:00.000Z"),
  });
  await detailStarted;

  const newer = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T01:00:00.000Z"),
  });
  releaseOlderDetail();
  const olderResult = await older;

  assert.equal(newer.archived, 0);
  assert.equal(olderResult.created, 0);
  assert.equal(repository.templates.has("removed"), false);
  assert.equal(
    repository.states.at(-1)?.lastAttemptAt.toISOString(),
    "2026-07-24T01:00:00.000Z"
  );
});

test("malformed provider list preserves cached templates and skips archival", async () => {
  const repository = new MemoryRepository();
  await sync(repository, [providerTemplate("cached")]);
  const cached = structuredClone(repository.templates.get("cached"));

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: {
      async listTemplates() {
        return [{ id: "cached" }, { id: " " }];
      },
      async getTemplate(id: string) {
        return providerTemplate(id);
      },
    },
    repository,
    environment: "stage",
  });

  assert.deepEqual(repository.templates.get("cached"), cached);
  assert.equal(result.archived, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(repository.states.at(-1)?.status, "failed");
});

test("sync state persistence failure rejects with a safe error", async () => {
  class FailingStateRepository extends MemoryRepository {
    override async recordSyncState() {
      throw new Error("mongodb://user:secret@database/internal");
    }
  }

  await assert.rejects(
    () => sync(new FailingStateRepository(), [providerTemplate("one")]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /state could not be recorded/i);
      assert.doesNotMatch(error.message, /secret|mongodb/i);
      return true;
    }
  );
});

test("seed fallback requires an explicit flag and unavailable Shotstack configuration", () => {
  assert.equal(shouldUseVideoTemplateSeedFallback({}), false);
  assert.equal(
    shouldUseVideoTemplateSeedFallback({ VIDEO_TEMPLATE_SEED_FALLBACK: "true" }),
    true
  );
  assert.equal(
    shouldUseVideoTemplateSeedFallback({
      VIDEO_TEMPLATE_SEED_FALLBACK: "true",
      SHOTSTACK_API_KEY: "configured",
    }),
    false
  );
  assert.equal(
    shouldUseVideoTemplateSeedFallback({ VIDEO_TEMPLATE_SEED_FALLBACK: "TRUE" }),
    false
  );
});
