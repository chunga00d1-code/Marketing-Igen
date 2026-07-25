import { CompanyModel } from "../model/company.model";
import { UserModel } from "../model/user.model";
import {
  SpeechTranscriptionProvider,
} from "../../shared/video-caption.contract";
import { VideoCaptionError } from "./video-caption-error";
import { createHash } from "crypto";

const ELEVENLABS_STT_URL =
  "https://api.elevenlabs.io/v1/speech-to-text";
const ELEVENLABS_STT_MODEL =
  process.env.VIDEO_CAPTION_STT_MODEL?.trim() || "scribe_v2";

type ElevenLabsWord = {
  text?: string;
  start?: number;
  end?: number;
  type?: "word" | "spacing" | "audio_event";
  logprob?: number;
};

type ElevenLabsTranscript = {
  language_code?: string;
  text?: string;
  words?: ElevenLabsWord[];
};

type ElevenLabsWebhookResponse = {
  request_id?: string;
};

type ElevenLabsKeySource = "user" | "company" | "env" | "missing";

function logStt(event: string, data: Record<string, unknown>) {
  console.info(`[Video Caption STT] ${event}`, JSON.stringify(data));
}

function keyFingerprint(apiKey: string) {
  return apiKey
    ? createHash("sha256").update(apiKey).digest("hex").slice(0, 10)
    : "missing";
}

function providerErrorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as {
    detail?:
      | string
      | { message?: string; status?: string }
      | Array<{ msg?: string }>;
    message?: string;
  };
  if (Array.isArray(value.detail)) {
    return value.detail.map((item) => item.msg).filter(Boolean).join("; ");
  }
  if (typeof value.detail === "string") return value.detail;
  if (value.detail && typeof value.detail === "object") {
    return value.detail.message || value.detail.status;
  }
  return value.message;
}

export async function resolveElevenLabsApiKey(userId: string): Promise<{
  apiKey: string;
  source: ElevenLabsKeySource;
}> {
  const user = await UserModel.findById(userId)
    .select("elevenlabsAccess companyCode")
    .lean();
  const userKey = user?.elevenlabsAccess?.apiKey?.trim();
  if (userKey) return { apiKey: userKey, source: "user" };

  if (user?.companyCode && user.companyCode !== "SYSTEM") {
    const company = await CompanyModel.findOne({
      code: user.companyCode.toUpperCase(),
    })
      .select("elevenlabsConfig")
      .lean();
    const companyKey = company?.elevenlabsConfig?.apiKey?.trim();
    if (companyKey) return { apiKey: companyKey, source: "company" };
  }

  const environmentKey = process.env.ELEVENLABS_API_KEY?.trim() || "";
  return {
    apiKey: environmentKey,
    source: environmentKey ? "env" : "missing",
  };
}

function logProbabilityToConfidence(logprob?: number) {
  if (typeof logprob !== "number" || !Number.isFinite(logprob)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, Math.exp(logprob)));
}

export function normalizeElevenLabsTranscript(
  transcript: ElevenLabsTranscript
) {
  return {
    language: transcript.language_code,
    words: (transcript.words || [])
      .filter(
        (word) =>
          word.type === "word" &&
          typeof word.start === "number" &&
          typeof word.end === "number" &&
          Boolean(word.text?.trim())
      )
      .map((word) => ({
        text: String(word.text).trim(),
        startMs: Math.max(0, Math.round(Number(word.start) * 1000)),
        endMs: Math.max(1, Math.round(Number(word.end) * 1000)),
        confidence: logProbabilityToConfidence(word.logprob),
      })),
    cost: undefined,
  };
}

