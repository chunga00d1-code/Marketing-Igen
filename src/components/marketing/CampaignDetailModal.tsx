import React, { useState, useEffect } from 'react';
import { CalendarClock, X, Loader2, RotateCcw } from 'lucide-react';
import { CampaignStatus, MarketingCampaignSummary } from '../../services/marketingCampaignService';
import { CampaignSlotsTable } from './CampaignSlotsTable';
import { CampaignSlotDetail } from './CampaignSlotDetail';

interface CampaignSlot {
  _id: string;
  pillar: string;
  objective?: string;
  topicBrief: string;
  scheduledAt: string;
  status: string;
  variant?: string;
  platform?: string;
  errorMessage?: string;
  publishedPostUrl?: string;
  ingestedMedia?: Array<{ sourceUrl: string; url: string; uploadedAt: string }>;
  researchAnalysis?: {
    context: string;
    model: string;
    researchedAt: string;
    cost: number;
    evidence: Array<{
      source: 'google' | 'facebook' | 'tiktok';
      sourceUrl: string;
      title?: string;
      text: string;
      author?: string;
      publishedAt?: string;
      collectedAt: string;
      metrics?: { views?: number; likes?: number; comments?: number; shares?: number };
    }>;
    apifyRuns: Array<{
      source: 'google' | 'facebook' | 'tiktok';
      actorId: string;
      runId?: string;
      datasetId?: string;
      status: 'succeeded' | 'failed' | 'skipped';
      itemCount: number;
      estimatedCostUsd: number;
      providerCostUsd: number;
      billingMode: 'shadow' | 'live';
      executedAt: string;
      error?: string;
    }>;
    providerCostUsd: number;
    billingMode: 'shadow' | 'live';
    billedAt?: string;
  };
  visualAnalysis?: {
    sourceUrls: string[];
    summary: string;
    subjects: string[];
    visibleText: string[];
    setting: string;
    visualStyle: string;
    mood: string;
    factualDetails: string[];
    marketingAngles: string[];
    cautions: string[];
    model: string;
    analyzedAt: string;
    cost: number;
    billedAt?: string;
  };
  lastError?: {
    type: string;
    message: string;
    occurredAt: string;
  };
  content?: {
    _id: string;
    title?: string;
    bodyText?: string;
    outline?: string;
    mediaPrompt?: string;
    mediaUrls?: string[];
    mediaType?: 'text' | 'image' | 'video';
  } | null;
}

interface CampaignDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  loadingDetail: boolean;
  campaignDetail: { campaign: MarketingCampaignSummary; slots: CampaignSlot[] } | null;
  statusLabel: Record<CampaignStatus, string>;
  slotStatusColors: Record<string, string>;
  slotStatusLabel: Record<string, string>;
  onRetrySlot?: (campaignId: string, slotId: string) => Promise<void>;
  onRetryAll?: (campaignId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onUpdateSlot?: (slotId: string, updatedFields: Partial<CampaignSlot>) => void;
}

