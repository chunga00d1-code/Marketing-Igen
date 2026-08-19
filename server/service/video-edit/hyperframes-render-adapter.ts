import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { cloudinaryService } from "../cloudinary.service";
import { resolveMediaBinary } from "../media-binary.service";
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
    env?: NodeJS.ProcessEnv;
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
  prepareRuntime?: () => HyperframesRuntimeConfiguration;
}

export type HyperframesRuntimeConfiguration = {
  environment: NodeJS.ProcessEnv;
  missing: string[];
};

const supportedAspectRatios = new Set(["16:9", "9:16", "1:1"]);
const supportedResolutions = new Set(["720p", "1080p"]);
const maximumDiagnosticLength = 8192;

function isUsableBinary(value: string) {
  return (
    value.length > 0 &&
    ((!value.includes("/") && !value.includes("\\")) || existsSync(value))
  );
}

function resolveHyperframesBinary(
  binaryName: "ffmpeg" | "ffprobe",
  configuredPath?: string
) {
  const resolved = resolveMediaBinary(binaryName, configuredPath);
  if (binaryName !== "ffprobe" || resolved !== binaryName || process.platform !== "win32") {
    return resolved;
  }

  const bundled = join(
    process.cwd(),
    "node_modules",
    "@remotion",
    "compositor-win32-x64-msvc",
    "ffprobe.exe"
  );
  return existsSync(bundled) ? bundled : resolved;
}

function findHeadlessShell() {
  const configured = process.env.HYPERFRAMES_BROWSER_PATH?.trim();
  const candidates = [
    configured,
    join(
      process.cwd(),
      "node_modules",
      ".remotion",
      "chrome-headless-shell",
      "win64",
      "chrome-headless-shell-win64",
      "chrome-headless-shell.exe"
    ),
    join(
      process.cwd(),
      "node_modules",
      ".remotion",
      "chrome-headless-shell",
      "linux64",
      "chrome-headless-shell-linux64",
      "chrome-headless-shell"
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate));
}

function createDefaultRuntimeConfiguration(): HyperframesRuntimeConfiguration {
  const environment = { ...process.env };
  const ffmpegPath = resolveHyperframesBinary(
    "ffmpeg",
    environment.HYPERFRAMES_FFMPEG_PATH || environment.VIDEO_CAPTION_FFMPEG_PATH
  );
  const ffprobePath = resolveHyperframesBinary(
    "ffprobe",
    environment.HYPERFRAMES_FFPROBE_PATH || environment.VIDEO_CAPTION_FFPROBE_PATH
  );
  const browserPath = findHeadlessShell();
  const missing: string[] = [];

  if (isUsableBinary(ffmpegPath)) {
    environment.HYPERFRAMES_FFMPEG_PATH = ffmpegPath;
  } else {
    missing.push("FFmpeg");
  }
  if (isUsableBinary(ffprobePath)) {
    environment.HYPERFRAMES_FFPROBE_PATH = ffprobePath;
  } else {
    missing.push("FFprobe");
  }
  if (browserPath) {
    environment.HYPERFRAMES_BROWSER_PATH = browserPath;
  } else if (process.platform === "win32") {
    missing.push("Chrome Headless Shell");
  }

  return { environment, missing };
}

