import React, { useState, useRef, useEffect } from 'react';
import { useProgress } from '../../hooks/use-progress';
import { geminiApi } from '../../api/gemini';
import { toast } from '../../pages/Toast';
import {
  Loader2, ImageIcon, X, Wand2, UploadCloud, Download,
  Images, Check, Sparkles, Trash2,
  ChevronLeft, ChevronRight, ZoomIn
} from 'lucide-react';
import { formatAiModelName } from '../../utils/usage-tracker';
import { marketingService } from '../../services/marketingService';
import { getAccessToken } from '../../services/authService';

export function ImageGenerationWorkspace({ initialPrompt, cardId, onMediaSaved, initialImage, autoTrigger }: {
  initialPrompt?: string;
  cardId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
  initialImage?: string;
  autoTrigger?: boolean;
}) {
  const [activeCardId, setActiveCardId] = useState<string | undefined>(cardId);

  useEffect(() => {
    if (cardId) {
      setActiveCardId(cardId);
    }
  }, [cardId]);

  const [simplePrompt, setSimplePrompt] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [imageModel, setImageModel] = useState('gemini-banana-flash');
  const [resolution, setResolution] = useState('1K');
  const [optimizeModel, setOptimizeModel] = useState('gemini-3.5-flash');

  // Input reference image list (base64 data URIs)
  const [inputImageUrls, setInputImageUrls] = useState<string[]>(initialImage ? [initialImage] : []);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (initialImage) {
      setInputImageUrls([initialImage]);
    }
  }, [initialImage]);

  // States for processing
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isPromptAnalyzed, setIsPromptAnalyzed] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [showZoomModal, setShowZoomModal] = useState(false);

  // History state
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Library state
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'uploaded' | 'ai'>('uploaded');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Progress helpers
  const generateProgress = useProgress(isGenerating, 12);
  const optimizeProgress = useProgress(isGeneratingPrompt, 4);

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
      setIsPromptAnalyzed(true);
    }
  }, [initialPrompt]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await geminiApi.getMediaHistory("image");
      setHistory(response.history || []);
    } catch (e) {
      console.error(e);
      toast.error("Không thể tải lịch sử hình ảnh");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadLibraryImages = async () => {
    setIsLoadingLibrary(true);
    try {
      let localImages: string[] = [];
      try {
        const stored = localStorage.getItem('igen_uploaded_images');
        localImages = stored ? JSON.parse(stored) : [];
      } catch (e) {
        console.error("Lỗi khi đọc localStorage:", e);
      }

      // Fallback to fetch from cards and products if localStorage is empty
      if (localImages.length === 0) {
        const cardsResponse = await fetch("/api/v1/crud/marketing-contents", {
          headers: { "Authorization": `Bearer ${getAccessToken()}` }
        });
        let cardsImages: string[] = [];
        if (cardsResponse.ok) {
          const data = await cardsResponse.json();
          const items = data.data || data.items || [];
          items.forEach((item: any) => {
            if (item.imageUrl) cardsImages.push(item.imageUrl);
            if (item.referenceImage) cardsImages.push(item.referenceImage);
          });
        }

        const productsResponse = await fetch("/api/v1/crud/products?sort=name", {
          headers: { "Authorization": `Bearer ${getAccessToken()}` }
        });
        let productsImages: string[] = [];
        if (productsResponse.ok) {
          const data = await productsResponse.json();
          const items = data.data || data.items || [];
          items.forEach((item: any) => {
            if (item.imageUrl) productsImages.push(item.imageUrl);
          });
        }

        const allImages = [...cardsImages, ...productsImages]
          .filter(url => url && typeof url === 'string' && url.startsWith('http') && !url.includes('pending://'))
          .filter((url, index, self) => self.indexOf(url) === index);

        localImages = allImages;
        try {
          localStorage.setItem('igen_uploaded_images', JSON.stringify(allImages));
        } catch { }
      }

      setUploadedImages(localImages);
    } catch (err) {
      console.error("Lỗi khi tải thư viện ảnh:", err);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const uploadAndSaveImage = async (base64Url: string): Promise<string> => {
    try {
      const filename = `upload_${Date.now()}.png`;
      const cloudinaryUrl = await marketingService.uploadMediaToStorage(base64Url, filename, 'image');

      // Save to localStorage
      try {
        const stored = localStorage.getItem('igen_uploaded_images');
        const list: string[] = stored ? JSON.parse(stored) : [];
        if (!list.includes(cloudinaryUrl)) {
          const updated = [cloudinaryUrl, ...list].slice(0, 50); // limit to 50 uploads
          localStorage.setItem('igen_uploaded_images', JSON.stringify(updated));
          setUploadedImages(updated);
        }
      } catch (storageErr) {
        console.error("Lỗi khi lưu ảnh vào localStorage:", storageErr);
      }

      return cloudinaryUrl;
    } catch (err) {
      console.error("Lỗi khi tải ảnh lên Cloudinary:", err);
      throw err;
    }
  };

  const handleUploadedFiles = async (files: File[]) => {
    setIsUploading(true);
    toast.info("Đang xử lý ảnh tải lên...");

    try {
      const newUrls: string[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        try {
          // Attempt to upload to Cloudinary and save to library history
          const cloudinaryUrl = await uploadAndSaveImage(base64);
          newUrls.push(cloudinaryUrl);
        } catch (uploadErr) {
          // Fallback to raw base64 if Cloudinary upload fails
          console.warn("Could not upload to Cloudinary, using base64 fallback:", uploadErr);
          newUrls.push(base64);
        }
      }

      setInputImageUrls((prev) => [...prev, ...newUrls].slice(0, 3));
      setIsPromptAnalyzed(false);
      toast.success("Đã tải ảnh lên thành công!");
    } catch (err) {
      console.error(err);
      toast.error("Không thể xử lý tệp ảnh tải lên.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenLibrary = () => {
    setShowLibraryModal(true);
    loadLibraryImages();
  };

  const handleSelectLibraryImage = (url: string) => {
    setInputImageUrls((prev) => {
      if (prev.includes(url)) return prev;
      return [...prev, url].slice(0, 3);
    });
    setIsPromptAnalyzed(false);
    setShowLibraryModal(false);
    toast.success("Đã chọn ảnh làm ảnh tham chiếu đầu vào!");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleUploadedFiles(Array.from(files));
    e.target.value = '';
  };

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
    handleUploadedFiles(Array.from(files));
  };

  const handleGenerateOptimalPrompt = async () => {
    if (!simplePrompt.trim()) {
      toast.warning('Vui lòng nhập mô tả ý tưởng trước.');
      return;
    }

    setIsGeneratingPrompt(true);
    try {
      const optimizationBrief = [
        "SOURCE BRIEF - PRESERVE MEANING STRICTLY:",
        `Original user description in Vietnamese: ${simplePrompt.trim()}`,
        inputImageUrls.length > 0
          ? `Reference images attached: ${inputImageUrls.length}. Preserve the same subject, context, and meaning from the text and references.`
          : "No reference image attached.",
        "Translate into English and enrich the prompt with appropriate visual details for image generation.",
        "If the user description is a recruitment, advertisement, or marketing brief, enhance it into a professional layout or a highly realistic workplace photo setting.",
        "Preserve all core business details (company name, salary/numbers, location, products) and ensure they are explicitly described to be rendered as clear text in the image.",
        "Make the final prompt highly descriptive, realistic, and contextually rich, matching the style of professional commercial photography or clean promotional layouts."
      ].join("\n");

      const result = await geminiApi.optimizeImagePrompt(optimizationBrief, inputImageUrls, optimizeModel);

      if (result.optimized_english_prompt) {
        setPrompt(result.optimized_english_prompt);
        if (result.negative_prompt) setNegativePrompt(result.negative_prompt);
      } else {
        setPrompt(JSON.stringify(result, null, 2));
      }
      toast.success('Đã tối ưu hóa prompt bằng AI thành công!');
      setIsPromptAnalyzed(true);
    } catch (e: any) {
      toast.error(`Lỗi tối ưu prompt: ${e.message}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateImage = async () => {
    let finalPrompt = prompt.trim();
    if (!finalPrompt) {
      finalPrompt = simplePrompt;
    }

    if (!finalPrompt.trim()) {
      toast.warning('Vui lòng nhập prompt hoặc tối ưu hóa prompt trước khi tạo ảnh.');
      return;
    }

    setIsGenerating(true);
    setGeneratedImageUrl(null);

    try {
      toast.success('Bắt đầu gửi lệnh sinh ảnh...');
      const response = await geminiApi.generateImage(finalPrompt, {
        aspectRatio,
        modelName: imageModel,
        resolution,
        existingImageUris: inputImageUrls,
      });

      if (response.url) {
        setGeneratedImageUrl(response.url);

        if (activeCardId) {
          toast.success('Tạo ảnh AI thành công! Đang tải lên Cloudinary...');
          try {
            const filename = `image_${Date.now()}.png`;
            const cloudinaryUrl = await marketingService.uploadMediaToStorage(response.url, filename, 'image');
            await marketingService.updateCardMedia(cloudinaryUrl, 'image', [activeCardId]);
            if (onMediaSaved) {
              onMediaSaved(activeCardId, cloudinaryUrl, 'image');
            }
            toast.success('Lưu ảnh lên Cloudinary và gắn link với content thành công!');
          } catch (uploadError: any) {
            console.error('Lỗi upload Cloudinary:', uploadError);
            toast.error('Tạo ảnh thành công nhưng không thể lưu lên Cloudinary hoặc gắn link.');
          }
        } else {
          toast.success('Tạo ảnh AI và đồng bộ hóa thành công!');
        }

        loadHistory(); // Reload history
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`Không thể tạo ảnh: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const cacheKey = `autotrigger_image_${activeCardId}`;
    if (autoTrigger && initialPrompt && !isGenerating && !generatedImageUrl && !sessionStorage.getItem(cacheKey)) {
      sessionStorage.setItem(cacheKey, 'true');
      void handleGenerateImage();
    }
  }, [autoTrigger, initialPrompt, activeCardId]);

  const handleDeleteHistory = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa hình ảnh này khỏi lịch sử?")) return;
    try {
      await geminiApi.deleteMediaHistory(id);
      toast.success('Đã xóa hình ảnh thành công.');
      setHistory(prev => prev.filter(r => r._id !== id && r.id !== id));
      if (generatedImageUrl && history.find(h => h._id === id || h.id === id)?.url === generatedImageUrl) {
        setGeneratedImageUrl(null);
      }
    } catch (e: any) {
      toast.error(`Lỗi khi xóa: ${e.message}`);
    }
  };

  const handleDownloadImage = async (uri?: string, customName?: string) => {
    const targetUri = uri || generatedImageUrl;
    if (!targetUri) return;

    toast.info("Đang tải ảnh về máy...");
    try {
      const fileName = customName || `igen-image-${Date.now()}.png`;
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
      toast.success("Tải ảnh thành công!");
    } catch (error) {
      console.error("Direct image download failed, falling back:", error);
      const link = document.createElement('a');
      link.href = targetUri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.warning("Không thể tải trực tiếp. Ảnh đã được mở trong tab mới để bạn tải xuống.");
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -240, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 240, behavior: 'smooth' });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] overflow-x-hidden px-2 pb-8" id="image_workspace_wrapper">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">

        {/* LEFT COLUMN: Configuration Form */}
        <div className="flex flex-col gap-4 bg-white border border-slate-200/80 p-4 md:p-5 rounded-3xl shadow-sm">

          {/* Section 1: Ảnh đầu vào */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Ảnh đầu vào</label>
              <button
                type="button"
                onClick={handleOpenLibrary}
                className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 flex items-center gap-1 bg-cyan-50 px-2.5 py-1 rounded-lg transition-all"
              >
                <Images className="h-3.5 w-3.5" />
                Thư viện ảnh
              </button>
            </div>

            <div
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all min-h-[140px] relative bg-slate-50/50 ${isDragging ? 'border-cyan-500 bg-cyan-50/50' : 'border-slate-250 hover:border-cyan-400'
                }`}
            >
              {inputImageUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 w-full">
                  {inputImageUrls.map((url, idx) => (
                    <div key={idx} className="relative aspect-square border border-slate-200 rounded-xl overflow-hidden bg-white group shadow-xs">
                      <img src={url} alt="Ref source" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(url)}
                        className="absolute top-1 left-1 p-1 bg-black/70 hover:bg-black text-white rounded-full transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                        title="Xem trước"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInputImageUrls(prev => prev.filter((_, i) => i !== idx));
                          setIsPromptAnalyzed(false);
                        }}
                        className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-black text-white rounded-full transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                        title="Xóa"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {inputImageUrls.length < 3 && (
                    <label className="cursor-pointer border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center aspect-square hover:bg-slate-100 transition-all">
                      <UploadCloud className="h-5 w-5 text-gray-400" />
                      <span className="text-[9px] text-gray-500 font-semibold mt-1">Thêm</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center text-center w-full h-full">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                    <ImageIcon className="h-5 w-5 text-slate-500" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Kéo thả hoặc nhấp để tải ảnh lên</span>
                  <span className="text-[10px] text-slate-400 mt-1 font-medium">PNG, JPG, WEBP</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Section 2: Ý tưởng của bạn */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Ý tưởng của bạn</label>
            <textarea
              placeholder="Mô tả đúng ý tưởng gốc bạn muốn render. AI sẽ dịch và tối ưu sang tiếng Anh nhưng vẫn phải giữ sát nghĩa với brief này."
              className="w-full text-xs p-3 border border-slate-200 rounded-xl h-20 focus:ring-1 focus:ring-cyan-500 focus:outline-none leading-relaxed bg-slate-50/30"
              value={simplePrompt}
              onChange={(e) => {
                setSimplePrompt(e.target.value);
                setIsPromptAnalyzed(false);
              }}
            />
          </div>

          {/* Section 3: Tối ưu prompt */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleGenerateOptimalPrompt}
              disabled={isGeneratingPrompt || isGenerating}
              className="w-full py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              {isGeneratingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-cyan-600" />}
              Phân tích và hoàn thiện prompt
            </button>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Hệ thống sẽ ưu tiên giữ đúng nghĩa từ mô tả gốc và ảnh tham chiếu, thay vì tự mở rộng sang concept chung chung.
            </p>
          </div>

          {/* Section 4: Mô tả tối ưu (Tiếng Anh) */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Mô tả tối ưu (Tiếng Anh)</label>
            <textarea
              placeholder="Mô tả hình ảnh bạn muốn tạo. Ví dụ: một cô gái cyborg với mái tóc neon..."
              className="w-full text-xs font-mono p-3 border border-slate-200 rounded-xl h-24 focus:ring-1 focus:ring-cyan-500 focus:outline-none leading-relaxed bg-slate-50/30"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {/* Section 5: Mô hình tạo ảnh */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Mô hình tạo ảnh</label>
            <select
              className="w-full text-xs p-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none cursor-pointer font-medium"
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
            >
              <option value="nano-banana-pro">iGen Image Pro (PiAPI)</option>
              <option value="nano-banana-2">iGen Image Flash (PiAPI)</option>
              <option value="gemini-banana-pro">iGen Gemini Image Pro</option>
              <option value="gemini-banana-flash">iGen Gemini Image Flash</option>
            </select>
          </div>

          {/* Section 6: T??? l??? khung h??nh */}
          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-bold text-slate-600 uppercase">Tỉ lệ khung hình</span>
            <select
              className="w-full text-xs p-2 border border-slate-200 bg-white rounded-lg focus:outline-none"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
            >
              <option value="1:1">1:1 (Vuông)</option>
              <option value="16:9">16:9 (Ngang)</option>
              <option value="9:16">9:16 (Dọc)</option>
              <option value="4:3">4:3 (Ngang)</option>
              <option value="3:4">3:4 (Dọc)</option>
            </select>
          </div>

          {/* Section 7: Độ phân giải */}
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-bold text-slate-600 uppercase">Độ phân giải</span>
            <div className="grid grid-cols-2 gap-2">
              {['1K'].map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setResolution(res)}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${resolution === res
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 font-extrabold ring-1 ring-cyan-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Bar */}
          {isGenerating && (
            <div className="flex flex-col gap-1.5 p-3.5 bg-slate-50 border rounded-xl animate-pulse">
              <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 font-mono">
                <span>DỰNG KHUNG HÌNH AI...</span>
                <span>{generateProgress}%</span>
              </div>
              <div className="w-full bg-slate-250 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${generateProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Section 8: Tạo ảnh button */}
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={isGenerating || isGeneratingPrompt || !isPromptAnalyzed}
              title={!isPromptAnalyzed ? "Vui lòng ấn nút 'Phân tích và hoàn thiện prompt' trước khi tạo ảnh" : undefined}
              className={`w-full py-3 rounded-2xl text-xs font-bold tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2 ${isGenerating || isGeneratingPrompt || !isPromptAnalyzed
                ? "bg-gray-200 text-gray-400 border border-gray-300 shadow-none cursor-not-allowed"
                : "bg-cyan-500 hover:bg-cyan-600 text-white active:scale-[0.99] shadow-cyan-500/20 cursor-pointer"
                }`}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Tạo ảnh
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Output Preview & Render History */}
        <div className="min-w-0 flex flex-col gap-6">

          {/* Section 1: Kết Quả Render */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-sm flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Kết Quả Render</h3>
              <p className="text-xs text-slate-400 mt-0.5">Ảnh render mới nhất của bạn</p>
            </div>

            <div
              className={`w-full mx-auto min-w-0 ${aspectRatio === '16:9' ? 'aspect-video' :
                aspectRatio === '9:16' ? 'aspect-[9/16]' :
                  aspectRatio === '4:3' ? 'aspect-[4/3]' :
                    aspectRatio === '3:4' ? 'aspect-[3/4]' : 'aspect-square'
                } max-h-[520px] rounded-2xl overflow-hidden ${generatedImageUrl ? 'bg-slate-950 cursor-pointer group' : 'bg-slate-50'} border border-slate-200/80 flex items-center justify-center relative shadow-inner transition-all duration-300`}
              onClick={generatedImageUrl ? () => setShowZoomModal(true) : undefined}
              title={generatedImageUrl ? "Bấm để phóng to xem ảnh full" : undefined}
            >
              {isGenerating ? (
                <div className="flex max-w-full flex-col items-center gap-3 px-4 text-center text-slate-400">
                  <Loader2 className="h-10 w-10 text-cyan-500 animate-spin" />
                  <span className="text-xs font-bold tracking-wider uppercase font-mono animate-pulse">Đang dựng khung hình AI {generateProgress}%...</span>
                </div>
              ) : generatedImageUrl ? (
                <>
                  <img src={generatedImageUrl} alt="Generated AI illustration" className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white gap-1.5 font-sans text-xs font-bold select-none">
                    <ZoomIn className="h-6 w-6 text-white animate-pulse" />
                    <span>Bấm để phóng to</span>
                  </div>
                  <div className="absolute top-3 right-3 flex gap-2 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadImage();
                      }}
                      className="p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 rounded-xl shadow-sm transition-all cursor-pointer"
                      title="Tải ảnh về máy"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 p-8 text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                    <ImageIcon className="h-7 w-7 text-slate-400" />
                  </div>
                  <span className="text-xs font-medium text-slate-500">Kết quả render sẽ hiển thị ở đây</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Lịch Sử Render */}
          <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Lịch Sử Render</h3>
                <p className="text-xs text-slate-400 mt-0.5">Hiển thị tối đa 20 kết quả gần nhất, từ mới đến cũ.</p>
              </div>
              <div className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-bold">
                {history.slice(0, 20).length}/20
              </div>
            </div>

            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Loader2 className="h-8 w-8 text-cyan-500 animate-spin mb-2" />
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Đang đồng bộ...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed rounded-2xl bg-slate-50/50">
                <ImageIcon className="h-10 w-10 text-slate-300 mb-2" />
                <span className="text-xs font-semibold">Chưa có ảnh lịch sử nào</span>
              </div>
            ) : (
              <div className="relative group/history">
                {/* Left/Right scroll controls */}
                <button
                  type="button"
                  onClick={handleScrollLeft}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-150 rounded-full shadow-md transition-all opacity-0 group-hover/history:opacity-100 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleScrollRight}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-150 rounded-full shadow-md transition-all opacity-0 group-hover/history:opacity-100 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div
                  ref={scrollContainerRef}
                  className="flex gap-4 overflow-x-auto pb-3 pt-1 scroll-smooth scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
                >
                  {history.slice(0, 20).map((record, index) => {
                    const id = record._id || record.id;
                    return (
                      <div
                        key={id}
                        className="relative flex-shrink-0 w-[160px] aspect-square rounded-2xl overflow-hidden border border-slate-150 shadow-xs hover:shadow-md transition-all bg-slate-100 group/card cursor-pointer"
                        onClick={() => {
                          setGeneratedImageUrl(record.url);
                          if (record.metadata?.aspectRatio) {
                            setAspectRatio(record.metadata.aspectRatio);
                          }
                        }}
                      >
                        <img src={record.url} alt="Render thumbnail" className="w-full h-full object-cover" />

                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-white flex flex-col justify-end">
                          <span className="text-[10px] font-bold leading-tight line-clamp-1">Render {history.length - index}</span>
                          <span className="text-[9px] text-slate-300 font-mono mt-0.5">{record.metadata?.resolution || '1K'}</span>
                        </div>

                        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHistory(id);
                            }}
                            className="p-1 bg-black/60 hover:bg-red-650 text-white rounded-lg transition-colors cursor-pointer"
                            title="Xóa khỏi thư viện"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Glassmorphic Zoom Lightbox Modal */}
      {showZoomModal && generatedImageUrl && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowZoomModal(false)}
        >
          <div
            className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl shadow-2xl p-2 relative max-w-5xl max-h-[90vh] flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={generatedImageUrl}
              alt="Full AI Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl animate-scaleIn shadow-lg"
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowZoomModal(false)}
              className="absolute top-4 right-4 bg-slate-950/60 hover:bg-slate-950 text-white/90 hover:text-white p-2.5 rounded-full border border-white/10 transition-all cursor-pointer shadow-md hover:scale-105 active:scale-95 flex items-center justify-center"
              title="Đóng"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Download Button in Zoom View */}
            <button
              type="button"
              onClick={() => handleDownloadImage()}
              className="absolute bottom-4 right-4 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-1.5 hover:scale-105 active:scale-95"
              title="Tải ảnh về máy"
            >
              <Download className="h-4 w-4" />
              <span>Tải ảnh về máy</span>
            </button>
          </div>
        </div>
      )}

      {/* Image Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-xs">
          <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Images className="h-5 w-5 text-cyan-600" />
                  Thư viện ảnh
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Chọn ảnh từ các tệp đã tải lên hoặc ảnh do AI tạo trước đó</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="rounded-full border border-slate-100 bg-slate-50 p-2 text-slate-650 transition hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="flex border-b border-slate-100 px-6 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setLibraryTab('uploaded')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${libraryTab === 'uploaded'
                  ? 'border-cyan-500 text-cyan-600 font-extrabold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                Đã tải lên
              </button>
              <button
                type="button"
                onClick={() => setLibraryTab('ai')}
                className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${libraryTab === 'ai'
                  ? 'border-cyan-500 text-cyan-600 font-extrabold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                Do AI tạo
              </button>
            </div>

            {/* Grid Container */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
              {isLoadingLibrary ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Loader2 className="h-8 w-8 text-cyan-500 animate-spin mb-2" />
                  <span className="text-xs font-bold uppercase tracking-wider font-mono animate-pulse">Đang tải thư viện...</span>
                </div>
              ) : libraryTab === 'uploaded' ? (
                uploadedImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-dashed rounded-3xl bg-slate-50/50">
                    <ImageIcon className="h-10 w-10 text-slate-350 mb-2" />
                    <span className="text-xs font-bold text-slate-500">Chưa có ảnh tải lên nào</span>
                    <p className="text-[10px] text-slate-450 mt-1">Ảnh từ sản phẩm hoặc bài đăng sẽ xuất hiện ở đây</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {uploadedImages.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectLibraryImage(url)}
                        className="relative aspect-square border border-slate-150 rounded-2xl overflow-hidden bg-slate-50 group cursor-pointer hover:border-cyan-400 hover:shadow-md transition-all duration-200"
                      >
                        <img src={url} alt={`Uploaded ${idx}`} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-103" />
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Check className="h-6 w-6 text-white bg-cyan-500 rounded-full p-1.5 shadow-sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-dashed rounded-3xl bg-slate-50/50">
                    <ImageIcon className="h-10 w-10 text-slate-350 mb-2" />
                    <span className="text-xs font-bold text-slate-500">Chưa có ảnh AI nào</span>
                    <p className="text-[10px] text-slate-450 mt-1">Tạo ảnh AI đầu tiên để lưu vào lịch sử</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {history.map((record) => {
                      const id = record._id || record.id;
                      return (
                        <div
                          key={id}
                          onClick={() => handleSelectLibraryImage(record.url)}
                          className="relative aspect-square border border-slate-150 rounded-2xl overflow-hidden bg-slate-50 group cursor-pointer hover:border-cyan-400 hover:shadow-md transition-all duration-200"
                        >
                          <img src={record.url} alt={record.prompt} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-103" />
                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Check className="h-6 w-6 text-white bg-cyan-500 rounded-full p-1.5 shadow-sm" />
                          </div>
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-white text-[9px] font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {record.prompt}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reference Image Preview Lightbox Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fadeIn"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl shadow-2xl p-2 relative max-w-5xl max-h-[90vh] flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="Reference Image Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl animate-scaleIn shadow-lg"
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-4 right-4 bg-slate-950/60 hover:bg-slate-950 text-white/90 hover:text-white p-2.5 rounded-full border border-white/10 transition-all cursor-pointer shadow-md hover:scale-105 active:scale-95 flex items-center justify-center"
              title="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
