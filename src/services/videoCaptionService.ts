import type {
  CreateVideoCaptionProjectInput,
  ReplaceVideoCaptionSegmentsInput,
  UpdateVideoCaptionProjectInput,
  VideoCaptionJobDto,
  VideoCaptionProjectDetailDto,
  VideoCaptionProjectDto,
  VideoCaptionProjectStatus,
} from "../../shared/video-caption.contract";
import { getAccessToken } from "./authService";

type ApiEnvelope<T> = {
  status: "success" | "error";
  data: T;
  message?: string;
  code?: string;
};

export interface VideoCaptionLibraryItem {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
  metadata?: {
    title?: string;
    provider?: string;
    status?: string;
    thumbnailUrl?: string;
    duration?: number | string;
  };
}

export interface VideoCaptionContextOptions {
  contents: Array<{
    id: string;
    title: string;
    channel: string;
    status: string;
    generatedAt?: string;
    campaignId?: string;
    campaignSlotId?: string;
  }>;
  campaigns: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt?: string;
  }>;
}

function authHeaders(withContentType = true) {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withContentType) headers["Content-Type"] = "application/json";
  return headers;
}

async function request<T>(
  url: string,
  options?: RequestInit,
  fallbackMessage = "Không thể xử lý dự án caption."
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(options?.body !== undefined),
      ...options?.headers,
    },
  });
  const result = (await response.json().catch(() => ({}))) as Partial<
    ApiEnvelope<T>
  >;
  if (!response.ok) {
    throw new Error(result.message || fallbackMessage);
  }
  if (!result.data) {
    throw new Error(fallbackMessage);
  }
  return result.data;
}

