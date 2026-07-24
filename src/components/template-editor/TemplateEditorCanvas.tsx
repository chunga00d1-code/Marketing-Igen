import React, { useRef, useEffect } from 'react';
import { Volume2, Palette, Layers } from 'lucide-react';
import { TemplateEditorProject, TemplateEditorItem, AspectRatioType } from './types';

interface TemplateEditorCanvasProps {
  project: TemplateEditorProject;
  currentTime: number;
  isPlaying: boolean;
  selectedItem: TemplateEditorItem | null;
  onSelectItem: (itemId: string | null) => void;
  zoomLevel: number;
}

export function TemplateEditorCanvas({
  project,
  currentTime,
  isPlaying,
  selectedItem,
  onSelectItem,
  zoomLevel,
}: TemplateEditorCanvasProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Find current active video/image clip on track-video at playhead time
  const activeMediaItem = project.items.find(
    (item) =>
      item.trackId === 'track-video' &&
      currentTime >= item.start &&
      currentTime <= item.start + item.duration
  );

  // Sync Video Element playback & currentTime with playhead
  useEffect(() => {
    if (!videoRef.current || !activeMediaItem || activeMediaItem.type !== 'video') return;

    const clipRelativeTime = Math.max(0, currentTime - activeMediaItem.start);
    if (Math.abs(videoRef.current.currentTime - clipRelativeTime) > 0.3) {
      videoRef.current.currentTime = clipRelativeTime;
    }

    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [currentTime, isPlaying, activeMediaItem]);

  // Find active text overlays at playhead time
  const activeTextItems = project.items.filter(
    (item) =>
      item.type === 'text' &&
      currentTime >= item.start &&
      currentTime <= item.start + item.duration
  );

  // Get aspect ratio style classes
  const getAspectRatioClass = (ratio: AspectRatioType) => {
    switch (ratio) {
      case '16:9':
        return 'w-[560px] aspect-16/9';
      case '1:1':
        return 'w-[380px] aspect-square';
      case '3:4':
        return 'w-[360px] aspect-3/4';
      case '9:16':
      default:
        return 'w-[310px] aspect-9/16 max-h-[72vh]';
    }
  };

  return (
    <main className="flex-1 bg-slate-100 relative flex items-center justify-center p-6 overflow-hidden select-none">
      {/* Central Preview Box */}
      <div
        style={{ transform: `scale(${zoomLevel / 100})` }}
        className={`relative ${getAspectRatioClass(project.aspectRatio)} rounded-2xl overflow-hidden bg-slate-950 border border-slate-300 shadow-2xl transition-all duration-300 flex items-center justify-center`}
      >
        {/* Media Frame View */}
        {activeMediaItem ? (
          activeMediaItem.type === 'video' ? (
            <video
              ref={videoRef}
              src={activeMediaItem.sourceUrl}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={activeMediaItem.thumbnailUrl || activeMediaItem.sourceUrl}
              alt="Canvas Preview"
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
            <Layers className="h-8 w-8 text-slate-600" />
            <span className="text-xs font-semibold">Khung hình trống</span>
          </div>
        )}

        {/* Text Overlays Layer */}
        {activeTextItems.map((textItem) => {
          const isSelected = selectedItem?.id === textItem.id;
          const style = textItem.style || {
            fontFamily: 'Inter',
            fontSize: 28,
            color: '#00e5ff',
            align: 'center',
            bold: true,
            italic: false,
          };

          return (
            <div
              key={textItem.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(textItem.id);
              }}
              style={{
                left: `${style.x ?? 50}%`,
                top: `${style.y ?? 60}%`,
                transform: 'translate(-50%, -50%)',
                color: style.color,
                fontFamily: style.fontFamily,
                fontSize: `${style.fontSize}px`,
                textAlign: style.align,
                fontWeight: style.bold ? 'bold' : 'normal',
                fontStyle: style.italic ? 'italic' : 'normal',
              }}
              className={`absolute z-20 px-3 py-1.5 rounded cursor-pointer transition-all ${
                isSelected
                  ? 'border-2 border-dashed border-cyan-400 bg-cyan-950/40 shadow-lg ring-2 ring-cyan-500/50'
                  : 'hover:border hover:border-white/50'
              }`}
            >
              <span className="drop-shadow-md select-none">{textItem.text}</span>
            </div>
          );
        })}
      </div>

      {/* Floating Right Control Pills (Âm thanh & Nền matching screenshot) */}
      <div className="absolute right-6 top-6 flex flex-col gap-2 z-20">
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-1 h-14 w-14 rounded-2xl bg-white border border-slate-200/80 shadow-md text-slate-700 hover:text-cyan-600 hover:border-cyan-300 transition-all cursor-pointer"
        >
          <Volume2 className="h-5 w-5" />
          <span className="text-[10px] font-bold">Âm thanh</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-1 h-14 w-14 rounded-2xl bg-white border border-slate-200/80 shadow-md text-slate-700 hover:text-cyan-600 hover:border-cyan-300 transition-all cursor-pointer"
        >
          <Palette className="h-5 w-5" />
          <span className="text-[10px] font-bold">Nền</span>
        </button>
      </div>
    </main>
  );
}
