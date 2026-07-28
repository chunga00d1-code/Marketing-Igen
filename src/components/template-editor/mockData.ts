import { MediaAsset, TemplateEditorProject, TemplateEditorMode } from './types';

export const MOCK_MEDIA_ASSETS: MediaAsset[] = [];

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
  const mainMediaUrl = initialData?.previewVideoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  const mainThumbUrl = initialData?.thumbnailUrl || '';

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
