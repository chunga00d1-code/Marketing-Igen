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

function uploadChunk(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  onProgress: (loadedBytes: number) => void
) {
  return new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    Object.entries(headers).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onerror = () => {
      reject(new Error("Không thể kết nối tới dịch vụ tải video."));
    };
    request.onload = () => {
      resolve(
        new Response(request.responseText, {
          status: request.status,
          statusText: request.statusText,
        })
      );
    };
    request.send(formData);
  });
}

export const videoCaptionService = {
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

  async downloadRenderedVideo(projectId: string) {
    const response = await fetch(
      `/api/v1/video-caption-projects/${projectId}/download`,
      { headers: authHeaders(false) }
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(
        result.message || "Không thể tải video caption đã xuất."
      );
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const filename = encodedName
      ? decodeURIComponent(encodedName)
      : "caption-video.mp4";
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
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

  resolveDriveFolder(url: string) {
    return request<Array<{ id: string; name: string; directUrl: string }>>(
      "/api/v1/video-caption-projects/resolve-drive-folder",
      {
        method: "POST",
        body: JSON.stringify({ url }),
      },
      "Không thể quét thư mục Google Drive."
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

      const response = await uploadChunk(
        `https://api.cloudinary.com/v1_1/${signResult.cloudName}/video/upload`,
        formData,
        {
          "X-Unique-Upload-Id": uploadId,
          "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
        },
        (loadedBytes) => {
          const uploadedBytes = start + loadedBytes;
          onProgress?.(
            Math.min(
              99,
              Math.max(1, Math.round((uploadedBytes / file.size) * 100))
            )
          );
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

};

export type {
  VideoCaptionJobDto,
  VideoCaptionProjectDetailDto,
  VideoCaptionProjectDto,
};
