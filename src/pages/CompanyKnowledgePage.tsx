import {
  AlertCircle,
  BookOpenCheck,
  ChevronDown,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  CompanyKnowledgeDocument,
  CompanyKnowledgeHealth,
  KnowledgeChannelScope,
  KnowledgePurposeScope,
  companyKnowledgeService,
} from "../services/companyKnowledgeService";
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

function toggleScope<T extends string>(current: T[], value: T) {
  if (value === "all") return ["all"] as T[];
  const withoutAll = current.filter((item) => item !== "all");
  const next = withoutAll.includes(value)
    ? withoutAll.filter((item) => item !== value)
    : [...withoutAll, value];
  return next.length ? next : (["all"] as T[]);
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

export default function CompanyKnowledgePage() {
  const { userProfile } = useAuth();
  const canManage = Boolean(
    userProfile &&
      ["manager", "admin", "superadmin"].includes(userProfile.role)
  );
  const [health, setHealth] = useState<CompanyKnowledgeHealth | null>(null);
  const [documents, setDocuments] = useState<CompanyKnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [purposeScope, setPurposeScope] = useState<KnowledgePurposeScope[]>([
    "all",
  ]);
  const [channelScope, setChannelScope] = useState<KnowledgeChannelScope[]>([
    "all",
  ]);
  const [editingId, setEditingId] = useState("");
  const [editPurposeScope, setEditPurposeScope] = useState<
    KnowledgePurposeScope[]
  >(["all"]);
  const [editChannelScope, setEditChannelScope] = useState<
    KnowledgeChannelScope[]
  >(["all"]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextHealth, nextDocuments] = await Promise.all([
        companyKnowledgeService.health(),
        companyKnowledgeService.listDocuments(),
      ]);
      setHealth(nextHealth);
      setDocuments(nextDocuments);
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
    setBusy(true);
    try {
      const result = await companyKnowledgeService.syncDrive(
        driveLink.trim(),
        { purposeScope, channelScope }
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
    setBusy(true);
    try {
      const result = await companyKnowledgeService.upload(file, {
        purposeScope,
        channelScope,
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
    setBusy(true);
    try {
      await companyKnowledgeService.updateScopes(documentId, {
        purposeScope: editPurposeScope,
        channelScope: editChannelScope,
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
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-650 disabled:opacity-50"
              title="Làm mới"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </header>

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

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1.35fr] md:items-center">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40">
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
                    PDF, DOCX, XLSX, TXT, CSV · tối đa 10 MB
                  </span>
                </span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                    event.target.value = "";
                  }}
                />
              </label>

              <span className="text-center text-[11px] font-semibold uppercase text-slate-400">
                hoặc
              </span>

              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Link2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={driveLink}
                    onChange={(event) => setDriveLink(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void syncDrive();
                    }}
                    placeholder="Dán link Google Drive, Doc hoặc Sheet"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void syncDrive()}
                  disabled={busy}
                  className="rounded-xl bg-blue-650 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Nhập
                </button>
              </div>
            </div>

            <details className="mt-4 border-t border-slate-100 pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
                <ChevronDown className="h-4 w-4" />
                Tùy chọn phạm vi sử dụng
              </summary>
              <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
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
              </div>
            </details>
          </section>
        )}

        {(health?.warnings || []).length > 0 && (
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
      </div>
    </div>
  );
}
