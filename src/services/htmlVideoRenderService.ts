import { getAccessToken } from "./authService";

export type HtmlVideoAspectRatio = "16:9" | "9:16" | "1:1";
export type HtmlVideoResolution = "720p" | "1080p";
export type HtmlVideoRenderStatus =
  | "queued"
  | "rendering"
  | "uploading"
  | "completed"
  | "failed";

export type HtmlVideoAssetRole = "background" | "hero" | "logo" | "overlay";

export type HtmlVideoReferenceSlot = {
  id: string;
  name: string;
  kind: "image";
  role?: HtmlVideoAssetRole;
  includeInVideo?: boolean;
  width?: number;
  height?: number;
};

export type HtmlVideoAsset = HtmlVideoReferenceSlot & {
  url: string;
};

export type HtmlVideoPromptAssumptions = {
  requestSpecVersion?: "1.0";
  mode?: "create" | "revision";
  contentMode?: string;
  narrationLanguage?: string;
  languageLock?: string;
  durationPolicy?: "explicit" | "inferred" | "preserve-existing";
  durationSeconds?: number;
  aspectRatio?: HtmlVideoAspectRatio;
  imagePolicy?: "none" | "embed" | "reference" | "mixed";
  inputImageCount?: number;
  sourceOrder?: "preserve";
  preserveUnrequestedProperties?: boolean;
};

export type HtmlVideoPromptProvenance = {
  rawUserPrompt: string;
  masterPrompt?: string;
  inferredAssumptions?: HtmlVideoPromptAssumptions;
};


export type HtmlVideoScenePlanItem = {
  id: string;
  order: number;
  purpose: "opening" | "content" | "closing";
  sourceUnitIds: string[];
  onScreenText: string[];
  narration: string;
  startSeconds: number;
  endSeconds: number;
  transition: "crossfade" | "slide-left" | "slide-right";
  assetIds: string[];
};

export type HtmlVideoPipelineMetadata = {
  version: "2.0";
  sourceText: string;
  promptProvenance?: HtmlVideoPromptProvenance;
  sourceContextRefs: Array<{
    id: string;
    type: "prompt" | "prompt_file" | "reference" | "asset" | "history";
    label: string;
  }>;
  videoBrief: {
    objective: string;
    tone: string;
    visualStyle: string;
    voiceRequired: boolean;
    exactPhrases: string[];
    videoSpec: {
      aspectRatio: HtmlVideoAspectRatio;
      resolution: HtmlVideoResolution;
      durationSeconds: number;
      language: string;
      audience: string;
      platform: "tiktok" | "reels" | "shorts" | "facebook" | "generic";
      cta: string;
    };
  };
  contentUnits: Array<{
    id: string;
    order: number;
    assetId?: string;
    sourceText: string;
    normalizedText: string;
    sourceRefs: string[];
    sourceKind?: "prompt" | "document" | "image_ocr" | "history";
    confidence?: number;
    region?: {
      x: number;
      y: number;
      width: number;
      height: number;
      coordinateSpace: "normalized";
    };
    required: boolean;
    requiredVerbatim: boolean;
  }>;
  scenePlan: HtmlVideoScenePlanItem[];
  findings: Array<{
    stage: "grounding" | "planning" | "visual" | "voice" | "validation";
    code: string;
    severity: "info" | "warning" | "error";
    message: string;
    sceneId?: string;
  }>;
};

const MAX_PIPELINE_CONTENT_UNIT_TEXT_LENGTH = 4_000;

function boundPipelineContentUnitText(value: string) {
  return value.trim().slice(0, MAX_PIPELINE_CONTENT_UNIT_TEXT_LENGTH);
}

export function normalizeHtmlVideoPipelineForRender(
  pipeline?: HtmlVideoPipelineMetadata
) {
  if (!pipeline) return undefined;
  return {
    ...pipeline,
    contentUnits: pipeline.contentUnits.map((unit) => {
      const originalSourceText = unit.sourceText.trim();
      const originalNormalizedText = unit.normalizedText.trim();
      const sourceText = boundPipelineContentUnitText(unit.sourceText);
      const normalizedText = boundPipelineContentUnitText(unit.normalizedText) || sourceText;
      const wasBounded = sourceText.length !== originalSourceText.length
        || normalizedText.length !== originalNormalizedText.length;
      return {
        ...unit,
        sourceText,
        normalizedText,
        ...(wasBounded ? { required: false, requiredVerbatim: false } : {}),
      };
    }),
  };
}

