import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X, ChevronLeft, ChevronRight, Play, Download, Trash2, Pencil, LoaderCircle } from "lucide-react";
import { elevenlabsApi } from "../../api/elevenlabs";
import { type HeyGenLibraryItem, heygenApi } from "../../api/heygen";
import type { ElevenLabsAudioRecord } from "./HeyGenPopovers";
import { HeyGenVideoItem } from "./HeyGenVideoItem";
import { HeyGenVideoPreview } from "./HeyGenVideoPreview";
import { HeyGenVerticalToolbar, type HeyGenTab } from "./HeyGenVerticalToolbar";
import { HEYGEN_MODEL_OPTIONS, HEYGEN_THEME } from "./heygenTheme";
import { marketingService } from "../../services/marketingService";
import { toast } from "../../pages/Toast";
import { socketService } from "../../services/socketService";

const HeyGenOptionsDrawer = lazy(() =>
  import("./HeyGenOptionsDrawer").then((module) => ({ default: module.HeyGenOptionsDrawer }))
);
const PickerPopover = lazy(() =>
  import("./HeyGenPopovers").then((module) => ({ default: module.PickerPopover }))
);
const VoiceSourcePopover = lazy(() =>
  import("./VoiceSourcePopover").then((module) => ({ default: module.VoiceSourcePopover }))
);
const ModelSelectionPopover = lazy(() =>
  import("./HeyGenPopovers").then((module) => ({ default: module.ModelSelectionPopover }))
);

const TERMINAL_JOB_STATES = new Set(["completed", "failed", "error", "canceled"]);
const HISTORY_PAGE_SIZE = 6;
const HEYGEN_FALLBACK_POLL_DELAYS = [8000, 20000] as const;

function isPlayableVideoUrl(url?: string | null) {
  const value = String(url || "").trim();
  return value.startsWith("http://") || value.startsWith("https://");
}

export function translateJobStatus(status: string): string {
  const s = String(status || "").toLowerCase().trim();
  switch (s) {
    case "waiting":
    case "pending":
      return "Đang chờ trong hàng đợi";
    case "processing":
    case "running":
      return "Đang render video...";
    case "completed":
      return "Hoàn thành";
    case "failed":
    case "error":
      return "Thất bại";
    case "canceled":
      return "Đã hủy";
    default:
      return status;
  }
}

