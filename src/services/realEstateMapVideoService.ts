import { getAccessToken } from "./authService";

export type RealEstateMapCoordinate = {
  lat: number;
  lng: number;
};

export type RealEstateMapPoi = {
  id: string;
  name: string;
  category: string;
  location: RealEstateMapCoordinate;
  distanceMeters?: number;
  durationMinutes?: number;
  sourceRef?: string;
  confirmedByUser?: boolean;
};

export type RealEstateMapRoute = {
  id: string;
  fromId: string;
  toId: string;
  toName?: string;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  distanceMeters: number;
  durationSeconds: number;
  sourceRef?: string;
  confirmedByUser?: boolean;
};

export type RealEstateMapBranding = {
  logoUrl?: string;
  ctaText?: string;
  hotline?: string;
  brandColor?: string;
};

export type RealEstateMapVideoSpec = {
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p";
  durationSeconds: number;
};

export type RealEstateMapVfxTheme = "cyan-neon" | "gold-luxury" | "emerald" | "ruby";

export type RealEstateMapVfxConfig = {
  boundaryTheme?: RealEstateMapVfxTheme;
  boundaryGlowIntensity?: number;
  boundaryLedSpeed?: number;
  showRadiusPulse?: boolean;
  radiusMeters?: number;
  showAnimatedRoutes?: boolean;
  cameraTrajectory?: "cinematic-flyin-orbit" | "dynamic-tilt" | "smooth-glide";
  show3DBillboards?: boolean;
};

export type RealEstateMapDraft = {
  id?: string;
  name: string;
  address?: string;
  location: RealEstateMapCoordinate;
  boundary: number[][];
  pois?: RealEstateMapPoi[];
  routes?: RealEstateMapRoute[];
  branding?: RealEstateMapBranding;
  vfxConfig?: RealEstateMapVfxConfig;
  templatePreset?: string;
  videoSpec?: RealEstateMapVideoSpec;
  updatedAt?: string;
};

export type MapLocationResult = {
  address: string;
  name?: string;
  location: RealEstateMapCoordinate;
  sourceRef: string;
};

export type RealEstateMapSceneSnapshot = {
  snapshot: {
    name: string;
    address: string;
    location: RealEstateMapCoordinate;
    boundary?: { type: "Polygon"; coordinates: number[][][] };
    pois: RealEstateMapPoi[];
    routes: RealEstateMapRoute[];
    branding?: RealEstateMapBranding;
    vfxConfig?: RealEstateMapVfxConfig;
    scenes: Array<{ id: string; startSeconds: number; endSeconds: number }>;
    videoSpec: RealEstateMapVideoSpec;
  };
  composition: {
    html: string;
    css: string;
    voiceScript: string;
    scenePlan: Array<{
      id: string;
      order: number;
      purpose: string;
      onScreenText: string[];
      narration: string;
      startSeconds: number;
      endSeconds: number;
    }>;
  };
};

export type RealEstateMapRenderStatus =
  | "queued"
  | "preparing"
  | "rendering"
  | "muxing"
  | "uploading"
  | "verifying"
  | "completed"
  | "failed";

export type RealEstateMapRenderPublic = {
  id: string;
  status: RealEstateMapRenderStatus;
  progress: number;
  stageMessage: string;
  videoSpec: RealEstateMapVideoSpec;
  outputUrl?: string;
  outputDurationSeconds?: number;
  outputResolution?: string;
  audioStreamVerified: boolean;
  videoStreamVerified: boolean;
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type ApiEnvelope<T> = { status: string; data: T; message?: string };

function headers(json = false): HeadersInit {
  const token = getAccessToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function parse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>>;
  if (!response.ok || body.status !== "success") {
    throw new Error(body.message || fallback);
  }
  return body.data as T;
}

export const realEstateMapVideoService = {
  getDraft: () =>
    fetch("/api/v1/real-estate-map-video/draft", { headers: headers() }).then((res) =>
      parse<RealEstateMapDraft | null>(res, "Không thể tải bản nháp dự án.")
    ),

  saveDraft: (input: Partial<RealEstateMapDraft>) =>
    fetch("/api/v1/real-estate-map-video/draft", {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify(input),
    }).then((res) => parse<RealEstateMapDraft>(res, "Không thể lưu bản nháp dự án.")),

  geocode: (query: string) =>
    fetch("/api/v1/real-estate-map-video/geocode", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ query }),
    }).then((res) => parse<MapLocationResult[]>(res, "Không thể tìm kiếm địa chỉ.")),

  reverseGeocode: (location: RealEstateMapCoordinate) =>
    fetch("/api/v1/real-estate-map-video/reverse-geocode", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ location }),
    }).then((res) => parse<MapLocationResult>(res, "Không thể xác định địa chỉ từ tọa độ.")),

  searchPlaces: (input: { location: RealEstateMapCoordinate; radiusMeters?: number; limit?: number }) =>
    fetch("/api/v1/real-estate-map-video/places", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(input),
    }).then((res) => parse<RealEstateMapPoi[]>(res, "Không thể tìm tiện ích lân cận.")),

  getRoute: (input: { from: RealEstateMapCoordinate; to: RealEstateMapCoordinate; toName?: string }) =>
    fetch("/api/v1/real-estate-map-video/routes", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(input),
    }).then((res) => parse<RealEstateMapRoute>(res, "Không thể tính lộ trình tuyến đường.")),

  createSceneSnapshot: () =>
    fetch("/api/v1/real-estate-map-video/scene-snapshot", {
      method: "POST",
      headers: headers(true),
    }).then((res) => parse<RealEstateMapSceneSnapshot>(res, "Không thể tạo kịch bản cảnh bản đồ.")),

  createRender: (input: { idempotencyKey?: string; draftId?: string }) =>
    fetch("/api/v1/real-estate-map-video/renders", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(input),
    }).then((res) => parse<RealEstateMapRenderPublic>(res, "Không thể khởi tạo render video.")),

  getRender: (renderId: string) =>
    fetch(`/api/v1/real-estate-map-video/renders/${renderId}`, {
      headers: headers(),
    }).then((res) => parse<RealEstateMapRenderPublic>(res, "Không thể lấy tiến độ render.")),

  listRenders: (params?: { page?: number; pageSize?: number; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set("page", String(params.page));
    if (params?.pageSize) search.set("pageSize", String(params.pageSize));
    if (params?.status) search.set("status", params.status);
    const queryStr = search.toString() ? `?${search.toString()}` : "";
    return fetch(`/api/v1/real-estate-map-video/renders${queryStr}`, {
      headers: headers(),
    })
      .then((res) =>
        parse<{ items?: RealEstateMapRenderPublic[]; total?: number; page?: number; totalPages?: number } | RealEstateMapRenderPublic[]>(
          res,
          "Không thể lấy lịch sử render."
        )
      )
      .then((data) => {
        if (Array.isArray(data)) {
          return { items: data, total: data.length, page: 1, totalPages: 1 };
        }
        return {
          items: Array.isArray(data?.items) ? data.items : [],
          total: data?.total ?? 0,
          page: data?.page ?? 1,
          totalPages: data?.totalPages ?? 1,
        };
      });
  },

  retryRender: (renderId: string) =>
    fetch(`/api/v1/real-estate-map-video/renders/${renderId}/retry`, {
      method: "POST",
      headers: headers(true),
    }).then((res) => parse<RealEstateMapRenderPublic>(res, "Không thể thử lại render.")),
};
