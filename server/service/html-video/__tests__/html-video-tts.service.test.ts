import assert from "node:assert/strict";
import test from "node:test";
import { htmlVideoTtsService, trimHtmlVideoPcmSilence } from "../html-video-tts.service";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
const originalVoice = process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
const originalSpeed = process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
const originalProvider = process.env.HTML_VIDEO_TTS_PROVIDER;
const originalElevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const originalElevenLabsVoiceId = process.env.ELEVENLABS_HTML_VIDEO_VOICE_ID;
const originalElevenLabsModel = process.env.ELEVENLABS_HTML_VIDEO_MODEL;

test.afterEach(() => {
  htmlVideoTtsService.clearCache();
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL = originalModel;
  if (originalVoice === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE = originalVoice;
  if (originalSpeed === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED = originalSpeed;
  if (originalProvider === undefined) delete process.env.HTML_VIDEO_TTS_PROVIDER;
  else process.env.HTML_VIDEO_TTS_PROVIDER = originalProvider;
  if (originalElevenLabsApiKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalElevenLabsApiKey;
  if (originalElevenLabsVoiceId === undefined) delete process.env.ELEVENLABS_HTML_VIDEO_VOICE_ID;
  else process.env.ELEVENLABS_HTML_VIDEO_VOICE_ID = originalElevenLabsVoiceId;
  if (originalElevenLabsModel === undefined) delete process.env.ELEVENLABS_HTML_VIDEO_MODEL;
  else process.env.ELEVENLABS_HTML_VIDEO_MODEL = originalElevenLabsModel;
});

test("uses Gemini Flash TTS with one default voice and returns raw audio bytes", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  let requestUrl = "";
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  const result = await htmlVideoTtsService.generate("Giới thiệu sản phẩm trong một câu ngắn.");

  assert.equal(requestUrl, "https://openrouter.ai/api/v1/audio/speech");
  assert.equal(requestBody?.model, "google/gemini-3.1-flash-tts-preview");
  assert.equal(requestBody?.voice, "Kore");
  assert.equal(requestBody?.response_format, "pcm");
  assert.equal(requestBody?.speed, 1);
  assert.match(String(requestBody?.input), /một câu ngắn/);
  assert.match(String(requestBody?.input), /native Vietnamese accent/);
  assert.doesNotMatch(String(requestBody?.input), /\x20{2}/);
  assert.equal(result.buffer.length, 256);
  assert.equal(result.provider, "openrouter");
  assert.equal(result.model, "google/gemini-3.1-flash-tts-preview");
  assert.equal(result.voice, "Kore");
  assert.equal(result.format, "pcm");
  assert.equal(result.sampleRate, 24_000);
  assert.equal(result.channels, 1);
  assert.equal(result.playbackRate, 1);
  assert.equal(result.durationSeconds, 256 / (24_000 * 2));
});

test("trims leading and trailing PCM silence while preserving natural padding", () => {
  const sampleRate = 1_000;
  const pcm = Buffer.alloc(sampleRate * 2);
  for (let frame = 250; frame < 750; frame += 1) {
    pcm.writeInt16LE(1_200, frame * 2);
  }

  const trimmed = trimHtmlVideoPcmSilence(pcm, sampleRate, 1);

  assert.equal(trimmed.length, 660 * 2);
  assert.equal(trimmed.readInt16LE(0), 0);
  assert.equal(trimmed.readInt16LE(80 * 2), 1_200);
  assert.equal(trimmed.readInt16LE(trimmed.length - 2), 0);
});

test("uses trimmed PCM bytes to report the effective narration duration", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const sampleRate = 24_000;
  const pcm = Buffer.alloc(sampleRate * 2);
  for (let frame = 6_000; frame < 18_000; frame += 1) {
    pcm.writeInt16LE(1_200, frame * 2);
  }
  globalThis.fetch = (async () => new Response(pcm, { status: 200 })) as typeof fetch;

  const result = await htmlVideoTtsService.generate("Teacher.");

  assert.equal(result.buffer.length, Math.round(sampleRate * 0.66) * 2);
  assert.equal(result.durationSeconds, 0.66);
});
test('clamps the configured TTS speed to a brisk but natural range', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED = '1.8';
  let requestBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  const result = await htmlVideoTtsService.generate('Một câu ngắn.');

  assert.equal(requestBody?.speed, 1.25);
  assert.equal(result.playbackRate, 1.25);
});

test("adapts provider speed to the requested video duration", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  const narration = Array.from({ length: 44 }, (_, index) => `word${index}`).join(" ");
  const result = await htmlVideoTtsService.generate(narration, { durationSeconds: 20 });
  const speed = Number(requestBody?.speed);

  assert.ok(speed > 1 && speed < 1.1);
  assert.equal(result.playbackRate, speed);
});

test("slows short narration slightly instead of padding a large silent tail", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  const narration = Array.from({ length: 24 }, (_, index) => `word${index}`).join(" ");
  await htmlVideoTtsService.generate(narration, { durationSeconds: 20 });

  assert.equal(requestBody?.speed, 0.85);
  assert.match(String(requestBody?.input), /Avoid rushing/);
});
test("uses an English narrator profile when the pipeline requires English voice", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  await htmlVideoTtsService.generate(
    "Jobs in English. Listen and repeat. Teacher.",
    { durationSeconds: 5, language: "English" }
  );

  assert.match(String(requestBody?.input), /native English narrator/);
  assert.match(String(requestBody?.input), /natural English pronunciation/);
  assert.doesNotMatch(String(requestBody?.input), /native Vietnamese accent/);
});

test("reuses cached audio for an identical provider, voice, language and narration", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.HTML_VIDEO_TTS_PROVIDER;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  const first = await htmlVideoTtsService.generate("Cùng một lời đọc.", { language: "vi" });
  first.buffer[0] = 99;
  const second = await htmlVideoTtsService.generate("Cùng một lời đọc.", { language: "vi" });

  assert.equal(fetchCalls, 1);
  assert.equal(second.buffer[0], 7);
});

test("uses ElevenLabs Flash timestamps when explicitly configured", async () => {
  process.env.HTML_VIDEO_TTS_PROVIDER = "elevenlabs";
  process.env.ELEVENLABS_API_KEY = "eleven-test-key";
  process.env.ELEVENLABS_HTML_VIDEO_VOICE_ID = "voice-vi";
  delete process.env.ELEVENLABS_HTML_VIDEO_MODEL;
  let requestUrl = "";
  let requestHeaders: HeadersInit | undefined;
  let requestBody: Record<string, unknown> | undefined;
  const audio = Buffer.alloc(256, 5);
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestHeaders = init?.headers;
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      audio_base64: audio.toString("base64"),
      normalized_alignment: {
        characters: ["X", "i", "n"],
        character_start_times_seconds: [0, 0.2, 0.4],
        character_end_times_seconds: [0.2, 0.4, 0.7],
      },
    });
  }) as typeof fetch;

  const result = await htmlVideoTtsService.generate("Xin", { language: "Tiếng Việt" });

  assert.match(requestUrl, /\/text-to-speech\/voice-vi\/with-timestamps/);
  assert.equal(new Headers(requestHeaders).get("xi-api-key"), "eleven-test-key");
  assert.equal(requestBody?.model_id, "eleven_flash_v2_5");
  assert.equal(requestBody?.language_code, "vi");
  assert.equal(requestBody?.text, "Xin");
  assert.equal(result.provider, "elevenlabs");
  assert.equal(result.format, "mp3");
  assert.equal(result.durationSeconds, 0.7);
  assert.deepEqual(result.alignment?.characters, ["X", "i", "n"]);
});
