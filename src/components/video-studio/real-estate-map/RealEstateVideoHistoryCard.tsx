import { useRef, useState } from "react";
import { Download, Loader2, Play, RefreshCw } from "lucide-react";
import type { RealEstateMapRenderPublic } from "../../../services/realEstateMapVideoService";

export function RealEstateVideoHistoryCard({
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
