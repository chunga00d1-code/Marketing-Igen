import { createHash } from "node:crypto";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_VOICE = "Kore";
const DEFAULT_TTS_FORMAT = "pcm" as const;
const DEFAULT_TTS_SAMPLE_RATE = 24_000;
const DEFAULT_TTS_CHANNELS = 1;
const DEFAULT_TTS_PLAYBACK_RATE = 1;
const MIN_TTS_PLAYBACK_RATE = 0.85;
const MAX_TTS_PLAYBACK_RATE = 1.2;
const NATURAL_VIETNAMESE_WORDS_PER_MINUTE = 140;
const TARGET_NARRATION_FILL_RATIO = 0.92;
const MAX_TTS_INPUT_LENGTH = 8_000;
const TTS_TIMEOUT_MS = 60_000;
const DEFAULT_TTS_CACHE_MAX_ENTRIES = 64;
const DEFAULT_TTS_CACHE_MAX_BYTES = 64 * 1024 * 1024;

type HtmlVideoTtsProvider = "openrouter" | "elevenlabs";

type HtmlVideoTtsAlignment = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
};

export type HtmlVideoTtsResult = {
  buffer: Buffer;
  provider: HtmlVideoTtsProvider;
  model: string;
  voice: string;
  format: "mp3" | "pcm";
  sampleRate?: number;
  channels?: number;
  playbackRate: number;
  durationSeconds?: number;
  alignment?: HtmlVideoTtsAlignment;
};

export type HtmlVideoTtsOptions = {
  durationSeconds?: number;
  language?: string;
};

function configuredValue(name: string, fallback: string) {
  const value = String(process.env[name] || "").trim();
  return value || fallback;
}

function isRetryableStatus(status: number) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function normalizedLanguage(value?: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isEnglishLanguage(value?: string) {
  return /(?:^|\b)(?:en|english|tieng anh)(?:\b|$)/.test(normalizedLanguage(value));
}

function narrationProfile(language?: string) {
  if (isEnglishLanguage(language)) {
    return {
      wordsPerMinute: 150,
      audioProfile: "One consistent adult native English narrator with a clear, neutral international English accent. Use natural English pronunciation and intonation with no Vietnamese-style pronunciation.",
      directorNotes: "Warm, clear, confident educational delivery for a short social video. Speak naturally at around 140-155 English words per minute. Keep articulation crisp and leave a short comfortable pause at sentence boundaries so narration follows the visual scenes.",
    };
  }
  return {
    wordsPerMinute: NATURAL_VIETNAMESE_WORDS_PER_MINUTE,
    audioProfile: "One consistent adult Vietnamese narrator with a natural native Vietnamese accent. Use neutral, standard Vietnamese pronunciation with no foreign accent and no English-style intonation.",
    directorNotes: "Warm, clear, confident and professional delivery for a short social video. Speak naturally at around 130-145 Vietnamese words per minute. Keep articulation crisp, connect phrases naturally, and leave a short comfortable pause at sentence boundaries so narration follows the visual scenes.",
  };
}

function configuredPlaybackRate(text: string, targetDurationSeconds?: number, language?: string) {
  const configuredText = String(process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED || "").trim();
  const configured = Number(configuredText);
  if (configuredText && Number.isFinite(configured)) {
    return Math.min(1.25, Math.max(MIN_TTS_PLAYBACK_RATE, configured));
  }
  if (!Number.isFinite(targetDurationSeconds) || (targetDurationSeconds || 0) <= 0) return DEFAULT_TTS_PLAYBACK_RATE;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const naturalDurationSeconds = wordCount / (narrationProfile(language).wordsPerMinute / 60);
  const targetNarrationSeconds = targetDurationSeconds! * TARGET_NARRATION_FILL_RATIO;
  const targetRate = naturalDurationSeconds / targetNarrationSeconds;
  return Math.min(MAX_TTS_PLAYBACK_RATE, Math.max(MIN_TTS_PLAYBACK_RATE, targetRate));
}

function normalizeNarrationText(input: string) {
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_INPUT_LENGTH);
}

export function trimHtmlVideoPcmSilence(
  buffer: Buffer,
  sampleRate = DEFAULT_TTS_SAMPLE_RATE,
  channels = DEFAULT_TTS_CHANNELS
) {
  const bytesPerFrame = Math.max(1, channels) * 2;
  const frameCount = Math.floor(buffer.length / bytesPerFrame);
  if (frameCount < Math.max(1, Math.floor(sampleRate * 0.05))) return buffer;

  const silenceAmplitude = 160;
  let firstSpeechFrame = -1;
  let lastSpeechFrame = -1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    let audible = false;
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = frame * bytesPerFrame + channel * 2;
      if (Math.abs(buffer.readInt16LE(offset)) >= silenceAmplitude) {
        audible = true;
        break;
      }
    }
    if (!audible) continue;
    if (firstSpeechFrame < 0) firstSpeechFrame = frame;
    lastSpeechFrame = frame;
  }
  if (firstSpeechFrame < 0 || lastSpeechFrame < firstSpeechFrame) return buffer;

  const paddingFrames = Math.floor(sampleRate * 0.08);
  const startFrame = Math.max(0, firstSpeechFrame - paddingFrames);
  const endFrame = Math.min(frameCount, lastSpeechFrame + paddingFrames + 1);
  const removedFrames = frameCount - (endFrame - startFrame);
  if (removedFrames < Math.floor(sampleRate * 0.04)) return buffer;
  return Buffer.from(buffer.subarray(startFrame * bytesPerFrame, endFrame * bytesPerFrame));
}

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function configuredProvider(): HtmlVideoTtsProvider {
  return String(process.env.HTML_VIDEO_TTS_PROVIDER || "openrouter").trim().toLowerCase() === "elevenlabs"
    ? "elevenlabs"
    : "openrouter";
}

