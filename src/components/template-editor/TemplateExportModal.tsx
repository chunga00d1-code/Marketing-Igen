import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, Sparkles, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '../../pages/Toast';
import {
  videoProjectRenderService,
  type VideoProjectRenderDetail,
  type VideoProjectRenderResolution,
} from '../../services/videoProjectRenderService';
import {
  createRenderPollingController,
  type RenderPollingController,
} from '../../services/renderPollingController';
import type { ShortVideoReplacementIssue } from './template-editor-replacement';
import { requestTemplateExport } from './template-editor-export';

interface TemplateExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  projectId?: string;
  onEnsureAutosave: () => Promise<void>;
  validationIssues: ShortVideoReplacementIssue[];
}

export function TemplateExportModal({
  isOpen,
  onClose,
  projectTitle,
  projectId,
  onEnsureAutosave,
  validationIssues,
}: TemplateExportModalProps) {
  const [resolution, setResolution] = useState<VideoProjectRenderResolution>('1080p');
  const [render, setRender] = useState<VideoProjectRenderDetail | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startingRef = useRef(false);
  const pollerRef = useRef<RenderPollingController | null>(null);
  const isMountedRef = useRef(true);

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

  const startPolling = (targetProjectId: string, renderId: string) => {
    stopPoller();
    pollerRef.current = createRenderPollingController({
      intervalMs: 2000,
      fetchDetail: (signal) =>
        videoProjectRenderService.getRender(targetProjectId, renderId, signal),
      onUpdate: (detail) => {
        if (!isMountedRef.current) return;
        setRender(detail);

        if (detail.status === 'completed') {
          stopPoller();
          toast.success(`Đã xuất video (${detail.resolution}) thành công!`);
        } else if (detail.status === 'failed') {
          stopPoller();
          setErrorMsg(detail.errorMessage || 'Xuất video thất bại.');
          toast.error(detail.errorMessage || 'Xuất video thất bại.');
        }
      },
      onError: () => {
        // Ignored temporary poll errors
      },
    });

    pollerRef.current.start();
  };

  // Check active jobs when modal opens
  useEffect(() => {
    if (!isOpen || !projectId) {
      stopPoller();
      return;
    }

    let cancelled = false;

    const checkExisting = async () => {
      try {
        const history = await videoProjectRenderService.listRenders(projectId);
        if (cancelled || !isMountedRef.current) return;

        const items = history.items;
        if (items.length > 0) {
          const active = items.find(
            (r) => r.status === 'queued' || r.status === 'rendering' || r.status === 'uploading'
          );
          if (active) {
            setRender(active);
            startPolling(projectId, active.id);
          } else if (!render) {
            const latest = items[0];
            if (latest.status === 'completed' || latest.status === 'failed') {
              setRender(latest);
            }
          }
        }
      } catch {
        // Ignored
      }
    };

    void checkExisting();

    return () => {
      cancelled = true;
      stopPoller();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const isExporting =
    render && (render.status === 'queued' || render.status === 'rendering' || render.status === 'uploading');

  const handleStartExport = async () => {
    if (!projectId) {
      toast.error('Chưa chọn dự án để xuất video.');
      return;
    }

    if (startingRef.current || isExporting || isStarting) {
      return;
    }

    startingRef.current = true;
    setIsStarting(true);
    setErrorMsg(null);

    try {
      const created = await requestTemplateExport({
        validationIssues,
        ensureAutosave: onEnsureAutosave,
        createRender: () => {
          const uuid =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `${Date.now()}${Math.random().toString(36).slice(2, 11)}`;
          const idempotencyKey = `export_${uuid.replaceAll('-', '')}`;
          return videoProjectRenderService.createRender(projectId, resolution, idempotencyKey);
        },
      });

      if (!isMountedRef.current) return;

      setRender(created);
      setIsStarting(false);

      if (created.status === 'completed') {
        toast.success(`Đã xuất video (${created.resolution}) thành công!`);
      } else if (created.status === 'failed') {
        setErrorMsg(created.errorMessage || 'Xuất video thất bại.');
        toast.error(created.errorMessage || 'Xuất video thất bại.');
      } else {
        startPolling(projectId, created.id);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setIsStarting(false);
      const msg = err instanceof Error ? err.message : 'Không thể khởi tạo bản kết xuất video.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      startingRef.current = false;
    }
  };

  const renderStatusLabel = () => {
    if (!render) return null;
    switch (render.status) {
      case 'queued':
        return 'Đang xếp hàng';
      case 'rendering':
        return 'Đang dựng video';
      case 'uploading':
        return 'Đang lưu video';
      case 'completed':
        return 'Hoàn thành';
      case 'failed':
        return 'Xuất video thất bại';
    }
  };

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

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
            <Download className="h-5 w-5 text-cyan-600" />
            Xuất Video
          </div>
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

        {/* Body */}
        <div className="mt-4 flex flex-col gap-4">
          {isStarting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <Loader2 className="h-10 w-10 text-cyan-500 animate-spin" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-slate-900">Đang lưu thay đổi và khởi tạo tiến trình...</p>
                <p className="text-xs text-slate-500">Vui lòng chờ trong giây lát.</p>
              </div>
            </div>
          ) : isExporting ? (
            <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
              <div className="relative flex items-center justify-center">
                <Loader2 className="h-12 w-12 text-cyan-500 animate-spin" />
                <span className="absolute text-xs font-extrabold text-slate-900">{render.progress}%</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-slate-900">{renderStatusLabel()}</p>
                <p className="text-xs text-slate-500">
                  {render.stageMessage || 'Bạn có thể đóng cửa sổ này, video vẫn tiếp tục được xuất ở nền.'}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200 mt-1">
                <div
                  style={{ width: `${render.progress}%` }}
                  className="bg-gradient-to-r from-cyan-500 to-indigo-600 h-full transition-all duration-300"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  stopPoller();
                  onClose();
                }}
                className="mt-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-4 py-2 cursor-pointer transition-all"
              >
                Đóng (Tiếp tục xuất ở nền)
              </button>
            </div>
          ) : render?.status === 'completed' && render.outputUrl ? (
            <div className="flex flex-col items-center justify-center py-4 gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-slate-900">Xuất video thành công!</p>
                <p className="text-xs text-slate-500">Độ phân giải: {render.resolution}</p>
              </div>

              {/* Video Preview */}
              <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-black aspect-video flex items-center justify-center">
                <video src={render.outputUrl} controls className="w-full h-full object-contain" />
              </div>

              <div className="flex gap-3 w-full mt-2">
                <a
                  href={render.outputUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 cursor-pointer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Mở tab mới
                </a>
                <a
                  href={render.outputUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-2.5 shadow-md transition-all cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Tải video
                </a>
              </div>

              <button
                type="button"
                onClick={() => setRender(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer mt-1"
              >
                Xuất lại bản mới
              </button>
            </div>
          ) : (
            <>
              {validationIssues.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Video thay thế “{validationIssues[0].label}” chỉ dài{' '}
                    {validationIssues[0].sourceDuration}s, ngắn hơn thời lượng nguồn cần có{' '}
                    {validationIssues[0].requiredDuration}s (gồm phần cắt và đoạn mẫu). Hãy chọn
                    video đủ dài trước khi xuất.
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Tên dự án</label>
                <input
                  type="text"
                  disabled
                  value={projectTitle}
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Độ phân giải</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution('720p')}
                    className={`rounded-xl py-2 px-3 text-xs font-bold border transition-all cursor-pointer ${
                      resolution === '720p'
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-300 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    720p HD (Nhanh)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolution('1080p')}
                    className={`rounded-xl py-2 px-3 text-xs font-bold border transition-all cursor-pointer ${
                      resolution === '1080p'
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-300 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    1080p Full HD (Khuyên dùng)
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Định dạng xuất</label>
                <input
                  type="text"
                  disabled
                  value="MP4 (Shotstack Video Render Engine)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"
                />
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    stopPoller();
                    onClose();
                  }}
                  className="flex-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isStarting || validationIssues.length > 0}
                  onClick={handleStartExport}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs py-2.5 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Bắt đầu xuất video
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
