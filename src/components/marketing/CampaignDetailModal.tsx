import React, { useState, useEffect } from 'react';
import { CalendarClock, FolderOpen, X, Loader2, RotateCcw } from 'lucide-react';
import { CampaignStatus, MarketingCampaignSummary } from '../../services/marketingCampaignService';
import { CampaignSlotsTable } from './CampaignSlotsTable';
import { CampaignSlotDetail } from './CampaignSlotDetail';
import { socketService } from '../../services/socketService';
import CampaignAssetOrderSheet from './CampaignAssetOrderSheet';
import CampaignDriveImportPanel from './CampaignDriveImportPanel';
import { openContentStudio } from '../../utils/contentStudioNavigation';

const DETAIL_LIST_ITEMS_PER_PAGE = 8;

export interface CampaignSlot {
  _id: string;
  pillar: string;
  objective?: string;
  topicBrief: string;
  scheduledAt: string;
  status: string;
  variant?: string;
  platform?: string;
  integrationId?: string;
  errorMessage?: string;
  publishedPostUrl?: string;
  realImageDirectUrls?: string[];
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
    videoUrl?: string;
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

interface DetailListPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onChange: (page: number) => void;
}

function DetailListPagination({ currentPage, totalPages, totalItems, onChange }: DetailListPaginationProps) {
  const firstItem = (currentPage - 1) * DETAIL_LIST_ITEMS_PER_PAGE + 1;
  const lastItem = Math.min(currentPage * DETAIL_LIST_ITEMS_PER_PAGE, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
      <span className="font-medium text-slate-500">
        Hiển thị {firstItem}–{lastItem} / {totalItems} mục
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onChange(currentPage - 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-650 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
        >
          Trước
        </button>
        <span className="font-medium text-slate-500">Trang {currentPage}/{totalPages}</span>
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onChange(currentPage + 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-650 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  );
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
  const [campaignResearchTab, setCampaignResearchTab] = useState<'summary' | 'evidence'>('summary');
  const [activeMainTab, setActiveMainTab] = useState<'published_links' | 'research' | 'overall_strategy' | 'content_pillar' | 'content_calendar' | 'asset_orders'>('content_calendar');
  const [publishedPage, setPublishedPage] = useState(1);
  const [researchEvidencePage, setResearchEvidencePage] = useState(1);

  // Filter slots that have published URLs
  const publishedSlotsList = React.useMemo(() => {
    if (!campaignDetail?.slots) return [];
    return campaignDetail.slots.filter(s => s.status === 'published' || s.publishedPostUrl);
  }, [campaignDetail?.slots]);

  // 1. Gather all unique research evidence items from all slots in the campaign
  const allResearchEvidence = React.useMemo(() => {
    if (!campaignDetail?.slots) return [];
    const seenUrls = new Set<string>();
    const list: Array<{
      source: 'google' | 'facebook' | 'tiktok';
      sourceUrl: string;
      title?: string;
      text: string;
      author?: string;
      publishedAt?: string;
      collectedAt: string;
      metrics?: { views?: number; likes?: number; comments?: number; shares?: number };
    }> = [];
    for (const slot of campaignDetail.slots) {
      if (slot.researchAnalysis?.evidence) {
        for (const ev of slot.researchAnalysis.evidence) {
          const url = ev.sourceUrl?.toLowerCase().trim();
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            list.push(ev);
          }
        }
      }
    }
    return list;
  }, [campaignDetail?.slots]);

  const totalPublishedPages = Math.max(1, Math.ceil(publishedSlotsList.length / DETAIL_LIST_ITEMS_PER_PAGE));
  const totalResearchEvidencePages = Math.max(1, Math.ceil(allResearchEvidence.length / DETAIL_LIST_ITEMS_PER_PAGE));
  const paginatedPublishedSlots = React.useMemo(
    () => publishedSlotsList.slice((publishedPage - 1) * DETAIL_LIST_ITEMS_PER_PAGE, publishedPage * DETAIL_LIST_ITEMS_PER_PAGE),
    [publishedPage, publishedSlotsList]
  );
  const paginatedResearchEvidence = React.useMemo(
    () => allResearchEvidence.slice((researchEvidencePage - 1) * DETAIL_LIST_ITEMS_PER_PAGE, researchEvidencePage * DETAIL_LIST_ITEMS_PER_PAGE),
    [allResearchEvidence, researchEvidencePage]
  );

  // 2. Parse the aggregated research summary & keywords from the slots
  const parsedEvidenceSummary = React.useMemo(() => {
    if (!campaignDetail?.slots) return null;
    let summaryText = '';
    const keywordsSet = new Set<string>();
    const anglesList: string[] = [];
    const painPointsList: string[] = [];
    const factsList: string[] = [];

    for (const slot of campaignDetail.slots) {
      if (slot.researchAnalysis?.context) {
        try {
          const parsed = JSON.parse(slot.researchAnalysis.context);
          if (parsed && typeof parsed === 'object') {
            if (!summaryText && (parsed.summary || parsed.contextSummary)) {
              summaryText = parsed.summary || parsed.contextSummary;
            }
            if (Array.isArray(parsed.topKeywords || parsed.keywords)) {
              const kws = parsed.topKeywords || parsed.keywords;
              kws.forEach((k: string) => {
                if (k) keywordsSet.add(k);
              });
            }
            if (Array.isArray(parsed.angles)) {
              parsed.angles.forEach((a: string) => {
                if (a && !anglesList.includes(a)) anglesList.push(a);
              });
            }
            if (Array.isArray(parsed.painPoints)) {
              parsed.painPoints.forEach((p: string) => {
                if (p && !painPointsList.includes(p)) painPointsList.push(p);
              });
            }
            if (Array.isArray(parsed.facts)) {
              parsed.facts.forEach((f: string) => {
                if (f && !factsList.includes(f)) factsList.push(f);
              });
            }
          }
        } catch {
          // not JSON
        }
      }
    }

    return {
      summary: summaryText,
      topKeywords: Array.from(keywordsSet),
      angles: anglesList.slice(0, 8),
      painPoints: painPointsList.slice(0, 8),
      facts: factsList.slice(0, 8),
    };
  }, [campaignDetail?.slots]);

  // Derive current active slot detail from fresh api data if available
  const activeSlot = campaignDetail?.slots.find(s => s._id === selectedSlot?._id) || null;

  // Reset active slot when campaign changes
  useEffect(() => {
    setSelectedSlot(null);
    setPublishedPage(1);
    setResearchEvidencePage(1);
  }, [campaignDetail?.campaign?._id]);

  useEffect(() => {
    setPublishedPage((page) => Math.min(page, totalPublishedPages));
  }, [totalPublishedPages]);

  useEffect(() => {
    setResearchEvidencePage((page) => Math.min(page, totalResearchEvidencePages));
  }, [totalResearchEvidencePages]);

  // Subscribe to real-time socket updates for campaign slots
  useEffect(() => {
    if (!isOpen || !campaignDetail?.campaign?._id) return;

    let timer: NodeJS.Timeout | null = null;
    const unsub = socketService.onCampaignSlotUpdate((data) => {
      if (data.campaignId === campaignDetail.campaign._id) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          onRefresh?.();
        }, 1200);
      }
    });

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, campaignDetail?.campaign?._id, onRefresh]);

  if (!isOpen) return null;

  // Compute detailed status counts & next/last slots
  const sortedSlots = [...(campaignDetail?.slots || [])].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  const totalSlots = sortedSlots.length;
  const publishedSlots = sortedSlots.filter((s) => s.status === 'published').length;

  const inProgressSlots = sortedSlots.filter((s) =>
    ['queued', 'generating', 'researching', 'writing', 'scoring', 'awaiting_assets', 'generating_media', 'verifying', 'pending_approval', 'ready_to_publish', 'publishing', 'retrying'].includes(s.status)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
      <div className="relative w-full max-w-7xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transition-all duration-300 animate-scaleIn">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-150 px-6 py-4 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 shrink-0">
              <CalendarClock size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-850 truncate">
                  {loadingDetail ? 'AI đang tổng hợp chiến dịch...' : campaignDetail?.campaign?.title || 'Chi tiết chiến dịch'}
                </h3>
                {campaignDetail?.campaign?.companyCode && (
                  <span className="rounded bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 font-mono shrink-0">
                    {campaignDetail.campaign.companyCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {!loadingDetail && campaignDetail && `${campaignDetail.campaign.startDate} → ${campaignDetail.campaign.endDate} · ${campaignDetail.campaign.statistics.totalSlots} bài viết`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-150 hover:text-slate-700 transition cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Navigation Tabs Header */}
        {!loadingDetail && campaignDetail && (
          <div className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-slate-100/90 px-6 pt-2.5 flex items-center gap-1.5 select-none overflow-x-auto whitespace-nowrap scrollbar-none">
            {/* <button
              type="button"
              onClick={() => setActiveMainTab('published_links')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${activeMainTab === 'published_links'
                ? 'bg-teal-600 border-teal-700 text-white shadow-2xs font-extrabold -mb-px'
                : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-800'
                }`}
            >
              Link theo dõi bài đăng FB ({publishedSlotsList.length})
            </button> */}
            <button
              type="button"
              onClick={() => setActiveMainTab('research')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${activeMainTab === 'research'
                ? 'bg-teal-600 border-teal-700 text-white shadow-2xs font-extrabold -mb-px'
                : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-800'
                }`}
            >
              Research & Xu hướng ({allResearchEvidence.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('overall_strategy')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${activeMainTab === 'overall_strategy'
                ? 'bg-teal-600 border-teal-700 text-white shadow-2xs font-extrabold -mb-px'
                : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-800'
                }`}
            >
              Chiến lược tổng
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('content_pillar')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${activeMainTab === 'content_pillar'
                ? 'bg-teal-600 border-teal-700 text-white shadow-2xs font-extrabold -mb-px'
                : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-800'
                }`}
            >
              Nhóm chủ đề ({campaignDetail.campaign.contentMatrix?.length || campaignDetail.campaign.contentPillars?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('content_calendar')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${activeMainTab === 'content_calendar'
                ? 'bg-teal-600 border-teal-700 text-white shadow-2xs font-extrabold -mb-px'
                : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-800'
                }`}
            >
              Lịch nội dung ({totalSlots} bài)
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('asset_orders')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t border-x shrink-0 ${activeMainTab === 'asset_orders'
                ? 'bg-teal-600 border-teal-700 text-white shadow-2xs font-extrabold -mb-px'
                : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-800'
                }`}
            >
              <FolderOpen size={14} /> Yêu cầu ảnh/video
            </button>
          </div>
        )}

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {loadingDetail ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <span className="text-xs text-slate-500 font-semibold font-mono">AI ĐANG TỔNG HỢP CHI TIẾT CHIẾN DỊCH...</span>
            </div>
          ) : campaignDetail ? (
            <>
              {/* TAB 1: LINK THEO DÕI BÀI ĐĂNG FB */}
              {activeMainTab === 'published_links' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <span>📌 Danh sách bài đăng đã xuất bản thực tế</span>
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      Tổng số: <b>{publishedSlotsList.length}</b> bài viết
                    </span>
                  </div>

                  {publishedSlotsList.length > 0 ? (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Thời gian đăng</th>
                            <th className="p-3">Nền tảng</th>
                            <th className="p-3">Pillar / Chủ đề</th>
                            <th className="p-3">Tiêu đề / Nội dung</th>
                            <th className="p-3 text-center">Link bài viết MXH</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {paginatedPublishedSlots.map((slot) => (
                            <tr key={slot._id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                                {new Intl.DateTimeFormat('vi-VN', {
                                  timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                }).format(new Date(slot.scheduledAt))}
                              </td>
                              <td className="p-3 font-bold text-slate-800">
                                {slot.platform || 'Facebook'}
                              </td>
                              <td className="p-3 text-slate-700 font-medium">
                                {slot.pillar}
                              </td>
                              <td className="p-3 max-w-xs truncate text-slate-800">
                                {slot.content?.title || slot.topicBrief}
                              </td>
                              <td className="p-3 text-center">
                                {slot.publishedPostUrl ? (
                                  <a
                                    href={slot.publishedPostUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-100 transition-all text-xs"
                                  >
                                    <span>Xem bài viết</span>
                                    <span className="text-[10px]">↗</span>
                                  </a>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Chờ cập nhật link</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                      {totalPublishedPages > 1 && (
                        <DetailListPagination
                          currentPage={publishedPage}
                          totalPages={totalPublishedPages}
                          totalItems={publishedSlotsList.length}
                          onChange={setPublishedPage}
                        />
                      )}
                    </>
                  ) : (
                    <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                      <p className="text-sm font-bold text-slate-600">Chưa có bài viết nào được đăng lên MXH</p>
                      <p className="text-xs text-slate-400">Các bài viết sau khi được duyệt và tự động đăng sẽ xuất hiện tại đây.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RESEARCH & XU HƯỚNG */}
              {activeMainTab === 'research' && (
                <div className="space-y-6">
                  {/* Research Report text */}
                  {campaignDetail.campaign.researchReport && (
                    <div className="rounded-xl border border-indigo-150 p-4.5 bg-indigo-50/20 space-y-2">
                      <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider block font-mono">
                        📊 Báo cáo nghiên cứu & Phân tích xu hướng (AI Research Agent)
                      </span>
                      <pre className="text-xs text-slate-750 whitespace-pre-wrap font-sans leading-relaxed p-4 border border-indigo-100 bg-white rounded-xl max-h-80 overflow-y-auto">
                        {campaignDetail.campaign.researchReport}
                      </pre>
                    </div>
                  )}

                  {/* Web & Social Research Documents Card */}
                  {(allResearchEvidence.length > 0 || parsedEvidenceSummary?.summary) ? (
                    <div className="rounded-xl border border-teal-150 bg-teal-50/10 p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-teal-800 font-bold text-sm">
                            {allResearchEvidence.length > 0
                              ? '🌐 Tài liệu cào thực tế từ Web, TikTok, Facebook'
                              : '💡 Phân tích bối cảnh chiến dịch & Thị trường'}
                          </span>
                          <span className="text-[10px] text-teal-700 bg-teal-100/70 font-bold px-2.5 py-0.5 rounded-full">
                            {allResearchEvidence.length > 0
                              ? `Thu thập ${allResearchEvidence.length} dữ liệu nguồn`
                              : 'Tự động phân tích từ Tri thức AI'}
                          </span>
                        </div>
                        <div className="flex gap-2 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setCampaignResearchTab('summary')}
                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${campaignResearchTab === 'summary'
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                              }`}
                          >
                            Tổng hợp bối cảnh
                          </button>
                          {allResearchEvidence.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCampaignResearchTab('evidence')}
                              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${campaignResearchTab === 'evidence'
                                ? 'bg-teal-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                }`}
                            >
                              Tài liệu chi tiết ({allResearchEvidence.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {campaignResearchTab === 'summary' ? (
                        <div className="space-y-4 text-xs">
                          {parsedEvidenceSummary?.summary && (
                            <div className="bg-white border border-teal-100 rounded-xl p-4 leading-relaxed text-slate-750">
                              <span className="block text-xs font-bold text-teal-700 uppercase tracking-wide mb-2 font-mono">Bối cảnh tổng hợp từ MXH:</span>
                              <p className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">{parsedEvidenceSummary.summary}</p>
                            </div>
                          )}

                          {parsedEvidenceSummary?.topKeywords && parsedEvidenceSummary.topKeywords.length > 0 && (
                            <div>
                              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Từ khóa nổi bật:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {parsedEvidenceSummary.topKeywords.map((kw, i) => (
                                  <span key={i} className="bg-teal-100/60 text-teal-800 text-xs font-bold px-2.5 py-1 rounded-md border border-teal-200/60">
                                    #{kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            {parsedEvidenceSummary?.angles && parsedEvidenceSummary.angles.length > 0 && (
                              <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 font-mono">Góc tiếp cận đề xuất</span>
                                <ul className="list-disc pl-4 space-y-1.5 text-slate-700 font-sans leading-relaxed">
                                  {parsedEvidenceSummary.angles.map((ang, i) => (
                                    <li key={i}>{ang}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {parsedEvidenceSummary?.painPoints && parsedEvidenceSummary.painPoints.length > 0 && (
                              <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 font-mono">Vấn đề của khách hàng</span>
                                <ul className="list-disc pl-4 space-y-1.5 text-slate-700 font-sans leading-relaxed">
                                  {parsedEvidenceSummary.painPoints.map((pp, i) => (
                                    <li key={i}>{pp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {parsedEvidenceSummary?.facts && parsedEvidenceSummary.facts.length > 0 && (
                              <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 font-mono">Thông tin thực tế</span>
                                <ul className="list-disc pl-4 space-y-1.5 text-slate-700 font-sans leading-relaxed">
                                  {parsedEvidenceSummary.facts.map((fact, i) => (
                                    <li key={i}>{fact}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                          {paginatedResearchEvidence.map((ev, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ev.source === 'facebook' ? 'bg-blue-100 text-blue-800' :
                                  ev.source === 'tiktok' ? 'bg-zinc-800 text-white' :
                                    'bg-emerald-100 text-emerald-800'
                                  }`}>
                                  {ev.source}
                                </span>
                                {ev.sourceUrl && (
                                  <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline text-[11px] font-bold">
                                    Nguồn ↗
                                  </a>
                                )}
                              </div>
                              <p className="text-slate-700 leading-relaxed italic line-clamp-4">&ldquo;{ev.text}&rdquo;</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {campaignResearchTab === 'evidence' && totalResearchEvidencePages > 1 && (
                        <DetailListPagination
                          currentPage={researchEvidencePage}
                          totalPages={totalResearchEvidencePages}
                          totalItems={allResearchEvidence.length}
                          onChange={setResearchEvidencePage}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-medium">Chưa có dữ liệu cào nghiên cứu xu hướng.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CHIẾN LƯỢC TỔNG */}
              {activeMainTab === 'overall_strategy' && (
                <div className="space-y-6">
                  {/* Campaign Stats & Config */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Trạng thái</span>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${campaignDetail.campaign.status === 'active' ? 'bg-green-100 text-green-800' : campaignDetail.campaign.status === 'paused' ? 'bg-amber-100 text-amber-800' : campaignDetail.campaign.status === 'completed' ? 'bg-emerald-100 text-emerald-800 font-extrabold' : 'bg-slate-200 text-slate-700'}`}>
                          {statusLabel[campaignDetail.campaign.status] || campaignDetail.campaign.status}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Sản lượng bài viết</span>
                      <p className="mt-1.5 text-xs font-bold text-slate-800">
                        Đã xuất bản {publishedSlots} / {totalSlots} bài viết
                      </p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                          style={{ width: `${totalSlots > 0 ? Math.round((publishedSlots / totalSlots) * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Cấu hình thời gian</span>
                      <div className="mt-1.5 text-xs text-slate-700 leading-relaxed">
                        <p><b>Khung giờ đăng:</b> {campaignDetail.campaign.postingTimes.join(', ')}</p>
                        <p className="mt-0.5"><b>Tần suất:</b> {campaignDetail.campaign.postsPerDay} bài/ngày</p>
                      </div>
                    </div>
                  </div>

                  {/* Source Brief */}
                  <div className="rounded-xl border border-slate-200 p-5 bg-white space-y-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block font-mono">
                      📋 Định hướng chiến dịch
                    </span>
                    <pre className="text-xs text-slate-750 whitespace-pre-wrap font-sans leading-relaxed p-4 border border-slate-100 bg-slate-50/50 rounded-xl max-h-96 overflow-y-auto">
                      {campaignDetail.campaign.sourceBrief}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 4: CONTENT PILLAR */}
              {activeMainTab === 'content_pillar' && (
                <div className="space-y-6">
                  {/* Content Strategy Matrix Table */}
                  {campaignDetail.campaign.contentMatrix && campaignDetail.campaign.contentMatrix.length > 0 ? (
                    <div className="rounded-xl border border-indigo-150 bg-indigo-50/10 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                        <span className="text-xs font-extrabold text-indigo-900 tracking-wide uppercase font-mono">
                          📊 Bảng ma trận chiến lược nội dung
                        </span>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full">
                          Phân bổ: TOFU 20% · MOFU 60% · BOFU 20%
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse border border-indigo-100 bg-white rounded-xl">
                          <thead>
                            <tr className="border-b border-indigo-150 bg-indigo-50/70 text-[11px] font-extrabold text-indigo-950">
                              <th className="p-3 border-r border-indigo-100 min-w-[140px]">Trụ cột (Pillar)</th>
                              <th className="p-3 border-r border-indigo-100 min-w-[160px]">Định hướng</th>
                              <th className="p-3 border-r border-indigo-100">Góc tiếp cận (Angles)</th>
                              <th className="p-3 border-r border-indigo-100 text-center w-[80px]">Phễu</th>
                              <th className="p-3 border-r border-indigo-100 text-center w-[90px]">Tỷ lệ</th>
                              <th className="p-3 text-center w-[100px]">Số bài/tháng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {campaignDetail.campaign.contentMatrix.map((item, pIdx) => {
                              const angles = item.angles || [];
                              const totalCampaignSlots = campaignDetail.campaign.statistics.totalSlots || campaignDetail.slots.length || 0;
                              const start = new Date(campaignDetail.campaign.startDate);
                              const end = new Date(campaignDetail.campaign.endDate);
                              const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

                              if (angles.length === 0) {
                                return (
                                  <tr key={pIdx} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="p-3 font-bold text-slate-800 align-top border-r border-slate-200 bg-rose-50/20">
                                      {item.pillar}
                                    </td>
                                    <td className="p-3 text-slate-600 align-top border-r border-slate-200 text-[11px]">
                                      {item.direction}
                                    </td>
                                    <td className="p-3 text-slate-400 italic border-r border-slate-200">-</td>
                                    <td className="p-3 text-center text-slate-400 italic border-r border-slate-200">-</td>
                                    <td className="p-3 text-center font-bold text-slate-700 border-r border-slate-200">{item.targetPercentage}%</td>
                                    <td className="p-3 text-center font-bold text-indigo-700">
                                      {Math.round((item.targetPercentage / 100) * totalCampaignSlots)} bài
                                    </td>
                                  </tr>
                                );
                              }
                              return (
                                <React.Fragment key={pIdx}>
                                  {angles.map((ang, aIdx) => (
                                    <tr key={aIdx} className="hover:bg-slate-50/60 transition-colors">
                                      {aIdx === 0 && (
                                        <td rowSpan={angles.length} className="p-3 font-bold text-slate-850 align-top border-r border-slate-200 bg-rose-50/30">
                                          {item.pillar}
                                        </td>
                                      )}
                                      {aIdx === 0 && (
                                        <td rowSpan={angles.length} className="p-3 text-slate-700 align-top border-r border-slate-200 text-[11px]">
                                          {item.direction}
                                        </td>
                                      )}
                                      <td className="p-3 border-r border-slate-200 text-slate-800 font-medium text-[11.5px]">
                                        {ang.title}
                                      </td>
                                      <td className="p-3 border-r border-slate-200 text-center align-middle">
                                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold inline-block ${ang.funnel === 'TOFU'
                                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                          : ang.funnel === 'BOFU'
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                                          }`}>
                                          {ang.funnel}
                                        </span>
                                      </td>
                                      {aIdx === 0 && (
                                        <td rowSpan={angles.length} className="p-3 text-center font-bold text-slate-800 align-middle border-r border-slate-200 bg-slate-50/30">
                                          {item.targetPercentage}%
                                        </td>
                                      )}
                                      {aIdx === 0 && (
                                        <td rowSpan={angles.length} className="p-3 text-center font-bold text-indigo-700 align-middle">
                                          {Math.round((item.targetPercentage / 100) * totalCampaignSlots)} bài ({totalDays} ngày)
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-xs text-slate-500 font-medium">Chưa có thông tin ma trận trụ cột nội dung.</p>
                    </div>
                  )}

                  {/* Simple Pillar Chips Fallback */}
                  {campaignDetail.campaign.contentPillars?.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono mb-2.5">Trụ cột nội dung chính</span>
                      <div className="flex flex-wrap gap-2">
                        {campaignDetail.campaign.contentPillars.map((pillar, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            {pillar}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: CONTENT CALENDAR (BẢNG LỊCH BÀI ĐĂNG + MODAL CHI TIẾT SỬA BÀI) */}
              {activeMainTab === 'content_calendar' && (
                <div className="flex flex-col gap-6 lg:flex-row">
                    {/* Left Column: Slots Table */}
                    <div className="space-y-6 flex-1 min-w-0 transition-all duration-300">
                      <CampaignDriveImportPanel
                        campaignId={campaignDetail.campaign._id}
                        mediaKind={campaignDetail.campaign.platforms.includes('TikTok') ? 'video' : 'image'}
                        allowBulkCreate={campaignDetail.campaign.platforms.includes('Facebook')}
                        awaitingAssetCount={campaignDetail.slots.filter((slot) => slot.status === 'awaiting_assets').length}
                        onCreateBulk={() => openContentStudio({
                          tab: 'template',
                          campaignId: campaignDetail.campaign._id,
                        })}
                        onApplied={onRefresh}
                      />

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
                              <p className="text-[11px] text-slate-550 mt-1">
                                {inProgressSlots > 0
                                  ? `Đang có ${inProgressSlots} bài viết đang trong tiến trình xử lý (AI soạn thảo, chấm điểm, thiết kế ảnh)...`
                                  : 'Hệ thống đang chạy ngầm ổn định, chờ đến khung giờ tiếp theo để xử lý bài viết.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

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
                    </div>

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
              )}

              {activeMainTab === 'asset_orders' && (
                <CampaignAssetOrderSheet
                  key={campaignDetail.campaign._id}
                  campaignId={campaignDetail.campaign._id}
                />
              )}
            </>
          ) : (
            <div className="text-center py-10 text-slate-400 font-sans">Không có thông tin chi tiết.</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-150 px-6 py-4 flex items-center justify-between bg-slate-50/50">
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
            className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition active:scale-98 cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
