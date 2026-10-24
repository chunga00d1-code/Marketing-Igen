/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Download,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Percent,
  CheckCircle,
  Heart,
  Activity,
  Layers,
  Sparkles,
  Megaphone,
  Target,
  ChevronLeft,
  ChevronRight,
  Info,
  Clock3,
  FileText,
  Plus,
} from "lucide-react";
import {
  marketingAnalyticsService,
  AnalyticsResponse,
} from "../../services/marketingAnalyticsService";
import { toast } from "../../pages/Toast";
import ReportFilterControls from "./ReportFilterControls";

const COLORS = ["#00adfc", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#ec4899"];
const PILLAR_CHART_LIMIT = 6;

function normalizePillarName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatPillarLabel(value: string): string {
  const label = normalizePillarName(value);
  return label.length > 20 ? `${label.slice(0, 20).trim()}...` : label;
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
  progress,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  tone: string;
  progress?: number;
}) {
  const isPink = tone.includes("pink") || tone.includes("rose");
  const isViolet = tone.includes("purple") || tone.includes("indigo") || tone.includes("violet");
  const isEmerald = tone.includes("emerald") || tone.includes("teal") || tone.includes("green");
  const isSky = tone.includes("blue") || tone.includes("cyan") || tone.includes("sky");
  const isAmber = tone.includes("amber") || tone.includes("orange");

  let surface = "border-slate-100 from-slate-50 via-white to-slate-50";
  let iconBg = "bg-slate-100 text-slate-500";
  let labelColor = "text-slate-600";
  let decorativeBar = "bg-slate-200";
  let progressBg = "bg-slate-100";
  let progressBar = "bg-slate-400";

  if (isPink) {
    surface = "border-pink-100 from-pink-50 via-white to-rose-50/60";
    iconBg = "bg-pink-100 text-pink-600";
    labelColor = "text-pink-700";
    decorativeBar = "bg-pink-200/70";
    progressBg = "bg-pink-100";
    progressBar = "bg-pink-400";
  } else if (isViolet) {
    surface = "border-violet-100 from-violet-50 via-white to-purple-50/60";
    iconBg = "bg-violet-100 text-violet-600";
    labelColor = "text-violet-700";
    decorativeBar = "bg-violet-200/70";
    progressBg = "bg-violet-100";
    progressBar = "bg-violet-400";
  } else if (isEmerald) {
    surface = "border-emerald-100 from-emerald-50 via-white to-teal-50/60";
    iconBg = "bg-emerald-100 text-emerald-600";
    labelColor = "text-emerald-700";
    decorativeBar = "bg-emerald-200/70";
    progressBg = "bg-emerald-100";
    progressBar = "bg-emerald-400";
  } else if (isSky) {
    surface = "border-sky-100 from-sky-50 via-white to-blue-50/60";
    iconBg = "bg-sky-100 text-sky-600";
    labelColor = "text-sky-700";
    decorativeBar = "bg-sky-200/70";
    progressBg = "bg-sky-100";
    progressBar = "bg-sky-400";
  } else if (isAmber) {
    surface = "border-orange-100 from-orange-50 via-white to-amber-50/60";
    iconBg = "bg-orange-100 text-orange-600";
    labelColor = "text-orange-700";
    decorativeBar = "bg-orange-200/70";
    progressBg = "bg-orange-100";
    progressBar = "bg-orange-400";
  }

  return (
    <div className={`relative flex min-h-[164px] min-w-0 flex-col justify-between overflow-hidden rounded-[20px] border bg-gradient-to-br p-4 shadow-[0_6px_24px_rgba(31,96,160,0.035)] ${surface}`}>
      <div className="relative z-10 flex items-start gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className={`pt-1 text-[11px] font-normal leading-snug ${labelColor}`}>{title}</span>
      </div>
      <div className="pointer-events-none absolute right-4 top-14 flex h-12 items-end gap-1 opacity-70" aria-hidden="true">
        {["h-3", "h-5", "h-7", "h-10"].map((height) => <span key={height} className={`w-2.5 rounded-t ${height} ${decorativeBar}`} />)}
      </div>
      <div className="relative z-10 mt-3">
        <h4 className="text-[28px] font-normal leading-none tracking-tight text-slate-900">{value}</h4>
        <div className={`mt-3 h-1.5 w-full overflow-hidden rounded-full ${progressBg}`}>
          <div className={`h-full rounded-full transition-all duration-500 ${progressBar}`} style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-slate-500">
          <span className="truncate">{description}</span>
          {progress !== undefined && <span className="shrink-0">{Math.round(progress)}%</span>}
        </div>
      </div>
    </div>
  );
}

