import {
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Flame,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  FaqCandidate,
  FaqCandidateCategory,
  FaqCandidateStatus,
  companyKnowledgeService,
} from "../../services/companyKnowledgeService";
import { toast } from "../../pages/Toast";

const CATEGORY_MAP: Record<FaqCandidateCategory, { label: string; color: string; bg: string }> = {
  pricing: { label: "Giá & Báo giá", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  shipping: { label: "Giao hàng & Ship", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  product: { label: "Sản phẩm & Tồn kho", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  warranty: { label: "Bảo hành & Đổi trả", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  payment: { label: "Thanh toán", color: "text-cyan-700", bg: "bg-cyan-50 border-cyan-200" },
  service: { label: "Dịch vụ & Lịch hẹn", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  policy: { label: "Chính sách", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  general: { label: "Chủ đề chung", color: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
};

export function FaqLearningSuggestionsPanel({
  onKnowledgeUpdated,
}: {
  onKnowledgeUpdated?: () => void;
}) {
  const [candidates, setCandidates] = useState<FaqCandidate[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FaqCandidateStatus | "all">("pending");

  // State for editing answer before approve
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnswerText, setEditAnswerText] = useState<string>("");
  const [expandedMessagesId, setExpandedMessagesId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await companyKnowledgeService.listFaqCandidates(filterStatus);
      setCandidates(res.candidates);
      setStats(res.stats);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Không thể tải danh sách đề xuất FAQ.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await companyKnowledgeService.analyzeFaqs();
      toast.success(res.message || `Đã trích xuất ${res.extractedCount} câu hỏi mới!`);
      await loadCandidates();
      onKnowledgeUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi quét và phân tích hội thoại.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApprove = async (candidate: FaqCandidate) => {
    setActionLoadingId(candidate._id);
    try {
      const finalAnswer = editingId === candidate._id ? editAnswerText : candidate.suggestedAnswer;
      const res = await companyKnowledgeService.approveFaqCandidate(candidate._id, finalAnswer);
      toast.success(res.message || "Đã duyệt câu hỏi vào kho tri thức!");
      setEditingId(null);
      await loadCandidates();
      onKnowledgeUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Không thể duyệt câu hỏi.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoadingId(id);
    try {
      await companyKnowledgeService.rejectFaqCandidate(id);
      toast.success("Đã bỏ qua câu hỏi đề xuất.");
      await loadCandidates();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Không thể bỏ qua câu hỏi.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn đề xuất câu hỏi này?")) return;
    setActionLoadingId(id);
    try {
      await companyKnowledgeService.deleteFaqCandidate(id);
      toast.success("Đã xóa đề xuất câu hỏi.");
      await loadCandidates();
      onKnowledgeUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Không thể xóa câu hỏi.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const startEdit = (candidate: FaqCandidate) => {
    setEditingId(candidate._id);
    setEditAnswerText(candidate.suggestedAnswer);
  };

  return (
    <div className="space-y-6">
      {/* Compact Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-650">
            <Sparkles className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Đề xuất Câu hỏi Thường gặp (FAQ)
              <span className="rounded-md bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-700 px-1.5 py-0.5">AI Learning</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tự động học từ tin nhắn khách hàng & câu trả lời tư vấn để bổ sung vào kho tri thức.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? "animate-spin" : ""}`} />
          <span>{analyzing ? "Đang quét..." : "Quét tin nhắn mới"}</span>
        </button>
      </div>

      {/* Filter Tabs & Stats */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5 text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => setFilterStatus("pending")}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all ${
              filterStatus === "pending"
                ? "bg-white text-indigo-650 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            <span>Chờ duyệt</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                filterStatus === "pending"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {stats.pending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("approved")}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all ${
              filterStatus === "approved"
                ? "bg-white text-indigo-650 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            <span>Đã đưa vào Kho</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                filterStatus === "approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {stats.approved}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("rejected")}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 transition-all ${
              filterStatus === "rejected"
                ? "bg-white text-indigo-650 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            <span>Đã bỏ qua</span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
              {stats.rejected}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            className={`rounded-xl px-3.5 py-1.5 transition-all ${
              filterStatus === "all"
                ? "bg-white text-indigo-650 shadow-xs"
                : "hover:text-slate-900"
            }`}
          >
            Tất cả
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Hiển thị <b>{candidates.length}</b> câu hỏi đề xuất
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-xs font-semibold text-slate-500">Đang tải danh sách câu hỏi đề xuất...</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center">
          <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-600 mb-3">
            <Brain className="h-8 w-8" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {filterStatus === "pending"
              ? "Chưa có câu hỏi nào đang chờ duyệt"
              : "Không có câu hỏi nào trong danh mục này"}
          </h3>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Bấm nút <b>"Quét & Khai phá Tin nhắn Mới"</b> ở trên để AI tự động phân tích các đoạn hội thoại thực tế của khách hàng và đề xuất các câu hỏi phổ biến.
          </p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-650 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            Khai phá ngay
          </button>
        </div>
      ) : (
        /* Candidates List */
        <div className="grid gap-4">
          {candidates.map((item) => {
            const cat = CATEGORY_MAP[item.category] || CATEGORY_MAP.general;
            const isEditing = editingId === item._id;
            const isExpanded = expandedMessagesId === item._id;
            const isActionLoading = actionLoadingId === item._id;

            return (
              <div
                key={item._id}
                className={`rounded-3xl border bg-white p-5 shadow-xs transition-all ${
                  item.status === "approved"
                    ? "border-emerald-200 ring-1 ring-emerald-100"
                    : item.status === "rejected"
                    ? "border-slate-200 opacity-60"
                    : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
                }`}
              >
                {/* Card Top: Badges & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${cat.bg} ${cat.color}`}>
                      {cat.label}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                      <Flame className="h-3 w-3 text-amber-500" />
                      {item.frequency} lượt hỏi
                    </span>

                    {item.source === "agent_response" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                        <CheckCircle2 className="h-3 w-3 text-indigo-500" />
                        Học từ Nhân viên thật
                      </span>
                    )}

                    {item.status === "approved" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        <Check className="h-3 w-3" /> Đã lưu vào Kho Tri Thức
                      </span>
                    )}

                    {item.status === "rejected" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                        Đã bỏ qua
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === "pending" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(item)}
                          disabled={isActionLoading}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Duyệt vào Kho Tri Thức</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReject(item._id)}
                          disabled={isActionLoading}
                          className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Bỏ qua</span>
                        </button>
                      </>
                    )}

                    {item.status === "approved" && (
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Sửa câu trả lời</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(item._id)}
                      disabled={isActionLoading}
                      className="rounded-xl p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
                      title="Xóa vĩnh viễn"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Question Title */}
                <div className="mt-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    {item.question}
                  </h3>
                </div>

                {/* Answer Section */}
                <div className="mt-3 rounded-2xl bg-slate-50 p-3.5 border border-slate-150">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
                      Câu trả lời đề xuất:
                    </span>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Edit3 className="h-3 w-3" /> Chỉnh sửa
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editAnswerText}
                        onChange={(e) => setEditAnswerText(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-indigo-300 bg-white p-3 text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Nhập câu trả lời chuẩn xác của doanh nghiệp..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(item)}
                          disabled={isActionLoading}
                          className="rounded-lg bg-indigo-650 px-3.5 py-1 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          Lưu & Duyệt vào Kho
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">
                      {item.suggestedAnswer}
                    </p>
                  )}
                </div>

                {/* Sample Customer Messages Accordion */}
                {item.sampleCustomerMessages && item.sampleCustomerMessages.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedMessagesId(isExpanded ? null : item._id)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-650 transition-colors"
                    >
                      <span>Xem {item.sampleCustomerMessages.length} câu hỏi gốc từ khách hàng</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-1 rounded-xl bg-slate-100/70 p-2.5 text-[11px] text-slate-600 border border-slate-200">
                        {item.sampleCustomerMessages.map((msg, mIdx) => (
                          <div key={mIdx} className="flex items-start gap-1.5">
                            <span className="text-slate-400">•</span>
                            <span className="italic font-mono">"{msg}"</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