export type HtmlVideoPreviewRequest = {
  html: string;
  css: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
  assets?: HtmlVideoAsset[];
  scenePlan?: HtmlVideoScenePlanItem[];
};

export type HtmlVideoDraftRequest = {
  prompt: string;
  promptProvenance?: HtmlVideoPromptProvenance;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
  promptHistoryId?: string;
  referenceContext?: string;
  primaryPromptContext?: string;
  primaryPromptFileName?: string;
  referenceAssets?: HtmlVideoReferenceSlot[];
  editSource?: {
    html: string;
    css: string;
    voiceScript?: string;
    snapshotHash?: string;
    pipeline?: HtmlVideoPipelineMetadata;
  };
};

export type HtmlVideoRenderEditSource = NonNullable<HtmlVideoDraftRequest["editSource"]> & {
  assets?: HtmlVideoAsset[];
};

export type HtmlVideoGenerationStatus =
  | "queued"
  | "grounding"
  | "planning"
  | "composing"
  | "validating"
  | "ready"
  | "failed";

export type CreateHtmlVideoGenerationRequest = HtmlVideoDraftRequest & {
  idempotencyKey: string;
};

export type HtmlVideoGenerationDetail = {
  id: string;
  status: HtmlVideoGenerationStatus;
  currentStage: HtmlVideoGenerationStatus;
  progress: number;
  stageMessage: string;
  error: string | null;
  draft?: HtmlVideoDraft;
  createdAt: string;
  updatedAt: string;
};

export type CreateHtmlVideoRenderRequest = HtmlVideoPreviewRequest & {
  idempotencyKey: string;
  promptHistoryId?: string;
  generationId?: string;
  voiceScript?: string;
  pipeline?: HtmlVideoPipelineMetadata;
};

export type HtmlVideoPreview = {
  compositionHtml: string;
  width: number;
  height: number;
};

export type HtmlVideoDraft = {
  html: string;
  css: string;
  voiceScript?: string;
  pipeline?: HtmlVideoPipelineMetadata;
};

export type HtmlVideoRenderDetail = {
  id: string;
  status: HtmlVideoRenderStatus;
  progress: number;
  stageMessage: string;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
  durationSeconds: number;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  promptHistoryId?: string | null;
  voiceEnabled: boolean;
  voiceStatus: "disabled" | "queued" | "generating" | "ready" | "failed";
};

export type HtmlVideoRenderHistoryFilter = "all" | "active" | "completed" | "failed";

export type HtmlVideoRenderListOptions = {
  page?: number;
  pageSize?: number;
  filter?: HtmlVideoRenderHistoryFilter;
};

export type HtmlVideoRenderPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type HtmlVideoRenderListResult = {
  items: HtmlVideoRenderDetail[];
  pagination: HtmlVideoRenderPagination;
};

export type HtmlVideoPromptHistory = {
  id: string;
  projectName: string;
  prompt: string;
  masterPrompt?: string;
  inferredAssumptions?: HtmlVideoPromptAssumptions;
  aspectRatio: HtmlVideoAspectRatio;
  referenceNames: string[];
  parentHistoryId: string | null;
  revision: number;
  createdAt: string;
  renderId: string | null;
};

export type CreateHtmlVideoPromptHistoryRequest = {
  projectName: string;
  prompt: string;
  masterPrompt?: string;
  inferredAssumptions?: HtmlVideoPromptAssumptions;
  aspectRatio: HtmlVideoAspectRatio;
  referenceNames: string[];
  parentHistoryId?: string;
};

