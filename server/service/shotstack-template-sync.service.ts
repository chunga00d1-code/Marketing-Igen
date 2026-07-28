import { createHash, randomUUID } from "node:crypto";
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
import { requestVideoTemplatePreview } from "./video-template-preview.service";
import { reconcileActiveShotstackRenders } from "./shotstack-render.service";

const DETAIL_CONCURRENCY = 3;
const SYNC_LEASE_DURATION_MS = 30 * 60 * 1000;
const ITEM_FAILURE_MESSAGE = "Shotstack template could not be synchronized.";
const LIST_FAILURE_MESSAGE = "Shotstack template catalogue is temporarily unavailable.";

type SyncClient = Pick<ShotstackClient, "listTemplates" | "getTemplate">;

export interface SyncTemplateRecord {
  id: string;
  sourceProvider: "shotstack";
  externalTemplateId: string;
  sourceHash?: string;
  lastSyncGeneration?: number;
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
  ownerToken: string;
}

export interface SyncLeaseInput {
  environment: ShotstackEnvironment;
  ownerToken: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface ShotstackTemplateSyncRepository {
  acquireSyncLease(input: SyncLeaseInput): Promise<boolean>;
  releaseSyncLease(
    environment: ShotstackEnvironment,
    ownerToken: string
  ): Promise<void>;
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
  updateTemplateMetadata(
    templateId: string,
    input: SyncTemplateInput,
    run: SyncRunContext
  ): Promise<boolean>;
  createVersionAndPublish(
    templateId: string,
    template: SyncTemplateInput,
    version: SyncVersionInput,
    run: SyncRunContext
  ): Promise<"updated" | "unchanged" | null>;
  archiveMissing(
    activeExternalIds: string[],
    lastSyncedAt: Date,
    run: SyncRunContext
  ): Promise<number>;
  recordSyncState(input: SyncStateInput): Promise<void>;
}

export interface SyncDependencies {
  client?: SyncClient;
  repository?: ShotstackTemplateSyncRepository;
  converter?: (edit: ShotstackEdit, durationHint?: number) => ShotstackConversionResult;
  environment?: ShotstackEnvironment;
  now?: () => Date;
  requestPreview?: typeof requestVideoTemplatePreview;
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

function sourceHash(edit: ShotstackEdit, durationHint?: number): string {
  const versionSource = durationHint === undefined
    ? edit
    : { edit, providerDurationHint: durationHint };
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(versionSource)))
    .digest("hex");
}