export function HeyGenWorkspace({
  initialPrompt,
  onEditVideo,
  cardId,
  onMediaSaved,
  autoTrigger,
  engineType,
  usePersonalVoice,
}: {
  initialPrompt?: string;
  onEditVideo?: (url: string) => void;
  cardId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
  autoTrigger?: boolean;
  engineType?: string;
  usePersonalVoice?: boolean;
}) {
  const [avatars, setAvatars] = useState<HeyGenLibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [audioRecords, setAudioRecords] = useState<ElevenLabsAudioRecord[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [selectedAudioRecordId, setSelectedAudioRecordId] = useState("");
  const [selectedAvatarModel, setSelectedAvatarModel] = useState(
    engineType === 'avatar_iii' ? 'Avatar III' : HEYGEN_MODEL_OPTIONS[0].id
  );
  const [voices, setVoices] = useState<HeyGenLibraryItem[]>([]);
  const [personalVoices, setPersonalVoices] = useState<HeyGenLibraryItem[]>([]);
  const [selectedHeyGenVoiceId, setSelectedHeyGenVoiceId] = useState("");
  const [usePersonalVoiceMode, setUsePersonalVoiceMode] = useState(
    usePersonalVoice !== undefined ? usePersonalVoice : (engineType === "avatar_iii")
  );
  const [voicePickerTab, setVoicePickerTab] = useState<"third-party" | "personal">(
    (usePersonalVoice !== undefined ? usePersonalVoice : (engineType === "avatar_iii")) ? "personal" : "third-party"
  );
  const [avatarThreeScript, setAvatarThreeScript] = useState(initialPrompt || "");
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [isLoadingAudioHistory, setIsLoadingAudioHistory] = useState(false);
  const [hasLoadedAudioHistory, setHasLoadedAudioHistory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [jobStatus, setJobStatus] = useState("");
  const [jobVideoUrl, setJobVideoUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isAudioPickerOpen, setIsAudioPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isCardAudioLoaded, setIsCardAudioLoaded] = useState(false);
  const autoTriggeredRef = useRef(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState("");
  const [activeTab, setActiveTab] = useState<HeyGenTab>("avatar");
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [enableCaption, setEnableCaption] = useState(false);
  const [captionPreset, setCaptionPreset] = useState<"brand" | "clean" | "outline" | "highlight">("brand");
  const [captionFontFamily, setCaptionFontFamily] = useState("Georgia, serif");
  const [captionFontSize, setCaptionFontSize] = useState(28);
  const [captionPrimaryColor, setCaptionPrimaryColor] = useState("#9bff4f");
  const [captionSecondaryColor, setCaptionSecondaryColor] = useState("#ffffff");
  const [captionPosition, setCaptionPosition] = useState<"top" | "middle" | "bottom">("bottom");
  const [captionOffset, setCaptionOffset] = useState({ x: 50, y: 86 });
  const [avatarBackground, setAvatarBackground] = useState<"customize" | "remove" | "color">("customize");
  const [avatarLayout, setAvatarLayout] = useState<"original" | "circle">("original");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const historySectionRef = useRef<HTMLDivElement | null>(null);

  const selectedAvatar = useMemo(() => avatars.find((avatar) => avatar.id === selectedAvatarId) || avatars[0] || null, [avatars, selectedAvatarId]);
  const selectedAudio = useMemo(() => audioRecords.find((record) => record._id === selectedAudioRecordId) || audioRecords[0] || null, [audioRecords, selectedAudioRecordId]);
  const selectedModel = useMemo(() => HEYGEN_MODEL_OPTIONS.find((item) => item.id === selectedAvatarModel) || HEYGEN_MODEL_OPTIONS[0], [selectedAvatarModel]);
  const selectedHeyGenVoice = useMemo(
    () => personalVoices.find((v) => v.id === selectedHeyGenVoiceId) || voices.find((v) => v.id === selectedHeyGenVoiceId) || personalVoices[0] || voices[0] || null,
    [personalVoices, voices, selectedHeyGenVoiceId]
  );
  const personalHeyGenVoices = useMemo(() => personalVoices, [personalVoices]);
  const personalVoiceHint = useMemo(() => {
    if (personalVoices.length > 0) {
      return "Đang hiển thị đúng danh sách My Voice riêng từ HeyGen.";
    }
    return "Chưa nhận được voice nào từ HeyGen cho tài khoản hiện tại.";
  }, [personalVoices.length]);
  const activeScript = useMemo(() => {
    if (selectedAvatarModel === "Avatar III" || usePersonalVoiceMode) {
      return avatarThreeScript;
    }
    return selectedAudio?.prompt || selectedAudio?.metadata?.title || "";
  }, [selectedAvatarModel, usePersonalVoiceMode, avatarThreeScript, selectedAudio]);
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  useEffect(() => {
    void loadWorkspaceData();
  }, []);

  useEffect(() => {
    if (cardId) {
      const loadCardAudio = async () => {
        setIsCardAudioLoaded(false);
        try {
          const card = await marketingService.getCardById(cardId);
          if (card) {
            const cardRatio = (card as any).videoAspectRatio || (card as any).aspectRatio || (card.channel === "TikTok" ? "9:16" : "16:9");
            if (cardRatio === "9:16" || cardRatio === "1:1" || cardRatio === "16:9") {
              setAspectRatio(cardRatio as any);
            }
            if (card.engineType === 'avatar_iii') {
              setSelectedAvatarModel("Avatar III");
              setUsePersonalVoiceMode(true);
              if (card.avatarId) {
                setSelectedAvatarId(card.avatarId);
              }
              if (card.voiceId) {
                setSelectedHeyGenVoiceId(card.voiceId);
              }
              setAvatarThreeScript((current) => card.inputText || card.voiceScript || current || initialPrompt || "");
              toast.info(`Đã nạp kịch bản Avatar III cho bài đăng: "${card.title}"`);
            } else {
              const hasPersonalVoiceCardState = card.usePersonalVoice || Boolean(card.voiceId && (card.inputText || card.voiceScript));
              setUsePersonalVoiceMode(hasPersonalVoiceCardState);
              if (hasPersonalVoiceCardState) {
                setVoicePickerTab("personal");
              }
              if (card.engineType === 'avatar_v') {
                setSelectedAvatarModel("Avatar V");
              } else {
                setSelectedAvatarModel("Avatar IV");
              }
              if (card.avatarId) {
                setSelectedAvatarId(card.avatarId);
              }
              if (hasPersonalVoiceCardState) {
                if (card.voiceId) {
                  setSelectedHeyGenVoiceId(card.voiceId);
                }
                setAvatarThreeScript((current) => card.inputText || card.voiceScript || current || initialPrompt || "");
              }
              if (card.audioRecordId) {
                setSelectedAudioRecordId(card.audioRecordId);
              }
              if (card.audioUrl) {
                setAudioRecords((prev) => {
                  const alreadyExists = prev.some(item => item._id === card.audioRecordId);
                  if (alreadyExists) return prev;
                  const newRecord = {
                    _id: card.audioRecordId || `mod_aud_${Date.now()}`,
                    url: card.audioUrl!,
                    title: card.title || "Giọng nói được tạo",
                    description: "Nạp từ kịch bản bài đăng",
                    generatedAt: card.generatedAt || new Date().toISOString()
                  } as any;
                  return [newRecord, ...prev];
                });
                toast.info(`Đã tự động nạp giọng nói cho bài đăng: "${card.title}"`);
              }
            }
          }
        } catch (err) {
          console.error("Lỗi nạp audio từ card trong HeyGen:", err);
        } finally {
          setIsCardAudioLoaded(true);
        }
      };
      void loadCardAudio();
    } else {
      setIsCardAudioLoaded(true);
    }
  }, [cardId]);

  useEffect(() => {
    if (usePersonalVoiceMode) {
      if (!selectedHeyGenVoiceId && personalVoices[0]?.id) {
        setSelectedHeyGenVoiceId(personalVoices[0].id);
        return;
      }
      if (selectedHeyGenVoiceId && !personalVoices.some((voice) => voice.id === selectedHeyGenVoiceId) && personalVoices[0]?.id) {
        setSelectedHeyGenVoiceId(personalVoices[0].id);
      }
      return;
    }

    if (!selectedAudioRecordId && audioRecords[0]?._id) {
      setSelectedAudioRecordId(audioRecords[0]._id);
    }
  }, [usePersonalVoiceMode, personalVoices, selectedHeyGenVoiceId, audioRecords, selectedAudioRecordId]);

  useEffect(() => {
    if (autoTrigger && !isLoadingLibrary && isCardAudioLoaded && !autoTriggeredRef.current) {
      const usesTextToVoice = selectedAvatarModel === "Avatar III" || usePersonalVoiceMode;
      if (usesTextToVoice) {
        if (selectedAvatarId && selectedHeyGenVoiceId && avatarThreeScript.trim()) {
          autoTriggeredRef.current = true;
          toast.info("Chế độ AutoTrigger: Tự động khởi chạy video text-to-voice HeyGen...");
          void handleGenerate();
        }
      } else {
        if (selectedAvatarId && selectedAudioRecordId) {
          autoTriggeredRef.current = true;
          toast.info("Chế độ AutoTrigger: Tự động khởi chạy kết xuất Video Avatar...");
          void handleGenerate();
        }
      }
    }
  }, [autoTrigger, isLoadingLibrary, isCardAudioLoaded, selectedAvatarModel, usePersonalVoiceMode, selectedAvatarId, selectedHeyGenVoiceId, selectedAudioRecordId, avatarThreeScript]);

  useEffect(() => {
    setHistoryPage(1);
  }, [history.length]);

  useEffect(() => {
    if (historyPage > totalHistoryPages) {
      setHistoryPage(totalHistoryPages);
    }
  }, [historyPage, totalHistoryPages]);

  useEffect(() => {
    if (!historySectionRef.current || hasLoadedHistory) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        void loadHistoryData();
        observer.disconnect();
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(historySectionRef.current);
    return () => observer.disconnect();
  }, [hasLoadedHistory]);

  useEffect(() => {
    if (!hasLoadedHistory) return;
    const hasActiveJobs = history.some((item) => !TERMINAL_JOB_STATES.has(String(item.status || "").toLowerCase()));
    if (!hasActiveJobs) return;
    const interval = window.setInterval(async () => {
      try {
        const historyRes = await heygenApi.getVideoHistory();
        setHistory(historyRes.history || []);
      } catch (error) {
        console.error("Failed to poll video history:", error);
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [history]);

  useEffect(() => {
    const unsubscribe = socketService.onVideoStatusUpdated((data) => {
      console.log("[HeyGenWorkspace] Real-time video update received:", data);
      
      // Reload history so user sees the update instantly
      reloadHistoryData().catch((err) => console.error("Error reloading history on socket event:", err));
      
      // Determine video title and status
      const videoTitle = data.updates?.[0]?.metadata?.title || "Video AI HeyGen";
      const statusText = String(data.status).toLowerCase();
      
      if (statusText === "completed" || statusText === "success") {
        toast.success(`🎉 Video "${videoTitle}" đã tạo thành công!`);
      } else if (statusText === "failed" || statusText === "error") {
        toast.error(`❌ Video "${videoTitle}" tạo thất bại.`);
      } else {
        toast.info(`ℹ️ Video "${videoTitle}" đang: ${translateJobStatus(data.status)}`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  async function loadWorkspaceData() {
    setIsLoadingLibrary(true);
    setErrorMessage("");
    try {
      const [libraryResult] = await Promise.allSettled([heygenApi.getLibrary({ force: true })]);
      if (libraryResult.status === "fulfilled") {
        const nextAvatars = libraryResult.value.avatars || [];
        const nextVoices = libraryResult.value.voices || [];
        const nextPersonalVoices = libraryResult.value.personalVoices || [];
        const defaultAvatarId = libraryResult.value.defaults?.avatarId || "";
        const defaultVoiceId = libraryResult.value.defaults?.voiceId || "";
        setAvatars(nextAvatars);
        setVoices(nextVoices);
        setPersonalVoices(nextPersonalVoices);
        setWarnings(libraryResult.value.warnings || []);
        setSelectedAvatarId((current) => current && nextAvatars.some((avatar) => avatar.id === current) ? current : defaultAvatarId && nextAvatars.some((avatar) => avatar.id === defaultAvatarId) ? defaultAvatarId : nextAvatars[0]?.id || "");
        setSelectedHeyGenVoiceId((current) => {
          const personalIds = new Set(nextPersonalVoices.map((voice) => voice.id));
          const allIds = new Set(nextVoices.map((voice) => voice.id));
          if (current && (personalIds.has(current) || allIds.has(current))) {
            return current;
          }
          if (defaultVoiceId && (personalIds.has(defaultVoiceId) || allIds.has(defaultVoiceId))) {
            return defaultVoiceId;
          }
          return nextPersonalVoices[0]?.id || nextVoices[0]?.id || "";
        });
        preloadAvatarImages(nextAvatars);
      } else {
        setErrorMessage(libraryResult.reason?.message || "Không thể tải thư viện khuôn mặt");
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Không thể tải dữ liệu khuôn mặt");
    }
    setIsLoadingLibrary(false);
  }

  function preloadAvatarImages(items: HeyGenLibraryItem[]) {
    items
      .filter((item) => Boolean(item.previewImage))
      .slice(0, 4)
      .forEach((item) => {
        const image = new Image();
        image.src = item.previewImage!;
      });
  }

  async function loadHistoryData() {
    if (isLoadingHistory || hasLoadedHistory) return;
    setIsLoadingHistory(true);
    try {
      const historyResult = await heygenApi.getVideoHistory();
      setHistory(historyResult.history || []);
      setHasLoadedHistory(true);
    } catch (error: any) {
      setErrorMessage((current) => current || error.message || "Không thể tải lịch sử khuôn mặt");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function reloadHistoryData() {
    setIsLoadingHistory(true);
    try {
      const historyResult = await heygenApi.getVideoHistory();
      setHistory(historyResult.history || []);
      setHasLoadedHistory(true);
    } catch (error: any) {
      setErrorMessage((current) => current || error.message || "Không thể tải lịch sử khuôn mặt");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function ensureAudioHistoryLoaded(options?: { force?: boolean }) {
    setIsLoadingAudioHistory(true);
    setErrorMessage("");
    try {
      const data = await elevenlabsApi.getVoiceHistory({ force: options?.force });
      const records = (data.history || []).filter((item: ElevenLabsAudioRecord) => Boolean(item?._id && item?.url));
      setAudioRecords(records);
      setSelectedAudioRecordId((current) => current && records.some((item) => item._id === current) ? current : records[0]?._id || "");
      setHasLoadedAudioHistory(true);
    } catch (error: any) {
      setErrorMessage(error.message || "Không thể tải lịch sử giọng nói");
    } finally {
      setIsLoadingAudioHistory(false);
    }
  }

  async function handleOpenVoicePicker() {
    const openPersonalByDefault = selectedAvatarModel === "Avatar III" || usePersonalVoiceMode;
    setVoicePickerTab(openPersonalByDefault ? "personal" : "third-party");
    setIsAudioPickerOpen(true);
    if (!openPersonalByDefault && !hasLoadedAudioHistory && !isLoadingAudioHistory) {
      await ensureAudioHistoryLoaded();
    }
  }

  async function refreshAudioHistory() {
    await ensureAudioHistoryLoaded({ force: true });
  }

  async function pollVideoStatus(videoId: string, payload: any) {
    for (const delay of HEYGEN_FALLBACK_POLL_DELAYS) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      const status = await heygenApi.getVideoStatus(videoId, payload);
      const nextStatus = String(status.jobStatus || "processing").toLowerCase();
      console.log("[HeyGenWorkspace] pollVideoStatus:", {
        videoId,
        delay,
        nextStatus,
        hasVideoUrl: Boolean(status.videoUrl),
        hasThumbnailUrl: Boolean(status.thumbnailUrl),
        error: status.error || "",
      });
      setJobStatus(nextStatus);
      if (status.videoUrl) setJobVideoUrl(status.videoUrl);
      if (TERMINAL_JOB_STATES.has(nextStatus)) {
        if (nextStatus !== "completed" && status.error) setErrorMessage(status.error);
        return status;
      }
    }
    setJobStatus("processing");
    return null;
  }

  async function handleGenerate() {
    if (!selectedAvatarId) {
      setErrorMessage("Vui lòng chọn avatar trước khi tạo video.");
      return;
    }

    if (selectedModel.engineType === "avatar_iii" || usePersonalVoiceMode) {
      if (!avatarThreeScript.trim()) {
        setErrorMessage("Vui lòng nhập kịch bản phát thanh để render bằng HeyGen voice.");
        return;
      }
      if (!selectedHeyGenVoiceId) {
        setErrorMessage("Vui lòng chọn giọng nói HeyGen.");
        return;
      }
    } else {
      const hasAudio = Boolean(selectedAudioRecordId);
      if (!hasAudio) {
        setErrorMessage("Vui lòng chọn giọng nói để tạo video.");
        return;
      }
    }

    setIsGenerating(true);
    setErrorMessage("");
    setJobStatus("processing");
    setJobVideoUrl("");

    try {
      const payload: any = {
        avatarId: selectedAvatarId,
        enableCaption,
        aspectRatio,
        resolution: "720p" as const,
        engineType: selectedModel.engineType,
        title: selectedModel.engineType === "avatar_iii" ? "Video Avatar III" : "Video người nói",
        description: selectedModel.engineType === "avatar_iii" ? "Tạo từ kịch bản văn bản" : "Video avatar với HeyGen Studio",
        avatarBackground,
        backgroundColor,
        avatarLayout,
      };

      if (selectedModel.engineType === "avatar_iii" || usePersonalVoiceMode) {
        payload.voiceId = selectedHeyGenVoiceId;
        payload.inputText = avatarThreeScript;
        payload.usePersonalVoice = usePersonalVoiceMode;
      } else {
        payload.audioRecordId = selectedAudioRecordId || undefined;
        payload.audioUrl = selectedAudio?.url || undefined;
      }

      const created = await heygenApi.createAvatarVideo(payload);
      console.log("[HeyGenWorkspace] createAvatarVideo result:", created);
      setJobStatus(String(created.jobStatus || "processing").toLowerCase());
      const finalStatus = await pollVideoStatus(created.videoId, payload);
      console.log("[HeyGenWorkspace] finalStatus after polling:", finalStatus);
      if (!finalStatus?.videoUrl) {
        setWarnings((current) => current.includes("Video đang chờ cập nhật lịch sử. Bạn xem trực tiếp trong lịch sử bên dưới.") ? current : ["Video đang chờ cập nhật lịch sử. Bạn xem trực tiếp trong lịch sử bên dưới.", ...current]);
      }
      const historyRes = await heygenApi.getVideoHistory();
      console.log("[HeyGenWorkspace] history after create:", historyRes.history || []);
      setHistory(historyRes.history || []);
      setHasLoadedHistory(true);

      let finalVideoUrl = finalStatus?.videoUrl || "";
      if (!finalVideoUrl) {
        const matched = (historyRes.history || []).find((item: any) => (item.videoId || item.id || item._id) === created.videoId);
        if (matched?.url) {
          finalVideoUrl = matched.url;
          setJobVideoUrl(matched.url);
        }
      }

      if (finalVideoUrl && cardId && onMediaSaved) {
        toast.info("Đang tối ưu lưu trữ video trên Cloudinary...");
        try {
          const filename = `human_video_${Date.now()}.mp4`;
          const cloudinaryUrl = await marketingService.uploadMediaToStorage(finalVideoUrl, filename, 'video');
          onMediaSaved(cardId, cloudinaryUrl, 'video');
          toast.success("Tối ưu lưu trữ và cập nhật trạng thái bài đăng thành công!");
        } catch (cloudinaryErr) {
          console.error("Cloudinary upload failed, using original URL:", cloudinaryErr);
          onMediaSaved(cardId, finalVideoUrl, 'video');
        }
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Không thể tạo video");
      setJobStatus("failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeleteHistory(videoId: string) {
    try {
      await heygenApi.deleteVideoHistory(videoId);
      await reloadHistoryData();
    } catch (error: any) {
      setErrorMessage(error.message || "Không thể xóa video");
    }
  }

  function handleEditRecent(item: any) {
    const editUrl = String(item?.url || item?.captionedVideoUrl || item?.videoPageUrl || "").trim();
    if (!isPlayableVideoUrl(editUrl)) {
      setErrorMessage("Video này chưa sẵn sàng để đưa sang chỉnh sửa Video.");
      return;
    }

    if (onEditVideo) {
      onEditVideo(editUrl);
      return;
    }

    setPreviewVideoUrl(editUrl);
  }

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const { scrollLeft, clientWidth } = carouselRef.current;
      const scrollAmount = clientWidth * 0.75;
      const scrollTo = direction === "left" ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
      carouselRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  const handleDownloadVideo = async (item: any) => {
    const downloadUrl = item.url || item.captionedVideoUrl || item.videoPageUrl || "";
    if (!isPlayableVideoUrl(downloadUrl)) return;
    toast.info("Đang tải xuống video...");
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${item.prompt || "heygen-video"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Tải xuống video thành công!");
    } catch (error) {
      console.error("Direct download failed, opening in new tab:", error);
      window.open(downloadUrl, "_blank");
      toast.warning("Mở video trong tab mới để tải về.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-5 px-2">
      <div className={`flex h-[calc(100vh-190px)] min-h-[560px] max-h-[760px] w-full overflow-hidden rounded-[24px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} shadow-sm transition-all duration-300`}>
        <HeyGenVideoPreview
          selectedAvatar={selectedAvatar}
          script={activeScript}
          onScriptChange={setAvatarThreeScript}
          selectedAvatarModel={selectedAvatarModel}
          usePersonalVoiceMode={usePersonalVoiceMode}
          enableCaption={enableCaption}
          setEnableCaption={setEnableCaption}
          captionPreset={captionPreset}
          captionFontFamily={captionFontFamily}
          captionFontSize={captionFontSize}
          captionPrimaryColor={captionPrimaryColor}
          captionSecondaryColor={captionSecondaryColor}
          captionPosition={captionPosition}
          captionOffset={captionOffset}
          setCaptionOffset={setCaptionOffset}
          avatarLayout={avatarLayout}
          avatarBackground={avatarBackground}
          backgroundColor={backgroundColor}
          previewVideoUrl={previewVideoUrl || jobVideoUrl}
          aspectRatio={aspectRatio}
        />

        {isDrawerOpen ? (
          <Suspense fallback={<DrawerFallback />}>
            <HeyGenOptionsDrawer
              activeTab={activeTab}
              onClose={() => setIsDrawerOpen(false)}
              selectedAvatar={selectedAvatar}
              selectedAudio={selectedAudio}
              selectedHeyGenVoice={selectedHeyGenVoice}
              usePersonalVoiceMode={usePersonalVoiceMode}
              isLoadingLibrary={isLoadingLibrary}
              onOpenAvatarPicker={() => setIsAvatarPickerOpen(true)}
              onOpenVoicePicker={() => void handleOpenVoicePicker()}
              onOpenModelPicker={() => setIsModelPickerOpen(true)}
              selectedAvatarModel={selectedAvatarModel}
              selectedAvatarModelDescription={selectedModel.description}
              avatarBackground={avatarBackground}
              setAvatarBackground={setAvatarBackground}
              avatarLayout={avatarLayout}
              setAvatarLayout={setAvatarLayout}
              backgroundColor={backgroundColor}
              setBackgroundColor={setBackgroundColor}
              enableCaption={enableCaption}
              setEnableCaption={setEnableCaption}
              captionPreset={captionPreset}
              setCaptionPreset={setCaptionPreset}
              captionFontFamily={captionFontFamily}
              setCaptionFontFamily={setCaptionFontFamily}
              captionFontSize={captionFontSize}
              setCaptionFontSize={setCaptionFontSize}
              captionPrimaryColor={captionPrimaryColor}
              setCaptionPrimaryColor={setCaptionPrimaryColor}
              captionSecondaryColor={captionSecondaryColor}
              setCaptionSecondaryColor={setCaptionSecondaryColor}
              captionPosition={captionPosition}
              setCaptionPosition={(position) => {
                setCaptionPosition(position);
                setCaptionOffset(position === "top" ? { x: 50, y: 16 } : position === "middle" ? { x: 50, y: 50 } : { x: 50, y: 86 });
              }}
              isGenerating={isGenerating}
              onRender={handleGenerate}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
            />
          </Suspense>
        ) : null}

        <HeyGenVerticalToolbar activeTab={activeTab} onChangeTab={(tab) => { setActiveTab(tab); setIsDrawerOpen(true); }} />
      </div>

      {isLoadingLibrary ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-xs font-semibold text-cyan-700">
          <p className="font-bold">Đang tải thư viện AI...</p>
          <p className="mt-1 text-cyan-600">Hệ thống đang đồng bộ avatar và tùy chọn motion từ phía máy chủ.</p>
        </div>
      ) : null}

      {(errorMessage || warnings.length > 0 || jobStatus) ? (
        <div className={`rounded-2xl border p-4 text-xs font-semibold ${errorMessage ? "border-rose-200 bg-rose-50 text-rose-700" : "border-cyan-200 bg-cyan-50 text-cyan-700"}`}>
          {errorMessage ? <p className="font-bold">{errorMessage}</p> : null}
          {!errorMessage && warnings.length > 0 ? <p className="font-bold">{warnings[0]}</p> : null}
          {!errorMessage && !warnings.length && jobStatus ? <p className="font-bold">Trạng thái render: {translateJobStatus(jobStatus)}</p> : null}
        </div>
      ) : null}

      <div ref={historySectionRef} className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center justify-between gap-3 pb-4">
          <div>
            <h4 className="text-xl font-bold tracking-tight text-slate-900">Lịch sử tạo video</h4>
            <p className="mt-1 text-sm text-slate-400">Hiển thị tối đa 20 kết quả gần nhất, từ mới đến cũ.</p>
          </div>
          <span className="rounded-full bg-cyan-50 border border-cyan-100 px-3.5 py-1 text-sm font-bold text-cyan-600">
            {history.slice(0, 20).length}/20
          </span>
        </div>

        <hr className="border-slate-100 mb-6" />

        {!hasLoadedHistory ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <p className="text-sm">Lịch sử sẽ được tải khi bạn cuộn xuống dưới cùng.</p>
          </div>
        ) : isLoadingHistory && history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <LoaderCircle className="h-6 w-6 animate-spin text-cyan-600 mb-2" />
            <p className="text-sm">Đang tải lịch sử video...</p>
          </div>
        ) : history.length > 0 ? (
          <div className="relative group/carousel">
            {/* Left Button */}
            <button
              type="button"
              onClick={() => scrollCarousel("left")}
              className="absolute -left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-600 shadow-md transition hover:scale-105 hover:bg-slate-50 hover:text-slate-900"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Scroll Area */}
            <div
              ref={carouselRef}
              className="flex gap-5 overflow-x-auto scroll-smooth py-2 px-1 scrollbar-none"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {history.slice(0, 20).map((item, index) => {
                const status = String(item.status || "").toLowerCase();
                const isCompleted = status === "completed";
                const isFailed = ["failed", "error", "canceled"].includes(status);
                const isProcessing = !isCompleted && !isFailed;
                const renderName = `Render ${history.length - index}`;
                const aspectRatio = item.metadata?.aspectRatio || "16:9";
                const videoUrl = item.url || item.captionedVideoUrl || item.videoPageUrl || "";
                const hasVideoUrl = isPlayableVideoUrl(videoUrl);

                return (
                  <div
                    key={item._id || item.id || index}
                    onClick={() => {
                      if (isProcessing) {
                        toast.info("Video đang trong quá trình xử lý, vui lòng chờ hoàn tất.");
                        return;
                      }
                      setPreviewItem(item);
                    }}
                    title={item.prompt || item.title || renderName}
                    className={`relative w-[240px] aspect-[16/9] flex-shrink-0 overflow-hidden rounded-[20px] border-2 bg-slate-900 cursor-pointer shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.02] group/card ${index === 0
                        ? "border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                        : "border-slate-100 hover:border-cyan-400"
                      }`}
                  >
                    {isCompleted ? (
                      <>
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={renderName}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : hasVideoUrl ? (
                          <video
                            src={videoUrl}
                            preload="metadata"
                            playsInline
                            className="absolute inset-0 h-full w-full object-cover bg-transparent"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                            <Play className="h-8 w-8 text-white/50" />
                          </div>
                        )}
                        {/* Play Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 transition hover:bg-slate-950/30">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-slate-950/30 text-white backdrop-blur-[2px]">
                            <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />
                          </div>
                        </div>

                        {/* Direct Download Button on Card */}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleDownloadVideo(item);
                          }}
                          className="absolute top-2.5 right-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/60 hover:bg-cyan-600 border border-white/20 text-white backdrop-blur-[2px] opacity-0 group-hover/card:opacity-100 transition-all duration-200 shadow-sm"
                          title="Tải video trực tiếp"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </>
                    ) : isFailed ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/70 p-3 text-center text-white">
                        <span className="text-xs font-bold uppercase tracking-wider text-rose-300">Thất bại</span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-3 text-center text-white">
                        <LoaderCircle className="h-6 w-6 animate-spin text-cyan-400 mb-1.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                          Đang xử lý
                        </span>
                      </div>
                    )}

                    {/* Bottom Info Bar */}
                    <div className="absolute bottom-0 inset-x-0 bg-[linear-gradient(to_top,rgba(15,23,42,0.95),rgba(15,23,42,0.3))] p-2.5 flex justify-between items-center text-white text-[11px] font-semibold">
                      <span className="truncate max-w-[150px]">{renderName}</span>
                      <span className="bg-slate-950/40 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide border border-white/10">
                        {aspectRatio}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Button */}
            <button
              type="button"
              onClick={() => scrollCarousel("right")}
              className="absolute -right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-600 shadow-md transition hover:scale-105 hover:bg-slate-50 hover:text-slate-900"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <p className="text-sm">Chưa có video người thật nào được tạo.</p>
          </div>
        )}
      </div>

      {/* Detail Preview & Action Modal */}
      {previewItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm cursor-pointer"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl flex flex-col md:flex-row gap-6 cursor-default overflow-hidden border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setPreviewItem(null)}
              className="absolute right-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 shadow-sm transition hover:scale-105"
              title="Đóng"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left Column: Video Player */}
            <div className="flex-1 rounded-[24px] bg-slate-950 overflow-hidden flex items-center justify-center md:h-[440px] w-full relative border border-slate-900">
              {String(previewItem.status || "").toLowerCase() === "completed" && isPlayableVideoUrl(previewItem.url || previewItem.captionedVideoUrl || previewItem.videoPageUrl) ? (
                <video
                  src={previewItem.url || previewItem.captionedVideoUrl || previewItem.videoPageUrl || ""}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-full max-w-full object-contain bg-transparent"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 h-full w-full bg-slate-950">
                  <span className="text-rose-400 text-sm font-bold mb-2">Video này render bị lỗi</span>
                  <p className="text-xs text-slate-500 max-w-xs">
                    {previewItem.error || "Không thể phát video này do lỗi hệ thống HeyGen."}
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Actions Only (Circular Icons) */}
            <div className="w-full md:w-[70px] flex flex-row md:flex-col justify-center items-center gap-4 py-2 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
              {String(previewItem.status || "").toLowerCase() === "completed" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleEditRecent(previewItem);
                      setPreviewItem(null);
                    }}
                    className="flex h-13 w-13 items-center justify-center rounded-full bg-cyan-50 hover:bg-cyan-100 text-cyan-600 transition shadow-sm hover:scale-105"
                    title="Chỉnh sửa video này"
                  >
                    <Pencil className="h-5.5 w-5.5" />
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setIsDownloading(true);
                      await handleDownloadVideo(previewItem);
                      setIsDownloading(false);
                    }}
                    disabled={isDownloading}
                    className="flex h-13 w-13 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-50 shadow-sm hover:scale-105"
                    title="Tải xuống video"
                  >
                    {isDownloading ? (
                      <LoaderCircle className="h-5.5 w-5.5 animate-spin text-slate-500" />
                    ) : (
                      <Download className="h-5.5 w-5.5" />
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Bạn có chắc chắn muốn xóa video này khỏi lịch sử không?")) {
                    handleDeleteHistory(previewItem.videoId || previewItem.id || previewItem._id);
                    setPreviewItem(null);
                  }
                }}
                className="flex h-13 w-13 items-center justify-center rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 transition shadow-sm hover:scale-105"
                title="Xóa lịch sử video"
              >
                <Trash2 className="h-5.5 w-5.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAvatarPickerOpen ? (
        <Suspense fallback={<ModalFallback label="Đang tải danh sách avatar..." />}>
          <PickerPopover title="Thay avatar" items={avatars} selectedId={selectedAvatarId} onClose={() => setIsAvatarPickerOpen(false)} onSelect={(item) => { setSelectedAvatarId(item.id); setIsAvatarPickerOpen(false); }} emptyLabel="Chưa có avatar nào được cấp cho tài khoản này." />
        </Suspense>
      ) : null}
      {isAudioPickerOpen ? (
        <Suspense fallback={<ModalFallback label="Đang tải danh sách giọng nói..." />}>
          <VoiceSourcePopover
            title="Đổi giọng nói"
            activeTab={voicePickerTab}
            onTabChange={(tab) => {
              setVoicePickerTab(tab);
              if (tab === "third-party" && !hasLoadedAudioHistory && !isLoadingAudioHistory) {
                void ensureAudioHistoryLoaded();
              }
            }}
            thirdPartyItems={audioRecords}
            selectedThirdPartyId={selectedAudioRecordId}
            isLoadingThirdParty={isLoadingAudioHistory}
            onRefreshThirdParty={() => void refreshAudioHistory()}
            onSelectThirdParty={(item) => {
              setSelectedAudioRecordId(item._id);
              setUsePersonalVoiceMode(false);
              setIsAudioPickerOpen(false);
            }}
            personalItems={personalHeyGenVoices}
            selectedPersonalId={selectedHeyGenVoiceId}
            onSelectPersonal={(item) => {
              setSelectedHeyGenVoiceId(item.id);
              setUsePersonalVoiceMode(true);
              setAvatarThreeScript((current) => current.trim() || selectedAudio?.prompt || initialPrompt || "");
              setIsAudioPickerOpen(false);
              toast.info(`Đã chọn giọng cá nhân "${item.name}" và bật chế độ text-to-voice của HeyGen.`);
            }}
            personalHint={`${personalVoiceHint} Khi chọn giọng cá nhân, bạn có thể dùng text-to-voice HeyGen cho Avatar IV/V hoặc Avatar III.`}
            onClose={() => setIsAudioPickerOpen(false)}
          />
        </Suspense>
      ) : null}
      {isModelPickerOpen ? (
        <Suspense fallback={<ModalFallback label="Đang tải bộ máy chuyển động..." />}>
          <ModelSelectionPopover title="Bộ máy chuyển động" items={HEYGEN_MODEL_OPTIONS.map((item) => ({ id: item.id, description: item.description, icon: item.icon }))} selectedValue={selectedAvatarModel} onClose={() => setIsModelPickerOpen(false)} onSelect={(value) => { setSelectedAvatarModel(value); setIsModelPickerOpen(false); }} />
        </Suspense>
      ) : null}
    </div>
  );
}

function PagerButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex h-9 items-center justify-center rounded-full border ${HEYGEN_THEME.border} bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50`}>{children}</button>;
}

function DrawerFallback() {
  return <div className={`h-full w-[340px] shrink-0 border-l ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} xl:w-[360px]`} />;
}

function ModalFallback({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`rounded-[24px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} px-6 py-5 text-sm font-semibold text-slate-600 shadow-2xl`}>
        {label}
      </div>
    </div>
  );
}
