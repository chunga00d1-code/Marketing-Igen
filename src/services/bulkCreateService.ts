import { getAccessToken } from './authService';

export type BulkLayerType = 'text' | 'image';
export type BulkLayerKind = 'text' | 'shape' | 'badge' | 'cta' | 'icon';
export type BulkJobStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface BulkLayer {
  id: string;
  type: BulkLayerType;
  layerKind?: BulkLayerKind;
  groupId?: string;
  fieldName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  fit?: 'cover' | 'contain';
  sourceCrop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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
  autoFit?: boolean;
  minFontSize?: number;
  maxLines?: number;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  padding?: number;
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
  sheetName?: string;
  embeddedImageCount?: number;
  columns: BulkDataColumn[];
  rows: BulkImportedRow[];
}

export type WorkbookPreview = Pick<
  GoogleSheetPreview,
  'sheetName' | 'embeddedImageCount' | 'columns' | 'rows'
> & {
  originalName?: string;
};

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

export interface CanvaConnectionStatus {
  connected: boolean;
  connectedAt?: string;
}

export interface CanvaDesign {
  id: string;
  title?: string;
  thumbnail?: {
    url?: string;
    width?: number;
    height?: number;
  };
  urls?: {
    edit_url?: string;
    view_url?: string;
  };
  created_at?: string;
  updated_at?: string;
}
export interface BulkTemplatePage {
  items: BulkTemplate[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
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
  targetType?: 'standalone' | 'campaign';
  campaignId?: string;
  sourceType?: 'manual' | 'campaign_orders' | 'sheet';
  mappingMode?: 'order' | 'position' | 'manual';
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

export interface BulkAiAttachment {
  type: 'image' | 'document';
  name: string;
  url?: string;
  text?: string;
}

export interface BulkAiHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BulkAiScene {
  sceneVersion?: number;
  canvas: BulkTemplatePayload['canvas'];
  background: BulkTemplatePayload['background'];
  layers: BulkLayer[];
}

export type BulkAiOperation =
  | { op: 'add'; layerId: string; label: string }
  | { op: 'update'; layerId: string; label: string; fields: string[] }
  | { op: 'remove'; layerId: string; label: string }
  | { op: 'reorder'; layerId: string; label: string; zIndex: number }
  | { op: 'replace-background'; label: string }
  | { op: 'resize-canvas'; label: string; width: number; height: number };

export interface BulkAiSceneResult {
  reply: string;
  scene: BulkAiScene;
  values: Record<string, string>;
  operations: BulkAiOperation[];
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const bulkCreateService = {
  async startCanvaOAuth() {
    const response = await fetch('/api/v1/canva/oauth/start', {
      method: 'POST',
      headers: headers(),
    });
    return (await parse<{ data: { url: string } }>(
      response,
      'Không thể khởi tạo kết nối Canva.'
    )).data;
  },

  async getCanvaStatus() {
    const response = await fetch('/api/v1/canva/status', {
      headers: headers(),
    });
    return (await parse<{ data: CanvaConnectionStatus }>(
      response,
      'Không thể kiểm tra trạng thái kết nối Canva.'
    )).data;
  },

  async listCanvaDesigns() {
    const response = await fetch('/api/v1/canva/designs', {
      headers: headers(),
    });
    return (await parse<{ data: CanvaDesign[] }>(
      response,
      'Không thể tải danh sách thiết kế Canva.'
    )).data;
  },
  async updateSceneWithAi(input: {
    prompt: string;
    mode?: 'edit' | 'reconstruct';
    scene: BulkAiScene;
    values: Record<string, string>;
    attachments?: BulkAiAttachment[];
    history?: BulkAiHistoryMessage[];
  }) {
    const response = await fetch('/api/v1/bulk-create/ai/scene', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(input),
    });
    return (await parse<{ data: BulkAiSceneResult }>(
      response,
      'Không thể cập nhật thiết kế bằng AI.'
    )).data;
  },

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

  async previewPublicGoogleSheet(url: string) {
    const response = await fetch('/api/v1/bulk-create/google-sheets/preview', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ url }),
    });
    return (await parse<{ data: GoogleSheetPreview }>(
      response,
      'Không thể đọc Google Sheet. Hãy kiểm tra quyền chia sẻ.'
    )).data;
  },

  async previewWorkbook(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('Tệp XLSX chỉ được tối đa 50 MB.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không thể đọc tệp XLSX.'));
      reader.readAsDataURL(file);
    });
    const response = await fetch('/api/v1/bulk-create/workbooks/preview', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ file: dataUrl, originalName: file.name }),
    });
    return (await parse<{ data: WorkbookPreview }>(
      response,
      'Không thể đọc tệp XLSX.'
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

  /** Build a Cloudinary AI background-removal derivative while preserving the original asset. */
  backgroundRemovedUrl(url: string) {
    const marker = '/image/upload/';
    if (!/^https:\/\/res\.cloudinary\.com\//i.test(url) || !url.includes(marker)) {
      throw new Error('Ảnh cần được tải lên thư viện trước khi xóa nền AI.');
    }
    if (url.includes('/e_background_removal/')) return url;
    // Keep fine foreground details (for example leaves, fabric and product
    // edges) while turning only the detected background transparent.
    return url.replace(marker, `${marker}e_background_removal:fineedges_y/f_png/`);
  },

  async createTemplate(payload: BulkTemplatePayload) {
    const response = await fetch('/api/v1/bulk-create/templates', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể lưu template.')).data;
  },

  async updateTemplate(id: string, payload: BulkTemplatePayload) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(payload) });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể cập nhật template.')).data;
  },

  async getTemplate(id: string) {
    const response = await fetch(`/api/v1/bulk-create/templates/${id}`, { headers: headers(false) });
    return (await parse<{ data: BulkTemplate }>(response, 'Không thể tải mẫu thiết kế.')).data;
  },

  async listTemplates() {
    const response = await fetch('/api/v1/bulk-create/templates', { headers: headers(false) });
    return (await parse<{ data: BulkTemplate[] }>(response, 'Không thể tải danh sách template.')).data;
  },

  async listTemplatesPage(page = 1, pageSize = 6) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await fetch(`/api/v1/bulk-create/templates/paged?${query}`, {
      headers: headers(false),
    });
    return (
      await parse<{ data: BulkTemplatePage }>(
        response,
        'Không thể tải trang mẫu thiết kế.'
      )
    ).data;
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

  async previewScene(template: BulkTemplatePayload, values: Record<string, string>) {
    const response = await fetch('/api/v1/bulk-create/preview', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ template, values }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message || 'Không thể tạo ảnh cho trang.');
    }
    return URL.createObjectURL(await response.blob());
  },

  async createJob(
    templateId: string,
    rows: Array<Record<string, string>>,
    options: {
      campaignId?: string;
      sourceType?: 'manual' | 'campaign_orders' | 'sheet';
      mappingMode?: 'order' | 'position' | 'manual';
    } = {},
  ) {
    const idempotencyKey = `${templateId}:${Date.now()}:${crypto.randomUUID()}`;
    const response = await fetch('/api/v1/bulk-create/jobs', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ templateId, rows, idempotencyKey, ...options }),
    });
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
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string; details?: string };
      throw new Error(body.message || body.details || 'Không thể tải file ZIP.');
    }
    downloadBlob(await response.blob(), `${filename || 'bulk-create'}.zip`);
  },

  async downloadImage(url: string, filename: string) {
    const response = await fetch(
      `/api/v1/media/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`,
      { headers: headers(false) }
    );
    if (!response.ok) throw new Error('Không thể tải ảnh.');
    downloadBlob(await response.blob(), filename);
  },
};
