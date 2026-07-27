import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { SpeechTranscriptionProvider } from "../../shared/video-caption.contract";
import { VideoCaptionError } from "./video-caption-error";
import { resolveMediaBinary } from "./media-binary.service";

const API_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
const MODEL = process.env.OPENROUTER_CAPTION_STT_MODEL?.trim() || "openai/whisper-large-v3";
const DEFAULT_LANGUAGE = process.env.OPENROUTER_CAPTION_STT_DEFAULT_LANGUAGE?.trim() || "vi";
const MAX_AUDIO_BYTES = Math.max(1_000_000, Number(process.env.OPENROUTER_CAPTION_STT_MAX_AUDIO_BYTES) || 20_000_000);
const AUDIO_TIMEOUT_MS = 10 * 60 * 1000;
const TIMING_VERSION = "word-timebase-v2";

type OpenRouterTranscript = {
  language?: string;
  text?: string;
  id?: string;
  request_id?: string;
  duration?: number;
  usage?: { cost?: number };
  words?: Array<{ word?: string; start?: number; end?: number; probability?: number }>;
  segments?: Array<{ text?: string; start?: number; end?: number; avg_logprob?: number }>;
};

function logStt(event: string, data: Record<string, unknown>) {
  console.info("[Video Caption STT] " + event, JSON.stringify(data));
}

function parseResponsePayload(rawBody: string): unknown {
  if (!rawBody) return {};
  try { return JSON.parse(rawBody) as unknown; }
  catch { return { message: rawBody.slice(0, 1000) }; }
}

function providerErrorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { error?: string | { message?: string }; detail?: string | { message?: string; status?: string }; message?: string };
  if (typeof value.error === "string") return value.error;
  if (value.error && typeof value.error === "object") return value.error.message;
  if (typeof value.detail === "string") return value.detail;
  if (value.detail && typeof value.detail === "object") return value.detail.message || value.detail.status;
  return value.message;
}

function normalizeLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase();
  if (normalized === "vietnamese") return "vi";
  if (normalized === "english") return "en";
  return normalized || undefined;
}

export function normalizeOpenRouterTranscript(transcript: OpenRouterTranscript) {
  const timedWords = (transcript.words || [])
    .filter((word) => typeof word.start === "number" && typeof word.end === "number" && word.end > word.start && Boolean(word.word?.trim()))
    .map((word) => ({
      text: String(word.word).trim(),
      startMs: Math.max(0, Math.round(word.start! * 1000)),
      endMs: Math.max(1, Math.round(word.end! * 1000)),
      confidence: typeof word.probability === "number" && Number.isFinite(word.probability) ? Math.max(0, Math.min(1, word.probability)) : undefined,
    }));
  return {
    language: normalizeLanguage(transcript.language),
    durationMs:
      typeof transcript.duration === "number" &&
      Number.isFinite(transcript.duration) &&
      transcript.duration > 0
        ? Math.round(transcript.duration * 1000)
        : undefined,
    // Do not manufacture word timings from phrase-level segments. A uniform
    // distribution can be many seconds away from the spoken audio. The caller
    // turns an empty word list into a retryable, actionable provider error.
    words: timedWords,
    cost: typeof transcript.usage?.cost === "number" && Number.isFinite(transcript.usage.cost) ? transcript.usage.cost : undefined,
  };
}

async function extractAudio(videoUrl: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "video-caption-stt-"));
  const audioPath = path.join(directory, "audio.mp3");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        resolveMediaBinary("ffmpeg", process.env.VIDEO_CAPTION_FFMPEG_PATH),
        [
          "-y",
          "-nostdin",
          "-i",
          videoUrl,
          "-map",
          "0:a:0",
          "-vn",
          "-af",
          "aresample=async=1:first_pts=0",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "48k",
          "-avoid_negative_ts",
          "make_zero",
          audioPath,
        ],
        { shell: false, windowsHide: true }
      );
      let settled = false;
      let hasStderr = false;
      const complete = (error?: VideoCaptionError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve();
      };
      const timeout = setTimeout(() => {
        child.kill();
        complete(new VideoCaptionError("Hết thời gian trích âm thanh từ video.", "OPENROUTER_STT_AUDIO_EXTRACTION_TIMEOUT", "transient", true, 504));
      }, AUDIO_TIMEOUT_MS);
      timeout.unref();
      child.stderr.on("data", () => { hasStderr = true; });
      child.on("error", (error: NodeJS.ErrnoException) => complete(new VideoCaptionError(
        error.code === "ENOENT" ? "Máy chủ chưa cài ffmpeg để trích âm thanh cho phụ đề." : "Không thể khởi chạy ffmpeg để trích âm thanh.",
        "OPENROUTER_STT_AUDIO_EXTRACTION_UNAVAILABLE", "provider", error.code !== "ENOENT", 503
      )));
      child.on("close", (code) => {
        if (code === 0) return complete();
        logStt("audio_extraction_failed", { code, hasStderr });
        complete(new VideoCaptionError("Không thể trích âm thanh từ video. Hãy kiểm tra video có audio hợp lệ.", "OPENROUTER_STT_AUDIO_EXTRACTION_FAILED", "provider", false, 422));
      });
    });
    const audio = await fs.readFile(audioPath);
    if (!audio.length) throw new VideoCaptionError("Video không có dữ liệu âm thanh để tạo phụ đề.", "OPENROUTER_STT_AUDIO_EMPTY", "validation", false, 422);
    if (audio.length > MAX_AUDIO_BYTES) throw new VideoCaptionError("Âm thanh video vượt quá giới hạn gửi đến dịch vụ phụ đề.", "OPENROUTER_STT_AUDIO_TOO_LARGE", "budget", false, 422);
    return audio;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

