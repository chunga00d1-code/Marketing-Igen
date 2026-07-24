import React, { useState } from 'react';
import {
  Play,
  Pause,
  Pencil,
  MinusCircle,
  PlusCircle,
  Maximize2,
  Monitor,
  Sparkles,
  RefreshCw,
  Music,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { TemplateEditorProject, MediaAsset } from './types';
import { toast } from '../../pages/Toast';
import { buildTimelineTicks, getThumbnailFrameCount } from './timeline-scale';

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
  onSelectSidebarTab?: (tab: 'media') => void;
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
  onSelectSidebarTab,
}: TemplateEditorTimelineProps) {
  const [timelineZoom, setTimelineZoom] = useState(100);

  const selectedItem = project.items.find((i) => i.id === selectedItemId) || null;
  const isVideoSelected = selectedItem && selectedItem.type === 'video';

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

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(clickX / rect.width, 1));
    onSeek(Math.min(project.duration, percent * timelineEnd));
  };

  const videoItems = project.items
    .filter((i) => i.trackId === 'track-video')
    .sort((a, b) => a.start - b.start);

  const audioItem = project.items.find((i) => i.type === 'audio');

  const handleBatchReplace = () => {
    const replaceableItems = project.items.filter((i) => i.replaceable || i.type === 'video');
    if (replaceableItems.length === 0) {
      toast.info('Không có clip nào có thể thay thế.');
      return;
    }
    if (onSelectSidebarTab) {
      onSelectSidebarTab('media');
    }
    toast.info('Đã mở tab Phương tiện. Nhấp chọn tệp ảnh/video để thay thế hàng loạt.');
  };

  return (
    <div className="h-52 shrink-0 bg-white border-t border-slate-200 flex flex-col select-none z-20 shadow-lg">
      {/* 1. TOP CONTROL BAR (MATCHING CAPCUT SCREENSHOT) */}
      <div className="h-10 shrink-0 border-b border-slate-200/80 px-4 flex items-center justify-between bg-slate-50/90 text-slate-800 text-xs">
        {/* Left Section: Magic Icon, Separator, Thay thế hàng loạt */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="Hiệu ứng mẫu"
            className="p-1.5 hover:bg-slate-200/70 rounded-lg text-slate-700 transition-colors cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-slate-800" />
          </button>

          <div className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            onClick={handleBatchReplace}
            className="inline-flex items-center gap-1.5 font-bold text-slate-900 hover:text-cyan-600 transition-colors cursor-pointer px-1 py-0.5 rounded"
          >
            <RefreshCw className="h-4 w-4 text-slate-800" />
            <span>Thay thế hàng loạt</span>
          </button>
        </div>

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

        {/* Right Section: Timeline Zoom Slider, Fit Canvas, Fullscreen */}
        <div className="flex items-center gap-3 text-slate-600">
          {/* Item Quick Controls (Delete / Duplicate / Reorder) */}
          {selectedItem && (
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

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTimelineZoom((z) => Math.max(50, z - 15))}
              className="hover:text-slate-900 cursor-pointer"
            >
              <MinusCircle className="h-4 w-4" />
            </button>
            <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                style={{ width: `${((timelineZoom - 50) / 100) * 100}%` }}
                className="bg-slate-600 h-full"
              />
            </div>
            <button
              type="button"
              onClick={() => setTimelineZoom((z) => Math.min(150, z + 15))}
              className="hover:text-slate-900 cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <button type="button" title="Fit canvas" className="hover:text-slate-900 cursor-pointer">
            <Maximize2 className="h-4 w-4" />
          </button>
          <button type="button" title="Toàn màn hình" className="hover:text-slate-900 cursor-pointer">
            <Monitor className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. TIMELINE MAIN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative bg-slate-100/60">
        {/* Left Header Column: "Thêm ảnh bìa" matching screenshot */}
        <div className="w-24 shrink-0 border-r border-slate-200/90 bg-slate-50/90 flex flex-col items-center justify-start pt-6 select-none z-20">
          <button
            type="button"
            onClick={() => toast.info('Đã mở hộp thoại chọn ảnh bìa video.')}
            className="group flex flex-col items-center justify-center gap-1.5 h-16 w-16 rounded-xl border border-slate-300 bg-white hover:border-cyan-400 hover:bg-cyan-50/50 transition-all cursor-pointer shadow-2xs"
          >
            <Pencil className="h-4 w-4 text-slate-700 group-hover:text-cyan-600" />
            <span className="text-[10px] font-bold text-slate-800 group-hover:text-cyan-700 leading-tight text-center px-1">
              Thêm ảnh bìa
            </span>
          </button>
        </div>

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
            <div className="absolute -top-1 -left-1.5 h-4 w-3.5 rounded-b-md bg-slate-950 border border-white shadow-md flex items-center justify-center">
              <div className="h-2 w-0.5 bg-white/70" />
            </div>
          </div>

          {/* Time Ruler (00:00, 00:05, 00:10, 00:15, 00:20) */}
          <div className="h-6 shrink-0 border-b border-slate-200/80 bg-slate-100 relative px-2 text-[10px] font-mono text-slate-400 select-none">
            {timelineTicks.map((tick) => (
              <span
                key={tick}
                style={{ left: `${(tick / timelineEnd) * 100}%` }}
                className="absolute top-1 -translate-x-1/2 border-l border-slate-300 pl-1"
              >
                {`00:${Math.floor(tick).toString().padStart(2, '0')}`}
              </span>
            ))}
          </div>

          {/* VIDEO TRACK (Clips stacked side by side with thumbnails & Replace pill) */}
          <div className="h-16 shrink-0 relative flex items-center my-1 px-1">
            {videoItems.map((item, _idx) => {
              const isSelected = selectedItemId === item.id;
              const itemWidthPercent = (item.duration / timelineEnd) * 100;
              const itemStartPercent = (item.start / timelineEnd) * 100;

              return (
                <div
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItem(item.id);
                  }}
                  style={{
                    left: `${itemStartPercent}%`,
                    width: `${itemWidthPercent}%`,
                  }}
                  className={`group absolute h-12 rounded-xl border overflow-hidden cursor-pointer transition-all flex items-center justify-between shadow-xs ${
                    isSelected
                      ? 'border-2 border-emerald-400 ring-2 ring-emerald-300/50 z-20'
                      : 'border-slate-300/80 hover:border-emerald-400'
                  }`}
                >
                  {/* Background repeating filmstrip thumbnails */}
                  <div className="absolute inset-0 bg-slate-950 overflow-hidden flex">
                    {Array.from({ length: getThumbnailFrameCount(item.duration) }).map((_, frameIndex) => (
                      item.type === 'video' && item.sourceUrl ? (
                        <video
                          key={frameIndex}
                          src={item.sourceUrl}
                          muted
                          playsInline
                          preload="metadata"
                          aria-hidden="true"
                          onLoadedMetadata={(event) => {
                            const video = event.currentTarget;
                            const frameCount = getThumbnailFrameCount(item.duration);
                            const targetTime = Math.min(
                              Math.max(0, video.duration - 0.05),
                              ((frameIndex + 0.5) / frameCount) * Math.min(item.duration, video.duration)
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

                  {/* Duration Tag (Bottom Left - e.g. 5.1s, 12.3s) */}
                  <div className="absolute bottom-1.5 left-2 z-10 text-[10px] font-extrabold text-white bg-black/60 px-1.5 py-0.5 rounded-md backdrop-blur-xs font-mono shadow-xs">
                    {item.duration}s
                  </div>

                  {/* Floating "Thay thế" Pill Button in the middle (Matching CapCut screenshot) */}
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item.id);
                        if (onSelectSidebarTab) {
                          onSelectSidebarTab('media');
                        }
                        toast.info(`Đã chọn "${item.label || 'Clip'}". Hãy nhấp chọn một tệp ở tab Phương tiện để thay thế.`);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-white/90 hover:bg-white text-slate-900 font-bold text-[10px] px-2.5 py-1 shadow-md backdrop-blur-xs transition-transform active:scale-95 border border-slate-200 cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3 text-slate-800" />
                      Thay thế
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AUDIO TRACK (Bright Emerald Green Waveform Bar matching screenshot) */}
          <div className="h-8 shrink-0 relative flex items-center px-1 my-0.5">
            <div
              style={{
                left: `${((audioItem?.start || 0) / timelineEnd) * 100}%`,
                width: `${Math.min(100, ((audioItem?.duration || project.duration) / timelineEnd) * 100)}%`,
              }}
              className="absolute h-6 rounded-lg bg-emerald-500 border border-emerald-600/80 shadow-xs overflow-hidden flex items-center px-2.5 text-white font-bold text-[10px] gap-2"
            >
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-700/80 text-white">
                <Music className="h-3 w-3" />
              </div>
              <span className="truncate drop-shadow-xs font-sans">
                {audioItem?.label || 'Nhạc trong mẫu'}
              </span>

              {/* Simulated Audio Waveform spikes overlay (Red/Orange ticks matching CapCut) */}
              <div className="absolute inset-0 flex items-center justify-around opacity-30 pointer-events-none">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    style={{ height: `${(i % 5) * 20 + 20}%` }}
                    className={`w-0.5 rounded-full ${i % 3 === 0 ? 'bg-amber-300' : 'bg-white'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