const validStatuses = new Set<HtmlVideoRenderStatus>([
  "queued",
  "rendering",
  "uploading",
  "completed",
  "failed",
]);
const validVoiceStatuses = new Set<HtmlVideoRenderDetail["voiceStatus"]>([
  "disabled",
  "queued",
  "generating",
  "ready",
  "failed",
]);
const validAspectRatios = new Set<HtmlVideoAspectRatio>([
  "16:9",
  "9:16",
  "1:1",
]);
const validResolutions = new Set<HtmlVideoResolution>(["720p", "1080p"]);
const maxHtmlVideoSourceBytes = 100 * 1024;
const invalidHtmlVideoDraftMessage =
  "Dữ liệu bản nháp HTML-to-video không hợp lệ.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
) {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => actualKeys.includes(key))
  );
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function authHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

function envelopeData(payload: unknown) {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !("data" in payload)
  ) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "Phản hồi HTML-to-video không hợp lệ.";
    throw new Error(message);
  }
  return payload.data;
}

export function parseHtmlVideoPreviewResponse(
  payload: unknown
): HtmlVideoPreview {
  const raw = envelopeData(payload);
  if (
    !isRecord(raw) ||
    typeof raw.compositionHtml !== "string" ||
    !raw.compositionHtml.trim() ||
    !Number.isInteger(raw.width) ||
    Number(raw.width) <= 0 ||
    !Number.isInteger(raw.height) ||
    Number(raw.height) <= 0
  ) {
    throw new Error("Dữ liệu xem trước HTML-to-video không hợp lệ.");
  }
  return {
    compositionHtml: raw.compositionHtml,
    width: Number(raw.width),
    height: Number(raw.height),
  };
}

export function parseHtmlVideoDraftResponse(payload: unknown): HtmlVideoDraft {
  try {
    if (
      !isRecord(payload) ||
      !hasExactKeys(payload, ["success", "data"]) ||
      payload.success !== true ||
      !isRecord(payload.data) ||
       !(
         hasExactKeys(payload.data, ["html", "css"]) ||
         hasExactKeys(payload.data, ["html", "css", "voiceScript"]) ||
         hasExactKeys(payload.data, ["html", "css", "voiceScript", "pipeline"])
       )
    ) {
      throw new Error(invalidHtmlVideoDraftMessage);
    }
    const raw = payload.data;
    if (typeof raw.html !== "string" || typeof raw.css !== "string") {
      throw new Error(invalidHtmlVideoDraftMessage);
    }
    const html = raw.html.trim();
    const css = raw.css.trim();
    if (
      !html ||
      utf8ByteLength(raw.html) > maxHtmlVideoSourceBytes ||
      utf8ByteLength(raw.css) > maxHtmlVideoSourceBytes
    ) {
      throw new Error(invalidHtmlVideoDraftMessage);
    }
    if ("voiceScript" in raw && typeof raw.voiceScript !== "string") {
      throw new Error(invalidHtmlVideoDraftMessage);
    }
    const voiceScript =
      typeof raw.voiceScript === "string" ? raw.voiceScript.trim().slice(0, 8_000) : "";
    const pipeline = parseHtmlVideoPipeline(raw.pipeline);
    return {
      html,
      css,
      ...(voiceScript ? { voiceScript } : {}),
      ...(pipeline ? { pipeline } : {}),
    };
  } catch {
    throw new Error(invalidHtmlVideoDraftMessage);
  }
}

