import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  createHyperframesRenderAdapter,
  sanitizeRenderDiagnostic,
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
  assert.equal(writes[0]?.content, "<html></html>");
  assert.deepEqual(spawnCalls, [{
    command: "C:/Program Files/nodejs/node.exe",
      args: [
        "C:/app/node_modules/hyperframes/dist/cli.js",
        "render",
        "-c",
        "composition.html",
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
    "-c",
    "composition.html",
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
    "[1:a]apad[voice]",
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
    "[1:a]apad[voice]",
    "-map",
    "0:v:0",
  ]);
});

test("maps a non-zero renderer exit to a coded failure and cleans up", async () => {
  const child = new FakeRenderProcess();
  const removedDirectories: string[] = [];
  const adapter = createHyperframesRenderAdapter(createDependencies({
    spawnProcess: () => {
      queueMicrotask(() => {
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
    (error: unknown) =>
      error instanceof VideoRenderAdapterError &&
      error.code === "RENDER_PROCESS_FAILED"
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
