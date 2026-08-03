/* eslint-disable react-refresh/only-export-components */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Code2,
  Download,
  LoaderCircle,
  Play,
  ShieldCheck,
  ArrowLeft,
  History,
  LayoutTemplate,
  WandSparkles,
  Undo2,
  Redo2,
  FilePlus2,
  CloudCheck,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sliders,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  AlertCircle
} from "lucide-react";
import {
  htmlVideoRenderService,
  type HtmlVideoAspectRatio,
  type HtmlVideoPreview,
  type HtmlVideoRenderDetail,
  type HtmlVideoRenderStatus,
  type HtmlVideoResolution,
} from "../../services/htmlVideoRenderService";
import { BRAND_LOGO_PATH, BRAND_NAME } from "../../config/brand";
import { toast } from "../../pages/Toast";
import { geminiApi } from "../../api/gemini";

const defaultHtml = `<main class="hero">
  <p class="eyebrow">iGen Marketing</p>
  <h1>Biến ý tưởng thành video</h1>
  <p class="description">Thiết kế bằng HTML và CSS, kết xuất thành MP4.</p>
</main>`;

const defaultCss = `.hero {
  width: 100%;
  height: 100%;
  display: grid;
  place-content: center;
  gap: 20px;
  padding: 80px;
  color: white;
  text-align: center;
  background: linear-gradient(135deg, #0f172a, #2563eb);
}
.eyebrow { color: #93c5fd; font-size: 28px; letter-spacing: 0.2em; }
h1 { margin: 0; font-size: 72px; animation: rise 1s ease-out both; }
.description { margin: 0; font-size: 30px; color: #dbeafe; }
@keyframes rise {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}`;

type HtmlVideoWorkspaceService = Pick<
  typeof htmlVideoRenderService,
  "preview" | "create" | "get"
>;

type PollHtmlVideoRenderOptions = {
  renderId: string;
  signal: AbortSignal;
  getRender: (renderId: string, signal: AbortSignal) => Promise<HtmlVideoRenderDetail>;
  onUpdate: (detail: HtmlVideoRenderDetail) => void;
  wait?: (signal: AbortSignal) => Promise<void>;
};

function abortError() {
  return new DOMException("Polling aborted.", "AbortError");
}

function defaultPollWait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, 2_000);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function isActiveHtmlVideoStatus(status?: HtmlVideoRenderStatus | null) {
  return status === "queued" || status === "rendering" || status === "uploading";
}

export function createHtmlVideoIdempotencyKey() {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `html_video_${unique}`;
}

