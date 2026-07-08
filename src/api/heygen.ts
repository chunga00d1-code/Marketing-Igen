export type HeyGenLibraryItem = {
  id: string;
  name: string;
  previewImage?: string;
  previewAudioUrl?: string;
  gender?: string;
  language?: string;
  accent?: string;
  isDefault?: boolean;
  isCustom?: boolean;
  avatarType?: string;
};

const HEYGEN_LIBRARY_CACHE_TTL = 2 * 60 * 1000;
let heygenLibraryCache:
  | {
    expiresAt: number;
    data: { status: string; avatars: HeyGenLibraryItem[]; voices: HeyGenLibraryItem[]; personalVoices?: HeyGenLibraryItem[]; warnings?: string[]; defaults?: { avatarId?: string; voiceId?: string } };
  }
  | null = null;

function getJwtHeaders(withContentType: boolean = true) {
  const headers: Record<string, string> = {};
  if (withContentType) {
    headers["Content-Type"] = "application/json";
  }
  const token = localStorage.getItem("accessToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function parseJsonResponse(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!response.ok) {
    let parsed: any = null;
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }
    const detailMsg = parsed?.details || parsed?.message || fallbackMessage;
    throw new Error(parsed?.message && parsed?.details ? `${parsed.message} (${parsed.details})` : detailMsg);
  }

  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessage);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(fallbackMessage);
  }
}

export const heygenApi = {
  async getLibrary(options?: { force?: boolean }): Promise<{ status: string; avatars: HeyGenLibraryItem[]; voices: HeyGenLibraryItem[]; personalVoices?: HeyGenLibraryItem[]; warnings?: string[]; defaults?: { avatarId?: string; voiceId?: string } }> {
    if (!options?.force && heygenLibraryCache && heygenLibraryCache.expiresAt > Date.now()) {
      return heygenLibraryCache.data;
    }
    const url = options?.force ? "/api/v1/heygen/library?force=true" : "/api/v1/heygen/library";
    const response = await fetch(url, {
      headers: getJwtHeaders(false),
    });
    const data = await parseJsonResponse(response, "Lỗi lấy thư viện HeyGen");
    heygenLibraryCache = {
      expiresAt: Date.now() + HEYGEN_LIBRARY_CACHE_TTL,
      data,
    };
    return data;
  },

  async createAvatarVideo(input: {
    avatarId: string;
    voiceId?: string;
    audioUrl?: string;
    audioRecordId?: string;
    motionText?: string;
    aspectRatio?: "16:9" | "9:16" | "1:1";
    resolution?: "720p" | "1080p" | "4k";
    engineType?: "avatar_v" | "avatar_iv" | "avatar_iii";
    title?: string;
    description?: string;
    inputText?: string;
    usePersonalVoice?: boolean;
    avatarBackground?: "customize" | "remove" | "color";
    backgroundColor?: string;
    avatarLayout?: "original" | "circle";
  }): Promise<any> {
    const response = await fetch("/api/v1/heygen/videos", {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Lỗi tạo video avatar HeyGen");
  },

  async getVideoStatus(videoId: string, input: {
    avatarId?: string;
    voiceId?: string;
    audioUrl?: string;
    audioRecordId?: string;
    motionText?: string;
    aspectRatio?: string;
    title?: string;
    description?: string;
  }): Promise<any> {
    const response = await fetch(`/api/v1/heygen/videos/${videoId}/status`, {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Lỗi lấy trạng thái video ");
  },

  async getVideoHistory(): Promise<{ status: string; history: any[] }> {
    const response = await fetch("/api/v1/heygen/history", {
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi lấy lịch sử video ");
  },

  async deleteVideoHistory(id: string): Promise<{ status: string }> {
    const response = await fetch(`/api/v1/heygen/history/${id}`, {
      method: "DELETE",
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi xóa lịch sử video ");
  },

  clearLibraryCache() {
    heygenLibraryCache = null;
  },
};
