import type {
  VideoProjectDetail,
  CreateVideoTemplateInput,
  VideoTemplateCategory,
  VideoTemplateDetail,
  VideoTemplateFilterParams,
  VideoTemplateListResponse,
  UseTemplateOptions,
  UseTemplateResponse,
  VideoTemplateMutationResult,
  SaveVideoProjectInput,
  ShotstackSyncStatus,
  ShotstackSyncSummary,
} from '../types/video-template';
import { MOCK_VIDEO_CATEGORIES, MOCK_VIDEO_TEMPLATES } from '../mocks/videoTemplates';
import { getAccessToken } from './authService';

const MOCK_LATENCY_MS = 300;
const USE_MOCKS = import.meta.env?.VITE_VIDEO_TEMPLATE_USE_MOCKS === 'true';

type ApiEnvelope<T> = {
  status: 'success' | 'error';
  data: T;
  message?: string;
};

function delay<T>(data: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

async function parseResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>>;
  if (!response.ok || payload.status === 'error' || payload.data === undefined) {
    throw new Error(payload.message || fallbackMessage);
  }
  return payload.data;
}

function authHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function mockGetTemplates(params: VideoTemplateFilterParams = {}): VideoTemplateListResponse {
  const {
    scope = 'discover',
    category = 'all',
    aspectRatio = 'all',
    duration = 'all',
    search = '',
    sort = 'popular',
    page = 1,
    limit = 8,
  } = params;
  let filtered = [...MOCK_VIDEO_TEMPLATES];
  filtered = scope === 'mine'
    ? filtered.filter((template) => template.ownerType === 'user')
    : filtered.filter((template) => template.ownerType === 'system');
  if (category !== 'all') {
    filtered = category === 'new' || category === 'popular'
      ? filtered.filter((template) => template.badges?.includes(category))
      : filtered.filter((template) => template.category.id === category);
  }
  if (aspectRatio !== 'all') filtered = filtered.filter((template) => template.aspectRatio === aspectRatio);
  if (duration === 'short') filtered = filtered.filter((template) => template.duration <= 15);
  if (duration === 'medium') filtered = filtered.filter((template) => template.duration > 15 && template.duration <= 30);
  if (duration === 'long') filtered = filtered.filter((template) => template.duration > 30);
  if (search.trim()) {
    const query = search.trim().toLowerCase();
    filtered = filtered.filter((template) =>
      template.title.toLowerCase().includes(query)
      || template.description.toLowerCase().includes(query)
      || template.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }
  filtered.sort(sort === 'popular'
    ? (left, right) => right.usageCount - left.usageCount
    : (left, right) => Number(right.badges?.includes('new')) - Number(left.badges?.includes('new')));
  const start = (page - 1) * limit;
  return {
    items: filtered.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      hasMore: start + limit < filtered.length,
    },
  };
}

export function parseVideoProjectResponse(payload: unknown): VideoProjectDetail {
  const envelope = payload as Partial<ApiEnvelope<VideoProjectDetail>>;
  if (
    envelope.status !== 'success'
    || !envelope.data?.id
    || !Array.isArray(envelope.data.tracks)
    || !Array.isArray(envelope.data.items)
    || typeof envelope.data.revision !== 'number'
  ) {
    throw new Error('Phản hồi dự án video không hợp lệ.');
  }
  return envelope.data;
}