export const videoCaptionService = {
  async listVideoLibrary() {
    const response = await fetch(
      "/api/v1/gemini/media-history?type=video",
      { headers: authHeaders(false) }
    );
    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      history?: Array<{
        _id?: string;
        id?: string;
        url?: string;
        prompt?: string;
        createdAt?: string;
        metadata?: VideoCaptionLibraryItem["metadata"];
      }>;
    };
    if (!response.ok) {
      throw new Error(
        result.message || "Không thể tải thư viện video."
      );
    }
    return (result.history || [])
      .filter(
        (item) =>
          item.url?.startsWith("https://") &&
          item.metadata?.status !== "processing"
      )
      .map((item) => ({
        id: String(item._id || item.id),
        url: String(item.url),
        prompt: item.prompt || "",
        createdAt: item.createdAt || new Date().toISOString(),
        metadata: item.metadata,
      }))
      .slice(0, 30);
  },

  list(options?: {
    page?: number;
    limit?: number;
    status?: VideoCaptionProjectStatus;
    mode?: string;
  }) {
    const query = new URLSearchParams({
      page: String(options?.page || 1),
      limit: String(options?.limit || 20),
    });
    if (options?.status) query.set("status", options.status);
    if (options?.mode) query.set("mode", options.mode);
    return request<{
      projects: VideoCaptionProjectDto[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/api/v1/video-caption-projects?${query.toString()}`, {
      headers: authHeaders(false),
    });
  },

  contextOptions() {
    return request<VideoCaptionContextOptions>(
      "/api/v1/video-caption-projects/context-options",
      { headers: authHeaders(false) },
      "Không thể tải bài viết và chiến dịch."
    );
  },

  detail(projectId: string) {
    return request<VideoCaptionProjectDetailDto>(
      `/api/v1/video-caption-projects/${projectId}`,
      { headers: authHeaders(false) }
    );
  },

  create(input: CreateVideoCaptionProjectInput) {
    return request<VideoCaptionProjectDetailDto>(
      "/api/v1/video-caption-projects",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      "Không thể tạo dự án caption."
    );
  },

  update(projectId: string, input: UpdateVideoCaptionProjectInput) {
    return request<{ project: VideoCaptionProjectDto }>(
      `/api/v1/video-caption-projects/${projectId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
      "Không thể lưu thay đổi dự án."
    );
  },

  analyze(projectId: string) {
    return request<{ job: VideoCaptionJobDto }>(
      `/api/v1/video-caption-projects/${projectId}/analyze`,
      { method: "POST", body: JSON.stringify({}) },
      "Không thể đưa video vào hàng đợi phân tích."
    );
  },

  transcribe(projectId: string) {
    return request<{ job: VideoCaptionJobDto }>(
      `/api/v1/video-caption-projects/${projectId}/transcribe`,
      { method: "POST", body: JSON.stringify({}) },
      "Không thể đưa video vào hàng đợi nhận diện lời nói."
    );
  },

  generateContext(projectId: string) {
    return request<{ job: VideoCaptionJobDto }>(
      `/api/v1/video-caption-projects/${projectId}/generate-context`,
      { method: "POST", body: JSON.stringify({}) },
      "Không thể đưa caption ngữ cảnh vào hàng đợi."
    );
  },

  render(projectId: string, preview: boolean) {
    return request<{ job: VideoCaptionJobDto }>(
      `/api/v1/video-caption-projects/${projectId}/render`,
      {
        method: "POST",
        body: JSON.stringify({ preview }),
      },
      preview
        ? "Không thể tạo bản xem thử."
        : "Không thể kết xuất video có caption."
    );
  },

  async downloadSubtitles(projectId: string, format: "srt" | "vtt") {
    const response = await fetch(
      `/api/v1/video-caption-projects/${projectId}/subtitles/${format}`,
      { headers: authHeaders(false) }
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(
        result.message || "Không thể tải tệp phụ đề."
      );
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const filename = encodedName
      ? decodeURIComponent(encodedName)
      : `caption.${format}`;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  },

  cancel(projectId: string) {
    return request<{ project: VideoCaptionProjectDto }>(
      `/api/v1/video-caption-projects/${projectId}/cancel`,
      { method: "POST", body: JSON.stringify({}) },
      "Không thể hủy dự án."
    );
  },

  retry(projectId: string) {
    return request<{ job: VideoCaptionJobDto }>(
      `/api/v1/video-caption-projects/${projectId}/retry`,
      { method: "POST", body: JSON.stringify({}) },
      "Không thể thử lại dự án."
    );
  },

  replaceSegments(
    projectId: string,
    input: ReplaceVideoCaptionSegmentsInput
  ) {
    return request<VideoCaptionProjectDetailDto>(
      `/api/v1/video-caption-projects/${projectId}/segments`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
      "Không thể lưu timeline caption."
    );
  },

  async uploadVideo(
    file: File,
    onProgress?: (progress: number) => void
  ) {
    const timestamp = Math.round(Date.now() / 1000).toString();
    const folder = "igen_erp/video-captions";
    const paramsToSign = { timestamp, folder };

    const signResponse = await fetch("/api/v1/media/sign-upload", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ paramsToSign }),
    });
    const signResult = (await signResponse.json().catch(() => ({}))) as {
      signature?: string;
      apiKey?: string;
      cloudName?: string;
      error?: string;
    };
    if (
      !signResponse.ok ||
      !signResult.signature ||
      !signResult.apiKey ||
      !signResult.cloudName
    ) {
      throw new Error(
        signResult.error || "Không thể tạo chữ ký tải video."
      );
    }

    const chunkSize = 8 * 1024 * 1024;
    const uploadId = `caption_${crypto.randomUUID()}`;
    let start = 0;
    let secureUrl = "";

    while (start < file.size) {
      const end = Math.min(start + chunkSize, file.size);
      const formData = new FormData();
      formData.append("file", file.slice(start, end), file.name);
      formData.append("api_key", signResult.apiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signResult.signature);
      formData.append("folder", folder);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${signResult.cloudName}/video/upload`,
        {
          method: "POST",
          headers: {
            "X-Unique-Upload-Id": uploadId,
            "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
          },
          body: formData,
        }
      );
      const result = (await response.json().catch(() => ({}))) as {
        secure_url?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          result.error?.message || "Tải video lên Cloudinary thất bại."
        );
      }

      start = end;
      onProgress?.(Math.round((start / file.size) * 100));
      if (result.secure_url) secureUrl = result.secure_url;
    }

    if (!secureUrl) {
      throw new Error("Tải video xong nhưng không nhận được URL.");
    }
    return secureUrl;
  },

  async ensureStoredVideo(videoUrl: string) {
    try {
      const parsed = new URL(videoUrl);
      if (
        parsed.hostname === "res.cloudinary.com" ||
        parsed.hostname.endsWith(".res.cloudinary.com")
      ) {
        return videoUrl;
      }
    } catch {
      throw new Error("URL video trong thư viện không hợp lệ.");
    }

    const response = await fetch("/api/v1/media/upload", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        file: videoUrl,
        folder: "igen_erp/video-captions",
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      url?: string;
      message?: string;
      details?: string;
    };
    if (!response.ok || !result.url) {
      throw new Error(
        result.message ||
          result.details ||
          "Không thể đồng bộ video vào kho media."
      );
    }
    return result.url;
  },
};

export type {
  VideoCaptionJobDto,
  VideoCaptionProjectDetailDto,
  VideoCaptionProjectDto,
};
