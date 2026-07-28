export type VideoStudioTool =
  | "home"
  | "ai-video"
  | "human-video"
  | "motion"
  | "edit-video"
  | "long-to-short"
  | "voice"
  | "caption";

export const VIDEO_STUDIO_ROUTES: Record<VideoStudioTool, string> = {
  home: "/video-studio",
  "ai-video": "/video-studio/tao-video-ai",
  "human-video": "/video-studio/video-nguoi-dan",
  motion: "/video-studio/tao-chuyen-dong",
  "edit-video": "/video-studio/chinh-sua",
  "long-to-short": "/video-studio/video-ngan",
  voice: "/video-studio/giong-doc",
  caption: "/video-studio/phu-de",
};

export const LEGACY_VIDEO_STUDIO_PATH = "/xuong-noi-dung/tao-video";
export const LEGACY_VOICE_STUDIO_PATH = "/xuong-noi-dung/tao-giong-noi";

export interface VideoStudioLaunchParams {
  tool: Exclude<VideoStudioTool, "home">;
  prompt?: string;
  cardId?: string;
  image?: string;
  autoTrigger?: boolean;
  engineType?: string;
  usePersonalVoice?: boolean;
  title?: string;
  description?: string;
}

const STORAGE_KEY = "igen:video-studio:launch";

export function videoStudioPathToTool(pathname: string): VideoStudioTool | null {
  const normalized = pathname.replace(/\/$/, "").toLowerCase() || "/";
  if (normalized === LEGACY_VIDEO_STUDIO_PATH) return "home";
  if (normalized === LEGACY_VOICE_STUDIO_PATH) return "voice";
  const entry = (
    Object.entries(VIDEO_STUDIO_ROUTES) as Array<[VideoStudioTool, string]>
  ).find(([, path]) => path === normalized);
  return entry?.[0] || null;
}

export function isVideoStudioPath(pathname: string) {
  const normalized = pathname.replace(/\/$/, "").toLowerCase() || "/";
  return (
    normalized === LEGACY_VIDEO_STUDIO_PATH ||
    normalized === LEGACY_VOICE_STUDIO_PATH ||
    normalized === VIDEO_STUDIO_ROUTES.home ||
    normalized.startsWith(`${VIDEO_STUDIO_ROUTES.home}/`)
  );
}

export function openVideoStudio(params?: VideoStudioLaunchParams) {
  if (params) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  const nextPath = VIDEO_STUDIO_ROUTES[params?.tool || "home"];
  window.history.pushState(null, "", nextPath);
  window.dispatchEvent(new Event("popstate"));
}

export function readVideoStudioLaunchParams(): VideoStudioLaunchParams | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VideoStudioLaunchParams>;
    if (!parsed.tool || !VIDEO_STUDIO_ROUTES[parsed.tool]) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as VideoStudioLaunchParams;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearVideoStudioLaunchParams() {
  sessionStorage.removeItem(STORAGE_KEY);
}