function parseHtmlVideoRenderDetail(
  payload: unknown
): HtmlVideoRenderDetail {
  const raw = payload;
  if (!isRecord(raw)) {
    throw new Error("Dữ liệu kết xuất HTML-to-video không hợp lệ.");
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const status = raw.status as HtmlVideoRenderStatus;
  const progress = raw.progress;
  const aspectRatio = raw.aspectRatio as HtmlVideoAspectRatio;
  const resolution = raw.resolution as HtmlVideoResolution;
  const durationSeconds = raw.durationSeconds;
  const voiceStatus = validVoiceStatuses.has(
    raw.voiceStatus as HtmlVideoRenderDetail["voiceStatus"]
  )
    ? (raw.voiceStatus as HtmlVideoRenderDetail["voiceStatus"])
    : "disabled";
  if (
    !id ||
    !validStatuses.has(status) ||
    typeof progress !== "number" ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100 ||
    !validAspectRatios.has(aspectRatio) ||
    !validResolutions.has(resolution) ||
    !Number.isInteger(durationSeconds) ||
    Number(durationSeconds) < 1 ||
    Number(durationSeconds) > 180 ||
    typeof raw.stageMessage !== "string" ||
    typeof raw.createdAt !== "string" ||
    !raw.createdAt ||
    typeof raw.updatedAt !== "string" ||
    !raw.updatedAt
  ) {
    throw new Error("Dữ liệu kết xuất HTML-to-video không hợp lệ.");
  }

  return {
    id,
    status,
    progress: Number(progress),
    stageMessage: raw.stageMessage,
    aspectRatio,
    resolution,
    durationSeconds: Number(durationSeconds),
    outputUrl:
      status === "completed" &&
        typeof raw.outputUrl === "string" &&
        raw.outputUrl.trim()
        ? raw.outputUrl.trim()
        : null,
    error:
      status === "failed" && typeof raw.error === "string" && raw.error.trim()
        ? raw.error.trim()
        : null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    promptHistoryId:
      typeof raw.promptHistoryId === "string" && raw.promptHistoryId.trim()
        ? raw.promptHistoryId.trim()
        : null,
    voiceEnabled: raw.voiceEnabled === true || voiceStatus !== "disabled",
    voiceStatus,
  };
}

export function parseHtmlVideoGenerationResponse(
  payload: unknown
): HtmlVideoGenerationDetail {
  const raw = envelopeData(payload);
  const statuses = new Set<HtmlVideoGenerationStatus>([
    "queued",
    "grounding",
    "planning",
    "composing",
    "validating",
    "ready",
    "failed",
  ]);
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    !statuses.has(raw.status as HtmlVideoGenerationStatus) ||
    !statuses.has(raw.currentStage as HtmlVideoGenerationStatus) ||
    typeof raw.progress !== "number" ||
    raw.progress < 0 ||
    raw.progress > 100 ||
    typeof raw.stageMessage !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string"
  ) {
    throw new Error(invalidHtmlVideoDraftMessage);
  }
  const status = raw.status as HtmlVideoGenerationStatus;
  const draft = status === "ready"
    ? parseHtmlVideoDraftResponse({ success: true, data: raw.draft })
    : undefined;
  return {
    id: raw.id.trim(),
    status,
    currentStage: raw.currentStage as HtmlVideoGenerationStatus,
    progress: raw.progress,
    stageMessage: raw.stageMessage,
    error: status === "failed" && typeof raw.error === "string"
      ? raw.error.trim() || null
      : null,
    ...(draft ? { draft } : {}),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function parseHtmlVideoPipeline(value: unknown): HtmlVideoPipelineMetadata | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    value.version !== "2.0" ||
    typeof value.sourceText !== "string" ||
    (value.promptProvenance !== undefined && (
      !isRecord(value.promptProvenance) ||
      typeof value.promptProvenance.rawUserPrompt !== "string"
    )) ||
    !isRecord(value.videoBrief) ||
    !Array.isArray(value.sourceContextRefs) ||
    !Array.isArray(value.contentUnits) ||
    !Array.isArray(value.scenePlan) ||
    !Array.isArray(value.findings) ||
    value.scenePlan.length === 0
  ) {
    throw new Error(invalidHtmlVideoDraftMessage);
  }
  return value as HtmlVideoPipelineMetadata;
}

export function parseHtmlVideoRenderResponse(
  payload: unknown
): HtmlVideoRenderDetail {
  return parseHtmlVideoRenderDetail(envelopeData(payload));
}

