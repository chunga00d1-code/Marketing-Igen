import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { AIMediaModel } from "../model/ai-media.model";
import { UserModel } from "../model/user.model";
import { broadcastEvent } from "../socket";
import { heygenLegacyService } from "./heygen-legacy.service";

type HeyGenLibraryItem = {
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

type HeyGenAccessContext = {
  avatarIds: string[];
  avatarId: string;
  voiceId: string;
  apiKey: string;
  apiKeySource: "user" | "company" | "env" | "missing";
  allowFullLibrary: boolean;
  warnings: string[];
};

type HeyGenRemoteVideo = {
  id: string;
  _id: string;
  videoId: string;
  title: string;
  prompt: string;
  url: string;
  thumbnailUrl: string;
  gifUrl: string;
  captionedVideoUrl: string;
  subtitleUrl: string;
  duration: number;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  videoPageUrl: string;
  outputLanguage: string;
  failureCode: string;
  failureMessage: string;
  model: string;
};

export type CreateAvatarVideoInput = {
  avatarId: string;
  voiceId?: string;
  audioUrl?: string;
  audioRecordId?: string;
  motionText?: string;
  aspectRatio?: string;
  resolution?: "720p" | "1080p" | "4k";
  engineType?: "avatar_v" | "avatar_iv" | "avatar_iii";
  title?: string;
  description?: string;
  enableCaption?: boolean;
  inputText?: string;
  avatarBackground?: "customize" | "remove" | "color";
  backgroundColor?: string;
  avatarLayout?: "original" | "circle";
  usePersonalVoice?: boolean;
};

type HeyGenWebhookPayload = {
  [key: string]: any;
};

export const HEYGEN_API_BASE = "https://api.heygen.com";
const ACTIVE_VIDEO_STATUSES = new Set(["processing", "pending", "queued", "waiting", "in_progress", "rendering"]);

export class HeyGenApiError extends Error {
  statusCode: number;
  details: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.name = "HeyGenApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getApiKey(overrideApiKey?: string) {
  return overrideApiKey?.trim() || process.env.HEYGEN_API_KEY?.trim() || "";
}

function getDefaultAvatarId() {
  return String(process.env.HEYGEN_DEFAULT_AVATAR_ID || "").trim();
}

function getDefaultVoiceId() {
  return String(process.env.HEYGEN_DEFAULT_VOICE_ID || "").trim();
}

function maskApiKey(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "(empty)";
  }
  if (raw.length <= 8) {
    return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  }
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function getHeyGenWebhookUrl() {
  const baseUrl = String(process.env.APP_URL || "").trim();
  if (!baseUrl) {
    return "";
  }

  try {
    const webhookUrl = new URL("/api/v1/heygen/webhook", baseUrl);
    const secret = String(process.env.HEYGEN_WEBHOOK_SECRET || "").trim();
    if (secret) {
      webhookUrl.searchParams.set("token", secret);
    }
    return webhookUrl.toString();
  } catch {
    return "";
  }
}

function requireApiKey(overrideApiKey?: string) {
  const apiKey = getApiKey(overrideApiKey);
  if (!apiKey) {
    throw new Error("Chưa cấu hình khóa API HeyGen");
  }
  return apiKey;
}

export async function parseHeyGenResponse(response: Response, fallbackMessage: string) {
  const raw = await response.text();
  let parsed: any = null;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const details = parsed?.error?.message || parsed?.message || raw || fallbackMessage;
    throw new HeyGenApiError(details, response.status, parsed || raw);
  }

  return parsed ?? {};
}

export async function requestHeyGenJson(path: string, init?: RequestInit, overrideApiKey?: string) {
  const apiKey = requireApiKey(overrideApiKey);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

  try {
    const response = await fetch(`${HEYGEN_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "x-api-key": apiKey,
        ...(init?.headers || {}),
      },
    });
    clearTimeout(timeoutId);
    return await parseHeyGenResponse(response, `Không thể gọi HeyGen API: ${path}`);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Yêu cầu HeyGen API (${path}) đã hết thời gian phản hồi (timeout).`);
    }
    throw error;
  }
}

