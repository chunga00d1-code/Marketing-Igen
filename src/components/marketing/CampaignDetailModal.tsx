import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, X, Loader2, Facebook, ExternalLink, AlertTriangle, RotateCcw, Check, Upload, Image } from 'lucide-react';
import { CampaignStatus, MarketingCampaignSummary, marketingCampaignService } from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

interface CampaignSlot {
  _id: string;
  pillar: string;
  objective?: string;
  topicBrief: string;
  scheduledAt: string;
  status: string;
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

const DEFAULT_SLOT_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700 border-slate-200',
  queued: 'bg-blue-50 text-blue-755 border-blue-200',
  generating: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
  researching: 'bg-teal-50 text-teal-700 border-teal-200 animate-pulse',
  writing: 'bg-violet-50 text-violet-750 border-violet-200 animate-pulse',
  scoring: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
  generating_media: 'bg-pink-50 text-pink-700 border-pink-200 animate-pulse',
  verifying: 'bg-cyan-50 text-cyan-700 border-cyan-200 animate-pulse',
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
  ready_to_publish: 'bg-teal-50 text-teal-750 border-teal-200',
  publishing: 'bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse',
  published: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-755 border-red-200',
  cancelled: 'bg-slate-150 text-slate-500 border-slate-200',
  skipped: 'bg-gray-150 text-gray-500 border-gray-200',
  retrying: 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse',
  needs_attention: 'bg-amber-50 text-amber-700 border-amber-200',
};

const DEFAULT_SLOT_STATUS_LABEL: Record<string, string> = {
  planned: 'Lên kế hoạch',
  queued: 'Trong hàng đợi',
  generating: 'Đang chuẩn bị...',
  researching: 'Đang nghiên cứu...',
  writing: 'Đang viết bài viết...',
  scoring: 'Đang chấm điểm AI...',
  generating_media: 'Đang thiết kế ảnh...',
  verifying: 'Đang duyệt chất lượng...',
  pending_approval: 'Chờ duyệt',
  ready_to_publish: 'Sẵn sàng đăng',
  publishing: 'Đang đăng...',
  published: 'Đã đăng thành công',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
  skipped: 'Đã bỏ qua',
  retrying: 'Đang thử lại...',
  needs_attention: 'Cần chú ý',
};

