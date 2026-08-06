import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Megaphone,
  MessageSquareShare,
  Radio,
  Sparkles,
  Target,
  Users,
  Inbox,
  Flame,
  Zap,
  Award,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { crmService, ExtendedLeadCard } from "../services/crmService";
import { marketingService } from "../services/marketingService";
import { socialIntegrationService, SocialIntegration } from "../services/socialIntegrationService";
import { ContentApprovalCard } from "../types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

function formatTimeLabel(value?: string) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function navigateTo(url: string) {
  window.location.href = url;
}

export default function DashboardTab() {
  const { userProfile } = useAuth();
  const [marketingCards, setMarketingCards] = useState<ContentApprovalCard[]>([]);
  const [crmLeads, setCrmLeads] = useState<ExtendedLeadCard[]>([]);
  const [integrations, setIntegrations] = useState<SocialIntegration[]>([]);

  useEffect(() => {
    const unsubscribeMarketing = marketingService.subscribeToContents(
      (cards) => setMarketingCards(cards),
      (error) => console.error("[DashboardTab] Không thể đồng bộ marketing cards:", error),
      userProfile?.uid,
      userProfile?.role
    );

    const unsubscribeCrm = crmService.subscribeLeads(
      (leads) => setCrmLeads(leads),
      (error) => console.error("[DashboardTab] Không thể đồng bộ CRM leads:", error)
    );

    let cancelled = false;

    const loadStaticData = async () => {
      try {
        const integrationData = await socialIntegrationService.getIntegrations();
        if (!cancelled) {
          setIntegrations(integrationData || []);
        }
      } catch (error) {
        console.error("[DashboardTab] Không thể tải dữ liệu tổng quan:", error);
      }
    };

    void loadStaticData();

    return () => {
      cancelled = true;
      unsubscribeMarketing();
      unsubscribeCrm();
    };
  }, [userProfile?.uid, userProfile?.role]);

  const marketingStats = useMemo(() => {
    const total = marketingCards.length;
    const scheduled = marketingCards.filter((item) => item.status === "scheduled").length;
    const published = marketingCards.filter((item) => item.status === "published").length;
    const processing = marketingCards.filter((item) => item.status === "processing" || item.status === "pending").length;

    return { total, scheduled, published, processing };
  }, [marketingCards]);

  const crmStats = useMemo(() => {
    const cold = crmLeads.filter((item) => item.status === "cold").length;
    const warm = crmLeads.filter((item) => item.status === "warm").length;
    const hot = crmLeads.filter((item) => item.status === "hot").length;
    const won = crmLeads.filter((item) => item.status === "won").length;
    const upsell = crmLeads.filter((item) => item.status === "upsell").length;

    return { cold, warm, hot, won, upsell, total: crmLeads.length };
  }, [crmLeads]);

  const connectedChannels = useMemo(() => {
    const channelMap = new Map<string, SocialIntegration>();
    integrations
      .filter((item) => item.isConnected)
      .forEach((item) => {
        if (!channelMap.has(item.platform)) {
          channelMap.set(item.platform, item);
        }
      });

    if (userProfile?.facebookIntegration?.isConnected && !channelMap.has("Facebook")) {
      channelMap.set("Facebook", {
        platform: "Facebook",
        displayName: userProfile.facebookIntegration.pageName || "Facebook Personal",
        username: userProfile.facebookIntegration.pageId,
        isConnected: true,
        createdBy: userProfile.uid,
      });
    }

    if (userProfile?.tiktokIntegration?.isConnected && !channelMap.has("TikTok")) {
      channelMap.set("TikTok", {
        platform: "TikTok",
        displayName: userProfile.tiktokIntegration.displayName || "TikTok Personal",
        username: userProfile.tiktokIntegration.username,
        isConnected: true,
        createdBy: userProfile.uid,
      });
    }

    if (userProfile?.zaloIntegration?.isConnected && !channelMap.has("Zalo")) {
      channelMap.set("Zalo", {
        platform: "Zalo",
        displayName: userProfile.zaloIntegration.oaName || "Zalo Personal",
        username: userProfile.zaloIntegration.oaId,
        isConnected: true,
        createdBy: userProfile.uid,
      });
    }

    return Array.from(channelMap.values());
  }, [integrations, userProfile]);

  const recentMarketing = useMemo(
    () =>
      [...marketingCards]
        .sort((a, b) => new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime())
        .slice(0, 4),
    [marketingCards]
  );

  const focusLeads = useMemo(
    () =>
      [...crmLeads]
        .filter((lead) => lead.status === "hot" || lead.status === "warm")
        .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
        .slice(0, 4),
    [crmLeads]
  );

  const quickLinks = [
    {
      title: "Tạo nội dung & chiến dịch",
      description: "Tạo bài đăng nhanh hoặc lập chiến dịch tự động.",
      href: "/marketing?sub=tao-chien-dich",
      icon: Sparkles,
      tone: "from-fuchsia-500 via-purple-500 to-indigo-500",
    },
    {
      title: "Lịch đăng nội dung",
      description: "Theo dõi nội dung đã lên lịch và trạng thái xuất bản.",
      href: "/marketing?sub=lich-dang",
      icon: Megaphone,
      tone: "from-amber-500 via-orange-500 to-rose-500",
    },
    {
      title: "Quản lý pipeline",
      description: "Theo dõi lead âm, nóng và cơ hội sắp chốt.",
      href: "/sales-crm?sub=pipeline",
      icon: Target,
      tone: "from-emerald-500 via-teal-500 to-cyan-500",
    },
    {
      title: "Omni-inbox",
      description: "Chuyển tiếp vào khu vực chat đã kênh để xử lý hội thoại.",
      href: "/sales-crm?sub=omni-chat",
      icon: MessageSquareShare,
      tone: "from-sky-500 via-blue-500 to-indigo-500",
    },
  ];

  return (
    <div className="h-full overflow-y-auto rounded-[32px] bg-[radial-gradient(circle_at_top_left,_rgba(244,114,182,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef4ff_100%)] p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Tổng bài marketing"
            value={formatNumber(marketingStats.total)}
            description={`${formatNumber(marketingStats.published)} đã xuất bản`}
            icon={Megaphone}
            tone="from-pink-500 to-rose-500"
            progress={marketingStats.total > 0 ? (marketingStats.published / marketingStats.total) * 100 : 0}
          />
          <MetricCard
            title="Xử lý / chờ duyệt"
            value={formatNumber(marketingStats.processing)}
            description="Bài đang pending hoặc đang xử lý"
            icon={Sparkles}
            tone="from-violet-500 to-indigo-500"
            progress={marketingStats.total > 0 ? (marketingStats.processing / marketingStats.total) * 100 : 0}
          />
          <MetricCard
            title="Tổng lead CRM"
            value={formatNumber(crmStats.total)}
            description={`${formatNumber(crmStats.won)} lead đã chốt`}
            icon={Users}
            tone="from-emerald-500 to-teal-500"
            progress={crmStats.total > 0 ? (crmStats.won / crmStats.total) * 100 : 0}
          />
          <MetricCard
            title="Lead âm / nóng"
            value={`${formatNumber(crmStats.warm)} / ${formatNumber(crmStats.hot)}`}
            description="Cần ưu tiên chăm sóc và chốt đơn"
            icon={Target}
            tone="from-sky-500 to-cyan-500"
            progress={
              (crmStats.warm + crmStats.hot) > 0
                ? (crmStats.hot / (crmStats.warm + crmStats.hot)) * 100
                : 0
            }
          />
        </section>

        <section className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-xs backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales CRM</div>
                <h3 className="mt-1 text-lg font-black text-slate-900">Phân bổ pipeline hiện tại</h3>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("/sales-crm?sub=pipeline")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Mở pipeline
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <PipelineStep label="Cold" value={crmStats.cold} stage="cold" />
              <PipelineStep label="Warm" value={crmStats.warm} stage="warm" />
              <PipelineStep label="Hot" value={crmStats.hot} stage="hot" />
              <PipelineStep label="Won" value={crmStats.won} stage="won" />
              <PipelineStep label="Upsell" value={crmStats.upsell} stage="upsell" isLast />
            </div>

            <div className="mt-5 space-y-3">
              {focusLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-indigo-200/50 bg-indigo-50/5 p-6 text-center transition-all hover:bg-indigo-50/10">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                    <Users className="h-5 w-5" />
                  </div>
                  <h4 className="mt-3 text-xs font-bold text-slate-700">Mọi thứ đang được xử lý tốt!</h4>
                  <p className="mt-1 text-[11px] text-slate-400 max-w-sm mx-auto font-medium">
                    Không có lead Warm/Hot nào đang chờ xử lý trong hàng đợi ưu tiên. Hãy chuyển thêm lead từ phễu Cold sang Warm để bắt đầu chốt giao dịch.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateTo("/sales-crm?sub=pipeline")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-650 px-3 py-1.5 text-[10px] font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer"
                  >
                    Xem tất cả Lead
                  </button>
                </div>
              ) : (
                focusLeads.map((lead) => {
                  const isHot = lead.status?.toLowerCase().includes("hot");
                  const badgeBg = isHot ? "bg-rose-500/10 text-rose-650" : "bg-amber-500/10 text-amber-600";
                  
                  return (
                    <div 
                      key={lead.id} 
                      className="group flex items-center justify-between rounded-2xl border border-slate-100 bg-white/60 backdrop-blur-xs px-4 py-3 hover:bg-white hover:shadow-md hover:border-slate-200/50 transition-all duration-300"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full ${badgeBg} flex items-center justify-center text-xs font-black shrink-0`}>
                          {lead.customerName ? lead.customerName.charAt(0).toUpperCase() : "L"}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-800 group-hover:text-indigo-900 transition-colors">{lead.customerName}</div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-450 font-semibold">
                            <span className="text-slate-500 font-bold">{lead.company || "Cá nhân"}</span>
                            <span>•</span>
                            <span>{lead.lastInteraction || "Chưa tương tác"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-slate-700">{formatCurrency(Number(lead.value || 0))}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-[9px] font-black rounded-md uppercase tracking-wider ${badgeBg}`}>
                          {lead.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-xs backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Marketing</div>
                  <h3 className="mt-1 text-lg font-black text-slate-900">Nhịp độ content và publishing</h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo("/marketing?sub=lich-dang")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Xem lịch
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Đã xuất bản" value={marketingStats.published} />
                <MiniStat label="Đã lên lịch" value={marketingStats.scheduled} />
                <MiniStat label="Đang xử lý" value={marketingStats.processing} />
                <MiniStat label="Tổng asset" value={marketingStats.total} />
              </div>

              <div className="mt-5 space-y-3">
                {recentMarketing.length === 0 ? (
                  <EmptyState label="Chưa có bài marketing nào để hiển thị trong dashboard." />
                ) : (
                  recentMarketing.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-800">{item.title}</div>
                          <div className="mt-1 text-[10px] text-slate-400 font-semibold">
                            {item.channel} • {item.contentType || "Marketing content"}
                          </div>
                        </div>
                        <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 font-semibold">
                        Cập nhật: {formatTimeLabel(item.publishedAt || item.generatedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-xs backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Channels</div>
              <h3 className="mt-1 text-lg font-black text-slate-900">Trạng thái kết nối bán hàng</h3>
              <div className="mt-5 space-y-3">
                {connectedChannels.length === 0 ? (
                  <EmptyState label="Chưa có kênh nào được kết nối. Vào Cài đặt để cấu hình Facebook, TikTok hoặc Zalo." />
                ) : (
                  connectedChannels.map((channel) => (
                    <div key={`${channel.platform}_${channel.username || channel.displayName}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                          <Radio className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{channel.platform}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{channel.displayName || channel.username || "Connected channel"}</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                        Active
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quick actions</div>
              <h3 className="mt-1 text-lg font-black text-slate-900">Di chuyển vào các khu vực vận hành</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              // Extract glow color
              let glowColor = "rgba(148, 163, 184, 0.05)";
              if (item.tone.includes("fuchsia")) glowColor = "rgba(217, 70, 239, 0.08)";
              else if (item.tone.includes("amber")) glowColor = "rgba(245, 158, 11, 0.08)";
              else if (item.tone.includes("emerald")) glowColor = "rgba(16, 185, 129, 0.08)";
              else if (item.tone.includes("sky")) glowColor = "rgba(14, 165, 233, 0.08)";

              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white/70 backdrop-blur-md text-left shadow-[0_8px_30px_rgba(0,0,0,0.015)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(0,0,0,0.04)] hover:border-slate-200/50"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.tone}`} />
                  <div 
                    className="absolute -bottom-8 -right-8 w-20 h-20 rounded-full blur-xl pointer-events-none transition-all duration-500 group-hover:scale-125" 
                    style={{ backgroundColor: glowColor }} 
                  />
                  <div className="space-y-4 p-5 flex flex-col justify-between h-[190px]">
                    <div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50/50 text-slate-500 border border-slate-100/50 group-hover:bg-white group-hover:text-indigo-600 transition-colors shadow-xs">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="mt-3.5">
                        <div className="text-sm font-black text-slate-800 tracking-tight group-hover:text-indigo-900 transition-colors">{item.title}</div>
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-400 font-semibold">{item.description}</div>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-indigo-600 transition-colors">
                      Mở nhanh
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
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
  value: string;
  description: string;
  icon: React.ElementType;
  tone: string;
  progress?: number;
}) {
  const isPink = tone.includes("pink");
  const isViolet = tone.includes("violet");
  const isEmerald = tone.includes("emerald");
  const isSky = tone.includes("sky");

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

function PipelineStep({
  label,
  value,
  stage,
  isLast,
}: {
  label: string;
  value: number;
  stage: "cold" | "warm" | "hot" | "won" | "upsell";
  isLast?: boolean;
}) {
  let icon = Inbox;
  let iconColor = "text-slate-455";
  let bgClass = "bg-slate-50 border-slate-100 hover:border-slate-350";
  let activeGlow = "rgba(148, 163, 184, 0.1)";

  if (stage === "cold") {
    icon = Inbox;
    iconColor = "text-slate-550";
    bgClass = "bg-slate-500/5 hover:bg-slate-500/10 border-slate-100/80 hover:border-slate-300";
    activeGlow = "rgba(148, 163, 184, 0.12)";
  } else if (stage === "warm") {
    icon = Zap;
    iconColor = "text-amber-500";
    bgClass = "bg-amber-500/5 hover:bg-amber-500/10 border-amber-200/50 hover:border-amber-300";
    activeGlow = "rgba(245, 158, 11, 0.15)";
  } else if (stage === "hot") {
    icon = Flame;
    iconColor = "text-rose-500 animate-pulse";
    bgClass = "bg-rose-500/5 hover:bg-rose-500/10 border-rose-200/50 hover:border-rose-300";
    activeGlow = "rgba(244, 63, 94, 0.15)";
  } else if (stage === "won") {
    icon = Award;
    iconColor = "text-emerald-550";
    bgClass = "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-200/50 hover:border-emerald-300";
    activeGlow = "rgba(16, 185, 129, 0.15)";
  } else if (stage === "upsell") {
    icon = ChevronUp;
    iconColor = "text-sky-550";
    bgClass = "bg-sky-500/5 hover:bg-sky-500/10 border-sky-200/50 hover:border-sky-300";
    activeGlow = "rgba(14, 165, 233, 0.15)";
  }

  const IconComponent = icon;

  return (
    <div className="flex items-center w-full">
      <div 
        className={`relative flex-1 rounded-2xl border px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_var(--glow)] ${bgClass}`}
        style={{ "--glow": activeGlow } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
          <span className={`p-1.5 rounded-lg bg-white shadow-2xs ${iconColor} flex items-center justify-center`}>
            <IconComponent className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2.5xl font-black text-slate-800 tracking-tight">{formatNumber(value)}</span>
          <span className="text-[9px] font-bold text-slate-455 uppercase tracking-wider">leads</span>
        </div>
      </div>
      
      {!isLast && (
        <div className="hidden xl:flex items-center justify-center px-1 text-slate-300/80">
          <ArrowRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="group rounded-2xl border border-slate-100/70 bg-white/50 backdrop-blur-xs p-4 transition-all duration-300 hover:bg-white hover:shadow-xs hover:border-indigo-500/10 hover:-translate-y-0.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors">{label}</div>
      <div className="mt-1.5 text-2.5xl font-black text-slate-800 tracking-tight transition-colors group-hover:text-slate-900">{formatNumber(value)}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200/60 bg-white/30 backdrop-blur-xs px-4 py-7 text-center text-xs font-semibold text-slate-400">
      {label}
    </div>
  );
}
