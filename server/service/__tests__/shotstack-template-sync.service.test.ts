import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import type { ShotstackTemplate } from "../../integration/shotstack/shotstack.types";
import { VideoTemplateModel } from "../../model/video-template.model";
import { VideoTemplateSyncModel } from "../../model/video-template-sync.model";
import {
  shouldUseVideoTemplateSeedFallback,
} from "../video-template.service";
import {
  MongooseShotstackTemplateSyncRepository,
  ShotstackSyncBusyError,
  synchronizeShotstackTemplates,
  type SyncLeaseInput,
  type ShotstackTemplateSyncRepository,
  type SyncStateInput,
  type SyncRunContext,
  type SyncTemplateInput,
  type SyncTemplateRecord,
  type SyncVersionInput,
} from "../shotstack-template-sync.service";
import type { RequestVideoTemplatePreviewInput } from "../video-template-preview.service";

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
  public readonly syncLeases = new Map<string, {
    ownerToken: string;
    expiresAt: Date;
  }>();
  private nextTemplateId = 1;
  private nextVersionId = 1;

  async acquireSyncLease(input: SyncLeaseInput) {
    const current = this.syncLeases.get(input.environment);
    if (current && current.expiresAt.getTime() > input.acquiredAt.getTime()) {
      return false;
    }
    this.syncLeases.set(input.environment, {
      ownerToken: input.ownerToken,
      expiresAt: new Date(input.expiresAt),
    });
    return true;
  }

  async releaseSyncLease(environment: SyncRunContext["environment"], ownerToken: string) {
    const current = this.syncLeases.get(environment);
    if (current?.ownerToken === ownerToken) {
      this.syncLeases.delete(environment);
    }
  }

  async findByExternalId(externalId: string) {
    return this.templates.get(externalId) || null;
  }

  async registerSuccessfulList(run: Omit<SyncRunContext, "generation">) {
    const lease = this.syncLeases.get(run.environment);
    if (lease?.ownerToken !== run.ownerToken) {
      throw new Error("stale sync owner");
    }
    const current = this.latestSuccessfulLists.get(run.environment);
    if (!current || current.getTime() <= run.attemptedAt.getTime()) {
      this.latestSuccessfulLists.set(run.environment, new Date(run.attemptedAt));
    }
    const generation = (this.latestSuccessfulListGenerations.get(run.environment) || 0) + 1;
    this.latestSuccessfulListGenerations.set(run.environment, generation);
    return generation;
  }

  async isRunCurrent(run: SyncRunContext) {
    return this.latestSuccessfulListGenerations.get(run.environment) === run.generation
      && this.syncLeases.get(run.environment)?.ownerToken === run.ownerToken;
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
      lastSyncGeneration: run.generation,
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

  async updateTemplateMetadata(
    templateId: string,
    input: SyncTemplateInput,
    run: SyncRunContext
  ) {
    if (!(await this.isRunCurrent(run))) {
      return false;
    }
    const record = this.byId(templateId);
    if (
      typeof record.lastSyncGeneration === "number"
      && record.lastSyncGeneration > run.generation
    ) return false;
    const updateData: Record<string, unknown> = {
      ...structuredClone(input),
      lastSyncGeneration: run.generation,
    };
    if (input.previewVideoUrl === undefined) {
      delete updateData.previewVideoUrl;
    }
    Object.assign(record, updateData);
    return true;
  }

  async createVersionAndPublish(
    templateId: string,
    template: SyncTemplateInput,
    version: SyncVersionInput,
    run: SyncRunContext
  ) {
    if (!(await this.isRunCurrent(run))) {
      return null;
    }
    const record = this.byId(templateId);
    if (
      typeof record.lastSyncGeneration === "number"
      && record.lastSyncGeneration > run.generation
    ) return null;
    const updateData: Record<string, unknown> = {
      ...structuredClone(template),
      lastSyncGeneration: run.generation,
    };
    if (template.previewVideoUrl === undefined) {
      delete updateData.previewVideoUrl;
    }
    if (record.sourceHash === template.sourceHash) {
      Object.assign(record, updateData);
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
    Object.assign(record, updateData, {
      publishedVersionId: versionId,
      lastSyncGeneration: run.generation,
    });
    return "updated" as const;
  }

  async archiveMissing(
    activeExternalIds: string[],
    lastSyncedAt: Date,
    run: SyncRunContext
  ) {
    if (!(await this.isRunCurrent(run))) return 0;
    let archived = 0;
    for (const record of this.templates.values()) {
      if (
        record.sourceProvider === "shotstack"
        && !activeExternalIds.includes(record.externalTemplateId)
        && (
          typeof record.lastSyncGeneration !== "number"
          || record.lastSyncGeneration <= run.generation
        )
        && (
          !(record.lastSyncedAt instanceof Date)
          || record.lastSyncedAt.getTime() <= lastSyncedAt.getTime()
        )
      ) {
        if (record.status !== "archived") archived += 1;
        record.status = "archived";
        record.lastSyncedAt = lastSyncedAt;
        record.lastSyncGeneration = run.generation;
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

function repositoryInputs(
  externalTemplateId: string,
  title = `Template ${externalTemplateId}`,
  hash = `hash-${externalTemplateId}`
): { template: SyncTemplateInput; version: SyncVersionInput } {
  return {
    template: {
      sourceProvider: "shotstack",
      externalTemplateId,
      sourceHash: hash,
      lastSyncedAt: new Date("2026-07-24T00:00:00.000Z"),
      compatibilityWarnings: [],
      title,
      description: "",
      thumbnailUrl: `https://cdn.example.com/${externalTemplateId}.jpg`,
      duration: 5,
      aspectRatio: "9:16",
      categoryId: "shotstack",
      categoryName: "Shotstack",
      tags: [],
      badges: [],
      visibility: "system",
      status: "published",
    },
    version: {
      sourceHash: hash,
      sourceEdit: {},
      normalizedEditorState: {},
      compatibilityWarnings: [],
      blueprint: {},
      slots: [],
      defaultValues: {},
      createdBy: "admin-1",
    },
  };
}

test("registered successor globally fences stale create, metadata, version, and archive before rows are stamped", async () => {
  const repository = new MemoryRepository();
  const oldAttemptedAt = new Date("2026-07-24T00:00:00.000Z");
  await repository.acquireSyncLease({
    environment: "stage",
    ownerToken: "old-owner",
    acquiredAt: oldAttemptedAt,
    expiresAt: new Date("2026-07-24T00:01:00.000Z"),
  });
  const oldGeneration = await repository.registerSuccessfulList({
    environment: "stage",
    attemptedAt: oldAttemptedAt,
    ownerToken: "old-owner",
  });
  const oldRun: SyncRunContext = {
    environment: "stage",
    attemptedAt: oldAttemptedAt,
    generation: oldGeneration,
    ownerToken: "old-owner",
  };
  const existing = repositoryInputs("existing", "Original title", "hash-original");
  const created = await repository.createTemplateWithVersion(
    existing.template,
    existing.version,
    oldRun
  );
  assert.ok(created);
  const originalVersionId = created.publishedVersionId;

  const successorAttemptedAt = new Date("2026-07-24T00:02:00.000Z");
  await repository.acquireSyncLease({
    environment: "stage",
    ownerToken: "successor-owner",
    acquiredAt: successorAttemptedAt,
    expiresAt: new Date("2026-07-24T00:03:00.000Z"),
  });
  await repository.registerSuccessfulList({
    environment: "stage",
    attemptedAt: successorAttemptedAt,
    ownerToken: "successor-owner",
  });

  const absent = repositoryInputs("absent");
  const staleMetadata = repositoryInputs("existing", "Stale title", "hash-original");
  const staleVersion = repositoryInputs("existing", "Stale version", "hash-stale");
  assert.equal(
    await repository.createTemplateWithVersion(absent.template, absent.version, oldRun),
    null
  );
  assert.equal(
    await repository.updateTemplateMetadata(created.id, staleMetadata.template, oldRun),
    false
  );
  assert.equal(
    await repository.createVersionAndPublish(
      created.id,
      staleVersion.template,
      staleVersion.version,
      oldRun
    ),
    null
  );
  assert.equal(await repository.archiveMissing([], successorAttemptedAt, oldRun), 0);

  assert.equal(repository.templates.has("absent"), false);
  assert.equal(repository.templates.get("existing")?.title, "Original title");
  assert.equal(repository.templates.get("existing")?.status, "published");
  assert.equal(repository.templates.get("existing")?.publishedVersionId, originalVersionId);
  assert.equal(repository.templates.get("existing")?.lastSyncGeneration, oldGeneration);
  assert.equal(repository.versions.length, 1);
});

test("Mongo mutation transactions gate on the exact active owner and generation", async (context) => {
  const gateFilters: Array<Record<string, unknown>> = [];
  const gateUpdates: Array<Record<string, unknown>> = [];
  const gateSessions: unknown[] = [];
  let templateMutationCalls = 0;
  const session = {
    async withTransaction(callback: () => Promise<void>) {
      await callback();
    },
    async endSession() {},
  };
  context.mock.method(
    mongoose,
    "startSession",
    async () => session as Awaited<ReturnType<typeof mongoose.startSession>>
  );
  context.mock.method(
    VideoTemplateSyncModel,
    "updateOne",
    async (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options: { session?: unknown }
    ) => {
      gateFilters.push(filter);
      gateUpdates.push(update);
      gateSessions.push(options.session);
      return {
        matchedCount: (
          filter.provider === "shotstack"
          && filter.environment === "stage"
          && filter.leaseOwnerToken === "successor-owner"
          && filter.latestSuccessfulListGeneration === 2
        ) ? 1 : 0,
      };
    }
  );
  context.mock.method(VideoTemplateModel, "updateOne", async () => {
    templateMutationCalls += 1;
    return { matchedCount: 1 };
  });
  context.mock.method(VideoTemplateModel, "findOneAndUpdate", () => {
    templateMutationCalls += 1;
    return { lean: async () => null };
  });
  context.mock.method(VideoTemplateModel, "updateMany", async () => {
    templateMutationCalls += 1;
    return { modifiedCount: 1 };
  });

  const repository = new MongooseShotstackTemplateSyncRepository();
  const oldRun: SyncRunContext = {
    environment: "stage",
    attemptedAt: new Date("2026-07-24T00:00:00.000Z"),
    generation: 1,
    ownerToken: "old-owner",
  };
  const absent = repositoryInputs("absent");
  const existing = repositoryInputs("existing");

  assert.equal(
    await repository.createTemplateWithVersion(absent.template, absent.version, oldRun),
    null
  );
  assert.equal(
    await repository.updateTemplateMetadata("template-existing", existing.template, oldRun),
    false
  );
  assert.equal(
    await repository.createVersionAndPublish(
      "template-existing",
      existing.template,
      existing.version,
      oldRun
    ),
    null
  );
  assert.equal(
    await repository.archiveMissing([], oldRun.attemptedAt, oldRun),
    0
  );

  assert.equal(templateMutationCalls, 0);
  assert.equal(gateFilters.length, 4);
  assert.equal(gateUpdates.length, 4);
  assert.equal(gateSessions.length, 4);
  for (let index = 0; index < gateFilters.length; index += 1) {
    const filter = gateFilters[index];
    assert.equal(filter.leaseOwnerToken, oldRun.ownerToken);
    assert.equal(filter.latestSuccessfulListGeneration, oldRun.generation);
    assert.deepEqual(gateUpdates[index].$inc, { mutationFenceSequence: 1 });
    assert.equal(gateSessions[index], session);
  }
});

test("first import creates one published template and immutable version", async () => {
  const repository = new MemoryRepository();

  const result = await sync(repository, [providerTemplate("one")]);

  assert.deepEqual(result, {
    created: 1,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failedCount: 0,
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
  assert.equal(repository.syncLeases.size, 0);
});

test("imports the nested template payload returned by the current Shotstack API", async () => {
  const repository = new MemoryRepository();
  const detail = {
    id: "nested-one",
    name: "Nested Shotstack template",
    owner: "shotstack-owner",
    template: {
      timeline: {
        tracks: [{
          clips: [{
            asset: {
              type: "video",
              src: "https://cdn.example.com/nested-one.mp4",
            },
            start: 0,
            length: 5,
          }],
        }],
      },
      output: { format: "mp4", aspectRatio: "9:16" },
      merge: [],
    },
  } as ShotstackTemplate;

  const result = await sync(repository, [detail]);

  assert.equal(result.created, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(
    repository.templates.get("nested-one")?.title,
    "Nested Shotstack template"
  );
  assert.ok(repository.versions[0].sourceEdit.timeline);
  assert.equal("template" in repository.versions[0].sourceEdit, false);
});

test("uses nested template metadata duration for an all-symbolic visual timeline", async () => {
  const repository = new MemoryRepository();
  const detail = {
    id: "symbolic-nested",
    name: "Symbolic nested template",
    duration: 12,
    template: {
      timeline: {
        tracks: [{
          clips: [{
            asset: {
              type: "video",
              src: "{{ VIDEO }}",
            },
            start: 2,
            length: "auto",
          }],
        }],
      },
      output: { format: "mp4", aspectRatio: "9:16" },
      merge: [{ find: "VIDEO", replace: "https://cdn.example.com/default.mp4" }],
    },
  } as ShotstackTemplate;

  const result = await sync(repository, [detail]);

  assert.equal(result.created, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(repository.templates.get("symbolic-nested")?.duration, 12);
  assert.equal(
    (repository.versions[0].normalizedEditorState.items as Array<Record<string, unknown>>)[0].duration,
    10
  );
  assert.deepEqual(repository.versions[0].sourceEdit, detail.template);
});

test("duration-only wrapper updates create a new normalized template version", async () => {
  const repository = new MemoryRepository();
  const nestedEdit = {
    timeline: {
      tracks: [{
        clips: [{
          asset: {
            type: "video",
            src: "{{ VIDEO }}",
          },
          start: 2,
          length: "auto",
        }],
      }],
    },
    output: { format: "mp4", aspectRatio: "9:16" },
    merge: [{ find: "VIDEO", replace: "https://cdn.example.com/default.mp4" }],
  };
  const first = {
    id: "duration-only",
    name: "Duration-only wrapper",
    duration: 12,
    template: structuredClone(nestedEdit),
  } as ShotstackTemplate;
  const second = {
    ...first,
    duration: 16,
    template: structuredClone(nestedEdit),
  } as ShotstackTemplate;

  await sync(repository, [first]);
  const result = await sync(repository, [second]);

  assert.equal(result.updated, 1);
  assert.equal(result.unchanged, 0);
  assert.equal(repository.versions.length, 2);
  assert.equal(repository.versions[1].version, 2);
  assert.equal(repository.templates.get("duration-only")?.duration, 16);
  assert.equal(
    (repository.versions[1].normalizedEditorState.items as Array<Record<string, unknown>>)[0].duration,
    14
  );
  assert.deepEqual(repository.versions[1].sourceEdit, nestedEdit);
  assert.notEqual(repository.versions[0].sourceHash, repository.versions[1].sourceHash);
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
  assert.equal((result as { failedCount?: number }).failedCount, 1);
  assert.equal(result.failed[0].externalId, "invalid");
  assert.doesNotMatch(result.failed[0].message, /audio\.mp3|no usable visual/i);
  assert.ok(repository.templates.has("valid"));
  assert.equal(repository.templates.has("invalid"), false);
  assert.equal(repository.states.at(-1)?.lastSuccessAt, undefined);
  assert.equal(
    (repository.states.at(-1)?.summary as { failedCount?: number } | undefined)?.failedCount,
    1
  );
});

test("sync-state schema persists the safe aggregate failure count", () => {
  assert.ok(VideoTemplateSyncModel.schema.path("summary.failedCount"));
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
      failedCount: 0,
      failed: [],
    },
  }]);
});

test("overlapping first imports allow one owner and reject the other safely", async () => {
  const repository = new MemoryRepository();
  const details = [providerTemplate("one")];

  const results = await Promise.allSettled([
    sync(repository, details),
    sync(repository, details),
  ]);

  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof sync>>> => (
      result.status === "fulfilled"
    )
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  assert.equal(fulfilled.length, 1);
  assert.equal(fulfilled[0].value.created, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof ShotstackSyncBusyError);
  assert.doesNotMatch(String(rejected[0].reason), /owner|token/i);
  assert.equal(repository.templates.size, 1);
  assert.equal(repository.versions.length, 1);
});

test("equal-timestamp overlap cannot enter an existing-row version update", async () => {
  let releaseUpdate!: () => void;
  const allowUpdate = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  let markUpdateStarted!: () => void;
  const updateStarted = new Promise<void>((resolve) => {
    markUpdateStarted = resolve;
  });
  class PausedUpdateRepository extends MemoryRepository {
    private pauseNextUpdate = false;

    pauseUpdate() {
      this.pauseNextUpdate = true;
    }

    override async createVersionAndPublish(
      templateId: string,
      template: SyncTemplateInput,
      version: SyncVersionInput,
      run: SyncRunContext
    ) {
      if (this.pauseNextUpdate) {
        this.pauseNextUpdate = false;
        markUpdateStarted();
        await allowUpdate;
      }
      return super.createVersionAndPublish(templateId, template, version, run);
    }
  }
  const repository = new PausedUpdateRepository();
  let concurrentListCalls = 0;
  await sync(repository, [providerTemplate("one")]);
  repository.pauseUpdate();
  const changed = providerTemplate("one");
  const timeline = changed.timeline as {
    tracks: Array<{ clips: Array<{ length: number }> }>;
  };
  timeline.tracks[0].clips[0].length = 9;

  const owner = sync(repository, [changed]);
  await updateStarted;
  await assert.rejects(
    () => synchronizeShotstackTemplates("admin-2", {
      client: {
        async listTemplates() {
          concurrentListCalls += 1;
          return [{ id: "one" }];
        },
        async getTemplate() {
          return changed;
        },
      },
      repository,
      environment: "stage",
      now: () => new Date("2026-07-24T00:00:00.000Z"),
    }),
    ShotstackSyncBusyError
  );
  assert.equal(concurrentListCalls, 0);
  releaseUpdate();
  const result = await owner;

  assert.equal(result.updated, 1);
  assert.equal(repository.versions.length, 2);
  assert.equal(repository.syncLeases.size, 0);
});

test("expired old owner cannot report or apply a metadata refresh after a newer owner", async () => {
  let releaseOldUpdate!: () => void;
  const allowOldUpdate = new Promise<void>((resolve) => {
    releaseOldUpdate = resolve;
  });
  let markOldUpdateStarted!: () => void;
  const oldUpdateStarted = new Promise<void>((resolve) => {
    markOldUpdateStarted = resolve;
  });
  class PausedMetadataRepository extends MemoryRepository {
    private pauseNextUpdate = false;

    pauseUpdate() {
      this.pauseNextUpdate = true;
    }

    override async updateTemplateMetadata(
      templateId: string,
      input: SyncTemplateInput,
      run: SyncRunContext
    ) {
      if (this.pauseNextUpdate) {
        this.pauseNextUpdate = false;
        markOldUpdateStarted();
        await allowOldUpdate;
      }
      return super.updateTemplateMetadata(templateId, input, run);
    }
  }
  const repository = new PausedMetadataRepository();
  await sync(repository, [providerTemplate("one")]);
  repository.pauseUpdate();

  const oldOwner = synchronizeShotstackTemplates("admin-old", {
    client: clientFor([providerTemplate("one", { name: "Stale title" })]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:01:00.000Z"),
  });
  await oldUpdateStarted;

  const newerResult = await synchronizeShotstackTemplates("admin-new", {
    client: clientFor([providerTemplate("one", { name: "Current title" })]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:32:00.000Z"),
  });
  releaseOldUpdate();
  const oldResult = await oldOwner;

  assert.equal(newerResult.unchanged, 1);
  assert.deepEqual(oldResult, {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failedCount: 0,
    failed: [],
  });
  assert.equal(repository.templates.get("one")?.title, "Current title");
});

test("newer empty catalogue establishes absence before an expired old owner can create", async () => {
  let releaseOldCreate!: () => void;
  const allowOldCreate = new Promise<void>((resolve) => {
    releaseOldCreate = resolve;
  });
  let markOldCreateStarted!: () => void;
  const oldCreateStarted = new Promise<void>((resolve) => {
    markOldCreateStarted = resolve;
  });
  class PausedCreateRepository extends MemoryRepository {
    private pauseNextCreate = true;

    override async createTemplateWithVersion(
      template: SyncTemplateInput,
      version: SyncVersionInput,
      run: SyncRunContext
    ) {
      if (this.pauseNextCreate) {
        this.pauseNextCreate = false;
        markOldCreateStarted();
        await allowOldCreate;
      }
      return super.createTemplateWithVersion(template, version, run);
    }
  }
  const repository = new PausedCreateRepository();

  const oldOwner = synchronizeShotstackTemplates("admin-old", {
    client: clientFor([providerTemplate("one")]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:01:00.000Z"),
  });
  await oldCreateStarted;

  const newerResult = await synchronizeShotstackTemplates("admin-new", {
    client: clientFor([]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:32:00.000Z"),
  });
  releaseOldCreate();
  const oldResult = await oldOwner;

  assert.deepEqual(newerResult, {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failedCount: 0,
    failed: [],
  });
  assert.deepEqual(oldResult, {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failedCount: 0,
    failed: [],
  });
  assert.equal(repository.templates.has("one"), false);
  assert.equal(repository.versions.length, 0);
});

test("newer empty catalogue fences an already archived template from stale resurrection", async () => {
  let releaseOldUpdate!: () => void;
  const allowOldUpdate = new Promise<void>((resolve) => {
    releaseOldUpdate = resolve;
  });
  let markOldUpdateStarted!: () => void;
  const oldUpdateStarted = new Promise<void>((resolve) => {
    markOldUpdateStarted = resolve;
  });
  class PausedArchivedMetadataRepository extends MemoryRepository {
    private pauseNextUpdate = false;

    pauseUpdate() {
      this.pauseNextUpdate = true;
    }

    override async updateTemplateMetadata(
      templateId: string,
      input: SyncTemplateInput,
      run: SyncRunContext
    ) {
      if (this.pauseNextUpdate) {
        this.pauseNextUpdate = false;
        markOldUpdateStarted();
        await allowOldUpdate;
      }
      return super.updateTemplateMetadata(templateId, input, run);
    }
  }
  const repository = new PausedArchivedMetadataRepository();
  await sync(repository, [providerTemplate("one")]);
  await sync(repository, []);
  assert.equal(repository.templates.get("one")?.status, "archived");
  repository.pauseUpdate();

  const oldOwner = synchronizeShotstackTemplates("admin-old", {
    client: clientFor([providerTemplate("one")]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:01:00.000Z"),
  });
  await oldUpdateStarted;

  const newerResult = await synchronizeShotstackTemplates("admin-new", {
    client: clientFor([]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:32:00.000Z"),
  });
  releaseOldUpdate();
  const oldResult = await oldOwner;

  assert.equal(newerResult.archived, 0);
  assert.deepEqual(oldResult, {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failedCount: 0,
    failed: [],
  });
  assert.equal(repository.templates.get("one")?.status, "archived");
});

test("expired old owner cannot publish a version over the newer owner", async () => {
  let releaseOldPublication!: () => void;
  const allowOldPublication = new Promise<void>((resolve) => {
    releaseOldPublication = resolve;
  });
  let markOldPublicationStarted!: () => void;
  const oldPublicationStarted = new Promise<void>((resolve) => {
    markOldPublicationStarted = resolve;
  });
  class PausedPublicationRepository extends MemoryRepository {
    private pauseNextPublication = false;

    pausePublication() {
      this.pauseNextPublication = true;
    }

    override async createVersionAndPublish(
      templateId: string,
      template: SyncTemplateInput,
      version: SyncVersionInput,
      run: SyncRunContext
    ) {
      if (this.pauseNextPublication) {
        this.pauseNextPublication = false;
        markOldPublicationStarted();
        await allowOldPublication;
      }
      return super.createVersionAndPublish(templateId, template, version, run);
    }
  }
  const repository = new PausedPublicationRepository();
  await sync(repository, [providerTemplate("one")]);
  repository.pausePublication();
  const staleEdit = providerTemplate("one");
  const staleTimeline = staleEdit.timeline as {
    tracks: Array<{ clips: Array<{ length: number }> }>;
  };
  staleTimeline.tracks[0].clips[0].length = 9;
  const currentEdit = providerTemplate("one");
  const currentTimeline = currentEdit.timeline as {
    tracks: Array<{ clips: Array<{ length: number }> }>;
  };
  currentTimeline.tracks[0].clips[0].length = 10;

  const oldOwner = synchronizeShotstackTemplates("admin-old", {
    client: clientFor([staleEdit]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:01:00.000Z"),
  });
  await oldPublicationStarted;

  const newerResult = await synchronizeShotstackTemplates("admin-new", {
    client: clientFor([currentEdit]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:32:00.000Z"),
  });
  const newerPublishedVersionId = repository.templates.get("one")?.publishedVersionId;
  releaseOldPublication();
  const oldResult = await oldOwner;

  assert.equal(newerResult.updated, 1);
  assert.deepEqual(oldResult, {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failedCount: 0,
    failed: [],
  });
  assert.equal(repository.versions.length, 2);
  assert.equal(repository.templates.get("one")?.publishedVersionId, newerPublishedVersionId);
  assert.equal(repository.templates.get("one")?.duration, 10);
});

test("duplicate-key timing during changed import is recovered as unchanged", async () => {
  class DuplicateTimingRepository extends MemoryRepository {
    private simulateRace = true;

    override async createVersionAndPublish(
      templateId: string,
      template: SyncTemplateInput,
      version: SyncVersionInput,
      run: SyncRunContext
    ) {
      if (this.simulateRace) {
        this.simulateRace = false;
        await super.createVersionAndPublish(templateId, template, version, run);
        throw new Error("E11000 duplicate key");
      }
      return super.createVersionAndPublish(templateId, template, version, run);
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

test("equal-timestamp overlap cannot enter archival after the owner reaches it", async () => {
  let releaseArchive!: () => void;
  const allowArchive = new Promise<void>((resolve) => {
    releaseArchive = resolve;
  });
  let markArchiveStarted!: () => void;
  const archiveStarted = new Promise<void>((resolve) => {
    markArchiveStarted = resolve;
  });
  class PausedArchiveRepository extends MemoryRepository {
    private pauseNextArchive = false;

    pauseArchive() {
      this.pauseNextArchive = true;
    }

    override async archiveMissing(
      activeExternalIds: string[],
      lastSyncedAt: Date,
      run: SyncRunContext
    ) {
      if (this.pauseNextArchive) {
        this.pauseNextArchive = false;
        markArchiveStarted();
        await allowArchive;
      }
      return super.archiveMissing(activeExternalIds, lastSyncedAt, run);
    }
  }
  const repository = new PausedArchiveRepository();
  await sync(repository, [providerTemplate("one")]);
  repository.pauseArchive();

  const owner = synchronizeShotstackTemplates("admin-1", {
    client: clientFor([]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });
  await archiveStarted;
  let concurrentListCalls = 0;
  await assert.rejects(
    () => synchronizeShotstackTemplates("admin-2", {
      client: {
        async listTemplates() {
          concurrentListCalls += 1;
          return [{ id: "one" }];
        },
        async getTemplate() {
          return providerTemplate("one");
        },
      },
      repository,
      environment: "stage",
      now: () => new Date("2026-07-24T00:00:00.000Z"),
    }),
    ShotstackSyncBusyError
  );
  assert.equal(concurrentListCalls, 0);
  releaseArchive();
  const result = await owner;

  assert.equal(result.archived, 1);
  assert.equal(repository.templates.get("one")?.status, "archived");
  assert.equal(repository.syncLeases.size, 0);
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

test("lease is released after provider list and item failures", async () => {
  const repository = new MemoryRepository();

  const listFailure = await synchronizeShotstackTemplates("admin-1", {
    client: {
      async listTemplates() {
        throw new Error("provider secret");
      },
      async getTemplate() {
        throw new Error("not reached");
      },
    },
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });
  assert.equal(listFailure.failed.length, 1);
  assert.equal(repository.syncLeases.size, 0);

  const itemFailure = await sync(repository, [providerTemplate("invalid", {
    timeline: { tracks: [] },
  })]);
  assert.equal(itemFailure.failed.length, 1);
  assert.equal(repository.syncLeases.size, 0);

  const recovered = await sync(repository, [providerTemplate("valid")]);
  assert.equal(recovered.created, 1);
});

test("lease is released when sync-state recording throws", async () => {
  class FailingOnceStateRepository extends MemoryRepository {
    private shouldFail = true;

    override async recordSyncState(input: SyncStateInput) {
      if (this.shouldFail) {
        this.shouldFail = false;
        throw new Error("mongodb://user:secret@database/internal");
      }
      return super.recordSyncState(input);
    }
  }
  const repository = new FailingOnceStateRepository();

  await assert.rejects(
    () => sync(repository, [providerTemplate("one")]),
    /state could not be recorded/i
  );
  assert.equal(repository.syncLeases.size, 0);

  const recovered = await sync(repository, [providerTemplate("one")]);
  assert.equal(recovered.unchanged, 1);
});

test("only the owner can release a lease and an expired lease can be reclaimed", async () => {
  const repository = new MemoryRepository();
  const acquiredAt = new Date("2026-07-24T00:00:00.000Z");
  assert.equal(await repository.acquireSyncLease({
    environment: "stage",
    ownerToken: "opaque-owner-one",
    acquiredAt,
    expiresAt: new Date("2026-07-24T00:01:00.000Z"),
  }), true);

  await repository.releaseSyncLease("stage", "different-owner");
  await assert.rejects(
    () => sync(repository, [providerTemplate("blocked")]),
    ShotstackSyncBusyError
  );

  const reclaimed = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([providerTemplate("reclaimed")]),
    repository,
    environment: "stage",
    now: () => new Date("2026-07-24T00:02:00.000Z"),
  });

  assert.equal(reclaimed.created, 1);
  assert.equal(repository.templates.has("blocked"), false);
  assert.equal(repository.templates.has("reclaimed"), true);
  assert.equal(repository.syncLeases.size, 0);
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

test("new import requests one background preview after persistence", async () => {
  const repository = new MemoryRepository();
  const previewRequests: Array<RequestVideoTemplatePreviewInput> = [];
  const requestPreview = async (input: RequestVideoTemplatePreviewInput) => {
    previewRequests.push(input);
    return { renderId: "render-1", created: true };
  };

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([providerTemplate("p1")]),
    repository,
    environment: "stage",
    requestPreview,
  });

  assert.equal(result.created, 1);
  assert.equal(previewRequests.length, 1);
  assert.equal(previewRequests[0].templateId, repository.templates.get("p1")?.id);
  assert.equal(previewRequests[0].templateVersionId, repository.versions[0].id);
  assert.equal(repository.templates.get("p1")?.previewVideoUrl, undefined);
});

test("unchanged import reuses the same preview identity", async () => {
  const repository = new MemoryRepository();
  const previewRequests: Array<RequestVideoTemplatePreviewInput> = [];
  const requestPreview = async (input: RequestVideoTemplatePreviewInput) => {
    previewRequests.push(input);
    return { renderId: "render-1", created: false };
  };

  await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([providerTemplate("p1")]),
    repository,
    environment: "stage",
    requestPreview,
  });

  previewRequests.length = 0;

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([providerTemplate("p1")]),
    repository,
    environment: "stage",
    requestPreview,
  });

  assert.equal(result.unchanged, 1);
  assert.equal(previewRequests.length, 1);
  assert.equal(previewRequests[0].templateVersionId, repository.versions[0].id);
});

test("changed import requests preview for the newly published version", async () => {
  const repository = new MemoryRepository();
  const previewRequests: Array<RequestVideoTemplatePreviewInput> = [];
  const requestPreview = async (input: RequestVideoTemplatePreviewInput) => {
    previewRequests.push(input);
    return { renderId: "render-2", created: true };
  };

  const original = providerTemplate("p1");
  await sync(repository, [original]);

  const changed = providerTemplate("p1");
  (changed.timeline as { tracks: Array<{ clips: Array<{ length: number }> }> }).tracks[0].clips[0].length = 10;

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([changed]),
    repository,
    environment: "stage",
    requestPreview,
  });

  assert.equal(result.updated, 1);
  assert.equal(previewRequests.length, 1);
  assert.equal(previewRequests[0].templateVersionId, repository.versions[1].id);
});

test("preview request failure does not fail catalogue synchronization", async () => {
  const repository = new MemoryRepository();
  const requestPreview = async () => {
    throw new Error("Preview enqueue queue down");
  };

  const result = await synchronizeShotstackTemplates("admin-1", {
    client: clientFor([providerTemplate("p1")]),
    repository,
    environment: "stage",
    requestPreview,
  });

  assert.equal(result.created, 1);
  assert.equal(result.failed.length, 0);
});

test("does not set first video clip as previewVideoUrl", async () => {
  const repository = new MemoryRepository();

  await sync(repository, [providerTemplate("p1")]);

  assert.equal(repository.templates.get("p1")?.previewVideoUrl, undefined);
});

test("never populates previewVideoUrl from dedicated provider preview metadata or overwrites existing Cloudinary preview URL", async () => {
  const repository = new MemoryRepository();

  const providerItemWithPreview = {
    ...providerTemplate("p1"),
    previewVideoUrl: "https://cdn.shotstack.io/temporary-clip.mp4",
  };

  await sync(repository, [providerItemWithPreview]);
  assert.equal(repository.templates.get("p1")?.previewVideoUrl, undefined);

  const template = repository.templates.get("p1");
  if (template) {
    template.previewVideoUrl = "https://res.cloudinary.com/app/video/upload/preview.mp4";
  }

  const updatedItemWithPreview = {
    ...providerTemplate("p1"),
    title: "Updated Title",
    previewVideoUrl: "https://cdn.shotstack.io/another-temporary-clip.mp4",
  };

  await sync(repository, [updatedItemWithPreview]);
  assert.equal(
    repository.templates.get("p1")?.previewVideoUrl,
    "https://res.cloudinary.com/app/video/upload/preview.mp4"
  );
});
