import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Film,
  Globe,
  GraduationCap,
  History,
  Hospital,
  Layers,
  Loader2,
  MapPin,
  MapPinned,
  Maximize2,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  PencilRuler,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  Trees,
  Video,
  X,
} from "lucide-react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MaplibreTerradrawControl } from "@watergis/maplibre-gl-terradraw";
import "@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css";
import { BRAND_LOGO_PATH, BRAND_NAME } from "../../config/brand";
import {
  type MapLocationResult,
  type RealEstateMapCoordinate,
  type RealEstateMapPoi,
  type RealEstateMapRenderPublic,
  type RealEstateMapRoute,
  type RealEstateMapSceneSnapshot,
  realEstateMapVideoService,
} from "../../services/realEstateMapVideoService";

const DEFAULT_LOCATION: RealEstateMapCoordinate = { lat: 10.7719, lng: 106.7212 };

export type MapTheme = "street" | "satellite" | "dark";

// Bản đồ tổng hợp cả 3 nguồn: Đường phố (Carto), Vệ tinh (Esri), Tối (Carto Dark)
const UNIFIED_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "carto-voyager": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 19,
    },
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
      maxzoom: 18,
    },
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "background-layer",
      type: "background",
      paint: { "background-color": "#f1f5f9" },
    },
    {
      id: "esri-satellite-layer",
      type: "raster",
      source: "esri-satellite",
      layout: { visibility: "none" },
      minzoom: 0,
      maxzoom: 24,
    },
    {
      id: "carto-dark-layer",
      type: "raster",
      source: "carto-dark",
      layout: { visibility: "none" },
      minzoom: 0,
      maxzoom: 24,
    },
    {
      id: "carto-voyager-layer",
      type: "raster",
      source: "carto-voyager",
      layout: { visibility: "visible" },
      minzoom: 0,
      maxzoom: 24,
    },
  ],
};

function createBoundary({ lat, lng }: RealEstateMapCoordinate) {
  const delta = 0.002;
  return [
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
    [lng - delta, lat - delta],
  ];
}

const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  school: GraduationCap,
  hospital: Hospital,
  shopping: ShoppingBag,
  park: Trees,
  transport: Navigation,
  other: Building2,
};

