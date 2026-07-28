import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

    async render() {
      throw new VideoRenderAdapterError(
        "RENDER_ADAPTER_UNAVAILABLE",
        "Hyperframes rendering is not implemented."
      );
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
