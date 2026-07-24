import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, Sparkles } from 'lucide-react';
import { toast } from '../../pages/Toast';

interface TemplateExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
}

export function TemplateExportModal({ isOpen, onClose, projectTitle }: TemplateExportModalProps) {
  const [videoName, setVideoName] = useState(projectTitle);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setVideoName(projectTitle);
  }, [projectTitle]);

  if (!isOpen) return null;

  const handleStartExport = () => {
    setIsExporting(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsExporting(false);
            toast.success(`Đã kết xuất video "${videoName}" (${resolution}) thành công!`);
            onClose();
          }, 400);
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={isExporting ? undefined : onClose} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
            <Download className="h-5 w-5 text-cyan-600" />
            Xuất Video
          </div>
          {!isExporting && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="mt-4 flex flex-col gap-4">
          {isExporting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="relative flex items-center justify-center">
                <Loader2 className="h-12 w-12 text-cyan-500 animate-spin" />
                <span className="absolute text-xs font-extrabold text-slate-900">{progress}%</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-slate-900">Đang tổng hợp các phân cảnh video...</p>
                <p className="text-xs text-slate-500">Vui lòng không đóng trình duyệt trong khi xuất.</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200 mt-2">
                <div
                  style={{ width: `${progress}%` }}
                  className="bg-gradient-to-r from-cyan-500 to-indigo-600 h-full transition-all duration-200"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Tên video kết xuất</label>
                <input
                  type="text"
                  value={videoName}
                  onChange={(e) => setVideoName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-cyan-500 focus:outline-none"
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
                  value="MP4 (H.264 / AAC)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"
                />
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs py-2.5 shadow-md transition-all active:scale-95 cursor-pointer"
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
