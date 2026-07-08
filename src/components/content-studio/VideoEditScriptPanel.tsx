import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Film, Loader2, Sparkles, Play, ChevronDown, ChevronUp, Scissors, Zap,
  Settings2, Check, X, Video, MessageSquareText,
  Layers, LayoutTemplate, UploadCloud, Link2, FileVideo
} from 'lucide-react';
import { geminiApi } from '../../api/gemini';
import { toast } from '../../pages/Toast';
import { socketService } from '../../services/socketService';

// ─── Types (mirror server types) ───────────────────────────────────────────

interface TextOverlay {
  content: string;
  position: 'top-center' | 'center' | 'bottom-center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  color?: string;
  fontSize?: string;
}

interface MotionGraphicInsert {
  template: 'lower_third' | 'badge' | 'title_card' | 'highlight_box';
  title: string;
  subtitle?: string;
  accentColor?: string;
}

interface AnimatedSceneInsert {
  template: 'chapter_title' | 'stat_reveal' | 'kinetic_text' | 'quote_card';
  duration: number;
  title?: string;
  subtitle?: string;
  value?: string;
  label?: string;
  quote?: string;
  author?: string;
  chapter?: string;
  accentColor?: string;
}

interface SegmentEdit {
  segmentId: string;
  label: string;
  startTime: number;
  endTime: number;
  contentSummary: string;
  transcriptText?: string;
  keep: boolean;
  playbackRate: number;
  filters?: { brightness?: number; contrast?: number; saturate?: number; grayscale?: number };
  effects?: { zoom?: 'in' | 'out' | 'none'; transition?: string; objectFit?: 'contain' | 'cover' };
  textOverlays?: TextOverlay[];
  captionText?: string;
  motionGraphic?: MotionGraphicInsert;
  insertAnimatedScene?: AnimatedSceneInsert;
  editNotes: string;
}