export async function pollHtmlVideoRender({
  renderId,
  signal,
  getRender,
  onUpdate,
  wait = defaultPollWait,
}: PollHtmlVideoRenderOptions): Promise<HtmlVideoRenderDetail> {
  while (true) {
    await wait(signal);
    if (signal.aborted) throw abortError();
    const detail = await getRender(renderId, signal);
    if (signal.aborted) throw abortError();
    onUpdate(detail);
    if (!isActiveHtmlVideoStatus(detail.status)) return detail;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type HtmlVideoPreset = {
  id: string;
  name: string;
  description: string;
  html: string;
  css: string;
};

const HTML_VIDEO_PRESETS: HtmlVideoPreset[] = [
  {
    id: "hero",
    name: "Giới thiệu thương hiệu (Brand Intro)",
    description: "Hiệu ứng chữ bay lên trên nền gradient chuyển động.",
    html: `<main class="hero">
  <p class="eyebrow">iGen Marketing</p>
  <h1>Biến ý tưởng thành video</h1>
  <p class="description">Thiết kế bằng HTML và CSS, kết xuất thành MP4.</p>
</main>`,
    css: `.hero {
  width: 100%;
  height: 100%;
  display: grid;
  place-content: center;
  gap: 20px;
  padding: 80px;
  color: white;
  text-align: center;
  background: linear-gradient(135deg, #0f172a, #2563eb);
}
.eyebrow { color: #93c5fd; font-size: 28px; letter-spacing: 0.2em; }
h1 { margin: 0; font-size: 72px; animation: rise 1s ease-out both; }
.description { margin: 0; font-size: 30px; color: #dbeafe; }
@keyframes rise {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}`
  },
  {
    id: "sale",
    name: "Khuyến mãi cuối tuần (Weekend Sale)",
    description: "Thẻ giá nổi bật với viền neon nhấp nháy cho chiến dịch sale.",
    html: `<main class="sale-container">
  <div class="sale-badge">WEEKEND SALE</div>
  <h1 class="discount">GIẢM 50%</h1>
  <p class="tagline">Tất cả sản phẩm tại cửa hàng</p>
  <button class="cta-btn">Mua Ngay</button>
</main>`,
    css: `.sale-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #09090b;
  color: #fff;
  font-family: system-ui, sans-serif;
  overflow: hidden;
}
.sale-badge {
  background: #e11d48;
  color: white;
  padding: 8px 16px;
  font-size: 24px;
  font-weight: 800;
  border-radius: 99px;
  letter-spacing: 0.1em;
  animation: pulse 1.5s infinite alternate;
}
.discount {
  font-size: 96px;
  font-weight: 900;
  margin: 20px 0;
  background: linear-gradient(to right, #fbbf24, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30px rgba(245, 158, 11, 0.3);
}
.tagline {
  font-size: 28px;
  color: #a1a1aa;
  margin-bottom: 30px;
}
.cta-btn {
  background: white;
  color: black;
  border: none;
  padding: 16px 32px;
  font-size: 24px;
  font-weight: 700;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(255, 255, 255, 0.15);
}
@keyframes pulse {
  from { transform: scale(0.95); box-shadow: 0 0 10px rgba(225, 29, 72, 0.5); }
  to { transform: scale(1.05); box-shadow: 0 0 20px rgba(225, 29, 72, 0.8); }
}`
  },
  {
    id: "neon",
    name: "Bảng hiệu Neon (Neon Signboard)",
    description: "Hiệu ứng phát sáng neon huyền ảo, thích hợp cho sự kiện tối.",
    html: `<main class="neon-board">
  <div class="glow-title">GRAND OPENING</div>
  <div class="glow-sub">ĐÊM NHẠC HỘI</div>
</main>`,
    css: `.neon-board {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #020205;
  color: #fff;
  font-family: sans-serif;
}
.glow-title {
  font-size: 72px;
  font-weight: 900;
  color: #fff;
  text-shadow: 
    0 0 7px #fff,
    0 0 10px #fff,
    0 0 21px #0fa,
    0 0 42px #0fa,
    0 0 82px #0fa,
    0 0 92px #0fa,
    0 0 102px #0fa,
    0 0 151px #0fa;
  animation: flicker 2s infinite alternate;
}
.glow-sub {
  font-size: 32px;
  margin-top: 20px;
  color: #fff;
  text-shadow: 
    0 0 7px #fff,
    0 0 10px #fff,
    0 0 21px #f0f,
    0 0 42px #f0f,
    0 0 82px #f0f;
}
@keyframes flicker {
  0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% {
    text-shadow: 
      0 0 4px #fff,
      0 0 11px #fff,
      0 0 19px #fff,
      0 0 40px #0fa,
      0 0 80px #0fa,
      0 0 90px #0fa,
      0 0 100px #0fa,
      0 0 150px #0fa;
  }
  20%, 24%, 55% {       
    text-shadow: none;
  }
}`
  }
];

const cleanAndParseAiJson = (text: string) => {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
  }
  cleaned = cleaned.trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.html === "string" && typeof parsed.css === "string") {
    return parsed as { html: string; css: string };
  }
  throw new Error("Dữ liệu AI trả về không đúng định dạng mong đợi.");
};