class ElevenLabsSpeechTranscriptionProvider
  implements SpeechTranscriptionProvider
{
  readonly name = "elevenlabs";

  constructor(
    private readonly userId: string
  ) {}

  async start(input: {
    videoUrl: string;
    language?: string;
    idempotencyKey: string;
    webhookMetadata: Record<string, string>;
  }) {
    const { apiKey, source: keySource } =
      await resolveElevenLabsApiKey(this.userId);
    const fingerprint = keyFingerprint(apiKey);
    logStt("key_resolved", {
      userId: this.userId,
      keySource,
      keyFingerprint: fingerprint,
      keyLength: apiKey.length,
    });
    if (!apiKey) {
      throw new VideoCaptionError(
        "Chưa cấu hình ElevenLabs API key cho tài khoản hoặc doanh nghiệp.",
        "ELEVENLABS_API_KEY_REQUIRED",
        "authentication",
        false,
        422
      );
    }

    const body = new FormData();
    body.append("source_url", input.videoUrl);
    body.append("model_id", ELEVENLABS_STT_MODEL);
    body.append("timestamps_granularity", "word");
    body.append("tag_audio_events", "false");
    body.append("diarize", "false");
    body.append("no_verbatim", "true");
    body.append("webhook", "true");
    body.append(
      "webhook_metadata",
      JSON.stringify(input.webhookMetadata)
    );
    const webhookId = process.env.ELEVENLABS_STT_WEBHOOK_ID?.trim();
    if (webhookId) body.append("webhook_id", webhookId);
    if (input.language) body.append("language_code", input.language);

    const startedAt = Date.now();
    logStt("request_started", {
      jobId: input.webhookMetadata.jobId,
      projectId: input.webhookMetadata.projectId,
      companyCode: input.webhookMetadata.companyCode,
      model: ELEVENLABS_STT_MODEL,
      language: input.language || "auto",
      sourceHost: new URL(input.videoUrl).hostname,
      webhookIdConfigured: Boolean(webhookId),
      keySource,
      keyFingerprint: fingerprint,
    });
    let response: Response;
    try {
      response = await fetch(ELEVENLABS_STT_URL, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Idempotency-Key": input.idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
    } catch (error) {
      logStt("request_network_error", {
        jobId: input.webhookMetadata.jobId,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const requestId =
      response.headers.get("request-id") ||
      response.headers.get("x-request-id") ||
      undefined;
    const payload = (await response.json().catch(() => ({}))) as
      | ElevenLabsWebhookResponse
      | {
          detail?:
            | string
            | { message?: string; status?: string }
            | Array<{ msg?: string }>;
          message?: string;
        };

    const errorDetail = providerErrorDetail(payload);
    logStt("response_received", {
      jobId: input.webhookMetadata.jobId,
      status: response.status,
      ok: response.ok,
      requestId: requestId || null,
      elapsedMs: Date.now() - startedAt,
      providerError: response.ok ? null : errorDetail || null,
      keySource,
      keyFingerprint: fingerprint,
    });

    if (!response.ok) {
      throw new VideoCaptionError(
        errorDetail || `ElevenLabs STT trả về HTTP ${response.status}.`,
        `ELEVENLABS_STT_${response.status}`,
        response.status === 401 || response.status === 403
          ? "authentication"
          : response.status === 429 || response.status >= 500
            ? "transient"
            : "provider",
        response.status === 429 || response.status >= 500,
        response.status === 429 ? 429 : 502
      );
    }

    const providerRequestId =
      (payload as ElevenLabsWebhookResponse).request_id || requestId;
    if (!providerRequestId) {
      throw new VideoCaptionError(
        "ElevenLabs không trả về mã tác vụ transcription.",
        "ELEVENLABS_STT_REQUEST_ID_MISSING",
        "provider",
        false,
        502
      );
    }
    logStt("request_accepted", {
      jobId: input.webhookMetadata.jobId,
      providerRequestId,
      elapsedMs: Date.now() - startedAt,
    });
    return { providerRequestId };
  }

  async retrieve(providerRequestId: string) {
    const { apiKey, source: keySource } =
      await resolveElevenLabsApiKey(this.userId);
    if (!apiKey) {
      throw new VideoCaptionError(
        "Chưa cấu hình ElevenLabs API key cho tài khoản hoặc doanh nghiệp.",
        "ELEVENLABS_API_KEY_REQUIRED",
        "authentication",
        false,
        422
      );
    }
    const startedAt = Date.now();
    const response = await fetch(
      `${ELEVENLABS_STT_URL}/transcripts/${encodeURIComponent(providerRequestId)}`,
      {
        headers: { "xi-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (response.status === 404 || response.status === 422) {
      logStt("reconcile_pending", {
        providerRequestId,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        keySource,
        keyFingerprint: keyFingerprint(apiKey),
      });
      return null;
    }
    const payload = (await response.json().catch(() => ({}))) as
      | ElevenLabsTranscript
      | { detail?: string; message?: string };
    if (!response.ok) {
      const detail =
        providerErrorDetail(payload) ||
        `ElevenLabs STT trả về HTTP ${response.status}.`;
      logStt("reconcile_failed", {
        providerRequestId,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        providerError: detail,
        keySource,
        keyFingerprint: keyFingerprint(apiKey),
      });
      throw new VideoCaptionError(
        String(detail),
        `ELEVENLABS_STT_${response.status}`,
        response.status === 401 || response.status === 403
          ? "authentication"
          : response.status === 429 || response.status >= 500
            ? "transient"
            : "provider",
        response.status === 429 || response.status >= 500,
        response.status === 429 ? 429 : 502
      );
    }
    const transcript = normalizeElevenLabsTranscript(
      payload as ElevenLabsTranscript
    );
    logStt("reconcile_completed", {
      providerRequestId,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      language: transcript.language || null,
      wordCount: transcript.words.length,
    });
    return transcript;
  }
}

export function createSpeechTranscriptionProvider(userId: string) {
  return new ElevenLabsSpeechTranscriptionProvider(userId);
}

export const videoCaptionTranscriptionConfig = {
  provider: "elevenlabs",
  model: ELEVENLABS_STT_MODEL,
};
