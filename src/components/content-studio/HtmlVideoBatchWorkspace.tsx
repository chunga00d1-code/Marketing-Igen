import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Code2,
  Download,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  History,
  LayoutTemplate,
  MonitorPlay,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Paperclip,
  RefreshCcw,
  Settings2,
  Sliders,
  Sparkles,
  WandSparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  createHtmlVideoIdempotencyKey,
  htmlVideoRenderService,
  isActiveHtmlVideoStatus,
  pollHtmlVideoRender,
  type HtmlVideoAspectRatio,
} from "../../services/htmlVideoRenderService";
import { geminiApi } from "../../api/gemini";
import { toast } from "../../pages/Toast";
import { BRAND_LOGO_PATH, BRAND_NAME } from "../../config/brand";
import type {
  CandidateFilter,
  HtmlVideoCandidate,
  HtmlVideoReference,
} from "./html-video/types";
import {
  automaticDuration,
  candidateStatusClass,
  candidateStatusLabel,
  errorMessage,
  fileAsDataUrl,
  isCandidateActive,
  parseAiComposition,
  referenceKind,
  seekableCompositionDocument,
} from "./html-video/utils";

type HtmlVideoBatchService = Pick<
  typeof htmlVideoRenderService,
  "create" | "get" | "preview"
>;


const STORAGE_KEY = "igen:html-video:batch-workspace:v1";
const DEFAULT_PROJECT_NAME = "Video HTML AI mới";

const DEFAULT_RESOLUTION = "1080p" as const;
const DEFAULT_VARIATION_COUNT = 3;

const HTML_VIDEO_TEMPLATES = [
  { id: "brand-intro", name: "Giới thiệu thương hiệu", description: "Mở đầu ấn tượng, logo, thông điệp và CTA.", ratio: "9:16" as HtmlVideoAspectRatio, prompt: "Tạo video giới thiệu thương hiệu với phần mở đầu ấn tượng, làm nổi bật tên thương hiệu, thông điệp chính và CTA cuối video." },
  { id: "product-sale", name: "Ra mắt sản phẩm", description: "Tập trung sản phẩm, ưu đãi và nút hành động.", ratio: "9:16" as HtmlVideoAspectRatio, prompt: "Tạo video giới thiệu sản phẩm mới, làm nổi bật 3 lợi ích chính, ưu đãi nổi bật và CTA mua ngay." },
  { id: "education", name: "Video giải thích", description: "Trình bày vấn đề, giải pháp và kết luận rõ ràng.", ratio: "16:9" as HtmlVideoAspectRatio, prompt: "Tạo video giải thích ngắn gọn một chủ đề giáo dục, chia nội dung thành các bước trực quan, dễ hiểu và có phần tóm tắt cuối." },
  { id: "event-teaser", name: "Teaser sự kiện", description: "Nhịp nhanh, tạo sự mong đợi và ghi nhớ thời gian.", ratio: "1:1" as HtmlVideoAspectRatio, prompt: "Tạo teaser sự kiện với nhịp chuyển cảnh năng động, tên sự kiện, thời gian, địa điểm và CTA đăng ký tham dự." },
] as const;

function templateComposition(templateId: string) {
  const source = templateThumbnailPreview(templateId);
  const match = source.match(/^<style>([\s\S]*)<\/style>([\s\S]*)$/);
  return { css: match?.[1] || "", html: match?.[2] || source };
}

