export type VideoRenderAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoRenderResolution = "720p" | "1080p";
export type VideoRenderVoiceAudioFormat = "mp3" | "pcm";

export type VideoRenderVoiceSegment = {
  audioPath: string;
  audioFormat?: VideoRenderVoiceAudioFormat;
  audioSampleRate?: number;
  audioChannels?: number;
  startSeconds: number;
  durationSeconds: number;
  sourceDurationSeconds?: number;
  playbackRate?: number;
};

export type VideoRenderAdapterErrorCode =
  | "RENDER_ADAPTER_UNAVAILABLE"
  | "RENDER_INPUT_INVALID"
  | "RENDER_PROCESS_START_FAILED"
  | "RENDER_PROCESS_TIMEOUT"
  | "RENDER_PROCESS_ABORTED"
  | "RENDER_PROCESS_FAILED"
  | "RENDER_OUTPUT_MISSING"
  | "RENDER_OUTPUT_INVALID"
  | "RENDER_UPLOAD_FAILED";

export type VideoRenderDiagnostics = Record<
  string,
  string | number | boolean | null
>;

export type VideoRenderBlueprintSource = {
  blueprint: {
    timeline: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  compositionHtml?: never;
};

export type VideoRenderHtmlSource = {
  compositionHtml: string;
  blueprint?: never;
};

export type VideoRenderInput = {
  jobId: string;
  aspectRatio: VideoRenderAspectRatio;
  resolution: VideoRenderResolution;
  durationSeconds?: number;
  sourceVideoUrl?: string;
  voiceAudioPath?: string;
  voiceAudioFormat?: VideoRenderVoiceAudioFormat;
  voiceAudioSampleRate?: number;
  voiceAudioChannels?: number;
  voiceDurationSeconds?: number;
  voicePlaybackRate?: number;
  verificationTimesSeconds?: number[];
  voiceSegments?: VideoRenderVoiceSegment[];
} & (VideoRenderBlueprintSource | VideoRenderHtmlSource);

export interface VideoRenderCapability {
  available: boolean;
  reason?: string;
}

export type VideoRenderProgressStage =
  | "runtime-check"
  | "html-preparation"
  | "renderer-start"
  | "rendering"
  | "output-verification"
  | "uploading";

export interface VideoRenderProgress {
  stage: VideoRenderProgressStage;
  progress: number;
  message: string;
}

export interface VideoRenderExecutionContext {
  signal: AbortSignal;
  timeoutMs: number;
  temporaryDirectory: string;
  onProgress: (progress: VideoRenderProgress) => void | Promise<void>;
}

export interface VideoRenderResult {
  engine: string;
  outputUrl: string;
  diagnostics?: VideoRenderDiagnostics;
}

export interface VideoRenderAdapter {
  readonly id: string;
  checkCapability(): Promise<VideoRenderCapability>;
  validateInput(input: VideoRenderInput): void;
  render(
    input: VideoRenderInput,
    context: VideoRenderExecutionContext
  ): Promise<VideoRenderResult>;
}

export class VideoRenderAdapterError extends Error {
  constructor(
    readonly code: VideoRenderAdapterErrorCode,
    message: string,
    readonly diagnostics?: VideoRenderDiagnostics
  ) {
    super(message);
    this.name = "VideoRenderAdapterError";
  }
}
