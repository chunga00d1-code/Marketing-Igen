import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type {
  VideoTemplateAspectRatio,
  VideoTemplateSyncStatus,
  VideoTemplateSyncSummary,
} from "../interface/video-template.interface";
import {
  getShotstackConfig,
  ShotstackClient,
} from "../integration/shotstack/shotstack.client";
import {
  shotstackEditToEditorProject,
  type ShotstackConversionResult,
} from "../integration/shotstack/shotstack.converter";
import type {
  ShotstackEdit,
  ShotstackEnvironment,
  ShotstackTemplate,
  ShotstackTemplateSummary,
} from "../integration/shotstack/shotstack.types";
import { VideoTemplateModel } from "../model/video-template.model";
import { VideoTemplateSyncModel } from "../model/video-template-sync.model";
import { VideoTemplateVersionModel } from "../model/video-template-version.model";

const DETAIL_CONCURRENCY = 3;
const ITEM_FAILURE_MESSAGE = "Shotstack template could not be synchronized.";
const LIST_FAILURE_MESSAGE = "Shotstack template catalogue is temporarily unavailable.";

type SyncClient = Pick<ShotstackClient, "listTemplates" | "getTemplate">;

export interface SyncTemplateRecord {
  id: string;
  sourceProvider: "shotstack";
  externalTemplateId: string;
  sourceHash?: string;
  status: "draft" | "published" | "archived";
  publishedVersionId?: string;
}

export interface SyncTemplateInput {
  sourceProvider: "shotstack";
  externalTemplateId: string;
  sourceHash: string;
  providerCreatedAt?: Date;
  providerUpdatedAt?: Date;
  lastSyncedAt: Date;
  compatibilityWarnings: string[];
  title: string;
  description: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  duration: number;
  aspectRatio: VideoTemplateAspectRatio;
  categoryId: "shotstack";
  categoryName: "Shotstack";
  tags: string[];
  badges: [];
  visibility: "system";
  status: "published";
}

export interface SyncVersionInput {
  sourceHash: string;
  sourceEdit: Record<string, unknown>;
  normalizedEditorState: Record<string, unknown>;
  compatibilityWarnings: string[];
  providerUpdatedAt?: Date;
  blueprint: Record<string, unknown>;
  slots: [];
  defaultValues: Record<string, unknown>;
  createdBy: string;
}

export interface SyncStateInput {
  provider: "shotstack";
  environment: ShotstackEnvironment;
  lastAttemptAt: Date;
  lastSuccessAt?: Date;
  status: VideoTemplateSyncStatus;
  summary: VideoTemplateSyncSummary;
}

export interface SyncRunContext {
  environment: ShotstackEnvironment;
  attemptedAt: Date;
  generation: number;
}

export interface ShotstackTemplateSyncRepository {
  findByExternalId(externalId: string): Promise<SyncTemplateRecord | null>;
  registerSuccessfulList(
    run: Omit<SyncRunContext, "generation">
  ): Promise<number>;
  isRunCurrent(run: SyncRunContext): Promise<boolean>;
  createTemplateWithVersion(
    template: SyncTemplateInput,
    version: SyncVersionInput,
    run: SyncRunContext
  ): Promise<SyncTemplateRecord | null>;
  updateTemplateMetadata(templateId: string, input: SyncTemplateInput): Promise<void>;
  createVersionAndPublish(
    templateId: string,
    template: SyncTemplateInput,
    version: SyncVersionInput
  ): Promise<"updated" | "unchanged">;
  archiveMissing(activeExternalIds: string[], lastSyncedAt: Date): Promise<number>;
  recordSyncState(input: SyncStateInput): Promise<void>;
}

export interface SyncDependencies {
  client?: SyncClient;
  repository?: ShotstackTemplateSyncRepository;
  converter?: (edit: ShotstackEdit) => ShotstackConversionResult;
  environment?: ShotstackEnvironment;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalDate(value: unknown): Date | undefined {
  if (!nonEmptyString(value) && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

function sourceHash(edit: ShotstackEdit): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(edit)))
    .digest("hex");
}

