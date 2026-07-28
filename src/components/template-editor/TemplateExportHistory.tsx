import React, { useEffect, useState, useRef } from 'react';
import { X, History, ExternalLink, Download, RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import {
  videoProjectRenderService,
  type VideoProjectRenderDetail,
  type VideoProjectRenderListResponse,
} from '../../services/videoProjectRenderService';
import {
  createRenderPollingController,
  type RenderPollingController,
} from '../../services/renderPollingController';

interface TemplateExportHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

function formatTime(isoString?: string): string {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

function getStatusBadge(status: VideoProjectRenderDetail['status'], progress: number) {
  switch (status) {
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3.5 h-3.5" />
          Đang xếp hàng
        </span>
      );
    case 'rendering':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Đang dựng ({progress}%)
        </span>
      );
    case 'uploading':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Đang lưu ({progress}%)
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Hoàn thành
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
          Xuất thất bại
        </span>
      );
  }
}

export function TemplateExportHistory({ isOpen, onClose, projectId }: TemplateExportHistoryProps) {
  const [renders, setRenders] = useState<VideoProjectRenderDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const pollerRef = useRef<RenderPollingController | null>(null);

  const stopPoller = () => {
    if (pollerRef.current) {
      pollerRef.current.stop();
      pollerRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPoller();
    };
  }, []);

  const startPolling = (targetProjectId: string) => {
    stopPoller();
    setLoading(true);

    pollerRef.current = createRenderPollingController<VideoProjectRenderListResponse>({
      intervalMs: 2000,
      fetchData: (signal) => videoProjectRenderService.listRenders(targetProjectId, signal),
      onUpdate: (res) => {
        if (!isMountedRef.current) return;
        setLoading(false);
        setError(null);
        setRenders(res.items);

        const hasActive = res.items.some(
          (r) => r.status === 'queued' || r.status === 'rendering' || r.status === 'uploading'
        );

        if (!hasActive) {
          stopPoller();
        }
      },
      onError: (err) => {
        if (!isMountedRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Không thể tải lịch sử xuất video.');
      },
    });

    pollerRef.current.start();
  };

  useEffect(() => {
    if (!isOpen || !projectId) {
      stopPoller();
      return;
    }

    startPolling(projectId);

    return () => {
      stopPoller();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={() => {
          stopPoller();
          onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scale-in max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 shrink-0">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
            <History className="h-5 w-5 text-cyan-600" />
            Lịch sử xuất Video
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (projectId) startPolling(projectId);
              }}
              aria-label="Tải lại lịch sử"
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                stopPoller();
                onClose();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-0">
          {loading && renders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
              <p className="text-xs font-semibold">Đang tải lịch sử xuất video...</p>
            </div>
          ) : error && renders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-red-500 gap-2">
              <AlertCircle className="h-8 w-8" />
              <p className="text-xs font-semibold">{error}</p>
            </div>
          ) : renders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <History className="h-10 w-10 stroke-1" />
              <p className="text-xs font-semibold">Chưa có bản xuất video nào.</p>
            </div>
          ) : (
            renders.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 bg-slate-200 px-2 py-0.5 rounded-md">
                      {item.resolution}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {formatTime(item.createdAt)}
                    </span>
                  </div>
                  {getStatusBadge(item.status, item.progress)}
                </div>

                {(item.status === 'queued' || item.status === 'rendering' || item.status === 'uploading') && (
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                    <div
                      style={{ width: `${item.progress}%` }}
                      className="bg-gradient-to-r from-cyan-500 to-indigo-600 h-full transition-all duration-300"
                    />
                  </div>
                )}

                {item.status === 'failed' && item.errorMessage && (
                  <div className="mt-1 p-2 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-100 flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{item.errorMessage}</span>
                  </div>
                )}

                {item.status === 'completed' && item.outputUrl && (
                  <div className="mt-2 flex items-center gap-2 justify-end">
                    <a
                      href={item.outputUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-xs font-bold transition-all"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Xem video
                    </a>
                    <a
                      href={item.outputUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition-all shadow-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Tải về
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
