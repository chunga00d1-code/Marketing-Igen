import { CheckCircle2, Download, Film, Loader2, RefreshCw, X } from "lucide-react";
import type { RealEstateMapRenderPublic } from "../../../services/realEstateMapVideoService";
import { realEstateMapVideoService } from "../../../services/realEstateMapVideoService";

interface RealEstateMapRenderModalProps {
  show: boolean;
  onClose: () => void;
  activeRender: RealEstateMapRenderPublic | null;
}

export function RealEstateMapRenderModal({
  show,
  onClose,
  activeRender,
}: RealEstateMapRenderModalProps) {
  if (!show || !activeRender) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-indigo-400" />
            <h3 className="font-bold text-sm">Đang tạo Video Bất Động Sản</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
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
                  onClick={onClose}
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
  );
}