function ReportEmptyState({ kind, children }: { kind: "trend" | "platform" | "pillar" | "errors"; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-4 text-center text-sm text-slate-500">
      {kind === "trend" && (
        <div className="relative flex h-24 items-end gap-1.5 text-sky-200" aria-hidden="true">
          <span className="h-6 w-5 rounded-t bg-sky-100" /><span className="h-10 w-5 rounded-t bg-sky-100" />
          <span className="h-15 w-5 rounded-t bg-sky-200" /><span className="h-20 w-5 rounded-t bg-sky-200" />
          <span className="absolute -bottom-1 -right-11 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-sky-100 text-white"><Clock3 size={28} /></span>
        </div>
      )}
      {kind === "platform" && (
        <div className="relative h-32 w-32" aria-hidden="true">
          <div className="h-30 w-30 rounded-full [background:conic-gradient(#bfdbfe_0_27%,#e0f2fe_27%_100%)]" />
          <div className="absolute left-[26px] top-[26px] h-[68px] w-[68px] rounded-full bg-white" />
          <div className="absolute -bottom-1 -right-2 flex h-14 w-14 items-center justify-center rounded-xl border-4 border-white bg-sky-50 text-sky-300 shadow-sm"><FileText size={27} /></div>
        </div>
      )}
      {kind === "pillar" && (
        <div className="relative flex h-28 w-36 items-center justify-center" aria-hidden="true">
          <span className="absolute left-0 top-12 h-4 w-4 rounded-full bg-sky-100" /><span className="absolute right-0 top-5 h-5 w-5 rounded-full bg-sky-100" />
          <div className="flex h-24 w-20 flex-col gap-2 rounded-xl bg-sky-50 p-4 shadow-sm"><span className="h-2 rounded-full bg-sky-200" /><span className="h-2 rounded-full bg-sky-200" /><span className="h-2 w-3/4 rounded-full bg-sky-200" /></div>
          <span className="absolute bottom-0 right-3 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-sky-500 text-white"><Plus size={25} /></span>
        </div>
      )}
      {kind === "errors" && (
        <div className="relative flex h-28 w-36 items-center justify-center" aria-hidden="true">
          <span className="absolute left-1 top-12 h-4 w-4 rounded-full bg-pink-100" /><span className="absolute right-0 top-4 h-5 w-5 rounded-full bg-pink-100" />
          <div className="flex h-24 w-20 flex-col gap-2 rounded-xl bg-slate-100 p-4 shadow-sm"><span className="h-2 rounded-full bg-slate-200" /><span className="h-2 rounded-full bg-slate-200" /><span className="h-2 w-3/4 rounded-full bg-slate-200" /></div>
          <span className="absolute bottom-0 right-3 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-pink-500 text-white"><AlertTriangle size={21} /></span>
        </div>
      )}
      <p className="max-w-sm leading-relaxed">{children}</p>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const pillarChartData = useMemo(
    () => data
      ? [...data.byPillar].sort((left, right) => right.total - left.total).slice(0, PILLAR_CHART_LIMIT)
      : [],
    [data]
  );
  
  // States bộ lọc
  const [campaignId, setCampaignId] = useState("");
  const [platform, setPlatform] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Tab switcher cho biểu đồ xu hướng chính
  const [activeChartTab, setActiveChartTab] = useState<"posts" | "engagement">("posts");

  // Phân trang danh sách bài viết
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await marketingAnalyticsService.getAnalytics({
        campaignId: campaignId || undefined,
        platform: platform || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setData(res);
      setCurrentPage(1);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Không thể tải báo cáo marketing.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, platform, startDate, endDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExportExcel = async () => {
    if (!data) return;

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // 1. Tab Tổng quan
      const overviewRows = [
        { Chỉ_số: "Tổng số bài viết đã lên lịch", Giá_trị: data.overview.totalSlots },
        { Chỉ_số: "Đã đăng thành công", Giá_trị: data.overview.publishedSlots },
        { Chỉ_số: "Đăng thất bại", Giá_trị: data.overview.failedSlots },
        { Chỉ_số: "Đang chờ duyệt/xử lý", Giá_trị: data.overview.pendingApprovalSlots },
        { Chỉ_số: "Tỷ lệ thành công (%)", Giá_trị: `${data.overview.successRate}%` },
        { Chỉ_số: "Tổng chi phí AI (USD)", Giá_trị: data.overview.totalAiCost },
        { Chỉ_số: "Lần thử lại trung bình / bài", Giá_trị: data.overview.avgAttemptCount },
        { Chỉ_số: "Tổng lượt Reach", Giá_trị: data.platformMetrics.totalReach },
        { Chỉ_số: "Tổng lượt Impressions", Giá_trị: data.platformMetrics.totalImpressions },
        { Chỉ_số: "Tổng lượt click", Giá_trị: data.platformMetrics.totalClicks },
        { Chỉ_số: "Tổng lượt thích", Giá_trị: data.platformMetrics.totalLikes },
        { Chỉ_số: "Tổng bình luận", Giá_trị: data.platformMetrics.totalComments },
        { Chỉ_số: "Tổng lượt chia sẻ", Giá_trị: data.platformMetrics.totalShares },
        { Chỉ_số: "Tương tác TB / bài đăng", Giá_trị: data.platformMetrics.avgEngagementPerPost },
      ];
      const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
      XLSX.utils.book_append_sheet(wb, wsOverview, "Tổng quan");

      // 2. Tab Hiệu suất theo ngày
      const dateRows = data.byDate.map((item) => ({
        Ngày: item.date,
        "Số bài kế hoạch": item.planned,
        "Số bài đã đăng": item.published,
        "Số bài thất bại": item.failed,
        "Lượt thích": item.likes,
        "Lượt xem": item.views,
      }));
      const wsDate = XLSX.utils.json_to_sheet(dateRows);
      XLSX.utils.book_append_sheet(wb, wsDate, "Hiệu suất theo ngày");

      // 3. Tab Phân phối theo Pillar
      const pillarRows = data.byPillar.map((item) => ({
        "Content Pillar": item.pillar,
        "Tổng số bài": item.total,
        "Đã đăng thành công": item.published,
        "Chi phí AI trung bình (USD)": item.avgCost,
        "Lượt thích": item.likes,
        "Lượt xem": item.views,
      }));
      const wsPillar = XLSX.utils.json_to_sheet(pillarRows);
      XLSX.utils.book_append_sheet(wb, wsPillar, "Theo Content Pillar");

      // 4. Tab Lịch sử lỗi
      const errorRows = data.topErrors.map((item) => ({
        "Loại lỗi": item.errorType,
        "Chi tiết thông báo": item.message,
        "Số lần xuất hiện": item.count,
      }));
      const wsErrors = XLSX.utils.json_to_sheet(errorRows);
      XLSX.utils.book_append_sheet(wb, wsErrors, "Lịch sử lỗi");

      // Viết file
      XLSX.writeFile(wb, `Báo_cáo_kênh_marketing_${Date.now()}.xlsx`);
      toast.success("Đã xuất file báo cáo Excel thành công.");
    } catch (err: any) {
      console.error(err);
      toast.error("Không thể xuất file Excel: " + err.message);
    }
  };

  const clearFilters = () => {
    setCampaignId("");
    setPlatform("");
    setStartDate("");
    setEndDate("");
  };

  const hasActiveFilters = Boolean(campaignId || platform || startDate || endDate);
  const reportInsight = !data || !data.overview
    ? null
    : data.overview.totalSlots === 0
      ? {
          title: "Chưa có bài viết trong phạm vi đang xem",
          detail: hasActiveFilters
            ? "Hãy mở rộng thời gian hoặc đặt lại bộ lọc để kiểm tra dữ liệu của các chiến dịch khác."
            : "Khi chiến dịch có bài viết, bạn sẽ thấy tiến độ đăng tải, hiệu quả từng nền tảng và tương tác tại đây.",
        }
      : data.overview.failedSlots > 0
        ? {
            title: `${data.overview.failedSlots} bài đăng thất bại cần kiểm tra`,
            detail: "Xem mục lỗi đăng tải và chi tiết từng bài để xác định nguyên nhân trước khi tiếp tục theo dõi hiệu suất.",
          }
        : data.overview.publishedSlots === 0
          ? {
              title: `${data.overview.totalSlots} bài viết chưa có lượt xuất bản thành công`,
              detail: "Số liệu tiếp cận, tương tác và phân bổ nền tảng sẽ xuất hiện sau khi bài viết được đăng thành công.",
            }
          : {
              title: `${data.overview.publishedSlots} / ${data.overview.totalSlots} bài đã xuất bản`,
              detail: "Đối chiếu xu hướng theo ngày, phân bổ nền tảng và hiệu suất từng bài để đánh giá kết quả chiến dịch.",
            };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3 text-slate-400">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm">Đang tổng hợp dữ liệu báo cáo...</p>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3 text-slate-500 bg-slate-50/50 rounded-2xl border border-slate-100 p-6">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center">
          <p className="text-sm text-slate-700">Không thể tải dữ liệu báo cáo</p>
          <p className="text-xs text-slate-400 mt-1">Vui lòng kiểm tra kết nối hệ thống hoặc thử lại</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-normal px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Thử lại
        </button>
      </div>
    );
  }

  // Chuẩn bị dữ liệu cho Pie chart phân bổ kênh
  const pieData = data?.byPlatform?.map((item) => ({
    name: item.platform,
    value: item.published,
  })) || [];

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header & Controls Toolbar */}
      <div className="relative isolate flex flex-col gap-5 overflow-hidden rounded-[24px] border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/60 p-5 shadow-[0_8px_28px_rgba(47,117,183,0.035)]">
        <div className="pointer-events-none absolute -right-8 -top-16 h-40 w-2/5 rounded-full bg-sky-100/50 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute right-32 top-2 hidden h-20 items-end gap-1.5 opacity-30 lg:flex" aria-hidden="true">
          {["h-4", "h-7", "h-10", "h-14", "h-17"].map((height) => <span key={height} className={`w-3 rounded-t bg-sky-300 ${height}`} />)}
          <TrendingUp size={44} className="mb-9 ml-1 text-sky-300" />
        </div>
        {/* Dòng 1: Tiêu đề */}
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-normal tracking-tight text-slate-900">
              Báo cáo hiệu suất đăng tải
              <Info size={15} className="text-sky-500" />
            </h2>
            <p className="mt-1 text-sm text-slate-500">Theo dõi tiến độ xuất bản, lượt tiếp cận và tương tác theo chiến dịch, kênh và thời gian.</p>
          </div>
        </div>

        {/* Dòng 2: Bộ lọc dạng Tag & Xuất báo cáo */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <ReportFilterControls
              campaigns={data?.campaigns?.map((campaign) => ({ value: campaign._id, label: campaign.title })) ?? []}
              campaignId={campaignId}
              platform={platform}
              startDate={startDate}
              endDate={endDate}
              onCampaignChange={setCampaignId}
              onPlatformChange={setPlatform}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
            {/* Đặt lại bộ lọc */}
            {(campaignId || platform || startDate || endDate) && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-xs font-normal transition-all border border-transparent hover:border-rose-100 shadow-xs"
              >
                Đặt lại
              </button>
            )}
          </div>

          {/* Nút xuất excel */}
          <button
            onClick={handleExportExcel}
            disabled={!data || !data.overview || data.overview.totalSlots === 0}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-teal-500 px-5 py-2.5 text-xs font-normal text-white shadow-sm transition hover:from-teal-500 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            Xuất Excel
          </button>
        </div>
      </div>

      {reportInsight && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <div>
            <p className="text-slate-800">{reportInsight.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{reportInsight.detail}</p>
          </div>
        </div>
      )}

      {data && data.overview && (
        <>
          {/* 2. Styled KPI Cards from reference image */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Tổng bài viết */}
            <MetricCard
              title="Tổng bài marketing"
              value={data.overview.totalSlots}
              description={`${data.overview.publishedSlots} đã xuất bản`}
              icon={Megaphone}
              tone="from-sky-500 to-blue-500"
              progress={data.overview.totalSlots > 0 ? (data.overview.publishedSlots / data.overview.totalSlots) * 100 : 0}
            />

            {/* Đã xuất bản */}
            <MetricCard
              title="Đã xuất bản"
              value={data.overview.publishedSlots}
              description="Bài đăng hoạt động"
              icon={CheckCircle}
              tone="from-emerald-400 to-teal-500"
              progress={data.overview.totalSlots > 0 ? (data.overview.publishedSlots / data.overview.totalSlots) * 100 : 0}
            />

            {/* Xử lý / Chờ duyệt */}
            <MetricCard
              title="Xử lý / chờ duyệt"
              value={data.overview.pendingApprovalSlots}
              description="Bài đang xử lý hoặc chờ duyệt"
              icon={Sparkles}
              tone="from-purple-500 to-indigo-500"
              progress={data.overview.totalSlots > 0 ? (data.overview.pendingApprovalSlots / data.overview.totalSlots) * 100 : 0}
            />

            {/* Tỷ lệ thành công */}
            <MetricCard
              title="Tỷ lệ thành công"
              value={`${data.overview.successRate}%`}
              description="Tỷ lệ xuất bản đạt"
              icon={Percent}
              tone="from-orange-400 to-amber-500"
              progress={data.overview.successRate}
            />

            {/* Lượt tiếp cận */}
            <MetricCard
              title="Lượt tiếp cận"
              value={data.platformMetrics.totalReach >= 1000
                ? `${(data.platformMetrics.totalReach / 1000).toFixed(1)}k`
                : data.platformMetrics.totalReach}
              description="Lượt tiếp cận đã ghi nhận"
              icon={Target}
              tone="from-pink-400 to-rose-500"
            />

            {/* Lượt tương tác */}
            <MetricCard
              title="Lượt tương tác"
              value={data.platformMetrics.totalLikes + data.platformMetrics.totalComments + data.platformMetrics.totalShares}
              description="Lượt thích, bình luận, chia sẻ"
              icon={Heart}
              tone="from-amber-500 to-orange-500"
            />
          </div>

          {/* 3. Bento Grid Layout (Optimized structure) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* CỘT TRÁI (2/3): Hiệu suất xu hướng & Pillars */}
            <div className="space-y-4 lg:col-span-2">
              
              {/* Tabbed Trend Charts: Gộp biểu đồ 1 và biểu đồ 3 để tiết kiệm diện tích */}
              <div className="min-h-[310px] rounded-[20px] border border-sky-100 bg-gradient-to-tr from-sky-50/60 via-white to-white p-5 shadow-[0_6px_24px_rgba(31,96,160,0.035)]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-normal text-slate-900">
                    <TrendingUp className="h-5 w-5 text-sky-500" />
                    Báo cáo xu hướng theo thời gian
                  </h3>
                  
                  {/* Switcher tabs */}
                  <div className="flex rounded-xl bg-slate-100/80 p-0.5 text-xs font-normal">
                    <button
                      onClick={() => setActiveChartTab("posts")}
                      className={`rounded-lg px-3 py-1.5 transition-all ${activeChartTab === "posts" ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Số bài đăng
                    </button>
                    <button
                      onClick={() => setActiveChartTab("engagement")}
                      className={`rounded-lg px-3 py-1.5 transition-all ${activeChartTab === "engagement" ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Lượt xem & thích
                    </button>
                  </div>
                </div>

                <div className="h-60">
                  {data.byDate.length > 0 ? (
                    activeChartTab === "posts" ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.byDate} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorPublished" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.15}/>
                            </linearGradient>
                            <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#00adfc" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#00adfc" stopOpacity={0.15}/>
                            </linearGradient>
                            <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.15}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.3)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(226, 232, 240, 0.8)', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }} />
                          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                          <Bar name="Đăng thành công" dataKey="published" fill="url(#colorPublished)" radius={[3, 3, 0, 0]} />
                          <Bar name="Lên lịch" dataKey="planned" fill="url(#colorPlanned)" radius={[3, 3, 0, 0]} />
                          <Bar name="Thất bại" dataKey="failed" fill="url(#colorFailed)" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.byDate} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(226, 232, 240, 0.3)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(226, 232, 240, 0.8)', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }} />
                          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            name="Lượt thích"
                            dataKey="likes"
                            stroke="#f43f5e"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            name="Lượt xem"
                            dataKey="views"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )
                  ) : (
                    <ReportEmptyState kind="trend">Chưa có dữ liệu theo ngày trong phạm vi đã chọn.</ReportEmptyState>
                  )}
                </div>
              </div>

              {/* Hàng 2: Content Pillars (Ngang) & Radar đánh giá AI (Cạnh nhau) */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                
                {/* Content Pillars */}
                <div className="flex min-h-[300px] flex-col justify-between rounded-[20px] border border-sky-100 bg-gradient-to-tr from-sky-50/60 via-white to-white p-5 shadow-[0_6px_24px_rgba(31,96,160,0.035)]">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-normal text-slate-900">
                    <Layers className="h-5 w-5 text-sky-500" />
                    Hiệu quả theo content pillar
                  </h3>
                  <div className="h-56">
                    {data.byPillar.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={pillarChartData}
                          layout="vertical"
                          margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="5%" stopColor="#00adfc" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#00adfc" stopOpacity={0.15}/>
                            </linearGradient>
                            <linearGradient id="colorLikes" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.15}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(226, 232, 240, 0.3)" />
                          <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <YAxis type="category" dataKey="pillar" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 400 }} width={108} tickFormatter={formatPillarLabel} />
                          <Tooltip labelFormatter={(label) => normalizePillarName(String(label))} contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(226, 232, 240, 0.8)', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }} />
                          <Bar name="Tổng số bài" dataKey="total" fill="url(#colorTotal)" radius={[0, 3, 3, 0]} barSize={10} />
                          <Bar name="Thích" dataKey="likes" fill="url(#colorLikes)" radius={[0, 3, 3, 0]} barSize={10} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ReportEmptyState kind="pillar">Chưa có nhóm nội dung để so sánh hiệu suất.</ReportEmptyState>
                    )}
                  </div>
                </div>

                {/* Phân bổ Phễu Marketing (TOFU / MOFU / BOFU) */}
                <div className="flex min-h-[300px] flex-col justify-between rounded-[20px] border border-sky-100 bg-white p-5 shadow-[0_6px_24px_rgba(31,96,160,0.035)]">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-normal text-slate-900">
                      <Target className="h-5 w-5 text-sky-500" />
                      Phân bổ theo phễu marketing
                    </h3>
                    {data.qualityScores?.avgScore > 0 && (
                      <span className="text-[10px] font-normal text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                        AI Score: {data.qualityScores.avgScore}/100
                      </span>
                    )}
                  </div>

                  <div className="my-auto space-y-6 py-3">
                    {(data.byFunnel && data.byFunnel.length > 0 ? data.byFunnel : [
                      { stage: "TOFU", label: "Nhận biết thương hiệu (TOFU)", desc: "Mở rộng tiếp cận", count: 0, percentage: 0, color: "from-sky-400 to-blue-500" },
                      { stage: "MOFU", label: "Tương tác & Đánh giá (MOFU)", desc: "Giữ chân khách hàng", count: 0, percentage: 0, color: "from-violet-400 to-purple-500" },
                      { stage: "BOFU", label: "Chuyển đổi & Chốt đơn (BOFU)", desc: "Thúc đẩy doanh số", count: 0, percentage: 0, color: "from-pink-400 to-rose-500" },
                    ]).map((f) => (
                      <div key={f.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-normal text-slate-700 text-[11px]">{f.label}</span>
                          <span className="font-normal text-slate-800 text-[11px]">
                            {f.count} bài <span className="text-slate-400 font-normal">({f.percentage}%)</span>
                          </span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${f.stage === 'TOFU' ? 'from-sky-400 to-blue-500' : f.stage === 'MOFU' ? 'from-violet-400 to-purple-500' : 'from-pink-400 to-rose-500'}`}
                            style={{ width: `${Math.max(f.percentage, 4)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                </div>

              </div>
            </div>

            {/* CỘT PHẢI (1/3): Phân bổ Platform & Lỗi */}
            <div className="space-y-4">
              
              {/* Phân bổ kênh đăng bài */}
              <div className="flex min-h-[310px] flex-col justify-between rounded-[20px] border border-sky-100 bg-white p-5 shadow-[0_6px_24px_rgba(31,96,160,0.035)]">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-normal text-slate-900">
                  <Activity className="h-5 w-5 text-sky-500" />
                  Phân bổ theo nền tảng
                </h3>
                <div className="relative flex h-56 items-center justify-center">
                  {pieData.some(p => p.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData.filter((p) => p.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={58}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <ReportEmptyState kind="platform">Chưa có bài đăng thành công để so sánh giữa các nền tảng.</ReportEmptyState>
                  )}
                </div>
                {/* Legends */}
                {pieData.some((item) => item.value > 0) && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-50 pt-2.5">
                  {pieData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-[10px] font-normal text-slate-600 truncate">
                        {item.name}: {item.value} bài
                      </span>
                    </div>
                  ))}
                </div>}
              </div>

              {/* Bảng lỗi nhỏ gọn */}
              <div className="flex h-[300px] flex-col overflow-hidden rounded-[20px] border border-pink-100 bg-gradient-to-tr from-pink-50/30 via-white to-white p-5 shadow-[0_6px_24px_rgba(31,96,160,0.035)]">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-normal text-pink-600">
                  <AlertTriangle className="h-5 w-5" />
                  Lỗi đăng tải cần lưu ý
                </h3>
                <div className="flex-1 overflow-y-auto">
                  {data.topErrors.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[9px] font-normal text-slate-400 uppercase tracking-wider">
                          <th className="py-1">Lỗi</th>
                          <th className="py-1">Chi tiết</th>
                          <th className="py-1 text-right">Lần</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-[10px] font-normal text-slate-500">
                        {data.topErrors.slice(0, 5).map((err, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-1.5 font-normal text-rose-500">{err.errorType}</td>
                            <td className="py-1.5 max-w-[180px] truncate" title={err.message}>
                              {err.message}
                            </td>
                            <td className="py-1.5 text-right font-normal text-slate-700">{err.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <ReportEmptyState kind="errors">Chưa ghi nhận lỗi đăng tải trong phạm vi báo cáo.</ReportEmptyState>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* 4. Danh sách chi tiết hiệu suất từng bài viết */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-xs mt-5">
            {(() => {
              const totalPosts = data.posts?.length || 0;
              const totalPages = Math.ceil(totalPosts / pageSize) || 1;
              const startIndex = (currentPage - 1) * pageSize;
              const paginatedPosts = data.posts ? data.posts.slice(startIndex, startIndex + pageSize) : [];

              return (
                <>
                  <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-3.5">
                    <h3 className="text-xs font-normal text-slate-700 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-indigo-500" />
                      Chi tiết hiệu suất từng bài viết
                    </h3>
                    <span className="text-[10px] font-normal text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                      Tổng số: {totalPosts} bài viết
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    {paginatedPosts.length > 0 ? (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-normal text-slate-400 uppercase tracking-widest">
                            <th className="py-2.5 px-3">Bài viết</th>
                            <th className="py-2.5 px-3">Kênh</th>
                            <th className="py-2.5 px-3">Pillar</th>
                            <th className="py-2.5 px-3 text-right">Reach (Tiếp cận)</th>
                            <th className="py-2.5 px-3 text-right">Impressions (Hiển thị)</th>
                            <th className="py-2.5 px-3 text-right">Tương tác</th>
                            <th className="py-2.5 px-3 text-right">Clicks</th>
                            <th className="py-2.5 px-3 text-center">Liên kết</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-xs text-slate-600 font-normal">
                          {paginatedPosts.map((post) => {
                            const likes = post.likes ?? 0;
                            const comments = post.comments ?? 0;
                            const shares = post.shares ?? 0;
                            const reach = post.reach ?? 0;
                            const impressions = post.impressions ?? 0;
                            const clicks = post.clicks ?? 0;
                            const totalEngagements = likes + comments + shares;
                            const dateStr = post.slotId?.scheduledAt
                              ? new Date(post.slotId.scheduledAt).toLocaleDateString("vi-VN", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Chưa xác định";

                            return (
                              <tr key={post._id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-3 max-w-[280px]">
                                  <p className="text-slate-800 font-normal truncate" title={post.slotId?.topicBrief}>
                                    {post.slotId?.topicBrief || "Bài viết không tên / Content tự động"}
                                  </p>
                                  <span className="text-[10px] font-normal text-slate-400">
                                    Lên lịch: {dateStr}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-normal ${
                                    post.platform === "Facebook"
                                      ? "bg-blue-50 text-blue-600"
                                      : "bg-zinc-950 text-white"
                                  }`}>
                                    {post.platform}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="text-slate-500 font-normal">
                                    {post.slotId?.pillar || "Khác"}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right font-normal text-slate-700">
                                  {reach.toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-right font-normal text-slate-700">
                                  {impressions.toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-normal text-slate-700">{totalEngagements.toLocaleString()}</span>
                                    <span className="text-[9px] font-normal text-slate-400">
                                      {likes} L / {comments} C / {shares} S
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-right font-normal text-slate-700">
                                  {clicks.toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {post.postUrl ? (
                                    <a
                                      href={post.postUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-600 hover:text-indigo-800 transition-colors underline text-[11px] font-normal"
                                    >
                                      Xem bài gốc
                                    </a>
                                  ) : (
                                    <span className="text-slate-300 font-normal">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                        <Layers className="h-8 w-8 text-slate-300 animate-pulse" />
                        <span className="text-xs font-normal">{hasActiveFilters ? "Không có bài viết phù hợp. Hãy thử mở rộng hoặc đặt lại bộ lọc." : "Chưa có bài viết để xem hiệu suất chi tiết."}</span>
                      </div>
                    )}
                  </div>

                  {/* Thanh Phân Trang (Pagination Controls) */}
                  {totalPosts > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-3 mt-3 gap-2">
                      <span className="text-[11px] font-normal text-slate-500">
                        Hiển thị <span className="font-normal text-slate-700">{startIndex + 1}</span> - <span className="font-normal text-slate-700">{Math.min(startIndex + pageSize, totalPosts)}</span> trên <span className="font-normal text-slate-700">{totalPosts}</span> bài viết
                      </span>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                            title="Trang trước"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`px-2.5 py-1 text-xs font-normal rounded-lg transition cursor-pointer ${
                                  currentPage === page
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                {page}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                            title="Trang sau"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
