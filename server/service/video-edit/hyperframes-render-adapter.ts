import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import sharp from "sharp";
import { cloudinaryService } from "../cloudinary.service";
import { resolveMediaBinary } from "../media-binary.service";
import { hyperframeService } from "./hyperframe";
import {
  VideoRenderAdapterError,
  type VideoRenderAdapter,
  type VideoRenderExecutionContext,
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
  probeOutput?: (
    outputPath: string,
    input: VideoRenderInput,
    context: VideoRenderExecutionContext,
    environment?: NodeJS.ProcessEnv
  ) => Promise<void>;
  verifyFrames?: (
    outputPath: string,
    input: VideoRenderInput,
    context: VideoRenderExecutionContext,
    environment?: NodeJS.ProcessEnv
  ) => Promise<Record<string, number>>;
}

export type HyperframesRuntimeConfiguration = {
  environment: NodeJS.ProcessEnv;
  missing: string[];
};

const supportedAspectRatios = new Set(["16:9", "9:16", "1:1"]);
const supportedResolutions = new Set(["720p", "1080p"]);
const maximumDiagnosticLength = 8192;
const expectedDimensions = {
  "16:9": { "720p": [1280, 720], "1080p": [1920, 1080] },
  "9:16": { "720p": [720, 1280], "1080p": [1080, 1920] },
  "1:1": { "720p": [720, 720], "1080p": [1080, 1080] },
} as const;

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
  const voiceSegmentsAreInvalid = Boolean(
    input.voiceSegments && (
      input.voiceSegments.length === 0 ||
      input.voiceSegments.some((segment) =>
        !segment.audioPath.trim() ||
        !Number.isFinite(segment.startSeconds) ||
        segment.startSeconds < 0 ||
        !Number.isFinite(segment.durationSeconds) ||
        segment.durationSeconds <= 0
      )
    )
  );
  if (
    !input.jobId.trim() ||
    hasBlueprint === hasCompositionHtml ||
    !supportedAspectRatios.has(input.aspectRatio) ||
    !supportedResolutions.has(input.resolution) ||
    voiceSegmentsAreInvalid ||
    Boolean(input.voiceAudioPath && input.voiceSegments?.length)
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
  const root = resolve(temporaryDirectory);
  const audioPaths = [
    ...(input.voiceAudioPath ? [input.voiceAudioPath] : []),
    ...(input.voiceSegments || []).map((segment) => segment.audioPath),
  ];
  for (const path of audioPaths) {
    const audioPath = resolve(path);
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
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    let stdout = "";
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

    child.stdout.on("data", (data) => {
      stdout = sanitizeRenderDiagnostic(
        `${stdout}${String(data)}`,
        sensitivePaths
      );
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
        resolve({ code, stdout, stderr });
      });
    });
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });
}

type FfprobePayload = {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
  format?: { duration?: string };
};

export function validateProbePayload(payload: FfprobePayload, input: VideoRenderInput) {
  const video = payload.streams?.find((stream) => stream.codec_type === "video");
  const audio = payload.streams?.find((stream) => stream.codec_type === "audio");
  const [expectedWidth, expectedHeight] = expectedDimensions[input.aspectRatio][input.resolution];
  const duration = Number(payload.format?.duration || video?.duration);
  const expectedDuration = Math.max(
    1,
    Number(input.durationSeconds) || Number(input.voiceDurationSeconds) || duration
  );
  const durationTolerance = Math.max(1, expectedDuration * 0.08);
  const audioDuration = Number(audio?.duration);
  const hasVoice = Boolean(input.voiceAudioPath || input.voiceSegments?.length);
  const voiceCoverageIsInvalid = Boolean(
    hasVoice &&
    (!Number.isFinite(audioDuration) || audioDuration < expectedDuration * 0.8)
  );
  if (
    !video ||
    video.width !== expectedWidth ||
    video.height !== expectedHeight ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    Math.abs(duration - expectedDuration) > durationTolerance ||
    (hasVoice && !audio) ||
    voiceCoverageIsInvalid
  ) {
    throw new VideoRenderAdapterError(
      "RENDER_OUTPUT_INVALID",
      "Rendered MP4 failed video or audio verification."
    );
  }
}

