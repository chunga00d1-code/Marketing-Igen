import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  createHyperframesRenderAdapter,
  sanitizeRenderDiagnostic,
  validateProbePayload,
  validateRepresentativeFrameSamples,
  type HyperframesRenderProcess,
  type HyperframesRenderAdapterDependencies,
} from "../hyperframes-render-adapter";
import { VideoRenderAdapterError, type VideoRenderInput } from "../render-adapter";

const validInput: VideoRenderInput = {
  jobId: "render-1",
  blueprint: { timeline: [] },
  aspectRatio: "9:16",
  resolution: "1080p",
};

class FakeRenderProcess extends EventEmitter implements HyperframesRenderProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killCalls = 0;

  kill() {
    this.killCalls += 1;
    return true;
  }
}

function createDependencies(
  overrides: Partial<HyperframesRenderAdapterDependencies> = {}
): HyperframesRenderAdapterDependencies {
  return {
    cliPath: "C:/app/node_modules/hyperframes/dist/cli.js",
    nodeExecutable: "C:/Program Files/nodejs/node.exe",
    compileBlueprintToHtml: () => "<html></html>",
    spawnProcess: () => {
      throw new Error("spawn is not expected");
    },
    fileSystem: {
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      readFile: async () => Buffer.from("video"),
      rm: async () => undefined,
    },
    uploadOutput: async () => "https://cdn.example/render-1.mp4",
    ...overrides,
  };
}

test("accepts normalized Hyperframes render input", () => {
  const adapter = createHyperframesRenderAdapter(createDependencies());

  assert.doesNotThrow(() => adapter.validateInput(validInput));
});

test("accepts a sanitized HTML composition without compiling a blueprint", async () => {
  let writtenHtml = "";
  let compileCalls = 0;
  const child = new FakeRenderProcess();
  const adapter = createHyperframesRenderAdapter(
    createDependencies({
      compileBlueprintToHtml: () => {
        compileCalls += 1;
        return "<html>compiled blueprint</html>";
      },
      spawnProcess: () => {
        queueMicrotask(() => child.emit("close", 0));
        return child;
      },
      fileSystem: {
        access: async () => undefined,
        mkdir: async () => undefined,
        writeFile: async (_path, content) => {
          writtenHtml = content;
        },
        readFile: async () => Buffer.from("video"),
        rm: async () => undefined,
      },
    })
  );
  const compositionHtml =
    '<!doctype html><html data-composition-id="html-video"></html>';
  const htmlInput: VideoRenderInput = {
    jobId: "render-html-1",
    compositionHtml,
    aspectRatio: "16:9",
    resolution: "720p",
  };

  assert.doesNotThrow(() => adapter.validateInput(htmlInput));
  await adapter.render(htmlInput, {
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    temporaryDirectory: "C:/tmp/render-html-1",
    onProgress: () => undefined,
  });

  assert.equal(writtenHtml, compositionHtml);
  assert.equal(compileCalls, 0);
});

test("rejects malformed Hyperframes render input before rendering", () => {
  const adapter = createHyperframesRenderAdapter(createDependencies());
  const invalidInputs: VideoRenderInput[] = [
    { ...validInput, jobId: "" },
    {
      ...validInput,
      blueprint: { timeline: null as unknown as Array<Record<string, unknown>> },
    },
    {
      ...validInput,
      compositionHtml: "<html></html>",
    } as unknown as VideoRenderInput,
    {
      jobId: validInput.jobId,
      aspectRatio: validInput.aspectRatio,
      resolution: validInput.resolution,
    } as VideoRenderInput,
    { ...validInput, aspectRatio: "3:4" as VideoRenderInput["aspectRatio"] },
    { ...validInput, resolution: "4k" as VideoRenderInput["resolution"] },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => adapter.validateInput(input),
      (error: unknown) =>
        error instanceof VideoRenderAdapterError &&
        error.code === "RENDER_INPUT_INVALID"
    );
  }
});

test("reports missing Hyperframes CLI as unavailable", async () => {
  const adapter = createHyperframesRenderAdapter(createDependencies({
    fileSystem: {
      ...createDependencies().fileSystem,
      access: async () => {
        throw new Error("missing");
      },
    },
  }));

  assert.deepEqual(await adapter.checkCapability(), {
    available: false,
    reason: "Hyperframes runtime is unavailable.",
  });
});

