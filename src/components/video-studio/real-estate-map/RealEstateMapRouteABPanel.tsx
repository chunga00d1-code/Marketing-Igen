import { useState } from "react";
import { Loader2, MapPin, Navigation, Route, Sparkles } from "lucide-react";
import type { RealEstateMapCoordinate } from "../../../services/realEstateMapVideoService";
import { realEstateMapVideoService } from "../../../services/realEstateMapVideoService";
import type { GisMapLayer } from "./map-video.types";

interface RealEstateMapRouteABPanelProps {
  currentLocation: RealEstateMapCoordinate;
  projectName: string;
  onAddRouteLayer: (layer: GisMapLayer) => void;
}

export function RealEstateMapRouteABPanel({
  currentLocation,
  projectName,
  onAddRouteLayer,
}: RealEstateMapRouteABPanelProps) {
  const [pointAQuery, setPointAQuery] = useState(projectName || "Tâm dự án hiện tại");
  const [pointBQuery, setPointBQuery] = useState("");
  const [showPointMarkers, setShowPointMarkers] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastRouteInfo, setLastRouteInfo] = useState<{
    distanceKm: number;
    durationMin: number;
    fromName: string;
    toName: string;
  } | null>(null);

  const POPULAR_DESTINATIONS = [
    "Sân bay Quốc tế",
    "Trung tâm Hội nghị Quốc gia",
    "Hồ Hoàn Kiếm",
    "Landmark 81",
    "Bến Bạch Đằng",
    "Chợ Bến Thành",
    "Cao tốc Long Thành",
  ];

  const handleGenerateRoute = async () => {
    if (!pointBQuery.trim()) {
      setErrorMsg("Vui lòng nhập tên hoặc địa chỉ Điểm B (Điểm đến).");
      return;
    }
    setErrorMsg("");
    setIsCalculating(true);

    try {
      // 1. Geocode Điểm A (hoặc dùng currentLocation nếu là tâm dự án)
      let fromCoord = currentLocation;
      let fromName = pointAQuery.trim() || "Tâm dự án";

      if (pointAQuery.trim() && pointAQuery.trim() !== projectName && pointAQuery.trim() !== "Tâm dự án hiện tại") {
        const resultsA = await realEstateMapVideoService.geocode(pointAQuery.trim());
        if (resultsA && resultsA.length > 0) {
          fromCoord = resultsA[0].location;
          fromName = resultsA[0].name || pointAQuery;
        }
      }

      // 2. Geocode Điểm B
      const resultsB = await realEstateMapVideoService.geocode(pointBQuery.trim());
      if (!resultsB || resultsB.length === 0) {
        throw new Error(`Không tìm thấy địa điểm "${pointBQuery}". Hãy thử tên cụ thể hơn.`);
      }
      const toCoord = resultsB[0].location;
      const toName = resultsB[0].name || pointBQuery;

      // 3. Tính lộ trình tuyến đường
      const routeRes = await realEstateMapVideoService.getRoute({
        from: fromCoord,
        to: toCoord,
        toName,
      });

      if (!routeRes || !routeRes.geometry) {
        throw new Error("Không thể tính toán tuyến đường giữa 2 điểm này.");
      }

      const distanceKm = Math.round(routeRes.distanceMeters / 100) / 10;
      const durationMin = Math.round(routeRes.durationSeconds / 60) || 1;

      // 4. Tạo layer mới
      const newLayer: GisMapLayer = {
        id: `route_${Date.now()}`,
        name: `Lộ trình ${fromName} ➜ ${toName}`,
        type: "route",
        visible: true,
        color: "#ffd700",
        strokeWidth: 5,
        opacity: 0.9,
        coordinates: routeRes.geometry.coordinates,
        metadata: {
          distanceMeters: routeRes.distanceMeters,
          durationSeconds: routeRes.durationSeconds,
          fromName,
          toName,
        },
      };

      onAddRouteLayer(newLayer);
      setLastRouteInfo({
        distanceKm,
        durationMin,
        fromName,
        toName,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi tính toán lộ trình.";
      setErrorMsg(msg);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-3.5 text-slate-800">
      <div>
        <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Route className="h-4 w-4 text-indigo-600" />
          Tự Động Vẽ Lộ Trình (A ➜ B)
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Tạo đường ray neon phát sáng kết nối 2 vị trí
        </p>
      </div>

      {/* Input Điểm A */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-slate-700">
          Điểm A (Khởi hành):
        </label>
        <div className="relative">
          <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-indigo-600" />
          <input
            value={pointAQuery}
            onChange={(e) => setPointAQuery(e.target.value)}
            placeholder="Ví dụ: Dự án Starlake, Chợ Bến Thành..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {/* Input Điểm B */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-slate-700">
          Điểm B (Điểm đến):
        </label>
        <div className="relative">
          <Navigation className="absolute left-3 top-2.5 h-3.5 w-3.5 text-amber-500" />
          <input
            value={pointBQuery}
            onChange={(e) => setPointBQuery(e.target.value)}
            placeholder="Ví dụ: Sân bay Nội Bài, Sân bay Long Thành..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Gợi ý điểm đến phổ biến */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {POPULAR_DESTINATIONS.slice(0, 4).map((dest) => (
            <button
              key={dest}
              type="button"
              onClick={() => setPointBQuery(dest)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition"
            >
              {dest}
            </button>
          ))}
        </div>
      </div>

      {/* Checkbox & Error */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showPointMarkers}
            onChange={(e) => setShowPointMarkers(e.target.checked)}
            className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-0"
          />
          <span>Hiển thị điểm đánh dấu A / B</span>
        </label>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* Kết quả lộ trình vừa tính */}
      {lastRouteInfo && (
        <div className="rounded-xl bg-indigo-50/80 border border-indigo-200 p-2.5 text-xs space-y-1 text-slate-800">
          <div className="flex items-center justify-between font-bold text-indigo-700">
            <span>Đã tạo tuyến đường:</span>
            <span>{lastRouteInfo.distanceKm} km · ~{lastRouteInfo.durationMin} phút</span>
          </div>
          <p className="text-[11px] text-slate-600 truncate">
            {lastRouteInfo.fromName} ➜ {lastRouteInfo.toName}
          </p>
        </div>
      )}

      {/* Nút Tạo Lộ Trình */}
      <button
        type="button"
        onClick={handleGenerateRoute}
        disabled={isCalculating}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 transition"
      >
        {isCalculating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isCalculating ? "Đang tính toán lộ trình..." : "Tạo lộ trình phát sáng"}
      </button>
    </div>
  );
}
