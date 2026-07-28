import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Music,
  Lock,
  ArrowLeftRight,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { TemplateEditorProject, MediaAsset } from './types';
import { buildTimelineTicks, getThumbnailFrameCount } from './timeline-scale';
import {
  activateTimelineSegment,
  buildTemplateTimelinePresenter,
  shouldShowDestructiveItemControls,
} from './template-editor-timeline-presenter';
import { browserPreviewSourceForItem } from './template-editor-media';

interface TemplateEditorTimelineProps {
  project: TemplateEditorProject;
  currentTime: number;
  selectedItemId: string | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectItem: (itemId: string | null) => void;
  onSeek: (time: number) => void;
  onRemoveItem: (itemId: string) => void;
  onDuplicateItem: (itemId: string) => void;
  onReorderItem: (itemId: string, direction: 'left' | 'right') => void;
  onToggleReplaceable?: (itemId: string) => void;
  mediaAssets: MediaAsset[];
  onReplaceItemMedia: (itemId: string, asset: MediaAsset) => void;
  onReplaceItemWithFile?: (itemId: string, file: File) => void;
  onSelectSidebarTab?: (tab: 'media') => void;
  onToggleFullscreen?: () => void;
  isFullscreenPreview?: boolean;
}

export function TemplateEditorTimeline({
  project,
  currentTime,
  selectedItemId,
  isPlaying,
  onTogglePlay,
  onSelectItem,
  onSeek,
  onRemoveItem,
  onDuplicateItem,
  onReorderItem,
  onToggleReplaceable: _onToggleReplaceable,
  mediaAssets: _mediaAssets,
  onReplaceItemMedia: _onReplaceItemMedia,
  onReplaceItemWithFile,
  onSelectSidebarTab: _onSelectSidebarTab,
  onToggleFullscreen,
  isFullscreenPreview = false,
}: TemplateEditorTimelineProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingItemId, setReplacingItemId] = useState<string | null>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && replacingItemId) {
      if (onReplaceItemWithFile) {
        onReplaceItemWithFile(replacingItemId, files[0]);
      }
      e.target.value = '';
      setReplacingItemId(null);
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const selectedItem = project.items.find((i) => i.id === selectedItemId) || null;
  const isVideoSelected = selectedItem && selectedItem.type === 'video';
  const showItemQuickControls = shouldShowDestructiveItemControls(selectedItem, project.items);
  const timelinePresenter = buildTemplateTimelinePresenter(project.items);

  // Format time for 00:00:00
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(mins)}:${pad(secs)}:${pad(ms)}`;
  };

  const timelineTicks = buildTimelineTicks(project.duration);
  const timelineEnd = timelineTicks[timelineTicks.length - 1] || project.duration;
  const playheadPercent = timelineEnd > 0 ? (currentTime / timelineEnd) * 100 : 0;
  const visualLaneHeight = 52;
  const visualRowHeight = timelinePresenter.visualLaneCount * visualLaneHeight + 8;
  const timelineHeight = 208 + (timelinePresenter.visualLaneCount - 1) * visualLaneHeight;
  const effectiveTimelineHeight = isCollapsed ? 40 : timelineHeight;

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(clickX / rect.width, 1));
    onSeek(Math.min(project.duration, percent * timelineEnd));
  };

  return (
    <div
      style={{ height: `${effectiveTimelineHeight}px` }}
      className="shrink-0 bg-white border-t border-slate-200 flex flex-col select-none z-20 shadow-lg transition-all duration-300 overflow-hidden"
    >
      {/* Hidden file input for direct replacement from computer */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="video/*,image/*,.mp4,.mov,.webm,.mkv,.avi,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
      />

      {/* 1. TOP CONTROL BAR (MATCHING CAPCUT SCREENSHOT) */}
      <div className="h-10 shrink-0 border-b border-slate-200/80 px-4 flex items-center justify-between bg-slate-50/90 text-slate-800 text-xs">
        {/* Left Spacer */}
        <div className="w-16" />

        {/* Center Section: Black Play Button, Time Display (00:00:00 | 00:17:13) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-white" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-white translate-x-0.5" />
            )}
          </button>

          <div className="font-mono text-xs font-semibold tracking-tight">
            <span className="font-bold text-slate-950">{formatTime(currentTime)}</span>
            <span className="text-slate-300 mx-1.5">|</span>
            <span className="text-slate-400">{formatTime(project.duration)}</span>
          </div>
        </div>

        {/* Right Section: Fit Canvas, Fullscreen */}
        <div className="flex items-center gap-3 text-slate-600">
          {/* Item Quick Controls (Delete / Duplicate / Reorder) */}
          {showItemQuickControls && (
            <div className="flex items-center gap-1 border-r border-slate-200 pr-3 mr-1">
              <button
                type="button"
                onClick={() => selectedItemId && onRemoveItem(selectedItemId)}
                title="Xóa clip"
                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => selectedItemId && onDuplicateItem(selectedItemId)}
                title="Nhân bản clip"
                className="p-1 text-slate-700 hover:bg-slate-200 rounded cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {isVideoSelected && (
                <>
                  <button
                    type="button"
                    onClick={() => selectedItemId && onReorderItem(selectedItemId, 'left')}
                    title="Chuyển sang trái"
                    className="p-1 hover:bg-slate-200 rounded cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedItemId && onReorderItem(selectedItemId, 'right')}
                    title="Chuyển sang phải"
                    className="p-1 hover:bg-slate-200 rounded cursor-pointer"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (onToggleFullscreen) {
                onToggleFullscreen();
              } else {
                toggleFullscreen();
              }
            }}
            title={isFullscreen || isFullscreenPreview ? 'Thoát toàn màn hình' : 'Phóng toàn màn hình'}
            className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-700 transition-colors cursor-pointer"
          >
            {isFullscreen || isFullscreenPreview ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? 'Hiện thanh chỉnh sửa' : 'Cuộn thanh chỉnh sửa xuống'}
            className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-700 transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 2. TIMELINE MAIN WORKSPACE */}
      {!isCollapsed && (
        <div className="flex-1 flex overflow-hidden relative bg-slate-100/60 px-3 md:px-5 py-1">
        {/* Multi-track Canvas Viewport */}
        <div
          onClick={handleRulerClick}
          className="flex-1 relative flex flex-col overflow-x-auto cursor-crosshair select-none"
        >
          {/* Vertical Playhead Line & Capsule Handle */}
          <div
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-slate-950 z-30 pointer-events-none shadow-md"
          >
            <div className="absolute top-0 -left-1.5 h-4.5 w-3.5 rounded-b-md bg-slate-950 border border-white shadow-md flex items-center justify-center">
              <div className="h-2 w-0.5 bg-white/80" />
            </div>
          </div>

          {/* Time Ruler (00:00, 00:05, 00:10, 00:15, 00:20) */}
          <div className="h-6 shrink-0 border-b border-slate-200/80 bg-slate-100 relative px-3 text-[10px] font-mono text-slate-400 select-none">
            {timelineTicks.map((tick, index) => {
              const percent = (tick / timelineEnd) * 100;
              const transformClass = index === 0 ? 'translate-x-0' : index === timelineTicks.length - 1 ? '-translate-x-full' : '-translate-x-1/2';
              return (
                <span
                  key={tick}
                  style={{ left: `${percent}%` }}
                  className={`absolute top-1 border-l border-slate-300/80 pl-1 ${transformClass}`}
                >
                  {`00:${Math.floor(tick).toString().padStart(2, '0')}`}
                </span>
              );
            })}
          </div>

          {/* Simplified visual replacement row */}
          <div
            data-visual-lane-count={timelinePresenter.visualLaneCount}
            style={{ height: `${visualRowHeight}px` }}
            className="shrink-0 relative my-1 px-1"
          >
            {timelinePresenter.visualSegments.map((segment) => {
              const { item } = segment;
              const isSelected = selectedItemId === item.id;
              const itemWidthPercent = (item.duration / timelineEnd) * 100;
              const itemStartPercent = (item.start / timelineEnd) * 100;
              const previewSource = browserPreviewSourceForItem(item, project.previewVideoUrl);
              const isRenderedTemplateFallback = previewSource !== item.sourceUrl;

              return (
                <div
                  key={item.id}
                  data-lane-index={segment.lane}
                  onClick={(e) => {
                    e.stopPropagation();
                    activateTimelineSegment(item, onSelectItem, onSeek);
                  }}
                  style={{
                    left: `${itemStartPercent}%`,
                    width: `${itemWidthPercent}%`,
                    top: `${segment.lane * visualLaneHeight + 4}px`,
                  }}
                  className={`group absolute h-12 rounded-xl border overflow-hidden cursor-pointer transition-all flex items-center justify-between shadow-xs ${
                    isSelected
                      ? 'border-2 border-emerald-400 ring-2 ring-emerald-300/50 z-20'
                      : 'border-slate-300/80 hover:border-emerald-400'
                  }`}
                >
                  <div className="absolute inset-0 flex overflow-hidden bg-slate-950">
                    {Array.from({ length: getThumbnailFrameCount(item.duration) }).map((_, frameIndex) => (
                      item.type === 'video' && previewSource ? (
                        <video
                          key={frameIndex}
                          src={previewSource}
                          muted
                          playsInline
                          preload="metadata"
                          aria-hidden="true"
                          onLoadedMetadata={(event) => {
                            const video = event.currentTarget;
                            const frameCount = getThumbnailFrameCount(item.duration);
                            const frameRatio = (frameIndex + 0.5) / frameCount;
                            const targetTime = Math.min(
                              Math.max(0, video.duration - 0.05),
                              isRenderedTemplateFallback
                                ? item.start + frameRatio * item.duration
                                : frameRatio * Math.min(item.duration, video.duration)
                            );
                            if (Number.isFinite(targetTime)) video.currentTime = targetTime;
                          }}
                          className="pointer-events-none h-full min-w-0 flex-1 bg-black object-contain opacity-95"
                        />
                      ) : (
                        <img
                          key={frameIndex}
                          src={item.thumbnailUrl || item.sourceUrl}
                          alt=""
                          className="h-full min-w-0 flex-1 bg-black object-contain opacity-95"
                        />
                      )
                    ))}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                  </div>

                  <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-2.5 py-1 text-white">
                    <span className="truncate text-[10px] font-extrabold">{segment.label}</span>
                    <span className="shrink-0 rounded bg-black/55 px-1.5 font-mono text-[9px] font-bold">
                      {item.duration}s
                    </span>
                  </div>

                  <div className="absolute inset-0 z-10 flex items-center justify-center pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        activateTimelineSegment(item, onSelectItem, onSeek);
                        setReplacingItemId(item.id);
                        fileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-white/90 hover:bg-white text-slate-900 font-bold text-[10px] px-2.5 py-1 shadow-md backdrop-blur-xs transition-transform active:scale-95 border border-slate-200 cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3 text-slate-800" />
                      Thay thế
                    </button>
                  </div>

                  {segment.transitionLabel && (
                    <div
                      title={segment.transitionLabel}
                      aria-label={`Chuyển cảnh: ${segment.transitionLabel}`}
                      className="absolute right-0 top-1/2 z-20 flex h-5 w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-violet-300 bg-violet-600 text-white shadow-md"
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Locked template soundtrack row */}
          <div className="h-8 shrink-0 relative flex items-center px-1 my-0.5">
            {timelinePresenter.audioSegments.map((segment) => (
              <div
                key={segment.item.id}
                style={{
                  left: `${(segment.item.start / timelineEnd) * 100}%`,
                  width: `${(segment.item.duration / timelineEnd) * 100}%`,
                }}
                aria-label={segment.locked ? `${segment.label} · Đã khóa` : segment.label}
                className="absolute flex h-6 items-center gap-2 overflow-hidden rounded-lg border border-emerald-600/80 bg-emerald-500 px-2.5 text-[10px] font-bold text-white shadow-xs"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700/80 text-white">
                  <Music className="h-3 w-3" />
                </div>
                <span className="truncate drop-shadow-xs font-sans">{segment.label}</span>
                {segment.locked && (
                  <Lock className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
                )}

                <div className="pointer-events-none absolute inset-0 flex items-center justify-around opacity-30">
                  {Array.from({ length: 60 }).map((_, index) => (
                    <div
                      key={index}
                      style={{ height: `${(index % 5) * 20 + 20}%` }}
                      className={`w-0.5 rounded-full ${index % 3 === 0 ? 'bg-amber-300' : 'bg-white'}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>
);
}
