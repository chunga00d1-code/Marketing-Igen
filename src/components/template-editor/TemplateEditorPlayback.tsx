import React from 'react';
import { Play, Pause, Maximize2, Scaling } from 'lucide-react';

interface TemplateEditorPlaybackProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

export function TemplateEditorPlayback({
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
}: TemplateEditorPlaybackProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(mins)}:${pad(secs)}:${pad(ms)}`;
  };

  return (
    <div className="h-12 shrink-0 bg-slate-100 border-t border-slate-200 px-6 flex items-center justify-between select-none z-10">
      {/* Left: Play/Pause button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Tạm dừng' : 'Phát video'}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-white" />
          ) : (
            <Play className="h-4 w-4 fill-white translate-x-0.5" />
          )}
        </button>

        {/* Current Time vs Total Duration Display */}
        <div className="text-xs font-semibold text-slate-700 font-mono tracking-tight">
          <span>{formatTime(currentTime)}</span>
          <span className="text-slate-400 mx-1">|</span>
          <span className="text-slate-500">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Center: Playhead Progress Slider */}
      <div className="flex-1 max-w-xl mx-6 flex items-center">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />
      </div>

      {/* Right: Fullscreen & Fit controls */}
      <div className="flex items-center gap-2 text-slate-600">
        <button
          type="button"
          aria-label="Vừa vặn khung hình"
          className="p-1.5 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
        >
          <Scaling className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Toàn màn hình"
          className="p-1.5 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