function providerEdit(template: ShotstackTemplate): ShotstackEdit {
  if (isRecord(template.edit)) return structuredClone(template.edit) as ShotstackEdit;
  const edit = structuredClone(template) as Record<string, unknown>;
  for (const metadataKey of [
    "id",
    "name",
    "created",
    "createdAt",
    "updated",
    "updatedAt",
    "thumbnail",
    "thumbnailUrl",
    "preview",
    "previewUrl",
    "previewVideoUrl",
  ]) {
    delete edit[metadataKey];
  }
  return edit as unknown as ShotstackEdit;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (nonEmptyString(record[key])) return record[key].trim();
  }
  return undefined;
}

function buildInputs(
  summary: ShotstackTemplateSummary,
  detail: ShotstackTemplate,
  conversion: ShotstackConversionResult,
  edit: ShotstackEdit,
  hash: string,
  actorId: string,
  syncedAt: Date
): { template: SyncTemplateInput; version: SyncVersionInput } {
  const detailRecord = detail as Record<string, unknown>;
  const project = conversion.project;
  const firstVisual = project.items.find((item) => (
    (item.type === "video" || item.type === "image")
    && nonEmptyString(item.sourceUrl)
  ));
  const firstVisualUrl = firstVisual && nonEmptyString(firstVisual.sourceUrl)
    ? firstVisual.sourceUrl.trim()
    : undefined;
  const dedicatedThumbnail = firstString(detailRecord, [
    "thumbnailUrl",
    "thumbnail",
    "previewImageUrl",
    "posterUrl",
  ]);
  const dedicatedPreview = firstString(detailRecord, [
    "previewVideoUrl",
    "previewUrl",
    "preview",
  ]);
  const title = firstString(detailRecord, ["name"])
    || (nonEmptyString(summary.name) ? summary.name.trim() : undefined);
  if (!title) throw new Error("Shotstack template name is required.");
  const providerCreatedAt = optionalDate(detail.createdAt ?? detail.created);
  const providerUpdatedAt = optionalDate(detail.updatedAt ?? detail.updated);
  const normalizedEditorState = structuredClone(project) as unknown as Record<string, unknown>;
  const sourceEdit = structuredClone(edit) as unknown as Record<string, unknown>;
  const duration = typeof project.settings.duration === "number"
    && Number.isFinite(project.settings.duration)
    ? Math.max(1, project.settings.duration)
    : 1;

  return {
    template: {
      sourceProvider: "shotstack",
      externalTemplateId: summary.id,
      sourceHash: hash,
      providerCreatedAt,
      providerUpdatedAt,
      lastSyncedAt: syncedAt,
      compatibilityWarnings: [...conversion.warnings],
      title,
      description: "",
      thumbnailUrl: dedicatedThumbnail || firstVisualUrl || dedicatedPreview || "",
      previewVideoUrl: dedicatedPreview
        || (firstVisual?.type === "video" ? firstVisualUrl : undefined),
      duration,
      aspectRatio: project.settings.aspectRatio as VideoTemplateAspectRatio,
      categoryId: "shotstack",
      categoryName: "Shotstack",
      tags: [],
      badges: [],
      visibility: "system",
      status: "published",
    },
    version: {
      sourceHash: hash,
      sourceEdit,
      normalizedEditorState,
      compatibilityWarnings: [...conversion.warnings],
      providerUpdatedAt,
      blueprint: structuredClone(normalizedEditorState),
      slots: [],
      defaultValues: {},
      createdBy: actorId,
    },
  };
}

function environmentWithoutCredentials(): ShotstackEnvironment {
  return process.env.SHOTSTACK_ENV?.trim() === "v1" ? "v1" : "stage";
}

class MongooseShotstackTemplateSyncRepository implements ShotstackTemplateSyncRepository {
  async findByExternalId(externalId: string): Promise<SyncTemplateRecord | null> {
    const template = await VideoTemplateModel.findOne({
      sourceProvider: "shotstack",
      externalTemplateId: externalId,
    }).lean();
    if (!template) return null;
    const publishedVersion = template.publishedVersionId
      ? await VideoTemplateVersionModel.findById(template.publishedVersionId)
        .select({ sourceHash: 1 })
        .lean()
      : null;
    return {
      id: String(template._id),
      sourceProvider: "shotstack",
      externalTemplateId: externalId,
      sourceHash: publishedVersion?.sourceHash,
      status: template.status,
      publishedVersionId: template.publishedVersionId
        ? String(template.publishedVersionId)
        : undefined,
    };
  }

