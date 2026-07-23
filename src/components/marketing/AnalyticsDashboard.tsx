/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from "react";
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
import * as XLSX from "xlsx";
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
} from "lucide-react";
import {
  marketingAnalyticsService,
  AnalyticsResponse,
} from "../../services/marketingAnalyticsService";
import { toast } from "../../pages/Toast";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#ec4899"];

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

  let iconBg = "bg-slate-50 text-slate-500";
  let glowColor = "rgba(148, 163, 184, 0.1)";
  let progressBg = "bg-slate-100";
  let progressBar = "bg-slate-400";
  
  if (isPink) {
    iconBg = "bg-pink-500/10 text-pink-600";
    glowColor = "rgba(244, 63, 94, 0.12)";
    progressBg = "bg-pink-100/50";
    progressBar = "bg-gradient-to-r from-pink-500 to-rose-500";
  } else if (isViolet) {
    iconBg = "bg-violet-500/10 text-violet-600";
    glowColor = "rgba(139, 92, 246, 0.12)";
    progressBg = "bg-violet-100/50";
    progressBar = "bg-gradient-to-r from-violet-500 to-indigo-500";
  } else if (isEmerald) {
    iconBg = "bg-emerald-500/10 text-emerald-600";
    glowColor = "rgba(16, 185, 129, 0.12)";
    progressBg = "bg-emerald-100/50";
    progressBar = "bg-gradient-to-r from-emerald-500 to-teal-500";
  } else if (isSky) {
    iconBg = "bg-sky-500/10 text-sky-600";
    glowColor = "rgba(14, 165, 233, 0.12)";
    progressBg = "bg-sky-100/50";
    progressBar = "bg-gradient-to-r from-sky-500 to-cyan-500";
  } else if (isAmber) {
    iconBg = "bg-amber-500/10 text-amber-600";
    glowColor = "rgba(245, 158, 11, 0.12)";
    progressBg = "bg-amber-100/50";
    progressBar = "bg-gradient-to-r from-amber-500 to-orange-500";
  }

  return (
    <div className="group relative bg-white/70 backdrop-blur-md border border-slate-100/80 rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.015)] hover:shadow-[0_15px_35px_rgba(0,0,0,0.04)] hover:-translate-y-1 hover:border-slate-200/50 transition-all duration-300 overflow-hidden flex flex-col justify-between min-h-[145px]">
      <div 
        className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none transition-all duration-500 group-hover:scale-125" 
        style={{ backgroundColor: glowColor }} 
      />
      <div className={`absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r ${tone}`} />
      
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        <span className={`p-2.5 rounded-2xl ${iconBg} flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 shadow-xs`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      
      <div className="mt-2.5">
        <h4 className="text-3.5xl font-black text-slate-800 tracking-tight leading-none transition-colors group-hover:text-slate-900">{value}</h4>
        
        {progress !== undefined && (
          <div className="mt-3.5 space-y-1.5">
            <div className={`w-full h-1 rounded-full ${progressBg} overflow-hidden`}>
              <div 
                className={`h-full rounded-full transition-all duration-500 ${progressBar}`}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
              <span>{description}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}
        
        {progress === undefined && (
          <p className="text-xs text-slate-400 mt-2 font-semibold">{description}</p>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  
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

  const handleExportExcel = () => {
    if (!data) return;

    try {
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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3 text-slate-400">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="font-semibold text-sm">Đang tổng hợp dữ liệu báo cáo...</p>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3 text-slate-500 bg-slate-50/50 rounded-2xl border border-slate-100 p-6">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="text-center">
          <p className="font-bold text-sm text-slate-700">Không thể tải dữ liệu báo cáo</p>
          <p className="text-xs text-slate-400 mt-1">Vui lòng kiểm tra kết nối hệ thống hoặc thử lại</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
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
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
        {/* Dòng 1: Tiêu đề */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2 animate-fadeIn">
              BÁO CÁO HIỆU SUẤT ĐĂNG TẢI
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Phân tích đa chiều chiến dịch, tương tác và chất lượng nội dung AI</p>
          </div>
        </div>

        {/* Dòng 2: Bộ lọc dạng Tag & Xuất báo cáo */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bộ lọc Chiến dịch */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur-xs border border-slate-100/80 rounded-xl px-3 py-1.5 hover:bg-white hover:border-indigo-500/20 transition-all duration-300 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Chiến dịch:</span>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer text-xs"
              >
                <option value="">Tất cả</option>
                {data?.campaigns?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Bộ lọc Nền tảng */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur-xs border border-slate-100/80 rounded-xl px-3 py-1.5 hover:bg-white hover:border-indigo-500/20 transition-all duration-300 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Nền tảng:</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer text-xs"
              >
                <option value="">Tất cả</option>
                <option value="Facebook">Facebook Page</option>
                <option value="TikTok">TikTok Channel</option>
              </select>
            </div>

            {/* Từ ngày */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur-xs border border-slate-100/80 rounded-xl px-3 py-1 text-slate-500 hover:bg-white hover:border-indigo-500/20 transition-all duration-300 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Từ:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer text-xs py-0.5"
              />
            </div>

            {/* Đến ngày */}
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur-xs border border-slate-100/80 rounded-xl px-3 py-1 text-slate-500 hover:bg-white hover:border-indigo-500/20 transition-all duration-300 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Đến:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer text-xs py-0.5"
              />
            </div>

            {/* Đặt lại bộ lọc */}
            {(campaignId || platform || startDate || endDate) && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-xs font-bold transition-all border border-transparent hover:border-rose-100 shadow-xs"
              >
                Đặt lại
              </button>
            )}
          </div>

          {/* Nút xuất excel */}
          <button
            onClick={handleExportExcel}
            disabled={!data || !data.overview || data.overview.totalSlots === 0}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-emerald-600/20 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            XUẤT EXCEL
          </button>
        </div>
      </div>

      {data && data.overview && (
        <>
          {/* 2. Styled KPI Cards from reference image */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Tổng bài viết */}
            <MetricCard
              title="TỔNG BÀI MARKETING"
              value={data.overview.totalSlots}
              description={`${data.overview.publishedSlots} đã xuất bản`}
              icon={Megaphone}
              tone="from-pink-500 to-rose-500"
              progress={data.overview.totalSlots > 0 ? (data.overview.publishedSlots / data.overview.totalSlots) * 100 : 0}
            />

            {/* Đã xuất bản */}
            <MetricCard
              title="ĐÃ XUẤT BẢN"
              value={data.overview.publishedSlots}
              description="Bài đăng hoạt động"
              icon={CheckCircle}
              tone="from-emerald-400 to-teal-500"
              progress={data.overview.totalSlots > 0 ? (data.overview.publishedSlots / data.overview.totalSlots) * 100 : 0}
            />

            {/* Xử lý / Chờ duyệt */}
            <MetricCard
              title="XỬ LÝ / CHỜ DUYỆT"
              value={data.overview.pendingApprovalSlots}
              description="Đang pending/xử lý"
              icon={Sparkles}
              tone="from-purple-500 to-indigo-500"
              progress={data.overview.totalSlots > 0 ? (data.overview.pendingApprovalSlots / data.overview.totalSlots) * 100 : 0}
            />

            {/* Tỷ lệ thành công */}
            <MetricCard
              title="TỶ LỆ THÀNH CÔNG"
              value={`${data.overview.successRate}%`}
              description="Tỷ lệ xuất bản đạt"
              icon={Percent}
              tone="from-blue-500 to-cyan-500"
              progress={data.overview.successRate}
            />

            {/* Lượt tiếp cận */}
            <MetricCard
              title="LƯỢT TIẾP CẬN"
              value={data.platformMetrics.totalReach >= 1000
                ? `${(data.platformMetrics.totalReach / 1000).toFixed(1)}k`
                : data.platformMetrics.totalReach}
              description="Lượt reach độc giả"
              icon={Target}
              tone="from-purple-500 to-rose-500"
            />

            {/* Lượt tương tác */}
            <MetricCard
              title="LƯỢT TƯƠNG TÁC"
              value={data.platformMetrics.totalLikes + data.platformMetrics.totalComments + data.platformMetrics.totalShares}
              description="Likes, bình luận, share"
              icon={Heart}
              tone="from-amber-500 to-orange-500"
            />
          </div>

          {/* 3. Bento Grid Layout (Optimized structure) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* CỘT TRÁI (2/3): Hiệu suất xu hướng & Pillars */}
            <div className="lg:col-span-2 space-y-5">
              
              {/* Tabbed Trend Charts: Gộp biểu đồ 1 và biểu đồ 3 để tiết kiệm diện tích */}
              <div className="bg-white border border-slate-100 rounded-xl p-4.5 shadow-xs">
                <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    BẢO CÁO XU HƯỚNG THEO THỜI GIAN
                  </h3>
                  
                  {/* Switcher tabs */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      onClick={() => setActiveChartTab("posts")}
                      className={`px-3 py-1 rounded-md transition-all ${activeChartTab === "posts" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      SỐ BÀI ĐĂNG
                    </button>
                    <button
                      onClick={() => setActiveChartTab("engagement")}
                      className={`px-3 py-1 rounded-md transition-all ${activeChartTab === "engagement" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      LƯỢT REACH & THÍCH
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
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.15}/>
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
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                      Không có dữ liệu thống kê trong khoảng ngày này
                    </div>
                  )}
                </div>
              </div>

              {/* Hàng 2: Content Pillars (Ngang) & Radar đánh giá AI (Cạnh nhau) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Content Pillars */}
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-50 pb-2.5 mb-2.5">
                    <Layers className="h-4 w-4 text-emerald-500" />
                    HIỆU QUẢ THEO CONTENT PILLAR
                  </h3>
                  <div className="h-48">
                    {data.byPillar.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.byPillar}
                          layout="vertical"
                          margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.15}/>
                            </linearGradient>
                            <linearGradient id="colorLikes" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.15}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(226, 232, 240, 0.3)" />
                          <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <YAxis type="category" dataKey="pillar" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} width={80} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(226, 232, 240, 0.8)', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }} />
                          <Bar name="Tổng số bài" dataKey="total" fill="url(#colorTotal)" radius={[0, 3, 3, 0]} barSize={10} />
                          <Bar name="Thích" dataKey="likes" fill="url(#colorLikes)" radius={[0, 3, 3, 0]} barSize={10} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                        Chưa ghi nhận Pillars
                      </div>
                    )}
                  </div>
                </div>

                {/* Phân bổ Phễu Marketing (TOFU / MOFU / BOFU) */}
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-2.5 mb-2.5">
                    <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Target className="h-4 w-4 text-indigo-500" />
                      PHÂN BỔ THEO PHỄU MARKETING
                    </h3>
                    {data.qualityScores?.avgScore > 0 && (
                      <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                        AI Score: {data.qualityScores.avgScore}/100
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 my-auto py-1">
                    {(data.byFunnel && data.byFunnel.length > 0 ? data.byFunnel : [
                      { stage: "TOFU", label: "Nhận biết thương hiệu (TOFU)", desc: "Mở rộng tiếp cận", count: 0, percentage: 33, color: "from-blue-500 to-indigo-600" },
                      { stage: "MOFU", label: "Tương tác & Đánh giá (MOFU)", desc: "Giữ chân khách hàng", count: 0, percentage: 34, color: "from-purple-500 to-pink-600" },
                      { stage: "BOFU", label: "Chuyển đổi & Chốt đơn (BOFU)", desc: "Thúc đẩy doanh số", count: 0, percentage: 33, color: "from-emerald-500 to-teal-600" },
                    ]).map((f) => (
                      <div key={f.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700 text-[11px]">{f.label}</span>
                          <span className="font-black text-slate-800 text-[11px]">
                            {f.count} bài <span className="text-slate-400 font-semibold">({f.percentage}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${f.color || 'from-indigo-500 to-purple-600'} transition-all duration-500 rounded-full`}
                            style={{ width: `${Math.max(f.percentage, 4)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-slate-400 font-medium pt-2 border-t border-slate-50 flex items-center justify-between">
                    <span>TOFU: Phễu Đầu (Thu hút)</span>
                    <span>MOFU: Phễu Giữa (Tương tác)</span>
                    <span>BOFU: Phễu Cuối (Chuyển đổi)</span>
                  </div>
                </div>

              </div>
            </div>

            {/* CỘT PHẢI (1/3): Phân bổ Platform & Lỗi */}
            <div className="space-y-5">
              
              {/* Phân bổ kênh đăng bài */}
              <div className="bg-white border border-slate-100 rounded-xl p-4.5 shadow-xs flex flex-col justify-between">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-50 pb-3 mb-3">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  PHÂN BỔ THEO NỀN TẢNG
                </h3>
                <div className="h-36 relative flex items-center justify-center">
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
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                      Không có bài đăng thành công
                    </div>
                  )}
                </div>
                {/* Legends */}
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-50 pt-2.5">
                  {pieData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-[10px] font-bold text-slate-600 truncate">
                        {item.name}: {item.value} bài
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bảng lỗi nhỏ gọn */}
              <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-xs flex flex-col h-[230px] overflow-hidden">
                <h3 className="text-xs font-bold text-rose-600 flex items-center gap-1.5 border-b border-slate-50 pb-2.5 mb-2.5">
                  <AlertTriangle className="h-4 w-4" />
                  LỖI ĐĂNG TẢI CẦN LƯU Ý
                </h3>
                <div className="flex-1 overflow-y-auto">
                  {data.topErrors.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          <th className="py-1">Lỗi</th>
                          <th className="py-1">Chi tiết</th>
                          <th className="py-1 text-right">Lần</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-[10px] font-bold text-slate-500">
                        {data.topErrors.slice(0, 5).map((err, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-1.5 font-bold text-rose-500">{err.errorType}</td>
                            <td className="py-1.5 max-w-[180px] truncate" title={err.message}>
                              {err.message}
                            </td>
                            <td className="py-1.5 text-right font-black text-slate-700">{err.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-1.5">
                      <CheckCircle className="h-6 w-6 text-emerald-500" />
                      <span className="text-xs font-semibold">Tất cả ổn định, 0 ghi nhận lỗi</span>
                    </div>
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
                    <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-indigo-500" />
                      CHI TIẾT HIỆU SUẤT TỪNG BÀI VIẾT
                    </h3>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                      Tổng số: {totalPosts} bài viết
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    {paginatedPosts.length > 0 ? (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
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
                        <tbody className="divide-y divide-slate-50 text-xs text-slate-600 font-bold">
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
                                  <p className="text-slate-800 font-bold truncate" title={post.slotId?.topicBrief}>
                                    {post.slotId?.topicBrief || "Bài viết không tên / Content tự động"}
                                  </p>
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    Lên lịch: {dateStr}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    post.platform === "Facebook"
                                      ? "bg-blue-50 text-blue-600"
                                      : "bg-zinc-950 text-white"
                                  }`}>
                                    {post.platform}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="text-slate-500 font-semibold">
                                    {post.slotId?.pillar || "Khác"}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right font-black text-slate-700">
                                  {reach.toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-right font-black text-slate-700">
                                  {impressions.toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-black text-slate-700">{totalEngagements.toLocaleString()}</span>
                                    <span className="text-[9px] font-semibold text-slate-400">
                                      {likes} L / {comments} C / {shares} S
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-right font-black text-slate-700">
                                  {clicks.toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {post.postUrl ? (
                                    <a
                                      href={post.postUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-600 hover:text-indigo-800 transition-colors underline text-[11px] font-bold"
                                    >
                                      Xem bài gốc
                                    </a>
                                  ) : (
                                    <span className="text-slate-300 font-semibold">-</span>
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
                        <span className="text-xs font-semibold">Không tìm thấy bài viết nào phù hợp với bộ lọc</span>
                      </div>
                    )}
                  </div>

                  {/* Thanh Phân Trang (Pagination Controls) */}
                  {totalPosts > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-3 mt-3 gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        Hiển thị <span className="font-bold text-slate-700">{startIndex + 1}</span> - <span className="font-bold text-slate-700">{Math.min(startIndex + pageSize, totalPosts)}</span> trên <span className="font-bold text-slate-700">{totalPosts}</span> bài viết
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
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
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
