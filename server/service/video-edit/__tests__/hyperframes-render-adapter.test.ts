import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  createHyperframesRenderAdapter,
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

test("rejects malformed Hyperframes render input before rendering", () => {
  const adapter = createHyperframesRenderAdapter(createDependencies());
  const invalidInputs: VideoRenderInput[] = [
    { ...validInput, jobId: "" },
    {
      ...validInput,
      blueprint: { timeline: null as unknown as Array<Record<string, unknown>> },
    },
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
      "C:\\tmp\\render-1\\composition.html",
      "-o",
      "C:\\tmp\\render-1\\output.mp4",
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
