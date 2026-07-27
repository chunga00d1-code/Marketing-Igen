import {
  AlertCircle,
  AudioLines,
  BookOpenCheck,
  Captions,
  Download,
  FileVideo,
  History,
  Layers3,
  Link2,
  LoaderCircle,
  MonitorPlay,
  PaintBucket,
  RefreshCw,
  Type,
  UploadCloud,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
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
import { HEYGEN_THEME } from "./heygenTheme";

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

const CAPTION_FONT_OPTIONS = [
  "Arial",
  "Helvetica",
  "Inter",
  "Roboto",
  "Montserrat",
  "Poppins",
  "Bebas Neue",
] as const;

const CAPTION_FONT_SIZES = [
  12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 120,
] as const;

type TimelineDragMode = "move" | "resize-start" | "resize-end";

interface TimelineDragState {
  segmentId: string;
  mode: TimelineDragMode;
  originClientX: number;
  originStartMs: number;
  originEndMs: number;
  trackWidth: number;
}

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

function isDriveFolderUrl(url: string) {
  const trimmed = url.trim();
  return trimmed.includes("drive.google.com/drive/folders/") || trimmed.includes("drive.google.com/embeddedfolderview") || trimmed.includes("/folders/");
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

  const [creationStep, setCreationStep] = useState<1 | 2>(1);
  const [smoothPercent, setSmoothPercent] = useState(0);

  const [activeTab, setActiveTab] = useState<"styling" | "subtitles">("subtitles");
  const [driveFolderFiles, setDriveFolderFiles] = useState<Array<{ id: string; name: string; directUrl: string }>>([]);
  const [scanningDrive, setScanningDrive] = useState(false);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState("");
  const [fontSizeDraft, setFontSizeDraft] = useState("48");
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportFormat, setExportFormat] = useState("MP4");

  useEffect(() => {
    if (!detail) {
      setCreationStep(1);
    }
  }, [detail]);

  useEffect(() => {
    const isActive = detail && ACTIVE_STATUSES.has(detail.project.status);
    if (!isActive) {
      setSmoothPercent(0);
      return;
    }

    setSmoothPercent(1);

    const interval = setInterval(() => {
      setSmoothPercent((prev) => {
        if (prev >= 99) return 99;
        const increment = Math.random() * 2.5 + 0.5;
        return Math.min(99, Number((prev + increment).toFixed(1)));
      });
    }, 450);

    return () => clearInterval(interval);
  }, [detail?.project.status, detail?.project.id]);

  useEffect(() => {
    if (sourceType === "url" && isDriveFolderUrl(sourceUrl)) {
      const timer = setTimeout(async () => {
        setScanningDrive(true);
        setDriveFolderFiles([]);
        setSelectedDriveFileId("");
        try {
          const files = await videoCaptionService.resolveDriveFolder(sourceUrl.trim());
          setDriveFolderFiles(files);
          if (files.length > 0) {
            setSelectedDriveFileId(files[0].id);
            if (!projectName) {
              setProjectName(files[0].name.replace(/\.[^.]+$/, ""));
            }
          }
        } catch (err) {
          console.error("Resolve Drive folder failed", err);
          setError("Không thể quét thư mục Google Drive. Đảm bảo thư mục đã được chia sẻ công khai.");
        } finally {
          setScanningDrive(false);
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setDriveFolderFiles([]);
    }
  }, [sourceUrl, sourceType, projectName]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [timelineDrag, setTimelineDrag] = useState<TimelineDragState | null>(null);
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captionPreviewRef = useRef<HTMLDivElement | null>(null);
  const segmentItemRefs = useRef(new Map<string, HTMLDivElement>());
  const [playerUrl, setPlayerUrl] = useState("");
  const [playerDurationMs, setPlayerDurationMs] = useState<number>();
  const [playerDurationWarning, setPlayerDurationWarning] = useState("");
  const [segmentSearchQuery, setSegmentSearchQuery] = useState("");
  const [segmentLaneFilter, setSegmentLaneFilter] = useState<"all" | "speech" | "context">("all");
  const autosaveSegmentsRef = useRef<{ projectId: string; snapshot: string } | null>(null);
  const autosaveStyleRef = useRef<{ projectId: string; snapshot: string } | null>(null);
  const autosaveSegmentsTimerRef = useRef<number | null>(null);
  const autosaveStyleTimerRef = useRef<number | null>(null);
  const saveTimelineRef = useRef<(() => Promise<void>) | null>(null);
  const saveStyleRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (detail?.project.style.fontSize !== undefined) {
      setFontSizeDraft(String(detail.project.style.fontSize));
    }
  }, [detail?.project.style.fontSize]);

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
        setActiveTab("subtitles");
        setSelectedName(next.project.name);
        mergeProject(next.project);
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
  }, []);

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

  const handleStep1Continue = () => {
    let name = "";
    if (sourceType === "upload" && selectedFile) {
      name = selectedFile.name.replace(/\.[^.]+$/, "");
    } else if (sourceType === "url") {
      if (isDriveFolderUrl(sourceUrl)) {
        const fileObj = driveFolderFiles.find((f) => f.id === selectedDriveFileId) || driveFolderFiles[0];
        if (fileObj) {
          name = fileObj.name.replace(/\.[^.]+$/, "");
        }
      } else {
        const match = sourceUrl.trim().match(/\/([^/?#]+)$/);
        name = match ? match[1].replace(/\.[^.]+$/, "") : "";
      }
    }
    if (name && !projectName) {
      setProjectName(name);
    }
    setCreationStep(2);
  };

  async function handleCreate() {
    setError("");
    if (sourceType === "upload" && !selectedFile) {
      setError("Hãy chọn một video để tải lên.");
      return;
    }
    if (sourceType === "url" && !sourceUrl.trim()) {
      setError("Hãy nhập URL video HTTPS hoặc link Google Drive.");
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
      let originalName = selectedFile?.name;

      if (sourceType === "url" && isDriveFolderUrl(sourceUrl)) {
        const fileObj = driveFolderFiles.find((f) => f.id === selectedDriveFileId) || driveFolderFiles[0];
        if (!fileObj) {
          setError("Vui lòng đợi quét thư mục hoặc chọn video từ thư mục.");
          setCreating(false);
          return;
        }
        uploadedUrl = fileObj.directUrl;
        originalName = fileObj.name;
      }

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
          originalName?.replace(/\.[^.]+$/, "") ||
          "Dự án caption mới",
        mode,
        source: {
          kind:
            sourceType === "upload"
              ? "upload"
              : "media_library",
          url: uploadedUrl,
          originalName: originalName,
        },
        autoAnalyze: true,
        idempotencyKey: createIdempotencyKeyRef.current,
      });

      createIdempotencyKeyRef.current = null;
      setDetail(created);
      setActiveTab("subtitles");
      setSelectedName(created.project.name);
      mergeProject(created.project);
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
      } else if (action === "renderPreview" || action === "renderFinal") {
        const { project } = await videoCaptionService.update(
          detail.project.id,
          { style: detail.project.style }
        );
        setDetail((current) =>
          current ? { ...current, project } : current
        );
        mergeProject(project);
        await videoCaptionService.render(
          detail.project.id,
          action === "renderPreview"
        );
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

  const updateSegment = useCallback((
    segmentId: string,
    updates: Partial<VideoCaptionSegmentDto>
  ) => {
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
  }, []);

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

  saveTimelineRef.current = saveTimeline;
  saveStyleRef.current = saveStyle;

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

  function openCaptionPreviewFullscreen() {
    captionPreviewRef.current?.requestFullscreen().catch(() => {
      setError("Không thể mở bản xem thử toàn màn hình.");
    });
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
  const activeTimelineSegmentId = activePreviewSegments[0]?.id;

  useEffect(() => {
    if (!activeTimelineSegmentId) return;
    segmentItemRefs.current
      .get(activeTimelineSegmentId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeTimelineSegmentId]);

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

  const timelineDurationMs = Math.max(
    playerDurationMs || 0,
    detail?.project.video.durationMs || 0,
    1
  );
  const segmentsSnapshot = detail
    ? JSON.stringify(
        detail.segments.map((segment) => ({
          id: segment.id,
          lane: segment.lane,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          styleOverride: segment.styleOverride,
        }))
      )
    : "";
  const styleSnapshot = detail ? JSON.stringify(detail.project.style) : "";

  useEffect(() => {
    const projectId = detail?.project.id;
    if (!projectId || !segmentsSnapshot) return;
    const previous = autosaveSegmentsRef.current;

    if (!previous || previous.projectId !== projectId) {
      autosaveSegmentsRef.current = { projectId, snapshot: segmentsSnapshot };
      return;
    }
    if (previous.snapshot === segmentsSnapshot) return;

    if (autosaveSegmentsTimerRef.current !== null) {
      window.clearTimeout(autosaveSegmentsTimerRef.current);
    }
    autosaveSegmentsTimerRef.current = window.setTimeout(() => {
      void saveTimelineRef.current?.();
      autosaveSegmentsRef.current = { projectId, snapshot: segmentsSnapshot };
      autosaveSegmentsTimerRef.current = null;
    }, 700);

    return () => {
      if (autosaveSegmentsTimerRef.current !== null) {
        window.clearTimeout(autosaveSegmentsTimerRef.current);
        autosaveSegmentsTimerRef.current = null;
      }
    };
  }, [detail?.project.id, segmentsSnapshot]);

  useEffect(() => {
    const projectId = detail?.project.id;
    if (!projectId || !styleSnapshot) return;
    const previous = autosaveStyleRef.current;

    if (!previous || previous.projectId !== projectId) {
      autosaveStyleRef.current = { projectId, snapshot: styleSnapshot };
      return;
    }
    if (previous.snapshot === styleSnapshot) return;

    if (autosaveStyleTimerRef.current !== null) {
      window.clearTimeout(autosaveStyleTimerRef.current);
    }
    autosaveStyleTimerRef.current = window.setTimeout(() => {
      void saveStyleRef.current?.();
      autosaveStyleRef.current = { projectId, snapshot: styleSnapshot };
      autosaveStyleTimerRef.current = null;
    }, 700);

    return () => {
      if (autosaveStyleTimerRef.current !== null) {
        window.clearTimeout(autosaveStyleTimerRef.current);
        autosaveStyleTimerRef.current = null;
      }
    };
  }, [detail?.project.id, styleSnapshot]);

  useEffect(() => {
    if (!timelineDrag) return;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      timelineDrag.mode === "move" ? "grabbing" : "ew-resize";

    const handlePointerMove = (event: PointerEvent) => {
      const deltaMs =
        ((event.clientX - timelineDrag.originClientX) /
          timelineDrag.trackWidth) *
        timelineDurationMs;
      const snappedDeltaMs = Math.round(deltaMs / 50) * 50;
      const segmentDurationMs =
        timelineDrag.originEndMs - timelineDrag.originStartMs;

      if (timelineDrag.mode === "move") {
        const startMs = Math.min(
          Math.max(0, timelineDurationMs - segmentDurationMs),
          Math.max(0, timelineDrag.originStartMs + snappedDeltaMs)
        );
        updateSegment(timelineDrag.segmentId, {
          startMs,
          endMs: startMs + segmentDurationMs,
        });
        setCurrentTimeMs(startMs);
        return;
      }

      if (timelineDrag.mode === "resize-start") {
        updateSegment(timelineDrag.segmentId, {
          startMs: Math.min(
            timelineDrag.originEndMs - 100,
            Math.max(0, timelineDrag.originStartMs + snappedDeltaMs)
          ),
        });
        return;
      }

      updateSegment(timelineDrag.segmentId, {
        endMs: Math.min(
          timelineDurationMs,
          Math.max(
            timelineDrag.originStartMs + 100,
            timelineDrag.originEndMs + snappedDeltaMs
          )
        ),
      });
    };

    const handlePointerUp = () => setTimelineDrag(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [timelineDrag, timelineDurationMs, updateSegment]);

  function seekToSegment(segment: VideoCaptionSegmentDto) {
    setCurrentTimeMs(segment.startMs);
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startMs / 1000;
      videoRef.current.play().catch(() => {});
    }
  }

  const handlePrevSegment = () => {
    if (!detail || detail.segments.length === 0) return;
    const sorted = [...detail.segments].sort((a, b) => a.startMs - b.startMs);
    const currentIndex = sorted.findIndex(s => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
    if (currentIndex > 0) {
      seekToSegment(sorted[currentIndex - 1]);
    } else if (currentIndex === -1) {
      const prev = sorted.reverse().find(s => s.startMs < currentTimeMs);
      if (prev) seekToSegment(prev);
    }
  };

  const handleNextSegment = () => {
    if (!detail || detail.segments.length === 0) return;
    const sorted = [...detail.segments].sort((a, b) => a.startMs - b.startMs);
    const currentIndex = sorted.findIndex(s => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
    if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
      seekToSegment(sorted[currentIndex + 1]);
    } else if (currentIndex === -1) {
      const next = sorted.find(s => s.startMs > currentTimeMs);
      if (next) seekToSegment(next);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play().catch(() => {});
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  function formatTime(ms: number) {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function commitFontSize(value: string) {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      setFontSizeDraft(String(detail?.project.style.fontSize || 48));
      setFontSizeMenuOpen(false);
      return;
    }

    const nextFontSize = Math.min(120, Math.max(12, Math.round(parsedValue)));
    setFontSizeDraft(String(nextFontSize));
    setFontSizeMenuOpen(false);
    updateStyle({ fontSize: nextFontSize, preset: "custom" });
  }

  function startTimelineSegmentDrag(
    event: React.PointerEvent<HTMLElement>,
    segment: VideoCaptionSegmentDto,
    mode: TimelineDragMode
  ) {
    const trackElement = event.currentTarget.closest<HTMLElement>(
      "[data-caption-timeline-track]"
    );
    if (!trackElement) return;

    event.preventDefault();
    event.stopPropagation();
    setTimelineDrag({
      segmentId: segment.id,
      mode,
      originClientX: event.clientX,
      originStartMs: segment.startMs,
      originEndMs: segment.endMs,
      trackWidth: trackElement.getBoundingClientRect().width,
    });
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const targetTimeMs = Math.round(percent * timelineDurationMs);
    setCurrentTimeMs(targetTimeMs);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTimeMs / 1000;
    }
  };

  return (
    <div className="w-full bg-transparent">
      {/* SCREEN 1: Creation Screen */}
      {!loadingDetail && !detail && (
        <div className="mx-auto w-full max-w-[1000px] px-4 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-600 text-white shadow-md shadow-cyan-250">
                <Captions className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Tạo Phụ Đề Video</h2>
                <p className="text-sm text-slate-500 mt-0.5">Tạo phụ đề AI nhanh chóng và trực quan</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError("")} className="rounded-lg p-1 hover:bg-rose-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            {/* Step Wizard Container */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 relative overflow-hidden flex flex-col justify-between min-h-[420px]">

              {creating && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm p-6 text-center animate-fade-in">
                  <div className="relative mb-4 flex items-center justify-center">
                    <div className="h-20 w-20 rounded-full border-4 border-slate-100 border-t-cyan-600 animate-spin" />
                    <span className="absolute text-sm font-extrabold text-cyan-800">
                      {uploadProgress}%
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    {sourceType === "upload" ? "Đang tải video lên..." : "Đang phân tích video..."}
                  </h4>
                  <p className="mt-1.5 max-w-[200px] text-[11px] leading-relaxed text-slate-500">
                    {sourceType === "upload" ? "Vui lòng giữ tab này hoạt động cho đến khi hoàn tất." : "Hệ thống đang chuẩn bị tệp và gửi phân tích."}
                  </p>
                </div>
              )}

              {/* Step Contents */}
              <div className="flex-1 flex flex-col justify-start">

                {/* STEP 1: SELECT VIDEO SOURCE */}
                {creationStep === 1 && (
                  <div className="space-y-5 animate-fade-in">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">
                        Chọn nguồn video của bạn
                      </label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setSourceType("upload")}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                            sourceType === "upload" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <UploadCloud className="h-4 w-4" />
                          Tải tệp từ máy
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourceType("url")}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                            sourceType === "url" ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Link2 className="h-4 w-4" />
                          Google Drive / Link Video
                        </button>
                      </div>
                    </div>

                    {sourceType === "upload" ? (
                      localVideoUrl ? (
                        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 aspect-video flex items-center justify-center group shadow-sm max-w-md mx-auto w-full">
                          <video src={localVideoUrl} className="h-full w-full object-contain" controls />
                          <button
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="absolute right-3 top-3 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900 transition opacity-0 group-hover:opacity-100 duration-150 shadow"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-cyan-50/10 hover:border-cyan-400 px-6 py-12 text-center transition-all duration-200">
                          <FileVideo className="mb-3 h-10 w-10 text-cyan-600 animate-pulse" />
                          <span className="text-sm font-bold text-slate-850">Chọn video từ thiết bị</span>
                          <span className="mt-1 text-xs text-slate-400">Hỗ trợ các định dạng MP4, MOV tối đa 1 GB</span>
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          />
                        </label>
                      )
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-2">Đường dẫn thư mục Google Drive</label>
                          <input
                            value={sourceUrl}
                            onChange={(e) => setSourceUrl(e.target.value)}
                            placeholder="Dán link thư mục Google Drive, link video Drive hoặc link direct"
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 font-semibold text-slate-800"
                          />
                        </div>

                        {scanningDrive && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2.5 rounded-xl">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan-650" />
                            Đang quét thư mục Google Drive, vui lòng đợi...
                          </div>
                        )}

                        {driveFolderFiles.length > 0 && (
                          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                              Danh sách video tìm thấy ({driveFolderFiles.length})
                            </label>
                            <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                              {driveFolderFiles.map((file) => (
                                <button
                                  key={file.id}
                                  type="button"
                                  onClick={() => setSelectedDriveFileId(file.id)}
                                  className={`w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-100 ${
                                    selectedDriveFileId === file.id
                                      ? "bg-cyan-600 text-white shadow-sm"
                                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  <span className="truncate flex-1 pr-2">{file.name}</span>
                                  <FileVideo className="h-3.5 w-3.5 shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: CONFIGURE PROJECT */}
                {creationStep === 2 && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">
                        Tên dự án
                      </label>
                      <input
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Ví dụ: Video giới thiệu sản phẩm mới"
                        className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 font-semibold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-3">
                        Loại render phụ đề (Render Mode)
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {MODE_OPTIONS.map((option) => {
                          const Icon = modeIcon(option.id);
                          const active = mode === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setMode(option.id)}
                              className={`flex flex-col items-start text-left p-4 rounded-2xl border transition-all duration-200 ${
                                active
                                  ? "border-cyan-500 bg-cyan-50/50 ring-2 ring-cyan-100"
                                  : "border-slate-200 bg-white hover:border-slate-350 shadow-sm"
                              }`}
                            >
                              <div className={`p-2 rounded-xl mb-3 ${active ? "bg-cyan-600 text-white shadow" : "bg-slate-100 text-slate-500"}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <span className="text-xs font-bold text-slate-800">{option.title}</span>
                              <span className="text-[10px] text-slate-400 leading-relaxed mt-1">{option.description}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Wizard Navigation Footer */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between gap-4">
                {creationStep === 2 ? (
                  <button
                    type="button"
                    onClick={() => setCreationStep(1)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Quay lại
                  </button>
                ) : (
                  <div />
                )}

                {creationStep === 1 ? (
                  <button
                    type="button"
                    onClick={handleStep1Continue}
                    disabled={
                      sourceType === "upload"
                        ? !selectedFile
                        : (isDriveFolderUrl(sourceUrl) ? !selectedDriveFileId : !sourceUrl.trim())
                    }
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                  >
                    Tiếp tục
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={creating || !projectName.trim()}
                    onClick={() => void handleCreate()}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shadow-sm"
                  >
                    {creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <MonitorPlay className="h-3.5 w-3.5" />}
                    Xác nhận
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-400" />
                    Dự án gần đây
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadProjects()}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingProjects ? "animate-spin" : ""}`} />
                  </button>
                </div>
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {!loadingProjects && projects.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">Chưa có dự án nào</p>
                  )}
                  {projects.map((project) => {
                    const status = STATUS_LABELS[project.status];
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => void openProject(project.id)}
                        className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-cyan-200 hover:bg-cyan-50/5 transition-all flex items-center justify-between gap-2 bg-white"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700 truncate">{project.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{projectDate(project.updatedAt)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${status.className}`}>
                          {status.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 2: Main Workspace & Editor */}
      {!loadingDetail && detail && (
        <div className={`mx-auto flex h-[calc(100vh-150px)] min-h-[680px] w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} shadow-sm`}>
          {/* Top Navbar */}
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition"
              >
                <X className="h-4 w-4" />
              </button>
              <div>
                <input
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  className="bg-transparent border-0 p-0 text-md font-bold text-slate-900 focus:outline-none focus:ring-0 max-w-[300px] truncate"
                  title="Click để đổi tên dự án"
                />
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${currentStatus?.className}`}>
                    {currentStatus?.label}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {savingTimeline || actionBusy ? "Đang tự động lưu..." : "Đã tự động lưu"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {ACTIVE_STATUSES.has(detail.project.status) && (
                <button
                  type="button"
                  onClick={() => void runAction("cancel")}
                  className="rounded-xl border border-rose-250 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                >
                  Hủy tác vụ
                </button>
              )}
              {["failed", "cancelled"].includes(detail.project.status) && (
                <button
                  type="button"
                  onClick={() => void runAction("retry")}
                  className="rounded-xl bg-cyan-600 text-white px-3.5 py-2 text-xs font-bold hover:bg-cyan-700 transition"
                >
                  Thử lại
                </button>
              )}
            </div>
          </header>

          {/* Main workspace panels */}
          <div className={`flex min-h-0 flex-1 overflow-hidden ${HEYGEN_THEME.surfaceMuted}`}>
            {/* Center Canvas: Video Player */}
            <main className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto relative bg-slate-950">

              {/* If active processing loader is showing */}
              {ACTIVE_STATUSES.has(detail.project.status) && (
                <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
                  <div className="h-16 w-16 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin mb-4" />
                  <h3 className="text-md font-bold">Đang xử lý phụ đề video...</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-sm">
                    {detail.project.progress?.message || currentStatus?.label}
                  </p>
                  {detail.project.progress?.percent !== undefined && (
                    <div className="mt-4 w-48 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${detail.project.progress.percent}%` }} />
                    </div>
                  )}
                </div>
              )}

              {/* Video container */}
              <div className="flex-1 flex items-center justify-center w-full min-h-0 max-h-[550px] relative p-2">
                <div ref={captionPreviewRef} className="relative max-h-full aspect-video md:aspect-[9/16] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
                  {previewUrl ? (
                    <video
                      ref={videoRef}
                      key={previewUrl}
                      src={previewUrl}
                      preload="metadata"
                      onLoadedMetadata={(e) => handlePlayerMetadata(e.currentTarget)}
                      onError={handlePlayerError}
                      onTimeUpdate={(e) => setCurrentTimeMs(e.currentTarget.currentTime * 1000)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <FileVideo className="h-12 w-12 text-slate-650" />
                  )}

                  {/* Absolute overlays for subtitles */}
                  {!ACTIVE_STATUSES.has(detail.project.status) && activePreviewSegments.map((segment) => {
                    const style = {
                      ...detail.project.style,
                      ...(segment.styleOverride || {}),
                    };
                    const verticalClass =
                      segment.lane === "context" || (style.position === "top" && detail.project.mode !== "combined")
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
                          className="inline rounded-lg px-3 py-1.5 leading-snug break-words"
                          style={{
                            color: style.textColor,
                            fontFamily: style.fontFamily,
                            fontSize: `${Math.max(14, style.fontSize / 2.2)}px`,
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

              {/* Custom Playback control bar */}
              <div className="w-full max-w-lg bg-slate-900 border border-slate-800 px-4 py-2 rounded-full mt-4 flex items-center justify-between shadow-lg text-white">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-slate-400 hover:text-white transition p-1.5 rounded-lg"
                  title={muted ? "Bật âm thanh" : "Tắt âm thanh"}
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-500" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePrevSegment}
                    className="text-slate-400 hover:text-white transition p-1 rounded-lg"
                    title="Phân đoạn trước"
                  >
                    <SkipBack className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-full transition shadow-md flex items-center justify-center"
                    title={isPlaying ? "Tạm dừng" : "Phát"}
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5 fill-white text-white" /> : <Play className="h-3.5 w-3.5 fill-white text-white translate-x-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleNextSegment}
                    className="text-slate-400 hover:text-white transition p-1 rounded-lg"
                    title="Phân đoạn tiếp"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="text-xs font-semibold tabular-nums text-slate-400">
                  {formatTime(currentTimeMs)} <span className="text-slate-600">/</span> {formatTime(timelineDurationMs)}
                </div>
              </div>
            </main>

            {/* Sidebar (Right Pane) */}
            <aside className={`flex h-full w-[390px] shrink-0 flex-col border-l ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface}`}>

              <div className={`flex items-center justify-between border-b ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} p-2`}>
                <div className={`grid flex-1 grid-cols-2 gap-1 rounded-xl ${HEYGEN_THEME.surfaceSoft} p-1`}>
                  <button
                    type="button"
                    onClick={() => setActiveTab("styling")}
                    className={`order-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      activeTab === "styling"
                        ? `${HEYGEN_THEME.surface} text-indigo-700 shadow-sm`
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Layers3 className="h-4 w-4" />
                    Kiểu dáng
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("subtitles")}
                    className={`order-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      activeTab === "subtitles"
                        ? `${HEYGEN_THEME.surface} text-indigo-700 shadow-sm`
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Captions className="h-4 w-4" />
                    Phụ đề
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                      {detail.segments.length}
                    </span>
                  </button>
                </div>
              </div>

              {activeTab === "styling" && (
                <div className={`flex min-h-0 flex-1 flex-col ${HEYGEN_THEME.surfaceMuted}`}>
                  <div className="flex-1 space-y-5 overflow-y-auto p-4">
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <Type className="h-3.5 w-3.5" />
                        Font chữ
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {CAPTION_FONT_OPTIONS.map((fontFamily) => {
                          const selected = detail.project.style.fontFamily === fontFamily;
                          return (
                            <button
                              key={fontFamily}
                              type="button"
                              onClick={() => updateStyle({ fontFamily, preset: "custom" })}
                              className={`rounded-xl border p-3 text-left transition ${
                                selected
                                  ? `${HEYGEN_THEME.accentBorder} ${HEYGEN_THEME.accentBg} ring-2 ring-indigo-100`
                                  : `${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} hover:border-slate-300 hover:shadow-sm`
                              }`}
                            >
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                {fontFamily}
                              </span>
                              <span
                                className="mt-2 block truncate text-base text-slate-800"
                                style={{ fontFamily }}
                              >
                                Phụ đề Tiếng Việt
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className={`grid grid-cols-2 gap-3 border-t ${HEYGEN_THEME.border} pt-4`}>
                      <div className="col-span-2">
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Cỡ chữ
                        </span>
                        <div className="relative">
                          <div className={`flex h-10 w-full items-center overflow-hidden rounded-xl border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100`}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={fontSizeDraft}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                if (/^\d{0,3}$/.test(nextValue)) {
                                  setFontSizeDraft(nextValue);
                                }
                              }}
                              onBlur={() => commitFontSize(fontSizeDraft)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  commitFontSize(fontSizeDraft);
                                  event.currentTarget.blur();
                                }
                                if (event.key === "Escape") {
                                  setFontSizeDraft(String(detail.project.style.fontSize));
                                  setFontSizeMenuOpen(false);
                                  event.currentTarget.blur();
                                }
                              }}
                              aria-label="Cỡ chữ phụ đề"
                              className="h-full min-w-0 flex-1 bg-transparent px-3 text-center text-xs font-extrabold text-slate-800 outline-none"
                            />
                            <span className="border-l border-slate-100 px-2 text-[10px] font-bold text-slate-400">
                              px
                            </span>
                          <button
                            type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => setFontSizeMenuOpen((current) => !current)}
                              className="flex h-full w-10 items-center justify-center border-l border-slate-100 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                              aria-label="Mở danh sách cỡ chữ"
                              aria-expanded={fontSizeMenuOpen}
                          >
                              <ChevronDown className={`h-4 w-4 transition ${fontSizeMenuOpen ? "rotate-180" : ""}`} />
                          </button>
                          </div>

                          {fontSizeMenuOpen && (
                            <>
                              <button
                                type="button"
                                aria-label="Đóng danh sách cỡ chữ"
                                className="fixed inset-0 z-40 cursor-default"
                                onClick={() => setFontSizeMenuOpen(false)}
                              />
                              <div className={`absolute left-0 right-0 top-full z-50 mt-1.5 max-h-48 overflow-y-auto rounded-xl border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} p-1.5 shadow-xl`}>
                                <div className="grid grid-cols-3 gap-1">
                                  {CAPTION_FONT_SIZES.map((fontSize) => (
                                    <button
                                      key={fontSize}
                                      type="button"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => commitFontSize(String(fontSize))}
                                      className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                                        detail.project.style.fontSize === fontSize
                                          ? `${HEYGEN_THEME.accentBg} text-indigo-700`
                                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      }`}
                                    >
                                      {fontSize}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <label>
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Màu chữ
                        </span>
                        <span className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} px-3`}>
                          <span
                            className="h-5 w-5 rounded-md border border-slate-200 shadow-inner"
                            style={{ backgroundColor: detail.project.style.textColor }}
                          />
                          <span className="text-[11px] font-bold uppercase text-slate-600">
                            {detail.project.style.textColor}
                          </span>
                          <input
                            type="color"
                            value={detail.project.style.textColor}
                            onChange={(event) => updateStyle({ textColor: event.target.value, preset: "custom" })}
                            className="sr-only"
                          />
                        </span>
                      </label>

                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <PaintBucket className="h-3.5 w-3.5" />
                          Màu nền
                        </span>
                        <span className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} px-3`}>
                          <span
                            className="h-5 w-5 rounded-md border border-slate-200 shadow-inner"
                            style={{ backgroundColor: detail.project.style.backgroundColor }}
                          />
                          <span className="text-[11px] font-bold uppercase text-slate-600">
                            {detail.project.style.backgroundColor}
                          </span>
                          <input
                            type="color"
                            value={detail.project.style.backgroundColor}
                            onChange={(event) => updateStyle({ backgroundColor: event.target.value, preset: "custom" })}
                            className="sr-only"
                          />
                        </span>
                      </label>

                      <div className="col-span-2">
                        <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <span>Độ đậm nền</span>
                          <span className="text-indigo-700">
                            {Math.round(detail.project.style.backgroundOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={detail.project.style.backgroundOpacity}
                          onChange={(event) => updateStyle({ backgroundOpacity: Number(event.target.value), preset: "custom" })}
                          className="h-1.5 w-full cursor-pointer rounded-lg bg-slate-200 accent-indigo-600"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {activeTab === "subtitles" && (
              <section className={`flex min-h-0 flex-1 flex-col ${HEYGEN_THEME.surfaceMuted}`}>
                <div className={`flex items-center justify-between border-b ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} px-4 py-3`}>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      <Captions className="h-4 w-4 text-indigo-600" />
                      Phụ đề theo timeline
                    </div>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                      {detail.segments.length} phân đoạn · tự đồng bộ khi video phát
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void videoCaptionService.downloadSubtitles(detail.project.id, "srt")}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    title="Tải tệp phụ đề SRT"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  {/* Search and Filters */}
                  <div className={`shrink-0 space-y-2 border-b ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} p-3`}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={segmentSearchQuery}
                        onChange={(e) => setSegmentSearchQuery(e.target.value)}
                        placeholder="Tìm kiếm nội dung..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs outline-none focus:bg-white focus:border-cyan-500 font-semibold"
                      />
                    </div>

                    <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                      {(["all", "speech", "context"] as const).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setSegmentLaneFilter(filter)}
                          className={`flex-1 rounded-md py-1 text-[10px] font-bold transition-all ${
                            segmentLaneFilter === filter
                              ? `${HEYGEN_THEME.surface} text-indigo-700 shadow-xs`
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {filter === "all" ? "Tất cả" : filter === "speech" ? "Lời nói" : "Ngữ cảnh"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* List of segments */}
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-250 p-2 space-y-2">
                    {filteredSegments.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-12">Không tìm thấy phân đoạn nào</p>
                    ) : (
                      filteredSegments.map((segment) => {
                        const active = currentTimeMs >= segment.startMs && currentTimeMs < segment.endMs;
                        return (
                          <div
                            key={segment.id}
                            ref={(element) => {
                              if (element) segmentItemRefs.current.set(segment.id, element);
                              else segmentItemRefs.current.delete(segment.id);
                            }}
                            onClick={() => seekToSegment(segment)}
                            className={`p-3 rounded-xl border transition-all ${
                              active
                                ? "border-indigo-400 bg-indigo-50 shadow-sm ring-1 ring-indigo-100"
                                : `${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} hover:border-slate-300`
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-extrabold text-slate-400 tabular-nums">
                                {formatTime(segment.startMs)} – {formatTime(segment.endMs)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => seekToSegment(segment)}
                                  className="text-[9px] bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-0.5 rounded-full font-bold transition flex items-center gap-0.5"
                                >
                                  <Play className="h-2 w-2 fill-indigo-700 stroke-none" />
                                  Nghe
                                </button>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  segment.lane === "speech" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                                }`}>
                                  {segment.lane === "speech" ? "Speech" : "Context"}
                                </span>
                              </div>
                            </div>
                            <textarea
                              value={segment.text}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(e) => updateSegment(segment.id, { text: e.target.value })}
                              rows={2}
                              className="w-full border border-slate-200/80 bg-slate-50/50 p-2 text-xs font-bold text-slate-700 outline-none rounded-lg focus:bg-white focus:border-indigo-400 resize-none leading-relaxed"
                              placeholder="Nhập phụ đề..."
                            />

                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                Bắt đầu (giây)
                                <input
                                  type="number"
                                  step={0.1}
                                  value={millisecondsToSeconds(segment.startMs)}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(e) => updateSegment(segment.id, { startMs: Number(e.target.value) * 1000 })}
                                  className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 mt-0.5 font-bold text-slate-650 focus:border-indigo-400"
                                />
                              </label>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                Kết thúc (giây)
                                <input
                                  type="number"
                                  step={0.1}
                                  value={millisecondsToSeconds(segment.endMs)}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(e) => updateSegment(segment.id, { endMs: Number(e.target.value) * 1000 })}
                                  className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 mt-0.5 font-bold text-slate-650 focus:border-indigo-400"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                </div>
              </section>
              )}
            </aside>
          </div>

          {/* Bottom Bar: Timeline Track & Scrubber */}
          <footer className="z-10 flex h-[160px] shrink-0 select-none flex-col overflow-hidden border-t border-slate-800 bg-slate-950">
            {/* Timeline scrollable scrubber */}
            <div className="flex-1 overflow-x-auto relative min-h-0 bg-slate-950 flex flex-col">
              <div
                className="relative flex-1"
                onClick={handleTimelineClick}
                style={{
                  width: `${Math.max(900, (timelineDurationMs / 1000) * 28)}px`,
                  minWidth: "100%",
                }}
              >
                {/* Ticks and seconds labels */}
                <div className="h-5 border-b border-slate-800/80 text-[9px] font-bold text-slate-500 relative select-none">
                  {Array.from({ length: 11 }).map((_, i) => {
                    const pointMs = (timelineDurationMs * i) / 10;
                    return (
                      <span
                        key={i}
                        className="absolute -translate-x-1/2 pt-1 border-l border-slate-800 pl-1 h-3"
                        style={{ left: `${i * 10}%` }}
                      >
                        {formatTime(pointMs)}
                      </span>
                    );
                  })}
                </div>

                {/* Track lane */}
                <div
                  data-caption-timeline-track
                  className="relative mx-2 mt-2 h-[78px] overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70"
                >
                  {/* Current timeline cursor head */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-indigo-500 z-30 pointer-events-none shadow"
                    style={{ left: `${(currentTimeMs / timelineDurationMs) * 100}%` }}
                  />

                  {/* Rendered segments blocks */}
                  {!ACTIVE_STATUSES.has(detail.project.status) && detail.segments.map((segment) => {
                    const left = (segment.startMs / timelineDurationMs) * 100;
                    const width = Math.max(1.5, ((segment.endMs - segment.startMs) / timelineDurationMs) * 100);
                    const active = currentTimeMs >= segment.startMs && currentTimeMs < segment.endMs;
                    const combinedMode = detail.project.mode === "combined";

                    return (
                      <div
                        key={segment.id}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(event) =>
                          startTimelineSegmentDrag(event, segment, "move")
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          seekToSegment(segment);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            seekToSegment(segment);
                          }
                        }}
                        className={`group absolute touch-none overflow-hidden rounded-lg border px-3 py-2 text-left text-[10px] font-bold leading-tight transition-shadow ${
                          active
                            ? "z-20 border-indigo-300 bg-indigo-500 text-white shadow ring-2 ring-indigo-200/50"
                            : segment.lane === "speech"
                              ? "border-violet-700 bg-violet-950/80 text-violet-200 hover:bg-violet-900"
                              : "border-amber-700 bg-amber-950/80 text-amber-200 hover:bg-amber-900"
                        } ${timelineDrag?.segmentId === segment.id ? "z-30 cursor-grabbing shadow-xl" : "cursor-grab"}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          top: combinedMode
                            ? segment.lane === "speech"
                              ? "4px"
                              : "40px"
                            : "7px",
                          height: combinedMode ? "34px" : "64px",
                        }}
                        title="Kéo để đổi vị trí. Kéo hai mép để chỉnh thời gian bắt đầu hoặc kết thúc."
                      >
                        <span className="pointer-events-none line-clamp-2">
                          {segment.text}
                        </span>
                        <span
                          onPointerDown={(event) =>
                            startTimelineSegmentDrag(
                              event,
                              segment,
                              "resize-start"
                            )
                          }
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize border-l-2 border-transparent transition group-hover:border-white/70"
                          aria-hidden="true"
                        />
                        <span
                          onPointerDown={(event) =>
                            startTimelineSegmentDrag(
                              event,
                              segment,
                              "resize-end"
                            )
                          }
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize border-r-2 border-transparent transition group-hover:border-white/70"
                          aria-hidden="true"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom status & Actions (Export) */}
            <div className="h-10 bg-slate-900 border-t border-slate-800/80 px-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Định dạng xuất</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-[10px] font-extrabold rounded px-2 py-0.5 outline-none focus:border-indigo-500"
                >
                  <option value="MP4">MP4</option>
                  <option value="MKV">MKV</option>
                  <option value="WEBM">WEBM</option>
                </select>
                <span className="hidden text-[9px] font-medium text-slate-500 lg:inline">
                  Kéo block để đổi vị trí · kéo hai mép để chỉnh thời lượng
                </span>
              </div>

              {/* Export Button with Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-1 rounded-full cursor-pointer transition shadow"
                >
                  Xuất video
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 bottom-full mb-2 w-52 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-50 animate-fade-in">
                      <button
                        type="button"
                        onClick={() => {
                          setExportMenuOpen(false);
                          void runAction("renderPreview");
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-900 hover:text-white transition flex items-center gap-2"
                      >
                        <MonitorPlay className="h-3.5 w-3.5 text-indigo-500" />
                        Xem thử 15 giây
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExportMenuOpen(false);
                          void runAction("renderFinal");
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-300 border-t border-slate-900 hover:bg-slate-900 hover:text-white transition flex items-center gap-2"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-500" />
                        Xuất video hoàn chỉnh
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
