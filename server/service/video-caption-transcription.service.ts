import { CompanyModel } from "../model/company.model";
import { UserModel } from "../model/user.model";
import {
  SpeechTranscriptionProvider,
} from "../../shared/video-caption.contract";
import { VideoCaptionError } from "./video-caption-error";

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

async function resolveElevenLabsApiKey(userId: string) {
  const user = await UserModel.findById(userId)
    .select("elevenlabsAccess companyCode")
    .lean();
  const userKey = user?.elevenlabsAccess?.apiKey?.trim();
  if (userKey) return userKey;

  if (user?.companyCode && user.companyCode !== "SYSTEM") {
    const company = await CompanyModel.findOne({
      code: user.companyCode.toUpperCase(),
    })
      .select("elevenlabsConfig")
      .lean();
    const companyKey = company?.elevenlabsConfig?.apiKey?.trim();
    if (companyKey) return companyKey;
  }

  return process.env.ELEVENLABS_API_KEY?.trim() || "";
}

function logProbabilityToConfidence(logprob?: number) {
  if (typeof logprob !== "number" || !Number.isFinite(logprob)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, Math.exp(logprob)));
}

class ElevenLabsSpeechTranscriptionProvider
  implements SpeechTranscriptionProvider
{
  readonly name = "elevenlabs";

  constructor(
    private readonly userId: string
  ) {}

  async transcribe(input: {
    videoUrl: string;
    language?: string;
    idempotencyKey: string;
  }) {
    const apiKey = await resolveElevenLabsApiKey(this.userId);
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
    if (input.language) body.append("language_code", input.language);

    const response = await fetch(ELEVENLABS_STT_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Idempotency-Key": input.idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });

    const requestId =
      response.headers.get("request-id") ||
      response.headers.get("x-request-id") ||
      undefined;
    const payload = (await response.json().catch(() => ({}))) as
      | ElevenLabsTranscript
      | { detail?: string | Array<{ msg?: string }>; message?: string };

    if (!response.ok) {
      const detail =
        "detail" in payload && Array.isArray(payload.detail)
          ? payload.detail.map((item) => item.msg).filter(Boolean).join("; ")
          : "detail" in payload
            ? payload.detail
            : "message" in payload
              ? payload.message
              : undefined;
      const detailText =
        typeof detail === "string" ? detail : undefined;
      throw new VideoCaptionError(
        detailText || `ElevenLabs STT trả về HTTP ${response.status}.`,
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

    const transcript = payload as ElevenLabsTranscript;
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
      providerRequestId: requestId,
      cost: undefined,
    };
  }
}

export function createSpeechTranscriptionProvider(userId: string) {
  return new ElevenLabsSpeechTranscriptionProvider(userId);
}

export const videoCaptionTranscriptionConfig = {
  provider: "elevenlabs",
  model: ELEVENLABS_STT_MODEL,
};