function parseHtmlVideoPromptHistory(raw: unknown): HtmlVideoPromptHistory {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.projectName !== "string" ||
    typeof raw.prompt !== "string" ||
    (raw.masterPrompt !== undefined && typeof raw.masterPrompt !== "string") ||
    (raw.inferredAssumptions !== undefined && !isRecord(raw.inferredAssumptions)) ||
    !validAspectRatios.has(raw.aspectRatio as HtmlVideoAspectRatio) ||
    !Array.isArray(raw.referenceNames) ||
    !raw.referenceNames.every((name) => typeof name === "string") ||
    (raw.parentHistoryId !== null && typeof raw.parentHistoryId !== "string") ||
    !Number.isInteger(raw.revision) ||
    typeof raw.createdAt !== "string" ||
    (raw.renderId != null && typeof raw.renderId !== "string")
  ) {
    throw new Error("Dữ liệu lịch sử prompt HTML-to-video không hợp lệ.");
  }
  return {
    id: raw.id,
    projectName: raw.projectName,
    prompt: raw.prompt,
    ...(typeof raw.masterPrompt === "string" ? { masterPrompt: raw.masterPrompt } : {}),
    ...(isRecord(raw.inferredAssumptions)
      ? { inferredAssumptions: raw.inferredAssumptions as HtmlVideoPromptAssumptions }
      : {}),
    aspectRatio: raw.aspectRatio as HtmlVideoAspectRatio,
    referenceNames: raw.referenceNames,
    parentHistoryId: raw.parentHistoryId as string | null,
    revision: Number(raw.revision),
    createdAt: raw.createdAt,
    renderId: typeof raw.renderId === "string" ? raw.renderId : null,
  };
}

async function readPayload(response: Response) {
  return response.json().catch(() => ({}));
}

function requestError(payload: unknown, fallback: string) {
  const validationDetail = isRecord(payload) && isRecord(payload.errors)
    ? Object.values(payload.errors)
        .flatMap((value) => Array.isArray(value) ? value : [])
        .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    : undefined;
  return new Error(
    isRecord(payload) && typeof payload.message === "string"
      ? validationDetail
        ? `${payload.message}: ${validationDetail}`
        : payload.message
      : fallback
  );
}

export function parseHtmlVideoRenderListResponse(
  payload: unknown,
  options: HtmlVideoRenderListOptions = {}
): HtmlVideoRenderListResult {
  const raw = envelopeData(payload);
  const requestedPage = Math.max(1, Math.floor(Number(options.page) || 1));
  const requestedPageSize = Math.min(50, Math.max(1, Math.floor(Number(options.pageSize) || 12)));

  if (Array.isArray(raw)) {
    const items = raw.map(parseHtmlVideoRenderDetail);
    return {
      items,
      pagination: {
        page: requestedPage,
        pageSize: requestedPageSize,
        total: items.length,
        totalPages: Math.max(1, Math.ceil(items.length / requestedPageSize)),
        hasNextPage: false,
        hasPreviousPage: requestedPage > 1,
      },
    };
  }

  if (!isRecord(raw) || !Array.isArray(raw.items) || !isRecord(raw.pagination)) {
    throw new Error("Dữ liệu lịch sử video Slide trượt không hợp lệ.");
  }

  const pagination = raw.pagination;
  const paginationKeys = ["page", "pageSize", "total", "totalPages"];
  if (
    !paginationKeys.every((key) => Number.isInteger(pagination[key])) ||
    Number(pagination.page) < 1 ||
    Number(pagination.pageSize) < 1 ||
    Number(pagination.total) < 0 ||
    Number(pagination.totalPages) < 1 ||
    typeof pagination.hasNextPage !== "boolean" ||
    typeof pagination.hasPreviousPage !== "boolean"
  ) {
    throw new Error("Dữ liệu phân trang lịch sử video Slide trượt không hợp lệ.");
  }

  return {
    items: raw.items.map(parseHtmlVideoRenderDetail),
    pagination: {
      page: Number(pagination.page),
      pageSize: Number(pagination.pageSize),
      total: Number(pagination.total),
      totalPages: Number(pagination.totalPages),
      hasNextPage: pagination.hasNextPage,
      hasPreviousPage: pagination.hasPreviousPage,
    },
  };
}