const getSlotProgress = (status: string): { percentage: number; label: string } | null => {
  switch (status) {
    case 'pending_approval':
      return { percentage: 90, label: 'Chờ duyệt' };
    case 'queued':
      return { percentage: 10, label: 'Chờ hàng đợi' };
    case 'generating':
      return { percentage: 20, label: 'Đang khởi tạo' };
    case 'researching':
      return { percentage: 35, label: 'Đang nghiên cứu' };
    case 'writing':
      return { percentage: 55, label: 'Đang viết bài' };
    case 'scoring':
      return { percentage: 65, label: 'Đang chấm điểm AI' };
    case 'generating_media':
      return { percentage: 75, label: 'Đang tạo ảnh' };
    case 'verifying':
      return { percentage: 85, label: 'Đang duyệt bài' };
    case 'ready_to_publish':
      return { percentage: 95, label: 'Sẵn sàng đăng' };
    case 'publishing':
      return { percentage: 98, label: 'Đang gửi đăng' };
    case 'published':
      return { percentage: 100, label: 'Đã đăng' };
    case 'failed':
      return { percentage: 0, label: 'Lỗi' };
    case 'cancelled':
      return { percentage: 0, label: 'Đã hủy' };
    case 'skipped':
      return { percentage: 0, label: 'Đã bỏ qua' };
    case 'retrying':
      return { percentage: 40, label: 'Đang thử lại' };
    default:
      return null;
  }
};

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
  const [retryingSlotId, setRetryingSlotId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  
  const [selectedSlot, setSelectedSlot] = useState<CampaignSlot | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [detailTab, setDetailTab] = useState<'preview' | 'edit'>('preview');
  const [aiLogTab, setAiLogTab] = useState<'research' | 'visual' | 'ops'>('research');

  // Pagination & selection states
  const [slotPage, setSlotPage] = useState(1);
  const SLOTS_PER_PAGE = 10;
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);

  const activeSlot = campaignDetail?.slots.find(s => s._id === selectedSlot?._id) || null;
  const isEditable = activeSlot ? ['pending_approval', 'needs_attention', 'failed'].includes(activeSlot.status) : false;

  const parsedResearch = useMemo(() => {
    if (!activeSlot?.researchAnalysis?.context) return null;
    try {
      const data = JSON.parse(activeSlot.researchAnalysis.context);
      if (typeof data === 'object' && data !== null) {
        return data;
      }
    } catch {
      // not JSON
    }
    return null;
  }, [activeSlot?.researchAnalysis?.context]);

  // Reset pagination/selections when campaign changes
  useEffect(() => {
    setSlotPage(1);
    setSelectedSlotIds([]);
  }, [campaignDetail?.campaign?._id]);

  useEffect(() => {
    if (activeSlot?.content) {
      setEditTitle(activeSlot.content.title || '');
      setEditBody(activeSlot.content.bodyText || '');
    } else {
      setEditTitle('');
      setEditBody('');
    }
    setDetailTab('preview');
    setAiLogTab('research');
  }, [activeSlot?._id, activeSlot?.content, activeSlot?.content?.title, activeSlot?.content?.bodyText]);

  if (!isOpen) return null;

  // Handle Slot Approval
  const handleApproveSlot = async () => {
    if (!campaignDetail || !activeSlot) return;
    setIsApproving(true);
    if (onUpdateSlot) {
      onUpdateSlot(activeSlot._id, { status: 'ready_to_publish' });
    }
    try {
      await marketingCampaignService.approveSlot(campaignDetail.campaign._id, activeSlot._id);
      toast.success('Đã duyệt đăng bài thành công.');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể duyệt đăng bài.');
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Slot Rejection
  const handleRejectSlot = async () => {
    if (!campaignDetail || !activeSlot) return;
    const reason = window.prompt('Nhập lý do từ chối bài viết này:');
    if (reason === null) return;
    if (!reason.trim()) {
      toast.warning('Vui lòng nhập lý do từ chối.');
      return;
    }
    setIsRejecting(true);
    if (onUpdateSlot) {
      onUpdateSlot(activeSlot._id, { status: 'needs_attention', errorMessage: reason.trim() });
    }
    try {
      await marketingCampaignService.rejectSlot(campaignDetail.campaign._id, activeSlot._id, reason.trim());
      toast.success('Đã từ chối đăng bài thành công.');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể từ chối đăng bài.');
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setIsRejecting(false);
    }
  };

  // Handle Share Review Link
  const handleShareReviewLink = async (slotId: string) => {
    if (!campaignDetail) return;
    try {
      const response = await marketingCampaignService.getShareLink(campaignDetail.campaign._id, slotId);
      const shareLink = response.shareLink;
      await navigator.clipboard.writeText(shareLink);
      toast.success('Đã sao chép link duyệt bài đăng vào bộ nhớ tạm!');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể lấy link chia sẻ.');
    }
  };

  // Handle Content Save
  const handleSaveContent = async () => {
    if (!campaignDetail || !activeSlot) return;
    setIsSavingContent(true);
    if (onUpdateSlot && activeSlot.content) {
      onUpdateSlot(activeSlot._id, {
        content: {
          ...activeSlot.content,
          title: editTitle,
          bodyText: editBody,
        }
      });
    }
    try {
      await marketingCampaignService.updateSlotContent(campaignDetail.campaign._id, activeSlot._id, {
        title: editTitle,
        bodyText: editBody,
      });
      toast.success('Đã lưu nội dung bài viết.');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu nội dung bài viết.');
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setIsSavingContent(false);
    }
  };

  // Handle Custom Image Upload Replacement
  const handleImageReplacement = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !campaignDetail || !activeSlot) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.warning('Dung lượng ảnh không được vượt quá 10MB!');
      return;
    }

    setIsReplacingImage(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = evt.target?.result as string;
        if (onUpdateSlot && activeSlot.content) {
          onUpdateSlot(activeSlot._id, {
            content: {
              ...activeSlot.content,
              mediaUrls: [base64Data]
            }
          });
        }
        await marketingCampaignService.replaceSlotImage(campaignDetail.campaign._id, activeSlot._id, base64Data);
        toast.success('Đã thay thế ảnh thành công.');
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Không thể thay thế ảnh bài đăng.');
        if (onRefresh) {
          await onRefresh();
        }
      } finally {
        setIsReplacingImage(false);
      }
    };
    reader.onerror = () => {
      setIsReplacingImage(false);
      toast.error('Lỗi khi đọc file ảnh tải lên.');
    };
    reader.readAsDataURL(file);
  };

  // Handle Bulk Approval
  const handleBulkApprove = async () => {
    if (!campaignDetail || selectedSlotIds.length === 0) return;
    setIsBulkApproving(true);
    let successCount = 0;
    let failCount = 0;
    try {
      const slotsToApprove = (campaignDetail.slots || []).filter(
        s => selectedSlotIds.includes(s._id) && s.status === 'pending_approval'
      );
      
      if (slotsToApprove.length === 0) {
        toast.info('Không có bài viết nào đang chờ duyệt trong danh sách đã chọn.');
        return;
      }

      await Promise.all(
        slotsToApprove.map(async (slot) => {
          try {
            await marketingCampaignService.approveSlot(campaignDetail.campaign._id, slot._id);
            successCount++;
          } catch {
            failCount++;
          }
        })
      );

      toast.success(`Đã duyệt thành công ${successCount} bài viết.${failCount > 0 ? ` Thất bại ${failCount} bài viết.` : ''}`);
      setSelectedSlotIds([]);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Lỗi trong quá trình duyệt hàng loạt.');
    } finally {
      setIsBulkApproving(false);
    }
  };

  // Handle Bulk Retry
  const handleBulkRetry = async () => {
    if (!campaignDetail || selectedSlotIds.length === 0 || !onRetrySlot) return;
    setIsBulkRetrying(true);
    let successCount = 0;
    let failCount = 0;
    try {
      const slotsToRetry = (campaignDetail.slots || []).filter(
        s => selectedSlotIds.includes(s._id) && ['failed', 'needs_attention'].includes(s.status)
      );

      if (slotsToRetry.length === 0) {
        toast.info('Không có bài viết nào bị lỗi hoặc cần chú ý trong danh sách đã chọn.');
        return;
      }

      await Promise.all(
        slotsToRetry.map(async (slot) => {
          try {
            await onRetrySlot(campaignDetail.campaign._id, slot._id);
            successCount++;
          } catch {
            failCount++;
          }
        })
      );

      toast.success(`Đã thử lại thành công ${successCount} bài viết.${failCount > 0 ? ` Thất bại ${failCount} bài viết.` : ''}`);
      setSelectedSlotIds([]);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Lỗi trong quá trình thử lại hàng loạt.');
    } finally {
      setIsBulkRetrying(false);
    }
  };

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

  const totalSlotPages = Math.ceil(sortedSlots.length / SLOTS_PER_PAGE);
  const paginatedSlots = sortedSlots.slice((slotPage - 1) * SLOTS_PER_PAGE, slotPage * SLOTS_PER_PAGE);
  const isAllOnPageSelected = paginatedSlots.length > 0 && paginatedSlots.every(s => selectedSlotIds.includes(s._id));

  const handleToggleSelectAllOnPage = () => {
    if (isAllOnPageSelected) {
      const pageIds = paginatedSlots.map(s => s._id);
      setSelectedSlotIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      const pageIds = paginatedSlots.map(s => s._id);
      setSelectedSlotIds(prev => {
        const next = [...prev];
        pageIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  const handleToggleSelectSlot = (slotId: string) => {
    setSelectedSlotIds(prev => 
      prev.includes(slotId) ? prev.filter(id => id !== slotId) : [...prev, slotId]
    );
  };

  const pendingApprovalSlots = sortedSlots.filter(s => s.status === 'pending_approval');

  const handleSelectAllPending = () => {
    setSelectedSlotIds(pendingApprovalSlots.map(s => s._id));
  };

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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
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
              <div className="flex flex-col lg:flex-row gap-6">
              
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
                        <p className="text-[11px] text-slate-500 mt-1">
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
                      <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block font-mono mb-2">Báo cáo nghiên cứu & Xu hướng (Google & Social Research)</span>
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
                <div className="w-full lg:w-[450px] lg:shrink-0 border border-slate-200 rounded-2xl bg-slate-50/20 p-5 flex flex-col space-y-4 max-h-[75vh] overflow-y-auto transition-all duration-300">
                  <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Duyệt & Biên tập nội dung</h4>
                      <p className="text-[10px] text-slate-400 font-semibold font-mono mt-0.5">
                        Giờ đăng: {new Intl.DateTimeFormat('vi-VN', {
                          timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        }).format(new Date(activeSlot.scheduledAt))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSlot(null)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Status & Actions Box */}
                  <div className="flex flex-col gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-0.5">Trạng thái slot</span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold select-none ${slotStatusColors[activeSlot.status] || DEFAULT_SLOT_STATUS_COLORS[activeSlot.status] || 'bg-slate-100 text-slate-655'}`}>
                          {slotStatusLabel[activeSlot.status] || DEFAULT_SLOT_STATUS_LABEL[activeSlot.status] || activeSlot.status}
                        </span>
                      </div>

                      {['pending_approval', 'needs_attention', 'failed'].includes(activeSlot.status) && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isApproving || isRejecting || retryingSlotId === activeSlot._id}
                            onClick={handleApproveSlot}
                            className="inline-flex items-center gap-1 bg-green-650 hover:bg-green-755 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-55"
                          >
                            {isApproving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Duyệt
                          </button>
                          {activeSlot.status === 'pending_approval' && (
                            <button
                              type="button"
                              disabled={isApproving || isRejecting}
                              onClick={handleRejectSlot}
                              className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-55"
                            >
                              {isRejecting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              Từ chối
                            </button>
                          )}
                          {['needs_attention', 'failed'].includes(activeSlot.status) && onRetrySlot && campaignDetail?.campaign?.status === 'active' && (
                            <button
                              type="button"
                              disabled={isApproving || isRejecting || retryingSlotId === activeSlot._id}
                              onClick={async () => {
                                setRetryingSlotId(activeSlot._id);
                                if (onUpdateSlot) {
                                  onUpdateSlot(activeSlot._id, { status: 'planned', errorMessage: undefined });
                                }
                                try {
                                  await onRetrySlot(campaignDetail.campaign._id, activeSlot._id);
                                  setSelectedSlot(null);
                                } finally {
                                  setRetryingSlotId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-55"
                            >
                              {retryingSlotId === activeSlot._id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                              Thử lại
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {activeSlot.status === 'pending_approval' && (
                      <div className="border-t border-slate-100 pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleShareReviewLink(activeSlot._id)}
                          className="text-[10px] font-bold text-indigo-650 hover:text-indigo-850 hover:underline transition cursor-pointer flex items-center gap-1"
                        >
                          Chia sẻ link duyệt cho người ngoài &rarr;
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Warning/Error banners for needs_attention or failed */}
                  {activeSlot.status === 'needs_attention' && activeSlot.errorMessage && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed font-sans shadow-2xs">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        <span>Yêu cầu chỉnh sửa / Lý do từ chối:</span>
                      </div>
                      <p className="whitespace-pre-wrap font-medium">{activeSlot.errorMessage}</p>
                      <p className="mt-2 text-[10px] text-amber-600 font-semibold select-none">
                        💡 Bạn có thể chỉnh sửa nội dung hoặc thay ảnh bên dưới rồi bấm <b>Duyệt</b> để áp dụng, hoặc bấm <b>Thử lại</b> để AI chạy lại bài đăng.
                      </p>
                    </div>
                  )}

                  {activeSlot.status === 'failed' && activeSlot.errorMessage && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 leading-relaxed font-sans shadow-2xs">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <AlertTriangle size={14} className="text-red-500 shrink-0" />
                        <span>Lỗi thực thi / đăng bài:</span>
                      </div>
                      <p className="whitespace-pre-wrap font-mono text-[11px] bg-white/60 p-2 rounded border border-red-100/50 mt-1 max-h-24 overflow-y-auto">{activeSlot.errorMessage}</p>
                      <p className="mt-2 text-[10px] text-red-500 font-semibold select-none">
                        💡 Bạn có thể chỉnh sửa nội dung/hình ảnh để tự sửa lỗi rồi bấm <b>Duyệt</b>, hoặc bấm <b>Thử lại</b> để thực hiện lại.
                      </p>
                    </div>
                  )}

                  {/* Tabs Selector */}
                  <div className="flex border-b border-slate-200 mb-2 select-none">
                    <button
                      type="button"
                      onClick={() => setDetailTab('preview')}
                      className={`flex-1 pb-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                        detailTab === 'preview'
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-slate-400 hover:text-slate-655'
                      }`}
                    >
                      Xem trước Facebook
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('edit')}
                      className={`flex-1 pb-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                        detailTab === 'edit'
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-slate-400 hover:text-slate-655'
                      }`}
                    >
                      Biên tập nội dung
                    </button>
                  </div>

                  {/* Content Preview & Form */}
                  {activeSlot.content ? (
                    <div className="space-y-4">
                      {detailTab === 'preview' ? (
                        <div className="space-y-4">
                          {/* Realistic Facebook Post Preview */}
                          <div className="border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden font-sans text-left">
                            {/* Post Header */}
                            <div className="p-3.5 flex items-center gap-2.5">
                              <div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-655 font-bold select-none shrink-0">
                                {campaignDetail?.campaign?.title?.slice(0, 2).toUpperCase() || 'FB'}
                              </div>
                              <div>
                                <span className="block text-xs font-bold text-slate-800 hover:underline cursor-pointer">
                                  {campaignDetail?.campaign?.title || 'Trang Facebook'}
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-slate-400 select-none">
                                  {new Intl.DateTimeFormat('vi-VN', {
                                    timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                  }).format(new Date(activeSlot.scheduledAt))}
                                  &nbsp;·&nbsp;🌐
                                </span>
                              </div>
                            </div>

                            {/* Post Title & Text Body */}
                            <div className="px-3.5 pb-3 text-xs text-slate-800 leading-relaxed font-sans">
                              {editTitle && (
                                <h5 className="font-bold text-slate-900 mb-1.5">{editTitle}</h5>
                              )}
                              <div className="whitespace-pre-wrap">{editBody || 'Chưa có nội dung...'}</div>
                            </div>

                            {/* Post Media */}
                            {activeSlot.content.mediaUrls && activeSlot.content.mediaUrls.length > 0 && (
                              <div className="relative border-t border-b border-slate-100 bg-slate-950 aspect-video flex items-center justify-center">
                                {activeSlot.content.mediaType === 'video' ? (
                                  <video src={activeSlot.content.mediaUrls[0]} controls className="w-full h-full object-contain" />
                                ) : (
                                  <img src={activeSlot.content.mediaUrls[0]} alt="Facebook Post Media" className="w-full h-full object-contain" />
                                )}
                              </div>
                            )}

                            {/* FB Stats Mock */}
                            <div className="px-3.5 py-2 flex items-center justify-between border-b border-slate-100 text-[10px] text-slate-400 select-none">
                              <div className="flex items-center gap-1">
                                <span className="flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 text-white text-[8px] font-bold">👍</span>
                                <span>0</span>
                              </div>
                              <div className="flex gap-2">
                                <span>0 bình luận</span>
                                <span>0 lượt chia sẻ</span>
                              </div>
                            </div>

                            {/* FB Action Buttons Mock */}
                            <div className="px-1 py-1 grid grid-cols-3 gap-1 text-slate-500 font-bold text-[10px] select-none">
                              <button type="button" className="py-2 hover:bg-slate-50 rounded flex items-center justify-center gap-1.5 transition cursor-pointer">
                                👍 Thích
                              </button>
                              <button type="button" className="py-2 hover:bg-slate-50 rounded flex items-center justify-center gap-1.5 transition cursor-pointer">
                                💬 Bình luận
                              </button>
                              <button type="button" className="py-2 hover:bg-slate-50 rounded flex items-center justify-center gap-1.5 transition cursor-pointer">
                                ➡️ Chia sẻ
                              </button>
                            </div>
                          </div>

                          <div className="rounded-xl bg-indigo-50/50 border border-indigo-100/50 p-3.5 text-[11px] text-slate-600 leading-relaxed flex gap-2">
                            <span>📢</span>
                            <span>Đây là giao diện xem trước bài đăng thực tế của bạn trên mạng xã hội Facebook.</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Media Display and Replacement */}
                          {activeSlot.content.mediaUrls && activeSlot.content.mediaUrls.length > 0 ? (
                            <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-black aspect-video flex items-center justify-center">
                              {activeSlot.content.mediaType === 'video' ? (
                                <video src={activeSlot.content.mediaUrls[0]} controls className="w-full h-full object-contain" />
                              ) : (
                                <>
                                  <img src={activeSlot.content.mediaUrls[0]} alt="Post Media" className="w-full h-full object-contain" />
                                  {['pending_approval', 'verifying', 'needs_attention', 'failed'].includes(activeSlot.status) && (
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex justify-end">
                                      <label className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition shadow-sm select-none">
                                        <Upload size={12} />
                                        Thay ảnh của bạn
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageReplacement} disabled={isReplacingImage} />
                                      </label>
                                    </div>
                                  )}
                                </>
                              )}
                              {isReplacingImage && (
                                <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center space-y-1.5">
                                  <Loader2 size={20} className="animate-spin text-indigo-600" />
                                  <span className="text-[10px] font-bold text-slate-500 font-mono">ĐANG TẢI ẢNH LÊN...</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            // Upload trigger when no media is present
                            ['pending_approval', 'verifying', 'needs_attention', 'failed'].includes(activeSlot.status) && (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 flex flex-col items-center justify-center text-center">
                                <Image className="text-slate-300 mb-1.5" size={24} />
                                <span className="text-[10px] text-slate-400 font-semibold mb-2">Chưa có ảnh — AI chưa tạo hoặc bạn muốn dùng ảnh riêng</span>
                                <label className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition select-none">
                                  <Upload size={13} />
                                  Tải ảnh của bạn lên
                                  <input type="file" accept="image/*" className="hidden" onChange={handleImageReplacement} disabled={isReplacingImage} />
                                </label>
                                {isReplacingImage && <Loader2 size={13} className="animate-spin text-indigo-650 mt-2" />}
                              </div>
                            )
                          )}

                          {/* Content Form Editor */}
                          <div className="space-y-3.5">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1 select-none">Tiêu đề bài viết (Nếu có)</label>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                disabled={!isEditable}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 disabled:bg-slate-50 disabled:text-slate-500 shadow-2xs"
                                placeholder="Nhập tiêu đề bài đăng..."
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1 select-none">Nội dung bài viết</label>
                              <textarea
                                rows={10}
                                value={editBody}
                                onChange={(e) => setEditBody(e.target.value)}
                                disabled={!isEditable}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-slate-850 leading-relaxed disabled:bg-slate-50 disabled:text-slate-500 shadow-2xs font-sans whitespace-pre-wrap"
                                placeholder="Nhập nội dung bài đăng..."
                              />
                            </div>

                            {isEditable && (
                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  disabled={isSavingContent}
                                  onClick={handleSaveContent}
                                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-55"
                                >
                                  {isSavingContent ? <Loader2 size={13} className="animate-spin" /> : null}
                                  Lưu thay đổi
                                </button>
                              </div>
                            )}
                          </div>

                          {/* AI Prompts and Outline Info */}
                          <div className="pt-3 border-t border-slate-150 space-y-2.5 bg-slate-50/50 p-3 rounded-xl">
                            {activeSlot.content.mediaPrompt && (
                              <div>
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Ý tưởng hình ảnh (Media Prompt)</span>
                                <p className="text-[11px] text-slate-650 mt-0.5 leading-relaxed font-sans">{activeSlot.content.mediaPrompt}</p>
                              </div>
                            )}
                            {activeSlot.content.outline && (
                              <div>
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Dàn ý bài viết (Outline)</span>
                                <p className="text-[11px] text-slate-650 mt-0.5 leading-relaxed font-sans">{activeSlot.content.outline}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-slate-150 rounded-2xl p-5 shadow-2xs">
                      <Image size={24} className="text-slate-350 mb-2 animate-pulse" />
                      <span className="text-[11px] text-slate-500 font-bold">Chưa tạo nội dung chi tiết</span>
                      <p className="text-[10px] text-slate-450 mt-1 max-w-[220px] leading-relaxed">Hệ thống sẽ tự động sinh nội dung hoàn chỉnh gần thời điểm đăng bài.</p>
                    </div>
                  )}

                  {(activeSlot.researchAnalysis || activeSlot.visualAnalysis || activeSlot.lastError || activeSlot.ingestedMedia?.length) && (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Nhật ký AI của slot</span>
                          <span className="text-[10px] text-slate-450">Dữ liệu được dùng để tạo bài, chi phí và lỗi gần nhất</span>
                        </div>
                        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">
                          Chi phí ngữ cảnh: {((activeSlot.researchAnalysis?.cost || 0) + (activeSlot.visualAnalysis?.cost || 0)).toFixed(2)} Credit
                        </span>
                      </div>

                      {/* Tab buttons */}
                      <div className="flex border-b border-slate-200 mb-3.5 select-none gap-4">
                        <button
                          type="button"
                          onClick={() => setAiLogTab('research')}
                          className={`pb-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                            aiLogTab === 'research'
                              ? 'border-teal-500 text-teal-650'
                              : 'border-transparent text-slate-400 hover:text-slate-655'
                          }`}
                        >
                          🌐 Nghiên cứu Web
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiLogTab('visual')}
                          className={`pb-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                            aiLogTab === 'visual'
                              ? 'border-violet-500 text-violet-655'
                              : 'border-transparent text-slate-400 hover:text-slate-655'
                          }`}
                        >
                          👁️ Phân tích hình ảnh
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiLogTab('ops')}
                          className={`pb-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                            aiLogTab === 'ops'
                              ? 'border-blue-500 text-blue-655'
                              : 'border-transparent text-slate-400 hover:text-slate-655'
                          }`}
                        >
                          ⚙️ Vận hành & Lỗi
                        </button>
                      </div>

                      {/* Tab contents */}
                      <div>
                        {aiLogTab === 'research' && (
                          <div className="rounded-xl border border-slate-150 bg-white p-4 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-teal-650">Nghiên cứu web</span>
                              {activeSlot.researchAnalysis && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {activeSlot.researchAnalysis.model} · {new Date(activeSlot.researchAnalysis.researchedAt).toLocaleString('vi-VN')}
                                </span>
                              )}
                            </div>
                            {activeSlot.researchAnalysis ? (
                              <div className="space-y-4">
                                {parsedResearch ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] leading-relaxed text-slate-700 font-sans">
                                    {parsedResearch.summary && (
                                      <div className="md:col-span-2 bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] leading-relaxed text-slate-600 font-medium">
                                        <p className="font-bold text-slate-800 mb-1 text-[10px] uppercase tracking-wide">💡 Định hướng nghiên cứu:</p>
                                        {parsedResearch.summary}
                                      </div>
                                    )}

                                    {parsedResearch.angles && parsedResearch.angles.length > 0 && (
                                      <div className="space-y-1.5 bg-teal-50/30 border border-teal-100/50 rounded-xl p-3">
                                        <strong className="block text-[10px] font-extrabold text-teal-650 uppercase tracking-wide">📐 Góc tiếp cận bài viết:</strong>
                                        <ul className="list-disc pl-4 space-y-1 text-slate-650 font-medium">
                                          {parsedResearch.angles.map((angle: string, i: number) => (
                                            <li key={i}>{angle}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {parsedResearch.painPoints && parsedResearch.painPoints.length > 0 && (
                                      <div className="space-y-1.5 bg-amber-50/30 border border-amber-100/50 rounded-xl p-3">
                                        <strong className="block text-[10px] font-extrabold text-amber-655 uppercase tracking-wide">🔥 Nỗi đau khách hàng:</strong>
                                        <ul className="list-disc pl-4 space-y-1 text-slate-650">
                                          {parsedResearch.painPoints.map((point: string, i: number) => (
                                            <li key={i}>{point}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {parsedResearch.facts && parsedResearch.facts.length > 0 && (
                                      <div className="md:col-span-2 space-y-1.5 bg-slate-50/50 border border-slate-150 rounded-xl p-3">
                                        <strong className="block text-[10px] font-extrabold text-slate-550 uppercase tracking-wide">📋 Thông tin thương hiệu:</strong>
                                        <ul className="list-disc pl-4 space-y-1 text-slate-650">
                                          {parsedResearch.facts.map((fact: string, i: number) => (
                                            <li key={i}>{fact}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-655 bg-slate-50 p-3 rounded-xl border border-slate-150">
                                    {activeSlot.researchAnalysis.context}
                                  </p>
                                )}

                                <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-2">
                                  <span className="text-[10px] font-semibold text-slate-455">
                                    {activeSlot.researchAnalysis.billedAt ? '🟢 Đã ghi nhận chi phí' : '⚪ Chưa ghi nhận chi phí'} · {activeSlot.researchAnalysis.cost.toFixed(2)} Credit
                                  </span>
                                  
                                  {activeSlot.researchAnalysis.apifyRuns?.length > 0 && (
                                    <div className="text-right">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                        Apify · {activeSlot.researchAnalysis.billingMode === 'shadow' ? 'Test shadow — không trừ ví' : 'Live'} · ${activeSlot.researchAnalysis.providerCostUsd.toFixed(4)}
                                      </p>
                                      <p className="text-[10px] text-slate-500 mt-0.5">
                                        {activeSlot.researchAnalysis.apifyRuns.map((run) => `${run.source}: ${run.status} (${run.itemCount})`).join(' · ')}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {activeSlot.researchAnalysis.evidence?.length > 0 && (
                                  <div className="border-t border-slate-100 pt-3 space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Nguồn dẫn chứng thu thập được</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {activeSlot.researchAnalysis.evidence.map((item, idx) => (
                                        <a
                                          key={`${item.source}-${item.sourceUrl}-${idx}`}
                                          href={item.sourceUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition text-[11px] font-medium text-indigo-650 hover:text-indigo-850 hover:underline"
                                        >
                                          <ExternalLink size={12} className="shrink-0 text-slate-400" />
                                          <span className="uppercase text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 shrink-0">{item.source}</span>
                                          <span className="truncate">{item.title || item.author || item.sourceUrl}</span>
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-6 text-slate-400 text-xs">Không có dữ liệu nghiên cứu web cho slot này.</div>
                            )}
                          </div>
                        )}

                        {aiLogTab === 'visual' && (
                          <div className="rounded-xl border border-slate-150 bg-white p-4 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-violet-655">Phân tích hình ảnh</span>
                              {activeSlot.visualAnalysis && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {activeSlot.visualAnalysis.model} · {activeSlot.visualAnalysis.sourceUrls.length} ảnh · {new Date(activeSlot.visualAnalysis.analyzedAt).toLocaleString('vi-VN')}
                                </span>
                              )}
                            </div>
                            {activeSlot.visualAnalysis ? (
                              <div className="space-y-4">
                                <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] leading-relaxed text-slate-655">
                                  <p className="font-bold text-slate-800 mb-1 text-[10px] uppercase tracking-wide">🔍 Kết quả phân tích tổng quan:</p>
                                  {activeSlot.visualAnalysis.summary}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                  {activeSlot.visualAnalysis.visibleText.length > 0 && (
                                    <div className="bg-violet-50/20 border border-violet-100/50 rounded-xl p-3">
                                      <strong className="block text-[10px] font-extrabold text-violet-750 uppercase tracking-wide mb-1.5">📝 Chữ xuất hiện trong ảnh:</strong>
                                      <div className="flex flex-wrap gap-1">
                                        {activeSlot.visualAnalysis.visibleText.map((t, idx) => (
                                          <span key={idx} className="bg-white border border-violet-100 text-violet-750 px-2 py-0.5 rounded text-[10px] font-medium">{t}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {activeSlot.visualAnalysis.cautions.length > 0 && (
                                    <div className="bg-amber-50/20 border border-amber-100/50 rounded-xl p-3">
                                      <strong className="block text-[10px] font-extrabold text-amber-700 uppercase tracking-wide mb-1.5">⚠️ Lưu ý & Cần tránh:</strong>
                                      <ul className="list-disc pl-4 space-y-1 text-amber-900 font-medium">
                                        {activeSlot.visualAnalysis.cautions.map((caution, idx) => (
                                          <li key={idx}>{caution}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>

                                <div className="border-t border-slate-100 pt-3">
                                  <span className="text-[10px] font-semibold text-slate-450">
                                    {activeSlot.visualAnalysis.billedAt ? '🟢 Đã ghi nhận chi phí' : '⚪ Chưa ghi nhận chi phí'} · {activeSlot.visualAnalysis.cost.toFixed(2)} Credit
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-6 text-slate-400 text-xs">Không có dữ liệu phân tích hình ảnh cho slot này.</div>
                            )}
                          </div>
                        )}

                        {aiLogTab === 'ops' && (
                          <div className="rounded-xl border border-slate-150 bg-white p-4 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-blue-655">Vận hành</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Media đã Ingest: <b>{activeSlot.ingestedMedia?.length || 0}</b>
                              </span>
                            </div>
                            
                            <div className="space-y-4">
                              <div>
                                <p className="text-[11px] text-slate-600 font-semibold mb-2">Ảnh / Video gốc đã Ingest lên CDN Cloudinary:</p>
                                {activeSlot.ingestedMedia && activeSlot.ingestedMedia.length > 0 ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {activeSlot.ingestedMedia.map((media, idx) => (
                                      <div key={idx} className="relative group aspect-square rounded-lg border border-slate-150 bg-slate-950 overflow-hidden flex items-center justify-center">
                                        <img src={media.url} alt={`Ingested Media ${idx + 1}`} className="w-full h-full object-cover" />
                                        <a 
                                          href={media.url} 
                                          target="_blank" 
                                          rel="noreferrer"
                                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white text-[10px] font-bold text-center"
                                        >
                                          Mở link CDN
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 italic">Không có media thật nào được ingest.</p>
                                )}
                              </div>

                              {activeSlot.lastError ? (
                                <div className="rounded-xl border border-red-155 bg-red-50/50 p-4">
                                  <div className="flex items-center gap-1.5 text-red-755 font-bold text-xs border-b border-red-100 pb-2 mb-2">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    <span>LỖI GẦN NHẤT</span>
                                  </div>
                                  <p className="text-[10px] font-bold text-red-800 font-mono">Type: {activeSlot.lastError.type}</p>
                                  <p className="mt-1.5 text-[11px] leading-relaxed text-red-755 font-medium">{activeSlot.lastError.message}</p>
                                  <p className="mt-2 text-[9px] text-red-450 font-semibold select-none">
                                    🕒 Xảy ra lúc: {new Date(activeSlot.lastError.occurredAt).toLocaleString('vi-VN')}
                                  </p>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-emerald-150 bg-emerald-50/30 p-3 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                                  <span>🟢</span>
                                  <span>Không ghi nhận lỗi vận hành nào tại thời điểm này.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* Slots Table */}
            <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 select-none">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Lịch trình đăng bài chi tiết (Campaign Slots)</span>
                      {activeSlot && <span className="text-[10px] text-indigo-650 font-bold bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded mt-1 inline-block">Bấm chọn slot để xem/sửa chi tiết</span>}
                    </div>
                  </div>

                  {/* Bulk Actions Panel */}
                  {selectedSlotIds.length > 0 ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-300">
                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        <span className="font-bold text-slate-800">
                          Đã chọn <span className="text-indigo-600 font-mono font-extrabold">{selectedSlotIds.length}</span> / {totalSlots} slot
                        </span>
                        <div className="h-3 w-px bg-slate-300" />
                        <button
                          type="button"
                          onClick={() => setSelectedSlotIds([])}
                          className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline font-bold transition cursor-pointer"
                        >
                          Bỏ chọn tất cả
                        </button>
                        {pendingApprovalSlots.length > 0 && selectedSlotIds.length < pendingApprovalSlots.length && (
                          <>
                            <div className="h-3 w-px bg-slate-300" />
                            <button
                              type="button"
                              onClick={handleSelectAllPending}
                              className="text-[11px] text-indigo-650 hover:text-indigo-850 hover:underline font-bold transition cursor-pointer"
                            >
                              Chọn tất cả {pendingApprovalSlots.length} bài chờ duyệt
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBulkApproving}
                          onClick={handleBulkApprove}
                          className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-55"
                        >
                          {isBulkApproving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Duyệt hàng loạt ({campaignDetail.slots.filter(s => selectedSlotIds.includes(s._id) && s.status === 'pending_approval').length})
                        </button>
                        {onRetrySlot && (
                          <button
                            type="button"
                            disabled={isBulkRetrying}
                            onClick={handleBulkRetry}
                            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-55"
                          >
                            {isBulkRetrying ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            Thử lại ({campaignDetail.slots.filter(s => selectedSlotIds.includes(s._id) && ['failed', 'needs_attention'].includes(s.status)).length})
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    pendingApprovalSlots.length > 0 && (
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-600">
                        <span className="font-medium">Có <span className="font-bold text-indigo-650">{pendingApprovalSlots.length}</span> bài viết đang chờ duyệt.</span>
                        <button
                          type="button"
                          onClick={handleSelectAllPending}
                          className="text-[11px] text-indigo-650 hover:text-indigo-850 hover:underline font-bold transition cursor-pointer"
                        >
                          Chọn nhanh để duyệt hàng loạt &rarr;
                        </button>
                      </div>
                    )
                  )}

                  <div className="border border-slate-150 rounded-xl overflow-hidden bg-white shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-150 select-none">
                            <th className="px-4 py-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isAllOnPageSelected}
                                onChange={handleToggleSelectAllOnPage}
                                className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                              />
                            </th>
                            <th className="px-4 py-3">Slot #</th>
                            <th className="px-4 py-3">Thời gian đăng (Zoned)</th>
                            <th className="px-4 py-3">Nền tảng</th>
                            <th className="px-4 py-3">Pillar & Brief</th>
                            <th className="px-4 py-3">Trạng thái</th>
                            <th className="px-4 py-3 text-right">Hành động</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {sortedSlots.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans">Không tìm thấy lịch trình bài đăng nào cho chiến dịch này.</td>
                            </tr>
                          ) : (
                            paginatedSlots.map((slot, index) => {
                              const globalIndex = (slotPage - 1) * SLOTS_PER_PAGE + index + 1;
                              const scheduledDate = new Date(slot.scheduledAt);
                              const dateFormatted = new Intl.DateTimeFormat('vi-VN', {
                                timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', hour12: false
                              }).format(scheduledDate);

                              const progress = getSlotProgress(slot.status);

                              return (
                                <tr
                                  key={slot._id}
                                  onClick={() => setSelectedSlot(slot)}
                                  className={`cursor-pointer transition-colors ${activeSlot?._id === slot._id ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50/50'}`}
                                >
                                  <td className="px-4 py-3.5 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selectedSlotIds.includes(slot._id)}
                                      onChange={() => handleToggleSelectSlot(slot._id)}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                                    />
                                  </td>
                                  <td className="px-4 py-3.5 font-bold font-mono text-slate-400 select-none">{globalIndex}</td>
                                  <td className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">{dateFormatted}</td>
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1 font-semibold text-slate-750 select-none">
                                      <Facebook size={12} className="text-blue-600" />
                                      Facebook
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 max-w-[200px] sm:max-w-[300px] md:max-w-[400px] xl:max-w-[600px]">
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-[10px] text-indigo-755 font-bold mb-1 select-none">
                                      {slot.pillar}
                                    </span>
                                    <p className="text-slate-600 truncate leading-relaxed font-sans" title={slot.topicBrief}>
                                      {slot.topicBrief}
                                    </p>
                                    {slot.objective && (
                                      <p className="text-[10px] text-slate-400 mt-0.5 italic font-sans">
                                        Mục tiêu: {slot.objective}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold select-none ${slotStatusColors[slot.status] || DEFAULT_SLOT_STATUS_COLORS[slot.status] || 'bg-slate-100 text-slate-655 border-slate-200'}`}>
                                      {slotStatusLabel[slot.status] || DEFAULT_SLOT_STATUS_LABEL[slot.status] || slot.status}
                                    </span>
                                    {progress && progress.percentage > 0 && progress.percentage < 100 && (
                                      <div className="mt-1.5 w-28">
                                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold mb-0.5 font-mono select-none">
                                          <span>{progress.label}</span>
                                          <span>{progress.percentage}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-indigo-500 rounded-full animate-pulse transition-all duration-300"
                                            style={{ width: `${progress.percentage}%` }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                    {slot.status === 'failed' && slot.errorMessage && (
                                      <p className="text-[9px] text-red-500 mt-1 max-w-[150px] truncate font-mono" title={slot.errorMessage}>
                                        Lỗi: {slot.errorMessage}
                                      </p>
                                    )}
                                    {slot.status === 'needs_attention' && slot.errorMessage && (
                                      <p className="text-[9px] text-amber-600 mt-1 max-w-[150px] truncate font-sans font-medium" title={slot.errorMessage}>
                                        Lý do: {slot.errorMessage}
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    {(() => {
                                      if (slot.status === 'published' && slot.publishedPostUrl) {
                                        return (
                                          <a
                                            href={slot.publishedPostUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-850 transition cursor-pointer"
                                          >
                                            Xem bài viết
                                            <ExternalLink size={10} />
                                          </a>
                                        );
                                      }
                                      if (slot.status === 'failed') {
                                        return (
                                          <div className="flex items-center justify-end gap-1.5">
                                            <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium font-sans">
                                              <AlertTriangle size={10} />
                                              Lỗi đăng bài
                                            </div>
                                            {onRetrySlot && campaignDetail?.campaign?.status === 'active' && (
                                              <button
                                                type="button"
                                                disabled={retryingSlotId === slot._id}
                                                onClick={async () => {
                                                  setRetryingSlotId(slot._id);
                                                  try {
                                                    await onRetrySlot(campaignDetail.campaign._id, slot._id);
                                                  } finally {
                                                    setRetryingSlotId(null);
                                                  }
                                                }}
                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-600 hover:bg-indigo-100 transition cursor-pointer disabled:opacity-50"
                                              >
                                                {retryingSlotId === slot._id ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />}
                                                Thử lại
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                      if (slot.status === 'cancelled') {
                                        return (
                                          <span className="text-[10px] text-slate-400 font-medium italic select-none">
                                            Đã hủy
                                          </span>
                                        );
                                      }
                                      if (slot.status === 'skipped') {
                                        return (
                                          <span className="text-[10px] text-slate-400 font-medium italic select-none">
                                            Đã bỏ qua
                                          </span>
                                        );
                                      }
                                      if (slot.status === 'needs_attention') {
                                        return (
                                          <div className="flex items-center justify-end gap-1.5">
                                            <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold font-sans">
                                              <AlertTriangle size={10} />
                                              Cần kiểm tra
                                            </span>
                                            {onRetrySlot && campaignDetail?.campaign?.status === 'active' && (
                                              <button
                                                type="button"
                                                disabled={retryingSlotId === slot._id}
                                                onClick={async () => {
                                                  setRetryingSlotId(slot._id);
                                                  try {
                                                    await onRetrySlot(campaignDetail.campaign._id, slot._id);
                                                  } finally {
                                                    setRetryingSlotId(null);
                                                  }
                                                }}
                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-600 hover:bg-indigo-100 transition cursor-pointer disabled:opacity-50"
                                              >
                                                {retryingSlotId === slot._id ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />}
                                                Thử lại
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                      if (slot.status === 'pending_approval') {
                                        return (
                                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              type="button"
                                              onClick={() => handleShareReviewLink(slot._id)}
                                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-650 hover:bg-indigo-100 transition cursor-pointer"
                                              title="Lấy link để gửi người ngoài duyệt"
                                            >
                                              Chia sẻ link
                                            </button>
                                          </div>
                                        );
                                      }
                                      if ([
                                        'generating',
                                        'researching',
                                        'writing',
                                        'scoring',
                                        'generating_media',
                                        'verifying',
                                        'ready_to_publish',
                                        'publishing',
                                        'retrying',
                                      ].includes(slot.status)) {
                                        return (
                                          <span className="inline-flex items-center gap-1 text-[10px] text-indigo-650 font-semibold select-none animate-pulse">
                                            Đang xử lý
                                          </span>
                                        );
                                      }

                                      // Planned/Pending slots
                                      const scheduledTime = new Date(slot.scheduledAt).getTime();
                                      const diffMs = scheduledTime - now.getTime();

                                      if (diffMs > 3600000) {
                                        return (
                                          <span className="text-[10px] text-slate-400 font-medium select-none" title="Hệ thống tự động chạy trước giờ đăng 1 tiếng">
                                            Chờ chạy (trước 1h)
                                          </span>
                                        );
                                      }
                                      if (diffMs > 0) {
                                        return (
                                          <span className="text-[10px] text-indigo-550 font-bold animate-pulse select-none" title="Đang chuẩn bị khởi chạy">
                                            Chuẩn bị chạy
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="text-[10px] text-amber-600 font-medium select-none">
                                          Chờ xếp lịch chạy
                                        </span>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination Controls */}
                  {totalSlotPages > 1 && (
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 select-none">
                      <span className="text-[11px] font-semibold text-slate-500">
                        Hiển thị {(slotPage - 1) * SLOTS_PER_PAGE + 1} - {Math.min(slotPage * SLOTS_PER_PAGE, sortedSlots.length)} trong tổng số {sortedSlots.length} bài viết
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={slotPage === 1}
                          onClick={() => setSlotPage(prev => Math.max(prev - 1, 1))}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Trước
                        </button>
                        
                        {/* Page Numbers */}
                        {(() => {
                          const pages = [];
                          for (let p = 1; p <= totalSlotPages; p++) {
                            if (p === 1 || p === totalSlotPages || Math.abs(p - slotPage) <= 1) {
                              pages.push(
                                <button
                                  type="button"
                                  key={p}
                                  onClick={() => setSlotPage(p)}
                                  className={`h-7 w-7 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                    slotPage === p
                                      ? 'bg-indigo-600 text-white shadow-xs border border-indigo-650'
                                      : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  {p}
                                </button>
                              );
                            } else if (p === 2 && slotPage > 3) {
                              pages.push(<span key="ell-left" className="text-slate-400 text-xs px-1 select-none">...</span>);
                            } else if (p === totalSlotPages - 1 && slotPage < totalSlotPages - 2) {
                              pages.push(<span key="ell-right" className="text-slate-400 text-xs px-1 select-none">...</span>);
                            }
                          }
                          return pages;
                        })()}

                        <button
                          type="button"
                          disabled={slotPage === totalSlotPages}
                          onClick={() => setSlotPage(prev => Math.min(prev + 1, totalSlotPages))}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
