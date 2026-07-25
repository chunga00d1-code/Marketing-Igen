import {
  AlertCircle,
  AudioLines,
  BookOpenCheck,
  Captions,
  CheckCircle2,
  Clock3,
  Download,
  FileVideo,
  History,
  Layers3,
  Link2,
  LoaderCircle,
  MonitorPlay,
  Plus,
  RefreshCw,
  Save,
  UploadCloud,
  Volume2,
  VolumeX,
  XCircle,
  Play,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VideoCaptionMode,
  VideoCaptionProjectStatus,
  VideoCaptionSegmentDto,
  VideoCaptionStyle,
} from "../../../shared/video-caption.contract";
import {
  videoCaptionService,
  type VideoCaptionContextOptions,
  type VideoCaptionProjectDetailDto,
  type VideoCaptionProjectDto,
} from "../../services/videoCaptionService";
import { CompanyKnowledgePanel } from "./CompanyKnowledgePanel";

const ACTIVE_STATUSES = new Set<VideoCaptionProjectStatus>([
  "queued_analysis",
  "analyzing",
  "transcribing",
  "generating_context",
  "queued_render",
  "rendering",
  "retrying",
]);

const STATUS_LABELS: Record<
  VideoCaptionProjectStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Bản nháp",
    className: "bg-slate-100 text-slate-600",
  },
  queued_analysis: {
    label: "Đang chờ phân tích",
    className: "bg-amber-50 text-amber-700",
  },
  analyzing: {
    label: "Đang phân tích",
    className: "bg-cyan-50 text-cyan-700",
  },
  transcribing: {
    label: "Đang nhận diện lời nói",
    className: "bg-violet-50 text-violet-700",
  },
  generating_context: {
    label: "Đang tạo chữ ngữ cảnh",
    className: "bg-violet-50 text-violet-700",
  },
  ready_for_review: {
    label: "Sẵn sàng",
    className: "bg-emerald-50 text-emerald-700",
  },
  queued_render: {
    label: "Chờ kết xuất",
    className: "bg-amber-50 text-amber-700",
  },
  rendering: {
    label: "Đang kết xuất",
    className: "bg-blue-50 text-blue-700",
  },
  completed: {
    label: "Hoàn thành",
    className: "bg-emerald-50 text-emerald-700",
  },
  retrying: {
    label: "Đang thử lại",
    className: "bg-amber-50 text-amber-700",
  },
  failed: {
    label: "Cần xử lý",
    className: "bg-rose-50 text-rose-700",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-slate-100 text-slate-500",
  },
};

const MODE_OPTIONS: Array<{
  id: VideoCaptionMode;
  title: string;
  description: string;
}> = [
  {
    id: "speech",
    title: "Phụ đề theo lời nói",
    description: "Nhận diện giọng nói và đặt đúng thời gian.",
  },
  {
    id: "context",
    title: "Chữ AI theo ngữ cảnh",
    description: "Dùng nội dung bài viết và tri thức doanh nghiệp.",
  },
  {
    id: "combined",
    title: "Kết hợp hai loại",
    description: "Hai lane riêng để tránh đè chữ lên nhau.",
  },
];

function modeIcon(mode: VideoCaptionMode) {
  if (mode === "speech") return AudioLines;
  if (mode === "context") return BookOpenCheck;
  return Layers3;
}

