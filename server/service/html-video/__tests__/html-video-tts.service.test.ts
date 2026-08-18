import assert from "node:assert/strict";
import test from "node:test";
import { htmlVideoTtsService } from "../html-video-tts.service";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
const originalVoice = process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL = originalModel;
  if (originalVoice === undefined) delete process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
  else process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE = originalVoice;
});

test("uses Gemini Flash TTS with one default voice and returns raw audio bytes", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_MODEL;
  delete process.env.OPENROUTER_HTML_VIDEO_TTS_VOICE;
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
  assert.match(String(requestBody?.input), /một câu ngắn/);
  assert.equal(result.buffer.length, 256);
  assert.equal(result.model, "google/gemini-3.1-flash-tts-preview");
  assert.equal(result.voice, "Kore");
  assert.equal(result.format, "pcm");
  assert.equal(result.sampleRate, 24_000);
  assert.equal(result.channels, 1);
});
