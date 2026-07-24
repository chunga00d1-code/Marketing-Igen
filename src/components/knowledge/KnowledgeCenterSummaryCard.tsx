import { ArrowRight, BookOpenCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  CompanyKnowledgeHealth,
  companyKnowledgeService,
} from "../../services/companyKnowledgeService";
import { navigateToKnowledgeCenter } from "../../utils/knowledgeNavigation";

export function KnowledgeCenterSummaryCard({
  health: providedHealth,
  compact = false,
}: {
  health?: CompanyKnowledgeHealth | null;
  compact?: boolean;
}) {
  const [health, setHealth] = useState<CompanyKnowledgeHealth | null>(
    providedHealth || null
  );
  const [loading, setLoading] = useState(!providedHealth);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await companyKnowledgeService.health());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (providedHealth) {
      setHealth(providedHealth);
      setLoading(false);
      return;
    }
    void loadHealth();
  }, [loadHealth, providedHealth]);

  return (
    <div
      className={`rounded-2xl border border-indigo-100 bg-indigo-50/60 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white p-2 text-indigo-650 shadow-xs">
          <BookOpenCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800">
            Kho tri thức doanh nghiệp
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Nguồn dữ liệu dùng chung cho Sale, Reply AI, Marketing và Caption.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
            <span className="rounded-full bg-white px-2 py-1 text-slate-600">
              {loading ? "..." : health?.documentsCount || 0} tài liệu
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-slate-600">
              {loading ? "..." : health?.chunksCount || 0} khối tri thức
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadHealth()}
          disabled={loading}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-650 disabled:opacity-50"
          title="Làm mới trạng thái"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <button
        type="button"
        onClick={navigateToKnowledgeCenter}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-650 px-3 py-2.5 text-[10px] font-bold text-white hover:bg-indigo-700"
      >
        Đi tới Kho tri thức
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
