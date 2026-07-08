import React, { useState, useEffect } from "react";
import {
  Loader2, UploadCloud, Video, Download, Play, Sparkles,
  X, Trash2, ChevronLeft, ChevronRight, Film, Volume2, VolumeX,
} from "lucide-react";
import { useProgress } from "../../hooks/use-progress";
import { geminiApi } from "../../api/gemini";
import { klingApi } from "../../api/kling";
import { toast } from "../../pages/Toast";
import { getAccessToken } from "../../services/authService";

const KLING_MODELS = [
  { value: "kling-v2-6", label: "Kling v2.6", desc: "Ổn định, nhanh" },
  { value: "kling-v3", label: "Kling v3", desc: "Chất lượng cao nhất" },
] as const;

const MAX_VIDEO_SIZE_MB = 50;

const KLING_COST_PER_SECOND: Record<string, Record<string, number>> = {
  "kling-v2-6": { std: 18, pro: 28 },
  "kling-v3":   { std: 32, pro: 43 },
};

function calcEstimatedCost(model: string, m: string, durationSec: number): number {
  const rate = KLING_COST_PER_SECOND[model]?.[m] ?? 32;
  return Math.ceil(durationSec) * rate;
}

export function KlingMotionWorkspace({
  cardId,
  onMediaSaved,
}: {
  cardId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: "image" | "video" | "audio") => void;
}) {
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [motionVideo, setMotionVideo] = useState<string | null>(null);
  const [motionVideoName, setMotionVideoName] = useState<string>("");
  const [prompt, setPrompt] = useState("");

  const [modelName, setModelName] = useState<string>("kling-v2-6");
  const [mode, setMode] = useState<"std" | "pro">("std");
  const [characterOrientation, setCharacterOrientation] = useState<"video" | "image">("video");
  const [keepOriginalSound, setKeepOriginalSound] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const generateProgress = useProgress(isGenerating, 120);

  const loadHistory = async (showLoading = true) => {
    if (showLoading) setIsLoadingHistory(true);
    try {
      const response = await geminiApi.getMediaHistory("video");
      const klingRecords = (response.history || []).filter(
        (r: any) => r.metadata?.provider === "kling" || String(r.url || "").startsWith("pending://kling/")
      );
      setHistory(klingRecords);
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoading) setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Poll history every 5s when there are pending records
  useEffect(() => {
    const hasPending = history.some(
      (r) => r.url && (r.url.startsWith("pending://kling/") || r.metadata?.status === "processing")
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const response = await geminiApi.getMediaHistory("video");
        const klingRecords = (response.history || []).filter(
          (r: any) => r.metadata?.provider === "kling" || String(r.url || "").startsWith("pending://kling/")
        );
        setHistory(klingRecords);
      } catch (err) {
        console.error("[KlingMotionWorkspace] Polling error:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [history]);

  // Resolve pending URL once history has the completed record
  useEffect(() => {
    if (!generatedVideoUrl || !generatedVideoUrl.startsWith("pending://kling/")) return;

    const pendingTaskId = generatedVideoUrl.replace("pending://kling/", "");
    const matched = history.find(
      (r) => r.metadata?.piapiTaskId === pendingTaskId && r.metadata?.provider === "kling"
    );
    if (!matched) return;

    if (matched.url && !matched.url.startsWith("pending://")) {
      setGeneratedVideoUrl(matched.url);
      setIsGenerating(false);
      return;
    }

    if (matched.metadata?.status === "failed" || matched.metadata?.status === "timeout") {
      setGeneratedVideoUrl(null);
      setIsGenerating(false);
      toast.error("Tạo video motion control thất bại. Vui lòng thử lại.");
    }
  }, [generatedVideoUrl, history]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCharacterImage(reader.result as string);
      toast.success("Đã tải ảnh nhân vật lên!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      toast.error(`Video quá lớn (${sizeMB.toFixed(1)} MB). Giới hạn là ${MAX_VIDEO_SIZE_MB} MB.`);
      e.target.value = "";
      return;
    }

    // Detect duration via temporary object URL
    const objectUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration);
      URL.revokeObjectURL(objectUrl);
    };
    tempVideo.src = objectUrl;

    setIsUploadingVideo(true);
    setMotionVideoName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setMotionVideo(reader.result as string);
      setIsUploadingVideo(false);
      toast.success("Đã tải video chuyển động lên!");
    };
    reader.onerror = () => {
      setIsUploadingVideo(false);
      toast.error("Không thể đọc file video.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDownloadVideo = async (uri?: string) => {
    const targetUri = uri || generatedVideoUrl;
    if (!targetUri) return;

    toast.info("Đang tải video về máy...");
    try {
      const fileName = `kling-motion-${Date.now()}.mp4`;
      const proxyUrl = `/api/v1/media/download?url=${encodeURIComponent(targetUri)}&filename=${encodeURIComponent(fileName)}`;
      const response = await fetch(proxyUrl, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Tải video thành công!");
    } catch {
      const link = document.createElement("a");
      link.href = targetUri;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.warning("Không thể tải trực tiếp. Video đã được mở trong tab mới.");
    }
  };

  const handleGenerate = async () => {
    if (!characterImage) {
      toast.warning("Vui lòng tải lên ảnh nhân vật tham chiếu.");
      return;
    }
    if (!motionVideo) {
      toast.warning("Vui lòng tải lên video chuyển động tham chiếu.");
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      toast.success("Đang gửi lệnh tạo video Motion Control. Quá trình này có thể mất vài phút...");

      const result = await klingApi.createMotionControl({
        imageUrl: characterImage,
        videoUrl: motionVideo,
        modelName,
        mode,
        prompt: prompt.trim() || undefined,
        characterOrientation,
        keepOriginalSound,
        videoDuration: videoDuration > 0 ? videoDuration : undefined,
      });

      setGeneratedVideoUrl(result.url);

      if (!result.url.startsWith("pending://")) {
        setIsGenerating(false);
        toast.success("Tạo video Motion Control thành công!");
      } else {
        toast.success("Yêu cầu đã gửi! Đang xử lý ở chế độ nền, không cần tải lại trang.");
      }

      loadHistory(false);
    } catch (e: any) {
      console.error(e);
      setIsGenerating(false);
      toast.error(`Không thể tạo video: ${e.message}`);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa video này khỏi lịch sử?")) return;
    try {
      await geminiApi.deleteMediaHistory(id);
      toast.success("Đã xóa video thành công.");
      setHistory((prev) => prev.filter((r) => r._id !== id && r.id !== id));
      const deleted = history.find((r) => r._id === id || r.id === id);
      if (deleted?.url === generatedVideoUrl) setGeneratedVideoUrl(null);
    } catch (e: any) {
      toast.error(`Lỗi khi xóa: ${e.message}`);
    }
  };

  const canGenerate = !!characterImage && !!motionVideo && !isGenerating && !isUploadingVideo;

  return (
    <div className="max-w-[1600px] mx-auto w-full pb-8 px-2 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT PANEL */}
        <div className="lg:col-span-5 flex flex-col gap-4 bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs">

          {/* Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <Film className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Kling Motion Control</p>
              <p className="text-[10px] text-slate-400">Nhân vật từ ảnh thực hiện chuyển động theo video mẫu</p>
            </div>
          </div>

          {/* Character Image Upload */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Ảnh nhân vật tham chiếu <span className="text-red-400">*</span>
            </span>
            <div className="border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/30 flex flex-col items-center justify-center relative min-h-[130px] hover:border-violet-400/60 hover:bg-violet-50/10 transition-all duration-300">
              {characterImage ? (
                <div className="relative w-full">
                  <img
                    src={characterImage}
                    alt="Character reference"
                    className="w-full max-h-[160px] object-contain rounded-xl border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setCharacterImage(null)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black text-white rounded-full transition-all cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center text-center w-full py-2">
                  <UploadCloud className="h-7 w-7 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-700">Tải ảnh nhân vật lên</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, WEBP</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              )}
            </div>
          </div>

          {/* Motion Video Upload */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Video chuyển động mẫu <span className="text-red-400">*</span>
              </span>
              <span className="text-[9px] text-slate-400">Tối đa {MAX_VIDEO_SIZE_MB}MB · MP4 / MOV</span>
            </div>
            <div className="border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/30 flex flex-col items-center justify-center relative min-h-[100px] hover:border-violet-400/60 hover:bg-violet-50/10 transition-all duration-300">
              {isUploadingVideo ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                  <span className="text-xs font-medium">Đang đọc file video...</span>
                </div>
              ) : motionVideo ? (
                <div className="w-full flex items-center gap-3 p-2 bg-violet-50 rounded-xl border border-violet-100">
                  <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <Film className="h-4 w-4 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{motionVideoName || "video_motion.mp4"}</p>
                    <p className="text-[10px] text-violet-500 font-medium">Sẵn sàng</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMotionVideo(null); setMotionVideoName(""); setVideoDuration(0); }}
                    className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full transition-all cursor-pointer shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center text-center w-full py-2">
                  <UploadCloud className="h-7 w-7 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-700">Tải video chuyển động lên</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Nhân vật trong video cần luôn hiển thị, 1 cảnh liên tục</span>
                  <input type="file" accept="video/mp4,video/mov,video/quicktime" className="hidden" onChange={handleVideoUpload} />
                </label>
              )}
            </div>
          </div>

          {/* Prompt (optional) */}
          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mô tả thêm (tuỳ chọn)</span>
            <textarea
              placeholder="Ví dụ: nhân vật đang nhảy điệu samba trên sân khấu ngoài trời..."
              className="w-full text-xs p-3 border border-slate-200 rounded-xl h-18 focus:ring-1 focus:ring-violet-400 focus:outline-none leading-relaxed bg-slate-50/20 resize-none font-medium"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              maxLength={2500}
            />
          </div>

          {/* Settings */}
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-3.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cài đặt</span>

            {/* Model */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-semibold">Phiên bản mô hình</span>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none cursor-pointer font-medium text-slate-800"
                disabled={isGenerating}
              >
                {KLING_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-semibold">Chất lượng xuất</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("std")}
                  disabled={isGenerating}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    mode === "std"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Standard · 720p
                </button>
                <button
                  type="button"
                  onClick={() => setMode("pro")}
                  disabled={isGenerating}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    mode === "pro"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Pro · 1080p
                </button>
              </div>
            </div>

            {/* Character Orientation */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-semibold">Hướng nhân vật</span>
                <span className="text-[9px] text-slate-400">
                  {characterOrientation === "video" ? "Tối đa 30 giây" : "Tối đa 10 giây"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCharacterOrientation("video")}
                  disabled={isGenerating}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    characterOrientation === "video"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Theo video
                </button>
                <button
                  type="button"
                  onClick={() => setCharacterOrientation("image")}
                  disabled={isGenerating}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    characterOrientation === "image"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  Theo ảnh
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                {characterOrientation === "video"
                  ? "Nhân vật theo hướng trong video mẫu — hỗ trợ chuyển động phức tạp."
                  : "Nhân vật giữ hướng từ ảnh gốc — phù hợp với chuyển động camera."}
              </p>
            </div>

            {/* Keep Original Sound */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-2">
                {keepOriginalSound ? (
                  <Volume2 className="h-3.5 w-3.5 text-violet-500" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span className="text-xs font-semibold text-slate-700">Giữ âm thanh gốc từ video</span>
              </div>
              <button
                type="button"
                onClick={() => setKeepOriginalSound(!keepOriginalSound)}
                disabled={isGenerating}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  keepOriginalSound ? "bg-violet-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                    keepOriginalSound ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Estimated Cost */}
          {videoDuration > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-violet-50 border border-violet-100 rounded-xl text-[10px]">
              <span className="text-slate-500 font-medium">
                Ước tính phí · {videoDuration.toFixed(1)}s × {KLING_COST_PER_SECOND[modelName]?.[mode] ?? 32} credits/s
              </span>
              <span className="font-bold text-violet-700">
                {calcEstimatedCost(modelName, mode, videoDuration).toLocaleString()} credits
              </span>
            </div>
          )}

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-95 shadow-md ${
              canGenerate
                ? "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200"
                : "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed"
            }`}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Tạo Video Motion Control
          </button>

          {!characterImage && !motionVideo && (
            <p className="text-[10px] text-center text-slate-400">
              Cần cả ảnh nhân vật và video chuyển động để bắt đầu.
            </p>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-7 flex flex-col gap-6 relative bg-slate-50/30 border border-slate-200/60 p-6 rounded-3xl min-h-[660px] justify-between">

          {/* Preview */}
          <div className="flex-1 flex flex-col justify-center items-center relative min-h-[360px] mb-4">
            {isGenerating && !generatedVideoUrl ? (
              <div className="flex flex-col items-center gap-4 text-slate-400 p-8 text-center animate-pulse">
                <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
                <div className="flex flex-col gap-1.5 items-center">
                  <span className="text-xs font-bold tracking-wider uppercase font-mono text-violet-400">
                    Đang dựng Motion Control {generateProgress}%...
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Kling AI đang tổng hợp chuyển động, có thể mất vài phút.
                  </span>
                </div>
                <div className="w-48 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    className="bg-violet-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${generateProgress}%` }}
                  />
                </div>
              </div>
            ) : generatedVideoUrl ? (
              <div className="w-full flex flex-col gap-3">
                <div className="w-full flex items-center justify-center relative rounded-3xl overflow-hidden border border-slate-200 bg-black shadow-lg aspect-video max-h-[380px]">
                  {generatedVideoUrl.startsWith("pending://kling/") ? (() => {
                    const taskId = generatedVideoUrl.replace("pending://kling/", "");
                    const matched = history.find((r) => r.metadata?.piapiTaskId === taskId);
                    const progressVal = matched?.metadata?.progress;
                    return (
                      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-xs font-bold text-violet-400 uppercase tracking-widest p-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mb-2 text-violet-500" />
                        Video đang được dựng...
                        {progressVal !== undefined && (
                          <div className="flex flex-col items-center gap-1.5 mt-2 w-48 mx-auto">
                            <span className="text-[10px] text-violet-300 font-mono">Tiến độ: {progressVal}%</span>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-violet-500 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${progressVal}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 normal-case font-normal mt-2">
                          Hệ thống đang xử lý ở chế độ nền. Không cần tải lại trang.
                        </span>
                      </div>
                    );
                  })() : (
                    <>
                      <video
                        src={generatedVideoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        crossOrigin="anonymous"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-4 right-4 opacity-0 hover:opacity-100 transition-opacity z-10">
                        <button
                          type="button"
                          onClick={() => handleDownloadVideo()}
                          className="p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl shadow border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
                        >
                          <Download className="h-4 w-4" />
                          Tải Video
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center select-none">
                <div className="h-12 w-12 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center mb-2">
                  <Film className="h-6 w-6 text-violet-300 stroke-[1.5]" />
                </div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Motion Control sẵn sàng</span>
                <span className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  Tải lên ảnh nhân vật và video chuyển động mẫu, rồi nhấn nút tạo video để bắt đầu.
                </span>
              </div>
            )}
          </div>

          {/* History */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-lg flex flex-col gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-800 text-xs">Lịch sử Motion Control</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Hiển thị tối đa 20 kết quả gần nhất.</p>
              </div>
              <span className="px-2.5 py-0.5 bg-violet-50 text-violet-600 rounded-full text-[10px] font-bold font-mono">
                {history.slice(0, 20).length}/20
              </span>
            </div>

            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-6 w-6 text-violet-500 animate-spin mb-2" />
                <span className="text-[9px] uppercase tracking-wider font-mono">Đang tải...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 border border-dashed rounded-xl bg-slate-50/50">
                <Video className="h-6 w-6 text-slate-300 mb-2" />
                <span className="text-[10px] font-semibold text-slate-400">Chưa có video motion control</span>
              </div>
            ) : (
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("kling_history_slider");
                    if (el) el.scrollLeft -= 200;
                  }}
                  className="h-7 w-7 rounded-full bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 shadow-xs cursor-pointer shrink-0 active:scale-90 transition-transform"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div
                  id="kling_history_slider"
                  className="flex-1 overflow-x-auto flex gap-3 pb-1 scroll-smooth"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {history.slice(0, 20).map((record, index) => {
                    const id = record._id || record.id;
                    const isActive = generatedVideoUrl === record.url;
                    const isPending =
                      !record.url ||
                      record.url.startsWith("pending://") ||
                      record.metadata?.status === "processing";

                    return (
                      <div
                        key={id}
                        onClick={() => !isPending && setGeneratedVideoUrl(record.url)}
                        className={`w-32 aspect-[16/10] relative rounded-xl overflow-hidden bg-slate-950 shadow-xs shrink-0 border-2 transition-all group/item ${
                          isActive ? "border-violet-500" : "border-transparent"
                        } ${!isPending ? "cursor-pointer hover:shadow-md" : "cursor-default"}`}
                      >
                        {!isPending && record.url ? (
                          <video
                            src={record.url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                            playsInline
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-[8px] font-bold text-violet-400 uppercase tracking-widest p-1 text-center">
                            <Loader2 className="h-4 w-4 animate-spin mb-1 text-violet-500" />
                            ĐANG DỰNG
                            {record.metadata?.progress !== undefined && ` ${record.metadata.progress}%`}
                          </div>
                        )}

                        {!isPending && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 group-hover/item:opacity-100 transition-opacity">
                            <div className="h-6 w-6 rounded-full bg-white/95 flex items-center justify-center text-slate-900 shadow">
                              <Play className="h-2.5 w-2.5 fill-slate-900 ml-0.5" />
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteHistory(id);
                          }}
                          className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-md opacity-0 group-hover/item:opacity-100 transition-opacity z-10"
                          title="Xóa khỏi lịch sử"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>

                        <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between items-center text-[8px] font-bold text-white bg-black/40 px-1 py-0.5 rounded backdrop-blur-xs">
                          <span className="truncate max-w-[55px]">{`MC ${history.length - index}`}</span>
                          <span className="text-violet-300">Kling</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("kling_history_slider");
                    if (el) el.scrollLeft += 200;
                  }}
                  className="h-7 w-7 rounded-full bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 shadow-xs cursor-pointer shrink-0 active:scale-90 transition-transform"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