test("requires expected dimensions, duration, and voice stream in probed output", () => {
  assert.doesNotThrow(() => validateProbePayload({
    streams: [
      { codec_type: "video", width: 1080, height: 1920 },
      { codec_type: "audio", duration: "9.4" },
    ],
    format: { duration: "10.02" },
  }, {
    ...validInput,
    durationSeconds: 10,
    voiceAudioPath: "C:/tmp/voice.mp3",
  }));

  assert.throws(
    () => validateProbePayload({
      streams: [{ codec_type: "video", width: 1920, height: 1080 }],
      format: { duration: "10" },
    }, {
      ...validInput,
      durationSeconds: 10,
      voiceAudioPath: "C:/tmp/voice.mp3",
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_OUTPUT_INVALID"
  );

  assert.throws(
    () => validateProbePayload({
      streams: [
        { codec_type: "video", width: 1080, height: 1920 },
        { codec_type: "audio", duration: "5.5" },
      ],
      format: { duration: "10" },
    }, {
      ...validInput,
      durationSeconds: 10,
      voiceAudioPath: "C:/tmp/voice.mp3",
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_OUTPUT_INVALID"
  );
});

test("reports missing renderer binaries before starting a job", async () => {
  const adapter = createHyperframesRenderAdapter(createDependencies({
    prepareRuntime: () => ({
      environment: {},
      missing: ["FFmpeg", "Chrome Headless Shell"],
    }),
  }));

  assert.deepEqual(await adapter.checkCapability(), {
    available: false,
    reason: "Hyperframes runtime is missing: FFmpeg, Chrome Headless Shell.",
  });
});

test("renders with the local CLI argument array, uploads output, and cleans up", async () => {
  const child = new FakeRenderProcess();
  const spawnCalls: Array<{
    command: string;
    args: readonly string[];
    options: { cwd: string; shell: false; windowsHide: true };
  }> = [];
  const writes: Array<{ path: string; content: string }> = [];
  const removedDirectories: string[] = [];
  const progressStages: string[] = [];
  const dependencies = createDependencies({
    spawnProcess: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    fileSystem: {
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async (path, content) => {
        writes.push({ path, content });
      },
      readFile: async () => Buffer.from("rendered-video"),
      rm: async (path) => {
        removedDirectories.push(path);
      },
    },
  });
  const adapter = createHyperframesRenderAdapter(dependencies);

  const result = await adapter.render(validInput, {
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    temporaryDirectory: "C:/tmp/render-1",
    onProgress: (progress) => {
      progressStages.push(progress.stage);
    },
  });

  assert.equal(result.outputUrl, "https://cdn.example/render-1.mp4");
  assert.equal(writes.length, 1);
  assert.match(writes[0]?.path ?? "", /[\\/]index\.html$/);
  assert.equal(writes[0]?.content, "<html></html>");
  assert.deepEqual(spawnCalls, [{
    command: "C:/Program Files/nodejs/node.exe",
      args: [
        "C:/app/node_modules/hyperframes/dist/cli.js",
        "render",
        "-o",
        "output.mp4",
        "--resolution",
        "portrait",
        "--strict",
    ],
    options: {
      cwd: "C:/tmp/render-1",
      shell: false,
      windowsHide: true,
    },
  }]);
  assert.deepEqual(removedDirectories, ["C:/tmp/render-1"]);
  assert.deepEqual(progressStages, [
    "runtime-check",
    "html-preparation",
    "renderer-start",
    "output-verification",
    "uploading",
  ]);
});

test("verifies the final MP4 before reading and uploading it", async () => {
  const child = new FakeRenderProcess();
  const events: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    probeOutput: async (outputPath, input) => {
      events.push("probe");
      assert.match(outputPath, /[\\/]output\.mp4$/);
      assert.equal(input.durationSeconds, 10);
    },
    fileSystem: {
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      readFile: async () => {
        events.push("read");
        return Buffer.from("verified-video");
      },
      rm: async () => undefined,
    },
    uploadOutput: async () => {
      events.push("upload");
      return "https://cdn.example/verified.mp4";
    },
  }));

  await adapter.render({ ...validInput, durationSeconds: 10 }, {
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    temporaryDirectory: "C:/tmp/render-verified",
    onProgress: () => undefined,
  });

  assert.deepEqual(events, ["probe", "read", "upload"]);
});

test("renders 720p compositions at native dimensions without an upscale preset", async () => {
  const child = new FakeRenderProcess();
  let renderArgs: readonly string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: (_command, args) => {
      renderArgs = args;
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
  }));

  await adapter.render(
    {
      ...validInput,
      resolution: "720p",
    },
    {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-720p",
      onProgress: () => undefined,
    }
  );

  assert.deepEqual(renderArgs, [
    "C:/app/node_modules/hyperframes/dist/cli.js",
    "render",
    "-o",
    "output.mp4",
    "--strict",
  ]);
});

