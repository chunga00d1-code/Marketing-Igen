import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Loader2,
  Phone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  RealEstateMapPoi,
  RealEstateMapRoute,
} from "../../../services/realEstateMapVideoService";
import { CATEGORY_ICONS } from "./map-video.utils";

interface RealEstateMapStep2PoisProps {
  pois: RealEstateMapPoi[];
  setPois: (pois: RealEstateMapPoi[]) => void;
  routes: RealEstateMapRoute[];
  setRoutes: (routes: RealEstateMapRoute[]) => void;
  isLoadingPois: boolean;
  handleSearchPois: () => Promise<void>;
  handleSelectRouteToPoi: (poi: RealEstateMapPoi) => Promise<void>;
  hotline: string;
  setHotline: (hotline: string) => void;
  ctaText: string;
  setCtaText: (cta: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function RealEstateMapStep2Pois({
  pois,
  setPois,
  routes,
  setRoutes,
  isLoadingPois,
  handleSearchPois,
  handleSelectRouteToPoi,
  hotline,
  setHotline,
  ctaText,
  setCtaText,
  onBack,
  onNext,
}: RealEstateMapStep2PoisProps) {
  return (
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
        <div className="flex items-center gap-1.5">
          {pois && pois.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPois([]);
                setRoutes([]);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition shadow-xs"
              title="Xóa tất cả tiện ích"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa
            </button>
          )}
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
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-xs border border-slate-100">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{poi.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {poi.distanceMeters ? `~${poi.distanceMeters}m` : ""}{" "}
                      {poi.durationMinutes ? `· ${poi.durationMinutes}p` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => handleSelectRouteToPoi(poi)}
                    className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-slate-200 hover:bg-indigo-50 shadow-xs transition"
                  >
                    Lộ trình
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPois(pois.filter((p) => p.id !== poi.id));
                      setRoutes(routes.filter((r) => r.toId !== poi.id && r.toName !== poi.name));
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                    title="Xóa tiện ích này"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
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
          onClick={onBack}
          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition"
        >
          Tiếp tục: Kịch bản video <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