function providerEdit(template: ShotstackTemplate): ShotstackEdit {
  if (isRecord(template.edit)) return structuredClone(template.edit) as ShotstackEdit;
  if (isRecord(template.template)) {
    return structuredClone(template.template) as ShotstackEdit;
  }
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

function providerDurationHint(detail: ShotstackTemplate): number | undefined {
  const detailRecord = detail as Record<string, unknown>;
  const records = [
    detailRecord,
    isRecord(detailRecord.metadata) ? detailRecord.metadata : undefined,
    isRecord(detailRecord.output) ? detailRecord.output : undefined,
    isRecord(detailRecord.template) ? detailRecord.template : undefined,
  ];
  const candidates = records
    .map((record) => record?.duration)
    .filter((value): value is number => (
      typeof value === "number"
      && Number.isFinite(value)
      && value > 0
    ));
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

const RASTER_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif", "svg"]);

function resolveTemplateThumbnailUrl(
  title: string,
  dedicatedThumbnail?: string,
  firstVisualUrl?: string,
  dedicatedPreview?: string
): string {
  for (const candidate of [dedicatedThumbnail, firstVisualUrl, dedicatedPreview]) {
    if (!candidate?.trim()) continue;
    const url = candidate.trim();
    const ext = url.split(".").pop()?.toLowerCase().split("?")[0] || "";
    if (RASTER_IMAGE_EXTENSIONS.has(ext)) {
      return url;
    }
  }

  for (const candidate of [dedicatedPreview, dedicatedThumbnail, firstVisualUrl]) {
    if (candidate && candidate.includes("res.cloudinary.com")) {
      return candidate
        .replace(/\/video\/upload\/(v\d+\/)?/, "/video/upload/so_5,f_jpg/")
        .replace(/\.mp4$/i, ".jpg");
    }
  }

  const colors = [
    ["#4f46e5", "#06b6d4"],
    ["#0f172a", "#0891b2"],
    ["#7c3aed", "#ec4899"],
    ["#059669", "#0e7490"],
    ["#ea580c", "#ca8a04"],
  ];
  const charSum = title.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const [c1, c2] = colors[Math.abs(charSum) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><rect y="500" width="600" height="300" fill="#020617" opacity="0.65"/><text x="40" y="680" fill="white" font-family="system-ui, sans-serif" font-size="40" font-weight="bold">${title}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

  const thumbnailUrl = resolveTemplateThumbnailUrl(
    title,
    dedicatedThumbnail,
    firstVisualUrl,
    dedicatedPreview
  );

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
      thumbnailUrl,
      previewVideoUrl: undefined,
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

export class MongooseShotstackTemplateSyncRepository implements ShotstackTemplateSyncRepository {
  async acquireSyncLease(input: SyncLeaseInput): Promise<boolean> {
    try {
      const state = await VideoTemplateSyncModel.findOneAndUpdate(
        {
          provider: "shotstack",
          environment: input.environment,
          $or: [
            { leaseOwnerToken: { $exists: false } },
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: input.acquiredAt } },
          ],
        },
        {
          $set: {
            leaseOwnerToken: input.ownerToken,
            leaseExpiresAt: input.expiresAt,
          },
          $setOnInsert: {
            lastAttemptAt: input.acquiredAt,
            status: "partial",
            summary: emptySummary(),
          },
        },
        { upsert: true, new: true }
      ).select({ _id: 1 }).lean();
      return Boolean(state);
    } catch (error: unknown) {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === 11000
      ) {
        return false;
      }
      throw error;
    }
  }

  async releaseSyncLease(
    environment: ShotstackEnvironment,
    ownerToken: string
  ): Promise<void> {
    await VideoTemplateSyncModel.updateOne(
      {
        provider: "shotstack",
        environment,
        leaseOwnerToken: ownerToken,
      },
      {
        $unset: {
          leaseOwnerToken: "",
          leaseExpiresAt: "",
        },
      }
    );
  }

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
      lastSyncGeneration: template.lastSyncGeneration,
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
          {
            provider: "shotstack",
            environment: run.environment,
            leaseOwnerToken: run.ownerToken,
          },
          {
            $inc: { latestSuccessfulListGeneration: 1 },
            $max: {
              latestSuccessfulListAt: run.attemptedAt,
              lastAttemptAt: run.attemptedAt,
            },
          },
          { new: true }
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
      leaseOwnerToken: run.ownerToken,
      latestSuccessfulListGeneration: run.generation,
    }).select({ latestSuccessfulListGeneration: 1 }).lean();
    return Boolean(state);
  }

  private async mutationGate(
    run: SyncRunContext,
    session: mongoose.ClientSession
  ): Promise<boolean> {
    const gate = await VideoTemplateSyncModel.updateOne(
      {
        provider: "shotstack",
        environment: run.environment,
        leaseOwnerToken: run.ownerToken,
        latestSuccessfulListGeneration: run.generation,
      },
      {
        $set: { mutationFenceAt: run.attemptedAt },
        $inc: { mutationFenceSequence: 1 },
      },
      { session }
    );
    return gate.matchedCount > 0;
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
        if (!(await this.mutationGate(run, session))) {
          stale = true;
          return;
        }
        const [template] = await VideoTemplateModel.create(
          [{
            ...templateInput,
            usageCount: 0,
            lastSyncGeneration: run.generation,
          }],
          { session }
        );
        const [version] = await VideoTemplateVersionModel.create(
          [{ ...versionInput, templateId: template._id, version: 1 }],
          { session }
        );
        const published = await VideoTemplateModel.updateOne(
          {
            _id: template._id,
            lastSyncGeneration: { $lte: run.generation },
          },
          {
            $set: {
              publishedVersionId: version._id,
              status: "published",
              lastSyncGeneration: run.generation,
            },
          },
          { session }
        );
        if (published.matchedCount === 0) {
          throw new Error("Shotstack template creation was fenced.");
        }
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

  async updateTemplateMetadata(
    templateId: string,
    input: SyncTemplateInput,
    run: SyncRunContext
  ): Promise<boolean> {
    const session = await mongoose.startSession();
    let updated: boolean | undefined;
    try {
      await session.withTransaction(async () => {
        updated = undefined;
        if (!(await this.mutationGate(run, session))) {
          updated = false;
          return;
        }
        const updateData: Record<string, unknown> = {
          ...input,
          lastSyncGeneration: run.generation,
        };
        if (input.previewVideoUrl === undefined) {
          delete updateData.previewVideoUrl;
        }
        const result = await VideoTemplateModel.updateOne(
          {
            _id: templateId,
            $or: [
              { lastSyncGeneration: { $exists: false } },
              { lastSyncGeneration: { $lte: run.generation } },
            ],
          },
          {
            $set: updateData,
          },
          { session }
        );
        updated = result.matchedCount > 0;
      });
    } finally {
      await session.endSession();
    }
    if (updated === undefined) {
      throw new Error("Shotstack metadata transaction did not complete.");
    }
    return updated;
  }

  async createVersionAndPublish(
    templateId: string,
    templateInput: SyncTemplateInput,
    versionInput: SyncVersionInput,
    run: SyncRunContext
  ): Promise<"updated" | "unchanged" | null> {
    const session = await mongoose.startSession();
    let outcome: "updated" | "unchanged" | null | undefined;
    try {
      await session.withTransaction(async () => {
        outcome = undefined;
        if (!(await this.mutationGate(run, session))) {
          outcome = null;
          return;
        }
        const updateData: Record<string, unknown> = {
          ...templateInput,
          lastSyncGeneration: run.generation,
        };
        if (templateInput.previewVideoUrl === undefined) {
          delete updateData.previewVideoUrl;
        }
        const currentTemplate = await VideoTemplateModel.findOneAndUpdate(
          {
            _id: templateId,
            $or: [
              { lastSyncGeneration: { $exists: false } },
              { lastSyncGeneration: { $lte: run.generation } },
            ],
          },
          {
            $set: updateData,
          },
          { new: true, session }
        )
          .lean();
        if (!currentTemplate) {
          outcome = null;
          return;
        }
        const currentVersion = currentTemplate.publishedVersionId
          ? await VideoTemplateVersionModel.findById(currentTemplate.publishedVersionId)
            .select({ sourceHash: 1 })
            .session(session)
            .lean()
          : null;
        if (currentVersion?.sourceHash === versionInput.sourceHash) {
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
        const published = await VideoTemplateModel.updateOne(
          {
            _id: templateId,
            lastSyncGeneration: { $lte: run.generation },
          },
          {
            $set: {
              ...updateData,
              publishedVersionId: version._id,
              lastSyncGeneration: run.generation,
            },
          },
          { session }
        );
        if (published.matchedCount === 0) {
          throw new Error("Shotstack version publication was fenced.");
        }
        outcome = "updated";
      });
    } finally {
      await session.endSession();
    }
    if (outcome === undefined) throw new Error("Shotstack version transaction did not complete.");
    return outcome;
  }

  async archiveMissing(
    activeExternalIds: string[],
    lastSyncedAt: Date,
    run: SyncRunContext
  ): Promise<number> {
    const session = await mongoose.startSession();
    let archived: number | undefined;
    try {
      await session.withTransaction(async () => {
        archived = undefined;
        if (!(await this.mutationGate(run, session))) {
          archived = 0;
          return;
        }
        const absentTemplateFilter = {
          sourceProvider: "shotstack" as const,
          externalTemplateId: { $nin: activeExternalIds },
          $or: [
            { lastSyncGeneration: { $exists: false } },
            { lastSyncGeneration: { $lte: run.generation } },
          ],
        };
        const newlyArchived = await VideoTemplateModel.updateMany(
          {
            ...absentTemplateFilter,
            status: { $ne: "archived" },
          },
          {
            $set: {
              status: "archived",
              lastSyncedAt,
              lastSyncGeneration: run.generation,
            },
          },
          { session }
        );
        await VideoTemplateModel.updateMany(
          {
            ...absentTemplateFilter,
            status: "archived",
          },
          {
            $set: {
              lastSyncedAt,
              lastSyncGeneration: run.generation,
            },
          },
          { session }
        );
        archived = newlyArchived.modifiedCount;
      });
    } finally {
      await session.endSession();
    }
    if (archived === undefined) {
      throw new Error("Shotstack archive transaction did not complete.");
    }
    return archived;
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
    failedCount: 0,
    failed: [],
  };
}

function addFailure(
  summary: VideoTemplateSyncSummary,
  failure: { externalId: string; message: string }
): void {
  summary.failed.push(failure);
  summary.failedCount = summary.failed.length;
}

export class ShotstackSyncStateError extends Error {
  constructor() {
    super("Shotstack synchronization state could not be recorded.");
    this.name = "ShotstackSyncStateError";
  }
}

export class ShotstackSyncBusyError extends Error {
  constructor() {
    super("Shotstack template synchronization is already in progress.");
    this.name = "ShotstackSyncBusyError";
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

async function releaseLease(
  repository: ShotstackTemplateSyncRepository,
  environment: ShotstackEnvironment,
  ownerToken: string
): Promise<void> {
  try {
    await repository.releaseSyncLease(environment, ownerToken);
  } catch {
    throw new ShotstackSyncStateError();
  }
}

export async function synchronizeShotstackTemplates(
  actorId: string,
  dependencies: SyncDependencies = {}
): Promise<VideoTemplateSyncSummary> {
  void reconcileActiveShotstackRenders().catch(() => undefined);
  const attemptedAt = (dependencies.now || (() => new Date()))();
  const repository = dependencies.repository || new MongooseShotstackTemplateSyncRepository();
  const converter = dependencies.converter || shotstackEditToEditorProject;
  let environment = dependencies.environment || environmentWithoutCredentials();
  let client = dependencies.client;
  const leaseEnvironment = environment;
  const leaseOwnerToken = randomUUID();
  let leaseAcquired = false;

  try {
    try {
      leaseAcquired = await repository.acquireSyncLease({
        environment: leaseEnvironment,
        ownerToken: leaseOwnerToken,
        acquiredAt: attemptedAt,
        expiresAt: new Date(attemptedAt.getTime() + SYNC_LEASE_DURATION_MS),
      });
    } catch {
      throw new ShotstackSyncStateError();
    }
    if (!leaseAcquired) throw new ShotstackSyncBusyError();

    if (!client) {
    try {
      const config = getShotstackConfig();
      environment = config.environment;
      client = new ShotstackClient(config);
    } catch {
      const summary = emptySummary();
      addFailure(summary, { externalId: "shotstack", message: LIST_FAILURE_MESSAGE });
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
    addFailure(summary, { externalId: "shotstack", message: LIST_FAILURE_MESSAGE });
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
    addFailure(summary, { externalId: "shotstack", message: LIST_FAILURE_MESSAGE });
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
    generation = await repository.registerSuccessfulList({
      environment,
      attemptedAt,
      ownerToken: leaseOwnerToken,
    });
  } catch {
    throw new ShotstackSyncStateError();
  }
  const run = {
    environment,
    attemptedAt,
    generation,
    ownerToken: leaseOwnerToken,
  };
  const activeExternalIds = uniqueSummaries.map((summary) => summary.id);
  const summary = emptySummary();
  let cursor = 0;

  const requestPreview = dependencies.requestPreview || requestVideoTemplatePreview;
  const triggerPreview = async (
    record: SyncTemplateRecord | null,
    inputs: { template: SyncTemplateInput; version: SyncVersionInput }
  ) => {
    if (!record || !record.publishedVersionId) return;
    try {
      await requestPreview({
        templateId: record.id,
        templateVersionId: record.publishedVersionId,
        sourceHash: inputs.version.sourceHash,
        title: inputs.template.title,
        aspectRatio: inputs.template.aspectRatio,
        duration: inputs.template.duration,
        normalizedEditorState: inputs.version.normalizedEditorState,
        sourceEdit: inputs.version.sourceEdit,
      });
    } catch {
      // Best-effort preview scheduling must not fail catalogue sync
    }
  };

  const synchronizeExisting = async (
    existing: SyncTemplateRecord,
    inputs: { template: SyncTemplateInput; version: SyncVersionInput }
  ) => {
    if (existing.sourceHash === inputs.template.sourceHash) {
      const refreshed = await repository.updateTemplateMetadata(
        existing.id,
        inputs.template,
        run
      );
      if (!refreshed) return;
      summary.unchanged += 1;
      await triggerPreview(existing, inputs);
      return;
    }
    let outcome: "updated" | "unchanged" | null;
    try {
      outcome = await repository.createVersionAndPublish(
        existing.id,
        inputs.template,
        inputs.version,
        run
      );
    } catch {
      const refreshed = await repository.findByExternalId(inputs.template.externalTemplateId);
      if (!refreshed) throw new Error("Shotstack version update failed.");
      if (refreshed.sourceHash === inputs.template.sourceHash) {
        const updated = await repository.updateTemplateMetadata(
          refreshed.id,
          inputs.template,
          run
        );
        outcome = updated ? "unchanged" : null;
      } else {
        outcome = await repository.createVersionAndPublish(
          refreshed.id,
          inputs.template,
          inputs.version,
          run
        );
      }
    }
    if (!outcome) return;
    summary[outcome] += 1;
    const latestRecord = await repository.findByExternalId(inputs.template.externalTemplateId);
    await triggerPreview(latestRecord || existing, inputs);
  };

  const synchronizeOne = async (listedTemplate: ShotstackTemplateSummary) => {
    try {
      const detail = await client.getTemplate(listedTemplate.id);
      if (!(await repository.isRunCurrent(run))) return;
      const edit = providerEdit(detail);
      const durationHint = providerDurationHint(detail);
      const conversion = converter(edit, durationHint);
      const hash = sourceHash(edit, durationHint);
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
          await triggerPreview(created, inputs);
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
      addFailure(summary, {
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
      summary.archived = await repository.archiveMissing(
        activeExternalIds,
        attemptedAt,
        run
      );
    }
  } catch {
    addFailure(summary, { externalId: "shotstack", message: ITEM_FAILURE_MESSAGE });
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
  } finally {
    if (leaseAcquired) {
      await releaseLease(repository, leaseEnvironment, leaseOwnerToken);
    }
  }
}
