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

const ELEVENLABS_VOICE_HISTORY_CACHE_TTL = 2 * 60 * 1000;
let elevenlabsVoiceHistoryCache:
  | {
      expiresAt: number;
      data: { status: string; history: any[] };
    }
  | null = null;

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

export const elevenlabsApi = {
  async generateVoice(input: {
    textToSpeak: string;
    styleInstructions?: string;
    mode?: "single" | "multi";
    temperature?: number;
    modelName?: string;
    voiceName?: string;
    speakerA?: string;
    speakerB?: string;
    title?: string;
    description?: string;
    stability?: number;
    similarityBoost?: number;
    useSpeakerBoost?: boolean;
    saveToHistory?: boolean;
  }): Promise<{ status: string; record?: any; url?: string; preview?: boolean }> {
    const response = await fetch("/api/v1/elevenlabs/generate-voice", {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Loi khi sinh giong noi ElevenLabs");
  },

  async getVoiceHistory(options?: { force?: boolean }): Promise<{ status: string; history: any[] }> {
    if (!options?.force && elevenlabsVoiceHistoryCache && elevenlabsVoiceHistoryCache.expiresAt > Date.now()) {
      return elevenlabsVoiceHistoryCache.data;
    }
    const response = await fetch("/api/v1/elevenlabs/history", {
      headers: getJwtHeaders(false),
    });
    const data = await parseJsonResponse(response, "Lỗi lấy lịch sử voice ElevenLabs");
    elevenlabsVoiceHistoryCache = {
      expiresAt: Date.now() + ELEVENLABS_VOICE_HISTORY_CACHE_TTL,
      data,
    };
    return data;
  },

  async deleteVoiceHistory(id: string): Promise<{ status: string }> {
    const response = await fetch(`/api/v1/elevenlabs/history/${id}`, {
      method: "DELETE",
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi xóa lịch sử voice ElevenLabs");
  },

  clearVoiceHistoryCache() {
    elevenlabsVoiceHistoryCache = null;
  },

  async getVoices(): Promise<{ status: string; voices: any[] }> {
    const response = await fetch("/api/v1/elevenlabs/voices?scope=all", {
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi lấy danh sách giọng nói ElevenLabs");
  },

  async getModels(): Promise<{ status: string; models: any[] }> {
    const response = await fetch("/api/v1/elevenlabs/models", {
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi lấy danh sách model ElevenLabs");
  },

  async getVoice(voiceId: string): Promise<any> {
    const response = await fetch(`/api/v1/elevenlabs/voices/${voiceId}`, {
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi lấy chi tiết voice ElevenLabs");
  },

  async getVoiceSettings(voiceId: string): Promise<any> {
    const response = await fetch(`/api/v1/elevenlabs/voices/${voiceId}/settings`, {
      headers: getJwtHeaders(false),
    });
    return parseJsonResponse(response, "Lỗi lấy voice settings ElevenLabs");
  },

  async updateVoiceSettings(
    voiceId: string,
    input: { stability?: number; similarity_boost?: number; style?: number; use_speaker_boost?: boolean }
  ): Promise<any> {
    const response = await fetch(`/api/v1/elevenlabs/voices/${voiceId}/settings`, {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Lỗi cập nhật voice settings ElevenLabs");
  },

  async generateCustomVoicePreview(input: {
    gender: string;
    accent: string;
    age: string;
    accentStrength: number;
    text: string;
  }): Promise<{ generatedVoiceId: string; url: string }> {
    const response = await fetch("/api/v1/elevenlabs/custom-voice-preview", {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Lỗi thiết kế giọng nói thử nghiệm");
  },

  async createCustomVoice(input: {
    voiceName: string;
    voiceDescription: string;
    generatedVoiceId: string;
  }): Promise<{ voice_id: string }> {
    const response = await fetch("/api/v1/elevenlabs/create-voice", {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Lỗi lưu giọng nói cá nhân");
  },

  async addVoice(input: {
    name: string;
    description: string;
    files: string[];
    userId?: string;
  }): Promise<{ voice_id: string }> {
    const response = await fetch("/api/v1/elevenlabs/voices/add", {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify(input),
    });
    return parseJsonResponse(response, "Loi khi nhan ban giong noi ElevenLabs");
  },

  async deleteVoice(voiceId: string): Promise<{ success: boolean }> {
    const response = await fetch(`/api/v1/elevenlabs/voices/${voiceId}`, {
      method: "DELETE",
      headers: getJwtHeaders(true),
    });
    return parseJsonResponse(response, "Loi khi xoa giong noi ElevenLabs");
  },
};
