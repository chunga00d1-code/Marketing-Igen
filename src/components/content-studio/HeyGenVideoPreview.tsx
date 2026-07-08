import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, PointerEvent } from "react";
import { Pause, Play, Plus, Volume2 } from "lucide-react";
import { HEYGEN_THEME } from "./heygenTheme";
import { HeyGenLegacyScriptInput } from "./HeyGenLegacyScriptInput";

interface HeyGenVideoPreviewProps {
  selectedAvatar?: any;
  script: string;
  onScriptChange?: (val: string) => void;
  selectedAvatarModel?: string;
  usePersonalVoiceMode?: boolean;
  enableCaption: boolean;
  setEnableCaption: (value: boolean) => void;
  captionPreset?: "brand" | "clean" | "outline" | "highlight";
  captionFontFamily?: string;
  captionFontSize?: number;
  captionPrimaryColor?: string;
  captionSecondaryColor?: string;
  captionPosition?: "top" | "middle" | "bottom";
  captionOffset: { x: number; y: number };
  setCaptionOffset: (value: { x: number; y: number }) => void;
  avatarLayout: "original" | "circle";
  avatarBackground: "customize" | "remove" | "color";
  backgroundColor: string;
  previewVideoUrl?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

const MOCK_DURATION = 15;
const CAPTION_MAX_WORDS = 5;
const CAPTION_BREAK_PATTERN = /[,.!?;:]\s+/;

function isRenderableVideoUrl(url?: string | null) {
  const value = String(url || "").trim();
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:") ||
    value.startsWith("data:video/")
  );
}