function templateThumbnailPreview(templateId: string) {
  const backgrounds: Record<string, string> = {
    "brand-intro": "linear-gradient(135deg,#020617,#1e3a8a 55%,#0ea5e9)",
    "product-sale": "linear-gradient(135deg,#9f1239,#f97316 58%,#fde68a)",
    education: "linear-gradient(135deg,#0c4a6e,#0f766e 55%,#5eead4)",
    "event-teaser": "linear-gradient(135deg,#3b0764,#c026d3 52%,#f9a8d4)",
  };
  const background = backgrounds[templateId] || backgrounds["brand-intro"];
  const copy: Record<string, { eyebrow: string; title: string; caption: string; cta: string; layout: string }> = {
    "brand-intro": { eyebrow: "THƯƠNG HIỆU", title: "Bứt phá khác biệt", caption: "Kể câu chuyện thương hiệu bằng chuyển động", cta: "Khám phá ngay", layout: "brand" },
    "product-sale": { eyebrow: "RA MẮT MỚI", title: "Ưu đãi 30%", caption: "Sản phẩm bạn chờ đợi đã xuất hiện", cta: "Mua ngay", layout: "sale" },
    education: { eyebrow: "GIẢI THÍCH NHANH", title: "3 bước dễ hiểu", caption: "Kiến thức ngắn gọn, trực quan và dễ nhớ", cta: "Xem bài học", layout: "education" },
    "event-teaser": { eyebrow: "SAVE THE DATE", title: "Sự kiện 2025", caption: "Một trải nghiệm đáng mong đợi đang đến", cta: "Đăng ký tham dự", layout: "event" },
  };
  const selectedCopy = copy[templateId] || copy["brand-intro"];
  return `<style>html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:${background};font-family:Inter,system-ui,sans-serif}.thumb{position:relative;width:100%;height:100%;overflow:hidden;color:white}.content{position:absolute;z-index:2;display:flex;flex-direction:column;gap:8px;max-width:78%;animation:enter .7s ease-out both}.brand .content{inset:22% 10%;justify-content:center;text-align:center;align-items:center}.sale .content{left:9%;top:18%;align-items:flex-start}.education .content{left:9%;bottom:14%;align-items:flex-start}.event .content{left:9%;right:9%;bottom:14%;align-items:flex-start}.eyebrow{margin:0;color:rgba(255,255,255,.72);font-size:9px;letter-spacing:.18em;font-weight:800}.title{margin:0;font-size:clamp(20px,5.2vw,44px);line-height:1.02;font-weight:900;letter-spacing:-.04em}.caption{margin:0;max-width:31ch;color:rgba(255,255,255,.76);font-size:clamp(9px,1.7vw,15px);line-height:1.35}.cta{margin-top:4px;border-radius:999px;background:rgba(255,255,255,.92);padding:6px 12px;color:#172554;font-size:10px;font-weight:800}.orb{position:absolute;border-radius:999px;filter:blur(1px);opacity:.72;animation:float 3.2s ease-in-out infinite alternate}.orb-a{width:48%;height:70%;left:-12%;top:35%;background:rgba(255,255,255,.24)}.orb-b{width:38%;height:56%;right:-10%;top:-20%;background:rgba(255,255,255,.18);animation-delay:-1.5s}.line{position:absolute;left:-10%;right:-10%;top:54%;height:2px;background:rgba(255,255,255,.42);transform:rotate(-18deg);box-shadow:0 14px 0 rgba(255,255,255,.18),0 -14px 0 rgba(255,255,255,.12);animation:sweep 2.8s ease-in-out infinite alternate}.frame{position:absolute;inset:16%;border:1px solid rgba(255,255,255,.36);border-radius:12px;transform:rotate(-7deg);animation:tilt 3s ease-in-out infinite alternate}.sale .frame{inset:12% 8% 12% 44%;border-color:rgba(255,255,255,.28);transform:rotate(8deg)}.education .frame{inset:12% 8% 32% 42%;border-radius:40% 12% 40% 12%;transform:rotate(6deg)}.event .frame{inset:10%;border-style:dashed;transform:rotate(0)}@keyframes enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes float{to{transform:translate(16px,-12px) scale(1.12)}}@keyframes sweep{to{transform:translateX(22px) rotate(-18deg)}}@keyframes tilt{to{transform:rotate(7deg) scale(1.06)}}</style><main class="thumb ${selectedCopy.layout}"><i class="orb orb-a"></i><i class="orb orb-b"></i><i class="line"></i><i class="frame"></i><section class="content"><p class="eyebrow">${selectedCopy.eyebrow}</p><h1 class="title">${selectedCopy.title}</h1><p class="caption">${selectedCopy.caption}</p><span class="cta">${selectedCopy.cta}</span></section></main>`;
}