function RealEstateVideoHistoryCard({
  item,
  onRetry,
}: {
  item: RealEstateMapRenderPublic;
  onRetry: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleMouseEnter = () => {
    if (videoRef.current && item.status === "completed" && item.outputUrl) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const duration = item.outputDurationSeconds || item.videoSpec?.durationSeconds || 24;
  const isCompleted = item.status === "completed" && !!item.outputUrl;
  const isFailed = item.status === "failed";
  const isProcessing = !isCompleted && !isFailed;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
    >
      {/* Video Media Container dạng 16:9 với Hover Preview */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950">
        {isCompleted ? (
          <>
            <video
              ref={videoRef}
              src={item.outputUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />

            {/* Play Button Overlay (Ẩn đi khi đang hover preview) */}
            <div
              className={`absolute inset-0 flex items-center justify-center bg-slate-950/30 transition-opacity duration-300 ${
                isPlaying ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-indigo-600 shadow-lg backdrop-blur-xs transition-transform duration-300 group-hover:scale-110">
                <Play className="h-4 w-4 fill-indigo-600 ml-0.5" />
              </div>
            </div>

            {/* Badge Đang xem thử */}
            {isPlaying && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-slate-900/85 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Đang xem thử
              </div>
            )}
          </>
        ) : isProcessing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-4 text-center text-white space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <p className="text-[11px] font-semibold text-slate-300 line-clamp-1">
              {item.stageMessage || "Đang kết xuất video..."}
            </p>
            <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-indigo-300">{item.progress}%</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-3 text-center text-rose-300 space-y-1">
            <p className="text-[11px] font-bold">Lỗi tạo video</p>
            <p className="text-[10px] text-slate-400 line-clamp-2">{item.error || "Không xác định"}</p>
          </div>
        )}

        {/* Floating Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <span className="rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
            {duration}s · {item.videoSpec?.aspectRatio || "9:16"}
          </span>

          {isCompleted ? (
            <span className="rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-xs">
              Hoàn tất
            </span>
          ) : isProcessing ? (
            <span className="rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-xs flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Xử lý
            </span>
          ) : (
            <span className="rounded-md bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-xs">
              Lỗi
            </span>
          )}
        </div>
      </div>

      {/* Card Details & Actions */}
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <div>
            <p className="text-xs font-bold text-slate-900 line-clamp-1">
              Video Bất Động Sản · {duration}s
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {new Date(item.createdAt).toLocaleString("vi-VN")}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        {isCompleted && (
          <div className="flex gap-1.5 pt-0.5">
            <a
              href={item.outputUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <Play className="h-3.5 w-3.5" /> Xem toàn màn hình
            </a>
            <a
              href={item.outputUrl}
              download="video-bat-dong-san.mp4"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              title="Tải video MP4"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {isFailed && (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-700 border border-rose-200 hover:bg-rose-100 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại kết xuất
          </button>
        )}
      </div>
    </div>
  );
}

interface RealEstateMapVideoWorkspaceProps {
  onBack?: () => void;
}

export function RealEstateMapVideoWorkspace({ onBack }: RealEstateMapVideoWorkspaceProps = {}) {
  // Tabs: 1. Vị trí -> 2. Tiện ích -> 3. Kịch bản -> "history". Lịch sử tích hợp trực tiếp trong sidebar
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | "history">(1);
  const [mapTheme, setMapTheme] = useState<MapTheme>("street");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDrawingBoundary, setIsDrawingBoundary] = useState(false);

  const [name, setName] = useState("Khu đô thị Thủ Thiêm");
  const [address, setAddress] = useState("Phường An Khánh, TP. Thủ Đức, TP. Hồ Chí Minh");
  const [location, setLocation] = useState<RealEstateMapCoordinate>(DEFAULT_LOCATION);
  const [boundary, setBoundary] = useState<number[][]>(() => createBoundary(DEFAULT_LOCATION));
  const [pois, setPois] = useState<RealEstateMapPoi[]>([]);
  const [routes, setRoutes] = useState<RealEstateMapRoute[]>([]);
  const [hotline, setHotline] = useState("0909 123 456");
  const [ctaText, setCtaText] = useState("Đăng ký nhận bảng giá & ưu đãi ngay");

  // Search & Loading state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapLocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [snapshotData, setSnapshotData] = useState<RealEstateMapSceneSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);

  // Render & History
  const [isRendering, setIsRendering] = useState(false);
  const [activeRender, setActiveRender] = useState<RealEstateMapRenderPublic | null>(null);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderHistory, setRenderHistory] = useState<RealEstateMapRenderPublic[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  const drawControlRef = useRef<MaplibreTerradrawControl | null>(null);
  const isDrawingBoundaryRef = useRef(false);
  isDrawingBoundaryRef.current = isDrawingBoundary;

  // 1. Tải bản nháp đã lưu
  useEffect(() => {
    let isMounted = true;
    realEstateMapVideoService
      .getDraft()
      .then((draft) => {
        if (!isMounted || !draft) return;
        if (draft.name) setName(draft.name);
        if (draft.address) setAddress(draft.address);
        if (draft.location) setLocation(draft.location);
        if (draft.boundary && draft.boundary.length >= 3) setBoundary(draft.boundary);
        if (draft.pois && draft.pois.length > 0) setPois(draft.pois);
        if (draft.routes && draft.routes.length > 0) setRoutes(draft.routes);
        if (draft.branding?.hotline) setHotline(draft.branding.hotline);
        if (draft.branding?.ctaText) setCtaText(draft.branding.ctaText);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Tải lịch sử video an toàn
  const loadRenderHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await realEstateMapVideoService.listRenders({ page: 1, pageSize: 20 });
      setRenderHistory(res?.items || []);
    } catch {
      setRenderHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // 3. Theo dõi tiến độ render
  useEffect(() => {
    if (!activeRender || ["completed", "failed"].includes(activeRender.status)) return;
    const interval = setInterval(async () => {
      try {
        const updated = await realEstateMapVideoService.getRender(activeRender.id);
        setActiveRender(updated);
        if (["completed", "failed"].includes(updated.status)) {
          clearInterval(interval);
          setIsRendering(false);
          void loadRenderHistory();
        }
      } catch {
        clearInterval(interval);
        setIsRendering(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeRender, loadRenderHistory]);

  // Lưu bản nháp
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await realEstateMapVideoService.saveDraft({
        name,
        address,
        location,
        boundary,
        pois,
        routes,
        branding: { hotline, ctaText },
        videoSpec: { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 24 },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  // Tải kịch bản AI khi vào bước 3
  const handleLoadSnapshot = useCallback(async () => {
    setIsLoadingSnapshot(true);
    try {
      await realEstateMapVideoService.saveDraft({
        name,
        address,
        location,
        boundary,
        pois,
        routes,
        branding: { hotline, ctaText },
        videoSpec: { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 24 },
      });
      const data = await realEstateMapVideoService.createSceneSnapshot();
      setSnapshotData(data);
    } catch (err) {
      console.error("Không thể tạo snapshot kịch bản:", err);
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, [name, address, location, boundary, pois, routes, hotline, ctaText]);

  // Chuyển tab mượt mà trong Sidebar
  const handleTabChange = async (tab: 1 | 2 | 3 | "history") => {
    setActiveTab(tab);
    setIsSidebarOpen(true);
    if (tab === 3 && !snapshotData) {
      await handleLoadSnapshot();
    }
    if (tab === "history") {
      void loadRenderHistory();
    }
  };

  // Auto load snapshot if on step 3 without data
  useEffect(() => {
    if (activeTab === 3 && !snapshotData && !isLoadingSnapshot) {
      void handleLoadSnapshot();
    }
  }, [activeTab, snapshotData, isLoadingSnapshot, handleLoadSnapshot]);

  // Tìm kiếm địa chỉ
  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await realEstateMapVideoService.geocode(searchQuery);
      setSearchResults(results || []);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectLocation = (result: MapLocationResult) => {
    setLocation(result.location);
    if (result.name && !name) setName(result.name);
    if (result.address) setAddress(result.address);
    setBoundary(createBoundary(result.location));
    setSearchResults([]);
    setSearchQuery("");
  };

  // Tự động tìm tiện ích
  const handleSearchPois = async () => {
    setIsLoadingPois(true);
    try {
      const foundPois = await realEstateMapVideoService.searchPlaces({
        location,
        radiusMeters: 5000,
        limit: 5,
      });
      setPois(foundPois || []);
    } finally {
      setIsLoadingPois(false);
    }
  };

  // Tính tuyến đường đến tiện ích
  const handleSelectRouteToPoi = async (poi: RealEstateMapPoi) => {
    try {
      const route = await realEstateMapVideoService.getRoute({
        from: location,
        to: poi.location,
        toName: poi.name,
      });
      if (route) setRoutes([route]);
    } catch (error) {
      console.error("Không thể lấy route:", error);
    }
  };

  // Bắt đầu Render MP4
  const handleStartRender = async () => {
    await handleSaveDraft();
    setIsRendering(true);
    setShowRenderModal(true);
    try {
      const render = await realEstateMapVideoService.createRender({
        idempotencyKey: `remv_${Date.now()}`,
      });
      setActiveRender(render);
    } catch (error) {
      setIsRendering(false);
      console.error("Lỗi khởi tạo render:", error);
    }
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!workspaceContainerRef.current) return;
    if (!document.fullscreenElement) {
      void workspaceContainerRef.current.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  // Khởi tạo Map chỉ 1 lần duy nhất khi component mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: UNIFIED_MAP_STYLE,
      center: [DEFAULT_LOCATION.lng, DEFAULT_LOCATION.lat],
      zoom: 14,
      minZoom: 3,
      maxZoom: 22,
      pitch: 30,
    });

    // Đặt điều khiển phóng to/thu nhỏ ở góc dưới bên phải
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, showZoom: true }),
      "bottom-right"
    );

    const drawControl = new MaplibreTerradrawControl({
      modes: ["polygon", "select", "delete-selection", "render"],
      open: false,
    });
    map.addControl(drawControl, "top-left");
    drawControlRef.current = drawControl;

    const draw = drawControl.getTerraDrawInstance();
    draw?.on("change", () => {
      const feature = draw.getSnapshot().find((item) => item.geometry.type === "Polygon");
      if (feature?.geometry.type === "Polygon") {
        const ring = (feature.geometry.coordinates[0] || []) as unknown as number[][];
        if (ring.length >= 3) {
          setBoundary(ring);
          setIsDrawingBoundary(false);
        }
      }
    });

    map.on("click", (event) => {
      // Chỉ đổi tâm khi không ở chế độ vẽ ranh đất
      if (!isDrawingBoundaryRef.current) {
        setLocation({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      }
    });

    map.on("load", () => {
      // Source & Layer cho Ranh đất
      if (!map.getSource("project-boundary")) {
        map.addSource("project-boundary", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [createBoundary(DEFAULT_LOCATION)] },
          },
        });

        map.addLayer({
          id: "project-boundary-fill",
          type: "fill",
          source: "project-boundary",
          paint: { "fill-color": "#4f46e5", "fill-opacity": 0.35 },
        });

        map.addLayer({
          id: "project-boundary-line",
          type: "line",
          source: "project-boundary",
          paint: { "line-color": "#4338ca", "line-width": 3.5 },
        });
      }

      // Source & Layer cho Tuyến đường
      if (!map.getSource("route-line")) {
        map.addSource("route-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });

        map.addLayer({
          id: "route-line-layer",
          type: "line",
          source: "route-line",
          paint: {
            "line-color": "#f59e0b",
            "line-width": 4.5,
            "line-dasharray": [2, 1],
          },
        });
      }
    });

    // Custom Project Marker
    const markerEl = document.createElement("div");
    markerEl.className =
      "flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl ring-4 ring-indigo-200 animate-bounce";
    markerEl.innerHTML = `<span class="text-base">📍</span>`;

    markerRef.current = new maplibregl.Marker({ element: markerEl })
      .setLngLat([DEFAULT_LOCATION.lng, DEFAULT_LOCATION.lat])
      .addTo(map);

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
      drawControlRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Thay đổi Theme mượt mà bằng cách bật/tắt layer visibility
  const handleChangeMapTheme = (theme: MapTheme) => {
    setMapTheme(theme);
    const map = mapRef.current;
    if (!map) return;

    try {
      if (map.getLayer("carto-voyager-layer")) {
        map.setLayoutProperty(
          "carto-voyager-layer",
          "visibility",
          theme === "street" ? "visible" : "none"
        );
      }
      if (map.getLayer("esri-satellite-layer")) {
        map.setLayoutProperty(
          "esri-satellite-layer",
          "visibility",
          theme === "satellite" ? "visible" : "none"
        );
      }
      if (map.getLayer("carto-dark-layer")) {
        map.setLayoutProperty(
          "carto-dark-layer",
          "visibility",
          theme === "dark" ? "visible" : "none"
        );
      }
    } catch (err) {
      console.warn("Lỗi chuyển đổi layer bản đồ:", err);
    }
  };

  // Cập nhật marker & camera
  useEffect(() => {
    markerRef.current?.setLngLat([location.lng, location.lat]);
    mapRef.current?.easeTo({ center: [location.lng, location.lat], duration: 400 });
  }, [location]);

  // Cập nhật ranh đất
  useEffect(() => {
    const source = mapRef.current?.getSource("project-boundary") as maplibregl.GeoJSONSource | undefined;
    if (source && boundary.length >= 3) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [boundary] },
      });
    }
  }, [boundary]);

  // Cập nhật POIs trên map
  useEffect(() => {
    if (!mapRef.current) return;
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    (pois || []).forEach((poi) => {
      const el = document.createElement("div");
      el.className =
        "flex items-center gap-1 rounded-full bg-slate-900/90 border border-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-300 shadow-md";
      el.innerHTML = `<span>📍</span><span>${poi.name}</span>`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.location.lng, poi.location.lat])
        .addTo(mapRef.current!);
      poiMarkersRef.current.push(marker);
    });
  }, [pois]);

  // Cập nhật route trên map
  useEffect(() => {
    const source = mapRef.current?.getSource("route-line") as maplibregl.GeoJSONSource | undefined;
    if (source && routes && routes.length > 0) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routes[0].geometry.coordinates,
        },
      });
    }
  }, [routes]);

  return (
    <div
      ref={workspaceContainerRef}
      data-testid="real-estate-map-video-workspace"
      className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden bg-white text-slate-800 font-sans"
    >
      {/* Ẩn các nút default control của Terradraw & định vị lại zoom control */}
      <style>{`
        .maplibregl-ctrl-top-left {
          display: none !important;
        }
        .maplibregl-ctrl-bottom-right {
          margin-bottom: 56px !important;
          margin-right: 16px !important;
        }
      `}</style>

      {/* 1. Left Nav Rail: Đồng bộ màu nền trắng và biểu tượng thương hiệu của Web */}
      <nav className="flex w-[76px] shrink-0 flex-col items-center justify-between border-r border-slate-200 bg-white py-3 z-30">
        <div className="flex flex-col items-center space-y-2.5 w-full">
          <button
            type="button"
            onClick={onBack || (() => window.history.back())}
            className="mb-2 flex items-center justify-center transition-transform hover:scale-105"
            title="Quay lại Video Studio"
          >
            <div className="relative">
              <img
                src={BRAND_LOGO_PATH}
                alt={BRAND_NAME}
                className="h-11 w-11 rounded-2xl border border-blue-100 bg-white object-cover shadow-md shadow-blue-500/10"
              />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white">
                <ArrowLeft className="h-2.5 w-2.5" />
              </span>
            </div>
          </button>

          {/* Step 1 Button */}
          <button
            type="button"
            onClick={() => void handleTabChange(1)}
            title="Bước 1: Vị trí & Dự án"
            className={`mx-2 flex min-h-[64px] w-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition ${
              activeTab === 1 && isSidebarOpen
                ? "bg-indigo-50 text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <MapPinned className="h-5 w-5" />
            <span className="text-[10px]">Vị trí</span>
          </button>

          {/* Step 2 Button */}
          <button
            type="button"
            onClick={() => void handleTabChange(2)}
            title="Bước 2: Tiện ích xung quanh"
            className={`mx-2 flex min-h-[64px] w-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition ${
              activeTab === 2 && isSidebarOpen
                ? "bg-indigo-50 text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Hospital className="h-5 w-5" />
            <span className="text-[10px]">Tiện ích</span>
          </button>

          {/* Step 3 Button */}
          <button
            type="button"
            onClick={() => void handleTabChange(3)}
            title="Bước 3: Kịch bản & Xuất video"
            className={`mx-2 flex min-h-[64px] w-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition ${
              activeTab === 3 && isSidebarOpen
                ? "bg-indigo-50 text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Film className="h-5 w-5" />
            <span className="text-[10px]">Kịch bản</span>
          </button>

          {/* Lịch sử Video (Mở ngay trong Sidebar) */}
          <button
            type="button"
            onClick={() => void handleTabChange("history")}
            title="Lịch sử video đã tạo"
            className={`mx-2 flex min-h-[64px] w-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold transition ${
              activeTab === "history" && isSidebarOpen
                ? "bg-indigo-50 text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <History className="h-5 w-5" />
            <span className="text-[10px]">Lịch sử</span>
          </button>
        </div>

        <div className="flex flex-col items-center w-full px-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            title="Lưu bản nháp"
            className="flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Save className="h-4 w-4" />}
            <span className="text-[9px] font-bold">{saved ? "Đã lưu" : "Lưu"}</span>
          </button>
        </div>
      </nav>

      {/* 2. Left Form Sidebar: Tinh gọn, hiện đại, hỗ trợ cả 3 bước tạo video lẫn xem Lịch sử trực tiếp */}
      <aside
        className={`relative flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out z-20 overflow-hidden ${
          isSidebarOpen ? "w-[380px] lg:w-[420px] opacity-100" : "w-0 opacity-0 border-r-0"
        }`}
      >
        {/* Header Sidebar: Tùy theo tab đang mở (Stepper hoặc Lịch sử) */}
        <div className="border-b border-slate-100 p-4 space-y-3 shrink-0">
          {activeTab === "history" ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <History className="h-4 w-4" />
                </span>
                <div>
                  <h1 className="text-sm font-bold text-slate-900">Lịch sử video đã tạo</h1>
                  <p className="text-[11px] text-slate-500">
                    {renderHistory.length} video trong danh sách
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void loadRenderHistory()}
                  disabled={isLoadingHistory}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  title="Làm mới danh sách"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingHistory ? "animate-spin text-indigo-600" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  title="Thu gọn bảng điều khiển"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h1 className="text-sm font-bold text-slate-900 truncate">
                    Tạo Video Bất Động Sản
                  </h1>
                  <p className="text-[11px] text-slate-500 truncate">
                    Bản đồ vệ tinh & giọng đọc AI tiếng Việt
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-extrabold text-indigo-700">
                    {activeTab}/3
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    title="Thu gọn bảng điều khiển"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Stepper Tabs: Clean Pill Design */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100/90 p-1">
                {[
                  { step: 1, label: "1. Vị trí" },
                  { step: 2, label: "2. Tiện ích" },
                  { step: 3, label: "3. Kịch bản" },
                ].map((s) => (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => void handleTabChange(s.step as 1 | 2 | 3)}
                    className={`rounded-lg py-1.5 text-center text-xs font-bold transition ${
                      activeTab === s.step
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Body Sidebar: Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB LỊCH SỬ VIDEO */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void handleTabChange(1)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-50 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-xs"
              >
                <Plus className="h-4 w-4" /> Tạo dự án video mới
              </button>

              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  <span className="text-xs">Đang tải lịch sử video...</span>
                </div>
              ) : !renderHistory || renderHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 space-y-2">
                  <p>Chưa có video nào được xuất bản.</p>
                  <p className="text-[11px] text-slate-400">
                    Hãy hoàn tất 3 bước để bắt đầu tạo video BĐS đầu tiên!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {renderHistory.map((item) => (
                    <RealEstateVideoHistoryCard
                      key={item.id}
                      item={item}
                      onRetry={(id) => {
                        realEstateMapVideoService
                          .retryRender(id)
                          .then(() => void loadRenderHistory())
                          .catch(() => {});
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BƯỚC 1: VỊ TRÍ & DỰ ÁN */}
          {activeTab === 1 && (
            <div className="space-y-3.5">
              <div>
                <h2 className="text-xs font-bold text-slate-900">
                  Bước 1: Chọn vị trí & Nhập thông tin
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tìm kiếm hoặc click trực tiếp lên bản đồ bên phải
                </p>
              </div>

              {/* Tìm địa chỉ */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">
                  Tìm nhanh dự án hoặc địa chỉ:
                </label>
                <div className="mt-1 flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchAddress()}
                      placeholder="Gõ tên dự án, đường, quận..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-8 pr-3 text-xs outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSearchAddress}
                    disabled={isSearching}
                    className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Tìm"}
                  </button>
                </div>

                {searchResults && searchResults.length > 0 && (
                  <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xl max-h-44 overflow-y-auto">
                    {searchResults.map((res, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectLocation(res)}
                        className="flex w-full flex-col p-2.5 text-left text-xs hover:bg-indigo-50/70 transition"
                      >
                        <span className="font-bold text-slate-900">{res.name || res.address}</span>
                        <span className="text-slate-500 text-[10px] mt-0.5">{res.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tên & Địa chỉ */}
              <div className="space-y-2.5 pt-0.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Tên dự án hiển thị trong video:
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: Khu đô thị SwanBay"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-bold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Địa chỉ chi tiết:
                  </label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ví dụ: Phường An Khánh, TP. Thủ Đức"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Gợi ý tương tác: Clean Card */}
              <div className="rounded-2xl bg-indigo-50/60 p-3.5 text-xs text-indigo-950 border border-indigo-100 space-y-1">
                <p className="font-bold text-indigo-900 flex items-center gap-1.5">
                  <span>💡</span> Thao tác trên bản đồ:
                </p>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  • Click bất kỳ đâu trên bản đồ để đổi vị trí tâm dự án.<br />
                  • Bấm <strong>&quot;Vẽ lại ranh đất&quot;</strong> để tùy chỉnh ranh đất.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleTabChange(2)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition"
              >
                Tiếp tục: Chọn tiện ích <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* BƯỚC 2: TIỆN ÍCH & LIÊN HỆ */}
          {activeTab === 2 && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-slate-900">
                    Bước 2: Tiện ích xung quanh
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Các điểm nổi bật gần dự án
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSearchPois}
                  disabled={isLoadingPois}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs transition"
                >
                  {isLoadingPois ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Quét tự động
                </button>
              </div>

              {/* Danh sách tiện ích */}
              {!pois || pois.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                  Chưa có tiện ích nào. Bấm nút <strong>&quot;Quét tự động&quot;</strong> để hệ thống tìm trường học, bệnh viện, TTTM lân cận dự án.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {pois.map((poi) => {
                    const Icon = CATEGORY_ICONS[poi.category] || Building2;
                    return (
                      <div
                        key={poi.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs hover:bg-white transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-700 shadow-xs border border-slate-100">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900">{poi.name}</p>
                            <p className="text-[10px] text-slate-500">
                              {poi.distanceMeters ? `~${poi.distanceMeters}m` : ""}{" "}
                              {poi.durationMinutes ? `· ${poi.durationMinutes}p` : ""}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectRouteToPoi(poi)}
                          className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-slate-200 hover:bg-indigo-50 shadow-xs transition"
                        >
                          Lộ trình
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Thông tin liên hệ */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Số điện thoại Hotline:
                  </label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={hotline}
                      onChange={(e) => setHotline(e.target.value)}
                      placeholder="0909..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-8 pr-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Lời kêu gọi hành động (CTA):
                  </label>
                  <input
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="Đăng ký ngay..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleTabChange(1)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleTabChange(3)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition"
                >
                  Tiếp tục: Kịch bản <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* BƯỚC 3: KỊCH BẢN & XUẤT VIDEO */}
          {activeTab === 3 && (
            <div className="space-y-3.5">
              <div>
                <h2 className="text-xs font-bold text-slate-900">
                  Bước 3: Kịch bản & Xuất Video
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  4 cảnh quay và thuyết minh tiếng Việt chuẩn
                </p>
              </div>

              {isLoadingSnapshot ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
                  <p className="font-semibold text-slate-700">AI đang phân tích và dựng kịch bản video...</p>
                </div>
              ) : snapshotData?.composition ? (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {(snapshotData.composition.scenePlan || []).map((scene, idx) => (
                      <div
                        key={scene.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-slate-500 font-bold">
                          <span>Cảnh 0{idx + 1}</span>
                          <span>{scene.startSeconds}s - {scene.endSeconds}s</span>
                        </div>
                        <p className="mt-1 font-semibold text-indigo-900 text-[11px]">
                          📺 {(scene.onScreenText || []).join(" · ")}
                        </p>
                        <p className="mt-0.5 text-slate-600 italic text-[11px] leading-relaxed">
                          🎙️ &quot;{scene.narration}&quot;
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-slate-900 p-3 text-white">
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                      Giọng đọc AI (TTS Thuyết minh)
                    </p>
                    <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                      {snapshotData.composition.voiceScript || ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 space-y-2">
                  <p>Chưa có kịch bản hoặc đang tải lại.</p>
                  <button
                    type="button"
                    onClick={() => void handleLoadSnapshot()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Tạo lại kịch bản
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleTabChange(2)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleStartRender}
                  disabled={isRendering || isLoadingSnapshot}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 hover:brightness-110 disabled:opacity-50 transition"
                >
                  {isRendering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  Bắt đầu xuất video MP4 (24s)
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 3. Main Stage: Bản đồ chiếm 100% diện tích còn lại của màn hình */}
      <main className="relative flex-1 h-full overflow-hidden bg-slate-100">
        {/* Map Canvas */}
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

        {/* Floating Drawing Guide Banner */}
        {isDrawingBoundary && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-2xl bg-slate-900/95 px-4 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md border border-indigo-500/40 animate-pulse">
            <span>✏️ Đang vẽ ranh đất: Click các góc trên bản đồ, click đúp để hoàn tất.</span>
          </div>
        )}

        {/* Floating Top Toolbar */}
        <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Nút Hiện Bảng điều khiển khi đang ẩn */}
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-md border border-slate-200 hover:bg-white hover:text-indigo-600 transition"
                title="Mở bảng điều khiển"
              >
                <PanelLeftOpen className="h-4 w-4 text-indigo-600" />
              </button>
            )}

            {/* Map Theme Switcher */}
            <div className="flex items-center gap-1 rounded-2xl bg-white/95 p-1 shadow-lg backdrop-blur-md border border-slate-200">
              <button
                type="button"
                onClick={() => handleChangeMapTheme("street")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  mapTheme === "street"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Navigation className="h-3.5 w-3.5" />
                Đường phố
              </button>
              <button
                type="button"
                onClick={() => handleChangeMapTheme("satellite")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  mapTheme === "satellite"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                Ảnh vệ tinh
              </button>
              <button
                type="button"
                onClick={() => handleChangeMapTheme("dark")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  mapTheme === "dark"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Tối
              </button>
            </div>
          </div>

          {/* Map Quick Actions */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                const instance = drawControlRef.current?.getTerraDrawInstance();
                if (!instance) return;
                if (isDrawingBoundary) {
                  instance.setMode("render");
                  setIsDrawingBoundary(false);
                } else {
                  instance.setMode("polygon");
                  setIsDrawingBoundary(true);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold text-white shadow-md transition ${
                isDrawingBoundary
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 ring-2 ring-white"
                  : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20"
              }`}
            >
              {isDrawingBoundary ? <Check className="h-4 w-4" /> : <PencilRuler className="h-4 w-4" />}
              {isDrawingBoundary ? "Hoàn tất vẽ" : "Vẽ lại ranh đất"}
            </button>
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title="Toàn màn hình trình duyệt"
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/95 text-slate-700 shadow-md backdrop-blur-md border border-slate-200 hover:bg-slate-50 transition"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleTabChange("history")}
              className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition shadow-md backdrop-blur-md border ${
                activeTab === "history" && isSidebarOpen
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <History className="h-4 w-4 text-indigo-600" />
              Lịch sử
            </button>
            <button
              type="button"
              onClick={handleStartRender}
              disabled={isRendering}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/25 hover:brightness-110 disabled:opacity-50 transition"
            >
              {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Xuất MP4
            </button>
          </div>
        </div>

        {/* Floating Bottom Status Bar */}
        <div className="absolute right-4 bottom-4 z-10 flex items-center gap-3 rounded-2xl bg-slate-900/85 backdrop-blur-md px-3.5 py-2 text-xs text-white shadow-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              📍 Tâm: <strong>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</strong>
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <span>
            📐 Ranh: <strong>{(boundary || []).length} điểm</strong>
          </span>
        </div>
      </main>

      {/* Render Modal */}
      {showRenderModal && activeRender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <Film className="h-5 w-5 text-indigo-400" />
                <h3 className="font-bold text-sm">Đang tạo Video Bất Động Sản</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRenderModal(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {activeRender.status === "completed" && activeRender.outputUrl ? (
                <div className="space-y-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-bold">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>Video đã tạo xong!</span>
                  </div>

                  <div className="aspect-[9/16] max-h-[360px] w-full mx-auto overflow-hidden rounded-2xl border border-slate-700 bg-black shadow-2xl">
                    <video
                      src={activeRender.outputUrl}
                      controls
                      autoPlay
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={activeRender.outputUrl}
                      download="video-bat-dong-san.mp4"
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-md hover:bg-indigo-500 text-xs transition"
                    >
                      <Download className="h-4 w-4" /> Tải video về máy
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowRenderModal(false)}
                      className="rounded-xl bg-slate-800 px-4 py-3 font-semibold text-slate-200 hover:bg-slate-700 text-xs"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : activeRender.status === "failed" ? (
                <div className="space-y-3 text-center">
                  <p className="text-xs text-rose-400 font-semibold">
                    {activeRender.error || "Quá trình tạo video gặp lỗi."}
                  </p>
                  <button
                    type="button"
                    onClick={() => realEstateMapVideoService.retryRender(activeRender.id)}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Thử lại
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{activeRender.stageMessage}</span>
                    <span className="font-bold text-indigo-400">{activeRender.progress}%</span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${activeRender.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                    <span>Hệ thống đang tự động xử lý. Bạn có thể đóng cửa sổ này.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