async function probeRenderedOutput(
  outputPath: string,
  input: VideoRenderInput,
  context: VideoRenderExecutionContext,
  environment?: NodeJS.ProcessEnv
) {
  const ffprobePath =
    environment?.HYPERFRAMES_FFPROBE_PATH ||
    environment?.VIDEO_CAPTION_FFPROBE_PATH ||
    "ffprobe";
  let child: HyperframesRenderProcess;
  try {
    child = spawn(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height,duration:format=duration",
        "-of",
        "json",
        outputPath,
      ],
      {
        cwd: context.temporaryDirectory,
        ...(environment ? { env: environment } : {}),
        shell: false,
        windowsHide: true,
      }
    ) as HyperframesRenderProcess;
  } catch (error) {
    throw new VideoRenderAdapterError(
      "RENDER_OUTPUT_INVALID",
      "FFprobe output verification could not start.",
      { reason: error instanceof Error ? error.message.slice(0, 512) : "Unknown probe error." }
    );
  }
  const result = await waitForRenderer(
    child,
    context.signal,
    context.timeoutMs,
    [context.temporaryDirectory, process.cwd()],
    () => undefined
  );
  if (result.code !== 0) {
    throw new VideoRenderAdapterError(
      "RENDER_OUTPUT_INVALID",
      "FFprobe output verification failed.",
      { exitCode: result.code, stderr: result.stderr }
    );
  }
  try {
    validateProbePayload(JSON.parse(result.stdout) as FfprobePayload, input);
  } catch (error) {
    if (error instanceof VideoRenderAdapterError) throw error;
    throw new VideoRenderAdapterError(
      "RENDER_OUTPUT_INVALID",
      "FFprobe returned invalid output metadata."
    );
  }
}

export type RepresentativeFrameSample = {
  timeSeconds: number;
  stdevLuma: number;
  edgeRatio: number;
  darkRatio: number;
  lightRatio: number;
  luma: Uint8Array;
};

function meanAbsoluteFrameDifference(left: Uint8Array, right: Uint8Array) {
  if (left.length === 0 || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference += Math.abs(left[index] - right[index]);
  return difference / left.length;
}

export function validateRepresentativeFrameSamples(samples: RepresentativeFrameSample[]) {
  if (samples.length < 3) {
    throw new VideoRenderAdapterError("RENDER_OUTPUT_INVALID", "Rendered MP4 does not contain enough representative frames.");
  }
  const blankFrame = samples.find((sample) =>
    sample.luma.length === 0 || sample.darkRatio >= 0.995 || sample.lightRatio >= 0.995 ||
    (sample.stdevLuma < 1.25 && sample.edgeRatio < 0.0005)
  );
  if (blankFrame) {
    throw new VideoRenderAdapterError(
      "RENDER_OUTPUT_INVALID",
      "Rendered MP4 contains a blank or visually empty representative frame.",
      { frameTimeSeconds: Number(blankFrame.timeSeconds.toFixed(3)) }
    );
  }
  let maximumFrameDifference = 0;
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      maximumFrameDifference = Math.max(
        maximumFrameDifference,
        meanAbsoluteFrameDifference(samples[left].luma, samples[right].luma)
      );
    }
  }
  if (maximumFrameDifference < 0.12) {
    throw new VideoRenderAdapterError(
      "RENDER_OUTPUT_INVALID",
      "Rendered MP4 representative frames are frozen or missing visible animation.",
      { maximumFrameDifference: Number(maximumFrameDifference.toFixed(4)) }
    );
  }
  return {
    representativeFramesChecked: samples.length,
    minimumFrameEdgeRatio: Number(Math.min(...samples.map((sample) => sample.edgeRatio)).toFixed(5)),
    maximumFrameDifference: Number(maximumFrameDifference.toFixed(4)),
  };
}

