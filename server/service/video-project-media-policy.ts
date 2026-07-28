import type { VideoTemplateIdentity } from "../interface/video-template.interface";

export type VideoProjectMediaType = "video" | "image" | "audio";

export interface VideoProjectMediaInput {
  fileName: string;
  mimeType: string;
  fileSize: number;
  mediaType: VideoProjectMediaType;
}

const MEDIA_RULES = {
  video: {
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    maxBytes: 200 * 1024 * 1024,
    resourceType: "video",
  },
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: 20 * 1024 * 1024,
    resourceType: "image",
  },
  audio: {
    mimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg"],
    maxBytes: 50 * 1024 * 1024,
    resourceType: "video",
  },
} as const;

export function validateVideoProjectMedia(input: VideoProjectMediaInput) {
  const rule = MEDIA_RULES[input.mediaType];
  const mimeType = input.mimeType.toLowerCase();
  if (!(rule.mimeTypes as readonly string[]).includes(mimeType)) {
    throw new Error("Loại MIME không phù hợp với loại media đã chọn.");
  }
  if (input.fileSize <= 0) {
    throw new Error("File tải lên không được để trống.");
  }
  if (input.fileSize > rule.maxBytes) {
    throw new Error(`File ${input.mediaType} vượt quá giới hạn ${rule.maxBytes / 1024 / 1024}MB.`);
  }
  return {
    mediaType: input.mediaType,
    resourceType: rule.resourceType,
    maxBytes: rule.maxBytes,
  };
}

export function sanitizeCloudinaryPathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

export function buildVideoProjectMediaFolder(
  identity: Pick<VideoTemplateIdentity, "companyCode" | "userId">,
  mediaType: VideoProjectMediaType
) {
  return [
    "igen_erp/template_editor",
    sanitizeCloudinaryPathSegment(identity.companyCode),
    sanitizeCloudinaryPathSegment(identity.userId),
    mediaType,
  ].join("/");
}
