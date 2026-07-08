import React, { useState, useEffect } from "react";
import { 
  MessageSquare, Zap, RefreshCw, Terminal, CheckCircle, 
  HelpCircle, Save, Sliders, ExternalLink, ChevronDown, ChevronUp,
  Facebook, Copy, FileText, Database, UploadCloud, Trash2, BookOpen
} from "lucide-react";
import { toast } from "../../pages/Toast";
import { getAccessToken } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";
import { AIChatConfig } from "../../types";

interface AiCommentReplyManagerProps {
  facebookPages?: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }>;
  selectedFacebookPageId?: string;
  setSelectedFacebookPageId?: (val: string) => void;
}

export function AiCommentReplyManager({
  facebookPages = [],
  selectedFacebookPageId = "",
  setSelectedFacebookPageId = () => {},
}: AiCommentReplyManagerProps) {
  const { userProfile, updateAiAutoReplyConfig } = useAuth();
  
  // Local config matching database settings
  const [localConfig, setLocalConfig] = useState<AIChatConfig>({
    enabled: false,
    commentReplyEnabled: false,
    autoClassify: true,
    autoCloseDeal: false,
    autoFeedback: false,
    replyDelay: 15,
    advancedInstructions: "",
    trainingKnowledge: "",
    model: "gemini-3.5-flash"
  });

  const [savingConfig, setSavingConfig] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [knowledgeHealth, setKnowledgeHealth] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Pagination states for Logs
  const [logsPage, setLogsPage] = useState(1);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);

  // Document sync/upload states
  const [driveLink, setDriveLink] = useState("");
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [clearingKnowledge, setClearingKnowledge] = useState(false);
  
  // Cache of Facebook post detail info (message and picture URL)
  const [postDetails, setPostDetails] = useState<{ [postId: string]: { message: string, full_picture?: string } }>({});

  // Collapsible settings sections
  const [sectionsExpanded, setSectionsExpanded] = useState({
    script: true,
    rag: true,
    manual: false,
  });



  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<any>(null);

  // Expanded post card states
  const [expandedPosts, setExpandedPosts] = useState<{ [key: string]: boolean }>({});
  const [expandedContexts, setExpandedContexts] = useState<{ [key: string]: boolean }>({});
  const [searchQuery, setSearchQuery] = useState("");


  // Sync settings from selectedFacebookPageId (per-page config) or fallback to userProfile
  useEffect(() => {
    let active = true;
    const loadPageConfig = async () => {
      const selectedPage = facebookPages.find(p => p.username === selectedFacebookPageId);
      if (selectedPage && selectedPage._id !== "personal") {
        try {
          const res = await fetch(`/api/v1/crud/social-integrations/${selectedPage._id}`, {
            headers: {
              Authorization: `Bearer ${getAccessToken()}`,
            },
          });
          const result = await res.json().catch(() => ({}));
          if (active && res.ok && result.status === "success" && result.data?.aiAutoReplyConfig) {
            const config = result.data.aiAutoReplyConfig;
            setLocalConfig({
              enabled: config.enabled ?? false,
              commentReplyEnabled: config.commentReplyEnabled ?? false,
              autoClassify: true,
              autoCloseDeal: true,
              autoFeedback: true,
              replyDelay: config.replyDelay ?? 15,
              advancedInstructions: config.advancedInstructions ?? "",
              trainingKnowledge: config.trainingKnowledge ?? "",
              model: config.model || "gemini-3.5-flash"
            });
            return;
          }
        } catch (err) {
          console.error("[AiCommentReplyManager] Failed to load per-page AI config:", err);
        }
      }

      // Fallback to userProfile
      if (active && userProfile?.aiAutoReplyConfig) {
        setLocalConfig({
          enabled: userProfile.aiAutoReplyConfig.enabled ?? false,
          commentReplyEnabled: userProfile.aiAutoReplyConfig.commentReplyEnabled ?? false,
          autoClassify: true,
          autoCloseDeal: true,
          autoFeedback: true,
          replyDelay: userProfile.aiAutoReplyConfig.replyDelay ?? 15,
          advancedInstructions: userProfile.aiAutoReplyConfig.advancedInstructions ?? "",
          trainingKnowledge: userProfile.aiAutoReplyConfig.trainingKnowledge ?? "",
          model: userProfile.aiAutoReplyConfig.model || "gemini-3.5-flash"
        });
      }
    };

    void loadPageConfig();

    return () => {
      active = false;
    };
  }, [selectedFacebookPageId, facebookPages, userProfile]);

  const fetchSinglePostDetail = async (postId: string) => {
    if (!postId || postId === "unknown_post" || postId.includes("mock")) return;

    try {
      const query = selectedFacebookPageId ? `?pageId=${encodeURIComponent(selectedFacebookPageId)}` : "";
      const res = await fetch(`/api/v1/facebook/messenger/post-detail/${postId}${query}`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.success && result.data) {
        setPostDetails(prev => ({
          ...prev,
          [postId]: {
            message: result.data.message || `Bài viết ID: ${postId}`,
            full_picture: result.data.full_picture
          }
        }));
      } else {
        setPostDetails(prev => ({
          ...prev,
          [postId]: {
            message: `Bài viết ID: ${postId}`,
            full_picture: null
          }
        }));
      }
    } catch (err) {
      console.error(`Failed to load details for post ${postId}:`, err);
    }
  };

  // Fetch AI Reply Logs specifically for facebook_comment
  const fetchLogs = async (page: number = 1) => {
    if (page === 1) {
      setLoadingLogs(true);
    } else {
      setLoadingMoreLogs(true);
    }
    try {
      const res = await fetch(`/api/v1/facebook/debug-ai-logs?channel=facebook_comment&limit=10&page=${page}`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const newLogs = data.logs || [];
        if (page === 1) {
          setLogs(newLogs);
          setLogsPage(1);
          
          // Auto expand the first few posts initially
          const uniquePostIds = Array.from(new Set(newLogs.map((l: any) => l.postId || "unknown_post"))) as string[];
          const initialExpanded: { [key: string]: boolean } = {};
          uniquePostIds.forEach((id, index) => {
            initialExpanded[id] = index === 0; // Expand first post by default
            if (index === 0 && id && id !== "unknown_post") {
              void fetchSinglePostDetail(id);
            }
          });
          setExpandedPosts(initialExpanded);
        } else {
          setLogs(prev => {
            const existingIds = new Set(prev.map(l => l._id));
            const filteredNewLogs = newLogs.filter((l: any) => !existingIds.has(l._id));
            return [...prev, ...filteredNewLogs];
          });
          setLogsPage(page);
        }
        setHasMoreLogs(!!data.hasMore);
      } else {
        toast.error(data.message || "Không thể tải nhật ký phản hồi.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Lỗi khi tải nhật ký phản hồi.");
    } finally {
      setLoadingLogs(false);
      setLoadingMoreLogs(false);
    }
  };

  // Fetch AI Health & training status
  const fetchAIHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch("/api/v1/gemini/ai-health", {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setKnowledgeHealth(data.data || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHealth(false);
    }
  };

  // Fetch Facebook Page diagnostics
  const fetchDiagnostics = async () => {
    try {
      const query = selectedFacebookPageId ? `?pageId=${encodeURIComponent(selectedFacebookPageId)}` : "";
      const res = await fetch(`/api/v1/facebook/messenger/diagnostics/page${query}`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDiagnostics(data.data || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!selectedFacebookPageId) return;
    setPostDetails({}); // Clear cache on page switch
    void fetchLogs(1);
    void fetchAIHealth();
    void fetchDiagnostics();
  }, [selectedFacebookPageId]);

  // Post details are now lazy loaded on expand or auto-expand

  // Save config
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const configToSave = {
      ...localConfig,
      autoClassify: true,
      autoCloseDeal: true,
      autoFeedback: true
    };
    try {
      const selectedPage = facebookPages.find(p => p.username === selectedFacebookPageId);
      if (selectedPage && selectedPage._id !== "personal") {
        const res = await fetch(`/api/v1/crud/social-integrations/${selectedPage._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ aiAutoReplyConfig: configToSave }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(result.message || "Không thể lưu cấu hình cho Fanpage.");
        }
      } else {
        await updateAiAutoReplyConfig(configToSave);
      }
      toast.success("Đã cập nhật cấu hình tự động trả lời bình luận Facebook!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Lỗi khi lưu cấu hình.");
    } finally {
      setSavingConfig(false);
    }
  };

  const [copyingConfig, setCopyingConfig] = useState(false);

  const handleApplyToAllPages = async () => {
    const selectedPage = facebookPages.find(p => p.username === selectedFacebookPageId);
    if (!selectedPage || selectedPage._id === "personal") {
      toast.warning("Chỉ hỗ trợ đồng bộ cấu hình giữa các Fanpage doanh nghiệp.");
      return;
    }

    const otherPages = facebookPages.filter(p => p._id !== "personal" && p.username !== selectedFacebookPageId);
    if (otherPages.length === 0) {
      toast.info("Không có Fanpage doanh nghiệp nào khác để đồng bộ.");
      return;
    }

    const confirmSync = window.confirm(
      `Bạn có chắc chắn muốn áp dụng cấu hình AI hiện tại cho tất cả ${otherPages.length} Fanpage doanh nghiệp khác không?`
    );
    if (!confirmSync) return;

    setCopyingConfig(true);
    const configToSave = {
      ...localConfig,
      autoClassify: true,
      autoCloseDeal: true,
      autoFeedback: true
    };
    let successCount = 0;
    try {
      for (const page of otherPages) {
        const res = await fetch(`/api/v1/crud/social-integrations/${page._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ aiAutoReplyConfig: configToSave }),
        });
        if (res.ok) {
          successCount++;
        }
      }
      toast.success(`Đã sao chép cấu hình thành công sang ${successCount}/${otherPages.length} Fanpage doanh nghiệp khác!`);
    } catch (err: any) {
      console.error(err);
      toast.error("Lỗi xảy ra trong quá trình đồng bộ cấu hình.");
    } finally {
      setCopyingConfig(false);
    }
  };

  // Sync Google Drive
  const handleSyncDrive = async () => {
    if (!driveLink.trim()) {
      toast.error("Vui lòng nhập đường dẫn tài liệu Google Drive / Doc.");
      return;
    }
    setSyncingDrive(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/v1/gemini/sync-drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ docLink: driveLink })
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        const nextConfig = {
          ...localConfig,
          trainingKnowledge: data.text
        };
        setLocalConfig(nextConfig);
        toast.success(`Đồng bộ thành công từ ${data.title}! Hãy bấm "Lưu cấu hình auto-reply" để áp dụng.`);
        void fetchAIHealth();
      } else {
        toast.error(data.message || "Lỗi đồng bộ từ Google Drive.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Không thể kết nối tới máy chủ.");
    } finally {
      setSyncingDrive(false);
    }
  };

  // Upload Local File
  const handleUploadLocalDoc = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1025) {
      toast.error("Tệp tin vượt quá dung lượng tối đa cho phép (10MB).");
      return;
    }

    setUploadingDoc(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64String = reader.result as string;
          const base64Data = base64String.split(",")[1];

          const { geminiApi } = await import("../../api/gemini");
          const data = await geminiApi.uploadLocalDocument(file.name, base64Data, file.type);

          const nextConfig = {
            ...localConfig,
            trainingKnowledge: data.text
          };
          setLocalConfig(nextConfig);
          toast.success(`Đã trích xuất & nạp tài liệu: ${file.name} thành công! Hãy bấm "Lưu cấu hình" để hoàn tất.`);
          void fetchAIHealth();
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || "Lỗi trích xuất và nạp tài liệu.");
        } finally {
          setUploadingDoc(false);
        }
      };
      reader.onerror = () => {
        toast.error("Không thể đọc tệp tin.");
        setUploadingDoc(false);
      };
    } catch (err: any) {
      console.error(err);
      toast.error("Lỗi khi tải tài liệu lên.");
      setUploadingDoc(false);
    }
  };

  // Clear/Reset Knowledge
  const handleClearKnowledge = async () => {
    if (clearingKnowledge) return;

    const confirmed = window.confirm("Xóa toàn bộ tài liệu AI đã feed và reset dữ liệu huấn luyện hiện tại?");
    if (!confirmed) return;

    setClearingKnowledge(true);
    try {
      const { geminiApi } = await import("../../api/gemini");
      await geminiApi.clearKnowledge();
      const nextConfig = { ...localConfig, trainingKnowledge: "" };
      setLocalConfig(nextConfig);
      toast.success("Đã xóa toàn bộ tài liệu AI đã feed.");
      void fetchAIHealth();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Không thể xóa tri thức AI.");
    } finally {
      setClearingKnowledge(false);
    }
  };



  // Log feedbacks
  const handleFeedback = async (logId: string, feedback: "good" | "bad" | "needs_fix") => {
    try {
      const res = await fetch(`/api/v1/crud/ai-reply-logs/${logId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ feedback }),
      });
      if (res.ok) {
        toast.success("Đã ghi nhận phản hồi của bạn.");
        void fetchLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const togglePostExpanded = (postId: string) => {
    const isNowExpanded = !expandedPosts[postId];
    if (isNowExpanded && !postDetails[postId]) {
      void fetchSinglePostDetail(postId);
    }
    setExpandedPosts(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  const toggleContextExpanded = (logId: string) => {
    setExpandedContexts(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  // Filter logs by search query
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (log.postId && log.postId.toLowerCase().includes(query)) ||
      (log.customerMessage && log.customerMessage.toLowerCase().includes(query)) ||
      (log.aiResponse && log.aiResponse.toLowerCase().includes(query))
    );
  });

  // Grouping logs by postId
  const groupedLogs = filteredLogs.reduce((acc: { [key: string]: any[] }, log) => {
    const key = log.postId || "unknown_post";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(log);
    return acc;
  }, {});

  const postIds = Object.keys(groupedLogs);

  return (
    <div className="space-y-6 text-left" id="ai_comment_reply_manager_container">
      {/* Header Info Panel */}
      <div className="bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 pb-4">
          <div className="text-left">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-650" />
              Tự động trả lời Bình luận Facebook
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Phân tách quản lý các phản hồi tự động theo từng bài viết cụ thể trên Fanpage Facebook của bạn.
            </p>
          </div>

          {/* Facebook Page Switcher */}
          {facebookPages && facebookPages.length > 0 && (
            <div className="flex items-center gap-2 min-w-[200px]" id="comment_page_switcher">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Trang:</span>
              <div className="relative flex-1">
                <select
                  value={selectedFacebookPageId}
                  onChange={(e) => setSelectedFacebookPageId(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-xl text-[11px] font-bold text-gray-700 outline-none cursor-pointer focus:ring-4 focus:ring-indigo-650/10 focus:border-indigo-650 transition-all duration-200 appearance-none"
                >
                  {facebookPages.map((page) => (
                    <option key={page.username} value={page.username}>
                      {page.displayName} {page.isMock ? "(Demo)" : ""}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-indigo-650">
                  <Facebook className="h-3.5 w-3.5" />
                </div>
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                  <ChevronDown className="h-3 w-3" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left Column: Config settings (Accordion style) */}
          <div className="xl:col-span-2 bg-gray-50/50 border border-gray-150 rounded-2xl p-4 space-y-4">
            
            {/* Accordion 1: Cấu hình kịch bản & Chạy */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
              <button
                onClick={() => setSectionsExpanded(prev => ({ ...prev, script: !prev.script }))}
                className="w-full px-4 py-3.5 flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-150"
              >
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-650" />
                  Kịch bản & Chạy
                </span>
                {sectionsExpanded.script ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              
              {sectionsExpanded.script && (
                <div className="p-4 space-y-4 text-left">
                  {/* Toggles */}
                  <div className="flex justify-between items-center p-3 bg-gray-50/30 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-gray-800">Trả lời bình luận FB</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5">Cho phép AI phản hồi bình luận.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={localConfig.commentReplyEnabled}
                        onChange={(e) => setLocalConfig({ ...localConfig, commentReplyEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-indigo-650" />
                    </label>
                  </div>

                  {/* Delay setting */}
                  <div className="space-y-2 p-3 bg-gray-50/30 border border-gray-200 rounded-xl">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-700">Độ trễ gửi câu trả lời</span>
                      <strong className="font-mono bg-white px-2 py-0.5 border border-gray-200 rounded text-gray-600">
                        {localConfig.replyDelay} giây (s)
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={45}
                      value={localConfig.replyDelay}
                      onChange={(e) => setLocalConfig({ ...localConfig, replyDelay: parseInt(e.target.value) })}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                    />
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      onClick={handleSaveConfig}
                      disabled={savingConfig}
                      className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {savingConfig ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Lưu cấu hình auto-reply
                    </button>
                    {facebookPages && facebookPages.filter(p => p._id !== "personal" && p.username !== selectedFacebookPageId).length > 0 && (
                      <button
                        onClick={handleApplyToAllPages}
                        disabled={savingConfig || copyingConfig}
                        className="w-full py-2.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {copyingConfig ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        Đồng bộ cho Fanpage khác
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Nạp tài liệu tri thức RAG */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
              <button
                onClick={() => setSectionsExpanded(prev => ({ ...prev, rag: !prev.rag }))}
                className="w-full px-4 py-3.5 flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-150"
              >
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-600" />
                  Nạp tài liệu tri thức (RAG)
                </span>
                {sectionsExpanded.rag ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>

              {sectionsExpanded.rag && (
                <div className="p-4 space-y-4 text-left">
                  {/* Google Drive Link Sync */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      Đồng bộ Google Drive
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Dán link Google Drive hoặc Doc/Sheet..."
                        value={driveLink}
                        onChange={(e) => setDriveLink(e.target.value)}
                        disabled={syncingDrive}
                        className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg text-[10px] focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={handleSyncDrive}
                        disabled={syncingDrive}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[9px] shrink-0 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-60 cursor-pointer"
                      >
                        {syncingDrive ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Đồng bộ"}
                      </button>
                    </div>
                  </div>

                  {/* Upload File Zone */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <UploadCloud className="h-3.5 w-3.5 text-blue-600" />
                      Tải tệp tài liệu trực tiếp
                    </label>
                    <label className={`flex flex-col items-center justify-center border border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${uploadingDoc
                        ? "border-blue-400 bg-blue-50/30"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-blue-500"
                      }`}>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            void handleUploadLocalDoc(e.target.files[0]);
                          }
                        }}
                        disabled={uploadingDoc}
                        className="hidden"
                      />
                      <UploadCloud className={`h-5 w-5 mb-0.5 ${uploadingDoc ? "text-blue-500 animate-bounce" : "text-slate-400"}`} />
                      <span className="text-[9px] font-bold text-slate-700">
                        {uploadingDoc ? "Đang xử lý..." : "Kéo thả hoặc click để chọn tệp"}
                      </span>
                    </label>
                  </div>

                  {/* RAG Health Status Grid */}
                  <div className="pt-3 border-t border-gray-200 text-left">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Trạng thái tri thức RAG</h5>
                      <button
                        onClick={fetchAIHealth}
                        disabled={loadingHealth}
                        className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-650 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingHealth ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 flex flex-col justify-between">
                        <span className="text-gray-400 text-[9px]">Chế độ</span>
                        <strong className={`mt-0.5 text-[10px] font-bold ${
                          knowledgeHealth?.mode === "trained" ? "text-green-700" : "text-amber-700"
                        }`}>
                          {knowledgeHealth?.mode === "trained" ? "Đã huấn luyện" : "Mặc định hệ thống"}
                        </strong>
                      </div>

                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 flex flex-col justify-between">
                        <span className="text-gray-400 text-[9px]">Vector Chunks</span>
                        <strong className="mt-0.5 text-xs text-gray-700 font-mono">
                          {knowledgeHealth?.chunksCount ?? 0}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Clear Knowledge Button */}
                  <button
                    onClick={handleClearKnowledge}
                    disabled={clearingKnowledge}
                    className="w-full py-2 border border-red-200 hover:bg-red-50 text-red-650 rounded-xl font-bold text-[10px] transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa sạch tri thức đã huấn luyện
                  </button>
                </div>
              )}
            </div>

            {/* Accordion 3: Chỉ dẫn & Dữ liệu thủ công */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
              <button
                onClick={() => setSectionsExpanded(prev => ({ ...prev, manual: !prev.manual }))}
                className="w-full px-4 py-3.5 flex justify-between items-center bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-150"
              >
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-600" />
                  Chỉ dẫn & Dữ liệu thủ công
                </span>
                {sectionsExpanded.manual ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>

              {sectionsExpanded.manual && (
                <div className="p-4 space-y-4 text-left">
                  {/* Advanced Instructions */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">
                      Chỉ dẫn nâng cao (AI Prompts)
                    </label>
                    <textarea
                      placeholder="Nhập luật hành xử nghiêm ngặt cho AI (vd: xưng hô Dạ/Thưa, tập trung trả lời đúng trọng tâm)..."
                      value={localConfig.advancedInstructions}
                      onChange={(e) => setLocalConfig({ ...localConfig, advancedInstructions: e.target.value })}
                      className="w-full h-24 p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl text-[10px] leading-relaxed focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all duration-200"
                    />
                  </div>

                  {/* Manual Training Knowledge */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">
                      Dữ liệu tri thức huấn luyện AI
                    </label>
                    <textarea
                      placeholder="Nhập thông tin sản phẩm, câu hỏi thường gặp FAQ, chính sách giao hàng..."
                      value={localConfig.trainingKnowledge}
                      onChange={(e) => setLocalConfig({ ...localConfig, trainingKnowledge: e.target.value })}
                      className="w-full h-36 p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl text-[10px] leading-relaxed focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all duration-200"
                    />
                    <p className="text-[8px] text-slate-400 leading-normal">
                      Bạn có thể dán nội dung văn bản tự do hoặc các câu hỏi đáp FAQs tại đây. Nhấp "Lưu cấu hình auto-reply" để áp dụng cho AI.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Grouped Logs */}
          <div className="xl:col-span-3 space-y-4">

            {/* Grouped Logs List */}
            <div className="space-y-4 text-left">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider shrink-0">
                  Quản lý phản hồi theo bài viết
                </h4>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Tìm theo Post ID, comment..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-gray-200 focus:border-indigo-650 rounded-xl text-[10px] outline-none transition-all w-full sm:w-48 focus:sm:w-60 shadow-2xs"
                  />
                  <button
                    onClick={() => fetchLogs(1)}
                    disabled={loadingLogs}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded-xl transition-all cursor-pointer border border-gray-200 shrink-0 bg-white"
                    title="Tải lại nhật ký"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {loadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 bg-gray-50/30 border border-gray-150 rounded-2xl">
                  <div className="w-6 h-6 border-2 border-indigo-650 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-gray-500">Đang tải nhật ký phản hồi...</p>
                </div>
              ) : postIds.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 bg-gray-50/30 border border-gray-150 rounded-2xl text-center px-4">
                  <HelpCircle className="h-8 w-8 text-gray-300 mb-1" />
                  <p className="text-xs font-bold text-gray-600">Chưa có nhật ký phản hồi nào</p>
                  <p className="text-[10px] text-gray-400 max-w-xs leading-normal">
                    {searchQuery ? "Không tìm thấy phản hồi khớp với từ khóa tìm kiếm." : "Khi có bình luận mới trên Fanpage, AI sẽ tự động phản hồi và hiển thị nhật ký tại đây."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                  {postIds.map((postId) => {
                    const postLogs = groupedLogs[postId];
                    const isExpanded = !!expandedPosts[postId];
                    const details = postDetails[postId];
                    
                    return (
                      <div key={postId} className="border border-gray-200 rounded-2xl bg-white shadow-2xs overflow-hidden hover:border-gray-300 transition-all">
                        {/* Post Header Bar (Click to toggle collapse) */}
                        <div 
                          onClick={() => togglePostExpanded(postId)}
                          className="flex items-center justify-between p-3.5 bg-gray-50/70 border-b border-gray-150 hover:bg-gray-50 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {details?.full_picture ? (
                              <img 
                                src={details.full_picture} 
                                alt="Post thumbnail" 
                                className="w-8 h-8 rounded-lg object-cover border border-gray-250 shrink-0" 
                              />
                            ) : (
                              <MessageSquare className="h-4.5 w-4.5 text-indigo-650 shrink-0" />
                            )}
                            <div className="text-left min-w-0 flex-1">
                              <span 
                                className="text-[11px] font-bold text-gray-800 line-clamp-1 block pr-4" 
                                title={details?.message || `Bài viết ID: ${postId}`}
                              >
                                {details?.message || `Bài viết ID: ${postId}`}
                              </span>
                              <span className="text-[9px] text-gray-400 font-semibold block mt-0.5">
                                ID: {postId} • Tổng số {postLogs.length} phản hồi tự động
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {postId !== "unknown_post" && !postId.includes("mock") && (
                              <a 
                                href={`https://facebook.com/${postId}`} 
                                target="_blank" 
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()} // Avoid expanding/collapsing when clicking link
                                className="p-1.5 hover:bg-gray-200 text-gray-455 hover:text-indigo-650 rounded-lg transition-all"
                                title="Xem trên Facebook"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                          </div>
                        </div>

                        {/* Collapsible log entries under this post */}
                        {isExpanded && (
                          <div className="p-3.5 space-y-3 bg-white/50 border-t-0">
                            {postLogs.map((log) => (
                              <div key={log._id} className="border border-gray-150 rounded-xl p-3 bg-gray-50/20 hover:bg-gray-50/50 transition-colors space-y-2.5">
                                <div className="flex justify-between items-center text-[10px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                      (log.status === "sent" || log.status === "success")
                                        ? "bg-green-50 border border-green-200 text-green-700" 
                                        : "bg-red-50 border border-red-200 text-red-700"
                                    }`}>
                                      {(log.status === "sent" || log.status === "success") ? "Thành công" : "Thất bại"}
                                    </span>
                                    {log.aiResponse?.includes("Inbox Thất bại") && (
                                      <span className="px-1.5 py-0.5 rounded-full font-bold uppercase bg-amber-50 border border-amber-200 text-amber-700" title="AI trả lời bình luận thành công nhưng gửi inbox riêng tư bị lỗi. Vui lòng nhắn tin tay.">
                                        Lỗi gửi Inbox
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-gray-400">
                                    {log.latencyMs}ms | {new Date(log.createdAt).toLocaleTimeString("vi-VN")}
                                  </span>
                                </div>

                                <div className="space-y-2 text-xs text-left">
                                  <div className="bg-white border border-gray-150 rounded-lg p-2.5 shadow-2xs">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Khách bình luận:</p>
                                    <p className="text-gray-700 font-sans mt-0.5">{log.customerMessage}</p>
                                  </div>
                                  <div className="bg-indigo-50/25 border border-indigo-100/50 rounded-lg p-2.5 shadow-2xs">
                                    <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">AI trả lời:</p>
                                    <p className="text-gray-800 font-sans font-semibold mt-0.5">{log.aiResponse}</p>
                                  </div>
                                </div>

                                {/* Collapsible RAG context matching */}
                                {log.contextPreview && (
                                  <div className="border border-gray-150 rounded-lg overflow-hidden bg-white shadow-3xs">
                                    <button
                                      onClick={() => toggleContextExpanded(log._id)}
                                      className="w-full px-2.5 py-1.5 flex justify-between items-center text-[9px] font-bold text-gray-500 hover:bg-slate-50 transition-colors"
                                    >
                                      <span className="flex items-center gap-1">
                                        <Terminal className="h-3 w-3 text-indigo-500 shrink-0" />
                                        Nguồn tri thức đối chiếu RAG ({log.contextMatches || 0} khớp)
                                      </span>
                                      {expandedContexts[log._id] ? (
                                        <ChevronUp className="h-3 w-3 text-gray-400" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3 text-gray-400" />
                                      )}
                                    </button>
                                    {expandedContexts[log._id] && (
                                      <div className="p-2 border-t border-gray-150 text-[10px] text-gray-600 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed bg-slate-50/40">
                                        {log.contextPreview}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="flex justify-between items-center text-[10px] pt-1">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleFeedback(log._id, "good")}
                                      className={`px-2 py-0.5 rounded-lg font-bold transition-all active:scale-95 cursor-pointer text-[9px] ${
                                        log.feedback === "good"
                                          ? "bg-green-600 border border-green-600 text-white"
                                          : "bg-green-50 hover:bg-green-100 border border-green-200 text-green-700"
                                      }`}
                                    >
                                      Đúng
                                    </button>
                                    <button
                                      onClick={() => handleFeedback(log._id, "needs_fix")}
                                      className={`px-2 py-0.5 rounded-lg font-bold transition-all active:scale-95 cursor-pointer text-[9px] ${
                                        log.feedback === "needs_fix"
                                          ? "bg-amber-500 border border-amber-500 text-white"
                                          : "bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700"
                                      }`}
                                    >
                                      Cần sửa
                                    </button>
                                    <button
                                      onClick={() => handleFeedback(log._id, "bad")}
                                      className={`px-2 py-0.5 rounded-lg font-bold transition-all active:scale-95 cursor-pointer text-[9px] ${
                                        log.feedback === "bad"
                                          ? "bg-red-600 border border-red-600 text-white"
                                          : "bg-red-50 hover:bg-red-100 border border-red-200 text-red-700"
                                      }`}
                                    >
                                      Sai
                                    </button>
                                  </div>
                                  
                                  <span className="font-mono text-gray-400 text-[9px] truncate max-w-[120px]" title={log.commentId}>
                                    CmtID: {log.commentId || "n/a"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {hasMoreLogs && (
                    <div className="pt-2 flex justify-center pb-4">
                      <button
                        onClick={() => fetchLogs(logsPage + 1)}
                        disabled={loadingMoreLogs}
                        className="px-4 py-2 border border-gray-250 hover:bg-gray-50 text-gray-700 bg-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer disabled:opacity-50"
                      >
                        {loadingMoreLogs ? (
                          <RefreshCw className="h-3 w-3 animate-spin text-gray-500" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                        )}
                        Tải thêm bài viết & bình luận
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
