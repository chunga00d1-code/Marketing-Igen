import assert from "node:assert/strict";
import test from "node:test";
import type {
  VideoRenderAdapter,
  VideoRenderExecutionContext,
  VideoRenderInput,
} from "../render-adapter";
import { runRenderWaterfall } from "../render-waterfall";

const input: VideoRenderInput = {
  jobId: "render-1",
  blueprint: { timeline: [] },
  aspectRatio: "16:9",
  resolution: "720p",
};

const context: VideoRenderExecutionContext = {
  signal: new AbortController().signal,
  timeoutMs: 900_000,
  temporaryDirectory: "C:/tmp/render-1",
  onProgress: () => undefined,
};

function createAdapter(render: VideoRenderAdapter["render"]): VideoRenderAdapter {
  return {
    id: "hyperframes",
    checkCapability: async () => ({ available: true }),
    validateInput: () => undefined,
    render,
  };
}

test("returns Hyperframes output without calling fallbacks", async () => {
  const calls: string[] = [];
  const result = await runRenderWaterfall({
    selectedEngine: "hyperframe",
    hyperframesAdapter: createAdapter(async () => {
      calls.push("hyperframes");
      return { engine: "hyperframes", outputUrl: "https://cdn/hyperframes.mp4" };
    }),
    hyperframesInput: input,
    hyperframesContext: context,
    renderWithRemotion: async () => {
      calls.push("remotion");
      return "https://cdn/remotion.mp4";
    },
    renderWithFfmpeg: async () => {
      calls.push("ffmpeg");
      return "https://cdn/ffmpeg.mp4";
    },
    onFailure: async () => undefined,
  });

  assert.deepEqual(result, {
    engine: "hyperframes",
    outputUrl: "https://cdn/hyperframes.mp4",
  });
  assert.deepEqual(calls, ["hyperframes"]);
});

test("falls back from Hyperframes to Remotion", async () => {
  const calls: string[] = [];
  const failures: string[] = [];
  const result = await runRenderWaterfall({
    selectedEngine: "hyperframe",
    hyperframesAdapter: createAdapter(async () => {
      calls.push("hyperframes");
      throw new Error("hyperframes failed");
    }),
    hyperframesInput: input,
    hyperframesContext: context,
    renderWithRemotion: async () => {
      calls.push("remotion");
      return "https://cdn/remotion.mp4";
    },
    renderWithFfmpeg: async () => {
      calls.push("ffmpeg");
      return "https://cdn/ffmpeg.mp4";
    },
    onFailure: async (engine) => {
      failures.push(engine);
    },
  });

  assert.deepEqual(result, {
    engine: "remotion",
    outputUrl: "https://cdn/remotion.mp4",
  });
  assert.deepEqual(calls, ["hyperframes", "remotion"]);
  assert.deepEqual(failures, ["hyperframes"]);
});

test("falls back to FFmpeg after Hyperframes and Remotion fail", async () => {
  const calls: string[] = [];
  const result = await runRenderWaterfall({
    selectedEngine: "hyperframe",
    hyperframesAdapter: createAdapter(async () => {
      calls.push("hyperframes");
      throw new Error("hyperframes failed");
    }),
    hyperframesInput: input,
    hyperframesContext: context,
    renderWithRemotion: async () => {
      calls.push("remotion");
      throw new Error("remotion failed");
    },
    renderWithFfmpeg: async () => {
      calls.push("ffmpeg");
      return "https://cdn/ffmpeg.mp4";
    },
    onFailure: async () => undefined,
  });

  assert.deepEqual(result, {
    engine: "ffmpeg",
    outputUrl: "https://cdn/ffmpeg.mp4",
  });
  assert.deepEqual(calls, ["hyperframes", "remotion", "ffmpeg"]);
});

test("explicit Remotion selection bypasses Hyperframes", async () => {
  const calls: string[] = [];
  const result = await runRenderWaterfall({
    selectedEngine: "remotion",
    hyperframesAdapter: createAdapter(async () => {
      calls.push("hyperframes");
      return { engine: "hyperframes", outputUrl: "https://cdn/hyperframes.mp4" };
    }),
    hyperframesInput: input,
    hyperframesContext: context,
    renderWithRemotion: async () => {
      calls.push("remotion");
      return "https://cdn/remotion.mp4";
    },
    renderWithFfmpeg: async () => {
      calls.push("ffmpeg");
      return "https://cdn/ffmpeg.mp4";
    },
    onFailure: async () => undefined,
  });

  assert.deepEqual(result, {
    engine: "remotion",
    outputUrl: "https://cdn/remotion.mp4",
  });
  assert.deepEqual(calls, ["remotion"]);
});