export const htmlVideoRenderService = {
  async createGeneration(
    input: CreateHtmlVideoGenerationRequest,
    signal?: AbortSignal
  ): Promise<HtmlVideoGenerationDetail> {
    const response = await fetch("/api/v1/html-video-generations", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(input),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể đưa yêu cầu tạo video vào hàng đợi.");
    }
    return parseHtmlVideoGenerationResponse(payload);
  },

  async getGeneration(
    generationId: string,
    signal?: AbortSignal
  ): Promise<HtmlVideoGenerationDetail> {
    const response = await fetch(
      `/api/v1/html-video-generations/${encodeURIComponent(generationId)}`,
      { headers: authHeaders(), signal }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tải trạng thái tạo bản dựng video.");
    }
    return parseHtmlVideoGenerationResponse(payload);
  },

  async retryGeneration(
    generationId: string,
    stage: "planning" | "visual" | "voice" | "validation",
    signal?: AbortSignal
  ): Promise<HtmlVideoGenerationDetail> {
    const response = await fetch(
      `/api/v1/html-video-generations/${encodeURIComponent(generationId)}/retry`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ stage }),
        signal,
      }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể thử lại stage tạo video.");
    }
    return parseHtmlVideoGenerationResponse(payload);
  },

  async listRenders(
    options: HtmlVideoRenderListOptions = {},
    signal?: AbortSignal
  ): Promise<HtmlVideoRenderListResult> {
    const params = new URLSearchParams({
      page: String(options.page || 1),
      pageSize: String(options.pageSize || 12),
      filter: options.filter || "all",
    });
    const response = await fetch(`/api/v1/html-video-renders?${params.toString()}`, {
      headers: authHeaders(),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tải lịch sử video Slide trượt.");
    }
    return parseHtmlVideoRenderListResponse(payload, options);
  },

  async listPromptHistory(
    signal?: AbortSignal
  ): Promise<HtmlVideoPromptHistory[]> {
    const response = await fetch("/api/v1/html-video-prompt-history", {
      headers: authHeaders(),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tải lịch sử prompt HTML-to-video.");
    }
    const raw = envelopeData(payload);
    if (!Array.isArray(raw)) {
      throw new Error("Dữ liệu lịch sử prompt HTML-to-video không hợp lệ.");
    }
    return raw.map(parseHtmlVideoPromptHistory);
  },

  async createPromptHistory(
    input: CreateHtmlVideoPromptHistoryRequest,
    signal?: AbortSignal
  ): Promise<HtmlVideoPromptHistory> {
    const response = await fetch("/api/v1/html-video-prompt-history", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(input),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể lưu lịch sử prompt HTML-to-video.");
    }
    return parseHtmlVideoPromptHistory(envelopeData(payload));
  },

  async generateDraft(
    input: HtmlVideoDraftRequest,
    signal?: AbortSignal
  ): Promise<HtmlVideoDraft> {
    const response = await fetch(
      "/api/v1/html-video-renders/generate-draft",
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          prompt: input.prompt,
          promptProvenance: input.promptProvenance,
          durationSeconds: input.durationSeconds,
          aspectRatio: input.aspectRatio,
          resolution: input.resolution,
          promptHistoryId: input.promptHistoryId,
          referenceContext: input.referenceContext,
          primaryPromptContext: input.primaryPromptContext,
          primaryPromptFileName: input.primaryPromptFileName,
          referenceAssets: input.referenceAssets,
          editSource: input.editSource,
        }),
        signal,
      }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tạo HTML/CSS video bằng AI.");
    }
    return parseHtmlVideoDraftResponse(payload);
  },

  async preview(
    input: HtmlVideoPreviewRequest,
    signal?: AbortSignal
  ): Promise<HtmlVideoPreview> {
    const response = await fetch("/api/v1/html-video-renders/preview", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(input),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tạo bản xem trước HTML-to-video.");
    }
    return parseHtmlVideoPreviewResponse(payload);
  },

  async create(
    input: CreateHtmlVideoRenderRequest,
    signal?: AbortSignal
  ): Promise<HtmlVideoRenderDetail> {
    const renderInput = {
      ...input,
      ...(input.pipeline
        ? { pipeline: normalizeHtmlVideoPipelineForRender(input.pipeline) }
        : {}),
    };
    const response = await fetch("/api/v1/html-video-renders", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(renderInput),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tạo tác vụ kết xuất HTML-to-video.");
    }
    return parseHtmlVideoRenderResponse(payload);
  },

  async get(
    renderId: string,
    signal?: AbortSignal
  ): Promise<HtmlVideoRenderDetail> {
    const response = await fetch(
      `/api/v1/html-video-renders/${encodeURIComponent(renderId)}`,
      {
        headers: authHeaders(),
        signal,
      }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tải trạng thái kết xuất video.");
    }
    return parseHtmlVideoRenderResponse(payload);
  },

  async getEditSource(
    renderId: string,
    signal?: AbortSignal
  ): Promise<HtmlVideoRenderEditSource> {
    const response = await fetch(
      `/api/v1/html-video-renders/${encodeURIComponent(renderId)}/edit-source`,
      { headers: authHeaders(), signal }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tải bản dựng gốc để chỉnh sửa video.");
    }
    const raw = envelopeData(payload);
    if (!raw || typeof raw !== "object") {
      throw new Error("Bản dựng chỉnh sửa video không hợp lệ.");
    }
    const value = raw as Record<string, unknown>;
    if (typeof value.html !== "string" || !value.html.trim() || typeof value.css !== "string") {
      throw new Error("Bản dựng gốc của video không còn khả dụng để chỉnh sửa.");
    }
    return {
      html: value.html,
      css: value.css,
      ...(typeof value.voiceScript === "string" ? { voiceScript: value.voiceScript } : {}),
      ...(typeof value.snapshotHash === "string" && /^[a-f0-9]{64}$/i.test(value.snapshotHash)
        ? { snapshotHash: value.snapshotHash }
        : {}),
      ...(value.pipeline && typeof value.pipeline === "object"
        ? { pipeline: value.pipeline as HtmlVideoPipelineMetadata }
        : {}),
      ...(Array.isArray(value.assets) ? { assets: value.assets as HtmlVideoAsset[] } : {}),
    };
  },

  async delete(
    renderId: string,
    signal?: AbortSignal
  ): Promise<{ success: boolean; id: string }> {
    const response = await fetch(
      `/api/v1/html-video-renders/${encodeURIComponent(renderId)}`,
      {
        method: "DELETE",
        headers: authHeaders(),
        signal,
      }
    );
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể xóa video khỏi lịch sử.");
    }
    return { success: true, id: renderId };
  },
};

