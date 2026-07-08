import React, { useEffect, useRef, useState } from 'react';

import { geminiApi } from '../../api/gemini';
import { toast } from '../../pages/Toast';
import { Film, Loader2, Play, Sparkles, Video, X, Wand2, UploadCloud, Cpu, Cloud, Zap, Download, Clapperboard } from 'lucide-react';
import { VideoEditScriptPanel } from './VideoEditScriptPanel';

import { socketService } from '../../services/socketService';

const MODEL_OPTIONS = [
  { value: 'piapi-veo31-video-fast-audio', label: 'iGen video 3.1 Fast' },
  { value: 'piapi-veo31-video-audio', label: 'iGen video 3.1' },
  { value: 'piapi-veo31-video-fast-no-audio', label: 'iGen video 3.1 Fast Silent' },
];

type RenderEngine = 'remotion' | 'hyperframe' | 'hermes' | 'professional';

const ENGINE_OPTIONS: Array<{
  value: RenderEngine;
  label: string;
  description: string;
  badge: string;
  badgeColor: string;
}> = [
    {
      value: 'remotion',
      label: 'Remotion',
      description: 'Frame-accurate. Dùng Chromium để render từng khung hình chính xác nhất.',
      badge: 'Chính xác',
      badgeColor: 'bg-cyan-100 text-cyan-700',
    },
    {
      value: 'hyperframe',
      label: 'Hyperframe',
      description: 'Nhanh hơn. Dùng CSS animation + HTML5 để render. Phù hợp hiệu ứng cơ bản.',
      badge: 'Nhanh',
      badgeColor: 'bg-emerald-100 text-emerald-700',
    },
    {
      value: 'hermes',
      label: 'Hermes Cloud',
      description: 'Đám mây. Worker farm xử lý nền. Dùng khi máy cục bộ yếu hoặc cần scale.',
      badge: 'Cloud',
      badgeColor: 'bg-violet-100 text-violet-700',
    },
    {
      value: 'professional',
      label: 'Professional (Claude)',
      description: 'Chuyên nghiệp. Claude viết code HTML+GSAP và kết xuất video chuyển cảnh mượt mà độc lập trên VPS.',
      badge: 'Pro & Claude',
      badgeColor: 'bg-amber-100 text-amber-700',
    },
  ];

const ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 Ngang' },
  { value: '9:16', label: '9:16 Dọc' },
  { value: '1:1', label: '1:1 Vuông' },
];

const DURATION_OPTIONS = [
  { value: '4', label: '4 giây' },
  { value: '6', label: '6 giây' },
  { value: '8', label: '8 giây' },

];

const QUALITY_OPTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

const STYLE_PRESETS = [
  // 🎬 Video ngắn / Mạng xã hội
  { label: 'Trending Reels', prompt: 'Chỉnh video thành clip TikTok 15s, cut nhanh theo nhạc, text pop-up, tone sáng.' },
  { label: 'Viral TikTok', prompt: 'Biến video này thành clip viral TikTok: tua nhanh đoạn đầu, zoom theo nhịp, thêm text highlight, chèn nhạc EDM sôi động từ đầu đến cuối.' },
  { label: 'YouTube Shorts', prompt: 'Cắt video thành Shorts 60s, giữ lại những khoảnh khắc hấp dẫn nhất, thêm phụ đề tiếng Việt bắt mắt, hiệu ứng zoom lúc cao trào.' },

  // 🛍️ Sản phẩm / Kinh doanh
  { label: 'Product Demo', prompt: 'Làm video review sản phẩm chuyên nghiệp, highlight tính năng, chuyển cảnh mượt.' },
  { label: 'Unboxing', prompt: 'Chỉnh sửa video unboxing: tua nhanh đoạn mở hộp, zoom cận cảnh sản phẩm, thêm text mô tả tính năng, chèn nhạc nền nhẹ nhàng xuyên suốt.' },
  { label: 'Before / After', prompt: 'So sánh trước sau, giữ rõ nội dung chính và nhấn mạnh diệu màu, hiệu ứng zoom.' },

  // ✈️ Du lịch / Đời sống
  { label: 'Travel Vlog', prompt: 'Biên tập clip travel cinematic, màu ấm, chuyển cảnh mềm, nhạc nhẹ.' },
  { label: 'Cinematic Film', prompt: 'Biên tập theo phong cách điện ảnh: filter cinematic, chuyển cảnh fade mượt, slow-motion đoạn đẹp, thêm nhạc piano nhẹ nhàng.' },

  // ⚡ Tốc độ & Nhịp điệu
  { label: 'Slow Motion', prompt: 'Tua chậm toàn bộ video 2 lần, thêm nhạc lofi thư giãn chạy suốt video, tone màu ấm áp.' },
  { label: 'Fast Cut', prompt: 'Cắt video thành các đoạn ngắn 2-3 giây, tua nhanh gấp rưỡi, chèn nhạc sôi động, zoom in/out liên tục.' },
  { label: 'Beat Sync', prompt: 'Cắt video theo từng đoạn 2 giây xen kẽ zoom in và zoom out, tua nhanh gấp 1.5 lần, thêm nhạc EDM chạy xuyên suốt, hiệu ứng text bắt mắt.' },

  // 🎨 Màu sắc & Filter
  { label: 'Black & White', prompt: 'Chuyển toàn bộ video sang đen trắng, thêm text mở đầu 3 giây "Ký ức", chèn nhạc piano, chuyển cảnh fade giữa các đoạn.' },
  { label: 'Vintage Film', prompt: 'Làm video tone vintage: giảm sáng nhẹ, filter sepia 0.3, thêm hạt film (grain), tua chậm 1.2x, nhạc acoustic nhẹ nhàng.' },
  { label: 'Vivid Colors', prompt: 'Tăng sáng 1.35, tăng độ tương phản 1.25, tăng độ bão hòa 1.3, tạo hiệu ứng màu sắc rực rỡ, thêm nhạc upbeat.' },

  // 📝 Text & Phụ đề
  { label: 'Subtitled', prompt: 'Thêm phụ đề tiếng Việt bắt mắt cho toàn bộ video, text màu vàng viền đen ở giữa dưới, fontSize 28px.' },
  { label: 'Intro + Outro', prompt: 'Thêm text intro "Chào mừng" trong 3 giây đầu và text outro "Cảm ơn đã xem" trong 3 giây cuối, tone chuyên nghiệp với nhạc nền corporate.' },

  // 🔀 Ghép & Tổng hợp
  { label: 'Ghép video', prompt: 'Ghép nối các video này lại với nhau theo thứ tự, giữ nguyên độ dài ban đầu của từng video.' },
  { label: 'Ghép & Nhạc nền', prompt: 'Ghép các video này lại với nhau theo thứ tự và chèn thêm nhạc lofi thư giãn chạy suốt cả video.' },
  { label: 'Ghép & Zoom FX', prompt: 'Ghép các video lại với nhau theo thứ tự, xen kẽ zoom in và zoom out mỗi 3 giây, chèn nhạc EDM xuyên suốt.' },
  { label: 'Ghép + Chữ + Nhạc', prompt: 'Ghép các video theo thứ tự, thêm text tiêu đề 3 giây đầu, thêm text kết thúc 3 giây cuối, chèn nhạc nền nhẹ nhàng toàn bộ video.' },

  // 🎵 Âm thanh
  { label: 'SFX Transitions', prompt: 'Thêm hiệu ứng âm thanh whoosh vào mỗi lần chuyển cảnh, thêm tiếng ting lúc text xuất hiện, giữ video gốc không đổi.' },
  { label: 'Mute + Music', prompt: 'Giảm âm lượng video gốc xuống 0.1, chèn nhạc nền acoustic chạy xuyên suốt toàn bộ video.' },
];

function isPlayableVideoUrl(url?: string | null) {
  const value = String(url || '').trim();
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:') || value.startsWith('data:');
}

function isInlinePreviewSafe(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('blob:') || value.startsWith('data:') || value.startsWith('/')) {
    return true;
  }
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin || parsed.hostname.includes('cloudinary.com') || parsed.hostname.includes('googleusercontent.com');
  } catch {
    return false;
  }
}