test("muxes the local voice track into the final MP4 before upload", async () => {
  const children: FakeRenderProcess[] = [];
  const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
  let readPath = "";
  const adapter = createHyperframesRenderAdapter(createDependencies({
    prepareRuntime: () => ({
      environment: { HYPERFRAMES_FFMPEG_PATH: "C:/bin/ffmpeg.exe" },
      missing: [],
    }),
    spawnProcess: (command, args) => {
      const child = new FakeRenderProcess();
      children.push(child);
      spawnCalls.push({ command, args });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    fileSystem: {
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      readFile: async (path) => {
        readPath = path;
        return Buffer.from("muxed-video");
      },
      rm: async () => undefined,
    },
  }));

  const result = await adapter.render(
    {
      jobId: "render-voice-1",
      compositionHtml: '<!doctype html><html data-composition-id="html-video"></html>',
      aspectRatio: "16:9",
      resolution: "720p",
      voiceAudioPath: "C:/tmp/render-voice-1/voice.mp3",
      voiceDurationSeconds: 5,
      voicePlaybackRate: 1.12,
    },
    {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-voice-1",
      onProgress: () => undefined,
    }
  );

  assert.equal(result.outputUrl, "https://cdn.example/render-1.mp4");
  assert.equal(children.length, 2);
  assert.equal(spawnCalls[1]?.command, "C:/bin/ffmpeg.exe");
  assert.deepEqual(spawnCalls[1]?.args, [
    "-y",
    "-i",
    "C:\\tmp\\render-voice-1\\output.mp4",
    "-i",
    "C:/tmp/render-voice-1/voice.mp3",
    "-filter_complex",
    "[1:a]atempo=1.120[voice]",
    "-map",
    "0:v:0",
    "-map",
    "[voice]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    "5",
    "-movflags",
    "+faststart",
    "C:\\tmp\\render-voice-1\\output-with-voice.mp4",
  ]);
  assert.equal(readPath, "C:\\tmp\\render-voice-1\\output-with-voice.mp4");
});

test("passes Gemini PCM voice metadata to FFmpeg before muxing", async () => {
  const children: FakeRenderProcess[] = [];
  const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    prepareRuntime: () => ({
      environment: { HYPERFRAMES_FFMPEG_PATH: "C:/bin/ffmpeg.exe" },
      missing: [],
    }),
    spawnProcess: (command, args) => {
      const child = new FakeRenderProcess();
      children.push(child);
      spawnCalls.push({ command, args });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    fileSystem: {
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      readFile: async () => Buffer.from("muxed-video"),
      rm: async () => undefined,
    },
  }));

  await adapter.render(
    {
      jobId: "render-voice-pcm-1",
      compositionHtml: '<!doctype html><html data-composition-id="html-video"></html>',
      aspectRatio: "9:16",
      resolution: "720p",
      voiceAudioPath: "C:/tmp/render-voice-pcm-1/voice.pcm",
      voiceAudioFormat: "pcm",
      voiceAudioSampleRate: 24_000,
      voiceAudioChannels: 1,
      voiceDurationSeconds: 5,
      voicePlaybackRate: 1.12,
    },
    {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-voice-pcm-1",
      onProgress: () => undefined,
    }
  );

  assert.equal(children.length, 2);
  assert.deepEqual(spawnCalls[1]?.args.slice(0, 15), [
    "-y",
    "-i",
    "C:\\tmp\\render-voice-pcm-1\\output.mp4",
    "-f",
    "s16le",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-i",
    "C:/tmp/render-voice-pcm-1/voice.pcm",
    "-filter_complex",
    "[1:a]atempo=1.120[voice]",
    "-map",
    "0:v:0",
  ]);
});

