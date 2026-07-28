import type { VideoTemplateAspectRatio } from '../types/video-template';
import { getAccessToken } from './authService';

export type VideoProjectRenderStatus =
  | 'queued'
  | 'rendering'
  | 'uploading'
  | 'completed'
  | 'failed';

export type VideoProjectRenderResolution = '720p' | '1080p';

export interface VideoProjectRenderDetail {
  id: string;
  projectId: string;
  status: VideoProjectRenderStatus;
  progress: number;
  stageMessage?: string;
  outputUrl?: string;
  engine?: string;
  resolution: VideoProjectRenderResolution;
  aspectRatio: VideoTemplateAspectRatio;
  duration: number;
  attempt?: number;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VideoProjectRenderListResponse {
  items: VideoProjectRenderDetail[];
}

type ApiEnvelope<T> = {
  status: 'success' | 'error';
  data?: T;
  message?: string;
};

const VALID_STATUSES = new Set<VideoProjectRenderStatus>([
  'queued',
  'rendering',
  'uploading',
  'completed',
  'failed',
]);

const VALID_RESOLUTIONS = new Set<VideoProjectRenderResolution>(['720p', '1080p']);

function authHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseVideoProjectRenderDetail(raw: unknown): VideoProjectRenderDetail {
  if (!isRecord(raw)) {
    throw new Error('Dữ liệu kết xuất video không hợp lệ.');
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
  if (!id || !projectId) {
    throw new Error('Mã kết xuất hoặc mã dự án không được để trống.');
  }

  const status = raw.status as VideoProjectRenderStatus;
  if (!VALID_STATUSES.has(status)) {
    throw new Error('Trạng thái kết xuất video không hợp lệ.');
  }

  const progress = Number(raw.progress);
  if (typeof raw.progress !== 'number' || Number.isNaN(progress) || progress < 0 || progress > 100) {
    throw new Error('Tiến trình kết xuất video không hợp lệ.');
  }

  const resolution = raw.resolution as VideoProjectRenderResolution;
  if (!VALID_RESOLUTIONS.has(resolution)) {
    throw new Error('Độ phân giải kết xuất video không hợp lệ.');
  }

  const outputUrl =
    status === 'completed' && typeof raw.outputUrl === 'string' && raw.outputUrl.trim()
      ? raw.outputUrl.trim()
      : undefined;

  return {
    id,
    projectId,
    status,
    progress,
    stageMessage: typeof raw.stageMessage === 'string' ? raw.stageMessage : undefined,
    outputUrl,
    engine: typeof raw.engine === 'string' ? raw.engine : undefined,
    resolution,
    aspectRatio: (typeof raw.aspectRatio === 'string' ? raw.aspectRatio : '9:16') as VideoTemplateAspectRatio,
    duration: typeof raw.duration === 'number' ? raw.duration : 0,
    attempt: typeof raw.attempt === 'number' ? raw.attempt : undefined,
    errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : undefined,
    errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : undefined,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

export function parseVideoProjectRenderResponse(payload: unknown): VideoProjectRenderDetail {
  const envelope = payload as Partial<ApiEnvelope<unknown>>;
  if (!isRecord(payload) || envelope.status !== 'success' || envelope.data === undefined) {
    const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : undefined;
    throw new Error(message || 'Phản hồi kết xuất video không hợp lệ.');
  }
  return parseVideoProjectRenderDetail(envelope.data);
}

export function parseVideoProjectRenderListResponse(payload: unknown): VideoProjectRenderListResponse {
  const envelope = payload as Partial<ApiEnvelope<{ items?: unknown[] }>>;
  if (
    !isRecord(payload) ||
    envelope.status !== 'success' ||
    !isRecord(envelope.data) ||
    !Array.isArray(envelope.data.items)
  ) {
    const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : undefined;
    throw new Error(message || 'Danh sách kết xuất video không hợp lệ.');
  }

  const items = envelope.data.items.map((item) => parseVideoProjectRenderDetail(item));
  return { items };
}

export const videoProjectRenderService = {
  async createRender(
    projectId: string,
    resolution: VideoProjectRenderResolution,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<VideoProjectRenderDetail> {
    const response = await fetch(`/api/v1/video-projects/${encodeURIComponent(projectId)}/renders`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ resolution, idempotencyKey }),
      signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : undefined;
      throw new Error(message || 'Không thể tạo bản kết xuất video.');
    }
    return parseVideoProjectRenderResponse(payload);
  },

  async getRender(
    projectId: string,
    renderId: string,
    signal?: AbortSignal
  ): Promise<VideoProjectRenderDetail> {
    const response = await fetch(
      `/api/v1/video-projects/${encodeURIComponent(projectId)}/renders/${encodeURIComponent(renderId)}`,
      {
        headers: authHeaders(),
        signal,
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : undefined;
      throw new Error(message || 'Không thể tải chi tiết bản kết xuất video.');
    }
    return parseVideoProjectRenderResponse(payload);
  },

  async listRenders(
    projectId: string,
    signal?: AbortSignal
  ): Promise<VideoProjectRenderListResponse> {
    const response = await fetch(`/api/v1/video-projects/${encodeURIComponent(projectId)}/renders`, {
      headers: authHeaders(),
      signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : undefined;
      throw new Error(message || 'Không thể tải danh sách kết xuất video.');
    }
    return parseVideoProjectRenderListResponse(payload);
  },
};
