export type TemplatePreviewPresentation =
  | 'video'
  | 'pending'
  | 'failed'
  | 'playback-error';

export function resolveTemplatePreviewPresentation(
  status: 'pending' | 'ready' | 'failed' | undefined,
  previewVideoUrl: string | undefined,
  playbackError: boolean
): TemplatePreviewPresentation {
  if (playbackError && previewVideoUrl) return 'playback-error';
  if (status === 'ready' && previewVideoUrl) return 'video';
  if (status === 'failed') return 'failed';
  return 'pending';
}
