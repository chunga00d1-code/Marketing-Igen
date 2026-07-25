export const VIDEO_CAPTION_MODES = ["speech", "context", "combined"] as const;
export type VideoCaptionMode = (typeof VIDEO_CAPTION_MODES)[number];

export const VIDEO_CAPTION_LANES = ["speech", "context"] as const;
export type VideoCaptionLane = (typeof VIDEO_CAPTION_LANES)[number];

export const VIDEO_CAPTION_SOURCE_KINDS = [
  "upload",
  "media_library",
  "generated",
  "campaign",
] as const;
export type VideoCaptionSourceKind = (typeof VIDEO_CAPTION_SOURCE_KINDS)[number];

export const VIDEO_CAPTION_PROJECT_STATUSES = [
  "draft",
  "queued_analysis",
  "analyzing",
  "transcribing",
  "generating_context",
  "ready_for_review",
  "queued_render",
  "rendering",
  "completed",
  "retrying",
  "failed",
  "cancelled",
] as const;
export type VideoCaptionProjectStatus =
  (typeof VIDEO_CAPTION_PROJECT_STATUSES)[number];

export const VIDEO_CAPTION_JOB_OPERATIONS = [
  "analyze",
  "transcribe",
  "generate_context",
  "render_preview",
  "render_final",
] as const;
export type VideoCaptionJobOperation =
  (typeof VIDEO_CAPTION_JOB_OPERATIONS)[number];

export const VIDEO_CAPTION_JOB_STATUSES = [
  "queued",
  "processing",
  "awaiting_provider",
  "retrying",
  "completed",
  "failed",
  "cancelled",
] as const;
export type VideoCaptionJobStatus =
  (typeof VIDEO_CAPTION_JOB_STATUSES)[number];

export const VIDEO_CAPTION_ERROR_TYPES = [
  "validation",
  "authentication",
  "permission",
  "budget",
  "provider",
  "storage",
  "transient",
  "terminal",
] as const;
export type VideoCaptionErrorType =
  (typeof VIDEO_CAPTION_ERROR_TYPES)[number];

export const VIDEO_CAPTION_SOURCE_REFERENCE_KINDS = [
  "user_input",
  "marketing_content",
  "campaign_slot",
  "knowledge_chunk",
  "video_scene",
  "speech",
] as const;
export type VideoCaptionSourceReferenceKind =
  (typeof VIDEO_CAPTION_SOURCE_REFERENCE_KINDS)[number];

export type VideoCaptionPosition =
  | "top"
  | "center"
  | "bottom"
  | "safe_auto";

export interface VideoCaptionStyle {
  preset: "classic" | "clean" | "highlight" | "custom";
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: VideoCaptionPosition;
  maxLines: 1 | 2;
  safeAreaPercent: number;
}

export const DEFAULT_VIDEO_CAPTION_STYLE: VideoCaptionStyle = {
  preset: "clean",
  fontFamily: "Arial",
  fontSize: 48,
  fontWeight: 700,
  textColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.72,
  position: "bottom",
  maxLines: 2,
  safeAreaPercent: 8,
};

export interface VideoCaptionSource {
  kind: VideoCaptionSourceKind;
  url: string;
  mediaId?: string;
  fingerprint?: string;
  originalName?: string;
}

export interface VideoCaptionMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  language?: string;
  proxyUrl?: string;
  contentType?: string;
  contentLength?: number;
}

export interface VideoCaptionContextLinks {
  marketingContentId?: string;
  campaignId?: string;
  campaignSlotId?: string;
}

export interface VideoCaptionKnowledgeSnapshot {
  purpose: "caption";
  sourceIds: string[];
  indexVersion?: string;
  retrievedAt?: string;
}

export interface VideoCaptionProgress {
  stage: string;
  percent: number;
  message?: string;
}

export interface VideoCaptionClassifiedError {
  type: VideoCaptionErrorType;
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
}

export interface VideoCaptionOutput {
  subtitleUrl?: string;
  captionedVideoUrl?: string;
  previewUrl?: string;
  renderHash?: string;
}

export interface VideoCaptionSourceReference {
  kind: VideoCaptionSourceReferenceKind;
  sourceId?: string;
  documentId?: string;
  chunkId?: string;
  title?: string;
  version?: string;
  excerpt?: string;
}