interface VideoEditScript {
  videoUrl: string;
  totalDuration: number;
  globalSettings: {
    aspectRatio: string;
    resolution: string;
    musicGenre: string;
    musicVolume: number;
    overallStyle: string;
  };
  segments: SegmentEdit[];
  analysisNotes: string;
  generatedAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const TRANSITION_OPTS = [
  { value: 'none', label: 'Cắt thẳng' },
  { value: 'fade', label: 'Fade mờ' },
  { value: 'slide-left', label: 'Trượt trái' },
  { value: 'slide-right', label: 'Trượt phải' },
  { value: 'slide-up', label: 'Trượt lên' },
  { value: 'slide-down', label: 'Trượt xuống' },
  { value: 'zoom-in', label: 'Zoom vào' },
  { value: 'zoom-out', label: 'Zoom ra' },
  { value: 'flash', label: 'Flash' },
];

const SPEED_OPTS = [
  { value: 0.5, label: '0.5×' },
  { value: 0.75, label: '0.75×' },
  { value: 1.0, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 2.0, label: '2×' },
];

const MG_TEMPLATES = [
  { value: 'lower_third', label: 'Lower Third' },
  { value: 'badge', label: 'Badge' },
  { value: 'title_card', label: 'Title Card' },
  { value: 'highlight_box', label: 'Highlight Box' },
];

const AS_TEMPLATES = [
  { value: 'chapter_title', label: 'Tiêu đề chương' },
  { value: 'stat_reveal', label: 'Số liệu nổi bật' },
  { value: 'kinetic_text', label: 'Kinetic Text' },
  { value: 'quote_card', label: 'Quote Card' },
];

const MUSIC_OPTS = [
  { value: 'none', label: 'Không nhạc' },
  { value: 'upbeat', label: 'Upbeat' },
  { value: 'tech', label: 'Tech' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'lofi', label: 'Lo-fi' },
  { value: 'acoustic', label: 'Acoustic' },
];

// ─── Segment Card ──────────────────────────────────────────────────────────

function SegmentCard({
  seg,
  idx,
  onChange,
}: {
  seg: SegmentEdit;
  idx: number;
  onChange: (updated: SegmentEdit) => void;
  // eslint-disable-next-line react/no-unused-prop-types
  key?: React.Key;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMG, setShowMG] = useState(!!seg.motionGraphic);
  const [showAS, setShowAS] = useState(!!seg.insertAnimatedScene);
  const [showNotes, setShowNotes] = useState(false);

  const update = (patch: Partial<SegmentEdit>) => onChange({ ...seg, ...patch });
  const updateEffects = (patch: Partial<SegmentEdit['effects']>) =>
    update({ effects: { ...seg.effects, ...patch } });

  const renderDuration = (seg.endTime - seg.startTime) / (seg.playbackRate || 1);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${seg.keep ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50 opacity-60'}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Keep/Cut toggle */}
        <button
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${seg.keep ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-red-100 text-red-400 hover:bg-red-200'}`}
          onClick={e => { e.stopPropagation(); update({ keep: !seg.keep }); }}
          title={seg.keep ? 'Đang giữ — nhấn để bỏ' : 'Đang bỏ — nhấn để giữ'}
        >
          {seg.keep ? <Check size={14} /> : <X size={14} />}
        </button>

        {/* Segment info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-mono text-gray-400">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className="font-semibold text-gray-800 truncate">{seg.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400">
              {formatTime(seg.startTime)} → {formatTime(seg.endTime)}
            </span>
            <span className="text-xs text-indigo-500">
              ≈ {renderDuration.toFixed(1)}s kết xuất
            </span>
            {seg.playbackRate !== 1 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{seg.playbackRate}×</span>
            )}
            {seg.effects?.transition && seg.effects.transition !== 'none' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{seg.effects.transition}</span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </div>

      {/* Expanded edit area */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Content summary */}
          {seg.contentSummary && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{seg.contentSummary}</p>
          )}

          {/* Row 1: Speed + Transition + Zoom */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tốc độ</label>
              <div className="flex flex-wrap gap-1">
                {SPEED_OPTS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => update({ playbackRate: o.value })}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${seg.playbackRate === o.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Chuyển cảnh tiếp theo</label>
              <select
                value={seg.effects?.transition || 'none'}
                onChange={e => updateEffects({ transition: e.target.value })}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
              >
                {TRANSITION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Zoom</label>
              <div className="flex gap-1">
                {(['none', 'in', 'out'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => updateEffects({ zoom: v })}
                    className={`flex-1 px-2 py-1 text-xs rounded-md border transition-colors ${(seg.effects?.zoom || 'none') === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                  >
                    {v === 'none' ? 'Không' : v === 'in' ? 'Vào' : 'Ra'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
              <MessageSquareText size={12} />
              Phụ đề đoạn này
            </label>
            <input
              type="text"
              value={seg.captionText || ''}
              onChange={e => update({ captionText: e.target.value || undefined })}
              placeholder={seg.transcriptText ? seg.transcriptText.slice(0, 60) + '...' : 'Nhập phụ đề (để trống nếu không cần)'}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white placeholder-gray-300"
            />
          </div>

          {/* Motion Graphic */}
          <div>
            <button
              onClick={() => {
                setShowMG(v => !v);
                if (showMG) update({ motionGraphic: undefined });
                else update({ motionGraphic: { template: 'lower_third', title: '', accentColor: '#FFD700' } });
              }}
              className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors"
            >
              <Layers size={13} />
              {showMG ? 'Bỏ motion graphic' : '+ Thêm motion graphic'}
            </button>

            {showMG && seg.motionGraphic && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Template</label>
                  <select
                    value={seg.motionGraphic.template}
                    onChange={e => update({ motionGraphic: { ...seg.motionGraphic!, template: e.target.value as any } })}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                  >
                    {MG_TEMPLATES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Tiêu đề</label>
                  <input
                    type="text"
                    value={seg.motionGraphic.title}
                    onChange={e => update({ motionGraphic: { ...seg.motionGraphic!, title: e.target.value } })}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5"
                    placeholder="Text chính"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Màu accent</label>
                  <input
                    type="color"
                    value={seg.motionGraphic.accentColor || '#FFD700'}
                    onChange={e => update({ motionGraphic: { ...seg.motionGraphic!, accentColor: e.target.value } })}
                    className="w-full h-8 border border-gray-200 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Animated Scene */}
          <div>
            <button
              onClick={() => {
                setShowAS(v => !v);
                if (showAS) update({ insertAnimatedScene: undefined });
                else update({ insertAnimatedScene: { template: 'chapter_title', duration: 3.0, title: '', accentColor: '#FFD700' } });
              }}
              className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-purple-600 transition-colors"
            >
              <LayoutTemplate size={13} />
              {showAS ? 'Bỏ animated scene' : '+ Chèn animated scene sau đoạn này'}
            </button>

            {showAS && seg.insertAnimatedScene && (
              <div className="mt-2 space-y-2 bg-purple-50 border border-purple-100 rounded-lg p-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Template</label>
                    <select
                      value={seg.insertAnimatedScene.template}
                      onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, template: e.target.value as any } })}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                    >
                      {AS_TEMPLATES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Thời lượng (giây)</label>
                    <input
                      type="number"
                      min={2}
                      max={6}
                      step={0.5}
                      value={seg.insertAnimatedScene.duration}
                      onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, duration: Number(e.target.value) } })}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Màu accent</label>
                    <input
                      type="color"
                      value={seg.insertAnimatedScene.accentColor || '#FFD700'}
                      onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, accentColor: e.target.value } })}
                      className="w-full h-8 border border-gray-200 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Template-specific fields */}
                {seg.insertAnimatedScene.template === 'chapter_title' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Tiêu đề *" value={seg.insertAnimatedScene.title || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, title: e.target.value } })} className="text-xs border border-gray-200 rounded px-2 py-1.5" />
                    <input type="text" placeholder="Phụ đề" value={seg.insertAnimatedScene.subtitle || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, subtitle: e.target.value } })} className="text-xs border border-gray-200 rounded px-2 py-1.5" />
                  </div>
                )}
                {seg.insertAnimatedScene.template === 'stat_reveal' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Số liệu * (vd: 81+)" value={seg.insertAnimatedScene.value || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, value: e.target.value } })} className="text-xs border border-gray-200 rounded px-2 py-1.5" />
                    <input type="text" placeholder="Nhãn * (vd: VIDEOS/THÁNG)" value={seg.insertAnimatedScene.label || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, label: e.target.value } })} className="text-xs border border-gray-200 rounded px-2 py-1.5" />
                  </div>
                )}
                {seg.insertAnimatedScene.template === 'kinetic_text' && (
                  <input type="text" placeholder="Câu/cụm từ ngắn *" value={seg.insertAnimatedScene.title || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, title: e.target.value } })} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5" />
                )}
                {seg.insertAnimatedScene.template === 'quote_card' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Nội dung trích dẫn *" value={seg.insertAnimatedScene.quote || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, quote: e.target.value } })} className="text-xs border border-gray-200 rounded px-2 py-1.5" />
                    <input type="text" placeholder="Tác giả" value={seg.insertAnimatedScene.author || ''} onChange={e => update({ insertAnimatedScene: { ...seg.insertAnimatedScene!, author: e.target.value } })} className="text-xs border border-gray-200 rounded px-2 py-1.5" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI edit notes */}
          {seg.editNotes && (
            <div>
              <button onClick={() => setShowNotes(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Ghi chú AI
              </button>
              {showNotes && (
                <p className="mt-1.5 text-xs text-gray-500 italic bg-yellow-50 border border-yellow-100 rounded p-2">{seg.editNotes}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Upload helper ──────────────────────────────────────────────────────────

async function uploadVideoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const response = await fetch('/api/v1/media/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify({ file: reader.result, folder: 'igen_erp/marketing' }),
        });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
        const json = await response.json();
        resolve(json.url);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
  });
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration || 0); };
    video.onerror = () => resolve(0);
  });
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export function VideoEditScriptPanel({
  initialVideoUrl,
  initialDuration,
  onRenderStarted,
}: {
  initialVideoUrl?: string;
  initialDuration?: number;
  onRenderStarted?: (record: any) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Input source: 'file' = local file, 'url' = URL text
  const [inputMode, setInputMode] = useState<'file' | 'url'>(initialVideoUrl ? 'url' : 'file');
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl || '');
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const [prompt, setPrompt] = useState('');
  const [script, setScript] = useState<VideoEditScript | null>(null);
  const [generating, setGenerating] = useState(false);

  // Render progress state
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderLog, setRenderLog] = useState('');
  const [renderStatus, setRenderStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle');
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  const unsubRenderRef = useRef<(() => void) | null>(null);

  // Sync initialVideoUrl when coming from prompt mode
  useEffect(() => {
    if (initialVideoUrl && initialVideoUrl !== videoUrl) {
      setVideoUrl(initialVideoUrl);
      setInputMode('url');
      if (initialDuration) setDuration(initialDuration);
    }
  }, [initialVideoUrl, initialDuration]);

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) onFileSelected(file);
  }, []);

  const onFileSelected = useCallback(async (file: File) => {
    setLocalFile(file);
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl(preview);
    const dur = await getVideoDuration(file);
    if (dur > 0) setDuration(Math.round(dur));
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  const clearFile = () => {
    setLocalFile(null);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resolveVideoUrl = async (): Promise<string> => {
    if (inputMode === 'url') {
      if (!videoUrl.trim()) throw new Error('Vui lòng nhập URL video');
      return videoUrl.trim();
    }
    if (!localFile) throw new Error('Vui lòng chọn file video');
    setUploading(true);
    setUploadProgress('Đang tải video lên...');
    try {
      const url = await uploadVideoFile(localFile);
      setVideoUrl(url);
      setUploadProgress('');
      return url;
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const resolvedUrl = await resolveVideoUrl();
      const finalDuration = duration || 30;
      const res = await geminiApi.generateEditScript(resolvedUrl, finalDuration, prompt);
      setScript({ ...res.script, videoUrl: resolvedUrl });
      toast.success(`Đã tạo kịch bản với ${res.script.segments.length} đoạn`);
    } catch (e: any) {
      toast.error(e.message || 'Lỗi tạo kịch bản');
    } finally {
      setGenerating(false);
      setUploading(false);
      setUploadProgress('');
    }
  }, [inputMode, localFile, videoUrl, duration, prompt]);

  const updateSegment = useCallback((idx: number, updated: SegmentEdit) => {
    setScript(prev => {
      if (!prev) return prev;
      const segs = [...prev.segments];
      segs[idx] = updated;
      return { ...prev, segments: segs };
    });
  }, []);

  const updateGlobal = useCallback((patch: Partial<VideoEditScript['globalSettings']>) => {
    setScript(prev => prev ? { ...prev, globalSettings: { ...prev.globalSettings, ...patch } } : prev);
  }, []);

  const handleRender = useCallback(async () => {
    if (!script) return;

    // Clean up any previous subscription
    unsubRenderRef.current?.();
    unsubRenderRef.current = null;

    setRendering(true);
    setRenderProgress(0);
    setRenderLog('Đang xếp hàng kết xuất...');
    setRenderStatus('queued');
    setOutputVideoUrl(null);

    try {
      const res = await geminiApi.renderFromEditScript(
        script,
        script.globalSettings.aspectRatio,
        script.globalSettings.resolution
      );
      onRenderStarted?.(res.record);

      if (res.record?._id) {
        const targetId = res.record._id;
        setRenderLog('Đã xếp hàng — đang chờ worker bắt đầu...');
        setRenderProgress(5);

        const unsub = socketService.onVideoStatusUpdated((data) => {
          if (data.videoId !== targetId) return;

          const record = data.updates?.[data.updates.length - 1];
          const meta = record?.metadata || {};

          // Update progress %
          if (typeof meta.progress === 'number') {
            setRenderProgress(meta.progress);
          }

          // Extract the most recent meaningful log line
          const logs: string[] = meta.renderLogs || [];
          const lastLog = logs[logs.length - 1] || '';
          if (lastLog) setRenderLog(lastLog);

          if (data.status === 'completed' || meta.status === 'completed') {
            setRenderProgress(100);
            setRenderStatus('completed');
            setRendering(false);
            if (record?.url && !record.url.startsWith('pending://')) {
              setOutputVideoUrl(record.url);
            }
            toast.success('Video đã kết xuất xong!');
            unsub();
            unsubRenderRef.current = null;
          } else if (data.status === 'failed' || meta.status === 'failed') {
            setRenderStatus('failed');
            setRenderLog(meta.error || lastLog || 'Kết xuất thất bại');
            setRendering(false);
            toast.error('Kết xuất thất bại');
            unsub();
            unsubRenderRef.current = null;
          } else {
            setRenderStatus('processing');
          }
        });

        unsubRenderRef.current = unsub;
      }
    } catch (e: any) {
      setRenderStatus('failed');
      setRenderLog(e.message || 'Lỗi kết xuất video');
      setRendering(false);
      toast.error(e.message || 'Lỗi kết xuất video');
    }
  }, [script, onRenderStarted]);

  const keptCount = script?.segments.filter(s => s.keep).length ?? 0;
  const totalRenderDuration = script?.segments
    .filter(s => s.keep)
    .reduce((acc, s) => acc + (s.endTime - s.startTime) / (s.playbackRate || 1) + (s.insertAnimatedScene?.duration || 0), 0) ?? 0;

  const hasSource = inputMode === 'file' ? !!localFile : !!videoUrl.trim();
  const isWorking = generating || uploading;

  return (
    <div className="flex flex-col h-full">
      {/* ── Input area ─────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-gray-800">Kịch bản biên tập</h2>
          </div>
          {/* Mode toggle: File / URL */}
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setInputMode('file')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${inputMode === 'file' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <UploadCloud size={12} /> Upload file
            </button>
            <button
              onClick={() => setInputMode('url')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${inputMode === 'url' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Link2 size={12} /> URL
            </button>
          </div>
        </div>

        {/* File drop zone */}
        {inputMode === 'file' && (
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !localFile && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer ${
              isDragging ? 'border-indigo-400 bg-indigo-50' : localFile ? 'border-green-300 bg-green-50 cursor-default' : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileInput}
            />

            {localFile ? (
              <div className="flex items-center gap-3 px-4 py-3">
                {localPreviewUrl && (
                  <video src={localPreviewUrl} className="w-16 h-10 object-cover rounded-md flex-shrink-0" muted />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{localFile.name}</p>
                  <p className="text-xs text-gray-400">
                    {(localFile.size / 1024 / 1024).toFixed(1)} MB
                    {duration > 0 && ` · ${Math.round(duration)}s`}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); clearFile(); }}
                  className="flex-shrink-0 p-1 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <FileVideo size={28} className="text-gray-300" />
                <p className="text-sm text-gray-500">Kéo thả video vào đây hoặc <span className="text-indigo-600 font-medium">nhấn để chọn</span></p>
                <p className="text-xs text-gray-400">MP4, MOV, AVI · tối đa 200 MB</p>
              </div>
            )}
          </div>
        )}

        {/* URL input */}
        {inputMode === 'url' && (
          <div className="flex gap-2">
            <input
              type="url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://... (Cloudinary, S3, URL công khai)"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
            <input
              type="number"
              value={duration || ''}
              onChange={e => setDuration(Number(e.target.value))}
              min={1}
              placeholder="Giây"
              title="Thời lượng video (giây)"
              className="w-20 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>
        )}

        {/* Prompt input */}
        <div className="relative">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isWorking && hasSource && handleGenerate()}
            placeholder="Phong cách muốn (để trống để AI tự quyết định theo nội dung video)..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-36 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
          {!prompt && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400 pointer-events-none">
              AI tự phân tích
            </span>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={isWorking || !hasSource}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isWorking ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {uploading ? uploadProgress || 'Đang tải lên...' : generating ? 'Đang phân tích video...' : 'Tạo kịch bản AI'}
        </button>

        {isWorking && (
          <div className="space-y-1">
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full animate-pulse" style={{ width: uploading ? '30%' : '70%' }} />
            </div>
            <p className="text-xs text-gray-400">
              {uploading ? 'Tải video lên Cloudinary...' : 'Gemini đang phân tích nội dung và tạo kịch bản...'}
            </p>
          </div>
        )}
      </div>

      {/* ── Script content ─────────────────────────── */}
      {script && (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Analysis summary */}
          {script.analysisNotes && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <p className="text-xs font-medium text-indigo-700 mb-1">Phân tích AI</p>
              <p className="text-sm text-indigo-800">{script.analysisNotes}</p>
            </div>
          )}

          {/* Global settings */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-600">Cài đặt toàn cục</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tỉ lệ</label>
                <select value={script.globalSettings.aspectRatio} onChange={e => updateGlobal({ aspectRatio: e.target.value })} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white">
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Chất lượng</label>
                <select value={script.globalSettings.resolution} onChange={e => updateGlobal({ resolution: e.target.value })} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white">
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Nhạc nền</label>
                <select value={script.globalSettings.musicGenre} onChange={e => updateGlobal({ musicGenre: e.target.value })} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white">
                  {MUSIC_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Vol nhạc</label>
                <input type="range" min={0} max={1} step={0.05} value={script.globalSettings.musicVolume} onChange={e => updateGlobal({ musicVolume: Number(e.target.value) })} className="w-full" />
              </div>
            </div>
            {script.globalSettings.overallStyle && (
              <p className="text-xs text-gray-500 mt-2 italic">{script.globalSettings.overallStyle}</p>
            )}
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
            <span className="flex items-center gap-1"><Video size={12} /> {script.segments.length} đoạn tổng</span>
            <span className="flex items-center gap-1 text-green-600"><Check size={12} /> {keptCount} giữ lại</span>
            <span className="flex items-center gap-1 text-red-400"><Scissors size={12} /> {script.segments.length - keptCount} cắt bỏ</span>
            <span className="flex items-center gap-1 text-indigo-500"><Zap size={12} /> ~{totalRenderDuration.toFixed(1)}s kết xuất</span>
          </div>

          {/* Segment list */}
          <div className="space-y-2">
            {script.segments.map((seg: SegmentEdit, idx: number) => (
              <SegmentCard
                key={seg.segmentId}
                seg={seg}
                idx={idx}
                onChange={(updated: SegmentEdit) => updateSegment(idx, updated)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!script && !isWorking && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 px-6">
          <Film size={40} className="opacity-20" />
          <p className="text-sm font-medium text-gray-500">Upload video hoặc nhập URL rồi nhấn "Tạo kịch bản AI"</p>
          <p className="text-xs text-center max-w-xs leading-relaxed">
            Nếu không nhập yêu cầu, AI sẽ tự phân tích nội dung video và quyết định phong cách biên tập phù hợp nhất.
          </p>
        </div>
      )}

      {/* ── Render footer ──────────────────────────── */}
      {script && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 py-4 space-y-3">

          {/* Progress panel — shown while processing or after completion */}
          {renderStatus !== 'idle' && (
            <div className={`rounded-xl border p-3 space-y-2 transition-all ${
              renderStatus === 'completed' ? 'border-green-200 bg-green-50' :
              renderStatus === 'failed'    ? 'border-red-200 bg-red-50' :
              'border-indigo-100 bg-indigo-50'
            }`}>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {renderStatus === 'completed' ? (
                    <Check size={14} className="text-green-600" />
                  ) : renderStatus === 'failed' ? (
                    <X size={14} className="text-red-500" />
                  ) : (
                    <Loader2 size={14} className="text-indigo-500 animate-spin" />
                  )}
                  <span className={`text-xs font-semibold ${
                    renderStatus === 'completed' ? 'text-green-700' :
                    renderStatus === 'failed'    ? 'text-red-600' :
                    'text-indigo-700'
                  }`}>
                    {renderStatus === 'completed' ? 'Kết xuất hoàn thành' :
                     renderStatus === 'failed'    ? 'Kết xuất thất bại' :
                     renderStatus === 'queued'    ? 'Đang xếp hàng' :
                     'Đang kết xuất...'}
                  </span>
                </div>
                <span className={`text-xs font-mono font-bold ${
                  renderStatus === 'completed' ? 'text-green-600' :
                  renderStatus === 'failed'    ? 'text-red-500' :
                  'text-indigo-600'
                }`}>
                  {renderProgress}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    renderStatus === 'completed' ? 'bg-green-500' :
                    renderStatus === 'failed'    ? 'bg-red-400' :
                    'bg-indigo-500'
                  }`}
                  style={{ width: `${renderProgress}%` }}
                />
              </div>

              {/* Current log line */}
              {renderLog && (
                <p className={`text-xs leading-relaxed font-mono truncate ${
                  renderStatus === 'completed' ? 'text-green-700' :
                  renderStatus === 'failed'    ? 'text-red-600' :
                  'text-indigo-600'
                }`} title={renderLog}>
                  {renderLog}
                </p>
              )}

              {/* Output video link when done */}
              {renderStatus === 'completed' && outputVideoUrl && (
                <a
                  href={outputVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 underline underline-offset-2"
                >
                  <Play size={11} />
                  Xem video kết quả
                </a>
              )}
            </div>
          )}

          {/* Render / Re-render button */}
          <button
            onClick={handleRender}
            disabled={rendering || keptCount === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              renderStatus === 'completed'
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
            }`}
          >
            {rendering ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            {rendering
              ? `Đang kết xuất... ${renderProgress > 0 ? renderProgress + '%' : ''}`
              : renderStatus === 'completed'
              ? 'Kết xuất lại'
              : `Kết xuất từ kịch bản (${keptCount} đoạn · ~${totalRenderDuration.toFixed(1)}s)`
            }
          </button>
        </div>
      )}
    </div>
  );
}
