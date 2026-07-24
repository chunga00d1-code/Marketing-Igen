import React, { useState, useRef, useEffect } from 'react';
import { Heart, Play, Clock, Eye, Sparkles, User, Flame } from 'lucide-react';
import { VideoTemplateSummary } from '../../../types/video-template';

interface VideoTemplateCardProps {
  template: VideoTemplateSummary;
  onClick: (template: VideoTemplateSummary) => void;
}

export function VideoTemplateCard({ template, onClick }: VideoTemplateCardProps) {
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

  const shouldPlayPreview = (isHovered || isFocused) && !!template.previewVideoUrl && !videoError && !prefersReducedMotion.current;

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

  // Determine aspect ratio class
  const getAspectRatioClass = () => {
    switch (template.aspectRatio) {
      case '16:9':
        return 'aspect-16/9';
      case '1:1':
        return 'aspect-square';
      case '9:16':
      default:
        return 'aspect-9/16';
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
      onBlur={() => setIsFocused(false)}
      className="group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer select-none"
    >
      {/* Media Container */}
      <div className={`relative w-full ${getAspectRatioClass()} rounded-xl bg-slate-900 overflow-hidden`}>
        {/* Thumbnail Image */}
        <img
          src={template.thumbnailUrl}
          alt={template.title}
          className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            shouldPlayPreview && !isVideoLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
        />

        {/* Video Preview */}
        {template.previewVideoUrl && !videoError && (
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
          {template.badges?.includes('mine') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              <User className="h-2.5 w-2.5" />
              Mẫu của tôi
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
