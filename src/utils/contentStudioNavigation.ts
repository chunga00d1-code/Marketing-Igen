export type ContentStudioTab = 'image' | 'video' | 'voice' | 'bulk';

export const CONTENT_STUDIO_TAB_ROUTES: Record<ContentStudioTab, string> = {
  image: '/xuong-noi-dung/tao-hinh-anh',
  video: '/xuong-noi-dung/tao-video',
  voice: '/xuong-noi-dung/tao-giong-noi',
  bulk: '/xuong-noi-dung/thiet-ke-hang-loat',
};

export interface ContentStudioLaunchParams {
  tab: 'image' | 'video' | 'voice';
  prompt: string;
  cardId: string;
  image?: string;
  autoTrigger?: boolean;
  videoSubTab?: 'veo' | 'heygen' | 'edit-video';
  title?: string;
  description?: string;
  engineType?: string;
  usePersonalVoice?: boolean;
}

const STORAGE_KEY = 'igen:content-studio:launch';

export function openContentStudio(params?: ContentStudioLaunchParams) {
  if (params) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  else sessionStorage.removeItem(STORAGE_KEY);
  window.history.pushState(null, '', CONTENT_STUDIO_TAB_ROUTES[params?.tab || 'image']);
  window.dispatchEvent(new Event('popstate'));
}

export function contentStudioPathToTab(pathname: string): ContentStudioTab | null {
  const normalized = pathname.replace(/\/$/, '').toLowerCase();
  const entry = (Object.entries(CONTENT_STUDIO_TAB_ROUTES) as Array<[ContentStudioTab, string]>).find(([, path]) => path === normalized);
  return entry?.[0] || null;
}

export function readContentStudioLaunchParams(): ContentStudioLaunchParams | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ContentStudioLaunchParams>;
    if (!parsed.tab || !parsed.cardId || typeof parsed.prompt !== 'string') return null;
    return parsed as ContentStudioLaunchParams;
  } catch {
    return null;
  }
}

export function clearContentStudioLaunchParams() {
  sessionStorage.removeItem(STORAGE_KEY);
}