function representativeFrameTimes(input: VideoRenderInput) {
  const durationSeconds = Math.max(1, Number(input.durationSeconds) || Number(input.voiceDurationSeconds) || 10);
  const requested = input.verificationTimesSeconds?.length
    ? input.verificationTimesSeconds
    : [durationSeconds * 0.08, durationSeconds * 0.5, durationSeconds * 0.92];
  const normalized = requested
    .map((time) => Math.min(Math.max(0.05, Number(time) || 0.05), Math.max(0.05, durationSeconds - 0.05)))
    .filter((time, index, values) => values.findIndex((candidate) => Math.abs(candidate - time) < 0.01) === index);
  return normalized.length >= 3
    ? normalized.slice(0, 3)
    : [durationSeconds * 0.08, durationSeconds * 0.5, durationSeconds * 0.92];
}

async function readRepresentativeFrame(framePath: string, timeSeconds: number): Promise<RepresentativeFrameSample> {
  const { data, info } = await sharp(framePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const luma = new Uint8Array(pixelCount);
  let total = 0;
  let squaredTotal = 0;
  let darkPixels = 0;
  let lightPixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * info.channels;
    const value = Math.round(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722);
    luma[pixel] = value;
    total += value;
    squaredTotal += value * value;
    if (value <= 8) darkPixels += 1;
    if (value >= 247) lightPixels += 1;
  }
  let strongEdges = 0;
  let comparedEdges = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      if (x + 1 < info.width) {
        comparedEdges += 1;
        if (Math.abs(luma[index] - luma[index + 1]) >= 12) strongEdges += 1;
      }
      if (y + 1 < info.height) {
        comparedEdges += 1;
        if (Math.abs(luma[index] - luma[index + info.width]) >= 12) strongEdges += 1;
      }
    }
  }
  const meanLuma = total / Math.max(1, pixelCount);
  const variance = squaredTotal / Math.max(1, pixelCount) - meanLuma * meanLuma;
  return {
    timeSeconds,
    stdevLuma: Math.sqrt(Math.max(0, variance)),
    edgeRatio: strongEdges / Math.max(1, comparedEdges),
    darkRatio: darkPixels / Math.max(1, pixelCount),
    lightRatio: lightPixels / Math.max(1, pixelCount),
    luma,
  };
}

