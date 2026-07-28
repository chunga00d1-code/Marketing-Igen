import type { MediaAsset, TemplateEditorItem } from './types';

const STORAGE_KEY = 'igen_uploaded_media_assets_v1';

export function loadSavedUploadedMediaAssets(): MediaAsset[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item: MediaAsset) => ({
        ...item,
        uploadStatus: item.uploadStatus === 'error' ? 'error' : 'ready',
        uploadProgress: undefined,
        sourceFile: undefined,
      }));
    }
  } catch {
    // Return empty on storage or parse errors
  }
  return [];
}

export function saveUploadedMediaAssets(assets: MediaAsset[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const serializable = assets
      .filter((a) => a.uploadStatus !== 'uploading')
      .map((asset) => {
        const copy = { ...asset };
        delete copy.sourceFile;
        return copy;
      });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage write errors
  }
}

const UNSUPPORTED_BROWSER_VIDEO_EXTENSIONS = new Set([
  'avi',
  'flv',
  'mkv',
  'mov',
  'wmv',
]);

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

function mediaExtension(url?: string): string {
  if (!url) return '';
  try {
    const pathname = new URL(url, 'http://localhost').pathname;
    return pathname.split('.').pop()?.toLowerCase() || '';
  } catch {
    return '';
  }
}

export function isBrowserPreviewableVideoUrl(url?: string): boolean {
  if (!url || url.includes('{{') || url.includes('}}')) return false;
  const extension = mediaExtension(url);
  return !IMAGE_EXTENSIONS.has(extension)
    && !UNSUPPORTED_BROWSER_VIDEO_EXTENSIONS.has(extension);
}

export function resolveRenderedTemplatePreviewUrl(
  ...candidates: Array<string | undefined>
): string | undefined {
  return candidates.find(isBrowserPreviewableVideoUrl);
}

export function browserPreviewSourceForItem(
  item: TemplateEditorItem,
  renderedTemplatePreviewUrl?: string
): string | undefined {
  if (
    item.type === 'video'
    && !isBrowserPreviewableVideoUrl(item.sourceUrl)
    && isBrowserPreviewableVideoUrl(renderedTemplatePreviewUrl)
  ) {
    return renderedTemplatePreviewUrl;
  }
  return item.sourceUrl;
}

export function shouldUseRenderedTemplatePreview(
  items: TemplateEditorItem[],
  renderedTemplatePreviewUrl?: string
): boolean {
  return isBrowserPreviewableVideoUrl(renderedTemplatePreviewUrl)
    && items.some((item) =>
      item.type === 'video' && !isBrowserPreviewableVideoUrl(item.sourceUrl)
    );
}

