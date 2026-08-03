import { getAccessToken } from "./authService";

export type HtmlVideoAspectRatio = "16:9" | "9:16" | "1:1";
export type HtmlVideoResolution = "720p" | "1080p";
export type HtmlVideoRenderStatus =
  | "queued"
  | "rendering"
  | "uploading"
  | "completed"
  | "failed";

export type HtmlVideoPreviewRequest = {
  html: string;
  css: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
};

export type HtmlVideoDraftRequest = {
  prompt: string;
  durationSeconds: number;
  aspectRatio: HtmlVideoAspectRatio;
  resolution: HtmlVideoResolution;
};

export type CreateHtmlVideoRenderRequest = HtmlVideoPreviewRequest & {
  idempotencyKey: string;
  promptHistoryId?: string;
};

export type HtmlVideoPreview = {
  compositionHtml: string;
  width: number;
  height: number;
};

export type HtmlVideoDraft = {
  html: string;
  css: string;
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
};

export type HtmlVideoPromptHistory = {
  id: string;
  projectName: string;
  prompt: string;
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
      !hasExactKeys(payload.data, ["html", "css"])
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
    return { html, css };
  } catch {
    throw new Error(invalidHtmlVideoDraftMessage);
  }
}

export function parseHtmlVideoRenderResponse(
  payload: unknown
): HtmlVideoRenderDetail {
  const raw = envelopeData(payload);
  if (!isRecord(raw)) {
    throw new Error("Dữ liệu kết xuất HTML-to-video không hợp lệ.");
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const status = raw.status as HtmlVideoRenderStatus;
  const progress = raw.progress;
  const aspectRatio = raw.aspectRatio as HtmlVideoAspectRatio;
  const resolution = raw.resolution as HtmlVideoResolution;
  const durationSeconds = raw.durationSeconds;
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
  };
}

function parseHtmlVideoPromptHistory(raw: unknown): HtmlVideoPromptHistory {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.projectName !== "string" ||
    typeof raw.prompt !== "string" ||
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
  return new Error(
    isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : fallback
  );
}

export const htmlVideoRenderService = {
  async listRenders(
    signal?: AbortSignal
  ): Promise<HtmlVideoRenderDetail[]> {
    const response = await fetch("/api/v1/html-video-renders", {
      headers: authHeaders(),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw requestError(payload, "Không thể tải lịch sử video HTML-to-video.");
    }
    const raw = envelopeData(payload);
    if (!Array.isArray(raw)) {
      throw new Error("Dữ liệu lịch sử video HTML-to-video không hợp lệ.");
    }
    return raw.map(parseHtmlVideoRenderResponse);
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
          durationSeconds: input.durationSeconds,
          aspectRatio: input.aspectRatio,
          resolution: input.resolution,
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
    const response = await fetch("/api/v1/html-video-renders", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(input),
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
