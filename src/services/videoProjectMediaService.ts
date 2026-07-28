import { getAccessToken } from './authService';

export type EditorMediaType = 'video' | 'image' | 'audio';

interface EditorMediaMetadata {
  name: string;
  type: string;
  size: number;
}

interface SignedUpload {
  cloudName: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  folder: string;
  resourceType: 'video' | 'image';
}

export interface UploadedEditorMedia {
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  mediaType: EditorMediaType;
}

const CLIENT_RULES: Record<EditorMediaType, { mimeTypes: string[]; maxBytes: number }> = {
  video: {
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: 200 * 1024 * 1024,
  },
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxBytes: 20 * 1024 * 1024,
  },
  audio: {
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg'],
    maxBytes: 50 * 1024 * 1024,
  },
};

function inferMimeType(fileName: string, mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized && normalized !== 'application/octet-stream') return normalized;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'm4v', 'mov', 'qt', 'webm', 'mkv', 'avi'].includes(ext)) {
    if (['mov', 'qt'].includes(ext)) return 'video/quicktime';
    if (['webm'].includes(ext)) return 'video/webm';
    return 'video/mp4';
  }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'].includes(ext)) {
    if (['png'].includes(ext)) return 'image/png';
    if (['webp'].includes(ext)) return 'image/webp';
    if (['gif'].includes(ext)) return 'image/gif';
    return 'image/jpeg';
  }
  return normalized;
}

export function validateEditorMediaMetadata(metadata: EditorMediaMetadata) {
  const mimeType = inferMimeType(metadata.name, metadata.type);
  const mediaType = (Object.keys(CLIENT_RULES) as EditorMediaType[]).find((candidate) =>
    CLIENT_RULES[candidate].mimeTypes.includes(mimeType)
  );
  if (!mediaType) throw new Error('File không thuộc định dạng video, ảnh hoặc âm thanh được hỗ trợ.');
  const maxBytes = CLIENT_RULES[mediaType].maxBytes;
  if (metadata.size <= 0) throw new Error('File tải lên không được để trống.');
  if (metadata.size > maxBytes) {
    throw new Error(`File ${mediaType} vượt quá giới hạn ${maxBytes / 1024 / 1024}MB.`);
  }
  return { mediaType, maxBytes };
}

export function parseCloudinaryUploadResponse(payload: unknown) {
  const response = payload as {
    secure_url?: string;
    duration?: number;
    width?: number;
    height?: number;
    error?: { message?: string };
  };
  if (!response.secure_url?.startsWith('https://')) {
    throw new Error(response.error?.message || 'Phản hồi tải lên Cloudinary không hợp lệ.');
  }
  return {
    url: response.secure_url,
    duration: response.duration,
    width: response.width,
    height: response.height,
  };
}

async function requestUploadSignature(file: File, mediaType: EditorMediaType): Promise<SignedUpload> {
  const token = getAccessToken();
  const response = await fetch('/api/v1/video-projects/media/sign-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      mediaType,
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    status?: string;
    data?: SignedUpload;
    message?: string;
  };
  if (!response.ok || payload.status !== 'success' || !payload.data) {
    throw new Error(payload.message || 'Không thể chuẩn bị tải media.');
  }
  return payload.data;
}

function uploadToCloudinary(
  file: File,
  signed: SignedUpload,
  onProgress: (progress: number) => void
): Promise<ReturnType<typeof parseCloudinaryUploadResponse>> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      'POST',
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${signed.resourceType}/upload`
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error('Mất kết nối khi tải media lên Cloudinary.'));
    request.onload = () => {
      const payload = JSON.parse(request.responseText || '{}') as unknown;
      if (request.status < 200 || request.status >= 300) {
        const error = payload as { error?: { message?: string } };
        reject(new Error(error.error?.message || 'Cloudinary từ chối file tải lên.'));
        return;
      }
      try {
        resolve(parseCloudinaryUploadResponse(payload));
      } catch (error) {
        reject(error);
      }
    };
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signed.apiKey);
    formData.append('timestamp', String(signed.timestamp));
    formData.append('folder', signed.folder);
    formData.append('signature', signed.signature);
    request.send(formData);
  });
}

export async function uploadEditorMedia(
  file: File,
  onProgress: (progress: number) => void = () => undefined
): Promise<UploadedEditorMedia> {
  const { mediaType } = validateEditorMediaMetadata(file);
  const signed = await requestUploadSignature(file, mediaType);
  const uploaded = await uploadToCloudinary(file, signed, onProgress);
  return { ...uploaded, mediaType };
}
