import {
  ArrowRight,
  Building2,
  Circle,
  Loader2,
  MousePointerClick,
  PencilRuler,
  RotateCcw,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { MapLocationResult } from "../../../services/realEstateMapVideoService";
import type { BoundaryStrokeType, DrawMode } from "./map-video.types";
import { POPULAR_SUGGESTIONS } from "./map-video.types";
import { formatArea, formatPerimeter } from "./map-video.utils";

interface RealEstateMapStep1LocationProps {
  name: string;
  setName: (name: string) => void;
  address: string;
  setAddress: (address: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: MapLocationResult[];
  setSearchResults: (results: MapLocationResult[]) => void;
  isSearching: boolean;
  handleSearchAddress: (queryOverride?: string) => Promise<void>;
  handleSelectLocation: (result: MapLocationResult) => void;
  boundary: number[][];
  polygonArea: number;
  polygonPerimeter: number;
  drawMode: DrawMode;
  handleStartDrawPolygon: () => void;
  handleStartEditVertices: () => void;
  handleCreatePresetRectangle: (widthMeters?: number, heightMeters?: number) => void;
  handleCreatePresetCircle: (radiusMeters?: number) => void;
  handleResetDefaultBoundary: () => void;
  handleClearBoundary: () => void;
  boundaryOpacity: number;
  setBoundaryOpacity: (opacity: number) => void;
  boundaryStrokeWidth: number;
  setBoundaryStrokeWidth: (width: number) => void;
  boundaryStrokeType: BoundaryStrokeType;
  setBoundaryStrokeType: (type: BoundaryStrokeType) => void;
  onNext: () => void;
}

export function RealEstateMapStep1Location({
  name,
  setName,
  address,
  setAddress,
  searchQuery,
  setSearchQuery,
  searchResults,
  setSearchResults,
  isSearching,
  handleSearchAddress,
  handleSelectLocation,
  boundary,
  polygonArea,
  polygonPerimeter,
  drawMode,
  handleStartDrawPolygon,
  handleStartEditVertices,
  handleCreatePresetRectangle,
  handleCreatePresetCircle,
  handleResetDefaultBoundary,
  handleClearBoundary,
  boundaryOpacity,
  setBoundaryOpacity,
  boundaryStrokeWidth,
  setBoundaryStrokeWidth,
  boundaryStrokeType,
  setBoundaryStrokeType,
  onNext,
}: RealEstateMapStep1LocationProps) {
  return (
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
              placeholder="Gõ tên dự án, đường, quận, thành phố..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-8 pr-7 text-xs outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleSearchAddress()}
            disabled={isSearching}
            className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Tìm"}
          </button>
        </div>

        {/* Gợi ý dự án BĐS nổi tiếng */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-400 mr-0.5">Gợi ý:</span>
          {POPULAR_SUGGESTIONS.slice(0, 5).map((proj) => (
            <button
              key={proj}
              type="button"
              onClick={() => {
                setSearchQuery(proj);
                void handleSearchAddress(proj);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition"
            >
              {proj}
            </button>
          ))}
        </div>

        {/* Danh sách kết quả chi tiết */}
        {searchResults && searchResults.length > 0 && (
          <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xl max-h-52 overflow-y-auto">
            <div className="flex items-center justify-between bg-slate-50/80 px-3 py-1.5 text-[10px] font-bold text-slate-500">
              <span>Tìm thấy {searchResults.length} địa điểm</span>
              <button
                type="button"
                onClick={() => setSearchResults([])}
                className="text-slate-400 hover:text-slate-600"
              >
                Đóng
              </button>
            </div>
            {searchResults.map((res, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectLocation(res)}
                className="flex w-full items-start gap-2.5 p-2.5 text-left text-xs hover:bg-indigo-50/70 transition"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 mt-0.5">
                  <Building2 className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 line-clamp-1">{res.name || res.address}</p>
                  <p className="text-slate-500 text-[11px] line-clamp-2 mt-0.5">{res.address}</p>
                </div>
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

      {/* Quản lý & Tùy chỉnh Ranh đất Polygon */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs">
              📐
            </span>
            <h3 className="text-xs font-bold text-slate-900">
              Ranh giới thửa đất (Polygon)
            </h3>
          </div>
          <span className="rounded-md bg-indigo-100/80 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">
            {(boundary || []).length} đỉnh
          </span>
        </div>

        {/* Thẻ chỉ số đo đạc thời gian thực */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block">Diện tích ước tính:</span>
            <span className="text-xs font-extrabold text-indigo-950 block truncate">
              {formatArea(polygonArea)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block">Chu vi ranh đất:</span>
            <span className="text-xs font-extrabold text-indigo-950 block truncate">
              {formatPerimeter(polygonPerimeter)}
            </span>
          </div>
        </div>

        {/* Công cụ vẽ & chỉnh sửa */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
            Công cụ vẽ & chỉnh sửa ranh đất:
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleStartDrawPolygon}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-bold transition shadow-2xs border ${
                drawMode === "draw-polygon"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <PencilRuler className="h-3.5 w-3.5" />
              Vẽ đa giác
            </button>
            <button
              type="button"
              onClick={handleStartEditVertices}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-bold transition shadow-2xs border ${
                drawMode === "select-edit"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              Kéo chỉnh đỉnh
            </button>
          </div>

          {/* Preset nhanh */}
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => handleCreatePresetRectangle(220, 220)}
              className="flex items-center justify-center gap-1 rounded-xl bg-white border border-slate-200 py-1.5 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              title="Tạo nhanh thửa chữ nhật chuẩn"
            >
              <Square className="h-3 w-3 text-indigo-600" />
              Chữ nhật mẫu
            </button>
            <button
              type="button"
              onClick={() => handleCreatePresetCircle(160)}
              className="flex items-center justify-center gap-1 rounded-xl bg-white border border-slate-200 py-1.5 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              title="Tạo nhanh vùng tròn bán kính"
            >
              <Circle className="h-3 w-3 text-indigo-600" />
              Vòng tròn bán kính
            </button>
          </div>

          {/* Nút Khôi phục & Xóa */}
          <div className="flex items-center justify-between pt-1 text-[11px]">
            <button
              type="button"
              onClick={handleResetDefaultBoundary}
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
            >
              <RotateCcw className="h-3 w-3" />
              Khôi phục mặc định
            </button>
            <button
              type="button"
              onClick={handleClearBoundary}
              className="inline-flex items-center gap-1 text-rose-600 hover:underline font-semibold"
            >
              <Trash2 className="h-3 w-3" />
              Xóa ranh đất
            </button>
          </div>
        </div>

        {/* Tùy chỉnh nét viền & độ mờ */}
        <div className="pt-2 border-t border-indigo-100/80 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">Độ trong suốt nền:</span>
            <div className="flex items-center gap-1">
              {[0.2, 0.35, 0.5, 0.7].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => setBoundaryOpacity(op)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                    boundaryOpacity === op
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {Math.round(op * 100)}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">Độ dày viền LED:</span>
            <div className="flex items-center gap-1">
              {[2, 3.5, 5, 7].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setBoundaryStrokeWidth(w)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                    boundaryStrokeWidth === w
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">Kiểu viền LED:</span>
            <div className="flex items-center gap-1">
              {(["solid", "dashed", "glow"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBoundaryStrokeType(type)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                    boundaryStrokeType === type
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {type === "solid" ? "Liền" : type === "dashed" ? "Đứt" : "Glow"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition"
      >
        Tiếp tục: Chọn tiện ích <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
