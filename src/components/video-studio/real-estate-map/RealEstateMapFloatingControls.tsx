import {
  Check,
  Globe,
  History,
  Layers,
  Loader2,
  Maximize2,
  MousePointerClick,
  Navigation,
  PanelLeftOpen,
  PencilRuler,
  Play,
  Trash2,
  Video,
} from "lucide-react";
import type { RealEstateMapCoordinate } from "../../../services/realEstateMapVideoService";
import type { AspectRatioType, DrawMode, MapTheme } from "./map-video.types";
import { formatArea } from "./map-video.utils";

// 1. Floating Polygon Drawing/Editing Toolbar
export function RealEstateMapFloatingPolygonBar({
  drawMode,
  polygonArea,
  boundary,
  handleStartDrawPolygon,
  handleStartEditVertices,
  handleDeleteSelected,
  handleStopDrawing,
}: {
  drawMode: DrawMode;
  polygonArea: number;
  boundary: number[][];
  handleStartDrawPolygon: () => void;
  handleStartEditVertices: () => void;
  handleDeleteSelected: () => void;
  handleStopDrawing: () => void;
}) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md border border-indigo-200 text-slate-800 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
        <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-ping" />
        <div>
          <span className="text-xs font-bold text-slate-900 block">
            {drawMode === "draw-polygon"
              ? "✏️ Chế độ Vẽ Đa Giác (Click các góc, click đúp để đóng)"
              : "🖐️ Chế độ Chỉnh Sửa Đỉnh (Kéo các điểm góc)"}
          </span>
          <span className="text-[10px] text-indigo-600 font-semibold">
            {formatArea(polygonArea)} · {(boundary || []).length} đỉnh
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleStartDrawPolygon}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1 ${
            drawMode === "draw-polygon"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <PencilRuler className="h-3.5 w-3.5" />
          Vẽ tiếp
        </button>
        <button
          type="button"
          onClick={handleStartEditVertices}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1 ${
            drawMode === "select-edit"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <MousePointerClick className="h-3.5 w-3.5" />
          Kéo đỉnh
        </button>
        {drawMode === "select-edit" && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="rounded-xl bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 text-xs font-bold text-rose-600 border border-rose-200 transition"
            title="Xóa điểm đỉnh đang chọn"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleStopDrawing}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition ml-1 flex items-center gap-1"
        >
          <Check className="h-4 w-4" />
          Hoàn tất
        </button>
      </div>
    </div>
  );
}

