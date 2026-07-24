import { MediaAsset, TemplateEditorProject, TemplateEditorMode } from './types';

function createSvgThumbnail(title: string, color1: string, color2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <circle cx="320" cy="100" r="140" fill="#ffffff" fill-opacity="0.12"/>
    <circle cx="80" cy="500" r="160" fill="#000000" fill-opacity="0.15"/>
    <text x="200" y="310" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MOCK_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'asset-001',
    name: 'AW9E8BT5-Q5U7...',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: createSvgThumbnail('Model Fashion 1', '#111827', '#374151'),
    duration: 5.1,
    added: true,
  },
  {
    id: 'asset-002',
    name: 'GQZX35S-HYR0...',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: createSvgThumbnail('Model Fashion 2', '#1e1b4b', '#4338ca'),
    duration: 12.3,
    added: true,
  },
  {
    id: 'asset-003',
    name: 'GNSPVM8J-0B91...',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: createSvgThumbnail('Lookbook Summer', '#831843', '#db2777'),
    added: false,
  },
  {
    id: 'asset-004',
    name: 'A62UVPT2-IEVI...',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: createSvgThumbnail('Urban Style 2026', '#064e3b', '#059669'),
    added: false,
  },
  {
    id: 'asset-005',
    name: 'coverflix-650964...',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl: createSvgThumbnail('Outdoor Vibes', '#7c2d12', '#ea580c'),
    duration: 8.0,
    added: false,
  },
  {
    id: 'asset-006',
    name: 'TUTQ37C-E6UE...',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop&q=80',
    thumbnailUrl: createSvgThumbnail('Shopping Collection', '#4c1d95', '#7c3aed'),
    added: false,
  },
];

export const MOCK_TEXT_PRESETS = [
  { id: 'txt-p1', title: 'Tiêu đề Trend TikTok', text: 'TikTok KANGGUG', color: '#00e5ff', fontSize: 32, bold: true },
  { id: 'txt-p2', title: 'Subtitle Phụ Đề', text: 'FLASH SALE 50% HÔM NAY', color: '#ffd600', fontSize: 24, bold: true },
  { id: 'txt-p3', title: 'Call To Action', text: 'Mua Ngay Nút Bên Dưới', color: '#ffffff', fontSize: 20, bold: false },
  { id: 'txt-p4', title: 'Tên Thương Hiệu', text: 'iGen Creative Studio', color: '#a855f7', fontSize: 28, bold: true },
];

export const MOCK_AUDIO_TRACKS = [
  { id: 'audio-01', name: 'Upbeat EDM Viral Summer', artist: 'iGen Sound', duration: 17.4, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'audio-02', name: 'Chill Lofi Beats Evening', artist: 'Acoustic Vibe', duration: 25.0, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'audio-03', name: 'Corporate Promo Energy', artist: 'Inspire Audio', duration: 30.0, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

export function createDefaultProject(
  mode: TemplateEditorMode = 'edit-project',
  initialData?: Partial<TemplateEditorProject> & { previewVideoUrl?: string; thumbnailUrl?: string }
): TemplateEditorProject {
  const projectId = initialData?.id || `proj-${Date.now().toString().slice(-6)}`;
  const defaultTracks = initialData?.tracks || [
    { id: 'track-video', type: 'video', name: 'Track Video' },
    { id: 'track-text', type: 'text', name: 'Track Chữ' },
    { id: 'track-audio', type: 'audio', name: 'Track Âm thanh' },
  ];

  // If initialData provides explicit items from backend API/blueprint, ALWAYS prioritize them!
  if (initialData?.items && initialData.items.length > 0) {
    return {
      id: projectId,
      title: initialData.title || 'Dự án từ mẫu',
      description: initialData.description || '',
      aspectRatio: initialData.aspectRatio || '9:16',
      duration: initialData.duration || 15,
      mode,
      submissionStatus: initialData.submissionStatus,
      tracks: JSON.parse(JSON.stringify(defaultTracks)),
      items: JSON.parse(JSON.stringify(initialData.items)),
    };
  }

  // MODE: CREATE TEMPLATE (Empty project by default unless initialData provided)
  if (mode === 'create-template') {
    return {
      id: projectId,
      title: initialData?.title || 'Mẫu Video Mới 2026',
      description: initialData?.description || '',
      aspectRatio: initialData?.aspectRatio || '9:16',
      duration: initialData?.duration || 10,
      mode: 'create-template',
      submissionStatus: 'draft',
      tracks: defaultTracks,
      items: [],
    };
  }

  // MODE: EDIT PROJECT (Loaded from selected template or default)
  const templateTitle = initialData?.title || 'Dự án từ mẫu TikTok';
  const templateDuration = initialData?.duration || 17.4;
  const mainMediaUrl = initialData?.previewVideoUrl || MOCK_MEDIA_ASSETS[0].url;
  const mainThumbUrl = initialData?.thumbnailUrl || MOCK_MEDIA_ASSETS[0].thumbnailUrl;

  const items: TemplateEditorProject['items'] = [
    {
      id: 'item-v1',
      trackId: 'track-video',
      type: 'video',
      start: 0,
      duration: templateDuration,
      sourceUrl: mainMediaUrl,
      thumbnailUrl: mainThumbUrl,
      replaceable: true,
      volume: 1.0,
      fitMode: 'cover',
      rotation: 0,
      label: templateTitle,
      order: 1,
    },
    {
      id: 'item-t1',
      trackId: 'track-text',
      type: 'text',
      start: 0.5,
      duration: Math.max(2, templateDuration - 1),
      text: templateTitle,
      style: {
        fontFamily: 'Inter',
        fontSize: 30,
        color: '#00e5ff',
        align: 'center',
        bold: true,
        italic: false,
        x: 50,
        y: 65,
      },
      order: 1,
    },
    {
      id: 'item-a1',
      trackId: 'track-audio',
      type: 'audio',
      start: 0,
      duration: templateDuration,
      sourceUrl: MOCK_AUDIO_TRACKS[0].url,
      label: MOCK_AUDIO_TRACKS[0].name,
      volume: 0.7,
      order: 1,
    },
  ];

  return {
    id: projectId,
    title: templateTitle,
    description: initialData?.description || 'Mẫu video thời trang ngắn xu hướng 9:16.',
    aspectRatio: initialData?.aspectRatio || '9:16',
    duration: templateDuration,
    mode: 'edit-project',
    tracks: defaultTracks,
    items,
  };
}