const ttsCache = new Map<string, HtmlVideoTtsResult>();
let ttsCacheBytes = 0;

function cloneTtsResult(result: HtmlVideoTtsResult): HtmlVideoTtsResult {
  return {
    ...result,
    buffer: Buffer.from(result.buffer),
    ...(result.alignment
      ? {
          alignment: {
            characters: [...result.alignment.characters],
            characterStartTimesSeconds: [...result.alignment.characterStartTimesSeconds],
            characterEndTimesSeconds: [...result.alignment.characterEndTimesSeconds],
          },
        }
      : {}),
  };
}

function cachedTtsResult(key: string) {
  const cached = ttsCache.get(key);
  if (!cached) return undefined;
  ttsCache.delete(key);
  ttsCache.set(key, cached);
  return cloneTtsResult(cached);
}

function storeTtsResult(key: string, result: HtmlVideoTtsResult) {
  const maximumEntries = configuredPositiveInteger(
    "HTML_VIDEO_TTS_CACHE_MAX_ENTRIES",
    DEFAULT_TTS_CACHE_MAX_ENTRIES
  );
  const maximumBytes = configuredPositiveInteger(
    "HTML_VIDEO_TTS_CACHE_MAX_BYTES",
    DEFAULT_TTS_CACHE_MAX_BYTES
  );
  if (result.buffer.length > maximumBytes) return;
  const previous = ttsCache.get(key);
  if (previous) ttsCacheBytes -= previous.buffer.length;
  ttsCache.delete(key);
  ttsCache.set(key, cloneTtsResult(result));
  ttsCacheBytes += result.buffer.length;
  while (ttsCache.size > maximumEntries || ttsCacheBytes > maximumBytes) {
    const oldestKey = ttsCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = ttsCache.get(oldestKey);
    ttsCache.delete(oldestKey);
    ttsCacheBytes -= oldest?.buffer.length || 0;
  }
}

function clearTtsCache() {
  ttsCache.clear();
  ttsCacheBytes = 0;
}