// 2. Floating Top Toolbar
export function RealEstateMapFloatingTopToolbar({
  isSidebarOpen,
  setIsSidebarOpen,
  isRightSidebarOpen,
  setIsRightSidebarOpen,
  mapTheme,
  handleChangeMapTheme,
  aspectRatio,
  onChangeAspectRatio,
  showPlaceLabels,
  onTogglePlaceLabels,
  isPlaying3DCamera,
  handlePlay3DCameraTour,
  isDrawingBoundary,
  handleStartDrawPolygon,
  handleStopDrawing,
  handleToggleFullscreen,
  activeTab,
  handleTabChange,
  handleStartRender,
  isRendering,
}: {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isRightSidebarOpen?: boolean;
  setIsRightSidebarOpen?: (open: boolean) => void;
  mapTheme: MapTheme;
  handleChangeMapTheme: (theme: MapTheme) => void;
  aspectRatio: AspectRatioType;
  onChangeAspectRatio: (ratio: AspectRatioType) => void;
  showPlaceLabels: boolean;
  onTogglePlaceLabels: () => void;
  isPlaying3DCamera: boolean;
  handlePlay3DCameraTour: () => void;
  isDrawingBoundary: boolean;
  handleStartDrawPolygon: () => void;
  handleStopDrawing: () => void;
  handleToggleFullscreen: () => void;
  activeTab: 1 | 2 | 3 | "history";
  handleTabChange: (tab: 1 | 2 | 3 | "history") => void;
  handleStartRender: () => Promise<void>;
  isRendering: boolean;
}) {
  return (
    <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Nút Hiện Bảng điều khiển khi đang ẩn */}
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-md border border-slate-200 hover:bg-slate-50 transition"
            title="Mở thanh công cụ GIS"
          >
            <PanelLeftOpen className="h-4 w-4 text-indigo-600" />
          </button>
        )}

        {/* Aspect Ratio Selector (16:9 / 9:16) */}
        <div className="flex items-center gap-1 rounded-2xl bg-white/95 p-1 shadow-md backdrop-blur-md border border-slate-200 text-xs font-bold text-slate-700">
          <button
            type="button"
            onClick={() => onChangeAspectRatio("16:9")}
            className={`rounded-xl px-2.5 py-1 transition ${
              aspectRatio === "16:9"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            16:9
          </button>
          <button
            type="button"
            onClick={() => onChangeAspectRatio("9:16")}
            className={`rounded-xl px-2.5 py-1 transition ${
              aspectRatio === "9:16"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            9:16
          </button>
        </div>

        {/* Map Theme Switcher */}
        <div className="flex items-center gap-1 rounded-2xl bg-white/95 p-1 shadow-md backdrop-blur-md border border-slate-200">
          <button
            type="button"
            onClick={() => handleChangeMapTheme("street")}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              mapTheme === "street"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Navigation className="h-3 w-3" />
            Đường phố
          </button>
          <button
            type="button"
            onClick={() => handleChangeMapTheme("satellite")}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              mapTheme === "satellite"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Globe className="h-3 w-3" />
            Vệ tinh
          </button>
          <button
            type="button"
            onClick={() => handleChangeMapTheme("dark")}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              mapTheme === "dark"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3 w-3" />
            Tối
          </button>
        </div>

        {/* Nhãn địa danh checkbox */}
        <label className="flex items-center gap-1.5 rounded-2xl bg-white/95 px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-md backdrop-blur-md border border-slate-200 cursor-pointer hover:text-slate-900">
          <input
            type="checkbox"
            checked={showPlaceLabels}
            onChange={onTogglePlaceLabels}
            className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-0"
          />
          <span>Nhãn địa danh</span>
        </label>
      </div>

      {/* Map Quick Actions */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={handlePlay3DCameraTour}
          disabled={isPlaying3DCamera}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-white/95 hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-md backdrop-blur-md border border-slate-200 transition"
          title="Xem thử góc máy bay 3D"
        >
          <Play className="h-3.5 w-3.5 fill-indigo-600 text-indigo-600" />
          Camera 3D
        </button>
        <button
          type="button"
          onClick={() => {
            if (isDrawingBoundary) {
              handleStopDrawing();
            } else {
              handleStartDrawPolygon();
            }
          }}
          className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold text-white shadow-md transition ${
            isDrawingBoundary
              ? "bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300"
              : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20"
          }`}
        >
          {isDrawingBoundary ? <Check className="h-4 w-4" /> : <PencilRuler className="h-4 w-4" />}
          {isDrawingBoundary ? "Hoàn tất vẽ" : "Vẽ ranh đất"}
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
            activeTab === "history"
              ? "bg-indigo-600 text-white border-indigo-500"
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
          className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/25 hover:brightness-105 disabled:opacity-50 transition"
        >
          {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          Xuất Video
        </button>

        {/* Nút mở Right Sidebar nếu đang đóng */}
        {!isRightSidebarOpen && setIsRightSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-md border border-slate-200 hover:bg-slate-50 transition"
            title="Mở Studio Panel"
          >
            <PanelLeftOpen className="h-4 w-4 text-indigo-600 rotate-180" />
          </button>
        )}
      </div>
    </div>
  );
}

// 3. Safe Area Overlay Frame (Hỗ trợ 9:16 hoặc 16:9)
export function RealEstateMapSafeAreaOverlay({
  aspectRatio = "9:16",
}: {
  aspectRatio?: AspectRatioType;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className={`relative rounded-3xl border-2 border-dashed border-indigo-500/70 bg-slate-900/10 shadow-2xl backdrop-blur-[1px] ${
          aspectRatio === "9:16"
            ? "aspect-[9/16] h-[92%] max-h-[860px]"
            : "aspect-[16/9] w-[90%] max-w-[1200px]"
        }`}
      >
        {/* Safe Area Guides */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-[11px] font-bold text-indigo-700">
          <span className="rounded-md bg-white/90 shadow-xs px-2 py-0.5 border border-indigo-100">
            VÙNG GHI HÌNH ({aspectRatio})
          </span>
          <span className="rounded-md bg-white/90 shadow-xs px-2 py-0.5 border border-indigo-100">
            Top Safe Zone
          </span>
        </div>
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-2 text-[10px] text-indigo-700">
          <span className="rounded-md bg-white/90 shadow-xs px-1.5 py-0.5 border border-indigo-100">
            UI Icons
          </span>
        </div>
        <div className="absolute bottom-4 left-4 right-4 rounded-md bg-white/90 border border-indigo-100 px-2 py-1 text-center text-[10px] font-semibold text-indigo-700 shadow-xs">
          {aspectRatio === "9:16" ? "Vùng Caption & Âm thanh TikTok" : "Vùng Tiêu đề & Logo"}
        </div>
      </div>
    </div>
  );
}

// 4. Status Badge ở góc dưới bản đồ
export function RealEstateMapStatusBadge({
  location,
  layerCount,
}: {
  location: RealEstateMapCoordinate;
  layerCount: number;
}) {
  return (
    <div className="absolute right-4 bottom-4 z-10 flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-md px-3.5 py-2 text-xs text-slate-700 shadow-lg border border-slate-200">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
        <span>
          📍 Tâm: <strong>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</strong>
        </span>
      </div>
      <span className="text-slate-300">|</span>
      <span>
        🧱 <strong>{layerCount} lớp dữ liệu</strong>
      </span>
    </div>
  );
}