test("places measured voice segments on their exact scene timeline", async () => {
  const children: FakeRenderProcess[] = [];
  const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    prepareRuntime: () => ({
      environment: { HYPERFRAMES_FFMPEG_PATH: "C:/bin/ffmpeg.exe" },
      missing: [],
    }),
    spawnProcess: (command, args) => {
      const child = new FakeRenderProcess();
      children.push(child);
      spawnCalls.push({ command, args });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    fileSystem: {
      access: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      readFile: async () => Buffer.from("muxed-video"),
      rm: async () => undefined,
    },
  }));

  await adapter.render(
    {
      jobId: "render-scene-voice-1",
      compositionHtml: '<!doctype html><html data-composition-id="html-video"></html>',
      aspectRatio: "9:16",
      resolution: "720p",
      durationSeconds: 5,
      voiceSegments: [
        {
          audioPath: "C:/tmp/render-scene-voice-1/voice-scene-01.pcm",
          audioFormat: "pcm",
          audioSampleRate: 24_000,
          audioChannels: 1,
          startSeconds: 0,
          durationSeconds: 2,
          sourceDurationSeconds: 1,
        },
        {
          audioPath: "C:/tmp/render-scene-voice-1/voice-scene-02.pcm",
          audioFormat: "pcm",
          audioSampleRate: 24_000,
          audioChannels: 1,
          startSeconds: 2,
          durationSeconds: 3,
          sourceDurationSeconds: 4,
        },
      ],
    },
    {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-scene-voice-1",
      onProgress: () => undefined,
    }
  );

  assert.equal(children.length, 2);
  const muxArgs = spawnCalls[1]?.args || [];
  assert.ok(muxArgs.includes("C:/tmp/render-scene-voice-1/voice-scene-01.pcm"));
  assert.ok(muxArgs.includes("C:/tmp/render-scene-voice-1/voice-scene-02.pcm"));
  const filterIndex = muxArgs.indexOf("-filter_complex");
  const filter = muxArgs[filterIndex + 1];
  assert.match(filter, /\[1:a\]atempo=1\.000.*adelay=0\|0\[voice_0\]/);
  assert.match(filter, /\[2:a\]atempo=1\.250.*adelay=2000\|2000\[voice_1\]/);
  assert.match(filter, /\[voice_0\]\[voice_1\]amix=inputs=2.*atrim=duration=5\.000\[voice\]/);
});

test("maps a non-zero renderer exit to a coded failure and cleans up", async () => {
  const child = new FakeRenderProcess();
  const removedDirectories: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => {
        child.stdout.write("lint failed for C:/tmp/render-1/index.html");
        child.stderr.write("renderer failed at C:/tmp/render-1/output.mp4");
        child.emit("close", 1);
      });
      return child;
    },
    fileSystem: {
      ...createDependencies().fileSystem,
      rm: async (path) => {
        removedDirectories.push(path);
      },
    },
  }));

  await assert.rejects(
    adapter.render(validInput, {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-1",
      onProgress: () => undefined,
    }),
    (error: unknown) => {
      if (
        !(error instanceof VideoRenderAdapterError) ||
        error.code !== "RENDER_PROCESS_FAILED"
      ) {
        return false;
      }
      assert.match(String(error.diagnostics?.stdout), /lint failed/);
      assert.match(String(error.diagnostics?.stderr), /renderer failed/);
      assert.doesNotMatch(JSON.stringify(error.diagnostics), /C:\/tmp\/render-1/);
      return true;
    }
  );
  assert.deepEqual(removedDirectories, ["C:/tmp/render-1"]);
});

test("maps a missing renderer output to a coded failure and cleans up", async () => {
  const child = new FakeRenderProcess();
  const removedDirectories: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    fileSystem: {
      ...createDependencies().fileSystem,
      readFile: async () => {
        throw new Error("ENOENT");
      },
      rm: async (path) => {
        removedDirectories.push(path);
      },
    },
  }));

  await assert.rejects(
    adapter.render(validInput, {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-1",
      onProgress: () => undefined,
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_OUTPUT_MISSING"
  );
  assert.deepEqual(removedDirectories, ["C:/tmp/render-1"]);
});

test("kills a timed-out renderer and cleans up", async () => {
  const child = new FakeRenderProcess();
  const removedDirectories: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => child,
    fileSystem: {
      ...createDependencies().fileSystem,
      rm: async (path) => {
        removedDirectories.push(path);
      },
    },
  }));

  await assert.rejects(
    adapter.render(validInput, {
      signal: new AbortController().signal,
      timeoutMs: 5,
      temporaryDirectory: "C:/tmp/render-1",
      onProgress: () => undefined,
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_PROCESS_TIMEOUT"
  );
  assert.equal(child.killCalls, 1);
  assert.deepEqual(removedDirectories, ["C:/tmp/render-1"]);
});

test("kills an aborted renderer and cleans up", async () => {
  const child = new FakeRenderProcess();
  const controller = new AbortController();
  const removedDirectories: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => controller.abort());
      return child;
    },
    fileSystem: {
      ...createDependencies().fileSystem,
      rm: async (path) => {
        removedDirectories.push(path);
      },
    },
  }));

  await assert.rejects(
    adapter.render(validInput, {
      signal: controller.signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-1",
      onProgress: () => undefined,
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_PROCESS_ABORTED"
  );
  assert.equal(child.killCalls, 1);
  assert.deepEqual(removedDirectories, ["C:/tmp/render-1"]);
});