export function HtmlVideoBatchWorkspace({
  service = htmlVideoRenderService,
}: {
  service?: HtmlVideoBatchService;
}) {
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<HtmlVideoAspectRatio>("16:9");
  const durationSeconds = automaticDuration(prompt);
  const resolution = DEFAULT_RESOLUTION;
  const autoRender = true;
  const [isCreating, setIsCreating] = useState(false);
  const [candidates, setCandidates] = useState<HtmlVideoCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<"prompt" | "settings" | "templates" | "history">("prompt");
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [hoveredHistoryCandidateId, setHoveredHistoryCandidateId] = useState<string | null>(null);
  const [references, setReferences] = useState<HtmlVideoReference[]>([]);
  const [referenceInputKey, setReferenceInputKey] = useState(0);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState<string | null>(null);
  const [previewPlaybackNonce, setPreviewPlaybackNonce] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewElapsed, setPreviewElapsed] = useState(0);
  const [previewFrameElapsed, setPreviewFrameElapsed] = useState(0);
  const pollControllersRef = useRef(new Map<string, AbortController>());
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewElapsedRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const updateReference = (referenceId: string, update: Partial<HtmlVideoReference>) => {
    setReferences((current) => current.map((reference) => reference.id === referenceId ? { ...reference, ...update } : reference));
  };

  const analyzeReference = async (file: File, reference: HtmlVideoReference) => {
    try {
      const dataUrl = await fileAsDataUrl(file);
      if (reference.kind === "image") {
        const analysis = await geminiApi.optimizeVideoPrompt(
          "Phân tích ảnh tham chiếu này: phong cách, bố cục, màu sắc, thông điệp và animation phù hợp cho video HTML.",
          [dataUrl]
        );
        updateReference(reference.id, { status: "ready", context: JSON.stringify(analysis).slice(0, 12_000) });
        return;
      }
      if (reference.kind === "video") {
        const response = await fetch("/api/v1/media/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("accessToken") || ""}` },
          body: JSON.stringify({ file: dataUrl, folder: "igen_erp/html-video-references" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.url !== "string") throw new Error(payload.message || "Không thể tải video mẫu.");
        const analysis = await geminiApi.analyzeVideoStyle(payload.url, 0, undefined, undefined, "Phân tích phong cách, nhịp độ, bố cục và chuyển động để làm video HTML tương tự.");
        updateReference(reference.id, { status: "ready", context: analysis.extractedPrompt.slice(0, 12_000) });
        return;
      }
      const fileBase64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const uploaded = await geminiApi.uploadLocalDocument(file.name, fileBase64, file.type || "application/octet-stream");
      if (typeof uploaded.text !== "string" || !uploaded.text.trim()) throw new Error("Không thể trích xuất nội dung từ tài liệu.");
      updateReference(reference.id, { status: "ready", context: uploaded.text.slice(0, 12_000) });
    } catch (error) {
      updateReference(reference.id, { status: "failed", error: errorMessage(error, "Không thể phân tích tệp tham chiếu.") });
    }
  };

  const handleReferenceFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const available = Math.max(0, 6 - references.length);
    const selected = Array.from(files).slice(0, available);
    if (selected.length < files.length) toast.warning("Tối đa 6 tài liệu tham chiếu cho mỗi lần tạo video.");
    const next = selected.map((file) => ({ id: crypto.randomUUID(), name: file.name, kind: referenceKind(file), status: "analyzing" as const, context: "", error: null }));
    setReferences((current) => [...current, ...next]);
    next.forEach((reference, index) => void analyzeReference(selected[index], reference));
    setReferenceInputKey((current) => current + 1);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as Partial<{
        projectName: string;
        candidates: HtmlVideoCandidate[];
      }>;
      if (typeof value.projectName === "string" && value.projectName.trim()) {
        setProjectName(value.projectName);
      }
      if (Array.isArray(value.candidates)) {
        setCandidates(value.candidates);
        setSelectedCandidateId(value.candidates[0]?.id || null);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ projectName, candidates })
    );
  }, [candidates, projectName]);

  useEffect(
    () => () => {
      pollControllersRef.current.forEach((controller) => controller.abort());
      pollControllersRef.current.clear();
    },
    []
  );

  const updateCandidate = (
    candidateId: string,
    update: Partial<HtmlVideoCandidate>
  ) => {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, ...update } : candidate
      )
    );
  };

  const startRenderPolling = (candidateId: string, renderId: string) => {
    pollControllersRef.current.get(candidateId)?.abort();
    const controller = new AbortController();
    pollControllersRef.current.set(candidateId, controller);
    void pollHtmlVideoRender({
      renderId,
      signal: controller.signal,
      getRender: service.get,
      onUpdate: (render) => {
        updateCandidate(candidateId, {
          render,
          status: render.status,
          error: render.error,
        });
      },
    })
      .then((render) => {
        if (render.status === "completed") {
          toast.success("Một video đã render xong.");
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        updateCandidate(candidateId, {
          status: "failed",
          error: errorMessage(error, "Không thể theo dõi quá trình render."),
        });
      })
      .finally(() => {
        if (pollControllersRef.current.get(candidateId) === controller) {
          pollControllersRef.current.delete(candidateId);
        }
      });
  };

  const enqueueRender = async (candidate: HtmlVideoCandidate) => {
    if (!candidate.html || !candidate.preview || isCandidateActive(candidate.status)) {
      return;
    }
    updateCandidate(candidate.id, { status: "queued", error: null });
    try {
      const render = await service.create({
        html: candidate.html,
        css: candidate.css,
        durationSeconds,
        aspectRatio,
        resolution,
        idempotencyKey: createHtmlVideoIdempotencyKey(),
      });
      updateCandidate(candidate.id, {
        render,
        status: render.status,
        error: render.error,
      });
      if (isActiveHtmlVideoStatus(render.status)) {
        startRenderPolling(candidate.id, render.id);
      }
    } catch (error) {
      updateCandidate(candidate.id, {
        status: "failed",
        error: errorMessage(error, "Không thể đưa video vào hàng đợi render."),
      });
    }
  };

  const generateCandidate = async (
    candidate: HtmlVideoCandidate,
    position: number
  ) => {
    try {
      const systemInstruction = [
        "Bạn là chuyên gia thiết kế video marketing bằng HTML/CSS.",
        "Tạo một bản dựng video hoàn chỉnh, dễ đọc ở tỷ lệ được yêu cầu, có animation CSS an toàn.",
        "Chỉ trả JSON hợp lệ: {\"html\": \"...\", \"css\": \"...\"}. Không dùng markdown, script, iframe hoặc URL không đáng tin cậy.",
      ].join(" ");
      const response = await geminiApi.sendChatMessage(
        `${candidate.prompt}\n\nBiến thể #${position}: hãy tạo góc triển khai khác các biến thể còn lại, nhưng giữ đúng thông điệp và CTA.`,
        [],
        { systemInstruction }
      );
      const composition = parseAiComposition(response.text);
      const preview = await service.preview({
        html: composition.html,
        css: composition.css,
        durationSeconds,
        aspectRatio,
        resolution,
      });
      const readyCandidate: HtmlVideoCandidate = {
        ...candidate,
        html: composition.html,
        css: composition.css,
        preview,
        status: "ready",
      };
      updateCandidate(candidate.id, readyCandidate);
      if (autoRender) {
        await enqueueRender(readyCandidate);
      }
    } catch (error) {
      updateCandidate(candidate.id, {
        status: "failed",
        error: errorMessage(error, "Không thể tạo bản dựng video bằng AI."),
      });
    }
  };

  const handleCreateBatch = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isCreating) return;
    setIsCreating(true);
    const referenceContext = references
      .filter((reference) => reference.status === "ready" && reference.context)
      .map((reference) => `TÀI LIỆU THAM CHIẾU — ${reference.name}:\n${reference.context}`)
      .join("\n\n");
    const batchPrompt = [
      trimmedPrompt,
      "Tự chọn phong cách marketing phù hợp với nội dung và tài liệu tham chiếu.",
      referenceContext ? `Hãy dùng các tài liệu tham chiếu sau làm nguồn sự thật và phong cách:\n${referenceContext}` : "",
    ].filter(Boolean).join("\n\n");
    const createdAt = new Date().toISOString();
    const nextCandidates = Array.from({ length: DEFAULT_VARIATION_COUNT }, (_, index) => ({
      id: `html-video-candidate-${crypto.randomUUID()}`,
      label: `Biến thể ${index + 1}`,
      prompt: batchPrompt,
      html: "",
      css: "",
      status: "generating" as const,
      preview: null,
      render: null,
      error: null,
      createdAt,
    }));
    setCandidates((current) => [...nextCandidates, ...current]);
    setSelectedCandidateId(nextCandidates[0]?.id || null);
    setPrompt("");

    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < nextCandidates.length) {
        const index = nextIndex;
        nextIndex += 1;
        await generateCandidate(nextCandidates[index], index + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, nextCandidates.length) }, worker));
    setIsCreating(false);
    toast.success(
      autoRender
        ? "Đã tạo bản dựng và đưa các video hợp lệ vào hàng đợi."
        : "Đã tạo các bản dựng để bạn duyệt trước khi render."
    );
  };

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [candidates, selectedCandidateId]
  );
  const activeDuration = selectedCandidate ? automaticDuration(selectedCandidate.prompt) : 0;
  const timelineScaleDuration = Math.max(40, Math.ceil(activeDuration / 10) * 10);
  const seekTimelinePosition = (clientX: number) => {
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!bounds || activeDuration <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    const nextElapsed = Math.min(activeDuration, ratio * timelineScaleDuration);
    previewElapsedRef.current = nextElapsed;
    setPreviewElapsed(nextElapsed);
    setPreviewFrameElapsed(nextElapsed);
    setIsPreviewPlaying(false);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = nextElapsed;
      previewVideoRef.current.pause();
    }
  };
  const handleTimelinePlay = () => {
    if (previewVideoRef.current) {
      if (previewVideoRef.current.paused) {
        void previewVideoRef.current.play().catch(() => undefined);
        setIsPreviewPlaying(true);
      } else {
        previewVideoRef.current.pause();
        setIsPreviewPlaying(false);
      }
      return;
    }
    if (isPreviewPlaying) {
      setPreviewFrameElapsed(previewElapsedRef.current);
      setIsPreviewPlaying(false);
      return;
    }
    if (previewElapsedRef.current >= activeDuration) {
      previewElapsedRef.current = 0;
      setPreviewElapsed(0);
    }
    setPreviewFrameElapsed(previewElapsedRef.current);
    setPreviewPlaybackNonce((current) => current + 1);
    setIsPreviewPlaying(true);
  };

  useEffect(() => {
    const selectedId = selectedCandidate?.id;
    if (!isPreviewPlaying || previewVideoRef.current || !selectedId || activeDuration <= 0) return;
    let frame = 0;
    let lastUiUpdate = 0;
    const startedAt = performance.now() - previewElapsedRef.current * 1000;
    const tick = (now: number) => {
      const elapsed = Math.min(activeDuration, (now - startedAt) / 1000);
      previewElapsedRef.current = elapsed;
      if (now - lastUiUpdate >= 50 || elapsed >= activeDuration) {
        lastUiUpdate = now;
        setPreviewElapsed(elapsed);
      }
      if (elapsed >= activeDuration) {
        setPreviewFrameElapsed(activeDuration);
        setIsPreviewPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeDuration, isPreviewPlaying, selectedCandidate?.id]);

  useEffect(() => {
    previewElapsedRef.current = 0;
    setPreviewElapsed(0);
    setPreviewFrameElapsed(0);
    setIsPreviewPlaying(false);
  }, [selectedCandidateId]);
  const timelineSegments = useMemo(() => {
    if (!selectedCandidate || !activeDuration) return [];
    const visualCount = references.filter((reference) => reference.kind === "image" || reference.kind === "video").length;
    const segmentCount = Math.max(3, Math.min(8, visualCount + 2));
    const segmentDuration = activeDuration / segmentCount;
    const tones = ["from-indigo-200 to-sky-200", "from-sky-200 to-cyan-200", "from-amber-200 to-orange-200", "from-violet-200 to-fuchsia-200"];
    return Array.from({ length: segmentCount }, (_, index) => ({
      id: `${selectedCandidate.id}-scene-${index}`,
      start: index * segmentDuration,
      duration: segmentDuration,
      tone: tones[index % tones.length],
    }));
  }, [activeDuration, references, selectedCandidate]);
  const mediaTimelineSegments = useMemo(() => {
    if (!selectedCandidate || !activeDuration) return [];
    const visualReferences = references.filter((reference) => reference.kind === "image" || reference.kind === "video");
    return visualReferences.map((reference, index) => ({
      id: `${selectedCandidate.id}-media-${reference.id}`,
      start: index * (activeDuration / visualReferences.length),
      duration: activeDuration / visualReferences.length,
      tone: reference.kind === "video" ? "from-violet-300 to-indigo-300" : "from-amber-200 to-orange-200",
    }));
  }, [activeDuration, references, selectedCandidate]);
  const filteredCandidates = useMemo(() => {
    if (filter === "active") {
      return candidates.filter((candidate) => isCandidateActive(candidate.status));
    }
    if (filter === "completed") {
      return candidates.filter((candidate) => candidate.status === "completed");
    }
    if (filter === "failed") {
      return candidates.filter((candidate) => candidate.status === "failed");
    }
    return candidates;
  }, [candidates, filter]);
  const summary = useMemo(
    () => ({
      active: candidates.filter((candidate) => isCandidateActive(candidate.status)).length,
      completed: candidates.filter((candidate) => candidate.status === "completed").length,
      failed: candidates.filter((candidate) => candidate.status === "failed").length,
    }),
    [candidates]
  );

  const createNewProject = () => {
    pollControllersRef.current.forEach((controller) => controller.abort());
    pollControllersRef.current.clear();
    setProjectName(DEFAULT_PROJECT_NAME);
    setPrompt("");
    setCandidates([]);
    setSelectedCandidateId(null);
  };

  const handleUseTemplate = async (template: (typeof HTML_VIDEO_TEMPLATES)[number]) => {
    setPrompt(template.prompt);
    setAspectRatio(template.ratio);
    setActiveTool("prompt");
    const source = templateComposition(template.id);
    const candidateId = `html-video-template-${crypto.randomUUID()}`;
    const draft: HtmlVideoCandidate = {
      id: candidateId,
      label: `${template.name} · Mẫu`,
      prompt: template.prompt,
      html: source.html,
      css: source.css,
      status: "generating",
      preview: null,
      render: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    setCandidates((current) => [draft, ...current]);
    setSelectedCandidateId(candidateId);
    try {
      const preview = await service.preview({
        html: source.html,
        css: source.css,
        durationSeconds: automaticDuration(template.prompt),
        aspectRatio: template.ratio,
        resolution,
      });
      updateCandidate(candidateId, { preview, status: "ready" });
      toast.success(`Đã mở màn hình preview: ${template.name}`);
    } catch (error) {
      updateCandidate(candidateId, { status: "failed", error: errorMessage(error, "Không thể mở preview mẫu.") });
    }
  };

  const openCandidateInEditor = (candidate: HtmlVideoCandidate) => {
    setSelectedCandidateId(candidate.id);
    setPrompt(candidate.prompt);
    setSidebarOpen(true);
  };

  const handleRefreshPreview = async () => {
    if (!selectedCandidate?.html) return;
    updateCandidate(selectedCandidate.id, { status: "generating", error: null });
    try {
      const preview = await service.preview({
        html: selectedCandidate.html,
        css: selectedCandidate.css,
        durationSeconds,
        aspectRatio,
        resolution,
      });
      updateCandidate(selectedCandidate.id, { preview, status: "ready" });
      toast.success("Đã cập nhật bản dựng an toàn.");
    } catch (error) {
      updateCandidate(selectedCandidate.id, {
        status: "failed",
        error: errorMessage(error, "Không thể cập nhật bản dựng."),
      });
    }
  };

  return (
    <div data-testid="html-video-workspace" className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden bg-white text-slate-800">
      <nav className="flex w-[76px] shrink-0 flex-col border-r border-slate-200 bg-white py-3">
        <button type="button" onClick={() => window.history.back()} className="mb-3 flex items-center justify-center transition-transform hover:scale-105" title="Quay lại Video Studio">
          <div className="relative"><img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-11 w-11 rounded-2xl border border-blue-100 bg-white object-cover shadow-md shadow-blue-500/10" /><span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white"><ArrowLeft className="h-2.5 w-2.5" /></span></div>
        </button>
        {[
          { id: "prompt" as const, label: "Prompt AI", icon: WandSparkles },
          { id: "settings" as const, label: "Khung hình", icon: Sliders },
          { id: "templates" as const, label: "Mẫu", icon: LayoutTemplate },
          { id: "history" as const, label: "Lịch sử", icon: History },
        ].map((tool) => {
          const Icon = tool.icon;
          return <button key={tool.id} type="button" onClick={() => { setActiveTool(tool.id); setSidebarOpen(true); }} className={`mx-2 mb-1 flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${activeTool === tool.id && sidebarOpen ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-5 w-5" /><span className="text-[10px]">{tool.label}</span></button>;
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-4 py-3 text-white shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => window.history.back()} className="rounded-xl p-2 text-white/80 transition hover:bg-white/15 hover:text-white" title="Quay lại Video Studio">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="w-full max-w-xs bg-transparent text-base font-black text-white outline-none" aria-label="Tên dự án video" />
            <p className="text-xs font-medium text-white/70">AI tạo HTML, sau đó tự render video ở nền.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-white">{summary.active} đang xử lý</span>
          <span className="rounded-full bg-emerald-400/20 px-3 py-1.5 text-emerald-50">{summary.completed} hoàn tất</span>
          <button type="button" onClick={createNewProject} className="rounded-xl bg-white/10 px-3 py-2 text-white transition hover:bg-white/20">Dự án mới</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`relative min-h-0 overflow-y-auto border-b border-slate-200 bg-white p-5 transition-[width] duration-200 lg:border-b-0 lg:border-r ${sidebarOpen ? "w-[320px]" : "w-0 overflow-hidden border-r-0 p-0"}`}>
          {activeTool === "templates" ? <div><h2 className="mb-4 text-lg font-extrabold text-slate-900">Mẫu video</h2><div className="grid grid-cols-2 gap-3">{HTML_VIDEO_TEMPLATES.map((template) => <button key={template.id} type="button" onClick={() => void handleUseTemplate(template)} onMouseEnter={() => setHoveredTemplateId(template.id)} onMouseLeave={() => setHoveredTemplateId(null)} className="group overflow-hidden rounded-xl border border-slate-200 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md" title={template.name}><div className={`relative aspect-video overflow-hidden ${template.id === "brand-intro" ? "bg-gradient-to-br from-slate-950 via-indigo-900 to-sky-500" : template.id === "product-sale" ? "bg-gradient-to-br from-rose-700 via-orange-500 to-amber-300" : template.id === "education" ? "bg-gradient-to-br from-sky-900 via-cyan-700 to-emerald-400" : "bg-gradient-to-br from-violet-950 via-fuchsia-700 to-pink-400"}`}>{hoveredTemplateId === template.id ? <iframe title={`Video preview ${template.name}`} sandbox="" srcDoc={templateThumbnailPreview(template.id)} className="pointer-events-none absolute inset-0 h-full w-full border-0" /> : <><span className="absolute -bottom-5 -left-5 h-20 w-20 rounded-full bg-white/20 blur-sm" /><span className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-white/15 blur-sm" /><span className="absolute left-[-10%] top-1/2 h-px w-[120%] -rotate-12 bg-white/35 shadow-[0_14px_0_rgba(255,255,255,0.18),0_-14px_0_rgba(255,255,255,0.12)]" /><span className="absolute inset-[18%] rounded-xl border border-white/35 -rotate-6" /></>}</div></button>)}</div></div> : activeTool === "prompt" ? <>
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><WandSparkles className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-black text-slate-900">Tạo video bằng AI</h2><p className="text-xs text-slate-500">Prompt-first, không cần viết code.</p></div>
          </div>
          <label className="block text-xs font-semibold text-slate-700">Bạn muốn video nói gì?</label>
          <div className="relative mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
            {references.length > 0 ? <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto border-b border-slate-200/80 bg-white/70 px-3 py-2">{references.map((reference) => <div key={reference.id} className="flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pl-1.5 pr-1 text-xs shadow-sm"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">{reference.kind === "image" ? <ImageIcon className="h-3 w-3" /> : reference.kind === "video" ? <MonitorPlay className="h-3 w-3" /> : <FileText className="h-3 w-3" />}</span><span className="max-w-28 truncate font-medium text-slate-700">{reference.name}</span>{reference.status === "analyzing" ? <LoaderCircle className="h-3 w-3 animate-spin text-indigo-500" /> : reference.status === "failed" ? <span className="text-[10px] text-rose-600">Lỗi</span> : <span className="text-[10px] text-emerald-600">Đã đọc</span>}<button type="button" onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600" title="Bỏ tài liệu"><X className="h-3 w-3" /></button></div>)}</div> : null}
            <textarea id="html-video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ví dụ: Video 15 giây giới thiệu ưu đãi khai trương, nhấn mạnh giảm 30%, CTA đăng ký ngay..." className="min-h-36 w-full resize-y bg-transparent px-3 py-3 text-sm font-normal leading-6 text-slate-700 outline-none placeholder:font-normal placeholder:text-slate-400" disabled={isCreating} />
            <div className="flex h-10 items-center border-t border-slate-200/80 px-2"><label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-indigo-700" title="Đính kèm PDF, Word, Sheet, Markdown, ảnh hoặc video mẫu"><Paperclip className="h-4 w-4" /><input id="html-video-reference-input" key={referenceInputKey} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.md,.txt,.json,image/*,video/*" className="hidden" onChange={(event) => handleReferenceFiles(event.target.files)} /></label><span className="ml-1 text-[10px] font-normal text-slate-400">Tài liệu, ảnh hoặc video mẫu</span></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Khung hiện tại: <button type="button" onClick={() => setActiveTool("settings")} className="font-semibold text-indigo-700 hover:underline">{aspectRatio}</button>. Thời lượng, phong cách và chất lượng được AI tự điều chỉnh.</p>
          <button type="button" onClick={() => void handleCreateBatch()} disabled={!prompt.trim() || isCreating} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 text-sm font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
            {isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isCreating ? "Đang tạo bản dựng..." : "Tạo video bằng AI"}
          </button>
          <p className="mt-3 text-center text-[11px] leading-4 text-slate-500">AI tự tạo các phương án HTML, chọn thời lượng phù hợp rồi render ở nền.</p>
          </> : activeTool === "settings" ? <div className="space-y-5"><div><h2 className="text-lg font-extrabold text-slate-900">Khung hình</h2><p className="mt-1 text-sm text-slate-500">Đây là thiết lập duy nhất bạn cần chọn trước khi tạo video.</p></div><div className="grid grid-cols-3 gap-2">{(["9:16", "1:1", "16:9"] as HtmlVideoAspectRatio[]).map((ratio) => <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} className={`rounded-xl border px-2 py-3 text-xs font-black ${aspectRatio === ratio ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>{ratio}</button>)}</div><div className="rounded-2xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-800">AI sẽ tự chọn thời lượng, phong cách, số phương án và chất lượng render phù hợp với prompt.</div></div> : <div><h2 className="text-lg font-extrabold text-slate-900">Lịch sử video</h2><p className="mt-1 text-sm text-slate-500">Rê chuột để xem, bấm để mở dự án.</p><div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-[10px] font-bold">{(["all", "active", "completed", "failed"] as CandidateFilter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-lg px-2 py-1.5 transition ${filter === item ? "bg-white text-sky-700 shadow-sm" : "text-slate-500"}`}>{item === "all" ? "Tất cả" : item === "active" ? "Đang xử lý" : item === "completed" ? "Hoàn tất" : "Cần xử lý"}</button>)}</div><div className="mt-4 grid grid-cols-2 gap-3">{filteredCandidates.length === 0 ? <p className="col-span-2 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Chưa có video nào.</p> : filteredCandidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => openCandidateInEditor(candidate)} onMouseEnter={() => setHoveredHistoryCandidateId(candidate.id)} onMouseLeave={() => setHoveredHistoryCandidateId(null)} className={`group min-w-0 text-left ${selectedCandidateId === candidate.id ? "text-indigo-700" : "text-slate-700"}`} title={`Mở ${candidate.label}`}><div className={`relative aspect-video overflow-hidden rounded-xl border bg-slate-900 transition group-hover:-translate-y-0.5 group-hover:shadow-md ${selectedCandidateId === candidate.id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200"}`}>{candidate.preview ? <iframe key={`${candidate.id}-${hoveredHistoryCandidateId === candidate.id ? "playing" : "paused"}`} title={`Preview ${candidate.label}`} sandbox="" srcDoc={seekableCompositionDocument(candidate.preview.compositionHtml, 0, hoveredHistoryCandidateId === candidate.id)} className="pointer-events-none absolute inset-0 h-full w-full border-0" /> : <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-sky-700" />}{isCandidateActive(candidate.status) ? <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40"><LoaderCircle className="h-5 w-5 animate-spin text-white" /></div> : null}</div><p className="mt-1.5 truncate text-xs font-bold">{candidate.label}</p><p className="truncate text-[10px] text-slate-500">{candidateStatusLabel(candidate)}</p></button>)}</div></div>}
          <button type="button" onClick={() => setSidebarOpen((current) => !current)} className="absolute -right-4 top-20 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:text-indigo-600" title={sidebarOpen ? "Ẩn bảng tùy chọn" : "Mở bảng tùy chọn"}>{sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
        </aside>

        <main className="min-w-0 overflow-y-auto bg-[#f4f5f7] p-5 sm:p-6">
          {selectedCandidate ? <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-black text-slate-900">{selectedCandidate.label}</h2><p className="text-[11px] text-slate-500">Canvas video · {aspectRatio} · AI tự căn thời lượng</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${candidateStatusClass(selectedCandidate.status)}`}>{candidateStatusLabel(selectedCandidate)}</span></div>
            <div className="flex min-h-[280px] items-center justify-center bg-[#eef0f4] p-6">{selectedCandidate.status === "completed" && selectedCandidate.render?.outputUrl ? <video ref={previewVideoRef} controls playsInline preload="metadata" src={selectedCandidate.render.outputUrl} onTimeUpdate={(event) => { previewElapsedRef.current = event.currentTarget.currentTime; setPreviewElapsed(event.currentTarget.currentTime); }} onPlay={() => setIsPreviewPlaying(true)} onPause={() => setIsPreviewPlaying(false)} onEnded={() => { previewElapsedRef.current = activeDuration; setIsPreviewPlaying(false); setPreviewElapsed(activeDuration); }} className="max-h-[360px] max-w-full rounded-lg bg-black object-contain shadow-xl" /> : selectedCandidate.preview ? <iframe key={`${selectedCandidate.id}-${previewPlaybackNonce}-${isPreviewPlaying ? "playing" : previewFrameElapsed.toFixed(2)}`} title={`Canvas ${selectedCandidate.label}`} sandbox="" srcDoc={seekableCompositionDocument(selectedCandidate.preview.compositionHtml, previewFrameElapsed, isPreviewPlaying)} style={{ aspectRatio: `${selectedCandidate.preview.width} / ${selectedCandidate.preview.height}` }} className="max-h-[360px] w-full max-w-3xl border-0 bg-black shadow-xl" /> : <div className="flex flex-col items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-6 w-6 animate-spin text-indigo-500" />{candidateStatusLabel(selectedCandidate)}</div>}</div>
            <div className="border-t border-slate-100 bg-white px-4 pb-4 pt-3">
              <div className="flex items-center justify-center gap-3 text-xs text-slate-500"><span>0:{String(Math.floor(previewElapsed)).padStart(2, "0")}</span><button type="button" onClick={handleTimelinePlay} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:scale-105 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label={isPreviewPlaying ? "Tạm dừng preview video" : "Phát preview video"} title={isPreviewPlaying ? "Tạm dừng preview video" : "Phát preview video"}>{isPreviewPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}</button><span>0:{String(activeDuration).padStart(2, "0")}</span></div>
              <div className="mt-4 overflow-x-auto pb-1">
                <div className="min-w-[680px]">
                  <div className="flex items-end justify-between border-b border-slate-200 pb-1 text-[10px] text-slate-500">{Array.from({ length: (timelineScaleDuration / 10) + 1 }, (_, index) => <span key={index}>{index * 10} giây</span>)}</div>
                  <div ref={timelineRef} className="relative mt-1 space-y-1.5">
                    <div className="relative h-12 rounded-xl bg-slate-100/90 p-1"><div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-700" />{timelineSegments.map((clip) => <button key={clip.id} type="button" onClick={() => setSelectedTimelineClipId(clip.id)} title={`Cảnh ${clip.start.toFixed(1)}s – ${(clip.start + clip.duration).toFixed(1)}s`} style={{ left: `calc(${(clip.start / timelineScaleDuration) * 100}% + 4px)`, width: `calc(${(clip.duration / timelineScaleDuration) * 100}% - 8px)` }} className={`absolute top-1 h-10 min-w-12 rounded-lg border bg-gradient-to-r ${clip.tone} ${selectedTimelineClipId === clip.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-white/80"}`} aria-label="Chọn cảnh" />)}</div>
                    <div className="relative h-12 rounded-xl bg-slate-100/90 p-1"><div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-300" />{mediaTimelineSegments.length > 0 ? mediaTimelineSegments.map((clip) => <button key={clip.id} type="button" onClick={() => setSelectedTimelineClipId(clip.id)} style={{ left: `calc(${(clip.start / timelineScaleDuration) * 100}% + 4px)`, width: `calc(${(clip.duration / timelineScaleDuration) * 100}% - 8px)` }} className={`absolute top-1 h-10 min-w-12 rounded-lg border bg-gradient-to-r ${clip.tone} ${selectedTimelineClipId === clip.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-white/80"}`} aria-label="Chọn phương tiện" />) : <button type="button" onClick={() => document.getElementById("html-video-reference-input")?.click()} className="flex h-full w-full items-center gap-3 px-2 text-left text-xs font-semibold text-slate-600"><ImageIcon className="h-5 w-5 text-slate-500" /><span>Hoặc kéo và thả phương tiện</span></button>}</div>
                    <button type="button" onClick={() => toast.info("Bạn có thể thêm nhạc nền sau khi AI dựng xong video.")} className="relative flex h-12 w-full items-center gap-3 rounded-xl bg-slate-100/90 px-3 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-200"><Volume2 className="h-5 w-5 text-slate-500" /><span>Thêm âm thanh</span><span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-300" /></button>
                    <button type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekTimelinePosition(event.clientX); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekTimelinePosition(event.clientX); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} style={{ left: `${Math.min(100, (previewElapsed / timelineScaleDuration) * 100)}%` }} className="absolute -top-2 bottom-0 z-30 w-4 -translate-x-1/2 cursor-ew-resize touch-none" aria-label="Kéo thanh tiến độ"><span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-900 shadow-sm" /><span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-sm bg-slate-900" /></button>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-sm font-black text-slate-900">Chỉnh sửa bản dựng</h3><p className="mt-0.5 text-[11px] text-slate-500">Cập nhật HTML/CSS rồi xem trước trước khi render video.</p></div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void enqueueRender(selectedCandidate)} disabled={!selectedCandidate.preview || isCandidateActive(selectedCandidate.status) || selectedCandidate.status === "completed"} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200"><Play className="h-3.5 w-3.5" />Render video</button><button type="button" onClick={() => void generateCandidate({ ...selectedCandidate, status: "generating", error: null }, 1)} disabled={isCandidateActive(selectedCandidate.status)} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCcw className="h-3.5 w-3.5" />Tạo lại</button>{selectedCandidate.render?.outputUrl ? <a href={selectedCandidate.render.outputUrl} target="_blank" rel="noreferrer" download className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700"><Download className="h-3.5 w-3.5" />Tải video</a> : null}</div>
              </div>
              <details className="mt-3 rounded-xl border border-slate-200"><summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-black text-slate-700"><Code2 className="h-4 w-4 text-sky-600" />Tinh chỉnh HTML/CSS nâng cao</summary><div className="grid gap-3 border-t border-slate-100 p-3 lg:grid-cols-2"><label className="block text-[11px] font-bold text-slate-600">Nội dung HTML<textarea value={selectedCandidate.html} onChange={(event) => updateCandidate(selectedCandidate.id, { html: event.target.value, status: "ready", render: null })} className="mt-1 h-32 w-full resize-y rounded-lg border border-slate-200 bg-slate-950 p-2 font-mono text-[11px] text-sky-100 outline-none focus:border-sky-400" spellCheck={false} /></label><label className="block text-[11px] font-bold text-slate-600">CSS & animation<textarea value={selectedCandidate.css} onChange={(event) => updateCandidate(selectedCandidate.id, { css: event.target.value, status: "ready", render: null })} className="mt-1 h-32 w-full resize-y rounded-lg border border-slate-200 bg-slate-950 p-2 font-mono text-[11px] text-emerald-100 outline-none focus:border-sky-400" spellCheck={false} /></label><button type="button" onClick={() => void handleRefreshPreview()} className="lg:col-span-2 flex h-9 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 text-xs font-black text-sky-700"><Settings2 className="h-3.5 w-3.5" />Cập nhật bản dựng</button></div></details>
            </div>
          </section> : null}
          {!selectedCandidate ? <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex min-h-[330px] items-center justify-center bg-[#eef0f4] p-6"><div className="aspect-video w-full max-w-2xl bg-white shadow-xl" /></div><div className="border-t border-slate-100 bg-white px-4 pb-4 pt-3"><div className="flex items-center justify-center gap-3 text-xs text-slate-500"><span>0:00</span><button type="button" disabled className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full bg-slate-900 text-white opacity-90" aria-label="Chưa có preview video"><Play className="h-4 w-4 fill-current" /></button><span>0:05</span></div><div className="mt-4 overflow-x-auto pb-1"><div className="min-w-[680px]"><div className="flex items-end justify-between border-b border-slate-200 pb-1 text-[10px] text-slate-500">{[0, 10, 20, 30, 40, 50].map((second) => <span key={second}>{second} giây</span>)}</div><div className="mt-1 space-y-1.5"><button type="button" onClick={() => { setActiveTool("prompt"); setSidebarOpen(true); requestAnimationFrame(() => document.getElementById("html-video-prompt")?.focus()); }} className="relative flex h-12 w-full items-center gap-3 rounded-xl bg-slate-100/90 px-3 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-200"><Code2 className="h-5 w-5 text-slate-500" /><span>Thêm thành phần</span><span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-700" /></button><button type="button" onClick={() => { setActiveTool("prompt"); setSidebarOpen(true); requestAnimationFrame(() => document.getElementById("html-video-reference-input")?.click()); }} className="relative flex h-12 w-full items-center gap-3 rounded-xl bg-slate-100/90 px-3 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-200"><ImageIcon className="h-5 w-5 text-slate-500" /><span>Hoặc kéo và thả phương tiện</span><span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-300" /></button><button type="button" onClick={() => toast.info("Bạn có thể thêm nhạc nền sau khi AI dựng xong video.")} className="relative flex h-12 w-full items-center gap-3 rounded-xl bg-slate-100/90 px-3 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-200"><Volume2 className="h-5 w-5 text-slate-500" /><span>Thêm âm thanh</span><span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-slate-300" /></button></div></div></div></div></section> : null}
        </main>
      </div>

      </div>
    </div>
  );
}
