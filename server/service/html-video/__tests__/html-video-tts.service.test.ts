import assert from "node:assert/strict";
import test from "node:test";
import { htmlVideoTtsService } from "../html-video-tts.service";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
const originalVoice = process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
const originalSpeed = process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL = originalModel;
  if (originalVoice === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE = originalVoice;
  if (originalSpeed === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED = originalSpeed;
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
  assert.equal(requestBody?.speed, 1.12);
  assert.match(String(requestBody?.input), /một câu ngắn/);
  assert.match(String(requestBody?.input), /native Vietnamese accent/);
  assert.doesNotMatch(String(requestBody?.input), /\x20{2}/);
  assert.equal(result.buffer.length, 256);
  assert.equal(result.model, "google/gemini-3.1-flash-tts-preview");
  assert.equal(result.voice, "Kore");
  assert.equal(result.format, "pcm");
  assert.equal(result.sampleRate, 24_000);
  assert.equal(result.channels, 1);
  assert.equal(result.playbackRate, 1.12);
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

  assert.equal(requestBody?.speed, 1.35);
  assert.equal(result.playbackRate, 1.35);
});

test("adapts provider speed to the requested video duration", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_SPEED;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(Buffer.alloc(256, 7), { status: 200 });
  }) as typeof fetch;

  const narration = Array.from({ length: 60 }, (_, index) => `word${index}`).join(" ");
  const result = await htmlVideoTtsService.generate(narration, { durationSeconds: 20 });
  const speed = Number(requestBody?.speed);

  assert.ok(speed > 1.12 && speed < 1.2);
  assert.equal(result.playbackRate, speed);
});
