import React, { useEffect, useState } from "react";
import {
  Scissors,
  Sparkles,
  Copy,
  Download,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Check,
  Flame,
  Clock,
  Play,
  Film,
  ChevronRight,
  Info,
  Upload,
} from "lucide-react";
import { opusclipService, OpusClipProject } from "../services/opusclipService";
import { socketService } from "../services/socketService";
import { toast } from "./Toast";
import { getAccessToken } from "../services/authService";

export default function LongToShortTab() {
  const [videoUrl, setVideoUrl] = useState("");
  const [name, setName] = useState("");
  const [lengthOption, setLengthOption] = useState("auto");
  const [sourceLang, setSourceLang] = useState("auto");
  const [brandTemplateId, setBrandTemplateId] = useState("");

  const [projects, setProjects] = useState<OpusClipProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<OpusClipProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);

  // Load projects list
  const fetchProjects = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await opusclipService.getProjects(1, 20);
      setProjects(res.list || []);
      
      // Update selected project if active
      if (selectedProject) {
        const updated = (res.list || []).find((p) => p.projectId === selectedProject.projectId);
        if (updated) {
          setSelectedProject(updated);
        }
      }
    } catch (err: any) {
      console.error("Lỗi lấy danh sách dự án:", err);
      toast.error(err.message || "Không thể tải danh sách dự án.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();

    // Đăng ký nhận sự kiện realtime qua Socket.IO khi Opus xử lý xong
    const unsubComplete = socketService.on("opusclip:completed", (data: any) => {
      console.log("[Socket] OpusClip project completed:", data);
      toast.success(`Dự án video ngắn #${data.projectId} đã xử lý hoàn tất!`);
      fetchProjects(true);
    });

    const unsubFailed = socketService.on("opusclip:failed", (data: any) => {
      console.error("[Socket] OpusClip project failed:", data);
      toast.error(`Dự án #${data.projectId} xử lý thất bại: ${data.error}`);
      fetchProjects(true);
    });

    return () => {
      unsubComplete();
      unsubFailed();
    };
  }, [selectedProject?.projectId]);

  // Handle upload local video file in chunks directly to Cloudinary
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Giới hạn dung lượng video tối đa 1.5GB cho video dài 20-30 phút
    const MAX_SIZE = 1500 * 1024 * 1024; // 1.5GB
    if (file.size > MAX_SIZE) {
      toast.error("Dung lượng video không được vượt quá 1.5GB.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. Tạo các tham số cần ký
      const timestamp = Math.round(Date.now() / 1000).toString();
      const folder = "igen_erp/opusclip";
      const paramsToSign = {
        timestamp,
        folder,
      };

      // 2. Gọi backend lấy chữ ký bảo mật
      const signRes = await fetch('/api/v1/media/sign-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ paramsToSign }),
      });

      if (!signRes.ok) {
        const errText = await signRes.text();
        throw new Error(`Không thể lấy chữ ký tải lên từ máy chủ: ${errText}`);
      }

      const { signature, apiKey, cloudName } = await signRes.json();

      // 3. Tiến hành tải lên theo phân đoạn (Chunked Upload) trực tiếp sang Cloudinary
      // Sử dụng chunk 6MB (Cloudinary yêu cầu từ 5MB - 100MB cho mỗi chunk)
      const chunkSize = 6 * 1024 * 1024; 
      const totalSize = file.size;
      const uniqueUploadId = 'igen_upload_' + Math.random().toString(36).substring(2, 15);

      let start = 0;
      let secureUrl = "";

      while (start < totalSize) {
        const end = Math.min(start + chunkSize, totalSize);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("file", chunk);
        formData.append("api_key", apiKey);
        formData.append("timestamp", timestamp);
        formData.append("signature", signature);
        formData.append("folder", folder);

        const headers: Record<string, string> = {
          "X-Unique-Upload-Id": uniqueUploadId,
          "Content-Range": `bytes ${start}-${end - 1}/${totalSize}`,
        };

        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
        
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: headers,
          body: formData,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Lỗi tải lên phân đoạn sang Cloudinary: ${errText}`);
        }

        const data = await response.json();
        
        // Cập nhật phần trăm tiến trình
        const progress = Math.round((end / totalSize) * 100);
        setUploadProgress(progress);

        if (end === totalSize) {
          secureUrl = data.secure_url;
        }

        start = end;
      }

      if (secureUrl) {
        setVideoUrl(secureUrl);
        toast.success("Tải video lên Cloudinary thành công!");
      } else {
        throw new Error("Tải lên hoàn tất nhưng không nhận được URL video.");
      }
    } catch (err: any) {
      console.error("Lỗi tải video chunked:", err);
      toast.error(err.message || "Tải video thất bại. Vui lòng thử lại.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle submit new project
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl) {
      toast.error("Vui lòng nhập link video.");
      return;
    }

    setSubmitting(true);
    try {
      const newProj = await opusclipService.createProject({
        videoUrl,
        name: name || undefined,
        lengthOption,
        sourceLang,
        brandTemplateId: brandTemplateId || undefined,
      });

      toast.success("Khởi tạo dự án cắt video AI thành công! Video đang được phân tích.");
      setVideoUrl("");
      setName("");
      
      // Reload list and set as selected
      await fetchProjects(true);
      setSelectedProject(newProj);
    } catch (err: any) {
      toast.error(err.message || "Khởi tạo dự án thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectProject = async (proj: OpusClipProject) => {
    setSelectedProject(proj);
    // Nếu project đang xử lý, fetch chi tiết để sync trạng thái mới từ API
    if (proj.status === "processing") {
      try {
        const detail = await opusclipService.getProjectDetail(proj.projectId);
        setSelectedProject(detail);
        // Cập nhật lại vào list cục bộ
        setProjects((prev) => prev.map((p) => (p.projectId === proj.projectId ? detail : p)));
      } catch (err) {
        console.warn("Lỗi đồng bộ trạng thái dự án:", err);
      }
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTextId(id);
    toast.success("Đã sao chép vào bộ nhớ tạm!");
    setTimeout(() => setCopiedTextId(null), 2000);
  };

  // Helper render badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100">
            <Check className="h-3 w-3" /> Hoàn thành
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-100">
            <AlertCircle className="h-3 w-3" /> Thất bại
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-100 animate-pulse">
            <Clock className="h-3 w-3 animate-spin" /> Đang cắt...
          </span>
        );
    }
  };

  const getViralScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-600 bg-emerald-50 border-emerald-100";
    if (score >= 70) return "text-amber-600 bg-amber-50 border-amber-100";
    return "text-rose-600 bg-rose-50 border-rose-100";
  };

  return (
    <div className="h-full flex flex-col space-y-6 overflow-y-auto pr-1 font-sans" id="long_to_short_root">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Scissors className="h-6 w-6 text-purple-600" /> Long video to Short video
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Chuyển đổi các video dài (YouTube/Drive) thành hàng loạt clip ngắn dọc 9:16 có kèm phụ đề sinh động và phân tích xu hướng bằng AI.
          </p>
        </div>
        <button
          onClick={() => fetchProjects()}
          disabled={loading}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 text-xs font-bold text-gray-700 shadow-xs transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
          <span>Cập nhật danh sách</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUMN LEFT: Form + History (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Submit Box */}
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <h3 className="text-sm font-bold text-gray-800">Cắt video mới</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Đường dẫn video (YouTube / Google Drive / URL trực tiếp) *
                </label>
                <input
                  type="url"
                  required
                  placeholder="Dán link youtube.com/watch?v=... hoặc Drive"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="block h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-xs font-bold text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                  disabled={uploading}
                />
                
                {/* Tải lên video cục bộ */}
                <div className="mt-2">
                  <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-200 bg-purple-50/30 px-4 text-xs font-bold text-purple-600 transition-all hover:bg-purple-50 hover:border-purple-300">
                    {uploading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-purple-600" />
                        <span>Đang tải tệp lên: {uploadProgress}%</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 text-purple-500" />
                        <span>Tải tệp video từ máy tính (&lt; 1.5GB)</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Tên dự án (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Review công nghệ số 01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-xs font-bold text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Độ dài clip ngắn
                  </label>
                  <select
                    value={lengthOption}
                    onChange={(e) => setLengthOption(e.target.value)}
                    className="block h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 outline-none transition-all focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                  >
                    <option value="auto">Tự động (Auto)</option>
                    <option value="<30s">&lt; 30 giây</option>
                    <option value="30s-60s">30s - 60s</option>
                    <option value="60s-90s">60s - 90s</option>
                    <option value="90s-3m">90s - 3 phút</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Ngôn ngữ gốc
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="block h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 outline-none transition-all focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                  >
                    <option value="auto">Tự nhận diện (Auto)</option>
                    <option value="vi">Tiếng Việt (vi)</option>
                    <option value="en">Tiếng Anh (en)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Brand Template ID (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Nhập Template ID nếu có"
                  value={brandTemplateId}
                  onChange={(e) => setBrandTemplateId(e.target.value)}
                  className="block h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-xs font-bold text-gray-900 outline-none transition-all focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-purple-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-purple-600/15 transition-all hover:bg-purple-700 active:scale-97 disabled:opacity-50"
              >
                {submitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Scissors className="h-4 w-4" />
                    <span>Bắt đầu xử lý AI (Tiêu tốn credits)</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 flex gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 text-[10px] text-gray-400 leading-normal">
              <Info className="h-3.5 w-3.5 shrink-0 text-purple-500 mt-0.5" />
              <span>
                Hệ thống khấu trừ theo số phút của video gốc (1 phút = 1 credit). Clips ngắn đầu ra được tạo bằng AI kèm phụ đề sẵn có.
              </span>
            </div>
          </div>

          {/* History List */}
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs flex flex-col max-h-[480px]">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Film className="h-4 w-4 text-gray-500" /> Lịch sử video đã cắt
            </h3>

            {loading && projects.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">Đang tải lịch sử...</div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 font-medium">Chưa có dự án nào được tạo.</div>
            ) : (
              <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
                {projects.map((proj) => {
                  const isActive = selectedProject?.projectId === proj.projectId;
                  return (
                    <button
                      key={proj._id}
                      onClick={() => handleSelectProject(proj)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        isActive
                          ? "border-purple-200 bg-purple-50/50 shadow-xs"
                          : "border-gray-100 hover:bg-gray-50"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-bold text-gray-800 truncate" title={proj.name}>
                          {proj.name || `Video #${proj.projectId}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-medium text-gray-400 font-mono">
                            {new Date(proj.createdAt).toLocaleDateString("vi-VN")}
                          </span>
                          {getStatusBadge(proj.status)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMN RIGHT: Selected Project Details (8 cols) */}
        <div className="lg:col-span-8">
          
          {selectedProject ? (
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs min-h-[500px] flex flex-col">
              
              {/* Selected Project Header */}
              <div className="border-b border-gray-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 tracking-tight">
                    {selectedProject.name || `Project: ${selectedProject.projectId}`}
                  </h2>
                  <a
                    href={selectedProject.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-purple-600 font-medium underline flex items-center gap-1 mt-1 hover:text-purple-700"
                  >
                    <span>Xem video gốc</span> <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                    Trạng thái: {selectedProject.status.toUpperCase()}
                  </span>
                  {selectedProject.status === "processing" && (
                    <button
                      onClick={() => handleSelectProject(selectedProject)}
                      className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition active:scale-95"
                      title="Sync trạng thái"
                    >
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </button>
                  )}
                </div>
              </div>

              {/* Processing View */}
              {selectedProject.status === "processing" && (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                  <div className="relative mb-6">
                    <div className="h-16 w-16 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin" />
                    <Scissors className="h-6 w-6 text-purple-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-800">AI đang tiến hành cắt video dài...</h4>
                  <p className="text-[11px] text-gray-400 mt-2 max-w-[340px] leading-relaxed">
                    OpusClip đang download video, chạy trích xuất transcripts tiếng, phân tích các phân cảnh thu hút và render video ngắn dọc 9:16. 
                    Quá trình này thường mất 3 - 8 phút. Bạn có thể làm việc khác, hệ thống sẽ tự động cập nhật khi xong!
                  </p>
                </div>
              )}

              {/* Failed View */}
              {selectedProject.status === "failed" && (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-bold text-rose-700">Xử lý video AI thất bại</h4>
                  <p className="text-[11px] text-gray-500 mt-2 max-w-[320px] leading-normal">
                    {selectedProject.error || "Không rõ nguyên nhân. Vui lòng kiểm tra lại chất lượng hoặc link video nguồn."}
                  </p>
                </div>
              )}

              {/* Completed Clips Grid View */}
              {selectedProject.status === "completed" && (
                <div className="flex-1 space-y-6">
                  
                  {(!selectedProject.clips || selectedProject.clips.length === 0) ? (
                    <div className="py-20 text-center text-xs text-gray-400 font-medium">
                      AI không tìm thấy phân cảnh ngắn đạt chuẩn viral nào trong video này.
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-4 bg-purple-50 border border-purple-100 rounded-2xl p-3 text-xs text-purple-800">
                        <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
                        <span className="font-medium">
                          AI tìm thấy **{selectedProject.clips.length} clip ngắn** đạt tiêu chuẩn viral cao.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {selectedProject.clips.map((clip) => {
                          const copyIdTitle = `${clip.clipId}-title`;
                          const copyIdDesc = `${clip.clipId}-desc`;

                          return (
                            <div
                              key={clip.clipId}
                              className="rounded-3xl border border-gray-100 bg-white shadow-xs overflow-hidden flex flex-col relative group hover:border-purple-200 transition-all"
                            >
                              {/* 9:16 Video Player Area */}
                              <div className="bg-slate-950 aspect-[9/16] w-full max-h-[360px] overflow-hidden relative flex items-center justify-center">
                                <video
                                  src={clip.videoUrl}
                                  controls
                                  preload="metadata"
                                  className="w-full h-full object-contain"
                                />
                                {/* Virality Score Badge floating top-right */}
                                <div className={`absolute top-4 right-4 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black border tracking-wider shadow-sm z-10 ${getViralScoreColor(clip.viralityScore)}`}>
                                  <Flame className="h-3.5 w-3.5 fill-current" />
                                  <span>{clip.viralityScore}/100</span>
                                </div>
                              </div>

                              {/* Details Info */}
                              <div className="p-5 flex-1 flex flex-col space-y-4">
                                
                                {/* Title with copy */}
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tiêu đề đề xuất</span>
                                    <button
                                      onClick={() => copyToClipboard(clip.title, copyIdTitle)}
                                      className="text-gray-400 hover:text-purple-600 p-1"
                                      title="Sao chép tiêu đề"
                                    >
                                      {copiedTextId === copyIdTitle ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                  <p className="text-xs font-extrabold text-gray-800 mt-1 line-clamp-2 leading-relaxed">
                                    {clip.title || "Không có tiêu đề"}
                                  </p>
                                </div>

                                {/* Description with copy */}
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nội dung mạng xã hội & Hashtags</span>
                                    <button
                                      onClick={() => copyToClipboard(`${clip.description}\n\n${clip.hashtags}`, copyIdDesc)}
                                      className="text-gray-400 hover:text-purple-600 p-1"
                                      title="Sao chép mô tả"
                                    >
                                      {copiedTextId === copyIdDesc ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-gray-600 mt-1 line-clamp-3 leading-relaxed font-medium bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    {clip.description || "Không có mô tả."}
                                    {clip.hashtags && <span className="block mt-1.5 text-purple-600 font-bold">{clip.hashtags}</span>}
                                  </p>
                                </div>

                                {/* AI Reasoning */}
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Phân tích lý do Viral (AI Analysis)</span>
                                  <p className="text-[11px] text-amber-700 font-medium mt-1 leading-relaxed bg-amber-50/50 border border-amber-100 rounded-xl p-2.5">
                                    {clip.viralReason || "Không có phân tích lý do."}
                                  </p>
                                </div>

                                {/* Metrics duration, timing */}
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400 border-t border-gray-50 pt-3">
                                  <div>THỜI LƯỢNG: <span className="font-bold text-gray-700">{clip.duration}s</span></div>
                                  <div>TIMECODE: <span className="font-bold text-gray-700">{clip.startTime}s - {clip.endTime}s</span></div>
                                </div>

                                {/* Actions */}
                                <div className="pt-2">
                                  <a
                                    href={clip.videoUrl}
                                    download
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 hover:border-purple-200 bg-white py-2 text-center text-xs font-bold text-gray-600 hover:text-purple-700 transition active:scale-95 shadow-xs"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    <span>Tải clip xuống</span>
                                  </a>
                                </div>

                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          ) : (
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs min-h-[500px] flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
                <Scissors className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-gray-800">Không có dự án nào được chọn</h3>
              <p className="text-xs text-gray-400 mt-1.5 max-w-[280px] leading-relaxed">
                Vui lòng chọn một dự án trong danh sách lịch sử ở cột bên trái hoặc tạo dự án cắt video mới để xem các clips AI dọc.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