  async registerSuccessfulList(
    run: Omit<SyncRunContext, "generation">
  ): Promise<number> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const state = await VideoTemplateSyncModel.findOneAndUpdate(
          { provider: "shotstack", environment: run.environment },
          {
            $inc: { latestSuccessfulListGeneration: 1 },
            $max: {
              latestSuccessfulListAt: run.attemptedAt,
              lastAttemptAt: run.attemptedAt,
            },
            $setOnInsert: {
              status: "partial",
              summary: emptySummary(),
            },
          },
          { upsert: true, new: true }
        ).select({ latestSuccessfulListGeneration: 1 }).lean();
        const generation = state?.latestSuccessfulListGeneration;
        if (!Number.isSafeInteger(generation) || generation < 1) {
          throw new Error("Shotstack run generation was invalid.");
        }
        return generation;
      } catch {
        if (attempt === 2) throw new Error("Shotstack run generation could not be recorded.");
      }
    }
    throw new Error("Shotstack run generation could not be recorded.");
  }

  async isRunCurrent(run: SyncRunContext): Promise<boolean> {
    const state = await VideoTemplateSyncModel.findOne({
      provider: "shotstack",
      environment: run.environment,
    }).select({ latestSuccessfulListGeneration: 1 }).lean();
    return state?.latestSuccessfulListGeneration === run.generation;
  }

  async createTemplateWithVersion(
    templateInput: SyncTemplateInput,
    versionInput: SyncVersionInput,
    run: SyncRunContext
  ): Promise<SyncTemplateRecord | null> {
    const session = await mongoose.startSession();
    let created: SyncTemplateRecord | undefined;
    let stale = false;
    try {
      await session.withTransaction(async () => {
        created = undefined;
        stale = false;
        const gate = await VideoTemplateSyncModel.updateOne(
          {
            provider: "shotstack",
            environment: run.environment,
            latestSuccessfulListGeneration: run.generation,
          },
          { $set: { mutationFenceAt: run.attemptedAt } },
          { session }
        );
        if (gate.matchedCount === 0) {
          stale = true;
          return;
        }
        const [template] = await VideoTemplateModel.create(
          [{ ...templateInput, usageCount: 0 }],
          { session }
        );
        const [version] = await VideoTemplateVersionModel.create(
          [{ ...versionInput, templateId: template._id, version: 1 }],
          { session }
        );
        await VideoTemplateModel.updateOne(
          { _id: template._id },
          { $set: { publishedVersionId: version._id, status: "published" } },
          { session }
        );
        created = {
          id: String(template._id),
          sourceProvider: "shotstack",
          externalTemplateId: templateInput.externalTemplateId,
          sourceHash: templateInput.sourceHash,
          status: "published",
          publishedVersionId: String(version._id),
        };
      });
    } finally {
      await session.endSession();
    }
    if (stale) return null;
    if (!created) throw new Error("Shotstack template transaction did not complete.");
    return created;
  }

  async updateTemplateMetadata(templateId: string, input: SyncTemplateInput): Promise<void> {
    await VideoTemplateModel.updateOne(
      {
        _id: templateId,
        $or: [
          { lastSyncedAt: { $exists: false } },
          { lastSyncedAt: { $lte: input.lastSyncedAt } },
        ],
      },
      { $set: input }
    );
  }

  async createVersionAndPublish(
    templateId: string,
    templateInput: SyncTemplateInput,
    versionInput: SyncVersionInput
  ): Promise<"updated" | "unchanged"> {
    const session = await mongoose.startSession();
    let outcome: "updated" | "unchanged" | undefined;
    try {
      await session.withTransaction(async () => {
        outcome = undefined;
        const currentTemplate = await VideoTemplateModel.findById(templateId)
          .session(session)
          .lean();
        if (!currentTemplate) {
          throw new Error("Synchronized Shotstack template no longer exists.");
        }
        if (
          currentTemplate.lastSyncedAt
          && currentTemplate.lastSyncedAt.getTime() > templateInput.lastSyncedAt.getTime()
        ) {
          outcome = "unchanged";
          return;
        }
        const currentVersion = currentTemplate.publishedVersionId
          ? await VideoTemplateVersionModel.findById(currentTemplate.publishedVersionId)
            .select({ sourceHash: 1 })
            .session(session)
            .lean()
          : null;
        if (currentVersion?.sourceHash === versionInput.sourceHash) {
          await VideoTemplateModel.updateOne(
            { _id: templateId },
            { $set: templateInput },
            { session }
          );
          outcome = "unchanged";
          return;
        }
        const latest = await VideoTemplateVersionModel.findOne({ templateId })
          .sort({ version: -1 })
          .session(session)
          .lean();
        const [version] = await VideoTemplateVersionModel.create(
          [{
            ...versionInput,
            templateId,
            version: (latest?.version || 0) + 1,
          }],
          { session }
        );
        await VideoTemplateModel.updateOne(
          { _id: templateId },
          { $set: { ...templateInput, publishedVersionId: version._id } },
          { session }
        );
        outcome = "updated";
      });
    } finally {
      await session.endSession();
    }
    if (!outcome) throw new Error("Shotstack version transaction did not complete.");
    return outcome;
  }

  async archiveMissing(activeExternalIds: string[], lastSyncedAt: Date): Promise<number> {
    const result = await VideoTemplateModel.updateMany(
      {
        sourceProvider: "shotstack",
        externalTemplateId: { $nin: activeExternalIds },
        status: { $ne: "archived" },
        $or: [
          { lastSyncedAt: { $exists: false } },
          { lastSyncedAt: { $lte: lastSyncedAt } },
        ],
      },
      { $set: { status: "archived", lastSyncedAt } }
    );
    return result.modifiedCount;
  }

  async recordSyncState(input: SyncStateInput): Promise<void> {
    const update: Record<string, unknown> = {
      provider: input.provider,
      environment: input.environment,
      lastAttemptAt: input.lastAttemptAt,
      status: input.status,
      summary: input.summary,
    };
    if (input.lastSuccessAt) update.lastSuccessAt = input.lastSuccessAt;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await VideoTemplateSyncModel.updateOne(
        {
          provider: input.provider,
          environment: input.environment,
          $or: [
            { lastAttemptAt: { $exists: false } },
            { lastAttemptAt: { $lte: input.lastAttemptAt } },
          ],
        },
        { $set: update }
      );
      if (result.matchedCount > 0) return;

      const existing = await VideoTemplateSyncModel.findOne({
        provider: input.provider,
        environment: input.environment,
      }).select({ lastAttemptAt: 1 }).lean();
      if (existing && existing.lastAttemptAt.getTime() > input.lastAttemptAt.getTime()) {
        return;
      }
      try {
        await VideoTemplateSyncModel.create(input);
        return;
      } catch {
        if (attempt === 2) throw new Error("Shotstack sync-state write failed.");
      }
    }
  }
}

