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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import * as XLSX from "xlsx";
import {
  Calendar,
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
} from "lucide-react";
import {
  marketingAnalyticsService,
  AnalyticsResponse,
} from "../../services/marketingAnalyticsService";
import { toast } from "../../pages/Toast";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#ec4899"];

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

  // Chuẩn bị dữ liệu cho Pie chart phân bổ kênh
  const pieData = data?.byPlatform.map((item) => ({
    name: item.platform,
    value: item.published,
  })) || [];

  // Chuẩn bị dữ liệu cho Radar chart chất lượng AI
  const radarData = data
    ? [
        { subject: "Fidelity", A: data.qualityScores.byDimension.fidelity, fullMark: 100 },
        { subject: "Objective", A: data.qualityScores.byDimension.objective, fullMark: 100 },
        { subject: "Platform", A: data.qualityScores.byDimension.platform, fullMark: 100 },
        { subject: "Hook", A: data.qualityScores.byDimension.hook, fullMark: 100 },
        { subject: "Conversion", A: data.qualityScores.byDimension.conversion, fullMark: 100 },
        { subject: "Readability", A: data.qualityScores.byDimension.readability, fullMark: 100 },
        { subject: "Novelty", A: data.qualityScores.byDimension.novelty, fullMark: 100 },
      ]
    : [];

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header Dashboard */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
            BÁO CÁO HIỆU SUẤT ĐĂNG TẢI
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Phân tích đa chiều chiến dịch, tương tác và chất lượng nội dung AI</p>
        </div>

        {/* Nút xuất excel */}
        <button
          onClick={handleExportExcel}
          disabled={!data || data.overview.totalSlots === 0}
          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
        >
          <Download className="h-3.5 w-3.5" />
          XUẤT FILE EXCEL
        </button>
      </div>

      {/* 1. Thanh điều hướng bộ lọc (Glassmorphic) */}
      <div className="bg-white border border-slate-100 rounded-xl p-3.5 flex flex-wrap gap-4 items-end justify-between shadow-xs">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Chiến dịch */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chiến dịch</span>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none min-w-[180px] hover:bg-slate-100/50 transition-all cursor-pointer"
            >
              <option value="">Tất cả chiến dịch</option>
              {data?.campaigns.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Kênh */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nền tảng</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none min-w-[120px] hover:bg-slate-100/50 transition-all cursor-pointer"
            >
              <option value="">Tất cả kênh</option>
              <option value="Facebook">Facebook Page</option>
              <option value="TikTok">TikTok Channel</option>
            </select>
          </div>

          {/* Khoảng ngày */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Từ ngày</span>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              />
              <Calendar className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đến ngày</span>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              />
              <Calendar className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Reset Filters */}
          {(campaignId || platform || startDate || endDate) && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all"
            >
              Đặt lại
            </button>
          )}
        </div>
      </div>

      {data && (
        <>
          {/* 2. Styled KPI Cards from reference image */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Tổng bài viết */}
            <div className="relative bg-white border border-slate-100 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between min-h-[135px]">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-pink-500 to-rose-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TỔNG BÀI MARKETING</span>
                <span className="p-2 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
                  <Megaphone className="h-4.5 w-4.5" />
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-3xl font-black text-slate-800 tracking-tight leading-none">{data.overview.totalSlots}</h4>
                <p className="text-xs text-slate-400 mt-2 font-semibold">{data.overview.publishedSlots} đã xuất bản</p>
              </div>
            </div>

            {/* Đã xuất bản */}
            <div className="relative bg-white border border-slate-100 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between min-h-[135px]">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-emerald-400 to-teal-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ĐÃ XUẤT BẢN</span>
                <span className="p-2 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-4.5 w-4.5" />
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-3xl font-black text-slate-800 tracking-tight leading-none">{data.overview.publishedSlots}</h4>
                <p className="text-xs text-slate-400 mt-2 font-semibold">Bài đăng hoạt động</p>
              </div>
            </div>

            {/* Xử lý / Chờ duyệt */}
            <div className="relative bg-white border border-slate-100 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between min-h-[135px]">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-purple-500 to-indigo-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">XỬ LÝ / CHỜ DUYỆT</span>
                <span className="p-2 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4.5 w-4.5" />
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-3xl font-black text-slate-800 tracking-tight leading-none">{data.overview.pendingApprovalSlots}</h4>
                <p className="text-xs text-slate-400 mt-2 font-semibold">Đang pending/xử lý</p>
              </div>
            </div>

            {/* Tỷ lệ thành công */}
            <div className="relative bg-white border border-slate-100 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between min-h-[135px]">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-blue-500 to-cyan-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TỶ LỆ THÀNH CÔNG</span>
                <span className="p-2 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
                  <Percent className="h-4.5 w-4.5" />
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-3xl font-black text-slate-800 tracking-tight leading-none">{data.overview.successRate}%</h4>
                <p className="text-xs text-slate-400 mt-2 font-semibold">Tỷ lệ xuất bản đạt</p>
              </div>
            </div>

            {/* Lượt tiếp cận */}
            <div className="relative bg-white border border-slate-100 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between min-h-[135px]">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-purple-500 to-rose-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LƯỢT TIẾP CẬN</span>
                <span className="p-2 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
                  <Target className="h-4.5 w-4.5" />
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-3xl font-black text-slate-800 tracking-tight leading-none">
                  {data.platformMetrics.totalReach >= 1000
                    ? `${(data.platformMetrics.totalReach / 1000).toFixed(1)}k`
                    : data.platformMetrics.totalReach}
                </h4>
                <p className="text-xs text-slate-400 mt-2 font-semibold">Lượt reach độc giả</p>
              </div>
            </div>

            {/* Lượt tương tác */}
            <div className="relative bg-white border border-slate-100 rounded-3xl p-4.5 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between min-h-[135px]">
              <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-amber-500 to-orange-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LƯỢT TƯƠNG TÁC</span>
                <span className="p-2 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
                  <Heart className="h-4.5 w-4.5" />
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-3xl font-black text-slate-800 tracking-tight leading-none">
                  {data.platformMetrics.totalLikes + data.platformMetrics.totalComments + data.platformMetrics.totalShares}
                </h4>
                <p className="text-xs text-slate-400 mt-2 font-semibold">Likes, bình luận, share</p>
              </div>
            </div>
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
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: '#f1f5f9' }} />
                          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                          <Bar name="Đăng thành công" dataKey="published" fill="#10b981" radius={[3, 3, 0, 0]} />
                          <Bar name="Lên lịch" dataKey="planned" fill="#6366f1" radius={[3, 3, 0, 0]} />
                          <Bar name="Thất bại" dataKey="failed" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.byDate} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: '#f1f5f9' }} />
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
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                          <YAxis type="category" dataKey="pillar" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} width={80} />
                          <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                          <Bar name="Tổng số bài" dataKey="total" fill="#6366f1" radius={[0, 3, 3, 0]} barSize={10} />
                          <Bar name="Thích" dataKey="likes" fill="#f43f5e" radius={[0, 3, 3, 0]} barSize={10} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                        Chưa ghi nhận Pillars
                      </div>
                    )}
                  </div>
                </div>

                {/* Chất lượng AI Content */}
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-50 pb-2.5 mb-2.5">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    ĐÁNH GIÁ CHẤT LƯỢNG NỘI DUNG AI
                  </h3>
                  <div className="h-40 flex items-center justify-center">
                    {data.qualityScores.avgScore > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                          <PolarGrid stroke="#e2e8f0" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 7, fill: '#94a3b8' }} />
                          <Radar
                            name="Điểm trung bình"
                            dataKey="A"
                            stroke="#6366f1"
                            fill="#818cf8"
                            fillOpacity={0.4}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                        Chưa có dữ liệu đánh giá
                      </div>
                    )}
                  </div>
                  <div className="text-center pt-2 border-t border-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>Điểm trung bình:</span>
                    <span className="text-indigo-600 text-xs font-black">{data.qualityScores.avgScore}/100</span>
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
                            <td className="py-1.5 max-w-[110px] truncate" title={err.message}>
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
        </>
      )}
    </div>
  );
}
