import React, { useState, useRef, useEffect } from 'react';
import { useProgress } from '../../hooks/use-progress';
import { geminiApi } from '../../api/gemini';
import { toast } from '../../pages/Toast';
import {
  Loader2, UploadCloud, Video, Download, Play, Sparkles,
  Images, Settings, X, Trash2, Wand2,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { marketingService } from '../../services/marketingService';
import { VeoSettingsPanel } from './VeoSettingsPanel';
import { getAccessToken } from '../../services/authService';

const VIDEO_TEMPLATES = [
  { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
  { id: 'cinematic', label: '🎬 Điện ảnh (Cinematic)', prompt: 'Cảnh quan hùng vĩ, ánh sáng hoàng hôn ấm áp, máy quay bay cao lướt qua những ngọn núi tuyết, phong cách Flycam.' },
  { id: 'product', label: '📦 Quay sản phẩm (Creative)', prompt: 'Quay cận cảnh sản phẩm thời trang, máy quay xoay tròn 360 độ, ánh sáng studio chuyên nghiệp, phông nền tối giản, chuyển động mượt mà.' },
  { id: 'fashion', label: '👗 Fashion Walk', prompt: 'Người mẫu đi bộ trên sàn runway, ánh sáng đèn flash lung linh, bối cảnh studio cao cấp, chuyển động slow-motion.' },
];

export function SimpleVideoWorkspace({ initialPrompt, cardId, onMediaSaved, onEditVideo, initialImage, autoTrigger }: {
  initialPrompt?: string;
  cardId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
  onEditVideo?: (url: string) => void;
  initialImage?: string;
  autoTrigger?: boolean;
}) {
  const [activeCardId, setActiveCardId] = useState<string | undefined>(cardId);

  useEffect(() => {
    if (cardId) {
      setActiveCardId(cardId);
    }
  }, [cardId]);

  const [activeMode, setActiveMode] = useState<'standard' | 'before-after'>('standard');
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [optimizedData, setOptimizedData] = useState<{
    optimized_english_prompt: string;
    motion_analysis?: string;
    camera_movement?: string;
  } | null>(null);

  // Image references
  const [standardImage, setStandardImage] = useState<string | null>(initialImage || null);
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);

  useEffect(() => {
    if (initialImage) {
      setStandardImage(initialImage);
    }
  }, [initialImage]);

  // Video Settings
  const [videoModel, setVideoModel] = useState('piapi-veo31-video-fast-audio');
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoDuration, setVideoDuration] = useState('8');
  const [videoQuality, setVideoQuality] = useState('720p'); // 1080p requires duration >= 6s
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);

  // Processing states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const handleDownloadVideo = async (uri?: string) => {
    const targetUri = uri || generatedVideoUrl;
    if (!targetUri) return;

    toast.info("Đang tải video về máy...");
    try {
      const fileName = `igen-video-${Date.now()}.mp4`;
      const proxyUrl = `/api/v1/media/download?url=${encodeURIComponent(targetUri)}&filename=${encodeURIComponent(fileName)}`;
      
      const response = await fetch(proxyUrl, {
        headers: {
          "Authorization": `Bearer ${getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Tải video thành công!");
    } catch (error) {
      console.error("Direct video download failed, falling back:", error);
      const link = document.createElement('a');
      link.href = targetUri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.warning("Không thể tải trực tiếp. Video đã được mở trong tab mới để bạn tải xuống.");
    }
  };

  // Progress simulation helpers
  const optimizeProgress = useProgress(isGeneratingPrompt, 4);
  const generateProgress = useProgress(isGenerating, 50);

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  // Smart duration handler: enforce API constraints (1080p requires >= 6s)
  const handleDurationChange = (newDuration: string) => {
    setVideoDuration(newDuration);
    const dur = parseInt(newDuration);
    if (dur <= 4 && videoQuality === '1080p') {
      setVideoQuality('720p');
      toast.warning('1080p yêu cầu tối thiểu 6 giây. Đã tự động chuyển sang 720p.');
    }
  };

  // Smart quality handler: enforce API constraints
  const handleQualityChange = (newQuality: string) => {
    if (newQuality === '1080p' && parseInt(videoDuration) <= 4) {
      toast.warning('1080p không hỗ trợ cho video 4 giây. Hãy chọn 6 giây hoặc 8 giây trước.');
      return; // Block invalid selection
    }
    setVideoQuality(newQuality);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    const hasPending = history.some(item => item.url && item.url.startsWith('pending://'));
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const response = await geminiApi.getMediaHistory('video');
        setHistory(response.history || []);
      } catch (error) {
        console.error('[SimpleVideoWorkspace] Silent history polling failed', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [history]);

  useEffect(() => {
    if (!generatedVideoUrl || !generatedVideoUrl.startsWith('pending://piapi/')) {
      return;
    }

    const pendingTaskId = generatedVideoUrl.replace('pending://piapi/', '');
    const matchedRecord = history.find((item) => item?.metadata?.piapiTaskId === pendingTaskId);

    if (!matchedRecord) {
      return;
    }

    if (matchedRecord.url && !matchedRecord.url.startsWith('pending://')) {
      setGeneratedVideoUrl(matchedRecord.url);
      return;
    }

    if (matchedRecord.metadata?.status === 'failed' || matchedRecord.metadata?.status === 'timeout') {
      setGeneratedVideoUrl(null);
      toast.error('Video render khong thanh cong. Vui long thu lai voi prompt khac.');
    }
  }, [generatedVideoUrl, history]);

  const loadHistory = async (showLoading: boolean = true) => {
    if (showLoading) {
      setIsLoadingHistory(true);
    }
    try {
      const response = await geminiApi.getMediaHistory("video");
      setHistory(response.history || []);
    } catch (e) {
      console.error(e);
      toast.error("Không thể tải lịch sử video");
    } finally {
      if (showLoading) {
        setIsLoadingHistory(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'standard' | 'before' | 'after') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      if (target === 'standard') setStandardImage(b64);
      else if (target === 'before') setBeforeImage(b64);
      else if (target === 'after') setAfterImage(b64);
      toast.success("Tải ảnh tham chiếu thành công!");
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOptimizePrompt = async () => {
    const description = prompt.trim();
    if (!description) {
      toast.warning('Vui lòng nhập mô tả kịch bản video trước.');
      return;
    }

    setIsGeneratingPrompt(true);
    try {
      console.log("[SimpleVideoWorkspace] Sending optimize request with prompt:", description);
      const imageUris = activeMode === 'standard'
        ? (standardImage ? [standardImage] : [])
        : [beforeImage, afterImage].filter(Boolean) as string[];
      const result = await geminiApi.optimizeVideoPrompt(description, imageUris);
      console.log("[SimpleVideoWorkspace] Optimization result received:", result);

      setOptimizedData(result);
      toast.success('Đã tối ưu hóa prompt video bằng AI thành công!');
    } catch (e: any) {
      console.error("[SimpleVideoWorkspace] Optimization failed:", e);
      toast.error(`Lỗi tối ưu prompt: ${e.message}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateVideo = async () => {
    const finalPrompt = optimizedData 
      ? JSON.stringify(optimizedData)
      : prompt.trim();
    if (!finalPrompt) {
      toast.warning('Vui lòng nhập kịch bản hoặc chọn gợi ý phong cách.');
      return;
    }

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      toast.success('Đang gửi lệnh tạo video. Quá trình này có thể mất vài phút...');

      const inputImageUris = activeMode === 'standard'
        ? (standardImage ? [standardImage] : undefined)
        : (beforeImage ? [beforeImage] : undefined);

      const response = await geminiApi.generateVideo(finalPrompt, parseInt(videoDuration), {
        referenceImageUris: inputImageUris,
        modelName: videoModel,
        aspectRatio: videoAspectRatio,
        resolution: videoQuality,
        activeCardId: activeCardId || undefined,
      });

      if (response.url) {
        setGeneratedVideoUrl(response.url);
        setIsGenerating(false);

        if (response.url.startsWith('pending://')) {
          toast.success('Yêu cầu tạo video đã gửi! Đang xử lý ở chế độ nền.');
        } else if (activeCardId) {
          toast.success('Tạo video thành công! Đang lưu trữ lên Cloudinary...');
          try {
            const filename = `video_${Date.now()}.mp4`;
            const cloudinaryUrl = await marketingService.uploadMediaToStorage(response.url, filename, 'video');
            await marketingService.updateCardMedia(cloudinaryUrl, 'video', [activeCardId]);
            if (onMediaSaved) {
              onMediaSaved(activeCardId, cloudinaryUrl, 'video');
            }
            toast.success('Đã lưu trữ và đồng bộ hóa video thành công!');
          } catch (uploadError: any) {
            console.error('Cloudinary error:', uploadError);
            toast.error('Tạo video thành công nhưng không thể đồng bộ hóa lưu trữ.');
          }
        } else {
          toast.success('Tạo video AI thành công!');
        }

        loadHistory(false);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`Không thể tạo video: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const cacheKey = `autotrigger_video_${activeCardId}`;
    if (autoTrigger && prompt.trim() && !isGenerating && !generatedVideoUrl && !sessionStorage.getItem(cacheKey)) {
      sessionStorage.setItem(cacheKey, 'true');
      void handleGenerateVideo();
    }
  }, [autoTrigger, activeCardId]);

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa video này khỏi lịch sử?")) return;
    try {
      await geminiApi.deleteMediaHistory(id);
      toast.success('Đã xóa video thành công.');
      setHistory(prev => prev.filter(r => r._id !== id && r.id !== id));
      if (generatedVideoUrl && history.find(h => h._id === id || h.id === id)?.url === generatedVideoUrl) {
        setGeneratedVideoUrl(null);
      }
    } catch (e: any) {
      toast.error(`Lỗi khi xóa: ${e.message}`);
    }
  };

  const currentPreset = VIDEO_TEMPLATES.find(t => t.prompt === prompt) || VIDEO_TEMPLATES[0];

  return (
    <div className="max-w-[1600px] mx-auto w-full pb-8 px-2 animate-fade-in animate-in fade-in duration-300" id="video_workspace_wrapper">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT COLUMN: Input & Settings (lg:col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-4 bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs">

          {/* Toggle modes */}
          <div className="flex justify-center bg-slate-100/80 p-1 rounded-xl">
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeMode === 'standard' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 font-medium hover:text-slate-700'
              }`}
              onClick={() => setActiveMode('standard')}
            >
              Tiêu chuẩn
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeMode === 'before-after' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 font-medium hover:text-slate-700'
              }`}
              onClick={() => setActiveMode('before-after')}
            >
              Trước / Sau
            </button>
          </div>

          {/* Input Image Title & Button */}
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs font-bold text-slate-800">Ảnh đầu vào</span>
            <button
              type="button"
              onClick={() => toast.info('Thư viện ảnh đang được đồng bộ')}
              className="px-2.5 py-1.5 bg-[#e0f7fc] text-[#0891b2] rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:bg-[#cbeff5] active:scale-95"
            >
              <Images className="h-3.5 w-3.5" />
              Thư viện ảnh
            </button>
          </div>

          {/* Image upload box */}
          {activeMode === 'standard' ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/30 flex flex-col items-center justify-center relative min-h-[140px] hover:border-[#22d3ee]/80 hover:bg-[#e0f7fc]/5 transition-all duration-300">
              {standardImage ? (
                <div className="relative aspect-video w-full border border-slate-150 rounded-xl overflow-hidden bg-white">
                  <img src={standardImage} alt="Ref source" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setStandardImage(null)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black text-white rounded-full transition-all cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center text-center w-full py-2">
                  <UploadCloud className="h-8 w-8 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-800">Kéo thả hoặc nhấp để tải ảnh lên</span>
                  <span className="text-[10px] text-slate-450 mt-1">PNG, JPG, WEBP</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'standard')}
                  />
                </label>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Before Box */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">Bắt đầu (Trước)</span>
                <div className="border border-dashed border-slate-200 rounded-xl overflow-hidden aspect-square relative bg-slate-50/30 flex items-center justify-center hover:border-cyan-500/80 transition-all">
                  {beforeImage ? (
                    <>
                      <img src={beforeImage} alt="Before" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setBeforeImage(null)}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full transition-all cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center p-2 text-center">
                      <UploadCloud className="h-6 w-6 text-slate-400 mb-1" />
                      <span className="text-[10px] text-slate-650 font-bold">Ảnh trước</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'before')}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* After Box */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">Kết quả (Sau)</span>
                <div className="border border-dashed border-slate-200 rounded-xl overflow-hidden aspect-square relative bg-slate-50/30 flex items-center justify-center hover:border-cyan-500/80 transition-all">
                  {afterImage ? (
                    <>
                      <img src={afterImage} alt="After" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAfterImage(null)}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full transition-all cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center p-2 text-center">
                      <UploadCloud className="h-6 w-6 text-slate-400 mb-1" />
                      <span className="text-[10px] text-slate-650 font-bold">Ảnh sau</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'after')}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* "Ý tưởng của bạn" Section */}
          <div className="flex justify-between items-center border-t border-slate-100 pt-3.5 relative">
            <span className="text-xs font-bold text-slate-800">Ý tưởng của bạn</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
                className="px-2.5 py-1.5 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 rounded-xl text-[10px] font-bold text-slate-650 flex items-center gap-1 transition-all cursor-pointer bg-white"
              >
                <span>{currentPreset.label.length > 18 ? currentPreset.label.substring(0, 15) + '...' : currentPreset.label}</span>
                <Settings className="h-3 w-3 text-slate-400" />
              </button>
              {isPresetDropdownOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  {VIDEO_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPrompt(t.prompt);
                        setOptimizedData(null);
                        setIsPresetDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-50 transition-colors block ${prompt === t.prompt ? 'text-[#0891b2] font-bold bg-[#e0f7fc]/20' : 'text-slate-700'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Prompt Textarea */}
          <textarea
            placeholder="Mô tả ngắn gọn nội dung video bạn muốn..."
            className="w-full text-xs p-3.5 border border-slate-200 rounded-2xl h-22 focus:ring-1 focus:ring-[#22d3ee] focus:outline-none leading-relaxed bg-slate-50/20 resize-none font-medium"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating}
          />

          {/* AI Optimize Box */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800">Tối ưu prompt và thông số</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-mono font-bold">iGen 3 flash</span>
            </div>
            <button
              type="button"
              onClick={handleOptimizePrompt}
              disabled={isGeneratingPrompt || isGenerating || !prompt.trim()}
              className="w-full py-2.5 bg-[#e0f7fc] border border-[#22d3ee]/20 hover:bg-[#cbeff5] text-[#0891b2] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Phân tích và hoàn thiện prompt
            </button>

            {optimizedData && (
              <div className="mt-2.5 p-3 rounded-2xl border border-cyan-100 bg-cyan-50/30 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-250">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-cyan-800 text-[11px] font-bold">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-500 animate-pulse" />
                    <span>Kịch bản tối ưu bởi AI</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOptimizedData(null)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    Xóa tối ưu
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Prompt Tiếng Anh chi tiết</span>
                  <textarea
                    className="w-full text-[11px] p-2.5 border border-cyan-200/50 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 bg-white resize-none font-medium text-slate-700 leading-relaxed min-h-[70px]"
                    value={optimizedData.optimized_english_prompt}
                    onChange={(e) => setOptimizedData({
                      ...optimizedData,
                      optimized_english_prompt: e.target.value
                    })}
                    placeholder="Prompt tiếng Anh chi tiết..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Chuyển động (Motion)</span>
                    <input
                      type="text"
                      className="w-full text-[11px] px-2.5 py-1.5 border border-cyan-200/50 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 bg-white font-medium text-slate-700"
                      value={optimizedData.motion_analysis || ''}
                      onChange={(e) => setOptimizedData({
                        ...optimizedData,
                        motion_analysis: e.target.value
                      })}
                      placeholder="Không có phân tích chuyển động"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Camera (Movement)</span>
                    <input
                      type="text"
                      className="w-full text-[11px] px-2.5 py-1.5 border border-cyan-200/50 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 bg-white font-medium text-slate-700"
                      value={optimizedData.camera_movement || ''}
                      onChange={(e) => setOptimizedData({
                        ...optimizedData,
                        camera_movement: e.target.value
                      })}
                      placeholder="Không có chuyển động camera"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <VeoSettingsPanel
            videoModel={videoModel}
            videoAspectRatio={videoAspectRatio}
            videoDuration={videoDuration}
            videoQuality={videoQuality}
            onVideoModelChange={setVideoModel}
            onAspectRatioChange={setVideoAspectRatio}
            onDurationChange={handleDurationChange}
            onQualityChange={handleQualityChange}
          />

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleGenerateVideo}
            disabled={isGenerating || isGeneratingPrompt || !prompt.trim()}
            className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-95 shadow-md ${isGenerating || isGeneratingPrompt || !prompt.trim()
                ? 'bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed'
                : 'bg-[#0891b2] hover:bg-[#06738c] text-white shadow-[#0891b2]/10'
              }`}
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Tạo Video Ngay
          </button>
        </div>

        {/* RIGHT COLUMN: Canvas & History (lg:col-span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-6 relative bg-slate-50/30 border border-slate-200/60 p-6 rounded-3xl min-h-[660px] justify-between">

          {/* Canvas area (flexible viewport) */}
          <div className="flex-1 flex flex-col justify-center items-center relative min-h-[360px] mb-4">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-4 text-slate-400 p-8 text-center animate-pulse">
                <Loader2 className="h-10 w-10 text-cyan-500 animate-spin" />
                <div className="flex flex-col gap-1.5 items-center">
                  <span className="text-xs font-bold tracking-wider uppercase font-mono text-cyan-400">Đang dựng video AI {generateProgress}%...</span>
                  <span className="text-[10px] text-slate-550">Mất khoảng 1-2 phút để mô hình hóa và kết xuất các khung hình.</span>
                </div>
                <div className="w-48 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                  <div
                    className="bg-[#0891b2] h-full transition-all duration-300 rounded-full"
                    style={{ width: `${generateProgress}%` }}
                  />
                </div>
              </div>
            ) : generatedVideoUrl ? (
              <div className="w-full flex flex-col gap-3">
                <div className="w-full h-full flex items-center justify-center relative rounded-3xl overflow-hidden border border-slate-200 bg-black shadow-lg aspect-video max-h-[380px]">
                  {generatedVideoUrl.startsWith('pending://') ? (() => {
                    const matchedRecord = history.find(h => h.url === generatedVideoUrl);
                    const progressVal = matchedRecord?.metadata?.progress;
                    return (
                      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-xs font-bold text-cyan-400 uppercase tracking-widest p-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mb-2 text-cyan-500" />
                        Video đang được dựng...
                        {progressVal !== undefined && (
                          <div className="flex flex-col items-center gap-1.5 mt-2 w-48 mx-auto">
                            <span className="text-[10px] text-cyan-400 font-mono">Tiến độ: {progressVal}%</span>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${progressVal}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 normal-case font-normal mt-2">Hệ thống đang xử lý ở chế độ nền. Không cần tải lại trang.</span>
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
                        id="canvas_video_player"
                      />
                      <div className="absolute top-4 right-4 opacity-0 hover:opacity-100 transition-opacity z-10 flex gap-2">
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
                {!generatedVideoUrl.startsWith('pending://') && onEditVideo && (
                  <button
                    type="button"
                    onClick={() => onEditVideo(generatedVideoUrl)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 cursor-pointer shadow-sm shadow-cyan-155"
                  >
                    <Wand2 className="h-4 w-4" />
                    Chỉnh sửa tiếp
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center select-none text-slate-400">
                <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200/50 flex items-center justify-center text-slate-400 mb-2">
                  <Video className="h-6 w-6 stroke-[1.5]" />
                </div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sẵn sàng sáng tạo</span>
                <span className="text-[11px] text-slate-400 max-w-sm leading-relaxed">
                  Tải ảnh và nhập ý tưởng để bắt đầu
                </span>
              </div>
            )}
          </div>

          {/* Video Render History Overlay/Card */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-lg flex flex-col gap-3.5 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex flex-col">
                <h4 className="font-bold text-slate-800 text-xs">Lịch sử tạo video</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Hiển thị tối đa 20 kết quả gần nhất, từ mới đến cũ.</p>
              </div>
              <span className="px-2.5 py-0.5 bg-[#e0f7fc] text-[#0891b2] rounded-full text-[10px] font-bold font-mono">
                {history.slice(0, 20).length}/20
              </span>
            </div>

            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-6 w-6 text-cyan-500 animate-spin mb-2" />
                <span className="text-[9px] uppercase tracking-wider font-mono">Đang tải...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 border border-dashed rounded-xl bg-slate-50/50">
                <Video className="h-6 w-6 text-slate-350 mb-2" />
                <span className="text-[10px] font-semibold text-slate-400">Chưa có video render</span>
              </div>
            ) : (
              <div className="relative flex items-center gap-2">
                {/* Left Navigation Chevron */}
                <button
                  type="button"
                  onClick={() => {
                    const container = document.getElementById('history_slider');
                    if (container) container.scrollLeft -= 200;
                  }}
                  className="h-7 w-7 rounded-full bg-white hover:bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 shadow-xs cursor-pointer shrink-0 active:scale-90 transition-transform"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Scrollable list */}
                <div
                  id="history_slider"
                  className="flex-1 overflow-x-auto flex gap-3 pb-1 scroll-smooth"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {history.map((record, index) => {
                    const id = record._id || record.id;
                    const isActive = generatedVideoUrl === record.url;
                    return (
                      <div
                        key={id}
                        onClick={() => setGeneratedVideoUrl(record.url)}
                        className={`w-32 aspect-[16/10] relative rounded-xl overflow-hidden bg-slate-950 shadow-xs cursor-pointer hover:shadow-md shrink-0 border-2 transition-all group/item ${isActive ? 'border-[#0891b2]' : 'border-transparent'
                          }`}
                      >
                        {record.url && (record.url.startsWith('http') || record.url.startsWith('blob:') || record.url.startsWith('data:')) ? (
                          <video src={record.url} className="w-full h-full object-cover" muted preload="metadata" playsInline crossOrigin="anonymous" />
                        ) : (
                          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-[8px] font-bold text-cyan-400 uppercase tracking-widest p-1 text-center">
                            <Loader2 className="h-4 w-4 animate-spin mb-1 text-cyan-500" />
                            ĐANG DỰNG {record.metadata?.progress !== undefined ? `${record.metadata.progress}%` : ''}
                            {record.metadata?.progress !== undefined && (
                              <div className="w-16 bg-slate-855 h-1 rounded-full overflow-hidden mt-1 mx-auto">
                                <div
                                  className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                                  style={{ width: `${record.metadata.progress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 group-hover/item:opacity-100 transition-opacity">
                          <div className="h-6 w-6 rounded-full bg-white/95 hover:bg-white flex items-center justify-center text-slate-900 shadow">
                            <Play className="h-2.5 w-2.5 fill-slate-900 ml-0.5" />
                          </div>
                        </div>

                        {/* Delete button from history */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteHistory(id);
                          }}
                          className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-650 text-white rounded-md opacity-0 group-hover/item:opacity-100 transition-opacity z-10"
                          title="Xóa khỏi thư viện"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>

                        <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between items-center text-[8px] font-bold text-white bg-black/40 px-1 py-0.5 rounded backdrop-blur-xs">
                          <span className="truncate max-w-[50px]">{`Render ${history.length - index}`}</span>
                          <span>{record.metadata?.aspectRatio || '16:9'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Navigation Chevron */}
                <button
                  type="button"
                  onClick={() => {
                    const container = document.getElementById('history_slider');
                    if (container) container.scrollLeft += 200;
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
