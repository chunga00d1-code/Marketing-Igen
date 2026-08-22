const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
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

export type HtmlVideoTtsResult = {
  buffer: Buffer;
  model: string;
  voice: string;
  format: "mp3" | "pcm";
  sampleRate?: number;
  channels?: number;
  playbackRate: number;
  durationSeconds?: number;
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

export const htmlVideoTtsService = {
  async generate(input: string, options: HtmlVideoTtsOptions = {}): Promise<HtmlVideoTtsResult> {
    const text = normalizeNarrationText(String(input || ""));
    const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
    if (!text) throw new Error("Voice script cannot be empty.");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for TTS.");

    const model = configuredValue("OPENROUTER_HTML_VIDEO_TTS_MODEL", DEFAULT_TTS_MODEL);
    const voice = configuredValue("OPENROUTER_HTML_VIDEO_TTS_VOICE", DEFAULT_TTS_VOICE);
    const responseFormat = configuredValue(
      "OPENROUTER_HTML_VIDEO_TTS_FORMAT",
      DEFAULT_TTS_FORMAT
    ) === "mp3" ? "mp3" : "pcm";
    const profile = narrationProfile(options.language);
    const playbackRate = configuredPlaybackRate(text, options.durationSeconds, options.language);
    const ttsInput = [
      '# AUDIO PROFILE',
      profile.audioProfile,
      '# DIRECTOR\'S NOTES',
      profile.directorNotes + " Avoid rushing, dead air, slow lecturing, exaggerated acting, or dramatic pauses.",
      'Do not switch speakers, add sound effects, paraphrase, translate, or add any words.',
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
          const details = (await response.text()).slice(0, 800);
          const error = new Error(`OpenRouter TTS ${response.status}: ${details}`) as Error & { status?: number };
          error.status = response.status;
          throw error;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 128) throw new Error("OpenRouter TTS returned empty audio.");
        return {
          buffer,
          model,
          voice,
          format: responseFormat,
          ...(responseFormat === "pcm"
            ? {
                sampleRate: DEFAULT_TTS_SAMPLE_RATE,
                channels: DEFAULT_TTS_CHANNELS,
                durationSeconds: buffer.length /
                  (DEFAULT_TTS_SAMPLE_RATE * DEFAULT_TTS_CHANNELS * 2),
              }
            : {}),
          playbackRate,
        };
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
  },
};
