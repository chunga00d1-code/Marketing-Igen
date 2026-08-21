import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  History,
  Layers,
  MapPin,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Receipt,
  Route,
  Save,
  Settings,
} from "lucide-react";
import { PricingModal } from "../pricing/PricingModal";
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
import type {
  AspectRatioType,
  BoundaryStrokeType,
  BoundaryTheme,
  DrawMode,
  GisMapLayer,
  GisSceneKeyframe,
  GisToolTab,
  MapTheme,
} from "./real-estate-map/map-video.types";
import { DEFAULT_LOCATION } from "./real-estate-map/map-video.types";
import {
  calculatePolygonAreaMeters,
  calculatePolygonPerimeterMeters,
  createBoundary,
  createCirclePolygon,
  createRectangleBoundary,
  UNIFIED_MAP_STYLE,
} from "./real-estate-map/map-video.utils";
import { RealEstateVideoHistoryCard } from "./real-estate-map/RealEstateVideoHistoryCard";
import { RealEstateMapStep1Location } from "./real-estate-map/RealEstateMapStep1Location";
import { RealEstateMapStep2Pois } from "./real-estate-map/RealEstateMapStep2Pois";
import { RealEstateMapStep3Script } from "./real-estate-map/RealEstateMapStep3Script";
import { RealEstateMapRouteABPanel } from "./real-estate-map/RealEstateMapRouteABPanel";
import { RealEstateMapLayerManager } from "./real-estate-map/RealEstateMapLayerManager";
import { RealEstateMapTimeline } from "./real-estate-map/RealEstateMapTimeline";
import {
  RealEstateMapFloatingPolygonBar,
  RealEstateMapFloatingTopToolbar,
  RealEstateMapSafeAreaOverlay,
  RealEstateMapStatusBadge,
} from "./real-estate-map/RealEstateMapFloatingControls";
import { RealEstateMapRenderModal } from "./real-estate-map/RealEstateMapRenderModal";

interface RealEstateMapVideoWorkspaceProps {
  onBack?: () => void;
}

