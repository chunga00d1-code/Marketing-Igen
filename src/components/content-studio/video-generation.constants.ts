export const VIDEO_MODEL_OPTIONS = [
  { value: 'google/veo-3.1-fast', label: 'iGen video 3.1 Fast', desc: 'Tối ưu tốc độ, có audio · OpenRouter' },
  { value: 'bytedance/seedance-2.0', label: 'Seedance 2.0', desc: 'Giữ nhân vật và chuyển động tốt · OpenRouter' },
] as const;

export const VIDEO_DURATION_OPTIONS = [
  { value: '4', label: '4 giây' },
  { value: '6', label: '6 giây' },
  { value: '8', label: '8 giây' },
] as const;

export const VIDEO_QUALITY_OPTIONS = [
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p', label: '720p (HD)' },
] as const;