function ttsCacheKey(input: {
  provider: HtmlVideoTtsProvider;
  model: string;
  voice: string;
  language?: string;
  format: "mp3" | "pcm";
  playbackRate: number;
  text: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function providerError(provider: string, response: Response, details: string) {
  const error = new Error(`${provider} TTS ${response.status}: ${details.slice(0, 800)}`) as Error & {
    status?: number;
  };
  error.status = response.status;
  return error;
}

function normalizedAlignment(value: unknown): HtmlVideoTtsAlignment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const characters = Array.isArray(record.characters)
    ? record.characters.map((character) => String(character))
    : [];
  const starts = Array.isArray(record.character_start_times_seconds)
    ? record.character_start_times_seconds.map(Number)
    : [];
  const ends = Array.isArray(record.character_end_times_seconds)
    ? record.character_end_times_seconds.map(Number)
    : [];
  if (
    characters.length === 0 ||
    starts.length !== characters.length ||
    ends.length !== characters.length ||
    starts.some((time) => !Number.isFinite(time) || time < 0) ||
    ends.some((time) => !Number.isFinite(time) || time < 0)
  ) {
    return undefined;
  }
  return {
    characters,
    characterStartTimesSeconds: starts,
    characterEndTimesSeconds: ends,
  };
}

async function generateElevenLabsTts(
  text: string,
  language?: string
): Promise<HtmlVideoTtsResult> {
  const apiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  const voice = String(process.env.ELEVENLABS_HTML_VIDEO_VOICE_ID || "").trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured for HTML video TTS.");
  if (!voice) throw new Error("ELEVENLABS_HTML_VIDEO_VOICE_ID is not configured for HTML video TTS.");
  const model = configuredValue("ELEVENLABS_HTML_VIDEO_MODEL", "eleven_flash_v2_5");
  const languageCode = isEnglishLanguage(language) ? "en" : "vi";
  const cacheKey = ttsCacheKey({
    provider: "elevenlabs",
    model,
    voice,
    language: languageCode,
    format: "mp3",
    playbackRate: 1,
    text,
  });
  const cached = cachedTtsResult(cacheKey);
  if (cached) return cached;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(
        `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: "POST",
          signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: model,
            language_code: languageCode,
            voice_settings: {
              stability: 0.55,
              similarity_boost: 0.75,
              style: 0.15,
              use_speaker_boost: true,
            },
          }),
        }
      );
      if (!response.ok) {
        throw providerError("ElevenLabs", response, await response.text());
      }
      const payload = await response.json() as Record<string, unknown>;
      const audioBase64 = String(payload.audio_base64 || "");
      const buffer = Buffer.from(audioBase64, "base64");
      if (buffer.length < 128) throw new Error("ElevenLabs TTS returned empty audio.");
      const alignment = normalizedAlignment(payload.normalized_alignment || payload.alignment);
      const durationSeconds = alignment?.characterEndTimesSeconds.at(-1);
      if (!Number.isFinite(durationSeconds) || Number(durationSeconds) <= 0) {
        throw new Error("ElevenLabs TTS did not return usable timestamps.");
      }
      const result: HtmlVideoTtsResult = {
        buffer,
        provider: "elevenlabs",
        model,
        voice,
        format: "mp3",
        playbackRate: 1,
        durationSeconds,
        ...(alignment ? { alignment } : {}),
      };
      storeTtsResult(cacheKey, result);
      return cloneTtsResult(result);
    } catch (error) {
      lastError = error;
      const status = typeof error === "object" && error !== null
        ? Number((error as { status?: unknown }).status)
        : 0;
      if (!isRetryableStatus(status) || attempt === 2) break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to generate voice from ElevenLabs.");
}

async function generateOpenRouterTts(
  text: string,
  options: HtmlVideoTtsOptions
): Promise<HtmlVideoTtsResult> {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for TTS.");
  const model = configuredValue("OPENROUTER_HTML_VIDEO_TTS_MODEL", DEFAULT_TTS_MODEL);
  const voice = configuredValue("OPENROUTER_HTML_VIDEO_TTS_VOICE", DEFAULT_TTS_VOICE);
  const responseFormat = configuredValue(
    "OPENROUTER_HTML_VIDEO_TTS_FORMAT",
    DEFAULT_TTS_FORMAT
  ) === "mp3" ? "mp3" : "pcm";
  const profile = narrationProfile(options.language);
  const playbackRate = configuredPlaybackRate(text, options.durationSeconds, options.language);
  const cacheKey = ttsCacheKey({
    provider: "openrouter",
    model,
    voice,
    language: normalizedLanguage(options.language),
    format: responseFormat,
    playbackRate,
    text,
  });
  const cached = cachedTtsResult(cacheKey);
  if (cached) return cached;
  const ttsInput = [
    "# AUDIO PROFILE",
    profile.audioProfile,
    "# DIRECTOR'S NOTES",
    profile.directorNotes + " Avoid rushing, dead air, slow lecturing, exaggerated acting, or dramatic pauses.",
    "Do not switch speakers, add sound effects, paraphrase, translate, or add any words.",
    `Read exactly this narration:\n${text}`,
  ].join("\n\n");
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
        method: "POST",
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.APP_URL || "https://igen-erp.app",
          "X-Title": "Igen ERP HTML Video",
        },
        body: JSON.stringify({
          model,
          input: ttsInput,
          voice,
          response_format: responseFormat,
          speed: playbackRate,
        }),
      });
      if (!response.ok) {
        throw providerError("OpenRouter", response, await response.text());
      }
      const providerBuffer = Buffer.from(await response.arrayBuffer());
      if (providerBuffer.length < 128) throw new Error("OpenRouter TTS returned empty audio.");
      const buffer = responseFormat === "pcm"
        ? trimHtmlVideoPcmSilence(providerBuffer, DEFAULT_TTS_SAMPLE_RATE, DEFAULT_TTS_CHANNELS)
        : providerBuffer;
      const result: HtmlVideoTtsResult = {
        buffer,
        provider: "openrouter",
        model,
        voice,
        format: responseFormat,
        ...(responseFormat === "pcm"
          ? {
              sampleRate: DEFAULT_TTS_SAMPLE_RATE,
              channels: DEFAULT_TTS_CHANNELS,
              durationSeconds: buffer.length / (DEFAULT_TTS_SAMPLE_RATE * DEFAULT_TTS_CHANNELS * 2),
            }
          : {}),
        playbackRate,
      };
      storeTtsResult(cacheKey, result);
      return cloneTtsResult(result);
    } catch (error) {
      lastError = error;
      const status = typeof error === "object" && error !== null
        ? Number((error as { status?: unknown }).status)
        : 0;
      if (!isRetryableStatus(status) || attempt === 2) break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to generate voice from OpenRouter.");
}

export const htmlVideoTtsService = {
  clearCache: clearTtsCache,

  async generate(input: string, options: HtmlVideoTtsOptions = {}): Promise<HtmlVideoTtsResult> {
    const text = normalizeNarrationText(String(input || ""));
    if (!text) throw new Error("Voice script cannot be empty.");
    return configuredProvider() === "elevenlabs"
      ? generateElevenLabsTts(text, options.language)
      : generateOpenRouterTts(text, options);
  },
};