export function LegacyHtmlVideoWorkspace({
  service = htmlVideoRenderService,
}: {
  service?: HtmlVideoWorkspaceService;
}) {
  const [html, setHtml] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("igen:html-video:html") || defaultHtml;
    }
    return defaultHtml;
  });
  const [css, setCss] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("igen:html-video:css") || defaultCss;
    }
    return defaultCss;
  });
  const [templateName, setTemplateName] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("igen:html-video:name") || "Dự án video HTML";
    }
    return "Dự án video HTML";
  });

  const [durationSeconds, setDurationSeconds] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<HtmlVideoAspectRatio>("16:9");
  const [resolution, setResolution] = useState<HtmlVideoResolution>("720p");
  
  const [preview, setPreview] = useState<HtmlVideoPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  
  const [render, setRender] = useState<HtmlVideoRenderDetail | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  const pollControllerRef = useRef<AbortController | null>(null);
  const submissionGenerationRef = useRef(0);

  // New UI states matching Bulk Create layout
  const [activeTool, setActiveTool] = useState<"editor" | "settings" | "templates" | "ai" | "history">("editor");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Interactive zoom states
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  
  // History of codes (Undo / Redo)
  const [historyList, setHistoryList] = useState<Array<{ html: string; css: string }>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyTimeoutRef = useRef<number | null>(null);

  // Session rendering history list
  const [renders, setRenders] = useState<HtmlVideoRenderDetail[]>([]);
  const [selectedRenderId, setSelectedRenderId] = useState<string | null>(null);

  // AI assistant states
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Auto-save triggers
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("igen:html-video:html", html);
    }
  }, [html]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("igen:html-video:css", css);
    }
  }, [css]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("igen:html-video:name", templateName);
    }
  }, [templateName]);

  // Init undo history
  useEffect(() => {
    setHistoryList([{ html, css }]);
    setHistoryIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushToHistory = (newHtml: string, newCss: string) => {
    if (historyTimeoutRef.current) {
      window.clearTimeout(historyTimeoutRef.current);
    }
    historyTimeoutRef.current = window.setTimeout(() => {
      setHistoryList((current) => {
        const nextList = current.slice(0, historyIndex + 1);
        const last = nextList[nextList.length - 1];
        if (last && last.html === newHtml && last.css === newCss) return current;
        
        const updated = [...nextList, { html: newHtml, css: newCss }];
        if (updated.length > 50) updated.shift();
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    }, 800);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = historyList[historyIndex - 1];
      setHtml(prev.html);
      setCss(prev.css);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < historyList.length - 1) {
      const next = historyList[historyIndex + 1];
      setHtml(next.html);
      setCss(next.css);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const createNewProject = () => {
    if (window.confirm("Bạn có chắc chắn muốn tạo dự án mới? Mọi mã hiện tại sẽ được reset.")) {
      setHtml(defaultHtml);
      setCss(defaultCss);
      setTemplateName("Dự án video HTML mới");
      setHistoryList([{ html: defaultHtml, css: defaultCss }]);
      setHistoryIndex(0);
      toast.success("Đã khởi tạo dự án mới.");
    }
  };

  const loadPreset = (preset: HtmlVideoPreset) => {
    setHtml(preset.html);
    setCss(preset.css);
    setHistoryList((current) => {
      const next = current.slice(0, historyIndex + 1);
      const updated = [...next, { html: preset.html, css: preset.css }];
      setHistoryIndex(updated.length - 1);
      return updated;
    });
    toast.success(`Đã tải mẫu: ${preset.name}`);
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const systemInstruction = `Bạn là một chuyên gia thiết kế HTML/CSS. Hãy viết một khối mã HTML và CSS theo yêu cầu của người dùng để làm video (sử dụng animation CSS). Chỉ trả về mã JSON có định dạng: { "html": "...", "css": "..." } mà không có markdown, không có bất kỳ văn bản giải thích nào khác.`;
      const response = await geminiApi.sendChatMessage(
        aiPrompt,
        [],
        { systemInstruction }
      );
      const parsed = cleanAndParseAiJson(response.text);
      setHtml(parsed.html);
      setCss(parsed.css);
      pushToHistory(parsed.html, parsed.css);
      toast.success("AI đã tạo mã thành công!");
      setAiPrompt("");
    } catch (error) {
      setAiError(errorMessage(error, "Không thể tạo mã bằng AI. Vui lòng mô tả lại chi tiết hơn."));
    } finally {
      setAiLoading(false);
    }
  };

  // Safe preview rendering triggers
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPreviewLoading(true);
      void service
        .preview(
          { html, css, durationSeconds, aspectRatio, resolution },
          controller.signal
        )
        .then((nextPreview) => {
          if (controller.signal.aborted) return;
          setPreview(nextPreview);
          setPreviewError("");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPreviewError(
            errorMessage(error, "Không thể tạo bản xem trước an toàn.")
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [aspectRatio, css, durationSeconds, html, resolution, service]);

  useEffect(
    () => () => {
      pollControllerRef.current?.abort();
      submissionGenerationRef.current += 1;
    },
    []
  );

  const handleSubmitRender = async () => {
    if (submitting || isActiveHtmlVideoStatus(render?.status)) return;

    pollControllerRef.current?.abort();
    const controller = new AbortController();
    pollControllerRef.current = controller;
    const generation = submissionGenerationRef.current + 1;
    submissionGenerationRef.current = generation;
    setSubmitting(true);
    setSubmitError("");

    const newRenderId = createHtmlVideoIdempotencyKey();
    const mockCreated: HtmlVideoRenderDetail = {
      id: newRenderId,
      status: "queued",
      progress: 0,
      stageMessage: "Đang xếp hàng...",
      aspectRatio,
      resolution,
      durationSeconds,
      outputUrl: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setRender(mockCreated);
    setSelectedRenderId(mockCreated.id);
    setRenders((current) => [mockCreated, ...current]);
    setActiveTool("history");

    try {
      const created = await service.create(
        {
          html,
          css,
          durationSeconds,
          aspectRatio,
          resolution,
          idempotencyKey: newRenderId,
        },
        controller.signal
      );
      if (submissionGenerationRef.current !== generation) return;
      
      setRender(created);
      setRenders((current) => current.map((item) => item.id === newRenderId ? created : item));

      if (isActiveHtmlVideoStatus(created.status)) {
        const result = await pollHtmlVideoRender({
          renderId: created.id,
          signal: controller.signal,
          getRender: service.get,
          onUpdate: (detail) => {
            if (submissionGenerationRef.current === generation) {
              setRender(detail);
              setRenders((current) => current.map((item) => item.id === detail.id ? detail : item));
            }
          },
        });
        if (result.status === "completed") {
          toast.success("Video đã được kết xuất thành công!");
        } else if (result.status === "failed") {
          toast.error(result.error || "Kết xuất video thất bại.");
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (submissionGenerationRef.current === generation) {
        const errorMsg = errorMessage(error, "Không thể kết xuất video HTML.");
        setSubmitError(errorMsg);
        setRender((current) => {
          if (!current) return null;
          const failedDetail = { ...current, status: "failed" as const, error: errorMsg };
          setRenders((rendersList) => rendersList.map((item) => item.id === failedDetail.id ? failedDetail : item));
          return failedDetail;
        });
      }
    } finally {
      if (submissionGenerationRef.current === generation) {
        setSubmitting(false);
      }
    }
  };

  const active = isActiveHtmlVideoStatus(render?.status);

  // Resize listener for zoom calculation
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const canvasSize = useMemo(() => {
    const is1080 = resolution === "1080p";
    if (aspectRatio === "16:9") {
      return is1080 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
    } else if (aspectRatio === "9:16") {
      return is1080 ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
    } else {
      return is1080 ? { width: 1080, height: 1080 } : { width: 720, height: 720 };
    }
  }, [aspectRatio, resolution]);

  const fitZoomPercent = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) return 50;
    const padding = 64;
    const availableWidth = Math.max(100, viewportSize.width - padding);
    const availableHeight = Math.max(100, viewportSize.height - padding);
    
    const targetW = preview?.width || canvasSize.width;
    const targetH = preview?.height || canvasSize.height;

    const scale = Math.min(availableWidth / targetW, availableHeight / targetH);
    return Math.min(100, Math.max(10, Math.floor(scale * 100)));
  }, [viewportSize, preview, canvasSize]);

  useEffect(() => {
    if (zoomMode === "fit") {
      setZoomPercent(fitZoomPercent);
    }
  }, [fitZoomPercent, zoomMode]);

  const closeWorkspace = () => {
    window.history.pushState(null, "", "/video-studio");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleSelectHistoryRender = (selected: HtmlVideoRenderDetail) => {
    setSelectedRenderId(selected.id);
  };

  const activeRenderDetail = selectedRenderId 
    ? renders.find((r) => r.id === selectedRenderId) || render
    : render;

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden bg-white text-slate-800">
      {/* Left Navigation Bar */}
      <nav className="flex w-[76px] shrink-0 flex-col border-r border-slate-200 bg-white py-3 items-center justify-between">
        <div className="w-full flex flex-col items-center">
          <button
            type="button"
            onClick={closeWorkspace}
            className="mb-6 flex items-center justify-center transition-transform hover:scale-105"
            title="Quay lại Video Studio"
          >
            <div className="relative">
              <img
                src={BRAND_LOGO_PATH}
                alt={BRAND_NAME}
                className="h-11 w-11 rounded-2xl border border-blue-100 bg-white object-cover shadow-md shadow-blue-500/10"
              />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white">
                <ArrowLeft className="h-2.5 w-2.5" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("editor");
              setSidebarOpen(true);
            }}
            className={`mx-2 mb-2 flex h-[68px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${
              activeTool === "editor" && sidebarOpen
                ? "bg-sky-50 text-sky-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Code2 className="h-5 w-5" />
            <span className="text-[10px]">Soạn thảo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("settings");
              setSidebarOpen(true);
            }}
            className={`mx-2 mb-2 flex h-[68px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${
              activeTool === "settings" && sidebarOpen
                ? "bg-sky-50 text-sky-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sliders className="h-5 w-5" />
            <span className="text-[10px]">Cấu hình</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("templates");
              setSidebarOpen(true);
            }}
            className={`mx-2 mb-2 flex h-[68px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${
              activeTool === "templates" && sidebarOpen
                ? "bg-sky-50 text-sky-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <LayoutTemplate className="h-5 w-5" />
            <span className="text-[10px]">Mẫu</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("ai");
              setSidebarOpen(true);
            }}
            className={`mx-2 mb-2 flex h-[68px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${
              activeTool === "ai" && sidebarOpen
                ? "bg-sky-50 text-sky-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <WandSparkles className="h-5 w-5" />
            <span className="text-[10px]">Thiết kế AI</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool("history");
              setSidebarOpen(true);
            }}
            className={`mx-2 mb-2 flex h-[68px] w-[60px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${
              activeTool === "history" && sidebarOpen
                ? "bg-sky-50 text-sky-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <History className="h-5 w-5" />
            <span className="text-[10px]">Lịch sử</span>
          </button>
        </div>
      </nav>

      {/* Sidebar Section */}
      <aside
        className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ${
          sidebarOpen ? "w-[400px]" : "w-0 border-r-0"
        }`}
      >
        <div className="flex min-h-0 w-[400px] flex-1 flex-col p-5">
          {/* Editor Panel */}
          <div className={activeTool === "editor" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-slate-900">Trình soạn thảo HTML & CSS</h3>
              <p className="text-xs text-slate-500 mt-1">Viết mã HTML và CSS để xây dựng video của bạn.</p>
            </div>

            <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
              <label className="flex flex-col h-1/2 min-h-[180px] text-xs font-bold text-slate-700 gap-1.5">
                <span>Nội dung HTML</span>
                <textarea
                  value={html}
                  onChange={(event) => {
                    setHtml(event.target.value);
                    pushToHistory(event.target.value, css);
                  }}
                  className="flex-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-sky-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  spellCheck={false}
                  maxLength={100 * 1024}
                  placeholder="Nhập mã HTML vào đây..."
                />
              </label>

              <label className="flex flex-col h-1/2 min-h-[180px] text-xs font-bold text-slate-700 gap-1.5">
                <span>CSS &amp; animation</span>
                <textarea
                  value={css}
                  onChange={(event) => {
                    setCss(event.target.value);
                    pushToHistory(html, event.target.value);
                  }}
                  className="flex-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  spellCheck={false}
                  maxLength={100 * 1024}
                  placeholder="Nhập mã CSS vào đây..."
                />
              </label>
            </div>
          </div>

          {/* Settings Panel */}
          <div className={activeTool === "settings" ? "flex flex-col flex-1 min-h-0 gap-6" : "hidden"}>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Cấu hình video</h3>
              <p className="text-xs text-slate-500 mt-1">Điều chỉnh kích thước, tỷ lệ và thời lượng video.</p>
            </div>

            {/* Aspect Ratio Card Selector */}
            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-700">Tỷ lệ khung hình</span>
              <div className="grid grid-cols-3 gap-2">
                {(["16:9", "9:16", "1:1"] as HtmlVideoAspectRatio[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition ${
                      aspectRatio === ratio
                        ? "border-sky-500 bg-sky-50/50 text-sky-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <div
                      className={`border-2 border-current rounded-sm mb-1.5 ${
                        ratio === "16:9"
                          ? "w-8 h-5"
                          : ratio === "9:16"
                          ? "w-5 h-8"
                          : "w-6 h-6"
                      }`}
                    />
                    <span className="text-xs font-bold">{ratio}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution Option Cards */}
            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-700">Độ phân giải</span>
              <div className="grid grid-cols-2 gap-2">
                {(["720p", "1080p"] as HtmlVideoResolution[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setResolution(res)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition ${
                      resolution === res
                        ? "border-sky-500 bg-sky-50/50 text-sky-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <span className="text-sm font-extrabold">{res}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      {res === "720p"
                        ? aspectRatio === "16:9"
                          ? "1280 x 720"
                          : aspectRatio === "9:16"
                          ? "720 x 1280"
                          : "720 x 720"
                        : aspectRatio === "16:9"
                        ? "1920 x 1080"
                        : aspectRatio === "9:16"
                        ? "1080 x 1920"
                        : "1080 x 1080"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Slider / Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-slate-700">Thời lượng</span>
                <span className="text-xs font-extrabold text-sky-700">{durationSeconds}s</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(Number(event.target.value))}
                  className="flex-1 h-1.5 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-sky-600"
                />
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={durationSeconds}
                  onChange={(event) =>
                    setDurationSeconds(
                      Math.min(60, Math.max(1, Number(event.target.value) || 1))
                    )
                  }
                  className="h-9 w-16 rounded-xl border border-slate-200 text-center text-sm font-extrabold outline-none focus:border-sky-400"
                />
              </div>
            </div>
          </div>

          {/* Templates Panel */}
          <div className={activeTool === "templates" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-slate-900">Mẫu thiết kế video</h3>
              <p className="text-xs text-slate-500 mt-1">Bắt đầu nhanh với các bố cục HTML/CSS thiết kế sẵn.</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {HTML_VIDEO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadPreset(preset)}
                  className="w-full text-left p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition flex flex-col gap-1.5"
                >
                  <span className="text-sm font-extrabold text-slate-800">{preset.name}</span>
                  <span className="text-xs text-slate-500 leading-normal">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI Panel */}
          <div className={activeTool === "ai" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-slate-900">Trợ lý thiết kế AI</h3>
              <p className="text-xs text-slate-500 mt-1">Mô tả giao diện bạn mong muốn để AI tự tạo mã HTML/CSS.</p>
            </div>

            <div className="space-y-4">
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="Ví dụ: Tạo banner giới thiệu sản phẩm mới màu vàng kim, tiêu đề chính chạy hiệu ứng từ trái sang phải..."
                className="w-full min-h-32 rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-sky-400 placeholder:text-slate-400 text-slate-700"
                disabled={aiLoading}
              />

              {aiError ? (
                <div className="text-xs font-semibold text-rose-600 bg-rose-50 p-3 rounded-xl flex items-start gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={aiLoading || !aiPrompt.trim()}
                className="w-full flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 text-sm font-extrabold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {aiLoading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="h-4 w-4" />
                )}
                {aiLoading ? "Đang viết code..." : "Tạo code bằng AI"}
              </button>
            </div>
          </div>

          {/* History Panel */}
          <div className={activeTool === "history" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <div className="mb-4">
              <h3 className="text-base font-extrabold text-slate-900">Lịch sử kết xuất</h3>
              <p className="text-xs text-slate-500 mt-1">Các video đã tạo trong phiên làm việc này.</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {renders.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center">
                  <p className="text-xs font-bold">Chưa có video nào được tạo.</p>
                  <p className="text-[10px] mt-1 text-slate-400">Ấn kết xuất video ở góc trên bên phải để bắt đầu.</p>
                </div>
              ) : (
                renders.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectHistoryRender(item)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      selectedRenderId === item.id
                        ? "border-sky-500 bg-sky-50/50 shadow-xs"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-350"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-black text-slate-700 truncate">
                        Video #{renders.length - idx} ({item.aspectRatio}, {item.durationSeconds}s)
                      </span>
                      <span className={`inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded-md mt-1.5 ${
                        item.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "failed"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {item.status === "completed"
                          ? "Hoàn thành"
                          : item.status === "failed"
                          ? "Lỗi"
                          : "Đang chạy..."}
                      </span>
                    </div>
                    {item.status === "completed" && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Sidebar Toggle Button */}
      <div className="relative z-30 w-0 shrink-0">
        <button
          type="button"
          onClick={() => setSidebarOpen((current) => !current)}
          className={`absolute top-20 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:text-sky-600 ${
            sidebarOpen ? "left-0 translate-x-1/2" : "left-4"
          }`}
          title={sidebarOpen ? "Ẩn bảng tùy chọn" : "Mở bảng tùy chọn"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-[#f4f5f7]">
        {/* Header Bar */}
        <header className="relative flex h-14 shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-sky-600 via-sky-600 to-indigo-600 px-4 text-white shadow-sm">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={closeWorkspace}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-extrabold transition-colors hover:bg-white/20"
              title="Quay lại Video Studio"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Quay lại</span>
            </button>
            <span className="h-5 w-px bg-white/20" />

            {/* Undo / Redo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="rounded-lg p-2.5 hover:bg-white/15 disabled:opacity-30"
              title="Hoàn tác"
            >
              <Undo2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= historyList.length - 1}
              className="rounded-lg p-2.5 hover:bg-white/15 disabled:opacity-30"
              title="Làm lại"
            >
              <Redo2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={createNewProject}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-extrabold hover:bg-white/15"
              title="Dự án mới"
            >
              <FilePlus2 className="h-4 w-4" />
              <span className="hidden xl:inline">Tạo mới</span>
            </button>
          </div>

          {/* Design Name Input & Auto Save status */}
          <div className="flex max-w-xs flex-1 min-w-[120px] flex-col items-center justify-center md:max-w-md">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Dự án video HTML"
              className="w-full rounded-lg border-0 border-b border-transparent bg-transparent px-2 py-0.5 text-center text-sm font-extrabold text-white outline-none transition placeholder-white/50 hover:border-white/20 hover:bg-white/10 focus:border-white focus:bg-white/15"
              title="Đổi tên thiết kế"
            />
            <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-white/70">
              <CloudCheck className="h-3 w-3" />
              <span>Đã tự động lưu</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmitRender}
              disabled={submitting || active || previewLoading || Boolean(previewError)}
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-sky-700 shadow-sm hover:bg-sky-50 disabled:bg-white/30 disabled:text-white/70"
            >
              {submitting || active ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>Kết xuất video</span>
            </button>
          </div>
        </header>

        {/* Viewport Canvas Area */}
        <div ref={viewportRef} className="flex-1 relative flex items-center justify-center overflow-hidden p-6 select-none bg-[#090b11]">
          {/* Grid visual details */}
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

          {/* Canvas Wrapper */}
          <div
            className="relative flex items-center justify-center transition-transform duration-100 shadow-2xl bg-black"
            style={{
              width: preview?.width || canvasSize.width,
              height: preview?.height || canvasSize.height,
              maxWidth: "100%",
              maxHeight: "100%",
              transform: `scale(${zoomPercent / 100})`,
              transformOrigin: "center center",
            }}
          >
            {/* Show rendered video if selected and ready, otherwise show preview iframe */}
            {activeRenderDetail?.status === "completed" && activeRenderDetail.outputUrl ? (
              <div className="w-full h-full bg-black relative flex flex-col items-center justify-center">
                <video
                  controls
                  src={activeRenderDetail.outputUrl}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : preview ? (
              <iframe
                title="Xem trước video HTML"
                sandbox=""
                srcDoc={preview.compositionHtml}
                style={{
                  width: "100%",
                  height: "100%",
                  border: 0,
                  background: "#000",
                }}
              />
            ) : (
              <div className="text-center text-sm text-slate-400 p-8 max-w-md">
                {previewLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <LoaderCircle className="h-8 w-8 animate-spin text-sky-500" />
                    <span>Đang tạo bản xem trước...</span>
                  </div>
                ) : (
                  <span>{previewError || "Chưa có bản xem trước. Hãy cấu hình HTML/CSS."}</span>
                )}
              </div>
            )}

            {/* Rendering Overlay */}
            {active && activeRenderDetail && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-6 z-20">
                <LoaderCircle className="h-10 w-10 animate-spin text-sky-500 mb-4" />
                <p className="text-base font-extrabold">{activeRenderDetail.stageMessage || "Đang xử lý..."}</p>
                <div className="mt-3 w-48 h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-[width] duration-300"
                    style={{ width: `${activeRenderDetail.progress}%` }}
                  />
                </div>
                <span className="text-xs font-black text-sky-400 mt-1.5">{activeRenderDetail.progress}%</span>
              </div>
            )}
          </div>

          {/* Floating Actions on Preview / Result */}
          {activeRenderDetail?.status === "completed" && activeRenderDetail.outputUrl && (
            <div className="absolute top-6 left-6 z-40 flex gap-2">
              <span className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-black px-3 py-1.5 rounded-full shadow-lg">
                <ShieldCheck className="h-4 w-4" />
                Kết quả hoàn tất
              </span>
              <a
                href={activeRenderDetail.outputUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="flex items-center gap-1.5 bg-slate-900 text-white text-xs font-black px-3.5 py-1.5 rounded-full shadow-lg hover:bg-slate-800 transition"
              >
                <Download className="h-4 w-4" />
                Mở hoặc tải video
              </a>
            </div>
          )}

          {submitError ? (
            <div className="absolute top-6 left-6 z-40 max-w-sm rounded-xl bg-rose-600 text-white p-3.5 shadow-lg text-xs font-bold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{submitError}</span>
            </div>
          ) : null}

          {/* Zoom controls at bottom right */}
          <div className="absolute bottom-6 right-6 z-40 flex items-center bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-1 shadow-md text-slate-700">
            <button
              type="button"
              onClick={() => {
                setZoomMode("manual");
                setZoomPercent((current) => Math.max(10, current - 10));
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs font-extrabold px-2.5 min-w-[54px] text-center select-none">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => {
                setZoomMode("manual");
                setZoomPercent((current) => Math.min(200, current + 10));
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="h-4 w-px bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={() => {
                setZoomMode("fit");
                setZoomPercent(fitZoomPercent);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition flex items-center gap-1 text-[10px] font-bold text-sky-700 cursor-pointer"
              title="Khớp màn hình"
            >
              <Maximize2 className="h-4 w-4" />
              <span>Tự động</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export { HtmlVideoBatchWorkspace as HtmlVideoWorkspace } from "./HtmlVideoBatchWorkspace";
