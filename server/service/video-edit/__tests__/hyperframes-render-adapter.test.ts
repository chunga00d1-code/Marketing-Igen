import assert from "node:assert/strict";
import test from "node:test";
import {
  createHyperframesRenderAdapter,
  type HyperframesRenderAdapterDependencies,
} from "../hyperframes-render-adapter";
import { VideoRenderAdapterError, type VideoRenderInput } from "../render-adapter";

const validInput: VideoRenderInput = {
  jobId: "render-1",
  blueprint: { timeline: [] },
  aspectRatio: "9:16",
  resolution: "1080p",
};

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
