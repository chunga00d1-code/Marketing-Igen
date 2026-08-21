import {
  ArrowLeft,
  Loader2,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import type {
  RealEstateMapSceneSnapshot,
} from "../../../services/realEstateMapVideoService";
import type { BoundaryTheme } from "./map-video.types";

interface RealEstateMapStep3ScriptProps {
  boundaryTheme: BoundaryTheme;
  setBoundaryTheme: (theme: BoundaryTheme) => void;
  showRadiusPulse: boolean;
  setShowRadiusPulse: (show: boolean) => void;
  showAnimatedRoutes: boolean;
  setShowAnimatedRoutes: (show: boolean) => void;
  isPlaying3DCamera: boolean;
  handlePlay3DCameraTour: () => void;
  showSafeArea: boolean;
  setShowSafeArea: (show: boolean) => void;
  isLoadingSnapshot: boolean;
  snapshotData: RealEstateMapSceneSnapshot | null;
  handleLoadSnapshot: () => Promise<void>;
  isRendering: boolean;
  handleStartRender: () => Promise<void>;
  onBack: () => void;
}

export function RealEstateMapStep3Script({
  boundaryTheme,
  setBoundaryTheme,
  showRadiusPulse,
  setShowRadiusPulse,
  showAnimatedRoutes,
  setShowAnimatedRoutes,
  isPlaying3DCamera,
  handlePlay3DCameraTour,
  showSafeArea,
  setShowSafeArea,
  isLoadingSnapshot,
  snapshotData,
  handleLoadSnapshot,
  isRendering,
  handleStartRender,
  onBack,
}: RealEstateMapStep3ScriptProps) {
  return (
    <div className="space-y-3.5">
      <div>
        <h2 className="text-xs font-bold text-slate-900">
          Bước 3: Hiệu ứng VFX & Kịch bản 3D
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Bản đồ 3D góc nghiêng, viền LED Neon & kịch bản AI
        </p>
      </div>

      {/* Tùy chỉnh VFX Style */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
        <label className="block text-[11px] font-bold text-slate-800">
          🎨 Phong cách ánh sáng Neon:
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: "cyan-neon", label: "Xanh Cyan Neon", color: "bg-cyan-500", desc: "Hiện đại, sắc nét" },
            { id: "gold-luxury", label: "Vàng Hoàng Kim", color: "bg-amber-500", desc: "Sang trọng, đẳng cấp" },
            { id: "emerald", label: "Xanh Sinh Thái", color: "bg-emerald-500", desc: "Xanh lá, thiên nhiên" },
            { id: "ruby", label: "Đỏ Ruby", color: "bg-rose-500", desc: "Nổi bật, thu hút" },
          ].map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setBoundaryTheme(theme.id as BoundaryTheme)}
              className={`flex items-center gap-2 rounded-xl p-2 text-left text-xs transition border ${
                boundaryTheme === theme.id
                  ? "border-indigo-500 bg-white shadow-xs ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className={`h-3.5 w-3.5 rounded-full ${theme.color} shrink-0 shadow-xs`} />
              <div className="min-w-0">
                <p className="font-bold text-[11px] text-slate-900 truncate">{theme.label}</p>
                <p className="text-[9px] text-slate-500 truncate">{theme.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Các nút bật/tắt VFX Layer */}
        <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-800">
            ✨ Hiệu ứng hình ảnh (VFX Layers):
          </label>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setShowRadiusPulse(!showRadiusPulse)}
              className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 font-semibold transition border ${
                showRadiusPulse
                  ? "border-indigo-200 bg-indigo-50/80 text-indigo-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <span>⭕ Vòng quét Radar</span>
              <span className="text-[10px]">{showRadiusPulse ? "Bật" : "Tắt"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAnimatedRoutes(!showAnimatedRoutes)}
              className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 font-semibold transition border ${
                showAnimatedRoutes
                  ? "border-indigo-200 bg-indigo-50/80 text-indigo-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <span>🛣️ Tuyến đường sáng</span>
              <span className="text-[10px]">{showAnimatedRoutes ? "Bật" : "Tắt"}</span>
            </button>
          </div>
        </div>

        {/* Nút Chạy thử Camera 3D */}
        <div className="pt-1 flex gap-1.5">
          <button
            type="button"
            onClick={handlePlay3DCameraTour}
            disabled={isPlaying3DCamera}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <Play className="h-3.5 w-3.5 fill-white" />
            {isPlaying3DCamera ? "Đang bay camera 3D..." : "Xem thử Camera 3D"}
          </button>
          <button
            type="button"
            onClick={() => setShowSafeArea(!showSafeArea)}
            className={`flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition border ${
              showSafeArea
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title="Bật/tắt khung Safe Area 9:16 cho TikTok"
          >
            Safe Area
          </button>
        </div>
      </div>

      {isLoadingSnapshot ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 space-y-2">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
          <p className="font-semibold text-slate-700">AI đang phân tích và dựng kịch bản video...</p>
        </div>
      ) : snapshotData?.composition ? (
        <div className="space-y-3">
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
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
          onClick={onBack}
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
  );
}
