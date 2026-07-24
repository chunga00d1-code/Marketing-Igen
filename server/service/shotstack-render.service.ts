import { randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type {
  VideoProjectRenderEngine,
  VideoProjectRenderSnapshot,
  VideoProjectRenderStatus,
  VideoProjectRenderSubmissionState,
} from "../interface/video-project-render.interface";
import { editorProjectToShotstackEdit } from "../integration/shotstack/shotstack.converter";
import { ShotstackClient } from "../integration/shotstack/shotstack.client";
import type {
  ShotstackEdit,
  ShotstackRenderStatus,
} from "../integration/shotstack/shotstack.types";
import { VideoProjectRenderModel } from "../model/video-project-render.model";
import { cloudinaryService } from "./cloudinary.service";

const ACTIVE_STATUSES: VideoProjectRenderStatus[] = ["rendering", "uploading"];
const TERMINAL_STATUSES: VideoProjectRenderStatus[] = ["completed", "failed"];
const POLL_LEASE_MS = 5_000;
const MAX_POLL_BACKOFF_MS = 30_000;
const TRANSFER_LEASE_MS = 15 * 60_000;
const CLOUDINARY_RENDER_FOLDER = "igen_erp/marketing/video";
const MAX_OUTPUT_REDIRECTS = 3;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const OUTPUT_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const PROVIDER_ID_PERSIST_ATTEMPTS = 3;
const SUBMISSION_ATTEMPT_STALE_MS = 2 * 60_000;
const SHOTSTACK_OUTPUT_HOSTS = new Set([
  "cdn.shotstack.io",
  "shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com",
  "shotstack-api-v1-output.s3-ap-southeast-2.amazonaws.com",
]);

export type ShotstackRenderRecord = {
  _id: string;
  status: VideoProjectRenderStatus;
  snapshot: VideoProjectRenderSnapshot;
  progress: number;
  engine?: VideoProjectRenderEngine;
  attempt: number;
  transferAttempt: number;
  providerRenderId?: string;
  providerSubmissionState?: VideoProjectRenderSubmissionState;
  providerSubmissionAttemptId?: string;
  providerSubmissionStartedAt?: Date;
  providerSubmissionUnknownAt?: Date;
  providerStatus?: string;
  providerOutputUrl?: string;
  providerPollAttempt?: number;
  providerLastCheckedAt?: Date;
  providerNextPollAt?: Date;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  transferLeaseOwner?: string;
  transferLeaseUntil?: Date;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  stageMessage?: string;
};

export interface ShotstackRenderRepository {
  claimForSubmission(
    renderId: string,
    attemptId: string,
    now: Date
  ): Promise<ShotstackRenderRecord | null>;
  persistProviderSubmission(
    renderId: string,
    attemptId: string,
    providerRenderId: string,
    providerStatus: string
  ): Promise<boolean>;
  markSubmissionUncertain(
    renderId: string,
    attemptId: string,
    patch: Partial<ShotstackRenderRecord>
  ): Promise<boolean>;
  findById(renderId: string): Promise<ShotstackRenderRecord | null>;
  findByProviderRenderId(providerRenderId: string): Promise<ShotstackRenderRecord | null>;
  claimProviderPoll(
    renderId: string,
    now: Date,
    leaseUntil: Date
  ): Promise<ShotstackRenderRecord | null>;
  recordProviderProgress(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ): Promise<ShotstackRenderRecord | null>;
  recordProviderCompletion(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ): Promise<ShotstackRenderRecord | null>;
  recordProviderFailure(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ): Promise<boolean>;
  recordPollFailure(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ): Promise<boolean>;
  claimTransfer(
    renderId: string,
    leaseOwner: string,
    now: Date,
    leaseUntil: Date
  ): Promise<ShotstackRenderRecord | null>;
  completeTransfer(
    renderId: string,
    leaseOwner: string,
    outputUrl: string,
    completedAt: Date
  ): Promise<boolean>;
  recordTransferFailure(
    renderId: string,
    leaseOwner: string,
    patch: Partial<ShotstackRenderRecord>
  ): Promise<boolean>;
}

type ShotstackRenderClient = Pick<ShotstackClient, "renderEdit" | "getRender">;

type ShotstackRenderDependencies = {
  repository?: ShotstackRenderRepository;
  client?: ShotstackRenderClient;
  converter?: (
    snapshot: VideoProjectRenderSnapshot,
    sourceEdit?: ShotstackEdit
  ) => ShotstackEdit;
  uploadMedia?: (url: string, folder: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  getEnvironment?: () => NodeJS.ProcessEnv;
  now?: () => Date;
};

type WebhookPayload = {
  id: string;
  status: string;
  url?: string;
  error?: string;
  code?: string;
};

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function toRenderRecord(value: unknown): ShotstackRenderRecord | null {
  const record = toRecord(value);
  if (!record) return null;
  const snapshot = toRecord(record.snapshot);
  if (!snapshot) return null;
  return {
    ...record,
    _id: String(record._id),
    status: record.status as VideoProjectRenderStatus,
    snapshot: snapshot as unknown as VideoProjectRenderSnapshot,
    progress: Number(record.progress || 0),
    attempt: Number(record.attempt || 0),
    transferAttempt: Number(record.transferAttempt || 0),
    providerPollAttempt: Number(record.providerPollAttempt || 0),
    providerSubmissionStartedAt: asDate(record.providerSubmissionStartedAt),
    providerSubmissionUnknownAt: asDate(record.providerSubmissionUnknownAt),
    providerLastCheckedAt: asDate(record.providerLastCheckedAt),
    providerNextPollAt: asDate(record.providerNextPollAt),
    transferLeaseUntil: asDate(record.transferLeaseUntil),
    startedAt: asDate(record.startedAt),
    completedAt: asDate(record.completedAt),
  } as ShotstackRenderRecord;
}

export class MongooseShotstackRenderRepository implements ShotstackRenderRepository {
  async claimForSubmission(renderId: string, attemptId: string, now: Date) {
    const render = await VideoProjectRenderModel.findOneAndUpdate(
      {
        _id: renderId,
        status: "queued",
        providerRenderId: { $exists: false },
      },
      {
        $set: {
          status: "rendering",
          engine: "shotstack",
          providerSubmissionState: "attempting",
          providerSubmissionAttemptId: attemptId,
          providerSubmissionStartedAt: now,
          startedAt: now,
          stageMessage: "Submitting video render.",
        },
        $inc: { attempt: 1 },
        $max: { progress: 1 },
      },
      { new: true }
    ).lean();
    return toRenderRecord(render);
  }

  async persistProviderSubmission(
    renderId: string,
    attemptId: string,
    providerRenderId: string,
    providerStatus: string
  ) {
    const result = await VideoProjectRenderModel.updateOne(
      {
        _id: renderId,
        status: "rendering",
        providerSubmissionState: "attempting",
        providerSubmissionAttemptId: attemptId,
        providerRenderId: { $exists: false },
      },
      {
        $set: {
          providerRenderId,
          providerSubmissionState: "confirmed",
          providerStatus,
          stageMessage: "Video render is processing.",
        },
        $max: { progress: 5 },
      }
    );
    return result.matchedCount === 1;
  }

  async markSubmissionUncertain(
    renderId: string,
    attemptId: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    const result = await VideoProjectRenderModel.updateOne(
      {
        _id: renderId,
        status: "rendering",
        providerSubmissionState: "attempting",
        providerSubmissionAttemptId: attemptId,
        providerRenderId: { $exists: false },
      },
      { $set: patch }
    );
    return result.matchedCount === 1;
  }

  async findById(renderId: string) {
    return toRenderRecord(await VideoProjectRenderModel.findById(renderId).lean());
  }

  async findByProviderRenderId(providerRenderId: string) {
    return toRenderRecord(
      await VideoProjectRenderModel.findOne({ providerRenderId }).lean()
    );
  }

  async claimProviderPoll(renderId: string, now: Date, leaseUntil: Date) {
    const render = await VideoProjectRenderModel.findOneAndUpdate(
      {
        _id: renderId,
        status: { $in: ACTIVE_STATUSES },
        providerRenderId: { $type: "string" },
        $or: [
          { providerNextPollAt: { $exists: false } },
          { providerNextPollAt: { $lte: now } },
        ],
      },
      {
        $set: { providerNextPollAt: leaseUntil },
      },
      { new: true }
    ).lean();
    return toRenderRecord(render);
  }

  async recordProviderProgress(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    const render = await VideoProjectRenderModel.findOneAndUpdate(
      { _id: renderId, status: "rendering" },
      { $set: patch },
      { new: true }
    ).lean();
    return toRenderRecord(render);
  }

  async recordProviderCompletion(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    const render = await VideoProjectRenderModel.findOneAndUpdate(
      { _id: renderId, status: { $in: ACTIVE_STATUSES } },
      { $set: { ...patch, status: "uploading" } },
      { new: true }
    ).lean();
    return toRenderRecord(render);
  }

  async recordProviderFailure(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    const result = await VideoProjectRenderModel.updateOne(
      { _id: renderId, status: "rendering" },
      { $set: { ...patch, status: "failed" } }
    );
    return result.matchedCount === 1;
  }

  async recordPollFailure(
    renderId: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    const result = await VideoProjectRenderModel.updateOne(
      { _id: renderId, status: "rendering" },
      { $set: patch }
    );
    return result.matchedCount === 1;
  }

  async claimTransfer(
    renderId: string,
    leaseOwner: string,
    now: Date,
    leaseUntil: Date
  ) {
    const render = await VideoProjectRenderModel.findOneAndUpdate(
      {
        _id: renderId,
        status: "uploading",
        providerOutputUrl: { $type: "string" },
        $or: [
          { transferLeaseUntil: { $exists: false } },
          { transferLeaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "uploading",
          stageMessage: "Transferring rendered video.",
          transferLeaseOwner: leaseOwner,
          transferLeaseUntil: leaseUntil,
        },
        $inc: { transferAttempt: 1 },
        $max: { progress: 85 },
      },
      { new: true }
    ).lean();
    return toRenderRecord(render);
  }

  async completeTransfer(
    renderId: string,
    leaseOwner: string,
    outputUrl: string,
    completedAt: Date
  ) {
    const result = await VideoProjectRenderModel.updateOne(
      {
        _id: renderId,
        status: "uploading",
        transferLeaseOwner: leaseOwner,
      },
      {
        $set: {
          status: "completed",
          progress: 100,
          stageMessage: "Video render completed.",
          outputUrl,
          completedAt,
        },
        $unset: {
          errorCode: "",
          errorMessage: "",
          providerErrorCode: "",
          providerErrorMessage: "",
          transferLeaseOwner: "",
          transferLeaseUntil: "",
        },
      }
    );
    return result.matchedCount === 1;
  }

  async recordTransferFailure(
    renderId: string,
    leaseOwner: string,
    patch: Partial<ShotstackRenderRecord>
  ) {
    const result = await VideoProjectRenderModel.updateOne(
      {
        _id: renderId,
        status: "uploading",
        transferLeaseOwner: leaseOwner,
      },
      { $set: patch }
    );
    return result.matchedCount === 1;
  }
}

export function getVideoTemplateRenderEngine(
  environment: Readonly<Record<string, string | undefined>> = process.env
): "shotstack" | "remotion" {
  return environment.VIDEO_TEMPLATE_RENDER_ENGINE === "remotion"
    ? "remotion"
    : "shotstack";
}

function isSafeWebhookSecret(secret: string | undefined): secret is string {
  return Boolean(secret && /^[A-Za-z0-9_-]{16,256}$/.test(secret));
}

export function buildShotstackCallbackUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const configuredUrl = environment.SHOTSTACK_WEBHOOK_URL?.trim();
  const secret = environment.SHOTSTACK_WEBHOOK_SECRET?.trim();
  if (!configuredUrl || !isSafeWebhookSecret(secret)) return undefined;
  try {
    const callbackBase = new URL(configuredUrl);
    if (callbackBase.protocol !== "https:") return undefined;
    callbackBase.pathname = `${callbackBase.pathname.replace(/\/+$/, "")}/${secret}`;
    return callbackBase.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function exactSecretMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function diagnosticMessage(value: unknown, environment: NodeJS.ProcessEnv): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let message = value.split(/[\r\n]+/)[0].trim().slice(0, 500);
  const apiKey = environment.SHOTSTACK_API_KEY?.trim();
  if (apiKey) message = message.split(apiKey).join("[REDACTED]");
  return message;
}

function diagnosticCode(value: unknown, environment: NodeJS.ProcessEnv): string | undefined {
  return diagnosticMessage(value, environment)?.slice(0, 100);
}

function normalizeProviderStatus(status: string): string {
  return status.trim().toLowerCase();
}

function parsedHttpsUrl(value: string, label: string): URL {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new Error(`${label} is not safe.`);
    }
    return url;
  } catch {
    throw new Error(`${label} is not safe.`);
  }
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateIpLiteral(hostname: string): boolean {
  if (!isIP(hostname)) return false;
  if (hostname.includes(":")) {
    const normalized = hostname.toLowerCase();
    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb");
  }
  const octets = hostname.split(".").map(Number);
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] === 0;
}

export function validateShotstackOutputUrl(value: string): string {
  const url = parsedHttpsUrl(value, "Shotstack output URL");
  const hostname = normalizedHostname(url);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateIpLiteral(hostname) ||
    !SHOTSTACK_OUTPUT_HOSTS.has(hostname)
  ) {
    throw new Error("Shotstack output URL is not safe.");
  }
  return url.toString();
}