export function RealEstateMapVideoWorkspace({ onBack }: RealEstateMapVideoWorkspaceProps = {}) {
  // Sidebar & Layout Controls
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [activeGisTool, setActiveGisTool] = useState<GisToolTab>("polygon");
  const [mapTheme, setMapTheme] = useState<MapTheme>("street");
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>("9:16");
  const [showPlaceLabels, setShowPlaceLabels] = useState(true);
  const [isDrawingBoundary, setIsDrawingBoundary] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Core Project State
  const [name, setName] = useState("Khu đô thị Starlake Tây Hồ Tây");
  const [address, setAddress] = useState("Phường Xuân La, Quận Tây Hồ, TP. Hà Nội");
  const [location, setLocation] = useState<RealEstateMapCoordinate>(DEFAULT_LOCATION);
  const [boundary, setBoundary] = useState<number[][]>(() => createBoundary(DEFAULT_LOCATION));
  const [pois, setPois] = useState<RealEstateMapPoi[]>([]);
  const [routes, setRoutes] = useState<RealEstateMapRoute[]>([]);
  const [hotline, setHotline] = useState("0909 123 456");
  const [ctaText, setCtaText] = useState("Đăng ký nhận bảng giá & ưu đãi ngay");

  // Multi-layer GIS State
  const [layers, setLayers] = useState<GisMapLayer[]>([
    {
      id: "boundary_main",
      name: "Vùng quy hoạch #7ccc",
      type: "polygon",
      visible: true,
      color: "#00f2fe",
      strokeWidth: 4,
      opacity: 0.35,
      coordinates: createBoundary(DEFAULT_LOCATION),
      metadata: { areaM2: calculatePolygonAreaMeters(createBoundary(DEFAULT_LOCATION)) },
    },
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>("boundary_main");

  // Timeline Keyframe Scenes State (Rỗng ban đầu, chỉ thêm khi người dùng bấm Ghim Cảnh Hiện Tại)
  const [scenes, setScenes] = useState<GisSceneKeyframe[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [isPreviewingScenes, setIsPreviewingScenes] = useState(false);

  // VFX 3D Studio Customization
  const [boundaryTheme, setBoundaryTheme] = useState<BoundaryTheme>("cyan-neon");
  const [boundaryOpacity, setBoundaryOpacity] = useState(0.35);
  const [boundaryStrokeWidth, setBoundaryStrokeWidth] = useState(3.5);
  const [boundaryStrokeType, setBoundaryStrokeType] = useState<BoundaryStrokeType>("glow");
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [showRadiusPulse, setShowRadiusPulse] = useState(true);
  const [showAnimatedRoutes, setShowAnimatedRoutes] = useState(true);
  const [show3DBillboards, setShow3DBillboards] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [isPlaying3DCamera, setIsPlaying3DCamera] = useState(false);

  // Live Calculations
  const polygonArea = calculatePolygonAreaMeters(boundary);
  const polygonPerimeter = calculatePolygonPerimeterMeters(boundary);

  // Search & Loading State
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
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | "history">(1);

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
        if (draft.boundary && draft.boundary.length >= 3) {
          setBoundary(draft.boundary);
          setLayers((prev) => [
            {
              id: "boundary_main",
              name: draft.name ? `Ranh ${draft.name}` : "Vùng quy hoạch #7ccc",
              type: "polygon",
              visible: true,
              color: "#00f2fe",
              strokeWidth: 4,
              opacity: 0.35,
              coordinates: draft.boundary,
              metadata: { areaM2: calculatePolygonAreaMeters(draft.boundary) },
            },
            ...prev.filter((l) => l.id !== "boundary_main"),
          ]);
        }
        if (draft.pois && draft.pois.length > 0) setPois(draft.pois);
        if (draft.routes && draft.routes.length > 0) setRoutes(draft.routes);
        if (draft.branding?.hotline) setHotline(draft.branding.hotline);
        if (draft.branding?.ctaText) setCtaText(draft.branding.ctaText);
        if (draft.vfxConfig?.boundaryTheme) setBoundaryTheme(draft.vfxConfig.boundaryTheme);
        if (draft.vfxConfig?.showRadiusPulse !== undefined) setShowRadiusPulse(draft.vfxConfig.showRadiusPulse);
        if (draft.vfxConfig?.showAnimatedRoutes !== undefined) setShowAnimatedRoutes(draft.vfxConfig.showAnimatedRoutes);
        if (draft.vfxConfig?.show3DBillboards !== undefined) setShow3DBillboards(draft.vfxConfig.show3DBillboards);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Tải lịch sử video
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

  // Đổi Map Theme
  const handleChangeMapTheme = (theme: MapTheme) => {
    setMapTheme(theme);
    const map = mapRef.current;
    if (!map) return;

    try {
      map.setLayoutProperty("carto-voyager-layer", "visibility", theme === "street" ? "visible" : "none");
      map.setLayoutProperty("esri-satellite-layer", "visibility", theme === "satellite" ? "visible" : "none");
      map.setLayoutProperty("carto-dark-layer", "visibility", theme === "dark" ? "visible" : "none");
    } catch {
      // ignore
    }
  };

  // Tải Kịch bản & Dựng cảnh Video
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
        vfxConfig: {
          boundaryTheme,
          showRadiusPulse,
          showAnimatedRoutes,
          show3DBillboards,
        },
      });
      const snap = await realEstateMapVideoService.createSceneSnapshot();
      setSnapshotData(snap);
    } catch (error) {
      console.error("Lỗi dựng kịch bản:", error);
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, [name, address, location, boundary, pois, routes, hotline, ctaText, boundaryTheme, showRadiusPulse, showAnimatedRoutes, show3DBillboards]);

  // Chuyển tab
  const handleTabChange = async (tab: 1 | 2 | 3 | "history") => {
    setActiveTab(tab);
    if (!isLeftSidebarOpen) {
      setIsLeftSidebarOpen(true);
    }
    if (tab === 1) {
      setActiveGisTool("polygon");
    } else if (tab === 2) {
      setActiveGisTool("marker");
    } else if (tab === 3) {
      setActiveGisTool("settings");
      if (!snapshotData) {
        await handleLoadSnapshot();
      }
    } else if (tab === "history") {
      setActiveGisTool("history");
      void loadRenderHistory();
    }
  };

  // Tìm kiếm địa chỉ
  const handleSearchAddress = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const results = await realEstateMapVideoService.geocode(q);
      setSearchResults(results || []);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectLocation = (result: MapLocationResult) => {
    setLocation(result.location);
    if (result.name) setName(result.name);
    if (result.address) setAddress(result.address);
    const newBoundary = createBoundary(result.location);
    setBoundary(newBoundary);
    setLayers((prev) => [
      {
        id: "boundary_main",
        name: result.name ? `Ranh ${result.name}` : "Vùng quy hoạch #7ccc",
        type: "polygon",
        visible: true,
        color: "#00f2fe",
        strokeWidth: 4,
        opacity: 0.35,
        coordinates: newBoundary,
        metadata: { areaM2: calculatePolygonAreaMeters(newBoundary) },
      },
      ...prev.filter((l) => l.id !== "boundary_main"),
    ]);
    setPois([]);
    setRoutes([]);
    setSnapshotData(null);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleCreateNewProject = () => {
    setName("Khu đô thị Starlake Tây Hồ Tây");
    setAddress("Phường Xuân La, Quận Tây Hồ, TP. Hà Nội");
    setLocation(DEFAULT_LOCATION);
    const newBoundary = createBoundary(DEFAULT_LOCATION);
    setBoundary(newBoundary);
    setLayers([
      {
        id: "boundary_main",
        name: "Vùng quy hoạch #7ccc",
        type: "polygon",
        visible: true,
        color: "#00f2fe",
        strokeWidth: 4,
        opacity: 0.35,
        coordinates: newBoundary,
        metadata: { areaM2: calculatePolygonAreaMeters(newBoundary) },
      },
    ]);
    setPois([]);
    setRoutes([]);
    setScenes([]);
    setSelectedSceneId(null);
    setSnapshotData(null);
    void handleTabChange(1);
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
      setRoutes([]);
      setSnapshotData(null);
    } finally {
      setIsLoadingPois(false);
    }
  };

  // Lấy lộ trình tuyến đường
  const handleSelectRouteToPoi = useCallback(async (poi: RealEstateMapPoi) => {
    try {
      const route = await realEstateMapVideoService.getRoute({
        from: location,
        to: poi.location,
        toName: poi.name,
      });
      if (route) {
        setRoutes([route]);
        setSnapshotData(null);
      }
    } catch (error) {
      console.error("Lỗi lấy lộ trình:", error);
    }
  }, [location]);

  // Thêm Layer Lộ Trình A-B từ panel
  const handleAddRouteLayer = (newLayer: GisMapLayer) => {
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  // Các thao tác trên Layer Manager
  const handleToggleLayerVisibility = (layerId: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  };

  const handleChangeLayerColor = (layerId: string, colorHex: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, color: colorHex } : l))
    );
  };

  const handleDuplicateLayer = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    const duplicated: GisMapLayer = {
      ...layer,
      id: `layer_${Date.now()}`,
      name: `${layer.name} (Bản sao)`,
    };
    setLayers((prev) => [...prev, duplicated]);
    setSelectedLayerId(duplicated.id);
  };

  const handleDeleteLayer = (layerId: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== layerId));
    if (selectedLayerId === layerId) {
      setSelectedLayerId(layers[0]?.id || null);
    }
  };

  const handleMoveLayer = (layerId: string, direction: "up" | "down") => {
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;
    const newLayers = [...layers];
    if (direction === "up" && idx > 0) {
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx - 1];
      newLayers[idx - 1] = temp;
    } else if (direction === "down" && idx < newLayers.length - 1) {
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx + 1];
      newLayers[idx + 1] = temp;
    }
    setLayers(newLayers);
  };

  const handleRenameLayer = (layerId: string, newName: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, name: newName } : l))
    );
  };

  // Các thao tác trên Timeline Phân Cảnh
  const handlePinCurrentCameraScene = () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    const newScene: GisSceneKeyframe = {
      id: `scene_${Date.now()}`,
      order: scenes.length + 1,
      durationSeconds: 4,
      camera: {
        center: { lat: center.lat, lng: center.lng },
        zoom,
        pitch,
        bearing,
      },
      activeLayerIds: layers.filter((l) => l.visible).map((l) => l.id),
      caption: `Cảnh ${scenes.length + 1}`,
    };

    setScenes((prev) => [...prev, newScene]);
    setSelectedSceneId(newScene.id);
  };

  const handleDeleteScene = (sceneId: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    if (selectedSceneId === sceneId) {
      setSelectedSceneId(scenes[0]?.id || null);
    }
  };

  const handleDuplicateScene = (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const duplicated: GisSceneKeyframe = {
      ...scene,
      id: `scene_${Date.now()}`,
      order: scenes.length + 1,
    };
    setScenes((prev) => [...prev, duplicated]);
    setSelectedSceneId(duplicated.id);
  };

  const handleUpdateSceneDuration = (sceneId: string, durationSeconds: number) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, durationSeconds } : s))
    );
  };

  const handlePreviewAllScenes = async () => {
    const map = mapRef.current;
    if (!map || scenes.length === 0 || isPreviewingScenes) return;
    setIsPreviewingScenes(true);

    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];
      setSelectedSceneId(sc.id);
      map.easeTo({
        center: [sc.camera.center.lng, sc.camera.center.lat],
        zoom: sc.camera.zoom,
        pitch: sc.camera.pitch,
        bearing: sc.camera.bearing,
        duration: (sc.durationSeconds || 4) * 850,
      });
      await new Promise((resolve) => setTimeout(resolve, (sc.durationSeconds || 4) * 1000));
    }
    setIsPreviewingScenes(false);
  };

  // Mô phỏng góc quay Camera 3D
  const handlePlay3DCameraTour = () => {
    const map = mapRef.current;
    if (!map || isPlaying3DCamera) return;

    setIsPlaying3DCamera(true);
    map.easeTo({
      center: [location.lng, location.lat],
      zoom: 14.5,
      pitch: 0,
      bearing: 0,
      duration: 1000,
    });

    setTimeout(() => {
      map.easeTo({
        center: [location.lng, location.lat],
        zoom: 16.5,
        pitch: 58,
        bearing: 45,
        duration: 3500,
      });
    }, 1200);

    setTimeout(() => {
      map.easeTo({
        center: [location.lng, location.lat],
        zoom: 16.2,
        pitch: 55,
        bearing: 140,
        duration: 4000,
      });
    }, 5000);

    setTimeout(() => {
      map.easeTo({
        center: [location.lng, location.lat],
        zoom: 15.5,
        pitch: 35,
        bearing: 0,
        duration: 2000,
      });
      setIsPlaying3DCamera(false);
    }, 9500);
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
          setLayers((prev) => [
            {
              id: `polygon_${Date.now()}`,
              name: `Vùng vẽ #${Math.random().toString(16).slice(2, 6)}`,
              type: "polygon",
              visible: true,
              color: "#00f2fe",
              strokeWidth: 4,
              opacity: 0.35,
              coordinates: ring,
              metadata: { areaM2: calculatePolygonAreaMeters(ring) },
            },
            ...prev,
          ]);
          setIsDrawingBoundary(false);
        }
      }
    });

    map.on("click", async (event) => {
      if (!isDrawingBoundaryRef.current) {
        const newCoord = { lat: event.lngLat.lat, lng: event.lngLat.lng };
        setLocation(newCoord);
        try {
          const res = await realEstateMapVideoService.reverseGeocode(newCoord);
          if (res?.address) {
            setAddress(res.address);
          }
          if (res?.name && res.name !== "Vị trí đã chọn") {
            setName(res.name);
          }
        } catch {
          // ignore
        }
      }
    });

    map.on("load", () => {
      // Dynamic Layers Source
      if (!map.getSource("gis-polygons")) {
        map.addSource("gis-polygons", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "gis-polygons-fill",
          type: "fill",
          source: "gis-polygons",
          paint: {
            "fill-color": ["coalesce", ["get", "color"], "#00f2fe"],
            "fill-opacity": 0.35,
          },
        });

        map.addLayer({
          id: "gis-polygons-line",
          type: "line",
          source: "gis-polygons",
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#00c6ff"],
            "line-width": 3.5,
          },
        });
      }

      if (!map.getSource("gis-routes")) {
        map.addSource("gis-routes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "gis-routes-line",
          type: "line",
          source: "gis-routes",
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#ffd700"],
            "line-width": 4.5,
            "line-dasharray": [2, 1],
          },
        });
      }
    });

    const markerEl = document.createElement("div");
    markerEl.className =
      "flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-white shadow-2xl ring-4 ring-cyan-200/50 animate-bounce";
    markerEl.innerHTML = `<span class="text-sm">📍</span>`;

    markerRef.current = new maplibregl.Marker({ element: markerEl })
      .setLngLat([DEFAULT_LOCATION.lng, DEFAULT_LOCATION.lat])
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cập nhật Marker tâm theo Location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([location.lng, location.lat]);
    }
  }, [location]);

  // Đồng bộ toàn bộ Layers (Polygons + Routes) lên MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const polygonFeatures = layers
      .filter((l) => l.type === "polygon" && l.visible && l.coordinates && l.coordinates.length >= 3)
      .map((l) => ({
        type: "Feature" as const,
        properties: { id: l.id, color: l.color, name: l.name },
        geometry: { type: "Polygon" as const, coordinates: [l.coordinates as number[][]] },
      }));

    const routeFeatures = layers
      .filter((l) => l.type === "route" && l.visible && l.coordinates && l.coordinates.length >= 2)
      .map((l) => ({
        type: "Feature" as const,
        properties: { id: l.id, color: l.color, name: l.name },
        geometry: { type: "LineString" as const, coordinates: l.coordinates as number[][] },
      }));

    const polySource = map.getSource("gis-polygons") as maplibregl.GeoJSONSource;
    if (polySource) {
      polySource.setData({ type: "FeatureCollection", features: polygonFeatures });
    }

    const routeSource = map.getSource("gis-routes") as maplibregl.GeoJSONSource;
    if (routeSource) {
      routeSource.setData({ type: "FeatureCollection", features: routeFeatures });
    }
  }, [layers]);

  // Cập nhật Markers Tiện ích (POIs)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    pois.forEach((poi) => {
      const el = document.createElement("div");
      el.className =
        "flex items-center gap-1.5 rounded-full bg-slate-900/90 text-white px-2.5 py-1 text-[11px] font-bold shadow-xl border border-slate-700 backdrop-blur-xs cursor-pointer hover:scale-110 transition-transform";
      el.innerHTML = `<span>📍</span><span class="truncate max-w-[120px]">${poi.name}</span>`;
      el.onclick = () => void handleSelectRouteToPoi(poi);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.location.lng, poi.location.lat])
        .addTo(map);

      poiMarkersRef.current.push(marker);
    });
  }, [pois, handleSelectRouteToPoi]);

  // Bộ điều khiển chế độ vẽ Polygon
  const handleStartDrawPolygon = () => {
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance) return;
    instance.setMode("polygon");
    setIsDrawingBoundary(true);
    setDrawMode("draw-polygon");
  };

  const handleStartEditVertices = () => {
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance) return;
    instance.setMode("select");
    setIsDrawingBoundary(true);
    setDrawMode("select-edit");
  };

  const handleStopDrawing = () => {
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance) return;
    instance.setMode("render");
    setIsDrawingBoundary(false);
    setDrawMode("none");
  };

  const handleDeleteSelected = () => {
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance) return;
    instance.setMode("delete-selection");
    setTimeout(() => {
      instance.setMode("select");
    }, 150);
  };

  const handleCreatePresetRectangle = (widthMeters = 240, heightMeters = 240) => {
    const rect = createRectangleBoundary(location, widthMeters, heightMeters);
    setBoundary(rect);
    setLayers((prev) => [
      {
        id: `polygon_rect_${Date.now()}`,
        name: "Thửa chữ nhật mẫu",
        type: "polygon",
        visible: true,
        color: "#ffd700",
        strokeWidth: 4,
        opacity: 0.35,
        coordinates: rect,
        metadata: { areaM2: calculatePolygonAreaMeters(rect) },
      },
      ...prev,
    ]);
    handleStopDrawing();
  };

  const handleCreatePresetCircle = (radiusMeters = 160) => {
    const circle = createCirclePolygon(location, radiusMeters, 24);
    setBoundary(circle);
    setLayers((prev) => [
      {
        id: `polygon_circle_${Date.now()}`,
        name: "Phân khu tròn mẫu",
        type: "polygon",
        visible: true,
        color: "#10b981",
        strokeWidth: 4,
        opacity: 0.35,
        coordinates: circle,
        metadata: { areaM2: calculatePolygonAreaMeters(circle) },
      },
      ...prev,
    ]);
    handleStopDrawing();
  };

  const handleResetDefaultBoundary = () => {
    const def = createBoundary(location);
    setBoundary(def);
    setLayers(() => [
      {
        id: "boundary_main",
        name: "Vùng quy hoạch #7ccc",
        type: "polygon",
        visible: true,
        color: "#00f2fe",
        strokeWidth: 4,
        opacity: 0.35,
        coordinates: def,
        metadata: { areaM2: calculatePolygonAreaMeters(def) },
      },
    ]);
    handleStopDrawing();
  };

  const handleClearBoundary = () => {
    setBoundary([]);
    setLayers((prev) => prev.filter((l) => l.id !== "boundary_main"));
    handleStopDrawing();
  };

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
        vfxConfig: {
          boundaryTheme,
          showRadiusPulse,
          showAnimatedRoutes,
          show3DBillboards,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  // Bắt đầu Render MP4
  const handleStartRender = async () => {
    await handleSaveDraft();
    setIsRendering(true);
    setShowRenderModal(true);
    try {
      const render = await realEstateMapVideoService.createRender({
        idempotencyKey: `render_${Date.now()}`,
      });
      setActiveRender(render);
    } catch (error) {
      setIsRendering(false);
      console.error("Lỗi khởi tạo render:", error);
    }
  };

  return (
    <div
      ref={workspaceContainerRef}
      className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden bg-slate-100 select-none font-sans text-slate-800"
    >
      {/* 1. Header Toolbar Nhỏ Phía Trên */}
      <div className="absolute top-0 left-0 right-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md text-slate-800">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition"
              title="Quay lại"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md">
              <img
                src={BRAND_LOGO_PATH}
                alt={BRAND_NAME}
                className="h-5 w-5 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span>BDS MapTour Studio</span>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 border border-indigo-200">
                  GIS 3D
                </span>
              </h1>
              <p className="text-[10px] text-slate-500">
                Xây dựng video bản đồ BĐS chuyên nghiệp với đa lớp GIS & Keyframe Camera
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPricingModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition shadow-xs"
            title="Bảng giá dịch vụ AI & Credit"
          >
            <Receipt className="h-3.5 w-3.5 text-sky-600" /> Bảng giá
          </button>
          <button
            type="button"
            onClick={handleCreateNewProject}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Tạo dự án mới
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 border border-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition shadow-xs"
          >
            <Save className="h-3.5 w-3.5" />
            {saved ? "Đã lưu bản nháp!" : "Lưu dự án"}
          </button>
        </div>
      </div>

      {/* 2. Cột Trái: Thanh Công Cụ GIS & Bảng Nhập Liệu */}
      <aside
        className={`relative z-10 mt-14 flex h-[calc(100%-3.5rem)] border-r border-slate-200 bg-white transition-all duration-300 shadow-lg ${
          isLeftSidebarOpen ? "w-[380px]" : "w-0 overflow-hidden opacity-0 border-none"
        }`}
      >
        {/* Thanh Icon Tool bên trái */}
        <div className="flex w-14 flex-col items-center border-r border-slate-100 bg-slate-50/70 py-3 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveGisTool("polygon")}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              activeGisTool === "polygon"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
            title="Vẽ Đa giác / Vùng đất"
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveGisTool("route-ab")}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              activeGisTool === "route-ab"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
            title="Tự động vẽ Lộ trình (A -> B)"
          >
            <Route className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveGisTool("marker")}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              activeGisTool === "marker"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
            title="Điểm mốc & Tiện ích"
          >
            <MapPin className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveGisTool("settings")}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              activeGisTool === "settings"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
            title="Cài đặt Video & Voice AI"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveGisTool("history");
              void loadRenderHistory();
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              activeGisTool === "history"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
            title="Lịch sử Video đã xuất"
          >
            <History className="h-4 w-4" />
          </button>
        </div>

        {/* Nội dung chi tiết của Tool đang chọn */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {activeGisTool === "polygon" && "⬡ Vẽ Vùng Đa Giác & Dự Án"}
              {activeGisTool === "route-ab" && "🛣️ Vẽ Lộ Trình (A ➜ B)"}
              {activeGisTool === "marker" && "📍 Tiện Ích & Điểm Ghim"}
              {activeGisTool === "settings" && "⚙️ Kịch Bản & Cài Đặt"}
              {activeGisTool === "history" && "🎬 Lịch Sử Render Video"}
            </span>
            <button
              type="button"
              onClick={() => setIsLeftSidebarOpen(false)}
              className="rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {activeGisTool === "polygon" && (
            <RealEstateMapStep1Location
              name={name}
              setName={setName}
              address={address}
              setAddress={setAddress}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchResults={searchResults}
              setSearchResults={setSearchResults}
              isSearching={isSearching}
              handleSearchAddress={handleSearchAddress}
              handleSelectLocation={handleSelectLocation}
              boundary={boundary}
              polygonArea={polygonArea}
              polygonPerimeter={polygonPerimeter}
              drawMode={drawMode}
              handleStartDrawPolygon={handleStartDrawPolygon}
              handleStartEditVertices={handleStartEditVertices}
              handleCreatePresetRectangle={handleCreatePresetRectangle}
              handleCreatePresetCircle={handleCreatePresetCircle}
              handleResetDefaultBoundary={handleResetDefaultBoundary}
              handleClearBoundary={handleClearBoundary}
              boundaryOpacity={boundaryOpacity}
              setBoundaryOpacity={setBoundaryOpacity}
              boundaryStrokeWidth={boundaryStrokeWidth}
              setBoundaryStrokeWidth={setBoundaryStrokeWidth}
              boundaryStrokeType={boundaryStrokeType}
              setBoundaryStrokeType={setBoundaryStrokeType}
              onNext={() => setActiveGisTool("route-ab")}
            />
          )}

          {activeGisTool === "route-ab" && (
            <RealEstateMapRouteABPanel
              currentLocation={location}
              projectName={name}
              onAddRouteLayer={handleAddRouteLayer}
            />
          )}

          {activeGisTool === "marker" && (
            <RealEstateMapStep2Pois
              pois={pois}
              setPois={setPois}
              routes={routes}
              setRoutes={setRoutes}
              isLoadingPois={isLoadingPois}
              handleSearchPois={handleSearchPois}
              handleSelectRouteToPoi={handleSelectRouteToPoi}
              hotline={hotline}
              setHotline={setHotline}
              ctaText={ctaText}
              setCtaText={setCtaText}
              onBack={() => setActiveGisTool("polygon")}
              onNext={() => setActiveGisTool("settings")}
            />
          )}

          {activeGisTool === "settings" && (
            <RealEstateMapStep3Script
              boundaryTheme={boundaryTheme}
              setBoundaryTheme={setBoundaryTheme}
              showRadiusPulse={showRadiusPulse}
              setShowRadiusPulse={setShowRadiusPulse}
              showAnimatedRoutes={showAnimatedRoutes}
              setShowAnimatedRoutes={setShowAnimatedRoutes}
              isPlaying3DCamera={isPlaying3DCamera}
              handlePlay3DCameraTour={handlePlay3DCameraTour}
              showSafeArea={showSafeArea}
              setShowSafeArea={setShowSafeArea}
              isLoadingSnapshot={isLoadingSnapshot}
              snapshotData={snapshotData}
              handleLoadSnapshot={handleLoadSnapshot}
              isRendering={isRendering}
              handleStartRender={handleStartRender}
              onBack={() => setActiveGisTool("marker")}
            />
          )}

          {activeGisTool === "history" && (
            <div className="space-y-3">
              {isLoadingHistory ? (
                <div className="p-4 text-center text-xs text-slate-400">Đang tải lịch sử render...</div>
              ) : renderHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                  Chưa có video nào được render. Hãy tạo dự án và bấm &quot;Xuất Video MP4&quot;.
                </div>
              ) : (
                renderHistory.map((item) => (
                  <RealEstateVideoHistoryCard
                    key={item.id}
                    item={item}
                    onRetry={() => {
                      void realEstateMapVideoService.retryRender(item.id);
                      void loadRenderHistory();
                    }}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* 3. Khu Vực Bản Đồ Trung Tâm */}
      <main className="relative flex-1 h-full overflow-hidden bg-slate-100">
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

        {/* Floating Safe Area 9:16 / 16:9 Frame */}
        {showSafeArea && <RealEstateMapSafeAreaOverlay aspectRatio={aspectRatio} />}

        {/* Floating 3D Camera Active Banner */}
        {isPlaying3DCamera && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur-md border border-indigo-400 animate-bounce">
            <span className="flex h-2 w-2 rounded-full bg-white animate-ping" />
            <span>🎥 Đang mô phỏng chuyển động Camera 3D điện ảnh (Fly-in & Orbit)</span>
          </div>
        )}

        {/* Floating Drawing & Editing Action Toolbar */}
        {isDrawingBoundary && (
          <RealEstateMapFloatingPolygonBar
            drawMode={drawMode}
            polygonArea={polygonArea}
            boundary={boundary}
            handleStartDrawPolygon={handleStartDrawPolygon}
            handleStartEditVertices={handleStartEditVertices}
            handleDeleteSelected={handleDeleteSelected}
            handleStopDrawing={handleStopDrawing}
          />
        )}

        {/* Floating Top Toolbar */}
        <RealEstateMapFloatingTopToolbar
          isSidebarOpen={isLeftSidebarOpen}
          setIsSidebarOpen={setIsLeftSidebarOpen}
          isRightSidebarOpen={isRightSidebarOpen}
          setIsRightSidebarOpen={setIsRightSidebarOpen}
          mapTheme={mapTheme}
          handleChangeMapTheme={handleChangeMapTheme}
          aspectRatio={aspectRatio}
          onChangeAspectRatio={setAspectRatio}
          showPlaceLabels={showPlaceLabels}
          onTogglePlaceLabels={() => setShowPlaceLabels(!showPlaceLabels)}
          isPlaying3DCamera={isPlaying3DCamera}
          handlePlay3DCameraTour={handlePlay3DCameraTour}
          isDrawingBoundary={isDrawingBoundary}
          handleStartDrawPolygon={handleStartDrawPolygon}
          handleStopDrawing={handleStopDrawing}
          handleToggleFullscreen={handleToggleFullscreen}
          activeTab={activeTab}
          handleTabChange={handleTabChange}
          handleStartRender={handleStartRender}
          isRendering={isRendering}
        />

        {/* Floating Bottom Status Bar */}
        <RealEstateMapStatusBadge
          location={location}
          layerCount={layers.length}
        />
      </main>

      {/* 4. Cột Phải: Quản Lý Lớp (Layer Manager) & Timeline Phân Cảnh */}
      <aside
        className={`relative z-10 mt-14 flex h-[calc(100%-3.5rem)] flex-col border-l border-slate-200 bg-slate-50/70 transition-all duration-300 shadow-lg ${
          isRightSidebarOpen ? "w-[340px]" : "w-0 overflow-hidden opacity-0 border-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-2">
          <span className="text-xs font-bold text-slate-800">Studio Panel</span>
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(false)}
            className="rounded p-1 text-slate-400 hover:text-slate-700"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* 1. Layer Manager */}
          <RealEstateMapLayerManager
            layers={layers}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onChangeLayerColor={handleChangeLayerColor}
            onDuplicateLayer={handleDuplicateLayer}
            onDeleteLayer={handleDeleteLayer}
            onMoveLayer={handleMoveLayer}
            onRenameLayer={handleRenameLayer}
          />

          {/* 2. Timeline Phân Cảnh */}
          <RealEstateMapTimeline
            scenes={scenes}
            selectedSceneId={selectedSceneId}
            onSelectScene={setSelectedSceneId}
            onPinCurrentCameraScene={handlePinCurrentCameraScene}
            onDeleteScene={handleDeleteScene}
            onDuplicateScene={handleDuplicateScene}
            onUpdateSceneDuration={handleUpdateSceneDuration}
            onPreviewAllScenes={handlePreviewAllScenes}
            isPreviewing={isPreviewingScenes}
            onStartRender={handleStartRender}
            isRendering={isRendering}
          />
        </div>
      </aside>

      {/* Render Modal */}
      <RealEstateMapRenderModal
        show={showRenderModal}
        onClose={() => setShowRenderModal(false)}
        activeRender={activeRender}
      />

      {/* Pricing Modal */}
      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
      />
    </div>
  );
}