async function verifyRenderedFrames(
  outputPath: string,
  input: VideoRenderInput,
  context: VideoRenderExecutionContext,
  environment?: NodeJS.ProcessEnv
) {
  const ffmpegPath = environment?.HYPERFRAMES_FFMPEG_PATH || environment?.VIDEO_CAPTION_FFMPEG_PATH || "ffmpeg";
  const samples: RepresentativeFrameSample[] = [];
  for (const [index, timeSeconds] of representativeFrameTimes(input).entries()) {
    const framePath = join(context.temporaryDirectory, `qa-frame-${index + 1}.png`);
    let child: HyperframesRenderProcess;
    try {
      child = spawn(ffmpegPath, [
        "-y", "-ss", timeSeconds.toFixed(3), "-i", outputPath,
        "-frames:v", "1", "-vf", "scale=160:-2:flags=area", framePath,
      ], {
        cwd: context.temporaryDirectory,
        ...(environment ? { env: environment } : {}),
        shell: false,
        windowsHide: true,
      }) as HyperframesRenderProcess;
    } catch (error) {
      throw new VideoRenderAdapterError(
        "RENDER_OUTPUT_INVALID",
        "Representative frame verification could not start.",
        { reason: error instanceof Error ? error.message.slice(0, 512) : "Unknown frame verifier error." }
      );
    }
    const result = await waitForRenderer(
      child, context.signal, context.timeoutMs, [context.temporaryDirectory, process.cwd()], () => undefined
    );
    if (result.code !== 0) {
      throw new VideoRenderAdapterError(
        "RENDER_OUTPUT_INVALID",
        "Representative frame extraction failed.",
        { exitCode: result.code, stderr: result.stderr }
      );
    }
    try {
      samples.push(await readRepresentativeFrame(framePath, timeSeconds));
    } catch (error) {
      throw new VideoRenderAdapterError(
        "RENDER_OUTPUT_INVALID",
        "Representative frame could not be inspected.",
        { reason: error instanceof Error ? error.message.slice(0, 512) : "Unknown frame inspection error." }
      );
    }
  }
  return validateRepresentativeFrameSamples(samples);
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

      const htmlPath = join(context.temporaryDirectory, "index.html");
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
              stdout: processResult.stdout,
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
        if (input.voiceAudioPath || input.voiceSegments?.length) {
          const voiceDuration = Math.max(
            1,
            Math.min(
              180,
              Number(input.voiceDurationSeconds) || Number(input.durationSeconds) || 1
            )
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
          const voiceInputArgs = input.voiceSegments?.length
            ? input.voiceSegments.flatMap((segment) => segment.audioFormat === "pcm"
              ? [
                  "-f",
                  "s16le",
                  "-ar",
                  String(segment.audioSampleRate || 24_000),
                  "-ac",
                  String(segment.audioChannels || 1),
                  "-i",
                  segment.audioPath,
                ]
              : ["-i", segment.audioPath])
            : input.voiceAudioFormat === "pcm"
              ? [
                  "-f",
                  "s16le",
                  "-ar",
                  String(input.voiceAudioSampleRate || 24_000),
                  "-ac",
                  String(input.voiceAudioChannels || 1),
                  "-i",
                  input.voiceAudioPath!,
                ]
              : ["-i", input.voiceAudioPath!];
          await context.onProgress({
            stage: "output-verification",
            progress: 84,
            message: "Muxing voice into final MP4.",
          });
          let muxProcess: HyperframesRenderProcess;
          try {
            const voiceFilter = input.voiceSegments?.length
              ? [
                  input.voiceSegments.map((segment, index) => {
                    const speechWindow = Math.max(0.2, segment.durationSeconds * 0.9);
                    const sourceDuration = Number(segment.sourceDurationSeconds);
                    const measuredRate = Number.isFinite(sourceDuration) && sourceDuration > 0
                      ? sourceDuration / speechWindow
                      : Number(segment.playbackRate) || 1;
                    const rate = Math.min(2, Math.max(0.75, measuredRate));
                    const delayMs = Math.max(0, Math.round(segment.startSeconds * 1_000));
                    const slotDuration = segment.durationSeconds.toFixed(3);
                    return `[${index + 1}:a]atempo=${rate.toFixed(3)},apad=pad_dur=${slotDuration},atrim=duration=${slotDuration},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[voice_${index}]`;
                  }).join(";"),
                  `${input.voiceSegments.map((_, index) => `[voice_${index}]`).join("")}amix=inputs=${input.voiceSegments.length}:duration=longest:normalize=0,apad=pad_dur=${voiceDuration.toFixed(3)},atrim=duration=${voiceDuration.toFixed(3)}[voice]`,
                ].join(";")
              : voicePlaybackRate === 1
                ? '[1:a]anull[voice]'
                : `[1:a]atempo=${voicePlaybackRate.toFixed(3)}[voice]`;
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
        if (dependencies.probeOutput) {
          await dependencies.probeOutput(
            finalOutputPath,
            input,
            context,
            runtime?.environment
          );
        }
        const visualDiagnostics = dependencies.verifyFrames
          ? await dependencies.verifyFrames(
              finalOutputPath,
              input,
              context,
              runtime?.environment
            )
          : undefined;
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
          ...(visualDiagnostics ? { diagnostics: visualDiagnostics } : {}),
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
  probeOutput: probeRenderedOutput,
  verifyFrames: verifyRenderedFrames,
});
