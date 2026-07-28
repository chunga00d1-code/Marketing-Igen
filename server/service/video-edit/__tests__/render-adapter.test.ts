import assert from "node:assert/strict";
import test from "node:test";
import {
  VideoRenderAdapterError,
  type VideoRenderAdapter,
  type VideoRenderExecutionContext,
  type VideoRenderInput,
} from "../render-adapter";

const input: VideoRenderInput = {
  jobId: "render-1",
  blueprint: { timeline: [] },
  aspectRatio: "9:16",
  resolution: "1080p",
};

const context: VideoRenderExecutionContext = {
  signal: new AbortController().signal,
  timeoutMs: 120_000,
  temporaryDirectory: "C:/tmp/render-1",
  onProgress: () => undefined,
};

test("supports an adapter with normalized input and context", async () => {
  const adapter: VideoRenderAdapter = {
    id: "fake",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    render: async (receivedInput, receivedContext) => ({
      engine: "fake",
      outputUrl: `https://cdn.example/${receivedInput.jobId}.mp4`,
      diagnostics: { timeoutMs: receivedContext.timeoutMs },
    }),
  };

  adapter.validateInput(input);
  assert.deepEqual(await adapter.checkCapability(), { available: true });
  assert.deepEqual(await adapter.render(input, context), {
    engine: "fake",
    outputUrl: "https://cdn.example/render-1.mp4",
    diagnostics: { timeoutMs: 120_000 },
  });
});

test("exposes a safe coded adapter error without diagnostics in its message", () => {
  const error = new VideoRenderAdapterError(
    "RENDER_INPUT_INVALID",
    "Render input is invalid.",
    { internalReason: "local path must not leak" }
  );

  assert.equal(error.name, "VideoRenderAdapterError");
  assert.equal(error.code, "RENDER_INPUT_INVALID");
  assert.equal(error.message, "Render input is invalid.");
  assert.deepEqual(error.diagnostics, { internalReason: "local path must not leak" });
  assert.equal(error.message.includes("local path"), false);
});
