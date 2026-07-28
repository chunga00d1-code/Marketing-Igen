import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cloudinaryService } from "../cloudinary.service";
import { hyperframeService } from "./hyperframe";
import {
  VideoRenderAdapterError,
  type VideoRenderAdapter,
  type VideoRenderInput,
} from "./render-adapter";

export interface HyperframesRenderProcess {
  stdout: {
    on(event: "data", listener: (data: Buffer | string) => void): void;
  };
  stderr: {
    on(event: "data", listener: (data: Buffer | string) => void): void;
  };
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number | null) => void): void;
  kill(): boolean;
}

export type HyperframesSpawnProcess = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    shell: false;
    windowsHide: true;
  }
) => HyperframesRenderProcess;

export interface HyperframesFileSystem {
  access(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
}

export interface HyperframesRenderAdapterDependencies {
  cliPath: string;
  nodeExecutable: string;
  compileBlueprintToHtml: (blueprint: Record<string, unknown>) => string;
  spawnProcess: HyperframesSpawnProcess;
  fileSystem: HyperframesFileSystem;
  uploadOutput: (buffer: Buffer) => Promise<string>;
}

const supportedAspectRatios = new Set(["16:9", "9:16", "1:1"]);
const supportedResolutions = new Set(["720p", "1080p"]);

function assertValidInput(input: VideoRenderInput) {
  if (
    !input.jobId.trim() ||
    !input.blueprint ||
    !Array.isArray(input.blueprint.timeline) ||
    !supportedAspectRatios.has(input.aspectRatio) ||
    !supportedResolutions.has(input.resolution)
  ) {
    throw new VideoRenderAdapterError(
      "RENDER_INPUT_INVALID",
      "Render input is invalid."
    );
  }
}

function resolutionPresetFor(aspectRatio: VideoRenderInput["aspectRatio"]) {
  if (aspectRatio === "9:16") return "portrait";
  if (aspectRatio === "1:1") return "square";
  return "landscape";
}

function waitForRenderer(
  child: HyperframesRenderProcess,
  onRendering: () => void
) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    let stderr = "";

    child.stdout.on("data", () => {
      onRendering();
    });
    child.stderr.on("data", (data) => {
      stderr = `${stderr}${String(data)}`.slice(-8192);
    });
    child.on("error", (error) => {
      reject(new VideoRenderAdapterError(
        "RENDER_PROCESS_START_FAILED",
        "Hyperframes renderer could not start.",
        { reason: error.message.slice(0, 512) }
      ));
    });
    child.on("close", (code) => {
      resolve({ code, stderr });
    });
  });
}

export function createHyperframesRenderAdapter(
  dependencies: HyperframesRenderAdapterDependencies
): VideoRenderAdapter {
  return {
    id: "hyperframes",

    async checkCapability() {
      try {
        await dependencies.fileSystem.access(dependencies.cliPath);
        return { available: true };
      } catch {
        return {
          available: false,
          reason: "Hyperframes runtime is unavailable.",
        };
      }
    },

    validateInput(input) {
      assertValidInput(input);
    },

    async render(input, context) {
      assertValidInput(input);
      await context.onProgress({
        stage: "runtime-check",
        progress: 5,
        message: "Checking Hyperframes runtime.",
      });
      const capability = await this.checkCapability();
      if (!capability.available) {
        throw new VideoRenderAdapterError(
          "RENDER_ADAPTER_UNAVAILABLE",
          "Hyperframes runtime is unavailable."
        );
      }

      const htmlPath = join(context.temporaryDirectory, "composition.html");
      const outputPath = join(context.temporaryDirectory, "output.mp4");

      try {
        await dependencies.fileSystem.mkdir(context.temporaryDirectory, {
          recursive: true,
        });
        await context.onProgress({
          stage: "html-preparation",
          progress: 20,
          message: "Preparing HTML composition.",
        });
        const html = dependencies.compileBlueprintToHtml({
          ...input.blueprint,
          resolution: input.resolution,
        });
        await dependencies.fileSystem.writeFile(htmlPath, html);

        await context.onProgress({
          stage: "renderer-start",
          progress: 35,
          message: "Starting Hyperframes renderer.",
        });
        let child: HyperframesRenderProcess;
        try {
          child = dependencies.spawnProcess(
            dependencies.nodeExecutable,
            [
              dependencies.cliPath,
              "render",
              "-c",
              htmlPath,
              "-o",
              outputPath,
              "--resolution",
              resolutionPresetFor(input.aspectRatio),
              "--strict",
            ],
            {
              cwd: context.temporaryDirectory,
              shell: false,
              windowsHide: true,
            }
          );
        } catch (error) {
          throw new VideoRenderAdapterError(
            "RENDER_PROCESS_START_FAILED",
            "Hyperframes renderer could not start.",
            {
              reason: error instanceof Error
                ? error.message.slice(0, 512)
                : "Unknown process error.",
            }
          );
        }

        let renderingReported = false;
        const processResult = await waitForRenderer(child, () => {
          if (renderingReported) return;
          renderingReported = true;
          void context.onProgress({
            stage: "rendering",
            progress: 60,
            message: "Rendering video frames.",
          });
        });
        if (processResult.code !== 0) {
          throw new VideoRenderAdapterError(
            "RENDER_PROCESS_FAILED",
            "Hyperframes rendering failed.",
            {
              exitCode: processResult.code,
              stderr: processResult.stderr,
            }
          );
        }

        await context.onProgress({
          stage: "output-verification",
          progress: 80,
          message: "Verifying rendered output.",
        });
        let output: Buffer;
        try {
          output = await dependencies.fileSystem.readFile(outputPath);
        } catch {
          throw new VideoRenderAdapterError(
            "RENDER_OUTPUT_MISSING",
            "Hyperframes output is missing."
          );
        }

        await context.onProgress({
          stage: "uploading",
          progress: 90,
          message: "Uploading rendered video.",
        });
        const outputUrl = await dependencies.uploadOutput(output);
        return {
          engine: "hyperframes",
          outputUrl,
        };
      } finally {
        await dependencies.fileSystem.rm(context.temporaryDirectory, {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    },
  };
}

const require = createRequire(import.meta.url);

export const hyperframesRenderAdapter = createHyperframesRenderAdapter({
  cliPath: require.resolve("hyperframes/dist/cli.js"),
  nodeExecutable: process.execPath,
  compileBlueprintToHtml: (blueprint) =>
    hyperframeService.compileBlueprintToHtml(blueprint),
  spawnProcess: (command, args, options) =>
    spawn(command, [...args], options) as HyperframesRenderProcess,
  fileSystem: {
    access,
    mkdir,
    writeFile,
    readFile,
    rm,
  },
  uploadOutput: (buffer) =>
    cloudinaryService.uploadMediaBuffer(buffer, "igen_erp/marketing/video"),
});
