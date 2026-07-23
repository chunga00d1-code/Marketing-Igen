import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, X, XCircle } from 'lucide-react';
import type { BulkRenderJob, BulkRenderItem } from '../../../services/bulkCreateService';

const STATUS_LABELS: Record<string, string> = {
  queued: 'Đang chờ',
  processing: 'Đang tạo',
  completed: 'Hoàn thành',
  partial: 'Hoàn thành một phần',
  failed: 'Có lỗi',
  cancelled: 'Đã hủy',
};

interface JobPanelProps {
  activeJob: BulkRenderJob | null;
  jobItems: BulkRenderItem[];
  jobs: BulkRenderJob[];
  onDownloadJob: (job: BulkRenderJob) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onOpenJob: (job: BulkRenderJob) => void;
}

export function JobPanel({
  activeJob,
  jobItems,
  jobs,
  onDownloadJob,
  onRetryJob,
  onCancelJob,
  onOpenJob,
}: JobPanelProps) {
  const [viewingImage, setViewingImage] = useState<{ url: string; number: number } | null>(null);

  useEffect(() => {
    if (!viewingImage) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewingImage(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [viewingImage]);

  return (
    <>
      <div className="space-y-4">
      {activeJob && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-slate-900">{activeJob.templateName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {activeJob.completedItems}/{activeJob.totalItems} ảnh hoàn thành
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-bold ${
                activeJob.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : activeJob.status === 'failed'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {STATUS_LABELS[activeJob.status] || activeJob.status}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full bg-indigo-600" style={{ width: `${activeJob.progress}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['completed', 'partial'].includes(activeJob.status) && (
              <button
                type="button"
                onClick={() => onDownloadJob(activeJob)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white"
              >
                <Download className="h-4 w-4" /> Tải tất cả ảnh
              </button>
            )}
            {activeJob.failedItems > 0 && (
              <button
                type="button"
                onClick={() => onRetryJob(activeJob._id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold"
              >
                <RefreshCw className="h-4 w-4" /> Tạo lại ảnh lỗi
              </button>
            )}
            {['queued', 'processing'].includes(activeJob.status) && (
              <button
                type="button"
                onClick={() => onCancelJob(activeJob._id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-600"
              >
                <XCircle className="h-4 w-4" /> Hủy
              </button>
            )}
          </div>
        </div>
      )}

      {jobItems.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-extrabold text-slate-700">Ảnh kết quả</p>
          <div className="grid grid-cols-2 gap-2">
            {jobItems.map((item) => (
              <div key={item._id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {item.outputUrl ? (
                  <button
                    type="button"
                    onClick={() => setViewingImage({ url: item.outputUrl!, number: item.rowIndex + 1 })}
                    className="block w-full cursor-zoom-in"
                    title={`Xem ảnh ${item.rowIndex + 1}`}
                  >
                    <img
                      src={item.outputUrl}
                      alt={`Kết quả ${item.rowIndex + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-square items-center justify-center p-2 text-center text-xs text-rose-600">
                    {item.errorMessage || STATUS_LABELS[item.status] || item.status}
                  </div>
                )}
                <div className="px-2 py-1.5 text-xs font-bold">Ảnh {item.rowIndex + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-extrabold text-slate-700">Lịch sử</p>
        {jobs.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
            Chưa có lần tạo ảnh nào.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <button
                key={job._id}
                type="button"
                onClick={() => onOpenJob(job)}
                className={`w-full rounded-xl border p-3 text-left ${
                  activeJob?._id === job._id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">{job.templateName}</span>
                  <span className="text-xs text-slate-500">{job.progress}%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {job.completedItems}/{job.totalItems} thành công · {job.failedItems} lỗi
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      {viewingImage && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Xem ảnh ${viewingImage.number}`}
          className="fixed inset-0 z-[10020] flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setViewingImage(null);
          }}
        >
          <button
            type="button"
            onClick={() => setViewingImage(null)}
            className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-100"
            title="Đóng"
            aria-label="Đóng ảnh"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={viewingImage.url}
            alt={`Ảnh kết quả ${viewingImage.number}`}
            className="max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] cursor-default object-contain shadow-2xl"
          />
        </div>,
        document.body
      )}
    </>
  );
}