test("maps an asynchronous spawn error to a coded failure", async () => {
  const child = new FakeRenderProcess();
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => child.emit("error", new Error("spawn failed")));
      return child;
    },
  }));

  await assert.rejects(
    adapter.render(validInput, {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-1",
      onProgress: () => undefined,
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_PROCESS_START_FAILED"
  );
});

test("maps upload failure to a coded safe error and cleans up", async () => {
  const child = new FakeRenderProcess();
  const removedDirectories: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    uploadOutput: async () => {
      throw new Error("upload failed at C:/secret/output.mp4");
    },
    fileSystem: {
      ...createDependencies().fileSystem,
      rm: async (path) => {
        removedDirectories.push(path);
      },
    },
  }));

  await assert.rejects(
    adapter.render(validInput, {
      signal: new AbortController().signal,
      timeoutMs: 5_000,
      temporaryDirectory: "C:/tmp/render-1",
      onProgress: () => undefined,
    }),
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_UPLOAD_FAILED" &&
      error.message === "Rendered video upload failed." &&
      !JSON.stringify(error.diagnostics).includes("C:/secret")
  );
  assert.deepEqual(removedDirectories, ["C:/tmp/render-1"]);
});

test("sanitizes local paths and bounds renderer diagnostics", () => {
  const localPath = "C:/tmp/render-1";
  const diagnostic = `${localPath}/output.mp4 ${"x".repeat(10_000)}`;

  const sanitized = sanitizeRenderDiagnostic(diagnostic, [localPath]);

  assert.equal(sanitized.includes(localPath), false);
  assert.ok(sanitized.length <= 8192);
});


test("accepts three non-blank representative frames with visible motion", () => {
  const sample = (timeSeconds: number, values: number[]) => ({
    timeSeconds,
    stdevLuma: 20,
    edgeRatio: 0.04,
    darkRatio: 0.01,
    lightRatio: 0.01,
    luma: Uint8Array.from(values),
  });
  assert.deepEqual(
    validateRepresentativeFrameSamples([
      sample(1, [20, 40, 80, 120]),
      sample(5, [40, 60, 100, 140]),
      sample(9, [80, 100, 140, 180]),
    ]),
    {
      representativeFramesChecked: 3,
      minimumFrameEdgeRatio: 0.04,
      maximumFrameDifference: 60,
    }
  );
});

test("rejects blank and frozen representative frames", () => {
  const visible = {
    timeSeconds: 1,
    stdevLuma: 20,
    edgeRatio: 0.04,
    darkRatio: 0.01,
    lightRatio: 0.01,
    luma: Uint8Array.from([20, 40, 80, 120]),
  };
  assert.throws(
    () => validateRepresentativeFrameSamples([
      visible,
      { ...visible, timeSeconds: 5, stdevLuma: 0, edgeRatio: 0, lightRatio: 1, luma: Uint8Array.from([255, 255, 255, 255]) },
      { ...visible, timeSeconds: 9, luma: Uint8Array.from([80, 100, 140, 180]) },
    ]),
    (error: unknown) => error instanceof VideoRenderAdapterError && error.code === "RENDER_OUTPUT_INVALID"
  );
  assert.throws(
    () => validateRepresentativeFrameSamples([
      visible,
      { ...visible, timeSeconds: 5 },
      { ...visible, timeSeconds: 9 },
    ]),
    (error: unknown) => error instanceof VideoRenderAdapterError && error.code === "RENDER_OUTPUT_INVALID"
  );
});

test("runs representative frame verification before uploading", async () => {
  const child = new FakeRenderProcess();
  const events: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    verifyFrames: async () => {
      events.push("verify");
      return {
        representativeFramesChecked: 3,
        minimumFrameEdgeRatio: 0.02,
        maximumFrameDifference: 12,
      };
    },
    uploadOutput: async () => {
      events.push("upload");
      return "https://cdn.example/verified.mp4";
    },
  }));

  const result = await adapter.render(validInput, {
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    temporaryDirectory: "C:/tmp/render-frame-qa",
    onProgress: () => undefined,
  });

  assert.deepEqual(events, ["verify", "upload"]);
  assert.deepEqual(result.diagnostics, {
    representativeFramesChecked: 3,
    minimumFrameEdgeRatio: 0.02,
    maximumFrameDifference: 12,
  });
});
