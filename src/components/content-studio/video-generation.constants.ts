export const VIDEO_MODEL_OPTIONS = [
  { value: 'piapi-veo31-video-fast-audio', label: 'iGen video 3.1 Fast', desc: 'Toi uu toc do, co audio' },
  { value: 'piapi-veo31-video-audio', label: 'iGen video 3.1', desc: 'Chat luong cao, co audio' },
  { value: 'piapi-veo31-video-fast-no-audio', label: 'iGen video 3.1 Fast Silent', desc: 'Nhanh hon, khong tao audio' },
] as const;

export const VIDEO_DURATION_OPTIONS = [
  { value: '8', label: '8 giây' },
  { value: '16', label: '16 giây' },
  { value: '24', label: '24 giây' },
  { value: '32', label: '32 giây' },
] as const;

export const VIDEO_QUALITY_OPTIONS = [
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p', label: '720p (HD)' },
] as const;