function formatDuration(durationMs?: number) {
  if (!durationMs) return "Chưa xác định";
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "Chưa xác định";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function projectDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function millisecondsToSeconds(value: number) {
  return Number((value / 1000).toFixed(2));
}

function formatMillisecondsToTimestamp(ms: number) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

export function VideoCaptionWorkspace() {
  const [projects, setProjects] = useState<VideoCaptionProjectDto[]>([]);
  const [detail, setDetail] =
    useState<VideoCaptionProjectDetailDto | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadProgressRef = useRef(0);
  const uploadTargetRef = useRef(0);
  const uploadProgressTimerRef = useRef<number | null>(null);
  const uploadProgressResolverRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [sourceType, setSourceType] = useState<"upload" | "url">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setLocalVideoUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setLocalVideoUrl(null);
    }
  }, [selectedFile]);

  const [contextOptions, setContextOptions] =
    useState<VideoCaptionContextOptions>({
      contents: [],
      campaigns: [],
    });
  const [sourceUrl, setSourceUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [mode, setMode] = useState<VideoCaptionMode>("speech");
  const [selectedName, setSelectedName] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerUrl, setPlayerUrl] = useState("");
  const [playerDurationMs, setPlayerDurationMs] = useState<number>();
  const [playerDurationWarning, setPlayerDurationWarning] = useState("");
  const [segmentSearchQuery, setSegmentSearchQuery] = useState("");
  const [segmentLaneFilter, setSegmentLaneFilter] = useState<"all" | "speech" | "context">("all");

  const clearUploadProgress = useCallback(() => {
    if (uploadProgressTimerRef.current !== null) {
      window.clearTimeout(uploadProgressTimerRef.current);
      uploadProgressTimerRef.current = null;
    }
    uploadProgressResolverRef.current?.();
    uploadProgressResolverRef.current = null;
  }, []);

  const resetUploadProgress = useCallback(() => {
    clearUploadProgress();
    uploadProgressRef.current = 0;
    uploadTargetRef.current = 0;
    setUploadProgress(0);
  }, [clearUploadProgress]);

  const updateUploadProgressTarget = useCallback((nextProgress: number) => {
    uploadTargetRef.current = Math.max(
      uploadTargetRef.current,
      Math.min(100, Math.max(0, Math.round(nextProgress)))
    );
    if (uploadProgressTimerRef.current !== null) return;

    const tick = () => {
      const current = uploadProgressRef.current;
      if (current >= uploadTargetRef.current) {
        uploadProgressTimerRef.current = null;
        if (current >= 100) {
          uploadProgressResolverRef.current?.();
          uploadProgressResolverRef.current = null;
        }
        return;
      }

      const next = Math.min(uploadTargetRef.current, current + 1);
      uploadProgressRef.current = next;
      setUploadProgress(next);
      uploadProgressTimerRef.current = window.setTimeout(tick, 18);
    };

    tick();
  }, []);

  const waitForUploadProgress = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (uploadProgressRef.current >= 100) {
          resolve();
          return;
        }
        uploadProgressResolverRef.current = resolve;
      }),
    []
  );

  useEffect(() => clearUploadProgress, [clearUploadProgress]);

  const mergeProject = useCallback((project: VideoCaptionProjectDto) => {
    setProjects((current) => {
      const exists = current.some((item) => item.id === project.id);
      const next = exists
        ? current.map((item) =>
            item.id === project.id ? project : item
          )
        : [project, ...current];
      return next.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() -
          new Date(a.updatedAt).getTime()
      );
    });
  }, []);

  const openProject = useCallback(
    async (projectId: string, silent = false) => {
      if (!silent) setLoadingDetail(true);
      try {
        const next = await videoCaptionService.detail(projectId);
        setDetail(next);
        setSelectedName(next.project.name);
        mergeProject(next.project);
        localStorage.setItem(
          "video-caption:last-project-id",
          projectId
        );
        setError("");
      } catch (requestError) {
        if (!silent) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Không thể mở dự án caption."
          );
        }
      } finally {
        if (!silent) setLoadingDetail(false);
      }
    },
    [mergeProject]
  );

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const result = await videoCaptionService.list({ limit: 30 });
      setProjects(result.projects);
      const rememberedId = localStorage.getItem(
        "video-caption:last-project-id"
      );
      const firstId =
        result.projects.find((item) => item.id === rememberedId)?.id ||
        result.projects[0]?.id;
      if (firstId) await openProject(firstId, true);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể tải danh sách dự án."
      );
    } finally {
      setLoadingProjects(false);
    }
  }, [openProject]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void videoCaptionService
      .contextOptions()
      .then(setContextOptions)
      .catch(() =>
        setContextOptions({ contents: [], campaigns: [] })
      );
  }, []);

  useEffect(() => {
    const project = detail?.project;
    if (!project || !ACTIVE_STATUSES.has(project.status)) return;
    const timer = window.setInterval(() => {
      void openProject(project.id, true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [detail?.project, openProject]);

  useEffect(() => {
    const preferredUrl =
      detail?.project.video.proxyUrl || detail?.project.source.url || "";
    setPlayerUrl(preferredUrl);
    setPlayerDurationMs(undefined);
    setPlayerDurationWarning("");
  }, [
    detail?.project.id,
    detail?.project.source.url,
    detail?.project.video.durationMs,
    detail?.project.video.proxyUrl,
  ]);

  useEffect(() => {
    const project = detail?.project;
    const nextName = selectedName.trim();
    if (!project || !nextName || nextName === project.name) return;

    const timer = window.setTimeout(() => {
      void videoCaptionService
        .update(project.id, { name: nextName })
        .then(({ project: updated }) => {
          setDetail((current) =>
            current
              ? { ...current, project: updated }
              : current
          );
          mergeProject(updated);
        })
        .catch((requestError) => {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Không thể tự động lưu tên dự án."
          );
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [detail?.project, mergeProject, selectedName]);

  async function handleCreate() {
    setError("");
    if (sourceType === "upload" && !selectedFile) {
      setError("Hãy chọn một video để tải lên.");
      return;
    }
    if (sourceType === "url" && !sourceUrl.trim()) {
      setError("Hãy nhập URL video HTTPS.");
      return;
    }
    if (
      selectedFile &&
      (!selectedFile.type.startsWith("video/") ||
        selectedFile.size > 1_000_000_000)
    ) {
      setError("Chỉ hỗ trợ video có dung lượng tối đa 1 GB.");
      return;
    }

    setCreating(true);
    resetUploadProgress();
    try {
      let uploadedUrl = sourceUrl.trim();
      if (sourceType === "upload" && selectedFile) {
        updateUploadProgressTarget(1);
        uploadedUrl = await videoCaptionService.uploadVideo(
          selectedFile,
          updateUploadProgressTarget
        );
        updateUploadProgressTarget(100);
        await waitForUploadProgress();
      }

      if (!createIdempotencyKeyRef.current) {
        createIdempotencyKeyRef.current = `caption-create-${crypto.randomUUID()}`;
      }

      const created = await videoCaptionService.create({
        name:
          projectName.trim() ||
          selectedFile?.name.replace(/\.[^.]+$/, "") ||
          "Dự án caption mới",
        mode,
        source: {
          kind:
            sourceType === "upload"
              ? "upload"
              : "media_library",
          url: uploadedUrl,
          originalName: selectedFile?.name,
        },
        autoAnalyze: true,
        idempotencyKey: createIdempotencyKeyRef.current,
      });

      createIdempotencyKeyRef.current = null;
      setDetail(created);
      setSelectedName(created.project.name);
      mergeProject(created.project);
      localStorage.setItem(
        "video-caption:last-project-id",
        created.project.id
      );
      setSelectedFile(null);
      setSourceUrl("");
      setProjectName("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể tạo dự án caption."
      );
    } finally {
      resetUploadProgress();
      setCreating(false);
    }
  }

  async function runAction(
    action:
      | "analyze"
      | "transcribe"
      | "generateContext"
      | "renderPreview"
      | "renderFinal"
      | "retry"
      | "cancel"
  ) {
    if (!detail) return;
    setError("");
    setActionBusy(true);
    try {
      if (action === "analyze") {
        await videoCaptionService.analyze(detail.project.id);
      } else if (action === "transcribe") {
        await videoCaptionService.transcribe(detail.project.id);
      } else if (action === "generateContext") {
        await videoCaptionService.update(detail.project.id, {
          contextBrief: detail.project.contextBrief || "",
          contextLinks: detail.project.contextLinks || {},
        });
        await videoCaptionService.generateContext(detail.project.id);
      } else if (action === "renderPreview") {
        await videoCaptionService.render(detail.project.id, true);
      } else if (action === "renderFinal") {
        await videoCaptionService.render(detail.project.id, false);
      } else if (action === "retry") {
        await videoCaptionService.retry(detail.project.id);
      } else {
        await videoCaptionService.cancel(detail.project.id);
      }
      await openProject(detail.project.id, true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể xử lý yêu cầu."
      );
    } finally {
      setActionBusy(false);
    }
  }

  function updateSegment(
    segmentId: string,
    updates: Partial<VideoCaptionSegmentDto>
  ) {
    setDetail((current) =>
      current
        ? {
            ...current,
            segments: current.segments.map((segment) =>
              segment.id === segmentId
                ? { ...segment, ...updates }
                : segment
            ),
          }
        : current
    );
  }

  async function saveTimeline() {
    if (!detail) return;
    setSavingTimeline(true);
    setError("");
    try {
      const updated = await videoCaptionService.replaceSegments(
        detail.project.id,
        {
          expectedVersion: detail.project.currentVersion,
          segments: detail.segments.map((segment, index) => ({
            lane: segment.lane,
            startMs: Math.max(0, Math.round(segment.startMs)),
            endMs: Math.max(1, Math.round(segment.endMs)),
            text: segment.text,
            sceneId: segment.sceneId,
            confidence: segment.confidence,
            sourceReferences: segment.sourceReferences,
            styleOverride: segment.styleOverride,
            lockedByUser: true,
            sortOrder: index,
          })),
        }
      );
      setDetail(updated);
      mergeProject(updated.project);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể lưu timeline caption."
      );
    } finally {
      setSavingTimeline(false);
    }
  }

  async function saveStyle() {
    if (!detail) return;
    setActionBusy(true);
    setError("");
    try {
      const { project } = await videoCaptionService.update(
        detail.project.id,
        { style: detail.project.style }
      );
      setDetail((current) =>
        current ? { ...current, project } : current
      );
      mergeProject(project);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể lưu kiểu caption."
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function saveContextSettings() {
    if (!detail) return;
    setActionBusy(true);
    setError("");
    try {
      const { project } = await videoCaptionService.update(
        detail.project.id,
        {
          contextBrief: detail.project.contextBrief || "",
          contextLinks: detail.project.contextLinks || {},
        }
      );
      setDetail((current) =>
        current ? { ...current, project } : current
      );
      mergeProject(project);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể lưu nguồn ngữ cảnh."
      );
    } finally {
      setActionBusy(false);
    }
  }

  function updateStyle(updates: Partial<VideoCaptionStyle>) {
    setDetail((current) =>
      current
        ? {
            ...current,
            project: {
              ...current.project,
              style: { ...current.project.style, ...updates },
            },
          }
        : current
    );
  }

  function updateContext(
    updates: Partial<
      Pick<
        VideoCaptionProjectDto,
        "contextBrief" | "contextLinks"
      >
    >
  ) {
    setDetail((current) =>
      current
        ? {
            ...current,
            project: {
              ...current.project,
              ...updates,
            },
          }
        : current
    );
  }

  function handlePlayerMetadata(video: HTMLVideoElement) {
    if (!detail || !Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }
    const actualDurationMs = Math.round(video.duration * 1000);
    const expectedDurationMs = detail.project.video.durationMs;
    setPlayerDurationMs(actualDurationMs);
    if (!expectedDurationMs) return;
    const toleranceMs = Math.max(750, expectedDurationMs * 0.05);
    const mismatch =
      Math.abs(actualDurationMs - expectedDurationMs) > toleranceMs;
    if (!mismatch) {
      setPlayerDurationWarning("");
      return;
    }

    const sourceUrl = detail.project.source.url;
    const isUsingProxy =
      Boolean(detail.project.video.proxyUrl) &&
      playerUrl === detail.project.video.proxyUrl;
    console.warn(
      "[Video Caption Player] duration_mismatch",
      {
        projectId: detail.project.id,
        expectedDurationMs,
        actualDurationMs,
        source: isUsingProxy ? "proxy" : "original",
      }
    );
    if (isUsingProxy && sourceUrl && sourceUrl !== playerUrl) {
      setPlayerDurationWarning(
        `Proxy chỉ phát ${formatDuration(actualDurationMs)} trong khi nguồn được phân tích là ${formatDuration(expectedDurationMs)}. Đã tự chuyển sang video gốc.`
      );
      setPlayerUrl(sourceUrl);
      return;
    }
    setPlayerDurationWarning(
      `Video thực phát ${formatDuration(actualDurationMs)}, lệch với metadata ${formatDuration(expectedDurationMs)}. Hãy tải lại file nguồn trước khi tạo caption.`
    );
  }

  function handlePlayerError() {
    if (!detail) return;
    const sourceUrl = detail.project.source.url;
    if (
      detail.project.video.proxyUrl &&
      playerUrl === detail.project.video.proxyUrl &&
      sourceUrl &&
      sourceUrl !== playerUrl
    ) {
      setPlayerDurationWarning(
        "Không phát được proxy video. Hệ thống đã tự chuyển sang video gốc."
      );
      setPlayerUrl(sourceUrl);
    }
  }

  const currentStatus = detail
    ? STATUS_LABELS[detail.project.status]
    : null;
  const previewUrl = playerUrl;
  const activePreviewSegments =
    detail?.segments.filter(
      (segment) =>
        currentTimeMs >= segment.startMs &&
        currentTimeMs < segment.endMs
    ) || [];

  const filteredSegments =
    detail?.segments.filter((segment) => {
      if (segmentLaneFilter !== "all" && segment.lane !== segmentLaneFilter) {
        return false;
      }
      if (segmentSearchQuery.trim()) {
        return segment.text.toLowerCase().includes(segmentSearchQuery.toLowerCase());
      }
      return true;
    }) || [];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-2 pb-8">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
              <Captions className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Phụ đề & chữ trong video
              </h2>
              <p className="text-sm text-slate-500">
                Tạo dự án một lần, tiếp tục xử lý ngay cả khi đóng trình duyệt.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Tự động lưu
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="rounded-lg p-1 hover:bg-rose-100"
              aria-label="Đóng thông báo lỗi"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid min-h-[680px] lg:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="relative overflow-hidden border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r">
            {creating && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm p-6 text-center">
                <div className="relative mb-4 flex items-center justify-center">
                  <div className="h-20 w-20 rounded-full border-4 border-slate-100 border-t-cyan-600 animate-spin" />
                  <span className="absolute text-sm font-extrabold text-cyan-800">
                    {uploadProgress}%
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  {sourceType === "upload"
                    ? "Đang tải video lên..."
                    : "Đang khởi tạo dự án..."}
                </h4>
                <p className="mt-1.5 max-w-[200px] text-[11px] leading-relaxed text-slate-500">
                  {sourceType === "upload"
                    ? "Vui lòng không đóng tab cho đến khi tải lên 100%."
                    : "Đang xác minh video và chuẩn bị dự án caption."}
                </p>
              </div>
            )}

            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Tạo dự án mới
              </h3>
            </div>

            <label className="mb-2 block text-xs font-semibold text-slate-600">
              Tên dự án
            </label>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Ví dụ: Caption video giới thiệu sản phẩm"
              className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />

            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setSourceType("upload")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  sourceType === "upload"
                    ? "bg-white text-cyan-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Tải video
              </button>
              <button
                type="button"
                onClick={() => setSourceType("url")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  sourceType === "url"
                    ? "bg-white text-cyan-700 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                URL media
              </button>
            </div>

            {sourceType === "upload" ? (
              localVideoUrl ? (
                <div className="relative mb-5 overflow-hidden rounded-2xl border border-slate-250 bg-slate-950 aspect-video flex items-center justify-center group shadow-sm">
                  <video
                    src={localVideoUrl}
                    className="h-full w-full object-contain"
                    controls
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="absolute right-2.5 top-2.5 rounded-full bg-slate-900/70 p-1.5 text-white hover:bg-slate-900 transition opacity-0 group-hover:opacity-100 duration-150 shadow"
                    title="Gỡ video"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="mb-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-cyan-400 hover:bg-cyan-50/40">
                  <FileVideo className="mb-2 h-7 w-7 text-cyan-700 animate-pulse" />
                  <span className="max-w-full truncate text-sm font-semibold text-slate-800">
                    Chọn video từ máy
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    Tối đa 1 GB, tải trực tiếp lên kho media
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) =>
                      setSelectedFile(event.target.files?.[0] || null)
                    }
                  />
                </label>
              )
            ) : (
              <div className="mb-5">
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view hoặc ID Google Drive"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Đường dẫn chia sẻ công khai hoặc mã ID tệp tin từ Google Drive.
                </p>
              </div>
            )}

            <p className="mb-2 text-xs font-semibold text-slate-600">
              Chế độ caption
            </p>
            <div className="space-y-2">
              {MODE_OPTIONS.map((option) => {
                const Icon = modeIcon(option.id);
                const active = mode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMode(option.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      active
                        ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-xl p-2 ${
                          active
                            ? "bg-cyan-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {option.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <MonitorPlay className="h-4 w-4" />
              )}
              {creating ? "Đang khởi tạo..." : "Phân tích video"}
            </button>

            <div className="my-5 border-t border-slate-200" />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900">
                  Dự án gần đây
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void loadProjects()}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Tải lại dự án"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    loadingProjects ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {!loadingProjects && projects.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                  Chưa có dự án caption.
                </p>
              )}
              {projects.map((project) => {
                const status = STATUS_LABELS[project.status];
                const active = detail?.project.id === project.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => void openProject(project.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-cyan-400 bg-cyan-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {project.name}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {projectDate(project.updatedAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 p-5 md:p-7">
            {loadingDetail && (
              <div className="flex min-h-[560px] items-center justify-center">
                <LoaderCircle className="h-8 w-8 animate-spin text-cyan-700" />
              </div>
            )}

            {!loadingDetail && !detail && (
              <div className="flex min-h-[560px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 text-center">
                <div className="mb-4 rounded-3xl bg-cyan-50 p-5 text-cyan-700">
                  <Captions className="h-10 w-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  Bắt đầu với một video
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Video sẽ được xác minh, đọc thời lượng và tạo bản preview.
                  Mọi tiến trình được lưu trên máy chủ.
                </p>
              </div>
            )}

            {!loadingDetail && detail && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <input
                      value={selectedName}
                      onChange={(event) =>
                        setSelectedName(event.target.value)
                      }
                      className="w-full truncate border-0 bg-transparent p-0 text-xl font-bold text-slate-950 outline-none"
                      aria-label="Tên dự án caption"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Tên được tự động lưu sau khi bạn ngừng nhập.
                    </p>
                  </div>
                  {currentStatus && (
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${currentStatus.className}`}
                    >
                      {currentStatus.label}
                    </span>
                  )}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950">
                      <div className="relative flex aspect-video items-center justify-center">
                      {previewUrl ? (
                        <video
                          ref={videoRef}
                          key={previewUrl}
                          src={previewUrl}
                          controls
                          preload="metadata"
                          onLoadedMetadata={(event) =>
                            handlePlayerMetadata(event.currentTarget)
                          }
                          onError={handlePlayerError}
                          onTimeUpdate={(event) =>
                            setCurrentTimeMs(
                              event.currentTarget.currentTime * 1000
                            )
                          }
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <FileVideo className="h-12 w-12 text-slate-600" />
                      )}
                        {activePreviewSegments.map((segment) => {
                        const style = {
                          ...detail.project.style,
                          ...(segment.styleOverride || {}),
                        };
                        const verticalClass =
                          segment.lane === "context" ||
                          (style.position === "top" &&
                            detail.project.mode !== "combined")
                            ? "top-[10%]"
                            : style.position === "center"
                              ? "top-1/2 -translate-y-1/2"
                              : "bottom-[10%]";
                        return (
                          <div
                            key={segment.id}
                            className={`pointer-events-none absolute left-1/2 z-10 w-[84%] -translate-x-1/2 text-center ${verticalClass}`}
                          >
                            <span
                              className="inline rounded-lg px-3 py-1.5 leading-snug"
                              style={{
                                color: style.textColor,
                                fontFamily: style.fontFamily,
                                fontSize: `${Math.max(14, style.fontSize / 2)}px`,
                                fontWeight: style.fontWeight,
                                backgroundColor: `${style.backgroundColor}${Math.round(
                                  style.backgroundOpacity * 255
                                )
                                  .toString(16)
                                  .padStart(2, "0")}`,
                                boxDecorationBreak: "clone",
                                WebkitBoxDecorationBreak: "clone",
                              }}
                            >
                              {segment.text}
                            </span>
                          </div>
                        );
                        })}
                      </div>
                    </div>
                    {playerDurationWarning && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{playerDurationWarning}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                        Thông tin video
                      </p>
                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-2 text-slate-500">
                            <Clock3 className="h-4 w-4" />
                            Thời lượng
                          </dt>
                          <dd className="font-semibold text-slate-800">
                            {formatDuration(
                              detail.project.video.durationMs
                            )}
                          </dd>
                        </div>
                        {playerDurationMs !== undefined && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-slate-500">
                              Thực tế trình phát
                            </dt>
                            <dd
                              className={`font-semibold ${
                                detail.project.video.durationMs &&
                                Math.abs(
                                  playerDurationMs -
                                    detail.project.video.durationMs
                                ) >
                                  Math.max(
                                    750,
                                    detail.project.video.durationMs * 0.05
                                  )
                                  ? "text-amber-700"
                                  : "text-slate-800"
                              }`}
                            >
                              {formatDuration(playerDurationMs)}
                            </dd>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-2 text-slate-500">
                            <MonitorPlay className="h-4 w-4" />
                            Kích thước
                          </dt>
                          <dd className="font-semibold text-slate-800">
                            {detail.project.video.width &&
                            detail.project.video.height
                              ? `${detail.project.video.width} × ${detail.project.video.height}`
                              : "Chưa xác định"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="flex items-center gap-2 text-slate-500">
                            {detail.project.video.hasAudio ? (
                              <Volume2 className="h-4 w-4" />
                            ) : (
                              <VolumeX className="h-4 w-4" />
                            )}
                            Âm thanh
                          </dt>
                          <dd className="font-semibold text-slate-800">
                            {detail.project.video.hasAudio === undefined
                              ? "Chưa xác định"
                              : detail.project.video.hasAudio
                                ? "Có"
                                : "Không"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-slate-500">Dung lượng</dt>
                          <dd className="font-semibold text-slate-800">
                            {formatBytes(
                              detail.project.video.contentLength
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Chế độ
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {
                          MODE_OPTIONS.find(
                            (item) => item.id === detail.project.mode
                          )?.title
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {detail.project.mode !== "speech" && (
                  <>
                  <CompanyKnowledgePanel />
                  <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-amber-950">
                          Nguồn cho caption ngữ cảnh
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-amber-800">
                          Ưu tiên yêu cầu của bạn → bài viết/chiến dịch → tài liệu dùng chung của doanh nghiệp.
                        </p>
                      </div>
                      {detail.project.knowledgeSnapshot && (
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-amber-700">
                          Đã dùng{" "}
                          {detail.project.knowledgeSnapshot.sourceIds.length}{" "}
                          tài liệu
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Bài viết liên quan
                        <select
                          value={
                            detail.project.contextLinks
                              ?.marketingContentId || ""
                          }
                          onChange={(event) => {
                            const selected = contextOptions.contents.find(
                              (item) => item.id === event.target.value
                            );
                            updateContext({
                              contextLinks: {
                                ...detail.project.contextLinks,
                                marketingContentId:
                                  event.target.value || undefined,
                                campaignId:
                                  selected?.campaignId ||
                                  detail.project.contextLinks?.campaignId,
                                campaignSlotId:
                                  selected?.campaignSlotId ||
                                  detail.project.contextLinks
                                    ?.campaignSlotId,
                              },
                            });
                          }}
                          className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm"
                        >
                          <option value="">Không chọn bài viết</option>
                          {contextOptions.contents.map((content) => (
                            <option key={content.id} value={content.id}>
                              {content.title} · {content.channel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        Chiến dịch liên quan
                        <select
                          value={
                            detail.project.contextLinks?.campaignId || ""
                          }
                          onChange={(event) =>
                            updateContext({
                              contextLinks: {
                                ...detail.project.contextLinks,
                                campaignId:
                                  event.target.value || undefined,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm"
                        >
                          <option value="">Không chọn chiến dịch</option>
                          {contextOptions.campaigns.map((campaign) => (
                            <option
                              key={campaign.id}
                              value={campaign.id}
                            >
                              {campaign.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-semibold text-slate-700">
                      Điều cần nhấn mạnh
                      <textarea
                        value={detail.project.contextBrief || ""}
                        onChange={(event) =>
                          updateContext({
                            contextBrief: event.target.value,
                          })
                        }
                        rows={3}
                        placeholder="Ví dụ: Nhấn mạnh lợi ích tiết kiệm thời gian, giọng điệu chuyên nghiệp, không nêu giá."
                        className="mt-1 w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                      />
                    </label>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void saveContextSettings()}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        Lưu nguồn ngữ cảnh
                      </button>
                    </div>
                  </section>
                  </>
                )}

                {["ready_for_review", "completed"].includes(
                  detail.project.status
                ) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                    <div>
                      <p className="text-sm font-bold text-cyan-950">
                        {detail.segments.length
                          ? `Đã có ${detail.segments.length} đoạn caption`
                          : detail.project.video.hasAudio === false
                            ? "Video không có luồng âm thanh"
                            : detail.project.progress?.stage === "no_speech"
                              ? "Không phát hiện lời nói trong video"
                              : "Video đã sẵn sàng tạo phụ đề"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-cyan-800">
                        {detail.project.video.hasAudio === false
                          ? "Bạn có thể chuyển sang caption ngữ cảnh ở giai đoạn tiếp theo."
                          : "Phụ đề chạy nền; bạn có thể rời trang và quay lại chỉnh timeline sau."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detail.project.mode !== "context" &&
                        detail.project.video.hasAudio !== false && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void runAction("transcribe")}
                            className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-60"
                          >
                            {actionBusy ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <AudioLines className="h-4 w-4" />
                            )}
                            {detail.segments.some(
                              (segment) => segment.lane === "speech"
                            )
                              ? "Tạo lại phụ đề lời nói"
                              : "Tạo phụ đề lời nói"}
                          </button>
                        )}
                      {detail.project.mode !== "speech" && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            void runAction("generateContext")
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {actionBusy ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <BookOpenCheck className="h-4 w-4" />
                          )}
                          {detail.segments.some(
                            (segment) => segment.lane === "context"
                          )
                            ? "Tạo lại caption ngữ cảnh"
                            : "Tạo caption ngữ cảnh"}
                        </button>
                      )}
                      {detail.segments.length > 0 && (
                        <>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              void runAction("renderPreview")
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100 disabled:opacity-60"
                          >
                            <MonitorPlay className="h-4 w-4" />
                            Xem thử 15 giây
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              void runAction("renderFinal")
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                          >
                            <Download className="h-4 w-4" />
                            Kết xuất video
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void videoCaptionService
                                .downloadSubtitles(
                                  detail.project.id,
                                  "srt"
                                )
                                .catch((downloadError) =>
                                  setError(
                                    downloadError instanceof Error
                                      ? downloadError.message
                                      : "Không thể tải SRT."
                                  )
                                )
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100"
                          >
                            <Download className="h-4 w-4" />
                            SRT
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void videoCaptionService
                                .downloadSubtitles(
                                  detail.project.id,
                                  "vtt"
                                )
                                .catch((downloadError) =>
                                  setError(
                                    downloadError instanceof Error
                                      ? downloadError.message
                                      : "Không thể tải VTT."
                                  )
                                )
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100"
                          >
                            <Download className="h-4 w-4" />
                            VTT
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {(detail.project.output?.previewUrl ||
                  detail.project.output?.captionedVideoUrl) && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {detail.project.output.previewUrl && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="mb-3 text-sm font-bold text-slate-900">
                          Bản xem thử 15 giây
                        </p>
                        <video
                          src={detail.project.output.previewUrl}
                          controls
                          className="aspect-video w-full rounded-xl bg-slate-950 object-contain"
                        />
                      </div>
                    )}
                    {detail.project.output.captionedVideoUrl && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm font-bold text-emerald-900">
                          Video có caption đã hoàn tất
                        </p>
                        <p className="mt-1 text-xs text-emerald-700">
                          File đã được lưu vào kho media và có thể tải xuống.
                        </p>
                        <a
                          href={detail.project.output.captionedVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          <Download className="h-4 w-4" />
                          Mở video kết quả
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {detail.segments.length > 0 && (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-950">
                            Timeline caption
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Chỉnh sửa nội dung và thời gian; xem trực tiếp kết quả cập nhật trên trình phát.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={savingTimeline}
                          onClick={() => void saveTimeline()}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 transition"
                        >
                          {savingTimeline ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Lưu timeline
                        </button>
                      </div>

                      {/* --- Search & Filter Bar --- */}
                      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={segmentSearchQuery}
                            onChange={(e) => setSegmentSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm nội dung phân đoạn..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs outline-none transition focus:border-cyan-500 focus:bg-white"
                          />
                        </div>
                        <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1">
                          {(["all", "speech", "context"] as const).map((filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setSegmentLaneFilter(filter)}
                              className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-all ${
                                segmentLaneFilter === filter
                                  ? "bg-white text-slate-900 shadow-sm"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {filter === "all" ? "Tất cả" : filter === "speech" ? "Lời nói" : "Ngữ cảnh"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-[500px] space-y-3.5 overflow-y-auto pr-1">
                        {filteredSegments.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
                            <Search className="h-8 w-8 text-slate-300" />
                            <span className="text-xs">Không tìm thấy phân đoạn phụ đề phù hợp.</span>
                          </div>
                        ) : (
                          filteredSegments.map((segment) => {
                            const originalIndex = detail.segments.findIndex((s) => s.id === segment.id);
                            const isSpeech = segment.lane === "speech";

                            return (
                              <div
                                key={segment.id}
                                className={`group rounded-2xl border p-4 transition-all duration-200 ${
                                  isSpeech
                                    ? "border-violet-100 bg-violet-50/5 hover:border-violet-300 focus-within:border-violet-400 focus-within:bg-violet-50/10"
                                    : "border-amber-100 bg-amber-50/5 hover:border-amber-300 focus-within:border-amber-400 focus-within:bg-amber-50/10"
                                }`}
                              >
                                <div className="mb-2.5 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`rounded-full px-2.5 py-0.5 text-[9px] font-extrabold tracking-wide uppercase ${
                                        isSpeech
                                          ? "bg-violet-100 text-violet-700"
                                          : "bg-amber-100 text-amber-700"
                                      }`}
                                    >
                                      {isSpeech
                                        ? `Lời nói ${originalIndex + 1}`
                                        : `Ngữ cảnh ${originalIndex + 1}`}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-400">
                                      {formatMillisecondsToTimestamp(segment.startMs)} → {formatMillisecondsToTimestamp(segment.endMs)}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (videoRef.current) {
                                          videoRef.current.currentTime = segment.startMs / 1000;
                                          videoRef.current.play().catch(() => {});
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-[10px] font-extrabold text-cyan-700 hover:bg-cyan-100 transition"
                                      title="Phát thử đoạn này"
                                    >
                                      <Play className="h-3 w-3 fill-cyan-700 stroke-cyan-700" />
                                      Nghe thử
                                    </button>
                                    {typeof segment.confidence === "number" && (
                                      <span className="text-[9px] font-semibold text-slate-400">
                                        Tin cậy {Math.round(segment.confidence * 100)}%
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <textarea
                                  value={segment.text}
                                  onChange={(event) =>
                                    updateSegment(segment.id, {
                                      text: event.target.value,
                                    })
                                  }
                                  rows={2}
                                  className="w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:shadow-sm"
                                  placeholder="Nhập nội dung phụ đề..."
                                />

                                {segment.sourceReferences.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {segment.sourceReferences.map(
                                      (reference, referenceIndex) => (
                                        <span
                                          key={`${reference.kind}-${reference.sourceId || referenceIndex}`}
                                          title={reference.excerpt}
                                          className="max-w-full truncate rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500 hover:bg-slate-200"
                                        >
                                          {reference.title ||
                                            (reference.kind === "knowledge_chunk"
                                              ? "Tài liệu doanh nghiệp"
                                              : reference.kind === "marketing_content"
                                                ? "Bài viết"
                                                : reference.kind === "campaign_slot"
                                                  ? "Chiến dịch"
                                                  : reference.kind === "video_scene"
                                                    ? "Cảnh video"
                                                    : "Lời nói")}
                                        </span>
                                      )
                                    )}
                                  </div>
                                )}

                                <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-slate-100/80 pt-2.5">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Bắt đầu (giây)
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={millisecondsToSeconds(
                                        segment.startMs
                                      )}
                                      onChange={(event) =>
                                        updateSegment(segment.id, {
                                          startMs:
                                            Number(event.target.value) * 1000,
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-cyan-500"
                                    />
                                  </label>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Kết thúc (giây)
                                    <input
                                      type="number"
                                      min={0.01}
                                      step={0.01}
                                      value={millisecondsToSeconds(
                                        segment.endMs
                                      )}
                                      onChange={(event) =>
                                        updateSegment(segment.id, {
                                          endMs:
                                            Number(event.target.value) * 1000,
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-cyan-500"
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-950">
                          Kiểu hiển thị
                        </h3>
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                          Bản xem trước
                        </span>
                      </div>

                      {/* --- Presets --- */}
                      <div className="mb-4">
                        <label className="mb-2 block text-xs font-semibold text-slate-650">
                          Mẫu phụ đề nhanh
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            {
                              id: "clean",
                              name: "Clean",
                              textColor: "#FFFFFF",
                              backgroundColor: "#000000",
                              backgroundOpacity: 0.72,
                              previewStyle: "bg-slate-950 text-white",
                              previewText: "White block",
                            },
                            {
                              id: "classic",
                              name: "Classic",
                              textColor: "#FFFFFF",
                              backgroundColor: "#000000",
                              backgroundOpacity: 0.00,
                              previewStyle: "border border-slate-200 text-slate-800 bg-transparent",
                              previewText: "Shadow raw",
                            },
                            {
                              id: "highlight",
                              name: "Highlight",
                              textColor: "#FBBF24",
                              backgroundColor: "#000000",
                              backgroundOpacity: 0.00,
                              previewStyle: "border border-slate-200 text-amber-500 bg-transparent",
                              previewText: "Yellow glow",
                            },
                          ].map((preset) => {
                            const isSelected =
                              detail.project.style.preset === preset.id ||
                              (preset.id === "clean" && detail.project.style.backgroundOpacity > 0 && detail.project.style.textColor === "#FFFFFF") ||
                              (preset.id === "classic" && detail.project.style.backgroundOpacity === 0 && detail.project.style.textColor === "#FFFFFF") ||
                              (preset.id === "highlight" && detail.project.style.backgroundOpacity === 0 && detail.project.style.textColor === "#FBBF24");

                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() =>
                                  updateStyle({
                                    preset: preset.id as VideoCaptionStyle["preset"],
                                    textColor: preset.textColor,
                                    backgroundColor: preset.backgroundColor,
                                    backgroundOpacity: preset.backgroundOpacity,
                                  })
                                }
                                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition ${
                                  isSelected
                                    ? "border-cyan-500 bg-cyan-50/50 ring-2 ring-cyan-100"
                                    : "border-slate-150 bg-white hover:border-slate-350"
                                }`}
                              >
                                <span className="block text-[11px] font-bold text-slate-800">
                                  {preset.name}
                                </span>
                                <span
                                  className={`flex h-8 w-full items-center justify-center rounded-lg text-[9px] font-bold ${preset.previewStyle}`}
                                >
                                  Abc
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {/* --- Vị trí --- */}
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-650">
                            Vị trí hiển thị
                          </label>
                          <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
                            {(["top", "center", "bottom", "safe_auto"] as const).map((pos) => (
                              <button
                                key={pos}
                                type="button"
                                onClick={() => updateStyle({ position: pos })}
                                className={`rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                                  detail.project.style.position === pos
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                {pos === "top"
                                  ? "Trên"
                                  : pos === "center"
                                    ? "Giữa"
                                    : pos === "bottom"
                                      ? "Dưới"
                                      : "Tự động"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* --- Font Family --- */}
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-650">
                            Phông chữ
                          </label>
                          <select
                            value={detail.project.style.fontFamily}
                            onChange={(event) =>
                              updateStyle({
                                fontFamily: event.target.value,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-cyan-500"
                          >
                            <option value="Arial">Arial</option>
                            <option value="Helvetica">Helvetica</option>
                            <option value="Inter">Inter</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Poppins">Poppins</option>
                            <option value="Bebas Neue">Bebas Neue (In hoa)</option>
                            <option value="Roboto">Roboto</option>
                            <option value="Playfair Display">Playfair Display</option>
                          </select>
                        </div>

                        {/* --- Cỡ chữ --- */}
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-650">
                            <span>Cỡ chữ</span>
                            <span className="font-extrabold text-cyan-700">
                              {detail.project.style.fontSize}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={20}
                            max={100}
                            value={detail.project.style.fontSize}
                            onChange={(event) =>
                              updateStyle({
                                fontSize: Number(event.target.value),
                              })
                            }
                            className="h-1.5 w-full cursor-pointer rounded-lg bg-slate-100 accent-cyan-600"
                          />
                        </div>

                        {/* --- Độ đậm --- */}
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-650">
                            Độ đậm chữ
                          </label>
                          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                            {([400, 700] as const).map((weight) => (
                              <button
                                key={weight}
                                type="button"
                                onClick={() => updateStyle({ fontWeight: weight })}
                                className={`rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                                  detail.project.style.fontWeight === weight
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                {weight === 700 ? "In đậm (Bold)" : "Thường (Regular)"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* --- Màu chữ --- */}
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-650">
                            Màu sắc chữ
                          </label>
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            {[
                              { color: "#FFFFFF", name: "Trắng" },
                              { color: "#FBBF24", name: "Vàng" },
                              { color: "#22D3EE", name: "Cyan" },
                              { color: "#34D399", name: "Lục" },
                              { color: "#F472B6", name: "Hồng" },
                              { color: "#F87171", name: "Đỏ" },
                            ].map((presetColor) => (
                              <button
                                key={presetColor.color}
                                type="button"
                                onClick={() => updateStyle({ textColor: presetColor.color })}
                                className={`h-6 w-6 rounded-full border shadow-sm transition hover:scale-110 ${
                                  detail.project.style.textColor.toUpperCase() === presetColor.color.toUpperCase()
                                    ? "ring-2 ring-cyan-500 ring-offset-1 border-white"
                                    : "border-slate-300"
                                }`}
                                style={{ backgroundColor: presetColor.color }}
                                title={presetColor.name}
                              />
                            ))}
                            <label className="relative flex h-6 w-10 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-600 shadow-sm hover:bg-slate-100">
                              Chọn
                              <input
                                type="color"
                                value={detail.project.style.textColor}
                                onChange={(event) =>
                                  updateStyle({
                                    textColor: event.target.value,
                                  })
                                }
                                className="absolute inset-0 cursor-pointer opacity-0"
                              />
                            </label>
                          </div>
                        </div>

                        {/* --- Màu nền & Độ đậm nền --- */}
                        <div className="rounded-xl border border-slate-150 bg-slate-50/50 p-3">
                          <label className="mb-1.5 block text-xs font-semibold text-slate-650">
                            Màu nền phụ đề
                          </label>
                          <div className="mb-3 flex items-center gap-2">
                            <input
                              type="color"
                              value={detail.project.style.backgroundColor}
                              onChange={(event) =>
                                updateStyle({
                                  backgroundColor: event.target.value,
                                })
                              }
                              className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
                            />
                            <span className="text-xs font-semibold text-slate-600">
                              {detail.project.style.backgroundColor.toUpperCase()}
                            </span>
                          </div>

                          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-650">
                            <span>Độ đậm nền</span>
                            <span className="font-extrabold text-slate-700">
                              {Math.round(
                                detail.project.style.backgroundOpacity * 100
                              )}
                              %
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={detail.project.style.backgroundOpacity}
                            onChange={(event) =>
                              updateStyle({
                                backgroundOpacity: Number(
                                  event.target.value
                                ),
                              })
                            }
                            className="h-1.5 w-full cursor-pointer rounded-lg bg-slate-200 accent-slate-700"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void saveStyle()}
                          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-60 transition"
                        >
                          <Save className="h-4 w-4" />
                          Lưu kiểu caption
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {detail.project.progress && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        {ACTIVE_STATUSES.has(detail.project.status) && (
                          <LoaderCircle className="h-4 w-4 animate-spin text-cyan-700" />
                        )}
                        {detail.project.progress.message ||
                          detail.project.progress.stage}
                      </div>
                      <span className="text-xs font-bold text-cyan-700">
                        {detail.project.progress.percent}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-cyan-600 transition-all duration-500"
                        style={{
                          width: `${detail.project.progress.percent}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {detail.project.lastError && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                      <div>
                        <p className="text-sm font-bold text-rose-800">
                          {detail.project.lastError.code}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-rose-700">
                          {detail.project.lastError.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {detail.project.status === "ready_for_review"
                        ? "Video đã sẵn sàng cho bước tạo phụ đề"
                        : "Tác vụ chạy nền trên máy chủ"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Bạn có thể rời trang và mở lại dự án từ danh sách gần đây.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {["failed", "cancelled"].includes(
                      detail.project.status
                    ) && (
                      <button
                        type="button"
                        onClick={() => void runAction("retry")}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-800"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Thử lại
                      </button>
                    )}
                    {detail.project.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => void runAction("analyze")}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Bắt đầu phân tích
                      </button>
                    )}
                    {ACTIVE_STATUSES.has(detail.project.status) && (
                      <button
                        type="button"
                        onClick={() => void runAction("cancel")}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Hủy
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
