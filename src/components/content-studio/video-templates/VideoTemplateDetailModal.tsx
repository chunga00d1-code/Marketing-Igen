import React, { useEffect, useState, useRef } from 'react';
import { X, Clock, Eye, Play, Loader2 } from 'lucide-react';
import { VideoTemplateDetail, VideoTemplateAspectRatio } from '../../../types/video-template';
import { videoTemplateService } from '../../../services/videoTemplateService';
import { toast } from '../../../pages/Toast';

interface VideoTemplateDetailModalProps {
  template: VideoTemplateDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectEditMode: (
    projectId?: string,
    mediaUrl?: string,
    title?: string,
    aspectRatio?: VideoTemplateAspectRatio,
    duration?: number
  ) => void;
}

export function VideoTemplateDetailModal({
  template,
  isOpen,
  onClose,
  onSelectEditMode,
}: VideoTemplateDetailModalProps) {
  const [isUsingQuick, setIsUsingQuick] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Reset video error when template changes
  useEffect(() => {
    setVideoError(false);
  }, [template?.id]);

  // Lock background scroll and manage focus
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';

      // Focus modal container
      const timer = setTimeout(() => {
        modalRef.current?.focus();
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
      triggerElementRef.current?.focus();
    }
  }, [isOpen]);

  // Handle Keyboard Navigation (Escape to close, Tab for focus trap)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !template) return null;

  const handleUseNow = async () => {
    setIsUsingQuick(true);
    try {
      const result = await videoTemplateService.useTemplate(template.id, { mode: 'editor' });
      toast.success('Đã nạp mẫu vào Trình chỉnh sửa video CapCut.');
      onClose();
      onSelectEditMode(
        result.project.id,
        template.previewVideoUrl || template.thumbnailUrl,
        template.title,
        template.aspectRatio,
        template.duration
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Không xác định';
      toast.error(`Lỗi khi tạo dự án: ${errorMsg}`);
    } finally {
      setIsUsingQuick(false);
    }
  };

  const getAspectRatioClass = () => {
    switch (template.aspectRatio) {
      case '16:9':
        return 'aspect-16/9';
      case '1:1':
        return 'aspect-square';
      case '9:16':
      default:
        return 'aspect-9/16 max-h-[70vh]';
    }
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog Container */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-10 flex flex-col md:flex-row w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-scale-in focus:outline-none"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng modal"
          className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/60 text-white backdrop-blur-md transition-all hover:bg-slate-900 hover:scale-105 cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Left Side: Video Preview with Fallback */}
        <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 relative min-h-[280px]">
          <div className={`relative w-full ${getAspectRatioClass()} overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-black flex items-center justify-center`}>
            {template.previewVideoUrl && !videoError ? (
              <video
                src={template.previewVideoUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                onError={() => setVideoError(true)}
                className="h-full w-full object-contain"
              />
            ) : (
              <img
                src={template.thumbnailUrl}
                alt={template.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </div>

        {/* Right Side: Details & Actions */}
        <div className="flex flex-1 flex-col justify-between p-6 overflow-y-auto max-h-[90vh] bg-slate-50/50">
          <div className="flex flex-col gap-4">
            {/* Header info */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                  {template.category.name}
                </span>
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {template.aspectRatio}
                </span>
              </div>
              <h2 id="modal-title" className="text-xl font-bold text-slate-900 leading-snug">
                {template.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {template.description}
              </p>
            </div>

            {/* Metrics Chips */}
            <div className="flex items-center gap-4 py-2 border-y border-slate-200/80 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-cyan-600" />
                Thời lượng: <strong className="text-slate-900">{template.duration} giây</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-emerald-600" />
                Lượt dùng: <strong className="text-slate-900">{template.usageCount.toLocaleString('vi-VN')}</strong>
              </span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {template.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>

          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={isUsingQuick}
              onClick={handleUseNow}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-cyan-600 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isUsingQuick ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Dùng mẫu này
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