export function HeyGenVideoPreview({
  selectedAvatar,
  script,
  onScriptChange,
  selectedAvatarModel,
  usePersonalVoiceMode = false,
  enableCaption,
  setEnableCaption,
  captionPreset = "brand",
  captionFontFamily = "Georgia, serif",
  captionFontSize = 28,
  captionPrimaryColor = "#9bff4f",
  captionSecondaryColor = "#ffffff",
  captionPosition = "bottom",
  captionOffset,
  setCaptionOffset,
  avatarLayout,
  avatarBackground,
  backgroundColor,
  previewVideoUrl,
  aspectRatio = "16:9",
}: HeyGenVideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const renderablePreviewVideoUrl = isRenderableVideoUrl(previewVideoUrl) ? previewVideoUrl : "";
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  const avatarImage = selectedAvatar?.previewImage;
  const avatarName = selectedAvatar?.name || "Avatar preview";
  const mediaFitClass = avatarLayout === "circle" ? "object-cover" : "object-contain";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewVideoUrl) return;
    video.volume = volume / 100;
    video.playbackRate = playbackSpeed;
  }, [previewVideoUrl, volume, playbackSpeed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewVideoUrl) return;
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [previewVideoUrl]);

  useEffect(() => {
    if (previewVideoUrl || !isPlaying) return;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= MOCK_DURATION) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, previewVideoUrl]);

  const sentences = useMemo(() => {
    if (!script.trim()) return [];

    return script
      .split(CAPTION_BREAK_PATTERN)
      .flatMap((segment) => {
        const words = segment.trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [];

        const chunks: string[] = [];
        for (let index = 0; index < words.length; index += CAPTION_MAX_WORDS) {
          chunks.push(words.slice(index, index + CAPTION_MAX_WORDS).join(" "));
        }
        return chunks;
      })
      .filter(Boolean);
  }, [script]);

  const currentCaption = useMemo(() => {
    if (!enableCaption || sentences.length === 0) return "";
    const activeIndex = Math.min(sentences.length - 1, Math.floor((currentTime / MOCK_DURATION) * sentences.length));
    return sentences[activeIndex];
  }, [currentTime, enableCaption, sentences]);

  const backgroundClass = avatarBackground === "remove" ? "bg-transparent" : avatarBackground === "color" ? "" : "bg-[radial-gradient(circle_at_center,#253140_0%,#161d27_52%,#0c1117_100%)]";
  function togglePlayback() {
    setIsPlaying((prev) => !prev);
    const video = videoRef.current;
    if (!video || !previewVideoUrl) return;
    if (isPlaying) {
      video.pause();
      return;
    }
    void video.play().catch((error) => console.error("Video playback failed", error));
  }

  function formatTime(time: number) {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function renderCaption(captionText: string) {
    const baseStyle: CSSProperties = { fontFamily: captionFontFamily, fontSize: `${captionFontSize}px`, lineHeight: 1.15 };
    if (captionPreset === "clean") {
      return <span style={{ ...baseStyle, color: "#3f3f46", backgroundColor: "rgba(255,255,255,0.92)", padding: "10px 16px", borderRadius: "10px", fontWeight: 500 }}>{captionText}</span>;
    }
    if (captionPreset === "outline") {
      return <span style={{ ...baseStyle, color: captionSecondaryColor, fontWeight: 800, textTransform: "uppercase", textShadow: "-1px -1px 0 #111827, 1px -1px 0 #111827, -1px 1px 0 #111827, 1px 1px 0 #111827, 0 0 12px rgba(0,0,0,0.16)" }}>{captionText}</span>;
    }
    if (captionPreset === "highlight") {
      return <span style={{ ...baseStyle, color: "#111827", background: "linear-gradient(90deg, rgba(56,189,248,0.95) 0%, rgba(255,255,255,0.92) 45%, rgba(255,255,255,0.92) 100%)", padding: "8px 14px", borderRadius: "6px", fontWeight: 700 }}>{captionText}</span>;
    }

    const words = captionText.split(" ");
    const splitIndex = Math.max(1, Math.ceil(words.length / 2));
    return (
      <span style={{ ...baseStyle, color: captionSecondaryColor, fontWeight: 800, fontStyle: "italic", textShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>
        <span style={{ color: captionPrimaryColor }}>{words.slice(0, splitIndex).join(" ")}</span>{" "}
        <span style={{ color: captionSecondaryColor }}>{words.slice(splitIndex).join(" ")}</span>
      </span>
    );
  }

  function handleCaptionPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!stageRef.current) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: captionOffset.x,
      startOffsetY: captionOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCaptionPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!stageRef.current || !dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    const rect = stageRef.current.getBoundingClientRect();
    const deltaXPercent = ((event.clientX - dragStateRef.current.startX) / rect.width) * 100;
    const deltaYPercent = ((event.clientY - dragStateRef.current.startY) / rect.height) * 100;
    setCaptionOffset({
      x: Math.max(12, Math.min(88, dragStateRef.current.startOffsetX + deltaXPercent)),
      y: Math.max(10, Math.min(92, dragStateRef.current.startOffsetY + deltaYPercent)),
    });
  }

  function handleCaptionPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePreviewDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("application/x-heygen-caption")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handlePreviewDrop(event: DragEvent<HTMLDivElement>) {
    if (!stageRef.current || !event.dataTransfer.types.includes("application/x-heygen-caption")) return;
    event.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setEnableCaption(true);
    setCaptionOffset({
      x: Math.max(12, Math.min(88, x)),
      y: Math.max(10, Math.min(92, y)),
    });
  }

  const aspectClass =
    aspectRatio === "9:16"
      ? "aspect-[9/16] max-w-[280px]"
      : aspectRatio === "1:1"
      ? "aspect-square max-w-[420px]"
      : "aspect-[16/9] max-w-[920px]";

  const scriptInputTitle = selectedAvatarModel === "Avatar III"
    ? "KỊCH BẢN PHÁT THANH (AVATAR III)"
    : usePersonalVoiceMode
      ? `KỊCH BẢN TEXT-TO-VOICE (${selectedAvatarModel || "HEYGEN"})`
      : "KỊCH BẢN PHÁT THANH";

  const scriptInputPlaceholder = usePersonalVoiceMode
    ? "Nhập nội dung văn bản để HeyGen My Voice đọc trực tiếp..."
    : "Nhập nội dung văn bản để avatar phát biểu...";

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${HEYGEN_THEME.surface} text-slate-900`}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-50/70 px-4 py-3">
        <div
          ref={stageRef}
          onDragOver={handlePreviewDragOver}
          onDrop={handlePreviewDrop}
          className={`relative ${aspectClass} h-full max-h-[420px] w-full overflow-hidden rounded-[22px] border ${HEYGEN_THEME.border} bg-slate-950 shadow-sm transition-all duration-300`}
        >
          {renderablePreviewVideoUrl ? (
            <video
              ref={videoRef}
              src={renderablePreviewVideoUrl}
              className={`h-full w-full ${mediaFitClass} bg-transparent`}
              style={{ objectPosition: "center top" }}
              onClick={togglePlayback}
              playsInline
              crossOrigin="anonymous"
            />
          ) : (
            <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${backgroundClass}`} style={{ backgroundColor: avatarBackground === "color" ? backgroundColor : undefined }}>
              {avatarImage ? (
                <div className={`relative overflow-hidden transition-all duration-300 ${avatarLayout === "circle" ? "h-36 w-36 rounded-full border-4 border-cyan-400/50 shadow-md" : "h-full w-full"}`}>
                  <img src={avatarImage} alt={avatarName} loading="eager" decoding="async" className={`h-full w-full ${mediaFitClass} bg-transparent`} style={{ objectPosition: "center top" }} />
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-400">Chọn Avatar để bắt đầu xem trước</div>
              )}
            </div>
          )}

          {enableCaption && currentCaption ? (
            <div
              role="button"
              tabIndex={0}
              onPointerDown={handleCaptionPointerDown}
              onPointerMove={handleCaptionPointerMove}
              onPointerUp={handleCaptionPointerUp}
              onPointerCancel={handleCaptionPointerUp}
              className="absolute z-20 w-[82%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none text-center active:cursor-grabbing"
              style={{ left: `${captionOffset.x}%`, top: `${captionOffset.y}%` }}
              title="Kéo thả caption"
            >
              <div className="rounded-xl border border-cyan-300/70 bg-cyan-50/30 px-3 py-2 shadow-sm backdrop-blur-[1px]">
                {renderCaption(currentCaption)}
              </div>
            </div>
          ) : null}
          {!previewVideoUrl ? <div className="absolute left-4 top-4 rounded bg-slate-900/75 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white">Preview Mode</div> : null}
        </div>
      </div>

      <div className={`flex items-center justify-between border-t ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-4 py-2.5`}>
        <div className="flex items-center gap-4">
          <button type="button" onClick={togglePlayback} className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-600 text-white shadow-sm transition-all duration-200 hover:scale-105 hover:bg-cyan-500">
            {isPlaying ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />}
          </button>
          <span className="font-mono text-xs font-medium text-slate-500">{formatTime(currentTime)} / {formatTime(MOCK_DURATION)}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tốc độ</span>
            <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className={`rounded-lg border ${HEYGEN_THEME.border} bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none`}>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-slate-400" />
            <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(parseInt(e.target.value, 10))} className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-cyan-500" />
          </div>
        </div>
      </div>
      
      {selectedAvatarModel === "Avatar III" || usePersonalVoiceMode ? (
        <HeyGenLegacyScriptInput
          value={script}
          onChange={onScriptChange || (() => {})}
          title={scriptInputTitle}
          placeholder={scriptInputPlaceholder}
        />
      ) : null}

      <div className={`space-y-2 border-t ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} p-3`}>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Các phân cảnh</h4>
        <div className="flex items-center gap-3 overflow-x-auto py-1">
          <div className={`relative flex h-20 w-36 shrink-0 flex-col overflow-hidden rounded-xl border-2 border-cyan-400 ${HEYGEN_THEME.surface} shadow-sm`}>
            {avatarImage ? <img src={avatarImage} alt="Scene thumbnail" loading="lazy" decoding="async" className="h-13 w-full object-contain bg-white" style={{ objectPosition: "center top" }} /> : <div className="flex h-13 w-full items-center justify-center bg-slate-100 text-[10px] text-slate-400">No avatar</div>}
            <div className={`flex flex-1 items-center justify-between px-2.5 text-[9px] font-bold text-slate-500 ${HEYGEN_THEME.surfaceMuted}`}>
              <span>Cảnh 1</span>
              <span>{MOCK_DURATION}s</span>
            </div>
          </div>

          <button type="button" className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} text-slate-400 transition-all duration-200 hover:border-cyan-400 hover:text-cyan-700 hover:bg-white`}>
            <Plus className="h-4 w-4" />
            <span className="text-[9px] font-bold">Thêm cảnh</span>
          </button>
        </div>
      </div>
    </div>
  );
}
