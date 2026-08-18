const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_VOICE = "Kore";
const DEFAULT_TTS_FORMAT = "pcm" as const;
const DEFAULT_TTS_SAMPLE_RATE = 24_000;
const DEFAULT_TTS_CHANNELS = 1;
const MAX_TTS_INPUT_LENGTH = 8_000;
const TTS_TIMEOUT_MS = 60_000;

export type HtmlVideoTtsResult = {
  buffer: Buffer;
  model: string;
  voice: string;
  format: "mp3" | "pcm";
  sampleRate?: number;
  channels?: number;
};

function configuredValue(name: string, fallback: string) {
  const value = String(process.env[name] || "").trim();
  return value || fallback;
}

function isRetryableStatus(status: number) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

export const htmlVideoTtsService = {
  async generate(input: string): Promise<HtmlVideoTtsResult> {
    const text = String(input || "").trim().slice(0, MAX_TTS_INPUT_LENGTH);
    const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
    if (!text) throw new Error("Voice script cannot be empty.");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for TTS.");

    const model = configuredValue("OPENROUTER_HTML_VIDEO_TTS_MODEL", DEFAULT_TTS_MODEL);
    const voice = configuredValue("OPENROUTER_HTML_VIDEO_TTS_VOICE", DEFAULT_TTS_VOICE);
    const responseFormat = configuredValue(
      "OPENROUTER_HTML_VIDEO_TTS_FORMAT",
      DEFAULT_TTS_FORMAT
    ) === "mp3" ? "mp3" : "pcm";
    const ttsInput = [
      "Speak as one consistent Vietnamese professional narrator.",
      "Use a warm, clear, natural, confident delivery at a moderate pace. Do not act, switch speakers, add sound effects, or add words.",
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
            ? { sampleRate: DEFAULT_TTS_SAMPLE_RATE, channels: DEFAULT_TTS_CHANNELS }
            : {}),
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