export function validateCloudinaryOutputUrl(
  value: string,
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  const cloudName = environment.CLOUDINARY_CLOUD_NAME?.trim();
  const url = parsedHttpsUrl(value, "Cloudinary output URL");
  if (!cloudName || normalizedHostname(url) !== "res.cloudinary.com") {
    throw new Error("Cloudinary output URL is not application-controlled.");
  }
  let firstPathSegment: string;
  try {
    firstPathSegment = decodeURIComponent(url.pathname.split("/")[1] || "");
  } catch {
    throw new Error("Cloudinary output URL is not application-controlled.");
  }
  if (firstPathSegment !== cloudName) {
    throw new Error("Cloudinary output URL is not application-controlled.");
  }
  return url.toString();
}

export async function fetchShotstackOutput(
  inputUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<Buffer> {
  let currentUrl = validateShotstackOutputUrl(inputUrl);
  for (let redirectCount = 0; redirectCount <= MAX_OUTPUT_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(OUTPUT_DOWNLOAD_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === MAX_OUTPUT_REDIRECTS) {
        throw new Error("Shotstack output redirected too many times.");
      }
      const location = response.headers.get("location");
      if (!location) throw new Error("Shotstack output redirect is invalid.");
      currentUrl = validateShotstackOutputUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(`Shotstack output download failed with HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_OUTPUT_BYTES) {
      throw new Error("Shotstack output exceeds the transfer limit.");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_OUTPUT_BYTES) {
      throw new Error("Shotstack output exceeds the transfer limit.");
    }
    return buffer;
  }
  throw new Error("Shotstack output redirect is invalid.");
}

function providerProgress(status: string): number {
  if (["queued", "waiting", "fetching"].includes(status)) return 10;
  if (["rendering", "processing", "saving"].includes(status)) return 50;
  return 5;
}

function isProviderFailure(status: string): boolean {
  return ["failed", "error", "cancelled", "canceled"].includes(status);
}

function isProviderCompletion(status: string): boolean {
  return ["done", "completed", "complete"].includes(status);
}

function pollBackoff(attempt: number): number {
  return Math.min(MAX_POLL_BACKOFF_MS, 2_000 * (2 ** Math.min(attempt, 4)));
}

function isAbandonedSubmissionAttempt(
  render: ShotstackRenderRecord,
  currentTime: Date
): boolean {
  return !render.providerSubmissionStartedAt
    || render.providerSubmissionStartedAt.getTime()
      <= currentTime.getTime() - SUBMISSION_ATTEMPT_STALE_MS;
}

function webhookPayload(payload: unknown): WebhookPayload | undefined {
  const outer = toRecord(payload);
  if (!outer) return undefined;
  const nested = toRecord(outer.data) || toRecord(outer.response);
  const record = nested || outer;
  const id = record.id ?? record.renderId;
  const status = record.status ?? record.action;
  if (typeof id !== "string" || !id.trim() || typeof status !== "string" || !status.trim()) {
    return undefined;
  }
  const url = record.url ?? record.outputUrl;
  const error = record.error ?? record.message;
  const code = record.code ?? record.errorCode;
  return {
    id: id.trim(),
    status: status.trim(),
    ...(typeof url === "string" && url.trim() ? { url: url.trim() } : {}),
    ...(typeof error === "string" && error.trim() ? { error: error.trim() } : {}),
    ...(typeof code === "string" && code.trim() ? { code: code.trim() } : {}),
  };
}

export class ShotstackWebhookError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 503,
    message: string
  ) {
    super(message);
    this.name = "ShotstackWebhookError";
  }
}

export function createShotstackRenderService(
  dependencies: ShotstackRenderDependencies = {}
) {
  const repository = dependencies.repository || new MongooseShotstackRenderRepository();
  const converter = dependencies.converter || editorProjectToShotstackEdit;
  const getEnvironment = dependencies.getEnvironment || (() => process.env);
  const now = dependencies.now || (() => new Date());
  const getClient = () => dependencies.client || new ShotstackClient();
  const uploadMedia = dependencies.uploadMedia || (async (url: string, folder: string) => {
    const output = await fetchShotstackOutput(url, dependencies.fetchImpl);
    return cloudinaryService.uploadMediaBuffer(output, folder);
  });

  const recordFailure = async (
    renderId: string,
    providerStatus: string,
    error?: unknown,
    code?: unknown
  ) => {
    const environment = getEnvironment();
    await repository.recordProviderFailure(renderId, {
      providerStatus,
      providerErrorCode: diagnosticCode(code, environment),
      providerErrorMessage: diagnosticMessage(error, environment),
      stageMessage: "Video render failed.",
      errorCode: "VIDEO_PROJECT_RENDER_FAILED",
      errorMessage: "Video rendering failed.",
      completedAt: now(),
    });
  };

  const markSubmissionUncertain = async (
    renderId: string,
    attemptId: string,
    error: unknown
  ) => {
    const environment = getEnvironment();
    await repository.markSubmissionUncertain(renderId, attemptId, {
      status: "failed",
      providerSubmissionState: "uncertain",
      providerSubmissionUnknownAt: now(),
      providerStatus: "submission_uncertain",
      providerErrorCode: "SHOTSTACK_SUBMISSION_UNCERTAIN",
      providerErrorMessage: diagnosticMessage(error, environment),
      stageMessage: "Render submission needs manual retry.",
      errorCode: "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN",
      errorMessage: "Render submission is uncertain. Start a new render manually.",
      completedAt: now(),
    });
  };

  const transferProviderOutput = async (renderId: string) => {
    const currentTime = now();
    const leaseOwner = randomUUID();
    const claimed = await repository.claimTransfer(
      renderId,
      leaseOwner,
      currentTime,
      new Date(currentTime.getTime() + TRANSFER_LEASE_MS)
    );
    if (!claimed?.providerOutputUrl) return;
    try {
      const uploadedUrl = await uploadMedia(
        claimed.providerOutputUrl,
        CLOUDINARY_RENDER_FOLDER
      );
      const outputUrl = validateCloudinaryOutputUrl(uploadedUrl, getEnvironment());
      await repository.completeTransfer(
        renderId,
        leaseOwner,
        outputUrl,
        now()
      );
    } catch (error: unknown) {
      const environment = getEnvironment();
      const retryAt = new Date(now().getTime() + pollBackoff(claimed.transferAttempt));
      await repository.recordTransferFailure(renderId, leaseOwner, {
        status: "uploading",
        stageMessage: "Rendered video transfer will retry.",
        transferLeaseUntil: retryAt,
        providerErrorCode: "CLOUDINARY_TRANSFER_FAILED",
        providerErrorMessage: diagnosticMessage(error, environment),
      });
    }
  };

  const applyProviderStatus = async (
    render: ShotstackRenderRecord,
    provider: WebhookPayload | ShotstackRenderStatus
  ) => {
    if (TERMINAL_STATUSES.includes(render.status)) return;
    const status = normalizeProviderStatus(provider.status);
    const environment = getEnvironment();
    const providerUrl = typeof provider.url === "string" && provider.url.trim()
      ? provider.url.trim()
      : render.providerOutputUrl;

    if (isProviderFailure(status)) {
      await recordFailure(
        render._id,
        status,
        provider.error,
        "code" in provider ? provider.code : undefined
      );
      return;
    }

    if (isProviderCompletion(status)) {
      let safeProviderUrl: string;
      try {
        safeProviderUrl = providerUrl
          ? validateShotstackOutputUrl(providerUrl)
          : "";
      } catch {
        safeProviderUrl = "";
      }
      if (!safeProviderUrl) {
        await recordFailure(
          render._id,
          status,
          "Shotstack completed without a safe output URL.",
          "SHOTSTACK_OUTPUT_INVALID"
        );
        return;
      }
      const updated = await repository.recordProviderCompletion(render._id, {
        providerStatus: status,
        providerOutputUrl: safeProviderUrl,
        providerLastCheckedAt: now(),
        providerNextPollAt: undefined,
        providerErrorCode: undefined,
        providerErrorMessage: undefined,
        progress: Math.max(85, render.progress),
        stageMessage: "Transferring rendered video.",
      });
      if (updated) await transferProviderOutput(render._id);
      return;
    }

    const attempt = (render.providerPollAttempt || 0) + 1;
    const checkedAt = now();
    await repository.recordProviderProgress(render._id, {
      providerStatus: status,
      providerPollAttempt: attempt,
      providerLastCheckedAt: checkedAt,
      providerNextPollAt: new Date(checkedAt.getTime() + pollBackoff(attempt)),
      providerErrorCode: diagnosticCode(
        "code" in provider ? provider.code : undefined,
        environment
      ),
      providerErrorMessage: diagnosticMessage(provider.error, environment),
      progress: Math.max(render.progress, providerProgress(status)),
      stageMessage: "Video render is processing.",
    });
  };

  const submitShotstackRender = async (renderId: string): Promise<void> => {
    const attemptId = randomUUID();
    const claimed = await repository.claimForSubmission(
      renderId,
      attemptId,
      now()
    );
    if (!claimed) {
      const existing = await repository.findById(renderId);
      if (
        existing?.status === "rendering" &&
        existing.providerSubmissionState === "attempting" &&
        existing.providerSubmissionAttemptId &&
        !existing.providerRenderId &&
        isAbandonedSubmissionAttempt(existing, now())
      ) {
        await markSubmissionUncertain(
          renderId,
          existing.providerSubmissionAttemptId,
          "A previous Shotstack submission attempt ended without a confirmed render ID."
        );
      }
      return;
    }
    try {
      const sourceEdit = toRecord(claimed.snapshot.sourceEdit) as ShotstackEdit | undefined;
      const edit = converter(claimed.snapshot, sourceEdit);
      const callback = buildShotstackCallbackUrl(getEnvironment());
      const submission = await getClient().renderEdit({
        ...edit,
        ...(callback ? { callback } : {}),
      });
      let persisted = false;
      let persistenceError: unknown;
      for (let persistAttempt = 0; persistAttempt < PROVIDER_ID_PERSIST_ATTEMPTS; persistAttempt += 1) {
        try {
          persisted = await repository.persistProviderSubmission(
            renderId,
            attemptId,
            submission.renderId,
            "queued"
          );
          if (persisted) break;
        } catch (error: unknown) {
          persistenceError = error;
        }
      }
      if (!persisted) {
        await markSubmissionUncertain(
          renderId,
          attemptId,
          persistenceError || "Shotstack returned an ID that could not be persisted."
        );
      }
    } catch (error: unknown) {
      await markSubmissionUncertain(renderId, attemptId, error);
    }
  };

  const reconcileShotstackRender = async (renderId: string): Promise<void> => {
    const existing = await repository.findById(renderId);
    if (!existing || TERMINAL_STATUSES.includes(existing.status)) return;
    if (
      existing.status === "rendering" &&
      existing.providerSubmissionState === "attempting" &&
      existing.providerSubmissionAttemptId &&
      !existing.providerRenderId &&
      isAbandonedSubmissionAttempt(existing, now())
    ) {
      await markSubmissionUncertain(
        renderId,
        existing.providerSubmissionAttemptId,
        "A previous Shotstack submission attempt ended without a confirmed render ID."
      );
      return;
    }
    if (existing.providerOutputUrl) {
      await transferProviderOutput(renderId);
      return;
    }
    if (!existing.providerRenderId) return;
    const currentTime = now();
    const claimed = await repository.claimProviderPoll(
      renderId,
      currentTime,
      new Date(currentTime.getTime() + POLL_LEASE_MS)
    );
    if (!claimed?.providerRenderId) return;
    try {
      const provider = await getClient().getRender(claimed.providerRenderId);
      await applyProviderStatus(claimed, provider);
    } catch (error: unknown) {
      const environment = getEnvironment();
      const attempt = (claimed.providerPollAttempt || 0) + 1;
      await repository.recordPollFailure(renderId, {
        providerPollAttempt: attempt,
        providerLastCheckedAt: now(),
        providerNextPollAt: new Date(now().getTime() + pollBackoff(attempt)),
        providerErrorMessage: diagnosticMessage(error, environment),
      });
    }
  };

  const acceptShotstackWebhook = async (
    payload: unknown,
    suppliedSecret: string
  ): Promise<void> => {
    const environment = getEnvironment();
    const configuredSecret = environment.SHOTSTACK_WEBHOOK_SECRET?.trim();
    if (!isSafeWebhookSecret(configuredSecret)) {
      throw new ShotstackWebhookError(503, "Shotstack webhook is not configured.");
    }
    if (!exactSecretMatch(suppliedSecret, configuredSecret)) {
      throw new ShotstackWebhookError(401, "Invalid Shotstack webhook secret.");
    }
    const provider = webhookPayload(payload);
    if (!provider) {
      throw new ShotstackWebhookError(400, "Invalid Shotstack webhook payload.");
    }
    const render = await repository.findByProviderRenderId(provider.id);
    if (!render) {
      throw new ShotstackWebhookError(404, "Unknown Shotstack render.");
    }
    await applyProviderStatus(render, provider);
  };

  return {
    submitShotstackRender,
    reconcileShotstackRender,
    acceptShotstackWebhook,
  };
}

export async function submitShotstackRender(renderId: string): Promise<void> {
  return createShotstackRenderService().submitShotstackRender(renderId);
}

export async function reconcileShotstackRender(renderId: string): Promise<void> {
  return createShotstackRenderService().reconcileShotstackRender(renderId);
}

export async function acceptShotstackWebhook(
  payload: unknown,
  secret: string
): Promise<void> {
  return createShotstackRenderService().acceptShotstackWebhook(payload, secret);
}