export default function CampaignDetailModal({
  isOpen,
  onClose,
  loadingDetail,
  campaignDetail,
  statusLabel,
  slotStatusColors,
  slotStatusLabel,
  onRetrySlot,
  onRetryAll,
  onRefresh,
  onUpdateSlot,
}: CampaignDetailModalProps) {
  const [retryingAll, setRetryingAll] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<CampaignSlot | null>(null);
  const [isBatchPreparing, setIsBatchPreparing] = useState(false);

  // Derive current active slot detail from fresh api data if available
  const activeSlot = campaignDetail?.slots.find(s => s._id === selectedSlot?._id) || null;

  // Reset active slot when campaign changes
  useEffect(() => {
    setSelectedSlot(null);
  }, [campaignDetail?.campaign?._id]);

  if (!isOpen) return null;

  // Compute detailed status counts & next/last slots
  const now = new Date();
  const sortedSlots = [...(campaignDetail?.slots || [])].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  const totalSlots = sortedSlots.length;
  const publishedSlots = sortedSlots.filter((s) => s.status === 'published').length;
  
  const inProgressSlots = sortedSlots.filter((s) =>
    ['queued', 'generating', 'researching', 'writing', 'scoring', 'generating_media', 'verifying', 'pending_approval', 'ready_to_publish', 'publishing', 'retrying'].includes(s.status)
  ).length;

  const nextSlot = sortedSlots.find(
    (s) =>
      ['planned', 'queued', 'generating', 'researching', 'writing', 'scoring', 'generating_media', 'verifying', 'ready_to_publish', 'publishing', 'retrying'].includes(s.status) &&
      new Date(s.scheduledAt) > now
  );

  const lastPublishedSlot = [...sortedSlots]
    .reverse()
    .find((s) => s.status === 'published');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
      <div className={`relative w-full ${activeSlot ? 'max-w-7xl' : 'max-w-5xl'} max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transition-all duration-300 animate-scaleIn`}>
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <CalendarClock size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-850">
                {loadingDetail ? 'Đang tải...' : campaignDetail?.campaign?.title || 'Chi tiết chiến dịch'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {!loadingDetail && campaignDetail && `${campaignDetail.campaign.startDate} → ${campaignDetail.campaign.endDate} · ${campaignDetail.campaign.statistics.totalSlots} bài viết`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingDetail ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <span className="text-xs text-slate-500 font-semibold font-mono">ĐANG TẢI CHI TIẾT CHIẾN DỊCH...</span>
            </div>
          ) : campaignDetail ? (
            <>
              <div className="flex flex-col lg:flex-row gap-6 mb-6">
                
                {/* Left Column: Stats, Info, and Table */}
                <div className="space-y-6 flex-1 min-w-0 transition-all duration-300">
                  
                  {/* Real-time Activity Banner */}
                  {campaignDetail.campaign.status === 'active' && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/25 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-3 w-3 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 flex flex-wrap items-center gap-1.5 leading-none">
                            Chiến dịch đang hoạt động tự động
                            <span className="text-[9px] font-bold font-mono text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 rounded animate-pulse">
                              Auto-Polling Live
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-505 mt-1">
                            {inProgressSlots > 0
                              ? `Đang có ${inProgressSlots} bài viết đang trong tiến trình xử lý (AI soạn thảo, chấm điểm, thiết kế ảnh)...`
                              : 'Hệ thống đang chạy ngầm ổn định, chờ đến khung giờ tiếp theo để xử lý bài viết.'}
                          </p>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 text-left md:text-right shrink-0 font-sans leading-relaxed">
                        {nextSlot && (
                          <p>
                            <b>Bài tiếp theo:</b> {new Intl.DateTimeFormat('vi-VN', {
                              timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                            }).format(new Date(nextSlot.scheduledAt))}
                          </p>
                        )}
                        {lastPublishedSlot && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <b>Đã đăng gần nhất:</b> {new Intl.DateTimeFormat('vi-VN', {
                              timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                            }).format(new Date(lastPublishedSlot.scheduledAt))}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Campaign Info Cards */}
                  <div className={`grid grid-cols-1 gap-4 ${activeSlot ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Trạng thái</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${campaignDetail.campaign.status === 'active' ? 'bg-green-50 text-green-700' : campaignDetail.campaign.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-150 text-slate-655'}`}>
                          {statusLabel[campaignDetail.campaign.status]}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Sản lượng</span>
                      <p className="mt-1.5 text-xs font-bold text-slate-800">
                        Đã xuất bản {publishedSlots} / {totalSlots} bài viết
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{
                            width: `${totalSlots > 0 ? Math.round((publishedSlots / totalSlots) * 100) : 0}%`
                          }}
                        />
                      </div>
                      <span className="mt-1.5 block text-[9px] text-slate-400 font-bold font-mono">
                        Tiến độ hoàn thành: {totalSlots > 0 ? Math.round((publishedSlots / totalSlots) * 100) : 0}%
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Cấu hình</span>
                      <div className="mt-1.5 text-xs text-slate-600 leading-relaxed font-sans">
                        <p><b>Khung giờ:</b> {campaignDetail.campaign.postingTimes.join(', ')}</p>
                        <p className="mt-0.5"><b>Mật độ:</b> {campaignDetail.campaign.postsPerDay} bài/ngày</p>
                      </div>
                    </div>
                  </div>

                  {/* Expandable/Scrollable Brief Box & Research Report */}
                  <div className={`grid grid-cols-1 gap-4 ${activeSlot ? '' : 'md:grid-cols-2'}`}>
                    <div className="rounded-xl border border-slate-150 p-4 bg-slate-50/30">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono mb-2">Định hướng chiến dịch (Source Brief)</span>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed h-48 overflow-y-auto p-3 border border-slate-100 bg-white rounded-lg">
                        {campaignDetail.campaign.sourceBrief}
                      </pre>
                    </div>
                    {campaignDetail.campaign.researchReport ? (
                      <div className="rounded-xl border border-indigo-150 p-4 bg-indigo-50/10">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block font-mono mb-2">Báo cáo nghiên cứu & Xu hướng</span>
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed h-48 overflow-y-auto p-3 border border-indigo-50 bg-white rounded-lg">
                          {campaignDetail.campaign.researchReport}
                        </pre>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-150 p-4 bg-slate-50/30 flex items-center justify-center h-full">
                        <p className="text-xs text-slate-400 font-medium">Không có dữ liệu nghiên cứu xu hướng.</p>
                      </div>
                    )}
                  </div>

                  {/* Content Pillars */}
                  {campaignDetail.campaign.contentPillars?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono mb-2.5">Các trụ cột nội dung (Content Pillars)</span>
                      <div className="flex flex-wrap gap-2">
                        {campaignDetail.campaign.contentPillars.map((pillar, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 select-none">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            {pillar}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div> {/* Close Left Column */}

                {/* Right Column: Preview & Editor Panel */}
                {activeSlot && (
                  <CampaignSlotDetail
                    campaign={campaignDetail.campaign}
                    activeSlot={activeSlot}
                    onRefresh={onRefresh}
                    onUpdateSlot={onUpdateSlot}
                    onRetrySlot={onRetrySlot}
                    slotStatusColors={slotStatusColors}
                    slotStatusLabel={slotStatusLabel}
                    onCloseDetail={() => setSelectedSlot(null)}
                  />
                )}

              </div>

              {/* Slots Table */}
              <CampaignSlotsTable
                campaign={campaignDetail.campaign}
                slots={campaignDetail.slots}
                activeSlot={activeSlot}
                onSelectSlot={setSelectedSlot}
                onRetrySlot={onRetrySlot}
                onRefresh={onRefresh}
                slotStatusColors={slotStatusColors}
                slotStatusLabel={slotStatusLabel}
                isBatchPreparing={isBatchPreparing}
                setIsBatchPreparing={setIsBatchPreparing}
              />
            </>
          ) : (
            <div className="text-center py-10 text-slate-400 font-sans">Không có thông tin chi tiết.</div>
          )}
        </div>
        
        {/* Modal Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50/50">
          <div>
            {onRetryAll && campaignDetail?.campaign?.status === 'active' && sortedSlots.some(s => s.status === 'needs_attention' || s.status === 'failed') && (
              <button
                type="button"
                disabled={retryingAll}
                onClick={async () => {
                  setRetryingAll(true);
                  try {
                    await onRetryAll(campaignDetail.campaign._id);
                  } finally {
                    setRetryingAll(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition cursor-pointer disabled:opacity-50"
              >
                {retryingAll ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Thử lại tất cả slot lỗi
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition active:scale-98 cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
export type { CampaignSlot };