export const videoTemplateService = {
  async syncShotstackTemplates(): Promise<ShotstackSyncSummary> {
    const response = await fetch('/api/v1/admin/video-templates/shotstack/sync', {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseResponse<ShotstackSyncSummary>(
      response,
      'Không thể đồng bộ thư viện mẫu Shotstack. Vui lòng thử lại sau.'
    );
  },

  async getShotstackSyncStatus(): Promise<ShotstackSyncStatus> {
    const response = await fetch('/api/v1/admin/video-templates/shotstack/status', {
      headers: authHeaders(),
    });
    return parseResponse<ShotstackSyncStatus>(
      response,
      'Không thể tải trạng thái đồng bộ Shotstack. Vui lòng thử lại sau.'
    );
  },

  async getCategories(): Promise<VideoTemplateCategory[]> {
    if (USE_MOCKS) return delay(MOCK_VIDEO_CATEGORIES);
    const response = await fetch('/api/v1/video-template-categories', {
      headers: authHeaders(),
    });
    const data = await parseResponse<{ items: VideoTemplateCategory[] }>(
      response,
      'Không thể tải danh mục mẫu video.'
    );
    return data.items;
  },

  async getTemplates(params: VideoTemplateFilterParams = {}): Promise<VideoTemplateListResponse> {
    if (USE_MOCKS) return delay(mockGetTemplates(params));
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') searchParams.set(key, String(value));
    });
    const response = await fetch(`/api/v1/video-templates?${searchParams.toString()}`, {
      headers: authHeaders(),
    });
    return parseResponse<VideoTemplateListResponse>(response, 'Không thể tải thư viện mẫu video.');
  },

  async getTemplateById(templateId: string): Promise<VideoTemplateDetail> {
    if (USE_MOCKS) {
      const found = MOCK_VIDEO_TEMPLATES.find((template) => template.id === templateId);
      if (!found) throw new Error(`Không tìm thấy mẫu video với ID: ${templateId}`);
      return delay(found);
    }
    const response = await fetch(`/api/v1/video-templates/${encodeURIComponent(templateId)}`, {
      headers: authHeaders(),
    });
    return parseResponse<VideoTemplateDetail>(response, 'Không thể tải thông tin mẫu video.');
  },

  async useTemplate(templateId: string, options: UseTemplateOptions): Promise<UseTemplateResponse> {
    if (USE_MOCKS) {
      const template = await this.getTemplateById(templateId);
      return delay({
        project: {
          id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sourceTemplateId: template.id,
          status: 'draft' as const,
          slotValues: {},
        },
        nextStep: 'editor' as const,
      });
    }
    const response = await fetch(`/api/v1/video-templates/${encodeURIComponent(templateId)}/use`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(options),
    });
    return parseResponse<UseTemplateResponse>(response, 'Không thể tạo dự án từ mẫu video.');
  },

  async getProject(projectId: string): Promise<VideoProjectDetail> {
    const response = await fetch(`/api/v1/video-projects/${encodeURIComponent(projectId)}`, {
      headers: authHeaders(),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload as { message?: string };
      throw new Error(error.message || 'Không thể tải dự án video.');
    }
    return parseVideoProjectResponse(payload);
  },

  async createProject(input: SaveVideoProjectInput): Promise<VideoProjectDetail> {
    const response = await fetch('/api/v1/video-projects', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(input),
    });
    return parseResponse<VideoProjectDetail>(response, 'Không thể tạo dự án video.');
  },

  async getProjects(): Promise<VideoProjectDetail[]> {
    const response = await fetch('/api/v1/video-projects', {
      headers: authHeaders(),
    });
    const data = await parseResponse<{ items: VideoProjectDetail[] }>(
      response,
      'Không thể tải dự án video gần đây.'
    );
    return data.items;
  },

  async updateProject(
    projectId: string,
    input: SaveVideoProjectInput & { expectedRevision: number }
  ): Promise<VideoProjectDetail> {
    const response = await fetch(`/api/v1/video-projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(input),
    });
    return parseResponse<VideoProjectDetail>(response, 'Không thể lưu dự án video.');
  },

  async createTemplate(input: CreateVideoTemplateInput): Promise<VideoTemplateMutationResult> {
    const response = await fetch('/api/v1/video-templates', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(input),
    });
    return parseResponse<VideoTemplateMutationResult>(response, 'Không thể lưu mẫu video.');
  },

  async updateTemplate(templateId: string, input: Partial<CreateVideoTemplateInput>): Promise<VideoTemplateMutationResult> {
    const response = await fetch(`/api/v1/video-templates/${encodeURIComponent(templateId)}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(input),
    });
    return parseResponse<VideoTemplateMutationResult>(response, 'Không thể cập nhật mẫu video.');
  },

  async publishTemplate(templateId: string): Promise<VideoTemplateMutationResult> {
    const response = await fetch(`/api/v1/video-templates/${encodeURIComponent(templateId)}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return parseResponse<VideoTemplateMutationResult>(response, 'Không thể xuất bản mẫu video.');
  },
};
