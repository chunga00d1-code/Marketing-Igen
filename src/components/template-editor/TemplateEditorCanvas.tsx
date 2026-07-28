import React, { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX, Layers } from 'lucide-react';
import { TemplateEditorProject, TemplateEditorItem, AspectRatioType } from './types';
import { findActiveVisualItems } from './template-editor-selection';
import { browserPreviewSourceForItem } from './template-editor-media';
import { toast } from '../../pages/Toast';

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
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const [isMuted, setIsMuted] = useState(false);

  // Shotstack tracks can contain simultaneous background and overlay media.
  const activeMediaItems = findActiveVisualItems(project.items, currentTime);

  // Find active audio items at playhead time
  const activeAudioItems = project.items.filter(
    (item) =>
      item.type === 'audio' &&
      !!item.sourceUrl &&
      currentTime >= item.start &&
      currentTime <= item.start + item.duration
  );

  // Sync every active video layer with the editor playhead.
  useEffect(() => {
    for (const item of activeMediaItems) {
      if (item.type !== 'video') continue;
      const video = videoRefs.current.get(item.id);
      if (!video) continue;
      const previewSource = browserPreviewSourceForItem(item, project.previewVideoUrl);
      const isRenderedTemplateFallback = previewSource !== item.sourceUrl;
      const clipRelativeTime = isRenderedTemplateFallback
        ? currentTime
        : Math.max(0, currentTime - item.start + (item.trim || 0));
      if (Math.abs(video.currentTime - clipRelativeTime) > 0.3) {
        video.currentTime = clipRelativeTime;
      }
      video.volume = isMuted ? 0 : (item.volume ?? 1);
      video.muted = isMuted || (item.volume === 0);
      if (isPlaying) {
        video.play().catch(() => {
          // Fallback to muted play if browser unmuted autoplay policy triggers
          video.muted = true;
          video.play().catch(() => {});
        });
      } else {
        video.pause();
      }
    }
  }, [currentTime, isPlaying, activeMediaItems, project.previewVideoUrl, isMuted]);

  // Sync active audio tracks with the editor playhead.
  useEffect(() => {
    for (const item of activeAudioItems) {
      const audio = audioRefs.current.get(item.id);
      if (!audio) continue;
      const clipRelativeTime = Math.max(0, currentTime - item.start + (item.trim || 0));
      if (Math.abs(audio.currentTime - clipRelativeTime) > 0.3) {
        audio.currentTime = clipRelativeTime;
      }
      audio.volume = isMuted ? 0 : (item.volume ?? 1);
      audio.muted = isMuted || (item.volume === 0);
      if (isPlaying) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }
  }, [currentTime, isPlaying, activeAudioItems, isMuted]);

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
        return 'w-[520px] max-w-[85vw] aspect-16/9 max-h-[52vh]';
      case '1:1':
        return 'w-[360px] max-w-[80vw] aspect-square max-h-[52vh]';
      case '3:4':
        return 'w-[330px] max-w-[75vw] aspect-3/4 max-h-[58vh]';
      case '9:16':
      default:
        return 'w-[280px] max-w-[70vw] aspect-9/16 max-h-[62vh]';
    }
  };

  return (
    <main className="flex-1 bg-slate-100 relative flex items-center justify-center p-6 overflow-hidden select-none">
      {/* Hidden Audio Elements */}
      {activeAudioItems.map((audioItem) => (
        <audio
          key={audioItem.id}
          ref={(element) => {
            if (element) audioRefs.current.set(audioItem.id, element);
            else audioRefs.current.delete(audioItem.id);
          }}
          src={audioItem.sourceUrl}
          preload="auto"
        />
      ))}

      {/* Central Preview Box */}
      <div
        style={{ transform: `scale(${zoomLevel / 100})` }}
        className={`relative ${getAspectRatioClass(project.aspectRatio)} rounded-2xl overflow-hidden bg-slate-950 border border-slate-300 shadow-2xl transition-all duration-300 flex items-center justify-center`}
      >
        {/* Media Frame View */}
        {activeMediaItems.length > 0 ? (
          activeMediaItems.map((item, layerIndex) => {
            const previewSource = browserPreviewSourceForItem(item, project.previewVideoUrl);
            const mediaStyle: React.CSSProperties = {
              zIndex: layerIndex + 1,
              opacity: item.opacity ?? 1,
              transform: `rotate(${item.rotation || 0}deg) scale(${item.scale || 1})`,
              objectFit: item.fitMode === 'fit' ? 'contain' : 'cover',
            };
            return item.type === 'video' ? (
              <video
                key={item.id}
                ref={(element) => {
                  if (element) videoRefs.current.set(item.id, element);
                  else videoRefs.current.delete(item.id);
                }}
                src={previewSource}
                muted={isMuted || item.volume === 0}
                playsInline
                onClick={() => onSelectItem(item.id)}
                style={mediaStyle}
                className="absolute inset-0 h-full w-full cursor-pointer"
              />
            ) : (
              <img
                key={item.id}
                src={item.thumbnailUrl || item.sourceUrl}
                alt={item.label || 'Canvas Preview'}
                onClick={() => onSelectItem(item.id)}
                style={mediaStyle}
                className="absolute inset-0 h-full w-full cursor-pointer"
              />
            );
          })
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

      {/* Floating Right Control Pill (Âm thanh - Bật / Tắt âm thanh) */}
      <div className="absolute right-6 top-6 flex flex-col gap-2 z-20">
        <button
          type="button"
          onClick={() => {
            setIsMuted((prev) => {
              const next = !prev;
              toast.info(next ? 'Đã tắt âm thanh' : 'Đã bật âm thanh');
              return next;
            });
          }}
          title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          className={`group flex flex-col items-center justify-center gap-1 h-14 w-14 rounded-2xl border shadow-md transition-all cursor-pointer ${
            isMuted
              ? 'bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100'
              : 'bg-white border-slate-200/80 text-slate-700 hover:text-cyan-600 hover:border-cyan-300'
          }`}
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          <span className="text-[10px] font-bold">{isMuted ? 'Tắt âm' : 'Âm thanh'}</span>
        </button>
      </div>
    </main>
  );
}