class OpenRouterSpeechTranscriptionProvider implements SpeechTranscriptionProvider {
  readonly name = "openrouter";

  async start(input: Parameters<SpeechTranscriptionProvider["start"]>[0]): ReturnType<SpeechTranscriptionProvider["start"]> {
    if (input.delivery !== "direct") throw new VideoCaptionError("OpenRouter STT hiện chỉ hỗ trợ xử lý trực tiếp trong luồng caption.", "OPENROUTER_STT_WEBHOOK_UNSUPPORTED", "provider", false, 422);
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
    if (!apiKey) throw new VideoCaptionError("Chưa cấu hình OPENROUTER_API_KEY cho dịch vụ nhận diện giọng nói.", "OPENROUTER_STT_API_KEY_REQUIRED", "authentication", false, 422);

    const language = input.language?.trim() || DEFAULT_LANGUAGE;
    const startedAt = Date.now();
    logStt("request_started", { jobId: input.webhookMetadata.jobId, projectId: input.webhookMetadata.projectId, companyCode: input.webhookMetadata.companyCode, provider: "openrouter", model: MODEL, language, delivery: "direct", keySource: "env" });
    const audio = await extractAudio(input.videoUrl);
    const requestBody = JSON.stringify({
      model: MODEL,
      input_audio: { data: audio.toString("base64"), format: "mp3" },
      ...(language === "auto" ? {} : { language }),
      temperature: 0,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    let response: Response;
    try {
      response = await fetch(API_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "https://igen-erp.app", "X-Title": "Igen ERP", "Idempotency-Key": input.idempotencyKey }, body: requestBody, signal: AbortSignal.timeout(30 * 60 * 1000) });
    } catch (error) {
      logStt("request_network_error", { jobId: input.webhookMetadata.jobId, elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
      throw new VideoCaptionError("Không thể kết nối tới dịch vụ nhận diện giọng nói.", "OPENROUTER_STT_NETWORK_ERROR", "transient", true, 502);
    }
    const payload = parseResponsePayload(await response.text()) as OpenRouterTranscript;
    const providerRequestId = response.headers.get("x-request-id") || payload.request_id || payload.id || undefined;
    const errorDetail = providerErrorDetail(payload);
    logStt("response_received", { jobId: input.webhookMetadata.jobId, status: response.status, ok: response.ok, elapsedMs: Date.now() - startedAt, providerRequestId: providerRequestId || null, providerError: response.ok ? null : errorDetail || null, keySource: "env" });
    if (!response.ok) {
      const isAuthentication = response.status === 401 || response.status === 403;
      const isBudget = response.status === 402;
      const isTransient = response.status === 429 || response.status >= 500;
      throw new VideoCaptionError(errorDetail || `OpenRouter STT trả về HTTP ${response.status}.`, `OPENROUTER_STT_${response.status}`, isAuthentication ? "authentication" : isBudget ? "budget" : isTransient ? "transient" : "provider", isTransient, response.status === 429 ? 429 : isBudget ? 402 : 502);
    }
    const transcription = normalizeOpenRouterTranscript(payload);
    if (
      !transcription.words.length &&
      (Boolean(payload.text?.trim()) || Boolean(payload.segments?.length))
    ) {
      throw new VideoCaptionError(
        "OpenRouter đã trả transcript nhưng không có timestamp từng từ để dựng timeline phụ đề.",
        "OPENROUTER_STT_TIMESTAMPS_MISSING",
        "provider",
        false,
        502
      );
    }
    logStt("direct_completed", {
      jobId: input.webhookMetadata.jobId,
      elapsedMs: Date.now() - startedAt,
      language: transcription.language || null,
      segmentCount: transcription.words.length,
      providerDurationMs: transcription.durationMs || null,
      audioBytes: audio.length,
      cost: transcription.cost || null,
    });
    return { delivery: "direct", providerRequestId, transcription };
  }
}

export function createSpeechTranscriptionProvider(_userId: string) {
  return new OpenRouterSpeechTranscriptionProvider();
}

export function getVideoCaptionTranscriptionDelivery(_durationMs?: number): "direct" | "webhook" {
  return "direct";
}

export const videoCaptionTranscriptionConfig = {
  provider: "openrouter",
  model: MODEL,
  maxAudioBytes: MAX_AUDIO_BYTES,
  timingVersion: TIMING_VERSION,
};