export function sanitizeRenderDiagnostic(
  value: string,
  sensitivePaths: readonly string[]
) {
  let sanitized = value;
  for (const sensitivePath of sensitivePaths) {
    if (!sensitivePath) continue;
    const variants = new Set([
      sensitivePath,
      sensitivePath.replace(/\\/g, "/"),
      sensitivePath.replace(/\//g, "\\"),
    ]);
    for (const variant of variants) {
      sanitized = sanitized.split(variant).join("[path]");
    }
  }
  sanitized = sanitized.replace(/\b[A-Za-z]:[\\/][^\s"'`]+/g, "[path]");
  return sanitized.slice(-maximumDiagnosticLength);
}

function assertValidInput(input: VideoRenderInput) {
  const hasBlueprint =
    "blueprint" in input &&
    Boolean(input.blueprint) &&
    Array.isArray(input.blueprint?.timeline);
  const hasCompositionHtml =
    "compositionHtml" in input &&
    typeof input.compositionHtml === "string" &&
    input.compositionHtml.trim().length > 0;
  if (
    !input.jobId.trim() ||
    hasBlueprint === hasCompositionHtml ||
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

function assertLocalVoicePath(input: VideoRenderInput, temporaryDirectory: string) {
  if (!input.voiceAudioPath) return;
  const root = resolve(temporaryDirectory);
  const audioPath = resolve(input.voiceAudioPath);
  const relativeAudioPath = relative(root, audioPath);
  if (
    !relativeAudioPath ||
    relativeAudioPath === ".." ||
    relativeAudioPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativeAudioPath)
  ) {
    throw new VideoRenderAdapterError(
      "RENDER_INPUT_INVALID",
      "Voice audio must be stored inside the temporary render directory."
    );
  }
}

function renderResolutionArgs(
  input: Pick<VideoRenderInput, "aspectRatio" | "resolution">
) {
  // Hyperframes presets target 1080p. Applying one to a 720p composition
  // produces a non-integer device scale factor (for example 720 -> 1080),
  // which the renderer rejects. A 720p composition should render natively.
  return input.resolution === "1080p"
    ? ["--resolution", resolutionPresetFor(input.aspectRatio)]
    : [];
}

function waitForRenderer(
  child: HyperframesRenderProcess,
  signal: AbortSignal,
  timeoutMs: number,
  sensitivePaths: readonly string[],
  onRendering: () => void
) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    let stderr = "";
    let settled = false;

    const finish = (
      action: () => void
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      action();
    };
    const handleAbort = () => {
      finish(() => {
        child.kill();
        reject(new VideoRenderAdapterError(
          "RENDER_PROCESS_ABORTED",
          "Hyperframes rendering was aborted."
        ));
      });
    };
    const timeout = setTimeout(() => {
      finish(() => {
        child.kill();
        reject(new VideoRenderAdapterError(
          "RENDER_PROCESS_TIMEOUT",
          "Hyperframes rendering timed out."
        ));
      });
    }, timeoutMs);

    child.stdout.on("data", () => {
      onRendering();
    });
    child.stderr.on("data", (data) => {
      stderr = sanitizeRenderDiagnostic(
        `${stderr}${String(data)}`,
        sensitivePaths
      );
    });
    child.on("error", (error) => {
      finish(() => {
        reject(new VideoRenderAdapterError(
          "RENDER_PROCESS_START_FAILED",
          "Hyperframes renderer could not start.",
          {
            reason: sanitizeRenderDiagnostic(
              error.message,
              sensitivePaths
            ).slice(0, 512),
          }
        ));
      });
    });
    child.on("close", (code) => {
      finish(() => {
        resolve({ code, stderr });
      });
    });
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) handleAbort();
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
        const runtime = dependencies.prepareRuntime?.();
        if (runtime?.missing.length) {
          return {
            available: false,
            reason: `Hyperframes runtime is missing: ${runtime.missing.join(", ")}.`,
          };
        }
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
      assertLocalVoicePath(input, context.temporaryDirectory);
      await context.onProgress({
        stage: "runtime-check",
        progress: 5,
        message: "Checking Hyperframes runtime.",
      });
      const capability = await this.checkCapability();
      if (!capability.available) {
        throw new VideoRenderAdapterError(
          "RENDER_ADAPTER_UNAVAILABLE",
          capability.reason || "Hyperframes runtime is unavailable."
        );
      }
      const runtime = dependencies.prepareRuntime?.();

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
        const html =
          "compositionHtml" in input
            ? input.compositionHtml
            : dependencies.compileBlueprintToHtml({
                ...input.blueprint,
                aspectRatio: input.aspectRatio,
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
              "composition.html",
              "-o",
              "output.mp4",
              ...renderResolutionArgs(input),
              "--strict",
            ],
            {
              cwd: context.temporaryDirectory,
              ...(runtime ? { env: runtime.environment } : {}),
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
        const processResult = await waitForRenderer(
          child,
          context.signal,
          context.timeoutMs,
          [
            context.temporaryDirectory,
            dependencies.cliPath,
            process.cwd(),
          ],
          () => {
            if (renderingReported) return;
            renderingReported = true;
            void context.onProgress({
              stage: "rendering",
              progress: 60,
              message: "Rendering video frames.",
            });
          }
        );
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
        let finalOutputPath = outputPath;
        if ("voiceAudioPath" in input && input.voiceAudioPath) {
          const voiceDuration = Math.max(
            1,
            Math.min(180, Number(input.voiceDurationSeconds) || 1)
          );
          const voicePlaybackRate = Math.min(
            2,
            Math.max(0.5, Number(input.voicePlaybackRate) || 1)
          );
          const outputWithVoicePath = join(
            context.temporaryDirectory,
            "output-with-voice.mp4"
          );
          const ffmpegPath =
            runtime?.environment.HYPERFRAMES_FFMPEG_PATH ||
            runtime?.environment.VIDEO_CAPTION_FFMPEG_PATH ||
            "ffmpeg";
          const voiceInputArgs = input.voiceAudioFormat === "pcm"
            ? [
                "-f",
                "s16le",
                "-ar",
                String(input.voiceAudioSampleRate || 24_000),
                "-ac",
                String(input.voiceAudioChannels || 1),
                "-i",
                input.voiceAudioPath,
              ]
            : ["-i", input.voiceAudioPath];
          await context.onProgress({
            stage: "output-verification",
            progress: 84,
            message: "Muxing voice into final MP4.",
          });
          let muxProcess: HyperframesRenderProcess;
          try {
            const voiceFilter = voicePlaybackRate === 1
              ? '[1:a]apad[voice]'
              : `[1:a]atempo=${voicePlaybackRate.toFixed(3)},apad[voice]`;
            muxProcess = dependencies.spawnProcess(
              ffmpegPath,
              [
                "-y",
                "-i",
                outputPath,
                ...voiceInputArgs,
                "-filter_complex",
                voiceFilter,
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
                String(voiceDuration),
                "-movflags",
                "+faststart",
                outputWithVoicePath,
              ],
              {
                cwd: context.temporaryDirectory,
                ...(runtime ? { env: runtime.environment } : {}),
                shell: false,
                windowsHide: true,
              }
            );
          } catch (error) {
            throw new VideoRenderAdapterError(
              "RENDER_PROCESS_START_FAILED",
              "FFmpeg voice mux could not start.",
              {
                reason: error instanceof Error
                  ? error.message.slice(0, 512)
                  : "Unknown process error.",
              }
            );
          }
          const muxResult = await waitForRenderer(
            muxProcess,
            context.signal,
            context.timeoutMs,
            [context.temporaryDirectory, process.cwd()],
            () => undefined
          );
          if (muxResult.code !== 0) {
            throw new VideoRenderAdapterError(
              "RENDER_PROCESS_FAILED",
              "FFmpeg voice mux failed.",
              { exitCode: muxResult.code, stderr: muxResult.stderr }
            );
          }
          finalOutputPath = outputWithVoicePath;
        }
        let output: Buffer;
        try {
          output = await dependencies.fileSystem.readFile(finalOutputPath);
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
        let outputUrl: string;
        try {
          outputUrl = await dependencies.uploadOutput(output);
        } catch (error) {
          throw new VideoRenderAdapterError(
            "RENDER_UPLOAD_FAILED",
            "Rendered video upload failed.",
            {
              reason: sanitizeRenderDiagnostic(
                error instanceof Error ? error.message : "Unknown upload error.",
                [context.temporaryDirectory, process.cwd()]
              ).slice(0, 512),
            }
          );
        }
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

const require = createRequire(join(process.cwd(), "package.json"));

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
  prepareRuntime: createDefaultRuntimeConfiguration,
});