export function isActiveHtmlVideoStatus(status?: HtmlVideoRenderStatus | null) {
  return status === "queued" || status === "rendering" || status === "uploading";
}

export function createHtmlVideoIdempotencyKey() {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `html_video_${unique}`;
}

export type PollHtmlVideoRenderOptions = {
  renderId: string;
  signal: AbortSignal;
  getRender: (renderId: string, signal: AbortSignal) => Promise<HtmlVideoRenderDetail>;
  onUpdate: (detail: HtmlVideoRenderDetail) => void;
  wait?: (signal: AbortSignal) => Promise<void>;
};

function abortError() {
  return new DOMException("Polling aborted.", "AbortError");
}

function defaultPollWait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, 2_000);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function pollHtmlVideoRender({
  renderId,
  signal,
  getRender,
  onUpdate,
  wait = defaultPollWait,
}: PollHtmlVideoRenderOptions): Promise<HtmlVideoRenderDetail> {
  while (true) {
    await wait(signal);
    if (signal.aborted) throw abortError();
    const detail = await getRender(renderId, signal);
    if (signal.aborted) throw abortError();
    onUpdate(detail);
    if (!isActiveHtmlVideoStatus(detail.status)) return detail;
  }
}

export async function pollHtmlVideoGeneration(input: {
  generationId: string;
  signal: AbortSignal;
  getGeneration: (
    generationId: string,
    signal: AbortSignal
  ) => Promise<HtmlVideoGenerationDetail>;
  onUpdate?: (detail: HtmlVideoGenerationDetail) => void;
  wait?: (signal: AbortSignal) => Promise<void>;
}): Promise<HtmlVideoGenerationDetail> {
  const wait = input.wait || defaultPollWait;
  let detail = await input.getGeneration(input.generationId, input.signal);
  input.onUpdate?.(detail);
  while (detail.status !== "ready" && detail.status !== "failed") {
    await wait(input.signal);
    if (input.signal.aborted) throw abortError();
    detail = await input.getGeneration(input.generationId, input.signal);
    input.onUpdate?.(detail);
  }
  return detail;
}
