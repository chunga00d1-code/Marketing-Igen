import React, { useState, useRef, useEffect } from 'react';
import { Heart, Play, Clock, Eye, Sparkles, Flame, Loader2, AlertCircle } from 'lucide-react';
import { VideoTemplateSummary } from '../../../types/video-template';

interface VideoTemplateCardProps {
  template: VideoTemplateSummary;
  onClick: (template: VideoTemplateSummary) => void;
  aspectRatioOverride?: string;
}

export function VideoTemplateCard({ template, onClick, aspectRatioOverride }: VideoTemplateCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(template.isFavorite);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Check prefers-reduced-motion
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const isReady = template.previewStatus === 'ready';
  const isFailed = template.previewStatus === 'failed';
  const isPending = template.previewStatus === 'pending' || (!isReady && !isFailed);
  const shouldPlayPreview = (isHovered || isFocused) && isReady && !!template.previewVideoUrl && !videoError && !prefersReducedMotion.current;

  useEffect(() => {
    if (shouldPlayPreview && videoRef.current) {
      setIsVideoLoading(true);
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsVideoLoading(false);
          })
          .catch(() => {
            setVideoError(true);
            setIsVideoLoading(false);
          });
      }
    } else if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [shouldPlayPreview]);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFavorite(!isFavorite);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(template);
    }
  };

  // Determine aspect ratio class (defaults to 16:9 when override provided or requested)
  const getAspectRatioClass = () => {
    const targetRatio = aspectRatioOverride || '16:9';
    switch (targetRatio) {
      case '16:9':
        return 'aspect-16/9';
      case '1:1':
        return 'aspect-square';
      case '9:16':
        return 'aspect-9/16';
      case 'auto':
      default:
        switch (template.aspectRatio) {
          case '16:9':
            return 'aspect-16/9';
          case '1:1':
            return 'aspect-square';
          case '9:16':
          default:
            return 'aspect-9/16';
        }
    }
  };

  const formatUsage = (count: number) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return count.toString();
  };

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Mẫu video: ${template.title}`}
      onClick={() => onClick(template)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      className="group relative flex flex-col h-fit rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer select-none"
    >
      {/* Media Container */}
      <div className={`relative w-full ${getAspectRatioClass()} rounded-xl bg-slate-900 overflow-hidden`}>
        {/* Thumbnail Image */}
        <img
          src={template.thumbnailUrl}
          alt={template.title}
          onError={(e) => {
            const title = template.title || 'Mẫu video';
            const colors = [
              ['#4f46e5', '#06b6d4'],
              ['#0f172a', '#0891b2'],
              ['#7c3aed', '#ec4899'],
              ['#059669', '#0e7490'],
              ['#ea580c', '#ca8a04'],
            ];
            const charSum = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const [c1, c2] = colors[Math.abs(charSum) % colors.length];
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><rect y="500" width="600" height="300" fill="#020617" opacity="0.65"/><text x="40" y="680" fill="white" font-family="system-ui, sans-serif" font-size="40" font-weight="bold">${title}</text></svg>`;
            e.currentTarget.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
          }}
          className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            shouldPlayPreview && !isVideoLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
        />

        {/* Video Preview */}
        {isReady && template.previewVideoUrl && !videoError && (
          <video
            ref={videoRef}
            src={template.previewVideoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              shouldPlayPreview && !isVideoLoading ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Failed Preview State */}
        {isFailed && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 text-center z-10">
            <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-rose-300 border border-rose-500/30">
              <AlertCircle className="h-3 w-3 text-rose-400" />
              <span>Không thể tạo bản xem trước</span>
            </div>
          </div>
        )}

        {/* Pending Preview State */}
        {isPending && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 text-center z-10">
            <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-amber-300 border border-amber-500/30">
              <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
              <span>Đang tạo bản xem trước…</span>
            </div>
          </div>
        )}

        {/* Gradient Overlay for Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 pointer-events-none" />

        {/* Badges - Top Left */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1 items-center z-10">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white border border-white/20">
            {template.aspectRatio}
          </span>
          {template.badges?.includes('new') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              <Sparkles className="h-2.5 w-2.5" />
              Mới
            </span>
          )}
          {template.badges?.includes('popular') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              <Flame className="h-2.5 w-2.5" />
              Hot
            </span>
          )}
        </div>

        {/* Favorite Button - Top Right */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          aria-label={isFavorite ? 'Bỏ yêu thích' : 'Yêu thích mẫu'}
          className={`absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-all z-10 ${
            isFavorite
              ? 'bg-rose-500 text-white shadow-md'
              : 'bg-black/40 text-white/80 hover:bg-black/70 hover:text-white'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-white' : ''}`} />
        </button>

        {/* Play Icon Indicator on Hover */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 backdrop-blur-md text-white border border-white/40 shadow-lg opacity-0 transform scale-75 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100">
            <Play className="h-4 w-4 fill-white translate-x-0.5" />
          </div>
        </div>

        {/* Duration & Usage Count - Bottom Overlay */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-semibold text-white/95 z-10">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-xs px-1.5 py-0.5">
            <Clock className="h-3 w-3 text-cyan-400" />
            {template.duration}s
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-xs px-1.5 py-0.5">
            <Eye className="h-3 w-3 text-emerald-400" />
            {formatUsage(template.usageCount)}
          </span>
        </div>
      </div>

      {/* Card Info */}
      <div className="mt-2.5 flex flex-col gap-1 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
          {template.category.name}
        </span>
        <h3 className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">
          {template.title}
        </h3>
        <p className="text-[11px] text-slate-500 line-clamp-1">
          {template.description}
        </p>
      </div>
    </div>
  );
}