function emptySummary(): VideoTemplateSyncSummary {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failed: [],
  };
}

export class ShotstackSyncStateError extends Error {
  constructor() {
    super("Shotstack synchronization state could not be recorded.");
    this.name = "ShotstackSyncStateError";
  }
}

async function recordState(
  repository: ShotstackTemplateSyncRepository,
  input: SyncStateInput
): Promise<void> {
  try {
    await repository.recordSyncState(input);
  } catch {
    throw new ShotstackSyncStateError();
  }
}

export async function synchronizeShotstackTemplates(
  actorId: string,
  dependencies: SyncDependencies = {}
): Promise<VideoTemplateSyncSummary> {
  const attemptedAt = (dependencies.now || (() => new Date()))();
  const repository = dependencies.repository || new MongooseShotstackTemplateSyncRepository();
  const converter = dependencies.converter || shotstackEditToEditorProject;
  let environment = dependencies.environment || environmentWithoutCredentials();
  let client = dependencies.client;

  if (!client) {
    try {
      const config = getShotstackConfig();
      environment = config.environment;
      client = new ShotstackClient(config);
    } catch {
      const summary = emptySummary();
      summary.failed.push({ externalId: "shotstack", message: LIST_FAILURE_MESSAGE });
      await recordState(repository, {
        provider: "shotstack",
        environment,
        lastAttemptAt: attemptedAt,
        status: "failed",
        summary,
      });
      return summary;
    }
  }

  let listed: ShotstackTemplateSummary[];
  try {
    listed = await client.listTemplates();
  } catch {
    const summary = emptySummary();
    summary.failed.push({ externalId: "shotstack", message: LIST_FAILURE_MESSAGE });
    await recordState(repository, {
      provider: "shotstack",
      environment,
      lastAttemptAt: attemptedAt,
      status: "failed",
      summary,
    });
    return summary;
  }

  if (
    !Array.isArray(listed)
    || listed.some((summary) => !isRecord(summary) || !nonEmptyString(summary.id))
  ) {
    const summary = emptySummary();
    summary.failed.push({ externalId: "shotstack", message: LIST_FAILURE_MESSAGE });
    await recordState(repository, {
      provider: "shotstack",
      environment,
      lastAttemptAt: attemptedAt,
      status: "failed",
      summary,
    });
    return summary;
  }

  const uniqueSummaries = [...new Map(
    listed.map((summary) => [summary.id, summary])
  ).values()];
  let generation: number;
  try {
    generation = await repository.registerSuccessfulList({ environment, attemptedAt });
  } catch {
    throw new ShotstackSyncStateError();
  }
  const run = { environment, attemptedAt, generation };
  const activeExternalIds = uniqueSummaries.map((summary) => summary.id);
  const summary = emptySummary();
  let cursor = 0;

  const synchronizeExisting = async (
    existing: SyncTemplateRecord,
    inputs: { template: SyncTemplateInput; version: SyncVersionInput }
  ) => {
    if (existing.sourceHash === inputs.template.sourceHash) {
      await repository.updateTemplateMetadata(existing.id, inputs.template);
      summary.unchanged += 1;
      return;
    }
    let outcome: "updated" | "unchanged";
    try {
      outcome = await repository.createVersionAndPublish(
        existing.id,
        inputs.template,
        inputs.version
      );
    } catch {
      const refreshed = await repository.findByExternalId(inputs.template.externalTemplateId);
      if (!refreshed) throw new Error("Shotstack version update failed.");
      if (refreshed.sourceHash === inputs.template.sourceHash) {
        await repository.updateTemplateMetadata(refreshed.id, inputs.template);
        outcome = "unchanged";
      } else {
        outcome = await repository.createVersionAndPublish(
          refreshed.id,
          inputs.template,
          inputs.version
        );
      }
    }
    summary[outcome] += 1;
  };

  const synchronizeOne = async (listedTemplate: ShotstackTemplateSummary) => {
    try {
      const detail = await client.getTemplate(listedTemplate.id);
      if (!(await repository.isRunCurrent(run))) return;
      const edit = providerEdit(detail);
      const conversion = converter(edit);
      const hash = sourceHash(edit);
      const inputs = buildInputs(
        listedTemplate,
        detail,
        conversion,
        edit,
        hash,
        actorId,
        attemptedAt
      );
      const existing = await repository.findByExternalId(listedTemplate.id);
      if (!existing) {
        try {
          const created = await repository.createTemplateWithVersion(
            inputs.template,
            inputs.version,
            run
          );
          if (!created) return;
          summary.created += 1;
        } catch {
          if (!(await repository.isRunCurrent(run))) return;
          const concurrentlyCreated = await repository.findByExternalId(listedTemplate.id);
          if (!concurrentlyCreated) throw new Error("Shotstack template import failed.");
          await synchronizeExisting(concurrentlyCreated, inputs);
        }
      } else {
        await synchronizeExisting(existing, inputs);
      }
    } catch {
      summary.failed.push({
        externalId: listedTemplate.id,
        message: ITEM_FAILURE_MESSAGE,
      });
    }
  };

  const workers = Array.from(
    { length: Math.min(DETAIL_CONCURRENCY, uniqueSummaries.length) },
    async () => {
      while (cursor < uniqueSummaries.length) {
        const current = uniqueSummaries[cursor++];
        await synchronizeOne(current);
      }
    }
  );
  await Promise.all(workers);

  try {
    if (await repository.isRunCurrent(run)) {
      summary.archived = await repository.archiveMissing(activeExternalIds, attemptedAt);
    }
  } catch {
    summary.failed.push({ externalId: "shotstack", message: ITEM_FAILURE_MESSAGE });
  }

  const status = summary.failed.length > 0 ? "partial" : "success";
  await recordState(repository, {
    provider: "shotstack",
    environment,
    lastAttemptAt: attemptedAt,
    ...(status === "success" ? { lastSuccessAt: attemptedAt } : {}),
    status,
    summary,
  });
  return summary;
}
