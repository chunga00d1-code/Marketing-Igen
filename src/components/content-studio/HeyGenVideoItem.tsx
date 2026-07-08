import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, LoaderCircle, Pencil, Play, Trash2 } from "lucide-react";
import { heygenApi } from "../../api/heygen";
import { HEYGEN_THEME } from "./heygenTheme";
import { toast } from "../../pages/Toast";

function isPlayableVideoUrl(url?: string | null) {
  const value = String(url || "").trim();
  return value.startsWith("http://") || value.startsWith("https://");
}

function usePseudoProgress(createdAt?: string, status?: string) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const normalizedStatus = String(status || "").toLowerCase();
    if (normalizedStatus === "completed") {
      setProgress(100);
      return;
    }
    if (["failed", "error", "canceled"].includes(normalizedStatus)) {
      setProgress(0);
      return;
    }

    const calculate = () => {
      if (!createdAt) return 0;
      const elapsedSec = (Date.now() - new Date(createdAt).getTime()) / 1000;
      if (elapsedSec <= 10) return 10;
      if (elapsedSec <= 30) return Math.min(95, Math.round(10 + (elapsedSec - 10) * 1.5));
      if (elapsedSec <= 60) return Math.min(95, Math.round(40 + (elapsedSec - 30)));
      if (elapsedSec <= 120) return Math.min(95, Math.round(70 + (elapsedSec - 60) * 0.3));
      return Math.min(95, Math.round(88 + (elapsedSec - 120) * 0.1));
    };

    setProgress(calculate());
    const interval = window.setInterval(() => setProgress(calculate()), 1000);
    return () => window.clearInterval(interval);
  }, [createdAt, status]);

  return progress;
}

export function HeyGenVideoItem({
  item,
  onPlay,
  onReuse,
  onDelete,
  onStatusUpdate,
}: {
  item: any;
  onPlay: (url: string) => void;
  onReuse: (item: any) => void;
  onDelete: (videoId: string) => void | Promise<void>;
  onStatusUpdate?: (updatedItem: any) => void;
}) {
  const status = String(item.status || "").toLowerCase();
  const isCompleted = status === "completed";
  const isFailed = ["failed", "error", "canceled"].includes(status);
  const isProcessing = !isCompleted && !isFailed;
  const pseudoProgress = usePseudoProgress(item.createdAt, item.status);

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDelete = () => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa video này khỏi lịch sử không?")) {
      return;
    }
    void onDelete(item.videoId || item.id || item._id);
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setIsDownloading(true);
    toast.info("Đang tải xuống video...");
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${item.prompt || "heygen-video"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Tải xuống video thành công!");
    } catch (error) {
      console.error("Direct download failed, opening in new tab:", error);
      window.open(downloadUrl, "_blank");
      toast.warning("Mở video trong tab mới để tải về.");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (!isProcessing || !item.videoId) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await heygenApi.getVideoStatus(item.videoId, {
          avatarId: item.metadata?.heygenAvatarId,
          audioRecordId: item.metadata?.heygenAudioRecordId,
          audioUrl: item.metadata?.heygenAudioUrl,
          aspectRatio: item.metadata?.aspectRatio,
          title: item.metadata?.title,
          description: item.metadata?.description,
        });
        const nextStatus = String(res.jobStatus || "processing").toLowerCase();
        if (nextStatus !== status && onStatusUpdate) {
          onStatusUpdate({
            ...item,
            status: nextStatus,
            url: res.videoUrl || item.url,
            thumbnailUrl: res.thumbnailUrl || item.thumbnailUrl,
            metadata: { ...item.metadata, status: nextStatus },
          });
        }
      } catch (error) {
        console.error("Failed to poll video status:", error);
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [isProcessing, item, onStatusUpdate, status]);

  const downloadUrl = useMemo(() => {
    if (!isCompleted) return "";
    const url = item.url || item.captionedVideoUrl || item.videoPageUrl || "";
    return isPlayableVideoUrl(url) ? url : "";
  }, [item, isCompleted]);

  const badgeClass = isCompleted
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
    : isFailed
      ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
      : "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200";

  let badgeLabel = status;
  if (status === "waiting" || status === "pending") {
    badgeLabel = "Đang chờ hàng đợi";
  } else if (status === "processing" || status === "running") {
    badgeLabel = "Đang xử lý";
  } else if (status === "completed") {
    badgeLabel = "Hoàn thành";
  } else if (status === "failed" || status === "error") {
    badgeLabel = "Thất bại";
  } else if (status === "canceled") {
    badgeLabel = "Đã hủy";
  }

  return (
    <div
      className={`grid gap-5 rounded-[24px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} p-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)] xl:items-stretch`}
    >
      <div className={`overflow-hidden rounded-[24px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} p-3 shadow-sm`}>
        <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_center,#1e2936_0%,#16202b_60%,#0f141b_100%)]">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt={item.title || item.prompt || "HeyGen video"}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 z-10 h-full w-full object-contain bg-transparent"
              style={{ objectPosition: "center top" }}
            />
          ) : downloadUrl ? (
            <video
              src={downloadUrl}
              preload="metadata"
              playsInline
              className="absolute inset-0 z-10 h-full w-full object-contain bg-transparent"
              style={{ objectPosition: "center top" }}
            />
          ) : (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100 p-4 text-center text-cyan-700">
              {isFailed ? (
                <div className="text-xs font-semibold text-rose-600">Thất bại</div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <LoaderCircle className="h-6 w-6 animate-spin text-cyan-600" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Đang xử lý</span>
                  <span className="text-xs font-mono text-cyan-700/80">{pseudoProgress}%</span>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-cyan-500 transition-all duration-1000" style={{ width: `${pseudoProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {isCompleted && downloadUrl ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <button
                type="button"
                onClick={() => onPlay(downloadUrl)}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-white/60 bg-slate-950/35 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-slate-950/50"
              >
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </button>
            </div>
          ) : null}

          {isProcessing && !item.thumbnailUrl ? (
            <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center">
              <span className="rounded-full bg-slate-950/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                Đang render ({pseudoProgress}%)
              </span>
            </div>
          ) : null}

          {isCompleted ? (
            <div className="absolute bottom-3 right-3 z-20 rounded-lg bg-slate-950/65 px-2.5 py-1 text-xs font-semibold text-white">
              {item.duration ? `${Math.max(1, Math.round(item.duration))}s` : "Video"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-6 py-2 xl:pl-2">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="line-clamp-3 text-2xl leading-tight text-slate-900 xl:text-[2.1rem]">
              {item.prompt}
            </p>
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${badgeClass}`}>
              {badgeLabel}
            </span>
          </div>

          <div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className={`rounded-2xl border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-4 py-3`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Thời gian tạo</p>
              <p className="mt-1 break-words text-base font-semibold leading-snug text-slate-700">
                {item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "Chưa có video"}
              </p>
            </div>
      
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <ActionCircle onClick={() => onReuse(item)}>
              <Pencil className="h-4 w-4" />
            </ActionCircle>

            {downloadUrl ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className={`flex h-10 w-10 items-center justify-center rounded-full border ${HEYGEN_THEME.border} bg-white text-slate-600 transition hover:text-slate-900 disabled:opacity-50`}
                title="Tai video"
              >
                {isDownloading ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" /> : <Download className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-300"
                title="Video chưa sẵn sàng để tải"
              >
                <Download className="h-4 w-4" />
              </button>
            )}

            <ActionCircle onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </ActionCircle>
          </div>

        </div>
      </div>
    </div>
  );
}

function ActionCircle({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full border ${HEYGEN_THEME.border} bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900`}
    >
      {children}
    </button>
  );
}
