import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Megaphone,
  MessageSquareShare,
  Radio,
  Sparkles,
  Target,
  Users,
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
      title: "Lên ý tưởng campaign",
      description: "Tạo nhanh brief và hướng nội dung AI cho team marketing.",
      href: "/marketing?sub=y-tuong",
      icon: Sparkles,
      tone: "from-fuchsia-500 via-purple-500 to-indigo-500",
    },
    {
      title: "Duyệt và xuất bản",
      description: "Kiểm tra bài viết, media và tình trạng lịch đăng.",
      href: "/marketing?sub=duyet-noi-dung",
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
          />
          <MetricCard
            title="Xử lý / chờ duyệt"
            value={formatNumber(marketingStats.processing)}
            description="Bài đang pending hoặc đang xử lý"
            icon={Sparkles}
            tone="from-violet-500 to-indigo-500"
          />
          <MetricCard
            title="Tổng lead CRM"
            value={formatNumber(crmStats.total)}
            description={`${formatNumber(crmStats.won)} lead đã chốt`}
            icon={Users}
            tone="from-emerald-500 to-teal-500"
          />
          <MetricCard
            title="Lead âm / nóng"
            value={`${formatNumber(crmStats.warm)} / ${formatNumber(crmStats.hot)}`}
            description="Cần ưu tiên chăm sóc và chốt đơn"
            icon={Target}
            tone="from-sky-500 to-cyan-500"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Sales CRM</div>
                <h3 className="mt-1 text-xl font-black text-slate-900">Phân bổ pipeline hiện tại</h3>
              </div>
              <button
                type="button"
                onClick={() => navigateTo("/sales-crm?sub=pipeline")}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Mở pipeline
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <FunnelCard label="Cold" value={crmStats.cold} tone="bg-slate-100 text-slate-700 border-slate-200" />
              <FunnelCard label="Warm" value={crmStats.warm} tone="bg-amber-50 text-amber-700 border-amber-200" />
              <FunnelCard label="Hot" value={crmStats.hot} tone="bg-rose-50 text-rose-700 border-rose-200" />
              <FunnelCard label="Won" value={crmStats.won} tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
              <FunnelCard label="Upsell" value={crmStats.upsell} tone="bg-sky-50 text-sky-700 border-sky-200" />
            </div>

            <div className="mt-5 space-y-3">
              {focusLeads.length === 0 ? (
                <EmptyState label="Chưa có lead warm/hot nào để đưa vào danh sách ưu tiên." />
              ) : (
                focusLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">{lead.customerName}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{lead.company || "Chưa có công ty"}</span>
                        <span>•</span>
                        <span>{lead.lastInteraction || "Mới tiếp cận"}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900">{formatCurrency(Number(lead.value || 0))}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">{lead.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Marketing</div>
                  <h3 className="mt-1 text-xl font-black text-slate-900">Nhịp độ content và publishing</h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo("/marketing?sub=lich-dang")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
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
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900">{item.title}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {item.channel} • {item.contentType || "Marketing content"}
                          </div>
                        </div>
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400">
                        Cập nhật: {formatTimeLabel(item.publishedAt || item.generatedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Channels</div>
              <h3 className="mt-1 text-xl font-black text-slate-900">Trạng thái kết nối bán hàng</h3>
              <div className="mt-5 space-y-3">
                {connectedChannels.length === 0 ? (
                  <EmptyState label="Chưa có kênh nào được kết nối. Vào Cài đặt để cấu hình Facebook, TikTok hoặc Zalo." />
                ) : (
                  connectedChannels.map((channel) => (
                    <div key={`${channel.platform}_${channel.username || channel.displayName}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                          <Radio className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{channel.platform}</div>
                          <div className="text-[11px] text-slate-500">{channel.displayName || channel.username || "Connected channel"}</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Active
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Quick actions</div>
              <h3 className="mt-1 text-xl font-black text-slate-900">Di chuyển vào các khu vực vận hành</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className="group overflow-hidden rounded-[24px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className={`h-2 bg-gradient-to-r ${item.tone}`} />
                  <div className="space-y-4 p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-black text-slate-900">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-500">{item.description}</div>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 transition group-hover:text-slate-900">
                      Mở nhanh
                      <ArrowRight className="h-3.5 w-3.5" />
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
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
      <div className={`h-1.5 bg-gradient-to-r ${tone}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</div>
            <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">{value}</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${tone}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider">{label}</div>
      <div className="mt-2 text-2xl font-black">{formatNumber(value)}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-900">{formatNumber(value)}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}