function normalizeLibraryItems(payload: any, type: "avatar" | "voice"): HeyGenLibraryItem[] {
  const candidates = [
    payload?.data?.avatars,
    payload?.data?.voices,
    payload?.avatars,
    payload?.voices,
    payload?.data,
    payload,
  ];

  const list = candidates.find((item) => Array.isArray(item));
  if (!Array.isArray(list)) {
    return [];
  }

  const normalized = list
    .map((item: any) => {
      const id = item?.avatar_id || item?.voice_id || item?.id || item?.template_id || item?.value;
      const name = item?.avatar_name || item?.name || item?.title || item?.label;
      if (!id || !name) {
        return null;
      }

      const rawType = String(item?.avatar_type || item?.type || item?.voice_type || item?.category || "").toLowerCase();
      const rawSource = String(item?.source || item?.origin || item?.provider || item?.library || "").toLowerCase();
      const rawOwnership = String(item?.ownership || item?.scope || item?.visibility || "").toLowerCase();
      const rawCreatedBy = String(item?.created_by || item?.owner_type || item?.owner_source || "").toLowerCase();
      const tagValues = Array.isArray(item?.tags) ? item.tags.map((tag: any) => String(tag || "").toLowerCase()) : [];
      const customSignals = [
        item?.is_custom_avatar,
        item?.is_user_avatar,
        item?.is_owner,
        item?.owned_by_me,
        item?.created_by_user,
        item?.is_custom_voice,
        item?.is_user_voice,
        item?.is_cloned_voice,
        item?.is_mine,
        item?.mine,
      ];

      const customKeywords = [
        "custom",
        "user",
        "private",
        "clone",
        "cloned",
        "voice_clone",
        "instant_voice_clone",
        "professional_voice_clone",
        "import",
        "imported",
        "my_voice",
        "my voice",
        "owned",
      ];

      const matchesCustomKeyword = (...values: string[]) =>
        values.some((value) => value && customKeywords.some((keyword) => value.includes(keyword)));

      return {
        id: String(id),
        name: String(name),
        previewImage: item?.preview_image_url || item?.preview_url || item?.image_url || item?.thumbnail_url,
        previewAudioUrl: item?.preview_audio_url || item?.sample_audio_url || item?.audio_preview_url || item?.demo_audio_url,
        gender: item?.gender,
        language: item?.language || item?.locale,
        accent: item?.accent,
        isDefault: Boolean(item?.is_default || item?.default || false),
        isCustom: Boolean(
          customSignals.some(Boolean) ||
          rawType === "digital_twin" ||
          rawType === "photo_avatar" ||
          rawType === "talking_photo" ||
          matchesCustomKeyword(rawType, rawSource, rawOwnership, rawCreatedBy) ||
          tagValues.some((value) => matchesCustomKeyword(value))
        ),
        avatarType: String(item?.avatar_type || item?.type || ""),
      } satisfies HeyGenLibraryItem;
    })
    .filter(Boolean)
    .slice(0, type === "avatar" ? 200 : 300) as HeyGenLibraryItem[];

  const seen = new Set<string>();
  return normalized.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function filterCustomAvatars(items: HeyGenLibraryItem[]) {
  return items.filter((item) => item.isCustom);
}

export async function getCompanyHeyGenLibrary(companyCode: string, apiKey: string) {
  const cacheKey = `${apiKey}_library`;
  libraryCache.delete(cacheKey);

  const avatarResult = await fetchLibraryWithCandidates("avatar", apiKey);
  const voiceResult = await fetchLibraryWithCandidates("voice", apiKey);
  
  const result = {
    avatars: filterCustomAvatars(avatarResult.items),
    voices: voiceResult.items,
    personalVoices: [] as HeyGenLibraryItem[],
    sources: {
      avatars: avatarResult.source,
      voices: voiceResult.source,
      personalVoices: "not_loaded_for_company_sync",
    },
  };

  libraryCache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
  });

  return result;
}

export async function getHeyGenAccessContext(userId: string): Promise<HeyGenAccessContext> {
  const user = await UserModel.findById(userId)
    .select("role heygenAccess companyCode")
    .lean();

  if (!user) {
    throw new Error("Không tìm thấy người dùng");
  }

  let rawAvatarIds = Array.isArray(user.heygenAccess?.avatarIds)
    ? user.heygenAccess?.avatarIds.map((item: any) => String(item || "").trim()).filter(Boolean)
    : [];
  let legacyAvatarId = String(user.heygenAccess?.avatarId || "").trim();
  let voiceId = String(user.heygenAccess?.voiceId || "").trim();
  let apiKey = String(user.heygenAccess?.apiKey || "").trim();
  let apiKeySource: HeyGenAccessContext["apiKeySource"] = apiKey ? "user" : "missing";

  // FALLBACK TO COMPANY CONFIG
  if (!apiKey && user.companyCode && user.companyCode !== "SYSTEM") {
    try {
      const { CompanyModel } = await import("../model/company.model");
      const company = await CompanyModel.findOne({ code: user.companyCode.toUpperCase() }).lean();
      if (company?.heygenConfig?.apiKey) {
        apiKey = String(company.heygenConfig.apiKey).trim();
        apiKeySource = "company";
        if (!legacyAvatarId && !rawAvatarIds.length && company.heygenConfig.defaultAvatarId) {
          legacyAvatarId = String(company.heygenConfig.defaultAvatarId).trim();
        }
        if (!voiceId && company.heygenConfig.defaultVoiceId) {
          voiceId = String(company.heygenConfig.defaultVoiceId).trim();
        }
      }
    } catch (err) {
      console.error("[getHeyGenAccessContext] Failed to load company HeyGen config:", err);
    }
  }

  if (!apiKey) {
    const envApiKey = String(process.env.HEYGEN_API_KEY || "").trim();
    if (envApiKey) {
      apiKey = envApiKey;
      apiKeySource = "env";
    }
  }

  const avatarIds = rawAvatarIds.length > 0
    ? rawAvatarIds
    : (legacyAvatarId ? [legacyAvatarId] : []);
  const avatarId = String(legacyAvatarId || avatarIds[0] || getDefaultAvatarId()).trim();
  const finalVoiceId = String(voiceId || getDefaultVoiceId()).trim();
  const warnings: string[] = [];
  const allowFullLibrary = true;

  if (!avatarId) {
    warnings.push("Tài khoản này chưa được gán avatar HeyGen mặc định.");
  }

  if (!finalVoiceId) {
    warnings.push("Tài khoản này chưa được gán voice HeyGen mặc định.");
  }

  console.log("[getHeyGenAccessContext] Resolved HeyGen access:", {
    userId,
    companyCode: user.companyCode || "SYSTEM",
    apiKeySource,
    apiKeyMasked: maskApiKey(apiKey),
    avatarId: avatarId || "(empty)",
    avatarCount: avatarIds.length,
    defaultVoiceId: finalVoiceId || "(empty)",
  });

  return {
    avatarIds,
    avatarId,
    voiceId: finalVoiceId,
    apiKey,
    apiKeySource,
    allowFullLibrary,
    warnings,
  };
}

