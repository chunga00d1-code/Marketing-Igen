import { getAccessToken } from "./authService";

export interface OpusClipProject {
  _id: string;
  projectId: string;
  videoUrl: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  lengthOption: string;
  language: string;
  brandTemplateId?: string;
  clips: Array<{
    clipId: string;
    videoUrl: string;
    title: string;
    description: string;
    hashtags: string;
    viralityScore: number;
    viralReason: string;
    duration: number;
    startTime: number;
    endTime: number;
  }>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpusClipProjectListResponse {
  list: OpusClipProject[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function parseApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const rawBody = await res.text();
  const isJson = contentType.includes("application/json");

  if (!rawBody) {
    if (!res.ok) {
      throw new Error(fallbackMessage);
    }
    return {} as T;
  }

  if (!isJson) {
    const shortBody = rawBody.slice(0, 120).trim();
    throw new Error(
      `${fallbackMessage}. API trả về dữ liệu không phải JSON (${res.status} ${res.statusText}). Preview: ${shortBody}`
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`${fallbackMessage}. Không parse được JSON từ server.`);
  }

  if (!res.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data as T;
}

export const opusclipService = {
  /**
   * Gửi link video tạo dự án cắt video ngắn AI
   */
  async createProject(params: {
    videoUrl: string;
    name?: string;
    lengthOption?: string;
    sourceLang?: string;
    brandTemplateId?: string;
  }): Promise<OpusClipProject> {
    const res = await fetch("/api/v1/opusclip/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(params),
    });

    const result = await parseApiResponse<{ data: OpusClipProject }>(
      res,
      "Lỗi khi gửi yêu cầu tạo dự án video ngắn"
    );
    return result.data;
  },

  /**
   * Lấy danh sách lịch sử dự án
   */
  async getProjects(
    page = 1,
    limit = 10,
    status?: string
  ): Promise<OpusClipProjectListResponse> {
    let query = `?pageNum=${page}&pageSize=${limit}`;
    if (status) {
      query += `&status=${encodeURIComponent(status)}`;
    }

    const res = await fetch(`/api/v1/opusclip/projects${query}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseApiResponse<{ data: OpusClipProjectListResponse }>(
      res,
      "Lỗi khi lấy danh sách dự án"
    );
    return result.data;
  },

  /**
   * Lấy chi tiết và danh sách clips đã hoàn thành
   */
  async getProjectDetail(projectId: string): Promise<OpusClipProject> {
    const res = await fetch(`/api/v1/opusclip/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseApiResponse<{ data: OpusClipProject }>(
      res,
      "Lỗi khi tải chi tiết dự án cắt video"
    );
    return result.data;
  },
};
