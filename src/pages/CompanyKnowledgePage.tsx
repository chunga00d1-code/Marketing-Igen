import {
  AlertCircle,
  AlertTriangle,
  BookOpenCheck,
  Bot,
  ChevronDown,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { FaqLearningSuggestionsPanel } from "../components/knowledge/FaqLearningSuggestionsPanel";
import {
  CompanyKnowledgeDocument,
  CompanyKnowledgeHealth,
  FaqCandidatesResponse,
  KnowledgeChannelScope,
  KnowledgeDocumentType,
  KnowledgePageScope,
  KnowledgePurposeScope,
  TestSearchResult,
  companyKnowledgeService,
} from "../services/companyKnowledgeService";
import {
  SocialIntegration,
  socialIntegrationService,
} from "../services/socialIntegrationService";
import { toast } from "./Toast";

const PURPOSES: Array<{
  id: KnowledgePurposeScope;
  label: string;
}> = [
  { id: "all", label: "Toàn hệ thống" },
  { id: "sales", label: "Sale" },
  { id: "support", label: "Chăm sóc khách hàng" },
  { id: "marketing", label: "Marketing" },
  { id: "caption", label: "Caption video" },
];

const CHANNELS: Array<{
  id: KnowledgeChannelScope;
  label: string;
}> = [
  { id: "all", label: "Mọi kênh" },
  { id: "facebook", label: "Facebook" },
  { id: "zalo", label: "Zalo" },
  { id: "tiktok", label: "TikTok" },
];

const DOCUMENT_TYPES: Array<{ id: KnowledgeDocumentType; label: string }> = [
  { id: "general", label: "Tự động nhận diện / tài liệu chung" },
  { id: "company_profile", label: "Thông tin công ty" },
  { id: "product", label: "Sản phẩm" },
  { id: "service", label: "Dịch vụ" },
  { id: "pricing", label: "Bảng giá" },
  { id: "promotion", label: "Khuyến mãi / Ưu đãi" },
  { id: "policy", label: "Chính sách" },
  { id: "faq", label: "Câu hỏi thường gặp" },
  { id: "brand_guideline", label: "Nhận diện thương hiệu" },
];

function toggleScope<T extends string>(current: T[], value: T) {
  if (value === "all") return ["all"] as T[];
  const withoutAll = current.filter((item) => item !== "all");
  const next = withoutAll.includes(value)
    ? withoutAll.filter((item) => item !== value)
    : [...withoutAll, value];
  return next.length ? next : (["all"] as T[]);
}

function getShortDriveLink(value: string) {
  const link = value.trim();
  if (link.length <= 52) return link;

  try {
    const url = new URL(link);
    const folderId = url.pathname.match(/\/folders\/([^/]+)/)?.[1];
    if (folderId) {
      return `${url.hostname}/folders/${folderId.slice(0, 12)}…`;
    }
    return `${url.hostname}${url.pathname.slice(0, 28)}…`;
  } catch {
    return `${link.slice(0, 48)}…`;
  }
}

function ScopePicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold text-slate-700">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(toggleScope(value, option.id))}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-blue-200"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PageScopePicker({
  pages,
  pageScope,
  pageIds,
  onScopeChange,
  onPageIdsChange,
}: {
  pages: SocialIntegration[];
  pageScope: KnowledgePageScope;
  pageIds: string[];
  onScopeChange: (scope: KnowledgePageScope) => void;
  onPageIdsChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="md:col-span-2">
      <legend className="mb-2 text-xs font-semibold text-slate-700">
        Facebook Page sử dụng tài liệu
      </legend>
      <div className="flex flex-wrap gap-2">
        {([
          ["all", "Đồng bộ cho mọi Page"],
          ["selected", "Chỉ Page được chọn"],
        ] as const).map(([scope, label]) => (
          <button
            key={scope}
            type="button"
            onClick={() => {
              onScopeChange(scope);
              if (scope === "all") onPageIdsChange([]);
            }}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${
              pageScope === scope
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {pageScope === "selected" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {pages.length === 0 ? (
            <p className="text-xs text-amber-600">
              Chưa có Facebook Page nào đang kết nối.
            </p>
          ) : pages.map((page) => {
            const pageId = page.username || "";
            return (
              <label key={page._id || pageId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={pageIds.includes(pageId)}
                  onChange={() => onPageIdsChange(
                    pageIds.includes(pageId)
                      ? pageIds.filter((id) => id !== pageId)
                      : [...pageIds, pageId]
                  )}
                />
                <span className="truncate">{page.displayName}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export default function CompanyKnowledgePage() {
  const { userProfile } = useAuth();
  const canManage = Boolean(
    userProfile &&
      ["manager", "admin", "superadmin"].includes(userProfile.role)
  );
  const [health, setHealth] = useState<CompanyKnowledgeHealth | null>(null);
  const [documents, setDocuments] = useState<CompanyKnowledgeDocument[]>([]);
  const [facebookPages, setFacebookPages] = useState<SocialIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [importMethod, setImportMethod] = useState<"file" | "drive">("file");
  const [driveLink, setDriveLink] = useState("");
  const [isDriveLinkFocused, setIsDriveLinkFocused] = useState(false);
  const [purposeScope, setPurposeScope] = useState<KnowledgePurposeScope[]>([
    "all",
  ]);
  const [channelScope, setChannelScope] = useState<KnowledgeChannelScope[]>([
    "all",
  ]);
  const [pageScope, setPageScope] = useState<KnowledgePageScope>("all");
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [documentType, setDocumentType] = useState<KnowledgeDocumentType>("general");
  const [editingId, setEditingId] = useState("");
  const [editPurposeScope, setEditPurposeScope] = useState<
    KnowledgePurposeScope[]
  >(["all"]);
  const [editChannelScope, setEditChannelScope] = useState<
    KnowledgeChannelScope[]
  >(["all"]);
  const [editPageScope, setEditPageScope] = useState<KnowledgePageScope>("all");
  const [editPageIds, setEditPageIds] = useState<string[]>([]);
  const [editDocumentType, setEditDocumentType] = useState<KnowledgeDocumentType>("general");

  const [activeSection, setActiveSection] = useState<"documents" | "faq_learning" | "test_search">("documents");
  const [pendingFaqCount, setPendingFaqCount] = useState(0);

  // State cho RAG Search Simulator
  const [testQuery, setTestQuery] = useState("");
  const [testingSearch, setTestingSearch] = useState(false);
  const [testResult, setTestResult] = useState<TestSearchResult | null>(null);
  const [showMatchedChunks, setShowMatchedChunks] = useState(false);

  async function handleTestSearch() {
    if (!testQuery.trim()) {
      toast.error("Vui lòng nhập câu hỏi để thử nghiệm.");
      return;
    }
    setTestingSearch(true);
    try {
      const result = await companyKnowledgeService.testSearch(testQuery.trim());
      setTestResult(result);
      if (result.matches === 0) {
        toast.info("Không tìm thấy khối tri thức nào khớp với câu hỏi này.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thử nghiệm tìm kiếm thất bại.");
    } finally {
      setTestingSearch(false);
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextHealth, nextDocuments, integrations, faqRes] = await Promise.all([
        companyKnowledgeService.health(),
        companyKnowledgeService.listDocuments(),
        socialIntegrationService.getIntegrations("Facebook").catch(() => []),
        companyKnowledgeService.listFaqCandidates("pending").catch(() => ({ stats: { pending: 0 } })),
      ]);
      setHealth(nextHealth);
      setDocuments(nextDocuments);
      setFacebookPages(integrations.filter((item) => item.isConnected && item.username));
      setPendingFaqCount((faqRes as FaqCandidatesResponse)?.stats?.pending || 0);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể tải kho tri thức doanh nghiệp."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter((document) =>
      [document.title, document.sourceType, ...document.purposeScope]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [documents, query]);

  async function syncDrive() {
    if (!driveLink.trim()) {
      toast.error("Hãy nhập link Google Drive, Doc hoặc Sheet công khai.");
      return;
    }
    if (pageScope === "selected" && pageIds.length === 0) {
      toast.error("Hãy chọn ít nhất một Facebook Page.");
      return;
    }
    setBusy(true);
    try {
      const result = await companyKnowledgeService.syncDrive(
        driveLink.trim(),
        { purposeScope, channelScope, pageScope, pageIds, documentType }
      );
      toast.success(
        `Đã nhập ${result.documentsCount || 1} tài liệu vào kho tri thức.`
      );
      setDriveLink("");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Đồng bộ thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Tài liệu vượt quá giới hạn 10 MB.");
      return;
    }
    if (pageScope === "selected" && pageIds.length === 0) {
      toast.error("Hãy chọn ít nhất một Facebook Page.");
      return;
    }
    setBusy(true);
    try {
      const result = await companyKnowledgeService.upload(file, {
        purposeScope,
        channelScope,
        pageScope,
        pageIds,
        documentType,
      });
      toast.success(`Đã nhập ${result.title} vào kho tri thức.`);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Tải tài liệu thất bại."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveScopes(documentId: string) {
    if (editPageScope === "selected" && editPageIds.length === 0) {
      toast.error("Hãy chọn ít nhất một Facebook Page.");
      return;
    }
    setBusy(true);
    try {
      await companyKnowledgeService.updateScopes(documentId, {
        purposeScope: editPurposeScope,
        channelScope: editChannelScope,
        pageScope: editPageScope,
        pageIds: editPageIds,
        documentType: editDocumentType,
      });
      setEditingId("");
      toast.success("Đã cập nhật phạm vi sử dụng.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cập nhật thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(document: CompanyKnowledgeDocument) {
    if (!window.confirm(`Xóa tài liệu “${document.title}”?`)) return;
    setBusy(true);
    try {
      const result = await companyKnowledgeService.deleteDocument(document.id);
      toast.success(result.message);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Xóa tài liệu thất bại."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    const confirmed = window.confirm(
      "⚠️ CẢNH BÁO NGUY HIỂM:\n\nBạn có chắc chắn muốn XÓA TOÀN BỘ KHO TRI THỨC của doanh nghiệp này?\n\nToàn bộ tài liệu, bảng giá, chính sách và dữ liệu AI tự học sẽ bị xóa vĩnh viễn và không thể khôi phục."
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await companyKnowledgeService.clearAll();
      toast.success(res.message || "Đã xóa toàn bộ kho tri thức thành công.");
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể xóa kho tri thức."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-8 pr-2">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-650">
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Kho tri thức
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Nhập tài liệu một lần để Sale, Reply AI, Marketing và Caption
                cùng sử dụng.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <strong className="text-slate-900">
                {health?.documentsCount || 0}
              </strong>{" "}
              tài liệu
            </span>
            {canManage && (health?.documentsCount || 0) > 0 && (
              <button
                type="button"
                onClick={() => void handleClearAll()}
                disabled={busy || loading}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 cursor-pointer transition-colors"
                title="Xóa toàn bộ kho tri thức của doanh nghiệp"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                <span>Xóa toàn bộ tri thức</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-650 disabled:opacity-50 cursor-pointer"
              title="Làm mới"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </header>

        {/* Sub-Navigation Tabs */}
        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveSection("documents")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeSection === "documents"
                ? "bg-indigo-650 text-white shadow-md shadow-indigo-650/20"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <BookOpenCheck className="h-4 w-4" />
            <span>Tài liệu & Tệp Kho Tri Thức</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeSection === "documents"
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {health?.documentsCount || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("faq_learning")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeSection === "faq_learning"
                ? "bg-indigo-650 text-white shadow-md shadow-indigo-650/20"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Sparkles
              className={`h-4 w-4 ${
                activeSection === "faq_learning"
                  ? "text-amber-300"
                  : "text-amber-500"
              }`}
            />
            <span>Đề xuất FAQ từ Hội thoại</span>
            {pendingFaqCount > 0 ? (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900 animate-pulse">
                {pendingFaqCount} mới
              </span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeSection === "faq_learning"
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                AI Learning
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("test_search")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
              activeSection === "test_search"
                ? "bg-indigo-650 text-white shadow-md shadow-indigo-650/20"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Search className="h-4 w-4" />
            <span>Thử nghiệm Tìm kiếm (RAG)</span>
          </button>
        </div>

        {activeSection === "faq_learning" && (
          <div className="mt-5">
            <FaqLearningSuggestionsPanel onKnowledgeUpdated={() => void loadData()} />
          </div>
        )}

        {activeSection === "test_search" && (
          <div className="mt-5 space-y-5">
            {/* RAG Search Simulator Component */}
            <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/40 p-5 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Thử nghiệm tìm kiếm tri thức (RAG Search Simulator)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Gõ thử câu hỏi của khách hàng để kiểm tra AI có tìm đúng tài liệu và trả lời chuẩn không
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-2.5 h-4 w-4 text-indigo-400" />
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !testingSearch) {
                        void handleTestSearch();
                      }
                    }}
                    placeholder="Ví dụ: Áo polo giá bao nhiêu, ship về Hà Nội mất mấy ngày, có bảo hành ko?..."
                    className="w-full rounded-xl border border-indigo-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleTestSearch()}
                  disabled={testingSearch || !testQuery.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {testingSearch ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Kiểm tra
                </button>
              </div>

              {testResult && (
                <div className="mt-4 space-y-3 rounded-xl border border-indigo-100 bg-white p-4 text-xs shadow-xs">
                  {/* Intent & Match Stats */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-700">Intent nhận diện:</span>
                      {testResult.detectedDocumentTypes?.length > 0 ? (
                        testResult.detectedDocumentTypes.map((type) => (
                          <span
                            key={type}
                            className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200"
                          >
                            {DOCUMENT_TYPES.find((t) => t.id === type)?.label || type}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          Toàn bộ kho tri thức
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      <span>
                        Khớp: <strong className="text-indigo-600 font-bold">{testResult.matches} khối</strong>
                      </span>
                      <span>
                        Điểm cao nhất: <strong className="text-emerald-600 font-bold">{(testResult.bestScore || 0).toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Simulated Answer */}
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1.5">
                      <Bot className="h-3.5 w-3.5 text-indigo-600" />
                      Câu trả lời mẫu AI sẽ gửi cho khách:
                    </div>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-line">
                      {testResult.simulatedAnswer || "(Chưa có câu trả lời)"}
                    </div>
                  </div>

                  {/* Matched Chunks Breakdown */}
                  {testResult.items?.length > 0 && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowMatchedChunks(!showMatchedChunks)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${showMatchedChunks ? "rotate-180" : ""}`}
                        />
                        {showMatchedChunks ? "Ẩn các đoạn tri thức đã trích xuất" : `Xem ${testResult.items.length} đoạn tri thức đã trích xuất`}
                      </button>

                      {showMatchedChunks && (
                        <div className="mt-2 space-y-2">
                          {testResult.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] leading-relaxed"
                            >
                              <div className="flex items-center justify-between gap-2 font-semibold text-slate-700 mb-1">
                                <span className="truncate">
                                  #{idx + 1} · {item.title} ({item.documentType})
                                </span>
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                  Score: {item.score.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-slate-600 whitespace-pre-line font-mono text-[10px]">
                                {item.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {activeSection === "documents" && (
          <>
            {!canManage && (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                <ShieldCheck className="h-4 w-4 text-blue-650" />
                Bạn đang ở chế độ xem. Manager hoặc Admin có thể nhập và quản lý
                tài liệu.
              </div>
            )}

        {canManage && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Nhập tài liệu
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Chọn một trong hai cách dưới đây. Mặc định tài liệu dùng cho
                toàn hệ thống.
              </p>
            </div>

            <div className="mt-4">
              <div className="grid max-w-md grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-1.5">
                <button
                  type="button"
                  onClick={() => setImportMethod("file")}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition select-none ${
                    importMethod === "file"
                      ? "bg-[#0284c7] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
                  }`}
                >
                  <Upload className={`h-4 w-4 ${importMethod === "file" ? "text-white" : "text-slate-500"}`} />
                  Tải file
                </button>
                <button
                  type="button"
                  onClick={() => setImportMethod("drive")}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition select-none ${
                    importMethod === "drive"
                      ? "bg-[#0284c7] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
                  }`}
                >
                  <Link2 className={`h-4 w-4 ${importMethod === "drive" ? "text-white" : "text-slate-500"}`} />
                  Google Drive
                </button>
              </div>

              {importMethod === "file" ? (
                <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-4 hover:border-blue-400 hover:bg-blue-50">
                  {busy ? (
                    <LoaderCircle className="h-5 w-5 animate-spin text-blue-650" />
                  ) : (
                    <Upload className="h-5 w-5 text-blue-650" />
                  )}
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">
                      Chọn file từ máy
                    </span>
                    <span className="text-[11px] text-slate-500">
                      PDF, DOCX, XLSX, TXT, CSV, PNG, JPG, WEBP · tối đa 10 MB
                    </span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              ) : (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-xs font-semibold text-slate-700">
                    Link Google Drive, Google Doc hoặc Google Sheet
                    <div className="mt-2 flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Link2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          value={
                            isDriveLinkFocused
                              ? driveLink
                              : getShortDriveLink(driveLink)
                          }
                          onChange={(event) => setDriveLink(event.target.value)}
                          onFocus={() => setIsDriveLinkFocused(true)}
                          onBlur={() => setIsDriveLinkFocused(false)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void syncDrive();
                          }}
                          placeholder="Dán link chia sẻ công khai"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void syncDrive()}
                        disabled={busy || !driveLink.trim()}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:border disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:opacity-100"
                      >
                        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {busy ? "Đang nhập..." : "Nhập"}
                      </button>
                    </div>
                  </label>
                  <p className="mt-2 text-[11px] leading-4 text-slate-500">
                    Drive phải bật quyền “Bất kỳ ai có liên kết đều có thể xem”.
                  </p>
                </div>
              )}
            </div>

            <details className="mt-4 border-t border-slate-100 pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
                <ChevronDown className="h-4 w-4" />
                Tùy chọn phạm vi sử dụng
              </summary>
              <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">
                  Loại tài liệu
                  <select
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value as KnowledgeDocumentType)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <ScopePicker
                  label="Nghiệp vụ"
                  options={PURPOSES}
                  value={purposeScope}
                  onChange={setPurposeScope}
                />
                <ScopePicker
                  label="Kênh"
                  options={CHANNELS}
                  value={channelScope}
                  onChange={setChannelScope}
                />
                <PageScopePicker
                  pages={facebookPages}
                  pageScope={pageScope}
                  pageIds={pageIds}
                  onScopeChange={setPageScope}
                  onPageIdsChange={setPageIds}
                />
              </div>
            </details>

          </section>
        )}

        {(health?.conflicts || []).length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-xs">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Phát hiện {health?.conflicts?.length} mâu thuẫn dữ liệu cần đối soát giữa các tài liệu:</span>
            </div>
            <div className="mt-3 space-y-2">
              {health?.conflicts?.map((conflict) => (
                <div
                  key={conflict.id}
                  className="rounded-xl border border-rose-100 bg-white p-3 text-xs shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-rose-700">{conflict.title}</span>
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 uppercase tracking-wider">
                      {conflict.type === "pricing"
                        ? "Lệch giá"
                        : conflict.type === "contact"
                          ? "Lệch Hotline"
                          : conflict.type === "policy"
                            ? "Lệch Chính sách"
                            : "Trùng lặp"}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    {conflict.description}
                  </p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100">
                    <div className="rounded bg-slate-50 p-1.5">
                      <span className="font-semibold text-slate-700">Tài liệu A: </span>
                      <span className="text-slate-600">{conflict.documentA.title}</span>
                      <div className="font-mono text-rose-600 font-bold mt-0.5">↳ {conflict.conflictingValues.a}</div>
                    </div>
                    <div className="rounded bg-slate-50 p-1.5">
                      <span className="font-semibold text-slate-700">Tài liệu B: </span>
                      <span className="text-slate-600">{conflict.documentB.title}</span>
                      <div className="font-mono text-rose-600 font-bold mt-0.5">↳ {conflict.conflictingValues.b}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(health?.warnings || []).length > 0 && !(health?.conflicts || []).length && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {health?.warnings[0]}
          </div>
        )}

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Tài liệu đã nhập
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {health?.chunksCount || 0} khối tri thức đang được sử dụng
              </p>
            </div>
            {documents.length > 5 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm tài liệu..."
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-400"
                />
              </div>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="flex justify-center p-10">
                <LoaderCircle className="h-6 w-6 animate-spin text-blue-650" />
              </div>
            ) : visibleDocuments.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Chưa có tài liệu
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Nhập một file hoặc liên kết Drive để bắt đầu.
                </p>
              </div>
            ) : (
              visibleDocuments.map((document) => (
                <article key={document.id}>
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-lg bg-slate-100 p-2 text-slate-500">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-800">
                          {document.title}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {document.sourceType === "google_doc"
                            ? "Google Drive"
                            : "Tệp tải lên"}{" "}
                          · v{document.version} · {document.chunksCount} khối
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-blue-650">
                          {DOCUMENT_TYPES.find((type) => type.id === document.documentType)?.label || "Tài liệu chung"}
                          {" · "}
                          {document.pageScope === "selected"
                            ? `${document.pageIds.length} Facebook Page`
                            : "Mọi Facebook Page"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {document.sourceUrl?.startsWith("http") && (
                        <a
                          href={document.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-650"
                          title="Mở nguồn"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(
                                editingId === document.id ? "" : document.id
                              );
                              setEditPurposeScope(document.purposeScope);
                              setEditChannelScope(document.channelScope);
                              setEditPageScope(document.pageScope || "all");
                              setEditPageIds(document.pageIds || []);
                              setEditDocumentType(document.documentType || "general");
                            }}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-650"
                            title="Phạm vi sử dụng"
                          >
                            <Settings2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteDocument(document)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            title="Xóa tài liệu"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editingId === document.id && (
                    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-700">
                          Loại tài liệu
                          <select
                            value={editDocumentType}
                            onChange={(event) => setEditDocumentType(event.target.value as KnowledgeDocumentType)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"
                          >
                            {DOCUMENT_TYPES.map((type) => (
                              <option key={type.id} value={type.id}>{type.label}</option>
                            ))}
                          </select>
                        </label>
                        <ScopePicker
                          label="Nghiệp vụ"
                          options={PURPOSES}
                          value={editPurposeScope}
                          onChange={setEditPurposeScope}
                        />
                        <ScopePicker
                          label="Kênh"
                          options={CHANNELS}
                          value={editChannelScope}
                          onChange={setEditChannelScope}
                        />
                        <PageScopePicker
                          pages={facebookPages}
                          pageScope={editPageScope}
                          pageIds={editPageIds}
                          onScopeChange={setEditPageScope}
                          onPageIdsChange={setEditPageIds}
                        />
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId("")}
                          className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveScopes(document.id)}
                          className="rounded-lg bg-blue-650 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          Lưu
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
          </>
        )}
      </div>
    </div>
  );
}