export function EditVideoWorkspace({
  initialVideoUrl,
  onClearInitialVideoUrl
}: {
  initialVideoUrl?: string | null;
  onClearInitialVideoUrl?: () => void;
} = {}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const refVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [videoInputs, setVideoInputs] = useState<Array<{ url: string; duration: number; file?: File }>>([]);
  const [referenceVideo, setReferenceVideo] = useState<{ url: string; duration: number; file?: File } | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('igen_edit_prompt_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [optimizedData, setOptimizedData] = useState<{
    optimized_english_prompt: string;
    motion_analysis?: string;
    camera_movement?: string;
  } | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);
  const [workspaceMode, setWorkspaceMode] = useState<'prompt' | 'script'>('prompt');
  const [renderEngine, setRenderEngine] = useState<RenderEngine>('hyperframe');
  const [aspectRatio, setAspectRatio] = useState(ASPECT_OPTIONS[0].value);
  const [duration, setDuration] = useState(DURATION_OPTIONS[0].value);
  const [resolution, setResolution] = useState(QUALITY_OPTIONS[0].value);
  const [history, setHistory] = useState<any[]>([]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryModalTarget, setLibraryModalTarget] = useState<'input' | 'reference'>('input');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtractingStyle, setIsExtractingStyle] = useState(false);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [blueprint, setBlueprint] = useState<any | null>(null);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [activeTimelineIdx, setActiveTimelineIdx] = useState<number | null>(null);

  // Professional mode state
  type ProSceneType = 'hook' | 'story' | 'insight' | 'pipeline' | 'ui_mockup' | 'before_after' | 'cta';
  type ProSceneSpec = {
    type: ProSceneType; label?: string; title?: string; subtitle?: string;
    titleColor?: 'gold' | 'red' | 'green' | 'white' | 'cyan';
    items?: Array<{ icon?: string; title: string; description?: string; variant?: string }>;
    steps?: Array<{ step?: string; icon?: string; title: string; description?: string; tag?: string }>;
    stats?: Array<{ value: string; label: string }>;
    code?: string;
    before?: { label: string; duration?: string };
    after?: { label: string; badge?: string };
    metric?: { from: string; to: string; label?: string };
    ctaButton?: string; ctaPrompt?: string; duration?: number;
  };
  const SCENE_DEFAULTS: Record<ProSceneType, Partial<ProSceneSpec>> = {
    hook:        { title: 'AI THAY THẾ BẠN', subtitle: 'hay là không cần timeline', titleColor: 'gold', duration: 10 },
    story:       { title: 'VẤN ĐỀ', subtitle: 'Edit video mất quá nhiều thời gian', titleColor: 'red', duration: 12, items: [{ icon: '⏰', title: 'Mất 2-3 giờ mỗi video', description: 'Timeline phức tạp, cắt ghép thủ công', variant: 'danger' }] },
    insight:     { title: 'GIẢI PHÁP', subtitle: 'AI xử lý toàn bộ', titleColor: 'green', duration: 12, items: [{ icon: '✅', title: 'Prompt → Video trong 25 phút', description: 'Claude viết HTML+GSAP tự động', variant: 'success' }] },
    pipeline:    { title: 'PIPELINE', subtitle: 'Cách hoạt động', titleColor: 'cyan', duration: 14, steps: [{ step: 'BƯỚC 1', icon: '💡', title: 'PROMPT', description: 'Mô tả ý tưởng', tag: 'INPUT' }, { step: 'BƯỚC 2', icon: '🤖', title: 'CLAUDE AI', description: 'Sinh HTML+GSAP', tag: 'AI ENGINE' }] },
    ui_mockup:   { title: 'CLAUDE UI', subtitle: 'Gõ lệnh, AI làm việc', titleColor: 'gold', duration: 12, code: 'Edit video claude va hyperframe\ntheo style viral reels\nClaude UI mockup chinh xac' },
    before_after:{ title: 'TRƯỚC & SAU', subtitle: 'Kết quả thực tế', titleColor: 'gold', duration: 12, before: { label: 'VIDEO GỐC', duration: '1:09' }, after: { label: 'VIDEO CHUYÊN NGHIỆP', badge: 'CHUYÊN NGHIỆP' }, metric: { from: '2.5h', to: '25 phút', label: 'thời gian edit' } },
    cta:         { title: 'BẮT ĐẦU NGAY', subtitle: 'Dùng thử miễn phí', titleColor: 'gold', duration: 8, ctaButton: 'Thử ngay miễn phí', ctaPrompt: 'Link trong bio' },
  };
  const [proOutline, setProOutline] = useState('');
  const [proBrandName, setProBrandName] = useState('iGen Tech');
  const [proBgMusicUrl, setProBgMusicUrl] = useState('');
  const [proColorScheme, setProColorScheme] = useState<'dark-gold' | 'dark-cyan' | 'dark-red'>('dark-gold');
  const [proScenes, setProScenes] = useState<ProSceneSpec[]>([]);

  const addProScene = (type: ProSceneType) => {
    const defaults = SCENE_DEFAULTS[type] || {};
    setProScenes(prev => [...prev, { type, ...defaults }]);
  };
  const removeProScene = (idx: number) => setProScenes(prev => prev.filter((_, i) => i !== idx));
  const updateProScene = (idx: number, patch: Partial<ProSceneSpec>) =>
    setProScenes(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const timelineItemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const activeRecord = history.find(h => h.url === outputUrl || h._id === currentRecordId || h.id === currentRecordId);
  const isHermes = activeRecord?.metadata?.provider === 'hermes-worker';

  const handleUpdateTimelineItem = (index: number, key: string, value: any) => {
    if (!blueprint) return;
    setBlueprint((prev: any) => {
      const timeline = [...prev.timeline];
      timeline[index] = { ...timeline[index], [key]: value };
      return { ...prev, timeline };
    });
  };

  const handleDeleteTimelineItem = (index: number) => {
    if (!blueprint) return;
    setBlueprint((prev: any) => {
      const timeline = prev.timeline.filter((_: any, idx: number) => idx !== index);
      return { ...prev, timeline };
    });
  };

  const handleDownloadVideo = async () => {
    if (!outputUrl) return;
    toast.info("Đang chuẩn bị tải video...");
    try {
      const token = localStorage.getItem("accessToken");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const downloadUrl = `/api/v1/media/download?url=${encodeURIComponent(outputUrl)}&filename=igen-video-${Date.now()}.mp4`;
      const res = await fetch(downloadUrl, { headers });
      if (!res.ok) {
        throw new Error(`Tải video thất bại (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `igen-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast.success("Tải video thành công!");
    } catch (err: any) {
      console.error(err);
      toast.error(`Lỗi khi tải video: ${err.message || String(err)}`);
    }
  };

  const handleAddTextLayer = () => {
    if (!blueprint) return;
    setBlueprint((prev: any) => {
      const timeline = [...prev.timeline];
      timeline.push({
        type: 'text',
        content: 'Chữ mới thêm',
        start: 0,
        end: 5,
        style: {
          position: 'bottom-center',
          color: '#FFFFFF',
          fontSize: '32px'
        }
      });
      return { ...prev, timeline };
    });
  };

  const handleAddAudioLayer = () => {
    if (!blueprint) return;
    setBlueprint((prev: any) => {
      const timeline = [...prev.timeline];
      timeline.push({
        type: 'audio',
        src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
        start: 0,
        end: 10,
        volume: 0.5
      });
      return { ...prev, timeline };
    });
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === "dragover") setIsDragging(true);
    else setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const newInputs = [...videoInputs];
    const maxSize = 200 * 1024 * 1024; // 200MB

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        toast.warning(`Video "${file.name}" vượt quá giới hạn 200MB và bị bỏ qua.`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.src = previewUrl;
      tempVideo.onloadedmetadata = () => {
        const duration = tempVideo.duration || 0;
        setVideoInputs(prev => prev.map(item => item.url === previewUrl ? { ...item, duration } : item));
      };
      tempVideo.load();

      newInputs.push({
        url: previewUrl,
        duration: 0,
        file
      });
    }
    setVideoInputs(newInputs);
  };

  useEffect(() => {
    if (initialVideoUrl) {
      setVideoInputs(prev => {
        if (prev.some(item => item.url === initialVideoUrl)) {
          return prev;
        }
        return [...prev, { url: initialVideoUrl, duration: 0 }];
      });
      setPrompt('');
      setOptimizedData(null);
      setBlueprint(null);
      setOutputUrl(null);
      setDisplayProgress(0);
      if (onClearInitialVideoUrl) {
        onClearInitialVideoUrl();
      }
    }
  }, [initialVideoUrl, onClearInitialVideoUrl]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const uploadVideoFile = async (file: File): Promise<string> => {
    const base64 = await fileToBase64(file);
    const response = await fetch('/api/v1/media/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem("accessToken")}`
      },
      body: JSON.stringify({
        file: base64,
        folder: 'igen_erp/marketing'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upload video failed: ${response.status} - ${errText}`);
    }

    const json = await response.json();
    return json.url;
  };

  useEffect(() => {
    loadVideoHistory();
  }, []);

  useEffect(() => {
    const unsubscribe = socketService.onVideoStatusUpdated((data) => {
      console.log("[EditVideoWorkspace] Real-time video update received:", data);
      loadVideoHistory();

      const matchedUpdate = data.updates?.find(u => u._id === currentRecordId || u.id === currentRecordId);
      if (matchedUpdate) {
        const status = matchedUpdate?.metadata?.status;
        if (status === 'completed') {
          const completedUrl = matchedUpdate?.url;
          if (completedUrl && !completedUrl.startsWith('pending://')) {
            setOutputUrl(completedUrl);
            console.log('[EditVideoWorkspace] Socket: outputUrl updated to', completedUrl);
          }
          toast.success('🎉 Video đã được biên tập và xuất bản thành công!');
        } else if (status === 'failed') {
          const errorMsg = matchedUpdate?.metadata?.error || 'Lỗi không xác định';
          toast.error(`❌ Biên tập video thất bại: ${errorMsg}`);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentRecordId]);

  useEffect(() => {
    const hasPending = (outputUrl && outputUrl.startsWith('pending://')) || history.some(item => item.url && item.url.startsWith('pending://'));
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const response = await geminiApi.getMediaHistory('video');
        setHistory(response.history || []);
      } catch (error) {
        console.error('[EditVideoWorkspace] Silent history polling failed', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [history, outputUrl]);

  // Smoothly increment progress percentage to avoid sudden jumps
  useEffect(() => {
    const isPending = isGenerating || (outputUrl && outputUrl.startsWith('pending://'));
    if (!isPending) {
      setDisplayProgress(0);
      return;
    }

    const matchedRecord = history.find(h => h.url === outputUrl || h._id === currentRecordId || h.id === currentRecordId);
    const statusVal = matchedRecord?.metadata?.status ?? (isGenerating ? 'processing' : 'queued');
    const realProgress = matchedRecord?.metadata?.progress ?? 0;

    let target = 0;
    if (statusVal === 'completed') {
      target = 100;
    } else if (statusVal === 'failed') {
      target = displayProgress; // freeze
    } else if (matchedRecord) {
      target = Math.max(realProgress, 5);
    } else {
      // Still in generation/uploading phase, slowly crawl up to 15%
      target = 15;
    }

    const timer = setInterval(() => {
      setDisplayProgress(prev => {
        if (prev < target) {
          const diff = target - prev;
          let step = 1;
          if (statusVal === 'completed') {
            step = Math.max(5, Math.ceil(diff / 5));
          } else if (diff > 30) {
            step = 3;
          } else if (diff > 15) {
            step = 2;
          }
          return Math.min(prev + step, target);
        } else if (prev > target && statusVal !== 'completed') {
          return prev;
        }
        return prev;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isGenerating, outputUrl, history, currentRecordId, displayProgress]);

  useEffect(() => {
    if (!outputUrl || !outputUrl.startsWith('pending://')) return;

    const matched = history.find(h => h._id === currentRecordId || h.id === currentRecordId);
    if (matched && matched.url && !matched.url.startsWith('pending://')) {
      setOutputUrl(matched.url);
      console.log("[EditVideoWorkspace] Dynamic sync: outputUrl updated to completed URL:", matched.url);
    }
  }, [history, outputUrl, currentRecordId]);

  const loadVideoHistory = async () => {
    try {
      const response = await geminiApi.getMediaHistory('video');
      setHistory(response.history || []);
    } catch (error) {
      console.error('[EditVideoWorkspace] loadVideoHistory failed', error);
    }
  };

  const handleMultipleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newInputs = [...videoInputs];
    const maxSize = 200 * 1024 * 1024; // 200MB

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        toast.warning(`Video "${file.name}" vượt quá giới hạn 200MB và bị bỏ qua.`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.src = previewUrl;
      tempVideo.onloadedmetadata = () => {
        const duration = tempVideo.duration || 0;
        setVideoInputs(prev => prev.map(item => item.url === previewUrl ? { ...item, duration } : item));
      };
      tempVideo.load();

      newInputs.push({
        url: previewUrl,
        duration: 0,
        file
      });
    }
    setVideoInputs(newInputs);
    event.target.value = '';
  };

  const handleRemoveVideo = (indexToRemove: number) => {
    setVideoInputs(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleReferenceVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      toast.warning(`Video mẫu "${file.name}" vượt quá giới hạn 200MB.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.src = previewUrl;
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration || 0;
      setReferenceVideo(prev => prev && prev.url === previewUrl ? { ...prev, duration } : prev);
    };
    tempVideo.load();

    setReferenceVideo({
      url: previewUrl,
      duration: 0,
      file
    });
    event.target.value = '';
  };

  const handleRemoveReferenceVideo = () => {
    setReferenceVideo(null);
  };

  const savePromptToHistory = (promptText: string) => {
    if (!promptText.trim()) return;
    setPromptHistory(prev => {
      const filtered = prev.filter(p => p !== promptText);
      const updated = [promptText, ...filtered].slice(0, 20);
      try { localStorage.setItem('igen_edit_prompt_history', JSON.stringify(updated)); } catch { }
      return updated;
    });
  };

  const clearPromptHistory = () => {
    setPromptHistory([]);
    try { localStorage.removeItem('igen_edit_prompt_history'); } catch { }
  };

  const handleSelectPreset = (presetPrompt: string) => {
    setPrompt(presetPrompt);
    setOptimizedData(null);
  };

  const handleOptimizePrompt = async () => {
    const hasVideo = videoInputs.length > 0 || referenceVideo !== null;
    if (hasVideo) {
      await handleExtractVideoStyle();
      return;
    }

    const description = prompt.trim();
    if (!description) {
      toast.warning('Vui lòng nhập nội dung prompt trước khi tối ưu hóa.');
      return;
    }
    setOptimizedData(null);
    setIsOptimizing(true);
    try {
      console.log("[EditVideoWorkspace] Sending optimize request with prompt:", description);
      const result = await geminiApi.optimizeEditPrompt(description);
      console.log("[EditVideoWorkspace] Optimization result received:", result);
      setOptimizedData({ optimized_english_prompt: result.optimized_prompt });
      toast.success('Đã tối ưu prompt chỉnh sửa video.');
    } catch (error: any) {
      console.error("[EditVideoWorkspace] Optimization failed:", error);
      toast.error(`Lỗi khi tối ưu prompt: ${error?.message || 'Không xác định'}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleExtractVideoStyle = async () => {
    // Luồng mới: Cần có cả video đầu vào và video mẫu để so sánh & phân tích phong cách dựng
    const hasInputVideo = videoInputs.length > 0;
    const hasRefVideo = referenceVideo !== null;

    if (!hasInputVideo && !hasRefVideo) {
      toast.warning('Vui lòng chọn hoặc tải lên ít nhất một video mẫu.');
      return;
    }

    setIsExtractingStyle(true);
    try {
      let sampleUrl = "";
      let sampleDuration = 0;
      let inputUrl = "";
      let inputDuration = 0;

      // 1. Xử lý video mẫu (Reference Video). Nếu không có, fallback về video đầu tiên trong videoInputs
      if (hasRefVideo && referenceVideo) {
        let url = referenceVideo.url;
        if (referenceVideo.file) {
          toast.info('Đang tải video mẫu lên Cloudinary...');
          url = await uploadVideoFile(referenceVideo.file);
          setReferenceVideo({ ...referenceVideo, url, file: undefined });
          toast.success('Tải video mẫu lên thành công.');
        }
        sampleUrl = url;
        sampleDuration = referenceVideo.duration || 0;
      } else {
        let url = videoInputs[0].url;
        if (videoInputs[0].file) {
          toast.info('Đang tải video mẫu lên Cloudinary...');
          url = await uploadVideoFile(videoInputs[0].file);
          setVideoInputs(prev => {
            const updated = [...prev];
            updated[0] = { ...updated[0], url, file: undefined };
            return updated;
          });
          toast.success('Tải video mẫu lên thành công.');
        }
        sampleUrl = url;
        sampleDuration = videoInputs[0].duration || 0;
      }

      // 2. Xử lý video đầu vào (Target Video) nếu có đồng thời cả video mẫu riêng
      if (hasRefVideo && hasInputVideo) {
        let url = videoInputs[0].url;
        if (videoInputs[0].file) {
          toast.info('Đang tải video đầu vào lên Cloudinary...');
          url = await uploadVideoFile(videoInputs[0].file);
          setVideoInputs(prev => {
            const updated = [...prev];
            updated[0] = { ...updated[0], url, file: undefined };
            return updated;
          });
          toast.success('Tải video đầu vào lên thành công.');
        }
        inputUrl = url;
        inputDuration = videoInputs[0].duration || 0;
      }

      toast.info('Đang phân tích kịch bản và phong cách dựng của video...');

      // Gọi API phân tích phong cách dựng kèm theo thông tin video đầu vào để scale thời gian và kết hợp ý tưởng
      const response = await geminiApi.analyzeVideoStyle(
        sampleUrl,
        sampleDuration,
        inputUrl || undefined,
        inputDuration || undefined,
        prompt || undefined
      );

      if (response.extractedPrompt) {
        setPrompt(response.extractedPrompt);
        setOptimizedData(null);
        toast.success(
          inputUrl
            ? '🎉 Đã trích xuất phong cách dựng video mẫu và tự động scale theo thời lượng video đầu vào!'
            : '🎉 Đã trích xuất phong cách dựng video mẫu vào ô ý tưởng!'
        );
      } else {
        toast.error('Không nhận diện được phong cách dựng của video.');
      }
    } catch (error: any) {
      console.error("[EditVideoWorkspace] Style extraction failed:", error);
      toast.error(`Lỗi phân tích phong cách video: ${error?.message || 'Không xác định'}`);
    } finally {
      setIsExtractingStyle(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (videoInputs.length === 0) {
      toast.warning('Vui lòng chọn hoặc tải lên ít nhất một video nguồn để chỉnh sửa.');
      return;
    }

    setIsGenerating(true);
    setBlueprint(null);
    setCurrentRecordId(null);
    setOutputUrl(null);
    setDisplayProgress(0);

    try {
      const uploadedUrls: string[] = [];
      const updatedInputs = [...videoInputs];
      let hasUploads = false;

      // Check if there are local files to upload
      for (const input of videoInputs) {
        if (input.file) {
          hasUploads = true;
          break;
        }
      }

      if (hasUploads) {
        setIsUploadingVideo(true);
        toast.info('Đang tải các video nguồn lên Cloudinary...');
      }

      for (let i = 0; i < videoInputs.length; i++) {
        const input = videoInputs[i];
        if (input.file) {
          try {
            toast.info(`Đang tải video ${i + 1}/${videoInputs.length} lên Cloudinary...`);
            const url = await uploadVideoFile(input.file);
            uploadedUrls.push(url);
            updatedInputs[i] = { ...input, url, file: undefined };
          } catch (uploadErr: any) {
            console.error('[Upload source video error]', uploadErr);
            toast.error(`Không thể tải video nguồn ${i + 1} lên Cloudinary: ${uploadErr.message}`);
            setIsGenerating(false);
            setIsUploadingVideo(false);
            return;
          }
        } else {
          uploadedUrls.push(input.url);
        }
      }

      if (hasUploads) {
        setVideoInputs(updatedInputs);
        setIsUploadingVideo(false);
        toast.success('Tải các video gốc thành công.');
      }

      // Tải video mẫu lên Cloudinary nếu có file cục bộ chưa upload
      let uploadedRefUrl = referenceVideo?.url || '';
      if (referenceVideo && referenceVideo.file) {
        try {
          toast.info('Đang tải video mẫu lên Cloudinary...');
          uploadedRefUrl = await uploadVideoFile(referenceVideo.file);
          setReferenceVideo({ ...referenceVideo, url: uploadedRefUrl, file: undefined });
          toast.success('Tải video mẫu lên thành công.');
        } catch (uploadErr: any) {
          console.error('[Upload reference video error]', uploadErr);
          toast.error(`Không thể tải video mẫu lên Cloudinary: ${uploadErr.message}`);
          setIsGenerating(false);
          return;
        }
      }

      const jointVideoUrl = uploadedUrls.join(',');
      const totalDuration = videoInputs.reduce((sum, v) => sum + (v.duration || 0), 0);

      toast.info('Đang gửi yêu cầu biên tập video đến AI...');
      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt) {
        savePromptToHistory(trimmedPrompt);
      }
      const finalPrompt = optimizedData?.optimized_english_prompt
        ? optimizedData.optimized_english_prompt
        : trimmedPrompt;

      const response = await geminiApi.editVideo(jointVideoUrl, finalPrompt, {
        modelName: selectedModel,
        aspectRatio,
        resolution,
        duration: totalDuration || undefined,
        videoDurations: videoInputs.map(v => v.duration || 0),
        blueprint: blueprint || undefined,
        renderMode: renderEngine === 'hermes' ? 'hermes' : 'local',
        renderEngine,
        referenceVideoUrl: uploadedRefUrl || undefined,
        referenceVideoDuration: referenceVideo?.duration || undefined,
        // Professional mode
        ...(renderEngine === 'professional' ? {
          outline: proOutline || finalPrompt,
          brandName: proBrandName || 'iGen Tech',
          bgMusicUrl: proBgMusicUrl || undefined,
          scenesContent: proScenes.length > 0 ? proScenes : undefined,
          colorScheme: proColorScheme,
        } : {}),
      });

      if (response.record) {
        setBlueprint(response.blueprint);
        setCurrentRecordId(response.record._id || response.record.id);
        setOutputUrl(response.record.url);
        toast.success('Đã tạo kịch bản biên tập AI. Bắt đầu kết xuất video...');
        await loadVideoHistory();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(`Lỗi khi biên tập video: ${error?.message || 'Không xác định'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Tính tổng thời lượng timeline để dùng cho Remotion Player + Timeline Bar ───
  const computeTimelineInfo = () => {
    if (!blueprint?.timeline) return { totalDuration: 0, fps: 30, width: 1280, height: 720 };
    const videoClips = blueprint.timeline.filter((t: any) => t.type === 'video');
    let totalDuration = 0;
    videoClips.forEach((clip: any) => {
      const dur = ((clip.end ?? 0) - (clip.start ?? 0)) / (clip.playbackRate ?? 1);
      totalDuration += dur;
    });
    if (totalDuration === 0) {
      // fallback: use max end time
      blueprint.timeline.forEach((t: any) => {
        if ((t.end ?? 0) > totalDuration) totalDuration = t.end;
      });
    }
    const fps = 30;
    let width = 1280, height = 720;
    const aspect = blueprint.aspectRatio || aspectRatio;
    if (aspect === '9:16') { width = 720; height = 1280; }
    else if (aspect === '1:1') { width = 720; height = 720; }
    return { totalDuration, fps, width, height };
  };

  const renderInteractivePlayer = () => {
    // Ưu tiên outputUrl (kết quả từ Hermes), fallback về video gốc
    const resolvedOutputUrl = outputUrl && !outputUrl.startsWith('pending://') ? outputUrl : null;
    const videoUrl = resolvedOutputUrl || videoInputs[0]?.url;
    if (!videoUrl) return null;

    const { totalDuration, fps, width, height } = computeTimelineInfo();
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));
    const timeline: any[] = blueprint?.timeline || [];

    // Tính timeline bar data
    const videoTracks = timeline.filter((t: any) => t.type === 'video');
    const audioTracks = timeline.filter((t: any) => t.type === 'audio');
    const textTracks = timeline.filter((t: any) => t.type === 'text');

    // Tính tổng thời gian cho timeline bar (dùng end time thực tế)
    const rawTotalDuration = timeline.reduce((max: number, t: any) => Math.max(max, t.end ?? 0), 0) || totalDuration || 10;

    const activeAudio = timeline.find((t: any) => t.type === 'audio');

    // Hàm tính vị trí % trên timeline bar
    const getBarLeft = (start: number) => `${((start / rawTotalDuration) * 100).toFixed(2)}%`;
    const getBarWidth = (start: number, end: number) => `${(((end - start) / rawTotalDuration) * 100).toFixed(2)}%`;

    return (
      <div className="w-full flex flex-col gap-4">

        {/* ── Preview Panel ── */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preview</span>
        </div>

        <div className="relative w-full rounded-[24px] overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-100 shadow-sm">
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            onTimeUpdate={() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); }}
            onPlay={() => { setIsPlaying(true); }}
            onPause={() => { setIsPlaying(false); }}
            className="w-full h-full object-contain max-h-[350px]"
            controls
            crossOrigin="anonymous"
          />
        </div>

        {/* ── Timeline Bar ── */}
        {timeline.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-3 overflow-hidden">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Timeline</span>
              <span className="text-[10px] text-slate-500">{rawTotalDuration.toFixed(1)}s</span>
            </div>

            {/* Ruler */}
            <div className="relative h-5 mb-1">
              <div className="absolute inset-0 flex">
                {Array.from({ length: Math.ceil(rawTotalDuration) + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute flex flex-col items-center"
                    style={{ left: `${(i / rawTotalDuration) * 100}%` }}
                  >
                    <div className="w-px h-2 bg-slate-600" />
                    <span className="text-[8px] text-slate-500 mt-0.5">{i}s</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Track: Video */}
            {videoTracks.length > 0 && (
              <div className="relative h-6 mb-1.5">
                <span className="absolute -left-0 top-0.5 text-[8px] font-bold text-cyan-500 uppercase w-8">VID</span>
                <div className="absolute inset-0 ml-8">
                  {videoTracks.map((t: any, i: number) => {
                    const globalIdx = timeline.indexOf(t);
                    return (
                      <div
                        key={i}
                        title={`Clip ${i + 1}: ${t.start}s → ${t.end}s | rate=${t.playbackRate || 1}x`}
                        onClick={() => {
                          setActiveTimelineIdx(globalIdx);
                          const el = timelineItemRefs.current[globalIdx];
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className={`absolute top-0 h-full rounded cursor-pointer transition-all border ${activeTimelineIdx === globalIdx ? 'border-cyan-400 brightness-125' : 'border-cyan-800/60 hover:border-cyan-500'}`}
                        style={{
                          left: getBarLeft(t.start),
                          width: getBarWidth(t.start, t.end),
                          background: t.effects?.zoom === 'in' ? 'linear-gradient(90deg,#0891b2,#06b6d4)' : t.effects?.zoom === 'out' ? 'linear-gradient(90deg,#0e7490,#0891b2)' : '#164e63',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Track: Audio */}
            {audioTracks.length > 0 && (
              <div className="relative h-6 mb-1.5">
                <span className="absolute top-0.5 text-[8px] font-bold text-purple-400 uppercase w-8">AUD</span>
                <div className="absolute inset-0 ml-8">
                  {audioTracks.map((t: any, i: number) => {
                    const globalIdx = timeline.indexOf(t);
                    return (
                      <div
                        key={i}
                        title={`Audio ${i + 1}: ${t.start}s → ${t.end}s | vol=${t.volume}`}
                        onClick={() => {
                          setActiveTimelineIdx(globalIdx);
                          const el = timelineItemRefs.current[globalIdx];
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className={`absolute top-0 h-full rounded cursor-pointer transition-all border ${activeTimelineIdx === globalIdx ? 'border-purple-400 brightness-125' : 'border-purple-800/60 hover:border-purple-500'}`}
                        style={{
                          left: getBarLeft(t.start),
                          width: getBarWidth(t.start, t.end),
                          background: '#4c1d95',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Track: Text */}
            {textTracks.length > 0 && (
              <div className="relative h-6">
                <span className="absolute top-0.5 text-[8px] font-bold text-yellow-400 uppercase w-8">TXT</span>
                <div className="absolute inset-0 ml-8">
                  {textTracks.map((t: any, i: number) => {
                    const globalIdx = timeline.indexOf(t);
                    return (
                      <div
                        key={i}
                        title={`Text: "${t.content}" | ${t.start}s → ${t.end}s`}
                        onClick={() => {
                          setActiveTimelineIdx(globalIdx);
                          const el = timelineItemRefs.current[globalIdx];
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                        className={`absolute top-0 h-full rounded cursor-pointer transition-all border text-[7px] font-bold text-yellow-100 flex items-center px-1 overflow-hidden ${activeTimelineIdx === globalIdx ? 'border-yellow-400 brightness-125' : 'border-yellow-800/60 hover:border-yellow-500'}`}
                        style={{
                          left: getBarLeft(t.start),
                          width: getBarWidth(t.start, t.end),
                          background: '#713f12',
                          minWidth: '8px',
                        }}
                      >
                        <span className="truncate">{t.content}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeAudio && (
              <audio ref={audioRef} src={activeAudio.src} className="hidden" crossOrigin="anonymous" />
            )}
            <AudioSyncHook activeAudio={activeAudio} currentTime={currentTime} isPlaying={isPlaying} audioRef={audioRef} />
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setBlueprint(null);
              setOutputUrl(null);
              setDisplayProgress(0);
              setActiveTimelineIdx(null);
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer shadow-xs"
          >
            Quay lại
          </button>

          <button
            type="button"
            onClick={handleGenerateVideo}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition cursor-pointer shadow-sm"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang xuất video...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Xuất video MP4
              </>
            )}
          </button>
        </div>
      </div>
    );
  };



  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-5">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>

            <h1 className="mt-3 text-3xl font-bold text-slate-900">Chỉnh sửa Video </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Chỉnh sửa video gốc bằng prompt AI, thêm style, tự động cắt ghép, và xem preview nhanh.
            </p>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setWorkspaceMode('prompt')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${workspaceMode === 'prompt' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Sparkles size={15} />
              Prompt nhanh
            </button>
            <button
              onClick={() => setWorkspaceMode('script')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${workspaceMode === 'script' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Clapperboard size={15} />
              Kịch bản
            </button>
          </div>
        </div>

        {/* ── Kịch bản mode ─────────────────────────────── */}
        {workspaceMode === 'script' && (
          <div className="rounded-[28px] border border-slate-200 bg-white" style={{ height: 700 }}>
            <VideoEditScriptPanel
              initialVideoUrl={videoInputs[0]?.url}
              initialDuration={videoInputs[0]?.duration || undefined}
              onRenderStarted={(record) => {
                if (record?._id) setCurrentRecordId(record._id);
                toast.success('Video đang được kết xuất từ kịch bản...');
              }}
            />
          </div>
        )}

        {/* ── Prompt mode (existing UI) ──────────────────── */}
        {workspaceMode !== 'script' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm min-w-0 overflow-hidden">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Video đầu vào</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLibraryModalTarget('input');
                      setShowLibraryModal(true);
                    }}
                    className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 flex items-center gap-1 bg-cyan-50 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Thư viện video
                  </button>
                </div>
              </div>
              <div
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-4 flex flex-col transition-all bg-slate-50/50 ${isDragging ? 'border-cyan-500 bg-cyan-50/50' : 'border-slate-250 hover:border-cyan-400'
                  }`}
              >
                {videoInputs.length > 0 ? (
                  <div className="flex flex-wrap gap-2 w-full">
                    {videoInputs.map((video, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedPreviewUrl(video.url);
                          setShowPreviewModal(true);
                        }}
                        className="relative w-28 h-28 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs group cursor-pointer hover:border-cyan-400 hover:ring-1 hover:ring-cyan-400/50 transition-all"
                      >
                        <video
                          src={video.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          crossOrigin="anonymous"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play className="h-6 w-6 text-white fill-white" />
                        </div>
                        <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold text-white bg-black/50 px-1 rounded">
                          Video {idx + 1} ({video.duration ? `${Math.round(video.duration)}s` : '0s'})
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveVideo(idx);
                          }}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/70 hover:bg-black text-white rounded-full transition-all z-10"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    <label className="cursor-pointer border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center w-28 h-28 hover:bg-slate-100 transition-all bg-white">
                      <UploadCloud className="h-5 w-5 text-gray-400" />
                      <span className="text-[9px] text-gray-500 font-semibold mt-1">Thêm</span>
                      <input
                        type="file"
                        accept="video/*"
                        multiple
                        onChange={handleMultipleFilesChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center text-center w-full min-h-[140px]">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                      <Video className="h-5 w-5 text-slate-500" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Kéo thả hoặc nhấp để tải video lên</span>
                    <span className="text-[10px] text-slate-400 mt-1 font-medium">MP4, MOV, WEBM. Tối đa 200MB. Hỗ trợ chọn nhiều video.</span>
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={handleMultipleFilesChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Ô TẢI LÊN VIDEO MẪU (STYLE REFERENCE) */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Video mẫu (Phong cách / Style)</label>
                <div className="flex items-center gap-2">
                  {referenceVideo && (
                    <button
                      type="button"
                      onClick={handleRemoveReferenceVideo}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                    >
                      Xóa mẫu
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLibraryModalTarget('reference');
                      setShowLibraryModal(true);
                    }}
                    className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Thư viện video
                  </button>
                </div>
              </div>
              <div
                className="border-2 border-dashed rounded-2xl p-4 flex flex-col transition-all bg-slate-50/50 border-slate-250 hover:border-purple-400"
              >
                {referenceVideo ? (
                  <div className="flex items-center gap-4">
                    <div
                      onClick={() => {
                        setSelectedPreviewUrl(referenceVideo.url);
                        setShowPreviewModal(true);
                      }}
                      className="relative w-28 h-28 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs group cursor-pointer hover:border-purple-400 hover:ring-1 hover:ring-purple-400/50 transition-all"
                    >
                      <video
                        src={referenceVideo.url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        crossOrigin="anonymous"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play className="h-6 w-6 text-white fill-white" />
                      </div>
                      <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold text-white bg-black/50 px-1 rounded">
                        Mẫu ({referenceVideo.duration ? `${Math.round(referenceVideo.duration)}s` : '0s'})
                      </span>
                    </div>
                    <div className="flex-1 text-slate-600 text-xs">
                      <p className="font-semibold text-slate-700">Video mẫu đã chọn</p>
                      <p className="mt-1 text-slate-450">Tải lên video mẫu giúp AI phân tích chính xác phong cách, nhịp độ và scale các hiệu ứng khớp với thời lượng của video đầu vào.</p>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center text-center w-full min-h-[90px] py-2">
                    <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center mb-1">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Chọn tải lên Video mẫu (Reference Style)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Để AI học phong cách dựng, bộ lọc và hiệu ứng</span>
                    <input
                      ref={refVideoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleReferenceVideoChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Cấu hình xuất video */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Cấu hình kết xuất</label>



              <div className="grid gap-3 grid-cols-2 pt-1">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tỉ lệ khung hình</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-cyan-400 bg-white font-semibold text-slate-700 cursor-pointer transition-colors"
                  >
                    {ASPECT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Độ phân giải</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-cyan-400 bg-white font-semibold text-slate-700 cursor-pointer transition-colors"
                  >
                    {QUALITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Động cơ kết xuất (Render Engine)</label>
                <select
                  value={renderEngine}
                  onChange={(e) => setRenderEngine(e.target.value as RenderEngine)}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-cyan-400 bg-white font-semibold text-slate-700 cursor-pointer transition-colors"
                >
                  {ENGINE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.badge})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  {ENGINE_OPTIONS.find(opt => opt.value === renderEngine)?.description}
                </p>
              </div>
            </div>

            {/* Professional Mode Scene Builder */}
            {renderEngine === 'professional' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-amber-700">Professional Scene Builder</span>
                  <span className="text-[10px] text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full font-mono">Claude → HTML+GSAP</span>
                </div>

                {/* Outline + Brand */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Brand Name</label>
                    <input
                      type="text"
                      value={proBrandName}
                      onChange={e => setProBrandName(e.target.value)}
                      placeholder="iGen Tech"
                      className="mt-1 w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Color Scheme</label>
                    <select
                      value={proColorScheme}
                      onChange={e => setProColorScheme(e.target.value as 'dark-gold' | 'dark-cyan' | 'dark-red')}
                      className="mt-1 w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-amber-400 bg-white"
                    >
                      <option value="dark-gold">Dark Gold (mặc định)</option>
                      <option value="dark-cyan">Dark Cyan</option>
                      <option value="dark-red">Dark Red</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Video Outline / Nội dung chủ đề</label>
                  <textarea
                    value={proOutline}
                    onChange={e => setProOutline(e.target.value)}
                    rows={2}
                    placeholder="Vd: Video về cách dùng AI để edit video chuyên nghiệp với Claude + HyperFrames..."
                    className="mt-1 w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-amber-400 resize-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Background Music URL (tùy chọn)</label>
                  <input
                    type="text"
                    value={proBgMusicUrl}
                    onChange={e => setProBgMusicUrl(e.target.value)}
                    placeholder="https://... (Cloudinary URL)"
                    className="mt-1 w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-amber-400"
                  />
                </div>

                {/* Scene list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scenes ({proScenes.length})</label>
                    {proScenes.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const defaults: ProSceneType[] = ['hook', 'story', 'insight', 'pipeline', 'ui_mockup', 'before_after', 'cta'];
                          setProScenes(defaults.map(t => ({ type: t, ...SCENE_DEFAULTS[t] })));
                        }}
                        className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 border border-amber-300 px-2 py-1 rounded-lg"
                      >
                        + Thêm template đầy đủ (7 scenes)
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {proScenes.map((scene, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">{String(idx + 1).padStart(2, '0')}</span>
                          <select
                            value={scene.type}
                            onChange={e => updateProScene(idx, { type: e.target.value as ProSceneType, ...SCENE_DEFAULTS[e.target.value as ProSceneType] })}
                            className="text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-amber-400 bg-white font-semibold"
                          >
                            <option value="hook">Hook</option>
                            <option value="story">Story (Problem)</option>
                            <option value="insight">Insight (Solution)</option>
                            <option value="pipeline">Pipeline</option>
                            <option value="ui_mockup">UI Mockup</option>
                            <option value="before_after">Before / After</option>
                            <option value="cta">CTA</option>
                          </select>
                          <input
                            type="text"
                            value={scene.title || ''}
                            onChange={e => updateProScene(idx, { title: e.target.value })}
                            placeholder="Title..."
                            className="flex-1 text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-amber-400"
                          />
                          <input
                            type="number"
                            value={scene.duration || 12}
                            onChange={e => updateProScene(idx, { duration: Number(e.target.value) })}
                            className="w-14 text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-amber-400 text-center"
                            min={4}
                            max={30}
                            title="Duration (s)"
                          />
                          <button
                            type="button"
                            onClick={() => removeProScene(idx)}
                            className="text-red-400 hover:text-red-600 text-lg font-bold leading-none px-1"
                            title="Xóa scene"
                          >
                            ×
                          </button>
                        </div>
                        {scene.subtitle !== undefined && (
                          <input
                            type="text"
                            value={scene.subtitle || ''}
                            onChange={e => updateProScene(idx, { subtitle: e.target.value })}
                            placeholder="Subtitle..."
                            className="w-full text-xs p-1.5 border border-slate-100 rounded-lg outline-none focus:border-amber-400 bg-slate-50"
                          />
                        )}
                        {(scene.type === 'ui_mockup') && (
                          <textarea
                            value={scene.code || ''}
                            onChange={e => updateProScene(idx, { code: e.target.value })}
                            rows={2}
                            placeholder="Terminal typing text..."
                            className="w-full text-xs p-1.5 border border-slate-100 rounded-lg outline-none focus:border-amber-400 bg-slate-50 font-mono resize-none"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add scene buttons */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(['hook', 'story', 'insight', 'pipeline', 'ui_mockup', 'before_after', 'cta'] as ProSceneType[]).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addProScene(t)}
                        className="text-[10px] font-semibold text-slate-500 hover:text-amber-700 border border-slate-200 hover:border-amber-300 px-2 py-1 rounded-lg"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Badge chế độ video mẫu */}
              {referenceVideo && (
                <div className="flex items-center gap-2 rounded-2xl bg-purple-50 border border-purple-200 px-3 py-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                  <p className="text-xs font-semibold text-purple-700">Chế độ: Áp dụng phong cách từ video mẫu</p>
                  <span className="ml-auto text-[10px] text-purple-500">Prompt bên dưới là tùy chọn</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {referenceVideo ? 'Ghi chú bổ sung (tùy chọn)' : 'Ý tưởng của bạn'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {referenceVideo
                      ? 'AI sẽ học phong cách từ video mẫu. Nhập thêm yêu cầu tinh chỉnh nếu cần.'
                      : 'Mô tả đoạn video bạn muốn AI chỉnh sửa.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt('');
                    setOptimizedData(null);
                  }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Xóa
                </button>
              </div>

              {!referenceVideo && (
                <div className="flex flex-wrap gap-2 pt-1 pb-2">
                  {STYLE_PRESETS.map((preset, idx) => {
                    const isConcatPreset = preset.label.startsWith('Ghép');
                    if (isConcatPreset && videoInputs.length < 2) return null;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectPreset(preset.prompt)}
                        className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 hover:border-slate-350 shadow-xs cursor-pointer animate-in fade-in duration-200"
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setOptimizedData(null);
                }}
                rows={referenceVideo ? 3 : 6}
                placeholder={referenceVideo
                  ? 'Tùy chọn: "Thêm tiêu đề màu đỏ ở đầu", "Dùng nhạc upbeat", "Zoom cận cảnh đoạn giữa"...'
                  : "Nhập ý tưởng chỉnh sửa: ví dụ 'Làm video này thành clip viral TikTok', 'Thêm phụ đề và nhạc nền', 'Cắt bỏ 5 giây đầu, zoom cận cảnh đoạn giữa', 'Chuyển sang đen trắng, thêm nhạc piano', 'Ghép 2 video + text intro + nhạc EDM'"}
                className="min-h-[80px] w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            {/* Prompt History - Recent prompts */}
            {promptHistory.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Gần đây ({promptHistory.length})
                  <svg className={`w-3 h-3 transition ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showHistory && (
                  <button
                    type="button"
                    onClick={clearPromptHistory}
                    className="rounded-full px-2 py-0.5 text-xs text-red-400 hover:bg-red-50 transition"
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>
            )}
            {showHistory && promptHistory.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto px-1">
                {promptHistory.map((histPrompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setPrompt(histPrompt); setOptimizedData(null); setShowHistory(false); }}
                    className="inline-block max-w-xs truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 transition"
                    title={histPrompt}
                  >
                    {histPrompt.length > 50 ? histPrompt.slice(0, 50) + '...' : histPrompt}
                  </button>
                ))}
              </div>
            )}


            <div className="mt-2">
              <button
                type="button"
                onClick={handleGenerateVideo}
                className="inline-flex w-full items-center justify-center gap-2 rounded-3xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {referenceVideo ? 'Đang phân tích & áp dụng phong cách...' : 'Đang tạo video...'}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {referenceVideo ? 'Áp dụng phong cách từ video mẫu' : 'Tạo video ngay'}
                  </>
                )}
              </button>
              {blueprint && blueprint.timeline && (
                <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Cấu hình Biên tập Thủ công</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Tinh chỉnh các lớp chữ, nhạc và hiệu ứng video.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddTextLayer}
                        className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 bg-cyan-50 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                      >
                        + Chữ
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAudioLayer}
                        className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                      >
                        + Nhạc
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                    {blueprint.timeline.map((item: any, idx: number) => {
                      if (item.type === 'text') {
                        return (
                          <div
                            key={idx}
                            ref={(el) => { timelineItemRefs.current[idx] = el; }}
                            onClick={() => setActiveTimelineIdx(idx)}
                            className={`p-4 rounded-2xl border bg-white flex flex-col gap-3 shadow-xs cursor-pointer transition-all ${activeTimelineIdx === idx ? 'border-cyan-400 ring-1 ring-cyan-300/50 bg-cyan-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <span className="text-[10px] font-bold text-cyan-600 tracking-wider">LỚP CHỮ #{idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteTimelineItem(idx)}
                                className="text-[10px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer transition-colors"
                              >
                                XÓA
                              </button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Nội dung chữ</label>
                                <input
                                  type="text"
                                  value={item.content}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'content', e.target.value)}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                />
                              </div>
                              <div className="flex gap-2">
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Bắt đầu (s)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={item.start}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'start', parseFloat(e.target.value) || 0)}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Kết thúc (s)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={item.end}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'end', parseFloat(e.target.value) || 0)}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Vị trí</label>
                                <select
                                  value={item.style?.position || 'bottom-center'}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'style', { ...item.style, position: e.target.value })}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400 bg-white"
                                >
                                  <option value="bottom-center">Dưới - Giữa</option>
                                  <option value="center">Chính giữa</option>
                                  <option value="top-center">Trên - Giữa</option>
                                  <option value="top-left">Trên - Trái</option>
                                  <option value="top-right">Trên - Phải</option>
                                  <option value="bottom-left">Dưới - Trái</option>
                                  <option value="bottom-right">Dưới - Phải</option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Màu chữ</label>
                                <div className="flex gap-1.5 items-center">
                                  <input
                                    type="color"
                                    value={item.style?.color || '#FFFFFF'}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'style', { ...item.style, color: e.target.value })}
                                    className="w-7 h-7 rounded border border-slate-200 cursor-pointer overflow-hidden"
                                  />
                                  <input
                                    type="text"
                                    value={item.style?.color || '#FFFFFF'}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'style', { ...item.style, color: e.target.value })}
                                    className="flex-1 min-w-0 text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-cyan-400 text-center"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Cỡ chữ (px)</label>
                                <input
                                  type="text"
                                  value={item.style?.fontSize || '32px'}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'style', { ...item.style, fontSize: e.target.value })}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      } else if (item.type === 'audio') {
                        return (
                          <div
                            key={idx}
                            ref={(el) => { timelineItemRefs.current[idx] = el; }}
                            onClick={() => setActiveTimelineIdx(idx)}
                            className={`p-4 rounded-2xl border bg-white flex flex-col gap-3 shadow-xs cursor-pointer transition-all ${activeTimelineIdx === idx ? 'border-purple-400 ring-1 ring-purple-300/50 bg-purple-50/20' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <span className="text-[10px] font-bold text-purple-600 tracking-wider">NHẠC NỀN #{idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteTimelineItem(idx)}
                                className="text-[10px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer transition-colors"
                              >
                                XÓA
                              </button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Đường dẫn nhạc (URL)</label>
                                <input
                                  type="text"
                                  value={item.src}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'src', e.target.value)}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                />
                              </div>
                              <div className="flex gap-2">
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Bắt đầu (s)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={item.start}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'start', parseFloat(e.target.value) || 0)}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Kết thúc (s)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={item.end}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'end', parseFloat(e.target.value) || 0)}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between items-center">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Âm lượng</label>
                                <span className="text-xs font-semibold text-slate-700">{Math.round((item.volume || 0.5) * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={item.volume !== undefined ? item.volume : 0.5}
                                onChange={(e) => handleUpdateTimelineItem(idx, 'volume', parseFloat(e.target.value) || 0)}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                              />
                            </div>
                          </div>
                        );
                      } else if (item.type === 'video') {
                        return (
                          <div
                            key={idx}
                            ref={(el) => { timelineItemRefs.current[idx] = el; }}
                            onClick={() => setActiveTimelineIdx(idx)}
                            className={`p-4 rounded-2xl border bg-white flex flex-col gap-3 shadow-xs cursor-pointer transition-all ${activeTimelineIdx === idx ? 'border-slate-500 ring-1 ring-slate-300/80 bg-slate-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <span className="text-[10px] font-bold text-slate-600 tracking-wider">VIDEO CLIPS NGUỒN #{idx + 1}</span>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="flex gap-2">
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Cắt từ (s)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={item.start}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'start', parseFloat(e.target.value) || 0)}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Cắt đến (s)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={item.end}
                                    onChange={(e) => handleUpdateTimelineItem(idx, 'end', parseFloat(e.target.value) || 0)}
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Tốc độ phát</label>
                                <select
                                  value={item.playbackRate || 1.0}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'playbackRate', parseFloat(e.target.value) || 1.0)}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400 bg-white"
                                >
                                  <option value="0.5">0.5x (Chậm)</option>
                                  <option value="1.0">1.0x (Thường)</option>
                                  <option value="1.5">1.5x (Nhanh)</option>
                                  <option value="2.0">2.0x (Cực nhanh)</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Hiệu ứng Zoom</label>
                                <select
                                  value={item.effects?.zoom || 'none'}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'effects', { ...item.effects, zoom: e.target.value })}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400 bg-white"
                                >
                                  <option value="none">Không zoom</option>
                                  <option value="in">Zoom In (Cận cảnh)</option>
                                  <option value="out">Zoom Out</option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Chuyển cảnh</label>
                                <select
                                  value={item.effects?.transition || 'none'}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'effects', { ...item.effects, transition: e.target.value })}
                                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-400 bg-white"
                                >
                                  <option value="none">Không hiệu ứng</option>
                                  <option value="fade">Mờ dần (Fade out)</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 border-t border-slate-100 pt-2.5">
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Độ sáng</label>
                                  <span className="text-[10px] font-semibold text-slate-700">{Math.round((item.filters?.brightness || 1.0) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="1.5"
                                  step="0.05"
                                  value={item.filters?.brightness || 1.0}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'filters', { ...item.filters, brightness: parseFloat(e.target.value) || 1.0 })}
                                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                                />
                              </div>
                              <div className="flex items-center gap-2 pt-3">
                                <input
                                  type="checkbox"
                                  id={`gray-comp-${idx}`}
                                  checked={!!item.filters?.grayscale}
                                  onChange={(e) => handleUpdateTimelineItem(idx, 'filters', { ...item.filters, grayscale: e.target.checked ? 1.0 : 0 })}
                                  className="w-4 h-4 rounded border-slate-350 text-cyan-600 focus:ring-cyan-500 accent-cyan-600 cursor-pointer"
                                />
                                <label htmlFor={`gray-comp-${idx}`} className="text-[10px] font-bold text-slate-500 uppercase tracking-wide cursor-pointer select-none">Màu đen trắng</label>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sẵn sàng sáng tạo</p>
                  <p className="mt-1 text-sm text-slate-500">Tải video gốc và nhập ý tưởng để bắt đầu.</p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Preview</div>
              </div>
              <div className={`mt-6 rounded-[28px] border bg-slate-50 p-6 text-center text-slate-500 ${(outputUrl || isGenerating || blueprint)
                ? 'border-solid border-slate-250'
                : 'border-dashed border-slate-300 flex h-[380px] items-center justify-center'
                }`}>
                {(outputUrl || isGenerating || blueprint) ? (
                  (isGenerating || (outputUrl && outputUrl.startsWith('pending://'))) ? (() => {
                    const isLocalRender = activeRecord
                      ? (activeRecord.metadata?.provider !== 'hermes-worker')
                      : (renderEngine !== 'hermes');

                    const progressVal = displayProgress;
                    const statusVal = activeRecord?.metadata?.status ?? (isGenerating ? 'processing' : 'queued');
                    const errorVal = activeRecord?.metadata?.error;
                    const finalVideoUrl = (activeRecord && activeRecord.url && !activeRecord.url.startsWith('pending://'))
                      ? activeRecord.url
                      : null;

                    if (statusVal === 'completed' && finalVideoUrl && displayProgress >= 100) {
                      return (
                        <div className="w-full h-full flex flex-col gap-4">
                          {isInlinePreviewSafe(finalVideoUrl) ? (
                            <video controls src={finalVideoUrl} className="w-full rounded-[24px] object-contain max-h-[300px] shadow-sm border border-slate-100" playsInline />
                          ) : (
                            <div className="flex w-full flex-col items-center justify-center gap-3 rounded-[24px] border border-slate-100 bg-slate-50 px-4 py-10 text-center">
                              <p className="text-sm font-semibold text-slate-700">Video da render nhung khong ho tro preview truc tiep tren trinh duyet nay.</p>
                              <a href={finalVideoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700">
                                Mo video trong tab moi
                              </a>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              // Replace the video inputs with the newly rendered video
                              setVideoInputs([{ url: finalVideoUrl, duration: 0 }]);

                              // Load the duration of the new video dynamically
                              const tempVideo = document.createElement('video');
                              tempVideo.preload = 'metadata';
                              tempVideo.muted = true;
                              tempVideo.playsInline = true;
                              tempVideo.src = finalVideoUrl;
                              tempVideo.onloadedmetadata = () => {
                                const duration = tempVideo.duration || 0;
                                setVideoInputs([{ url: finalVideoUrl, duration }]);
                              };
                              tempVideo.load();

                              setPrompt('');
                              setOptimizedData(null);
                              setBlueprint(null);
                              setOutputUrl(null);
                              setDisplayProgress(0);
                              toast.success('Đã đặt video kết quả thành video đầu vào. Hãy nhập ý tưởng mới để tiếp tục chỉnh sửa!');
                            }}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 cursor-pointer shadow-sm shadow-cyan-155 mt-2"
                          >
                            <Wand2 className="h-4 w-4" />
                            Tiếp tục sửa
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="w-full flex flex-col items-center justify-center gap-6 py-10 px-4 text-center">
                        {/* Circular Progress Bar */}
                        <div className="relative flex items-center justify-center">
                          {statusVal === 'failed' ? (
                            <div className="w-32 h-32 rounded-full border-8 border-rose-100 flex items-center justify-center bg-rose-50">
                              <X className="h-10 w-10 text-rose-500" />
                            </div>
                          ) : (
                            <>
                              <svg className="w-32 h-32 transform -rotate-90">
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="54"
                                  className="stroke-current text-slate-200/60"
                                  strokeWidth="8"
                                  fill="transparent"
                                />
                                <circle
                                  cx="64"
                                  cy="64"
                                  r="54"
                                  className="stroke-current text-cyan-600 transition-all duration-300"
                                  strokeWidth="8"
                                  fill="transparent"
                                  strokeDasharray={339.3}
                                  strokeDashoffset={339.3 - (339.3 * Math.min(100, Math.max(0, progressVal))) / 100}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute flex flex-col items-center justify-center">
                                <Loader2 className="h-7 w-7 text-cyan-500 animate-spin mb-1" />
                                <span className="text-xl font-bold text-slate-800 font-mono">{progressVal}%</span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="max-w-md space-y-2">
                          <p className={`text-sm font-bold uppercase tracking-wider ${statusVal === 'failed' ? 'text-rose-600' : 'text-slate-900'}`}>
                            {statusVal === 'failed'
                              ? 'TIẾN TRÌNH DỰNG VIDEO THẤT BẠI'
                              : statusVal === 'queued'
                                ? 'ĐANG CHỜ TRONG HÀNG ĐỢI...'
                                : isLocalRender
                                  ? 'ĐANG TIẾN HÀNH DỰNG VIDEO...'
                                  : 'ĐANG TẠO VIDEO TRÊN CLOUD...'}
                          </p>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {statusVal === 'failed'
                              ? 'Đã xảy ra lỗi trong quá trình xử lý hoặc kết xuất video. Vui lòng kiểm tra chi tiết lỗi bên dưới.'
                              : statusVal === 'queued'
                                ? 'Yêu cầu của bạn đã được đưa vào hàng đợi. Hệ thống sẽ tiến hành xử lý ngay khi có tài nguyên trống.'
                                : isLocalRender
                                  ? 'Hệ thống đang thực hiện xử lý hình ảnh, âm thanh và kết xuất tệp MP4 chất lượng cao tại local. Vui lòng đợi trong giây lát.'
                                  : 'Video đang được tạo bằng dịch vụ đám mây (Cloud). Quá trình này có thể mất vài phút.'}
                          </p>
                        </div>

                        {/* Progress Line Bar */}
                        <div className="w-full max-w-xs space-y-1">
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${statusVal === 'failed' ? 'bg-rose-500' : 'bg-cyan-600'}`}
                              style={{ width: `${progressVal}%` }}
                            />
                          </div>
                        </div>

                        {errorVal && (
                          <p className="text-xs text-rose-500 font-semibold bg-rose-50 border border-rose-100 px-4 py-2 rounded-2xl max-w-sm">
                            Lỗi render: {errorVal}
                          </p>
                        )}
                      </div>
                    );
                  })() : (outputUrl && !outputUrl.startsWith('pending://')) ? (
                    <div className="w-full h-full flex flex-col gap-4">
                      {isInlinePreviewSafe(outputUrl) ? (
                        <video key={outputUrl} controls src={outputUrl} className="w-full rounded-[24px] object-contain max-h-[300px] shadow-sm border border-slate-100" playsInline />
                      ) : (
                        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-[24px] border border-slate-100 bg-slate-50 px-4 py-10 text-center">
                          <p className="text-sm font-semibold text-slate-700">URL video nay khong cho phep preview inline.</p>
                          <a href={outputUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700">
                            Mo video trong tab moi
                          </a>
                        </div>
                      )}
                      <div className="flex gap-3 w-full">
                        <button
                          type="button"
                          onClick={handleDownloadVideo}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-sm"
                        >
                          <Download className="h-4 w-4 text-slate-500" />
                          Tải video
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Quay lại sửa kịch bản hiện tại (bằng cách xóa outputUrl)
                            setOutputUrl(null);
                            toast.success('Đã quay lại trình chỉnh sửa. Bạn có thể sửa trực tiếp kịch bản trên timeline và bấm kết xuất lại!');
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 cursor-pointer shadow-sm shadow-cyan-155"
                        >
                          <Wand2 className="h-4 w-4" />
                          Sửa tiếp kịch bản
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (outputUrl) {
                            setVideoInputs(prev => {
                              if (prev.some(item => item.url === outputUrl)) {
                                return prev;
                              }
                              return [...prev, { url: outputUrl, duration: 0 }];
                            });
                          }
                          setPrompt('');
                          setOptimizedData(null);
                          setBlueprint(null);
                          setOutputUrl(null);
                          setDisplayProgress(0);
                          toast.success('Đã thêm video kết quả vào danh sách video đầu vào. Hãy nhập ý tưởng mới để tiếp tục chỉnh sửa!');
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                      >
                        Dựng dự án mới từ video này
                      </button>
                    </div>
                  ) : (blueprint && !isHermes) ? (
                    renderInteractivePlayer()
                  ) : (
                    <div className="flex max-w-[320px] flex-col items-center gap-4">
                      <Film className="h-12 w-12" />
                      <p className="text-lg font-semibold text-slate-900">Sẵn sàng chỉnh sửa</p>
                      <p className="text-sm leading-6 text-slate-500">Video preview sẽ hiện sau khi hoàn thành render.</p>
                    </div>
                  )
                ) : (
                  <div className="flex max-w-[320px] flex-col items-center gap-4">
                    <Film className="h-12 w-12" />
                    <p className="text-lg font-semibold text-slate-900">Sẵn sàng chỉnh sửa</p>
                    <p className="text-sm leading-6 text-slate-500">Video preview sẽ hiện sau khi hoàn thành render.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Lịch sử tạo video</p>
                  <p className="mt-1 text-sm text-slate-500">Hiển thị tối đa 20 kết quả gần nhất, từ mới đến cũ.</p>
                </div>
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">{history.slice(0, 20).length}/20</span>
              </div>

              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                    Chưa có lịch sử tạo video.
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto pr-1 space-y-3">
                    {history.slice(0, 20).map((item) => (
                      <button
                        key={item._id || item.id || item.url}
                        type="button"
                        onClick={() => {
                          setOutputUrl(item.url);
                          setCurrentRecordId(item._id || item.id);
                          const provider = item.metadata?.provider;
                          if (provider === 'hermes-worker') {
                            setRenderEngine('hermes');
                          } else if (provider === 'hyperframe') {
                            setRenderEngine('hyperframe');
                          } else if (provider === 'remotion' || provider === 'local-render') {
                            setRenderEngine('remotion');
                          } else if (provider === 'claude-render') {
                            setRenderEngine('professional');
                          }
                          if (item.metadata?.blueprint) {
                            try {
                              const parsed = typeof item.metadata.blueprint === 'string'
                                ? JSON.parse(item.metadata.blueprint)
                                : item.metadata.blueprint;
                              setBlueprint(parsed);
                            } catch (e) {
                              console.error('Lỗi parse blueprint lịch sử:', e);
                              setBlueprint(null);
                            }
                          } else {
                            setBlueprint(null);
                          }
                        }}
                        className="w-full flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        <div className="relative h-20 w-28 overflow-hidden rounded-3xl bg-slate-100">
                          {isInlinePreviewSafe(item.url) ? (
                            <>
                              <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/25">
                                <Play className="h-5 w-5 text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center text-[8px] font-bold text-cyan-500 uppercase tracking-wider p-1 text-center">
                              <Loader2 className="h-4 w-4 animate-spin mb-1 text-cyan-500" />
                              ĐANG DỰNG {item.metadata?.progress !== undefined ? `${item.metadata.progress}%` : ''}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 line-clamp-2 leading-relaxed">{item.prompt || 'Video AI đã tạo'}</p>
                          <p className="mt-1 text-sm text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{item.aspectRatio || '16:9'}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{item.resolution || '720p'}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        )} {/* end workspaceMode !== 'script' */}

        {/* Optimized prompt is rendered contextually inside the edit form */}

        {showLibraryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
            <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">Thư viện video</p>
                  <p className="mt-1 text-sm text-slate-500">Chọn video đã tải lên để dùng làm nguồn đầu vào.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(false)}
                  className="rounded-full border border-slate-200 bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[560px] space-y-4 overflow-y-auto px-5 py-6">
                {history.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                    Chưa có video trong thư viện. Vui lòng tạo hoặc tải video lên trước.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {history.map((item) => (
                      <button
                        key={item._id || item.id || item.url}
                        type="button"
                        onClick={() => {
                          const duration = item.metadata?.duration ? Number(item.metadata.duration) : 0;
                          if (libraryModalTarget === 'reference') {
                            setReferenceVideo({ url: item.url, duration });
                          } else {
                            setVideoInputs(prev => [...prev, { url: item.url, duration }]);
                          }
                          setShowLibraryModal(false);
                        }}
                        className="group rounded-3xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
                      >
                        <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900">
                          {isInlinePreviewSafe(item.url) ? (
                            <>
                              <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                              <div className="absolute inset-0 bg-slate-950/20"></div>
                            </>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-[10px] font-bold text-cyan-450 uppercase tracking-widest">
                              <Loader2 className="h-5 w-5 animate-spin mb-1 text-cyan-500" />
                              Đang xử lý
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <p className="font-semibold text-slate-900 line-clamp-2 leading-relaxed">{item.prompt || 'Video đã tải lên'}</p>
                          <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {showPreviewModal && selectedPreviewUrl && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4 py-6"
            onClick={() => setShowPreviewModal(false)}
          >
            <div
              className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <p className="text-lg font-semibold text-white">Video đầu vào</p>
                  <p className="mt-1 text-xs text-slate-400">Xem trước video gốc của bạn.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="rounded-full border border-slate-800 bg-slate-800 p-2 text-slate-400 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 bg-black flex items-center justify-center">
                {isInlinePreviewSafe(selectedPreviewUrl) ? (
                  <video
                    src={selectedPreviewUrl}
                    controls
                    autoPlay
                    className="max-h-[500px] w-full rounded-2xl object-contain"
                    playsInline
                  />
                ) : (
                  <div className="flex w-full flex-col items-center justify-center gap-3 px-4 py-16 text-center text-slate-200">
                    <p className="text-sm font-semibold">Video nay khong ho tro preview inline do chinh sach CORS cua nguon.</p>
                    <a href={selectedPreviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-2xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700">
                      Mo video trong tab moi
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AudioSyncHook({
  activeAudio,
  currentTime,
  isPlaying,
  audioRef
}: {
  activeAudio: any;
  currentTime: number;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudio) return;

    audio.volume = activeAudio.volume !== undefined ? activeAudio.volume : 0.5;

    const shouldPlay = isPlaying && currentTime >= activeAudio.start && currentTime <= activeAudio.end;
    if (shouldPlay) {
      if (audio.paused) {
        audio.play().catch(e => console.log('Audio play failed:', e));
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }
  }, [currentTime, isPlaying, activeAudio, audioRef]);

  return null;
}