interface CacheEntry {
  data: any;
  timestamp: number;
}
const libraryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchLookDetails(lookId: string, apiKey: string): Promise<HeyGenLibraryItem | null> {
  try {
    const data = await requestHeyGenJson(`/v3/avatars/looks/${encodeURIComponent(lookId)}`, undefined, apiKey);
    const item = data?.data || data;
    if (!item?.id) return null;
    return {
      id: String(item.id),
      name: String(item.name || "Technology iGen"),
      previewImage: String(item.preview_image_url || item.thumbnail_url || ""),
      gender: item.gender,
      language: item.language || "Vietnamese",
      accent: item.accent || "",
      isDefault: false,
      isCustom: true,
    };
  } catch (err) {
    console.error(`[fetchLookDetails] Failed to fetch look details for ${lookId}:`, err);
    return null;
  }
}

function filterLibraryByAccess(items: HeyGenLibraryItem[], selectedIds: string[], allowFullLibrary: boolean) {
  if (allowFullLibrary) {
    return items;
  }

  if (!selectedIds.length) {
    return [];
  }

  const allowedIds = new Set(selectedIds.map((item) => String(item)));
  return items.filter((item) => allowedIds.has(String(item.id)));
}

async function fetchLibraryWithCandidates(type: "avatar" | "voice", overrideApiKey?: string) {
  const candidates = type === "avatar"
    ? [
        "/v3/avatars/looks?ownership=private&limit=50",
        "/v3/avatars?ownership=private&limit=50",
        "/v3/avatars/looks?limit=50",
        "/v3/avatars?limit=50"
      ]
    : [
        "/v3/voices?limit=100",
        "/v3/voices?limit=50",
        "/v3/voices"
      ];

  let lastError: Error | null = null;

  for (const path of candidates) {
    try {
      console.log(`[fetchLibraryWithCandidates] Hitting HeyGen ${type} path: ${path}`);
      const payload = await requestHeyGenJson(path, undefined, overrideApiKey);
      let normalized = normalizeLibraryItems(payload, type);
      console.log(`[fetchLibraryWithCandidates] Hitting HeyGen ${type} path ${path} returned ${normalized.length} normalized items.`);
      if (type === "voice") {
        const rawCandidates = [
          payload?.data?.voices,
          payload?.voices,
          payload?.data,
          payload,
        ];
        const rawList = rawCandidates.find((item) => Array.isArray(item)) || [];
        const rawSample = rawList.slice(0, 5).map((item: any) => ({
          id: item?.voice_id || item?.id || item?.value,
          name: item?.name || item?.title || item?.label,
          type: item?.type,
          voice_type: item?.voice_type,
          source: item?.source,
          provider: item?.provider,
          ownership: item?.ownership,
          scope: item?.scope,
          visibility: item?.visibility,
          created_by: item?.created_by,
          owner_type: item?.owner_type,
          owned_by_me: item?.owned_by_me,
          is_owner: item?.is_owner,
          is_custom_voice: item?.is_custom_voice,
          is_user_voice: item?.is_user_voice,
          is_cloned_voice: item?.is_cloned_voice,
          isCustomNormalized: normalized.find((voice) => voice.id === String(item?.voice_id || item?.id || item?.value || ""))?.isCustom || false,
        }));
        console.log(`[fetchLibraryWithCandidates] HeyGen voice raw sample from ${path}:`, JSON.stringify(rawSample));
      }
      if (path.includes("ownership=private")) {
        normalized = normalized.map(item => ({ ...item, isCustom: true }));
      }
      if (normalized.length > 0) {
        return { items: normalized, source: path };
      }
      console.log(`[fetchLibraryWithCandidates] Normalized count is 0 for path ${path}, trying next...`);
    } catch (error: any) {
      console.error(`[fetchLibraryWithCandidates] Error hitting path ${path}:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error(`Không lấy được thư viện HeyGen cho ${type}`);
}

async function fetchPersonalVoiceCandidates(overrideApiKey?: string) {
  const candidates = [
    "/v3/voices?type=private&limit=100",
    "/v3/voices?type=private&limit=50",
    "/v3/voices?type=private",
  ];

  let lastError: Error | null = null;

  for (const path of candidates) {
    try {
      console.log(`[fetchPersonalVoiceCandidates] Hitting HeyGen personal voice path: ${path}`);
      let nextPath: string | null = path;
      const aggregated: HeyGenLibraryItem[] = [];
      const seen = new Set<string>();

      while (nextPath) {
        const payload = await requestHeyGenJson(nextPath, undefined, overrideApiKey);
        const normalized = normalizeLibraryItems(payload, "voice").map((item) => ({ ...item, isCustom: true }));
        for (const item of normalized) {
          if (seen.has(item.id)) {
            continue;
          }
          seen.add(item.id);
          aggregated.push(item);
        }

        const hasMore = Boolean(payload?.has_more);
        const nextToken = String(payload?.next_token || "").trim();
        nextPath = hasMore && nextToken ? `/v3/voices?type=private&limit=100&token=${encodeURIComponent(nextToken)}` : null;
      }

      console.log(`[fetchPersonalVoiceCandidates] Path ${path} returned ${aggregated.length} personal voices after pagination.`);
      if (aggregated.length > 0) {
        return { items: aggregated, source: path };
      }
    } catch (error: any) {
      console.error(`[fetchPersonalVoiceCandidates] Error hitting path ${path}:`, error.message);
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("[fetchPersonalVoiceCandidates] Không lấy được My Voice riêng từ HeyGen, sẽ trả mảng rỗng.");
  }

  return { items: [] as HeyGenLibraryItem[], source: "no_personal_voice_source" };
}

export async function upsertVideoRecord(userId: string, payload: {
  videoId: string;
  script: string;
  motionText?: string;
  avatarId?: string;
  voiceId?: string;
  audioUrl?: string;
  audioRecordId?: string;
  aspectRatio?: string;
  status?: string;
  title?: string;
  description?: string;
  videoUrl?: string;
  captionedVideoUrl?: string;
  subtitleUrl?: string;
  thumbnailUrl?: string;
}) {
  console.log("[heygenService.upsertVideoRecord] Upserting:", {
    userId,
    videoId: payload.videoId,
    status: payload.status,
    hasVideoUrl: Boolean(payload.videoUrl),
    hasCaptionedVideoUrl: Boolean(payload.captionedVideoUrl),
    title: payload.title,
  });
  const existing = await AIMediaModel.findOne({
    userId,
    mediaType: "video",
    "metadata.heygenVideoId": payload.videoId,
  });

  const metadata = {
    aspectRatio: payload.aspectRatio,
    heygenVideoId: payload.videoId,
    heygenAvatarId: payload.avatarId,
    heygenVoiceId: payload.voiceId,
    heygenAudioUrl: payload.audioUrl,
    heygenAudioRecordId: payload.audioRecordId,
    captionedVideoUrl: payload.captionedVideoUrl,
    subtitleUrl: payload.subtitleUrl,
    thumbnailUrl: payload.thumbnailUrl,
    provider: "heygen",
    status: payload.status || "processing",
    title: payload.title,
    description: payload.motionText
      ? [payload.description, `Motion: ${payload.motionText}`].filter(Boolean).join(" | ")
      : payload.description,
  };
  const fallbackUrl = payload.videoUrl || `pending://heygen/${payload.videoId}`;

  if (existing) {
    existing.url = payload.videoUrl || existing.url || fallbackUrl;
    existing.prompt = payload.script || existing.prompt;
    existing.metadata = {
      ...existing.metadata,
      ...metadata,
    };
    await existing.save();
    return existing.toObject();
  }

  return AIMediaModel.create({
    userId,
    mediaType: "video",
    url: fallbackUrl,
    prompt: payload.script,
    metadata,
  });
}

function normalizeStatusPayload(data: any) {
  const root = data?.data || data?.event_data || data;
  const captionedVideoUrl = root?.captioned_video_url || root?.video_url_with_caption || "";
  const subtitleUrl = root?.subtitle_url || "";
  const videoUrl =
    root?.video_url ||
    root?.url ||
    captionedVideoUrl ||
    root?.download_url ||
    root?.video_page_url ||
    "";
  const error = root?.failure_message || root?.error?.message || root?.error || "";
  return {
    jobStatus: root?.status || root?.video_status || root?.state || (error ? "failed" : videoUrl ? "completed" : "processing"),
    videoUrl,
    captionedVideoUrl,
    subtitleUrl,
    thumbnailUrl: root?.thumbnail_url || root?.cover_url || "",
    error,
    raw: data,
  };
}

function normalizeWebhookPayload(payload: HeyGenWebhookPayload) {
  const root = payload?.data || payload?.video || payload?.event_data || payload;
  const eventType = String(payload?.event_type || payload?.event || payload?.type || "video.updated").trim();
  const videoId = String(
    root?.video_id ||
    root?.id ||
    payload?.video_id ||
    payload?.videoId ||
    payload?.id ||
    ""
  ).trim();
  const normalized = normalizeStatusPayload(payload);
  const eventTypeLower = eventType.toLowerCase();
  const inferredJobStatus =
    (eventTypeLower.includes("fail") || eventTypeLower.includes("error") ? "failed" : "") ||
    (eventTypeLower.includes("complete") || eventTypeLower.includes("success") || eventTypeLower.includes("finish") ? "completed" : "") ||
    normalized.jobStatus ||
    "processing";
  const normalizedJobStatus = String(inferredJobStatus).toLowerCase() === "success" ? "completed" : inferredJobStatus;
  const resolvedVideoUrl =
    normalized.videoUrl ||
    root?.video_page_url ||
    root?.share_url ||
    root?.download_url ||
    root?.captioned_video_url ||
    "";

  return {
    eventType,
    videoId,
    jobStatus: normalizedJobStatus,
    videoUrl: resolvedVideoUrl,
    captionedVideoUrl: normalized.captionedVideoUrl,
    subtitleUrl: normalized.subtitleUrl,
    thumbnailUrl: normalized.thumbnailUrl,
    error: normalized.error,
    title: String(root?.title || payload?.title || "").trim() || undefined,
    duration: Number(root?.duration || payload?.duration || 0) || undefined,
    raw: payload,
  };
}

function toIsoStringFromUnix(value: any) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function normalizeHeyGenVideo(video: any, localRecord?: any): HeyGenRemoteVideo {
  const videoId = String(video?.id || localRecord?.metadata?.heygenVideoId || localRecord?._id || "");
  const fallbackPrompt = localRecord?.prompt || video?.title || "HeyGen video";

  return {
    id: videoId,
    _id: String(localRecord?._id || videoId),
    videoId,
    title: String(video?.title || localRecord?.metadata?.title || fallbackPrompt),
    prompt: String(fallbackPrompt),
    url: String(video?.video_url || localRecord?.url || ""),
    thumbnailUrl: String(video?.thumbnail_url || localRecord?.metadata?.thumbnailUrl || ""),
    gifUrl: String(video?.gif_url || ""),
    captionedVideoUrl: String(video?.captioned_video_url || localRecord?.metadata?.captionedVideoUrl || ""),
    subtitleUrl: String(video?.subtitle_url || localRecord?.metadata?.subtitleUrl || ""),
    duration: Number(video?.duration || localRecord?.metadata?.duration || 0),
    status: String(video?.status || localRecord?.metadata?.status || (video?.video_url ? "completed" : "processing")),
    createdAt: toIsoStringFromUnix(video?.created_at) || (localRecord?.createdAt ? new Date(localRecord.createdAt).toISOString() : null),
    completedAt: toIsoStringFromUnix(video?.completed_at),
    videoPageUrl: String(video?.video_page_url || ""),
    outputLanguage: String(video?.output_language || ""),
    failureCode: String(video?.failure_code || ""),
    failureMessage: String(video?.failure_message || ""),
    model: String(localRecord?.metadata?.title || "Avatar V"),
  };
}

function isActiveLocalVideoStatus(status: any) {
  return ACTIVE_VIDEO_STATUSES.has(String(status || "").toLowerCase());
}

async function deleteLocalVideoRecord(userId: string, videoId: string) {
  const filters: any[] = [{ "metadata.heygenVideoId": videoId }];

  if (mongoose.Types.ObjectId.isValid(videoId)) {
    filters.push({ _id: videoId });
  }

  const result = await AIMediaModel.deleteMany({
    userId,
    mediaType: "video",
    $or: filters,
  });

  return result.deletedCount || 0;
}

async function resolveAudioSource(userId: string, input: CreateAvatarVideoInput) {
  const directAudioUrl = String(input.audioUrl || "").trim();
  if (directAudioUrl) {
    return {
      audioUrl: directAudioUrl,
      audioRecordId: String(input.audioRecordId || "").trim() || undefined,
    };
  }

  const audioRecordId = String(input.audioRecordId || "").trim();
  if (!audioRecordId) {
    return {
      audioUrl: "",
      audioRecordId: undefined,
    };
  }

  const record = await AIMediaModel.findOne({
    _id: audioRecordId,
    userId,
    mediaType: "voice",
  }).lean();

  if (!record?.url) {
    throw new HeyGenApiError("Không tìm thấy audio ElevenLabs đã chọn.", 404);
  }

  return {
    audioUrl: String(record.url),
    audioRecordId,
  };
}

function verifyWebhookToken(token?: string) {
  const expectedToken = String(process.env.HEYGEN_WEBHOOK_SECRET || "").trim();
  if (!expectedToken) {
    return true;
  }

  return String(token || "").trim() === expectedToken;
}

export const heygenService = {
  verifyWebhookToken,

  async getLibrary(userId: string, force?: boolean) {
    const accessContext = await getHeyGenAccessContext(userId);
    requireApiKey(accessContext.apiKey);
    const apiKey = accessContext.apiKey || process.env.HEYGEN_API_KEY?.trim() || "";

    const selectedAvatarIds = accessContext.avatarIds.length > 0
      ? accessContext.avatarIds
      : (accessContext.avatarId ? [accessContext.avatarId] : []);

    const cacheKey = `${apiKey}_library`;
    if (force) {
      libraryCache.delete(cacheKey);
    }
    const cached = libraryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      const { avatars, voices, personalVoices, sources } = cached.data;
      return {
        status: "success",
        avatars: filterLibraryByAccess(
          avatars,
          selectedAvatarIds,
          accessContext.allowFullLibrary
        ),
        voices,
        personalVoices: personalVoices || [],
        sources,
        warnings: accessContext.warnings,
        defaults: {
          avatarId: accessContext.avatarId,
          voiceId: accessContext.voiceId,
        },
      };
    }

    let avatars: HeyGenLibraryItem[] = [];
    let avatarSource = "direct_look_fetch";

    // Speed Optimization: If user only has access to a list of specific avatars, fetch them directly instead of downloading all 1285+ avatars
    if (!accessContext.allowFullLibrary && selectedAvatarIds.length > 0) {
      try {
        const fetchedLooks = await Promise.all(
          selectedAvatarIds.map(id => fetchLookDetails(id, apiKey))
        );
        avatars = fetchedLooks.filter((item): item is HeyGenLibraryItem => item !== null);
        if (avatars.length > 0) {
          avatarSource = "v3_looks_api";
        }
      } catch (err) {
        console.warn("[getLibrary] Direct look fetch failed, falling back to full library fetch:", err);
      }
    }

    // Fallback/Full fetch
    if (avatars.length === 0) {
      const avatarResult = await fetchLibraryWithCandidates("avatar", apiKey);
      avatars = accessContext.allowFullLibrary
        ? filterCustomAvatars(avatarResult.items)
        : avatarResult.items;
      avatarSource = avatarResult.source;
    }

    // Fetch full voice library for generic HeyGen use cases
    const voiceResult = await fetchLibraryWithCandidates("voice", apiKey);
    const personalVoiceResult = await fetchPersonalVoiceCandidates(apiKey);
    if (voiceResult.items.length > 0 && personalVoiceResult.items.length === 0) {
      console.warn("[heygenService.getLibrary] Public voices found but personal voices are empty.", {
        userId,
        apiKeySource: accessContext.apiKeySource,
        apiKeyMasked: maskApiKey(apiKey),
        publicVoiceCount: voiceResult.items.length,
        personalVoiceCount: personalVoiceResult.items.length,
      });
    }

    // Save to cache for instant sub-sequent loads
    const dataToCache = {
      avatars,
      voices: voiceResult.items,
      personalVoices: personalVoiceResult.items,
      sources: {
        avatars: avatarSource,
        voices: voiceResult.source,
        personalVoices: personalVoiceResult.source,
      },
    };

    libraryCache.set(cacheKey, {
      data: dataToCache,
      timestamp: Date.now(),
    });

    return {
      status: "success",
      avatars: filterLibraryByAccess(
        avatars,
        selectedAvatarIds,
        accessContext.allowFullLibrary
      ),
      voices: voiceResult.items,
      personalVoices: personalVoiceResult.items,
      sources: dataToCache.sources,
      warnings: accessContext.warnings,
      defaults: {
        avatarId: accessContext.avatarId,
        voiceId: accessContext.voiceId,
      },
    };
  },

  async createAvatarVideo(userId: string, input: CreateAvatarVideoInput) {
    if (input.engineType === "avatar_iii") {
      return heygenLegacyService.generateLegacyVideo(userId, input);
    }

    const accessContext = await getHeyGenAccessContext(userId);
    const apiKey = requireApiKey(accessContext.apiKey);
    const {
      avatarId,
      voiceId,
      motionText,
      aspectRatio,
      resolution,
      engineType,
      title,
      description,
      avatarBackground,
      backgroundColor,
      avatarLayout,
      inputText,
    } = input;
    const normalizedVoiceId = String(voiceId || "").trim();
    const normalizedInputText = String(inputText || "").trim();
    const useTextToSpeech = Boolean(normalizedVoiceId && normalizedInputText);
    const { audioUrl, audioRecordId } = useTextToSpeech
      ? { audioUrl: "", audioRecordId: undefined }
      : await resolveAudioSource(userId, input);
    const hasAudioSource = Boolean(audioUrl);

    if (!avatarId?.trim()) {
      throw new HeyGenApiError("Vui lòng chọn avatar HeyGen trước khi tạo video.", 400);
    }

    if (!useTextToSpeech && !hasAudioSource) {
      throw new HeyGenApiError("Cần cung cấp audio ElevenLabs để tạo video.", 400);
    }

    const allowedAvatarIds = accessContext.avatarIds.length > 0
      ? accessContext.avatarIds
      : (accessContext.avatarId ? [accessContext.avatarId] : []);

    if (!accessContext.allowFullLibrary && !allowedAvatarIds.includes(avatarId)) {
      throw new HeyGenApiError("Avatar này không được cấp cho tài khoản hiện tại.", 403);
    }

    if (normalizedVoiceId && !accessContext.allowFullLibrary && !input.usePersonalVoice && accessContext.voiceId !== normalizedVoiceId) {
      throw new HeyGenApiError("Giọng đọc này không được cấp cho tài khoản hiện tại.", 403);
    }

    let finalBgColor = "#161d27";
    if (avatarBackground === "color" && backgroundColor) {
      finalBgColor = backgroundColor;
    } else if (avatarBackground === "remove") {
      finalBgColor = "#00FF00";
    } else if (avatarBackground === "customize") {
      finalBgColor = "#161d27";
    } else if (backgroundColor) {
      finalBgColor = backgroundColor;
    }

    const requestBody: Record<string, any> = {
      type: "avatar",
      avatar_id: avatarId,
      aspect_ratio: aspectRatio || "16:9",
      resolution: resolution || "720p",
      background: {
        type: "color",
        value: finalBgColor,
      },
    };

    const webhookUrl = getHeyGenWebhookUrl();
    if (webhookUrl) {
      requestBody.callback_url = webhookUrl;
    }

    if (input.enableCaption) {
      requestBody.caption = {
        file_format: "srt",
        style: "default",
      };
    }

    if (useTextToSpeech) {
      requestBody.script = normalizedInputText;
      if (normalizedVoiceId) {
        requestBody.voice_id = normalizedVoiceId;
      }
    } else {
      requestBody.audio_url = audioUrl;
    }

    if (title?.trim()) {
      requestBody.title = title.trim();
    }

    if (motionText?.trim()) {
      requestBody.motion_prompt = motionText.trim();
    }

    if (engineType === "avatar_v") {
      requestBody.engine = { type: "avatar_v" };
    } else if (engineType === "avatar_iv") {
      requestBody.engine = { type: "avatar_iv" };
    } else if (engineType === "avatar_iii") {
      requestBody.engine = { type: "avatar_iii" };
    }

    const response = await fetch(`${HEYGEN_API_BASE}/v3/videos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
        "x-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await parseHeyGenResponse(response, "Không thể tạo video ");
    const videoId = data?.data?.video_id || data?.video_id || data?.id;

    if (!videoId) {
      throw new Error("HeyGen không trả về video_id");
    }

    const record = await upsertVideoRecord(userId, {
      videoId,
      script: useTextToSpeech ? normalizedInputText : (title || "HeyGen audio video"),
      motionText,
      avatarId,
      voiceId: normalizedVoiceId || undefined,
      audioUrl: audioUrl || undefined,
      audioRecordId,
      aspectRatio,
      status: data?.data?.status || data?.status || "processing",
      title,
      description,
    });

    return {
      status: "success",
      provider: "heygen",
      videoId,
      jobStatus: data?.data?.status || data?.status || "processing",
      requestedAt: new Date().toISOString(),
      audioUrl: audioUrl || undefined,
      audioRecordId,
      record,
    };
  },

  async getVideoStatus(userId: string, videoId: string, context?: Partial<CreateAvatarVideoInput>) {
    const accessContext = await getHeyGenAccessContext(userId);
    let data: any = null;
    try {
      data = await requestHeyGenJson(`/v3/videos/${encodeURIComponent(videoId)}`, undefined, accessContext.apiKey);
    } catch (err) {
      console.log(`[getVideoStatus] v3 endpoint failed, trying v1/video_status.get for video ${videoId}:`, err);
      try {
        data = await heygenLegacyService.getLegacyStatus(videoId, accessContext.apiKey || process.env.HEYGEN_API_KEY?.trim() || "");
      } catch (v1Err) {
        console.error(`[getVideoStatus] Both v3 and v1 status calls failed:`, v1Err);
        throw err;
      }
    }
    const normalized = normalizeStatusPayload(data);
    console.log("[heygenService.getVideoStatus] Normalized status:", {
      userId,
      videoId,
      jobStatus: normalized.jobStatus,
      hasVideoUrl: Boolean(normalized.videoUrl),
      hasThumbnailUrl: Boolean(normalized.thumbnailUrl),
      error: normalized.error || "",
    });

    const record = await upsertVideoRecord(userId, {
      videoId,
      videoUrl: normalized.videoUrl || undefined,
      captionedVideoUrl: normalized.captionedVideoUrl || undefined,
      subtitleUrl: normalized.subtitleUrl || undefined,
      thumbnailUrl: normalized.thumbnailUrl || undefined,
      script: context?.title || "Video người thật",
      motionText: context?.motionText,
      avatarId: context?.avatarId,
      voiceId: context?.voiceId,
      audioUrl: context?.audioUrl,
      audioRecordId: context?.audioRecordId,
      aspectRatio: context?.aspectRatio,
      status: normalized.jobStatus,
      title: context?.title,
      description: context?.description,
    });

    return {
      status: "success",
      videoId,
      jobStatus: normalized.jobStatus,
      videoUrl: normalized.videoUrl,
      thumbnailUrl: normalized.thumbnailUrl,
      error: normalized.error,
      record,
      raw: data,
    };
  },

  async getVideoHistory(userId: string) {
    const localRecords = await AIMediaModel.find({
      userId,
      mediaType: "video",
      $or: [
        { "metadata.provider": "heygen" },
        { "metadata.heygenVideoId": { $exists: true, $ne: "" } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const activeRecords = localRecords.filter((r) =>
      r.metadata?.status && ACTIVE_VIDEO_STATUSES.has(String(r.metadata.status).toLowerCase())
    );

    if (activeRecords.length > 0) {
      try {
        const accessContext = await getHeyGenAccessContext(userId);
        const apiKey = accessContext.apiKey || process.env.HEYGEN_API_KEY?.trim();
        if (apiKey) {
          await Promise.allSettled(
            activeRecords.map(async (record) => {
              try {
                const videoId = record.metadata.heygenVideoId;
                if (!videoId) return;
                let data: any = null;
                try {
                  data = await requestHeyGenJson(`/v3/videos/${encodeURIComponent(videoId)}`, undefined, apiKey);
                } catch (v3Err) {
                  try {
                    data = await heygenLegacyService.getLegacyStatus(videoId, apiKey);
                  } catch (v1Err) {
                    console.error(`[getVideoHistory] Status fetch failed for video ${videoId}:`, v1Err);
                    throw v3Err;
                  }
                }
                const normalized = normalizeStatusPayload(data);
                await upsertVideoRecord(userId, {
                  videoId,
                  videoUrl: normalized.videoUrl || undefined,
                  captionedVideoUrl: normalized.captionedVideoUrl || undefined,
                  subtitleUrl: normalized.subtitleUrl || undefined,
                  thumbnailUrl: normalized.thumbnailUrl || undefined,
                  script: record.prompt || "Video người thật",
                  status: normalized.jobStatus,
                  aspectRatio: record.metadata?.aspectRatio,
                  title: record.metadata?.title,
                  description: record.metadata?.description,
                });
              } catch (e) {
                console.error(`[getVideoHistory] Error polling live status for video ${record._id}:`, e);
              }
            })
          );

          // Refetch updated list from DB
          const updatedRecords = await AIMediaModel.find({
            userId,
            mediaType: "video",
            $or: [
              { "metadata.provider": "heygen" },
              { "metadata.heygenVideoId": { $exists: true, $ne: "" } },
            ],
          })
            .sort({ createdAt: -1 })
            .lean();
          return updatedRecords.map((record) => normalizeHeyGenVideo(null, record));
        }
      } catch (error) {
        console.error("[getVideoHistory] Live sync error:", error);
      }
    }

    return localRecords.map((record) => normalizeHeyGenVideo(null, record));
  },

  async processWebhook(payload: HeyGenWebhookPayload) {
    const normalized = normalizeWebhookPayload(payload);
    console.log("[heygenService.processWebhook] Normalized payload:", {
      videoId: normalized.videoId,
      eventType: normalized.eventType,
      jobStatus: normalized.jobStatus,
      hasVideoUrl: Boolean(normalized.videoUrl),
      hasCaptionedVideoUrl: Boolean(normalized.captionedVideoUrl),
      hasThumbnailUrl: Boolean(normalized.thumbnailUrl),
      error: normalized.error || "",
    });

    if (!normalized.videoId) {
      throw new HeyGenApiError("Webhook HeyGen không có video_id.", 400, payload);
    }

    let resolvedNormalized = normalized;
    const normalizedStatus = String(normalized.jobStatus || "").toLowerCase();
    const needsStatusRefetch =
      (normalizedStatus === "completed" || normalizedStatus === "success") &&
      !String(normalized.videoUrl || "").trim();

    if (needsStatusRefetch) {
      try {
        const recordForLookup = await AIMediaModel.findOne({
          mediaType: "video",
          "metadata.heygenVideoId": normalized.videoId,
        }).lean();

        const userId = String(recordForLookup?.userId || "").trim();
        if (userId) {
          const accessContext = await getHeyGenAccessContext(userId);
          let data: any = null;
          try {
            data = await requestHeyGenJson(`/v3/videos/${encodeURIComponent(normalized.videoId)}`, undefined, accessContext.apiKey);
          } catch {
            data = await heygenLegacyService.getLegacyStatus(
              normalized.videoId,
              accessContext.apiKey || process.env.HEYGEN_API_KEY?.trim() || ""
            );
          }
          const statusNormalized = normalizeStatusPayload(data);
          resolvedNormalized = {
            ...normalized,
            jobStatus: statusNormalized.jobStatus || normalized.jobStatus,
            videoUrl: statusNormalized.videoUrl || normalized.videoUrl,
            captionedVideoUrl: statusNormalized.captionedVideoUrl || normalized.captionedVideoUrl,
            subtitleUrl: statusNormalized.subtitleUrl || normalized.subtitleUrl,
            thumbnailUrl: statusNormalized.thumbnailUrl || normalized.thumbnailUrl,
            error: statusNormalized.error || normalized.error,
          };
        }
      } catch (error) {
        console.error("[heygenService.processWebhook] Fallback status refetch failed:", error);
      }
    }

    const records = await AIMediaModel.find({
      mediaType: "video",
      "metadata.heygenVideoId": resolvedNormalized.videoId,
    });

    if (records.length === 0) {
      return {
        status: "ignored",
        reason: "video_not_found",
        videoId: resolvedNormalized.videoId,
        eventType: resolvedNormalized.eventType,
      };
    }

    const updates = await Promise.all(records.map(async (record) => {
      record.url = resolvedNormalized.videoUrl || record.url || `pending://heygen/${resolvedNormalized.videoId}`;
      record.metadata = {
        ...record.metadata,
        status: resolvedNormalized.jobStatus,
        captionedVideoUrl: resolvedNormalized.captionedVideoUrl || record.metadata?.captionedVideoUrl,
        subtitleUrl: resolvedNormalized.subtitleUrl || record.metadata?.subtitleUrl,
        thumbnailUrl: resolvedNormalized.thumbnailUrl || record.metadata?.thumbnailUrl,
        title: resolvedNormalized.title || record.metadata?.title,
        duration: resolvedNormalized.duration || record.metadata?.duration,
        heygenLastWebhookEvent: resolvedNormalized.eventType,
        heygenWebhookUpdatedAt: new Date().toISOString(),
      };
      await record.save();
      return record.toObject();
    }));

    // Broadcast video status update event to connected socket clients
    broadcastEvent("video_status_updated", {
      videoId: resolvedNormalized.videoId,
      status: resolvedNormalized.jobStatus,
      updates,
    });

    return {
      status: "success",
      videoId: resolvedNormalized.videoId,
      eventType: resolvedNormalized.eventType,
      jobStatus: resolvedNormalized.jobStatus,
      updatedCount: updates.length,
      records: updates,
    };
  },

  async deleteVideoHistory(userId: string, videoId: string) {
    const accessContext = await getHeyGenAccessContext(userId);
    requireApiKey(accessContext.apiKey);

    const localRecord = await AIMediaModel.findOne({
      userId,
      mediaType: "video",
      $or: [
        { "metadata.heygenVideoId": videoId },
        ...(mongoose.Types.ObjectId.isValid(videoId) ? [{ _id: videoId }] : []),
      ],
    }).lean();

    const remoteVideoId = String(localRecord?.metadata?.heygenVideoId || videoId);
    let remoteDeleted = false;

    if (remoteVideoId) {
      try {
        await requestHeyGenJson(`/v3/videos/${encodeURIComponent(remoteVideoId)}`, {
          method: "DELETE",
        }, accessContext.apiKey);
        remoteDeleted = true;
      } catch (error: any) {
        const message = String(error?.message || "");
        const isAlreadyGone = error?.statusCode === 404 || /not found/i.test(message);
        if (!isAlreadyGone) {
          throw error;
        }
      }
    }

    let deletedLocalCount = await deleteLocalVideoRecord(userId, videoId);
    if (remoteVideoId !== videoId) {
      deletedLocalCount += await deleteLocalVideoRecord(userId, remoteVideoId);
    }

    return { status: "success", remoteDeleted, deletedLocalCount };
  },
};
