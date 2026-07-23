import { getAccessToken } from './authService';

export type BulkLayerType = 'text' | 'image';
export type BulkJobStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface BulkLayer {
  id: string;
  type: BulkLayerType;
  fieldName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  fit?: 'cover' | 'contain';
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: number;
  lineHeight?: number;
  defaultValue?: string;
  dataBinding?: {
    columnKey: string;
    columnLabel: string;
  };
}

export interface BulkDataColumn {
  key: string;
  label: string;
  type: 'text' | 'image';
  samples: string[];
}

export interface BulkImportedRow {
  id: string;
  cells: Record<string, string>;
  selected: boolean;
}

export interface GoogleSheetPreview {
  spreadsheetId: string;
  sheetId: string;
  range: string;
  columns: BulkDataColumn[];
  rows: BulkImportedRow[];
}

export interface BulkTemplatePayload {
  sceneVersion?: number;
  name: string;
  canvas: { width: number; height: number };
  background: {
    type: 'color' | 'gradient' | 'image';
    color?: string;
    colors?: string[];
    imageUrl?: string;
  };
  layers: BulkLayer[];
  thumbnailUrl?: string;
}

export interface BulkTemplate extends BulkTemplatePayload {
  _id: string;
  visibility: 'private' | 'public';
  publishedAt?: string;
  useCount: number;
  version: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface BulkRenderJob {
  _id: string;
  templateId: string;
  templateName: string;
  status: BulkJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface BulkRenderItem {
  _id: string;
  jobId: string;
  rowIndex: number;
  values: Record<string, string>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  outputUrl?: string;
  errorMessage?: string;
  attempts: number;
}

export interface BulkAsset {
  _id: string;
  url: string;
  originalName: string;
  createdAt: string;
}

function headers(json = true): HeadersInit {
  const token = getAccessToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; details?: string };
    throw new Error(body.message || body.details || fallback);
  }
  return response.json() as Promise<T>;
}

export const bulkCreateService = {
  async uploadLibraryAsset(dataUrl: string, originalName: string) {
    const response = await fetch('/api/v1/bulk-create/assets', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ file: dataUrl, originalName }),
    });
    return (await parse<{ data: BulkAsset }>(response, 'Không thể tải ảnh lên thư viện.')).data;
  },

  async listAssets() {
    const response = await fetch('/api/v1/bulk-create/assets', { headers: headers(false) });
    return (await parse<{ data: BulkAsset[] }>(response, 'Không thể tải thư viện ảnh.')).data;
  },

  async previewPublicGoogleSheet(url: string, range = '') {
    const response = await fetch('/api/v1/bulk-create/google-sheets/preview', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ url, range }),
    });
    return (await parse<{ data: GoogleSheetPreview }>(
      response,
      'Không thể đọc Google Sheet. Hãy kiểm tra quyền chia sẻ.'
    )).data;
  },

  async archiveAsset(id: string) {
    const response = await fetch(`/api/v1/bulk-create/assets/${id}`, {
      method: 'DELETE',
      headers: headers(false),
    });
    await parse<{ status: string }>(response, 'Không thể xóa ảnh khỏi lịch sử.');
  },

  async uploadAsset(dataUrl: string, folder = 'igen_erp/bulk-create/assets') {
    if (/^https:\/\/res\.cloudinary\.com\//i.test(dataUrl)) return dataUrl;
    if (!dataUrl.startsWith('data:') && !dataUrl.startsWith('https://')) return dataUrl;
    const response = await fetch('/api/v1/media/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ file: dataUrl, folder }) });
    return (await parse<{ url: string }>(response, 'Không thể tải tài nguyên lên.')).url;
  },

  async createTemplate(payload: BulkTemplatePayload) {
    const response = await fetch('/api/v1/bulk-create/templates', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể lưu template.')).data;
  },

  async updateTemplate(id: string, payload: BulkTemplatePayload) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(payload) });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể cập nhật template.')).data;
  },

  async listTemplates() {
    const response = await fetch('/api/v1/bulk-create/templates', { headers: headers(false) });
    return (await parse<{ data: BulkTemplate[] }>(response, 'Không thể tải danh sách template.')).data;
  },

  async listCommunityTemplates() {
    const response = await fetch('/api/v1/bulk-create/templates/community', { headers: headers(false) });
    return (await parse<{ data: BulkTemplate[] }>(response, 'Không thể tải kho mẫu cộng đồng.')).data;
  },

  async publishTemplate(id: string) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}/publish`, { method: 'POST', headers: headers() });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể chia sẻ template.')).data;
  },

  async unpublishTemplate(id: string) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}/unpublish`, { method: 'POST', headers: headers() });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể ngừng chia sẻ template.')).data;
  },

  async useCommunityTemplate(id: string) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}/use`, { method: 'POST', headers: headers() });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể sử dụng mẫu cộng đồng.')).data;
  },

  async archiveTemplate(id: string) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}`, { method: 'DELETE', headers: headers(false) });
    await parse<{ status: string }>(response, 'Không thể lưu trữ template.');
  },

  async preview(templateId: string, values: Record<string, string>) {
    const response = await fetch('/api/v1/bulk-create/preview', { method: 'POST', headers: headers(), body: JSON.stringify({ templateId, values }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message || 'Không thể tạo preview server.');
    }
    return URL.createObjectURL(await response.blob());
  },

  async createJob(templateId: string, rows: Array<Record<string, string>>) {
    const idempotencyKey = `${templateId}:${Date.now()}:${crypto.randomUUID()}`;
    const response = await fetch('/api/v1/bulk-create/jobs', { method: 'POST', headers: headers(), body: JSON.stringify({ templateId, rows, idempotencyKey }) });
    return (await parse<{ data: BulkRenderJob }>(response, 'Không thể khởi tạo Bulk Create.')).data;
  },

  async listJobs() {
    const response = await fetch('/api/v1/bulk-create/jobs?limit=30', { headers: headers(false) });
    return (await parse<{ data: BulkRenderJob[] }>(response, 'Không thể tải lịch sử Bulk Create.')).data;
  },

  async getJob(id: string) {
    const response = await fetch(`/api/v1/bulk-create/jobs/${id}`, { headers: headers(false) });
    return (await parse<{ data: BulkRenderJob }>(response, 'Không thể tải trạng thái job.')).data;
  },

  async listItems(id: string) {
    const response = await fetch(`/api/v1/bulk-create/jobs/${id}/items`, { headers: headers(false) });
    return (await parse<{ data: BulkRenderItem[] }>(response, 'Không thể tải kết quả.')).data;
  },

  async retry(id: string) {
    const response = await fetch(`/api/v1/bulk-create/jobs/${id}/retry`, { method: 'POST', headers: headers() });
    return (await parse<{ data: BulkRenderJob }>(response, 'Không thể thử lại job.')).data;
  },

  async cancel(id: string) {
    const response = await fetch(`/api/v1/bulk-create/jobs/${id}/cancel`, { method: 'POST', headers: headers() });
    return (await parse<{ data: BulkRenderJob }>(response, 'Không thể hủy job.')).data;
  },

  async downloadZip(id: string, filename: string) {
    const response = await fetch(`/api/v1/bulk-create/jobs/${id}/download`, { headers: headers(false) });
    if (!response.ok) throw new Error('Không thể tải file ZIP.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filename || 'bulk-create'}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },
};
