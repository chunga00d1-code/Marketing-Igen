import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChartNoAxesCombined, Link2, Megaphone, Sparkles, UsersRound } from "lucide-react";
import { DashboardFilledIcon, type DashboardFilledIconName } from "../components/DashboardFilledIcon";
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
  const priorityLeadCount = crmStats.warm + crmStats.hot;

  const quickLinks = [
    {
      title: "Tạo nội dung & chiến dịch",
      description: "Tạo bài đăng nhanh hoặc lập chiến dịch tự động.",
      href: "/marketing?sub=tao-chien-dich",
      icon: "content" as const,
    },
    {
      title: "Lịch đăng nội dung",
      description: "Theo dõi nội dung đã lên lịch và trạng thái xuất bản.",
      href: "/marketing?sub=lich-dang",
      icon: "calendar" as const,
    },
    {
      title: "Quản lý pipeline",
      description: "Theo dõi lead âm, nóng và cơ hội sắp chốt.",
      href: "/sales-crm?sub=pipeline",
      icon: "pipeline" as const,
    },
    {
      title: "Hộp thư hội thoại ",
      description: "Xử lý tin nhắn đa kênh tập trung từ Facebook, Zalo, TikTok.",
      href: "/sales-crm?sub=omni-chat",
      icon: "inbox" as const,
    },
  ];

  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto rounded-2xl bg-[#f6f9fd] p-3 text-slate-900 sm:p-4 xl:p-5">
      <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5">
        <section className="relative isolate overflow-hidden rounded-[24px] border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/70 px-5 py-4 shadow-[0_8px_28px_rgba(47,117,183,0.035)] sm:px-6">
          <div className="pointer-events-none absolute -right-8 -top-14 h-40 w-72 rounded-full bg-sky-100/60 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600"><ChartNoAxesCombined className="h-5 w-5" /></span>
              <div>
                <h2 className="text-xl font-normal tracking-tight text-slate-900">Tổng quan vận hành</h2>
                <p className="mt-0.5 text-sm text-slate-500">Theo dõi nội dung marketing, tiến độ chăm sóc lead và các kênh đang kết nối.</p>
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
              <OverviewSignal icon={CalendarDays} label="Đã lên lịch" value={marketingStats.scheduled} />
              <OverviewSignal icon={UsersRound} label="Lead ưu tiên" value={priorityLeadCount} />
              <OverviewSignal icon={Link2} label="Kênh kết nối" value={connectedChannels.length} />
            </div>
          </div>
        </section>
        <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
          <MetricCard
            title="Tổng bài marketing"
            value={formatNumber(marketingStats.total)}
            description={`${formatNumber(marketingStats.published)} đã xuất bản`}
            icon="marketing"
            tone="from-sky-500 to-blue-500"
            progress={marketingStats.total > 0 ? (marketingStats.published / marketingStats.total) * 100 : 0}
          />
          <MetricCard
            title="Xử lý / chờ duyệt"
            value={formatNumber(marketingStats.processing)}
            description="Bài đang chờ duyệt hoặc xử lý"
            icon="processing"
            tone="from-violet-500 to-violet-500"
            progress={marketingStats.total > 0 ? (marketingStats.processing / marketingStats.total) * 100 : 0}
          />
          <MetricCard
            title="Tổng lead CRM"
            value={formatNumber(crmStats.total)}
            description={`${formatNumber(crmStats.won)} lead đã chốt`}
            icon="leads"
            tone="from-[#05bd82] to-[#05bd82]"
            progress={crmStats.total > 0 ? (crmStats.won / crmStats.total) * 100 : 0}
          />
          <MetricCard
            title="Lead âm / nóng"
            value={`${formatNumber(crmStats.warm)} / ${formatNumber(crmStats.hot)}`}
            description="Cần ưu tiên chăm sóc và chốt đơn"
            icon="priority"
            tone="from-amber-500 to-amber-500"
            progress={
              (crmStats.warm + crmStats.hot) > 0
                ? (crmStats.hot / (crmStats.warm + crmStats.hot)) * 100
                : 0
            }
          />
        </section>

        <section className="grid min-w-0 gap-4">
          <div className="min-w-0 rounded-[22px] border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/30 p-4 shadow-[0_6px_24px_rgba(31,96,160,0.035)] sm:p-5">
            <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-sky-600"><UsersRound className="h-4 w-4" /> Sales CRM</div>
                <h3 className="mt-1 text-xl font-normal text-slate-900">Phân bổ pipeline hiện tại</h3>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("/sales-crm?sub=pipeline")}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-2 text-sm text-sky-700 transition hover:border-sky-300 hover:bg-sky-100/70"
              >
                Mở pipeline
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
              <PipelineStep label="Cold" value={crmStats.cold} total={crmStats.total} stage="cold" />
              <PipelineStep label="Warm" value={crmStats.warm} total={crmStats.total} stage="warm" />
              <PipelineStep label="Hot" value={crmStats.hot} total={crmStats.total} stage="hot" />
              <PipelineStep label="Won" value={crmStats.won} total={crmStats.total} stage="won" />
              <PipelineStep label="Upsell" value={crmStats.upsell} total={crmStats.total} stage="upsell" isLast />
            </div>

            <div className="mt-4 space-y-3">
              {focusLeads.length === 0 ? (
                <div className="flex min-h-[132px] flex-col items-center gap-3 rounded-[20px] border border-sky-100 bg-gradient-to-br from-sky-50/50 via-white to-white px-5 py-4 text-center sm:flex-row sm:text-left">
                  <EmptyIllustration icon="leads" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-normal text-slate-800">Chưa có lead Warm/Hot cần ưu tiên</h4>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
                      {crmStats.total === 0
                        ? "Pipeline chưa có lead. Thêm lead mới để bắt đầu theo dõi cơ hội bán hàng."
                        : crmStats.cold > 0
                          ? "Các lead hiện chưa ở giai đoạn Warm/Hot. Xem pipeline để tiếp tục chăm sóc và cập nhật trạng thái."
                          : "Hiện không có lead Warm/Hot trong danh sách ưu tiên. Xem pipeline để theo dõi các giai đoạn khác."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateTo("/sales-crm?sub=pipeline")}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#00adfc] px-5 py-2.5 text-xs text-white shadow-sm transition hover:bg-[#008fcf]"
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
                      className="group flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white/90 px-4 py-3 transition-colors hover:border-sky-300 hover:bg-sky-50/30"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`h-8 w-8 rounded-full ${badgeBg} flex items-center justify-center text-xs font-medium shrink-0`}>
                          {lead.customerName ? lead.customerName.charAt(0).toUpperCase() : "L"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">{lead.customerName}</div>
                          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                            <span className="max-w-32 truncate">{lead.company || "Cá nhân"}</span>
                            <span className="shrink-0">•</span>
                            <span className="truncate">{lead.lastInteraction || "Chưa tương tác"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium text-slate-800">{formatCurrency(Number(lead.value || 0))}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-md ${badgeBg}`}>
                          {lead.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
            <div className="min-w-0 rounded-[22px] border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/30 p-4 shadow-[0_6px_24px_rgba(31,96,160,0.035)] sm:p-5">
              <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-sky-600"><Megaphone className="h-4 w-4" /> Marketing</div>
                  <h3 className="mt-1 text-xl font-normal text-slate-900">Nhịp độ content và publishing</h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo("/marketing?sub=lich-dang")}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-2 text-sm text-sky-700 transition hover:border-sky-300 hover:bg-sky-100/70"
                >
                  Xem lịch
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <MiniStat label="Đã xuất bản" value={marketingStats.published} tone="emerald" />
                <MiniStat label="Đã lên lịch" value={marketingStats.scheduled} tone="sky" />
                <MiniStat label="Đang xử lý" value={marketingStats.processing} tone="violet" />
                <MiniStat label="Tổng asset" value={marketingStats.total} tone="amber" />
              </div>

              <div className="mt-4 space-y-3">
                {recentMarketing.length === 0 ? (
                  <EmptyState label="Chưa có bài marketing nào để hiển thị trong dashboard." icon="marketing" />
                ) : (
                  recentMarketing.map((item) => (
                    <div key={item.id} className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            title={item.title}
                            className="truncate text-sm font-medium text-slate-800"
                          >
                            {item.title.length > 96
                              ? item.title.slice(0, 96).trimEnd() + '…'
                              : item.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.channel} • {item.contentType || "Marketing content"}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Cập nhật: {formatTimeLabel(item.publishedAt || item.generatedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="min-w-0 rounded-[22px] border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/30 p-4 shadow-[0_6px_24px_rgba(31,96,160,0.035)] sm:p-5">
              <div className="flex items-center gap-2 text-xs text-sky-600"><Link2 className="h-4 w-4" /> Channels</div>
              <h3 className="mt-1 text-xl font-normal text-slate-900">Trạng thái kết nối bán hàng</h3>
              <div className="mt-4 space-y-3">
                {connectedChannels.length === 0 ? (
                  <EmptyState label="Chưa có kênh nào được kết nối. Vào Cài đặt để cấu hình Facebook, TikTok hoặc Zalo." icon="channel" />
                ) : (
                  connectedChannels.map((channel) => (
                    <div key={`${channel.platform}_${channel.username || channel.displayName}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#00adfc]">
                          <DashboardFilledIcon name="channel" className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">{channel.platform}</div>
                          <div className="truncate text-xs text-slate-500">{channel.displayName || channel.username || "Connected channel"}</div>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-[22px] border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/30 p-4 shadow-[0_6px_24px_rgba(31,96,160,0.035)] sm:p-5">
          <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-sky-600"><Sparkles className="h-4 w-4" /> Quick actions</div>
              <h3 className="mt-1 text-xl font-normal text-slate-900">Di chuyển vào các khu vực vận hành</h3>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
            {quickLinks.map((item, index) => {
              const accents = ["border-sky-100 from-sky-50/70 via-white to-white", "border-blue-100 from-blue-50/70 via-white to-white", "border-emerald-100 from-emerald-50/70 via-white to-white", "border-violet-100 from-violet-50/70 via-white to-white"];
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className={`group relative min-w-0 overflow-hidden rounded-2xl border bg-gradient-to-br text-left shadow-[0_6px_20px_rgba(31,96,160,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${accents[index]}`}
                >
                  <div className="flex min-h-[150px] flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100/80 text-[#00adfc]">
                        <DashboardFilledIcon name={item.icon} className="h-4.5 w-4.5" />
                      </div>
                      <div className="mt-2.5">
                        <div className="text-sm font-medium text-slate-900">{item.title}</div>
                        <div className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</div>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 text-xs font-medium text-[#008fcf]">
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

function OverviewSignal({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-sky-100 bg-white/85 px-2.5 py-2 shadow-sm sm:min-w-28">
      <Icon className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
      <div className="min-w-0 leading-tight">
        <span className="block truncate text-[10px] text-slate-500">{label}</span>
        <span className="block text-sm text-slate-800">{formatNumber(value)}</span>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
  tone,
  progress,
}: {
  title: string;
  value: string;
  description: string;
  icon: DashboardFilledIconName;
  tone: string;
  progress?: number;
}) {
  const isPink = tone.includes("pink");
  const isViolet = tone.includes("violet");
  const isEmerald = tone.includes("emerald") || tone.includes("#05bd82");
  const isAmber = tone.includes("amber");
  const isSky = tone.includes("sky");

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
  } else if (isAmber) {
    surface = "border-orange-100 from-orange-50 via-white to-amber-50/60";
    iconBg = "bg-orange-100 text-orange-600";
    labelColor = "text-orange-700";
    decorativeBar = "bg-orange-200/70";
    progressBg = "bg-orange-100";
    progressBar = "bg-orange-400";
  } else if (isSky) {
    surface = "border-sky-100 from-sky-50 via-white to-blue-50/60";
    iconBg = "bg-sky-100 text-sky-600";
    labelColor = "text-sky-700";
    decorativeBar = "bg-sky-200/70";
    progressBg = "bg-sky-100";
    progressBar = "bg-sky-400";
  }

  return (
    <div className={`group relative flex min-h-[154px] min-w-0 flex-col justify-between overflow-hidden rounded-[20px] border bg-gradient-to-br p-4 shadow-[0_6px_24px_rgba(31,96,160,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${surface}`}>
      <div className="relative z-10 flex min-w-0 items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <DashboardFilledIcon name={icon} className="h-4.5 w-4.5" />
        </span>
        <span className={`min-w-0 text-xs leading-snug ${labelColor}`}>{title}</span>
      </div>
      <div className="pointer-events-none absolute right-4 top-14 flex h-12 items-end gap-1 opacity-70" aria-hidden="true">
        {["h-3", "h-5", "h-7", "h-10"].map((height) => <span key={height} className={`w-2.5 rounded-t ${height} ${decorativeBar}`} />)}
      </div>

      <div className="relative z-10 mt-3">
        <h4 className="break-words text-[28px] font-normal leading-none tracking-tight text-slate-900">{value}</h4>

        {progress !== undefined && (
          <div className="mt-2.5 space-y-1.5">
            <div className={`h-1.5 w-full overflow-hidden rounded-full ${progressBg}`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressBar}`}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <div className="flex min-w-0 justify-between gap-2 text-xs text-slate-500">
              <span className="min-w-0">{description}</span>
              <span className="shrink-0">{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {progress === undefined && (
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        )}
      </div>
    </div>
  );
}

function PipelineStep({
  label,
  value,
  total,
  stage,
  isLast,
}: {
  label: string;
  value: number;
  total: number;
  stage: "cold" | "warm" | "hot" | "won" | "upsell";
  isLast?: boolean;
}) {
  let iconColor = "text-slate-455";
  let iconBg = "bg-slate-100";
  let labelColor = "text-slate-700";
  let bgClass = "border-slate-100 from-slate-50 via-white to-slate-50";
  let progressClass = "bg-slate-400";
  let activeGlow = "rgba(148, 163, 184, 0.1)";

  if (stage === "cold") {
    iconColor = "text-sky-600";
    iconBg = "bg-sky-100/70";
    labelColor = "text-sky-800";
    bgClass = "border-sky-100 from-sky-50 via-white to-blue-50/60 hover:border-sky-300";
    progressClass = "bg-sky-400";
    activeGlow = "rgba(0, 173, 252, 0.12)";
  } else if (stage === "warm") {
    iconColor = "text-amber-500";
    iconBg = "bg-amber-100/70";
    labelColor = "text-amber-700";
    bgClass = "border-amber-100 from-amber-50 via-white to-orange-50/60 hover:border-amber-300";
    progressClass = "bg-amber-400";
    activeGlow = "rgba(245, 158, 11, 0.15)";
  } else if (stage === "hot") {
    iconColor = "text-rose-500";
    iconBg = "bg-rose-100/70";
    labelColor = "text-rose-700";
    bgClass = "border-rose-100 from-rose-50 via-white to-pink-50/60 hover:border-rose-300";
    progressClass = "bg-rose-400";
    activeGlow = "rgba(244, 63, 94, 0.15)";
  } else if (stage === "won") {
    iconColor = "text-[#05a971]";
    iconBg = "bg-[#dff7eb]";
    labelColor = "text-[#008c61]";
    bgClass = "border-emerald-100 from-emerald-50 via-white to-teal-50/60 hover:border-emerald-300";
    progressClass = "bg-emerald-400";
    activeGlow = "rgba(16, 185, 129, 0.15)";
  } else if (stage === "upsell") {
    iconColor = "text-violet-600";
    iconBg = "bg-violet-100/70";
    labelColor = "text-violet-700";
    bgClass = "border-violet-100 from-violet-50 via-white to-purple-50/60 hover:border-violet-300";
    progressClass = "bg-violet-400";
    activeGlow = "rgba(139, 92, 246, 0.15)";
  }

  return (
    <div className="flex min-w-0 items-center">
      <div
        className={`relative flex min-h-[96px] min-w-0 flex-1 flex-col justify-between rounded-2xl border bg-gradient-to-br px-3.5 py-3 shadow-[0_6px_20px_rgba(31,96,160,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_var(--glow)] ${bgClass}`}
        style={{ "--glow": activeGlow } as React.CSSProperties}
      >
        <div className="flex flex-row-reverse items-center justify-end gap-2">
          <span className={`text-sm ${labelColor}`}>{label}</span>
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
            <DashboardFilledIcon name={stage} className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-normal tracking-tight text-slate-900">{formatNumber(value)}</span>
          <span className="text-sm text-slate-500">leads</span>
        </div>
        {total > 0 && (
          <div className="mt-2.5">
            <div className="h-1 overflow-hidden rounded-full bg-white/80">
              <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${(value / total) * 100}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{Math.round((value / total) * 100)}% tổng lead</p>
          </div>
        )}
      </div>

      {!isLast && (
        <div className="hidden items-center justify-center px-1 text-slate-400 xl:flex">
          <ArrowRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "violet" | "amber" }) {
  const surfaces = {
    emerald: "border-emerald-100 from-emerald-50 via-white to-white text-emerald-700",
    sky: "border-sky-100 from-sky-50 via-white to-white text-sky-700",
    violet: "border-violet-100 from-violet-50 via-white to-white text-violet-700",
    amber: "border-amber-100 from-amber-50 via-white to-white text-amber-700",
  };
  return (
    <div className={`group min-w-0 rounded-xl border bg-gradient-to-br p-3.5 transition-colors ${surfaces[tone]}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1.5 text-2xl font-normal tracking-tight text-slate-900">{formatNumber(value)}</div>
    </div>
  );
}

function EmptyIllustration({ icon }: { icon: DashboardFilledIconName }) {
  return (
    <div className="relative flex h-20 w-28 items-center justify-center" aria-hidden="true">
      <span className="absolute left-0 top-9 h-3 w-3 rounded-full bg-sky-100" />
      <span className="absolute right-1 top-2 h-4 w-4 rounded-full bg-sky-100" />
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-sky-100 text-sky-500 shadow-sm">
        <DashboardFilledIcon name={icon} className="h-8 w-8" />
      </div>
    </div>
  );
}

function EmptyState({ label, icon }: { label: string; icon: DashboardFilledIconName }) {
  return (
    <div className="flex min-h-[170px] flex-col items-center justify-center rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/50 via-white to-white px-5 py-6 text-center">
      <EmptyIllustration icon={icon} />
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{label}</p>
    </div>
  );
}