export interface VideoCaptionSegmentDto {
  id: string;
  projectId: string;
  version: number;
  lane: VideoCaptionLane;
  startMs: number;
  endMs: number;
  text: string;
  sceneId?: string;
  confidence?: number;
  sourceReferences: VideoCaptionSourceReference[];
  styleOverride?: Partial<VideoCaptionStyle>;
  lockedByUser: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface VideoCaptionProjectDto {
  id: string;
  name: string;
  mode: VideoCaptionMode;
  source: VideoCaptionSource;
  video: VideoCaptionMetadata;
  contextLinks?: VideoCaptionContextLinks;
  contextBrief?: string;
  knowledgeSnapshot?: VideoCaptionKnowledgeSnapshot;
  style: VideoCaptionStyle;
  status: VideoCaptionProjectStatus;
  currentVersion: number;
  progress?: VideoCaptionProgress;
  output?: VideoCaptionOutput;
  lastError?: VideoCaptionClassifiedError;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoCaptionJobDto {
  id: string;
  projectId: string;
  operation: VideoCaptionJobOperation;
  status: VideoCaptionJobStatus;
  attempt: number;
  maxAttempts: number;
  progress: VideoCaptionProgress;
  provider?: string;
  model?: string;
  estimatedCost?: number;
  actualCost?: number;
  lastError?: VideoCaptionClassifiedError;
  createdAt: string;
  updatedAt: string;
}

export interface VideoCaptionProjectDetailDto {
  project: VideoCaptionProjectDto;
  segments: VideoCaptionSegmentDto[];
  jobs: VideoCaptionJobDto[];
}

export const VIDEO_CAPTION_CONTEXT_PRIORITY = [
  "user_input",
  "marketing_content",
  "campaign_slot",
  "knowledge_chunk",
  "video_scene",
] as const;

export interface VideoCaptionQueuePayload {
  jobId: string;
}

export interface CreateVideoCaptionProjectInput {
  name: string;
  mode: VideoCaptionMode;
  source: Omit<VideoCaptionSource, "fingerprint">;
  contextLinks?: VideoCaptionContextLinks;
  contextBrief?: string;
  style?: Partial<VideoCaptionStyle>;
  autoAnalyze?: boolean;
  idempotencyKey: string;
}

export interface UpdateVideoCaptionProjectInput {
  name?: string;
  mode?: VideoCaptionMode;
  contextLinks?: VideoCaptionContextLinks;
  contextBrief?: string;
  style?: Partial<VideoCaptionStyle>;
}

export interface ReplaceVideoCaptionSegmentsInput {
  expectedVersion: number;
  segments: Array<
    Omit<
      VideoCaptionSegmentDto,
      "id" | "projectId" | "version" | "createdAt" | "updatedAt"
    >
  >;
}

export const VIDEO_CAPTION_STATUS_TRANSITIONS: Record<
  VideoCaptionProjectStatus,
  readonly VideoCaptionProjectStatus[]
> = {
  draft: ["queued_analysis", "cancelled"],
  queued_analysis: ["analyzing", "cancelled", "failed"],
  analyzing: ["ready_for_review", "cancelled", "failed", "retrying"],
  transcribing: ["ready_for_review", "cancelled", "failed", "retrying"],
  generating_context: ["ready_for_review", "cancelled", "failed", "retrying"],
  ready_for_review: [
    "queued_analysis",
    "transcribing",
    "generating_context",
    "queued_render",
    "cancelled",
  ],
  queued_render: ["rendering", "cancelled", "failed"],
  rendering: [
    "ready_for_review",
    "completed",
    "cancelled",
    "failed",
    "retrying",
  ],
  completed: ["queued_analysis", "queued_render"],
  retrying: [
    "queued_analysis",
    "analyzing",
    "transcribing",
    "generating_context",
    "queued_render",
    "rendering",
    "cancelled",
    "failed",
  ],
  failed: ["retrying", "queued_analysis", "queued_render", "cancelled"],
  cancelled: ["retrying", "queued_analysis"],
};

export function canTransitionVideoCaptionStatus(
  from: VideoCaptionProjectStatus,
  to: VideoCaptionProjectStatus
): boolean {
  return from === to || VIDEO_CAPTION_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalVideoCaptionStatus(
  status: VideoCaptionProjectStatus
): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export interface SpeechTranscriptionProvider {
  readonly name: string;
  start(input: {
    videoUrl: string;
    language?: string;
    idempotencyKey: string;
    webhookMetadata: Record<string, string>;
  }): Promise<{
    providerRequestId: string;
  }>;
  retrieve(providerRequestId: string): Promise<{
    language?: string;
    words: Array<{
      text: string;
      startMs: number;
      endMs: number;
      confidence?: number;
    }>;
    cost?: number;
  } | null>;
}

export interface VideoSceneAnalysisProvider {
  readonly name: string;
  analyze(input: {
    videoUrl: string;
    proxyUrl?: string;
    idempotencyKey: string;
  }): Promise<{
    scenes: Array<{
      id: string;
      startMs: number;
      endMs: number;
      summary: string;
      visibleText: string[];
    }>;
    providerRequestId?: string;
    cost?: number;
  }>;
}

export interface ContextualCaptionProvider {
  readonly name: string;
  generate(input: {
    scenes: Array<{
      id: string;
      startMs: number;
      endMs: number;
      summary: string;
    }>;
    context: string;
    idempotencyKey: string;
  }): Promise<{
    candidates: Array<{
      sceneId: string;
      text: string;
      sourceReferences: VideoCaptionSourceReference[];
    }>;
    providerRequestId?: string;
    cost?: number;
  }>;
}

export interface VideoCaptionRenderProvider {
  readonly name: string;
  render(input: {
    videoUrl: string;
    segments: VideoCaptionSegmentDto[];
    style: VideoCaptionStyle;
    preview: boolean;
    idempotencyKey: string;
  }): Promise<{
    outputUrl: string;
    providerRequestId?: string;
    cost?: number;
  }>;
}
