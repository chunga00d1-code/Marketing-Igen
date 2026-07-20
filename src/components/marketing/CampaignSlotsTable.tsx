import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Loader2, Facebook, ExternalLink, AlertTriangle, RotateCcw, Check, Share2 } from 'lucide-react';
import { CampaignSlot } from './CampaignDetailModal';
import { MarketingCampaignSummary, marketingCampaignService } from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

const TikTokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.07-2.88-.49-4.13-1.24-.26-.15-.52-.33-.77-.51v7.6c.01 2.37-1.12 4.7-3.23 5.79-2.17 1.14-5.01.99-7.01-.41-2.09-1.42-3.13-4.09-2.58-6.54.51-2.45 2.59-4.43 5.09-4.66.08-.01.16-.01.24-.01v4.07c-.96.11-1.89.7-2.32 1.57-.61 1.15-.31 2.76.7 3.56 1 .8 2.53.64 3.32-.38.41-.5.59-1.14.59-1.78V.02z" />
  </svg>
);

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
  ready_to_publish: 'bg-teal-50 text-teal-755 border-teal-200',
  publishing: 'bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse',
  published: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-755 border-red-200',
  cancelled: 'bg-slate-150 text-slate-500 border-slate-200',
  skipped: 'bg-gray-150 text-gray-500 border-gray-200',
  retrying: 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse',
  needs_attention: 'bg-amber-50 text-amber-700 border-amber-200',
};

const DEFAULT_SLOT_STATUS_LABEL: Record<string, string> = {
  planned: 'Lên lịch',
  queued: 'Đang xếp hàng',
  generating: 'Đang chuẩn bị',
  researching: 'Đang nghiên cứu web',
  writing: 'Đang viết bài',
  scoring: 'Đang chấm điểm AI',
  generating_media: 'Đang thiết kế ảnh',
  verifying: 'Đang kiểm duyệt',
  pending_approval: 'Chờ duyệt',
  ready_to_publish: 'Sẵn sàng đăng',
  publishing: 'Đang đăng',
  published: 'Đã đăng bài',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
  skipped: 'Bỏ qua',
  retrying: 'Đang thử lại',
  needs_attention: 'Cần chú ý',
};

const SLOTS_PER_PAGE = 10;

function getFunnelStage(slotOrObjective: string | { objective?: string; funnelStage?: string }): { label: string; color: string } {
  let stage = '';
  let obj = '';
  if (typeof slotOrObjective === 'object' && slotOrObjective !== null) {
    stage = slotOrObjective.funnelStage || '';
    obj = (slotOrObjective.objective || '').toLowerCase();
  } else if (typeof slotOrObjective === 'string') {
    obj = slotOrObjective.toLowerCase();
  }

  if (stage === 'TOFU') {
    return { label: 'TOFU: Nhận biết', color: 'bg-blue-50 text-blue-700 border-blue-150' };
  }
  if (stage === 'BOFU') {
    return { label: 'BOFU: Chuyển đổi', color: 'bg-emerald-50 text-emerald-700 border-emerald-150' };
  }
  if (stage === 'MOFU') {
    return { label: 'MOFU: Cân nhắc', color: 'bg-amber-50 text-amber-700 border-amber-150' };
  }

  if (
    obj.includes('nhận diện') ||
    obj.includes('tiếp cận') ||
    obj.includes('giới thiệu') ||
    obj.includes('awareness') ||
    obj.includes('discovery') ||
    obj.includes('nhận biết') ||
    obj.includes('thương hiệu')
  ) {
    return { label: 'TOFU: Nhận biết', color: 'bg-blue-50 text-blue-700 border-blue-150' };
  }
  if (
    obj.includes('chuyển đổi') ||
    obj.includes('đăng ký') ||
    obj.includes('mua') ||
    obj.includes('bán') ||
    obj.includes('deal') ||
    obj.includes('ưu đãi') ||
    obj.includes('sale') ||
    obj.includes('action') ||
    obj.includes('cta') ||
    obj.includes('conversion') ||
    obj.includes('khách hàng tiềm năng')
  ) {
    return { label: 'BOFU: Chuyển đổi', color: 'bg-emerald-50 text-emerald-700 border-emerald-150' };
  }
  return { label: 'MOFU: Cân nhắc', color: 'bg-amber-50 text-amber-700 border-amber-150' };
}

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

interface CampaignSlotsTableProps {
  campaign: MarketingCampaignSummary;
  slots: CampaignSlot[];
  activeSlot: CampaignSlot | null;
  onSelectSlot: (slot: CampaignSlot) => void;
  onRetrySlot?: (campaignId: string, slotId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  slotStatusColors?: Record<string, string>;
  slotStatusLabel?: Record<string, string>;
  isBatchPreparing: boolean;
  setIsBatchPreparing: (val: boolean) => void;
}

export const CampaignSlotsTable: React.FC<CampaignSlotsTableProps> = ({
  campaign,
  slots,
  activeSlot,
  onSelectSlot,
  onRetrySlot,
  onRefresh,
  slotStatusColors = DEFAULT_SLOT_STATUS_COLORS,
  slotStatusLabel = DEFAULT_SLOT_STATUS_LABEL,
  isBatchPreparing,
  setIsBatchPreparing,
}) => {
  const [slotPage, setSlotPage] = useState(1);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);
  const [showCustomPrepare, setShowCustomPrepare] = useState(false);
  const [customStartStr, setCustomStartStr] = useState('');
  const [customEndStr, setCustomEndStr] = useState('');
  const [retryingSlotId, setRetryingSlotId] = useState<string | null>(null);

  // Reset pagination/selections and set default custom dates when campaign changes
  useEffect(() => {
    setSlotPage(1);
    setSelectedSlotIds([]);
    if (campaign) {
      setCustomStartStr(campaign.startDate || '');
      setCustomEndStr(campaign.endDate || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?._id, campaign?.startDate, campaign?.endDate]);

  const sortedSlots = useMemo(() => {
    return [...slots].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }, [slots]);

  const totalSlots = sortedSlots.length;
  const totalSlotPages = Math.ceil(totalSlots / SLOTS_PER_PAGE);
  const paginatedSlots = useMemo(() => {
    return sortedSlots.slice((slotPage - 1) * SLOTS_PER_PAGE, slotPage * SLOTS_PER_PAGE);
  }, [sortedSlots, slotPage]);

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

  const pendingApprovalSlots = useMemo(() => {
    return sortedSlots.filter(s => s.status === 'pending_approval');
  }, [sortedSlots]);

  const handleSelectAllPending = () => {
    setSelectedSlotIds(pendingApprovalSlots.map(s => s._id));
  };

  // Action: Share Single Slot
  const handleShareReviewLink = async (slotId: string) => {
    try {
      const response = await marketingCampaignService.getShareLink(campaign._id, slotId);
      await navigator.clipboard.writeText(response.shareLink);
      toast.success('Đã sao chép link duyệt bài đăng vào bộ nhớ tạm!');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể lấy link chia sẻ.');
    }
  };

  // Action: Share Daily review link
  const handleShareDailyReviewLink = async (dateString: string) => {
    try {
      const response = await marketingCampaignService.getDailyShareLink(campaign._id, dateString);
      await navigator.clipboard.writeText(response.shareLink);
      toast.success(`Đã sao chép link duyệt bài đăng ngày ${dateString} vào bộ nhớ tạm!`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể lấy link chia sẻ.');
    }
  };

  // Action: Share Monthly review link
  const handleShareMonthlyReviewLink = async () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startOfMonthObj = new Date(currentYear, currentMonth, 1);
    const endOfMonthObj = new Date(currentYear, currentMonth + 1, 0);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    let startStr = formatDate(startOfMonthObj);
    let endStr = formatDate(endOfMonthObj);
    
    if (campaign.startDate && startStr < campaign.startDate) {
      startStr = campaign.startDate;
    }
    if (campaign.endDate && endStr > campaign.endDate) {
      endStr = campaign.endDate;
    }

    try {
      const response = await marketingCampaignService.getMonthlyShareLink(campaign._id, startStr, endStr);
      await navigator.clipboard.writeText(response.shareLink);
      toast.success(`Đã sao chép link duyệt bài tháng này (${startStr} đến ${endStr}) vào bộ nhớ tạm!`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể lấy link chia sẻ.');
    }
  };

  // Action: Prepare current Month posts
  const handleBatchPrepareMonth = async () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startOfMonthObj = new Date(currentYear, currentMonth, 1);
    const endOfMonthObj = new Date(currentYear, currentMonth + 1, 0);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    let startStr = formatDate(startOfMonthObj);
    let endStr = formatDate(endOfMonthObj);
    
    if (campaign.startDate && startStr < campaign.startDate) {
      startStr = campaign.startDate;
    }
    if (campaign.endDate && endStr > campaign.endDate) {
      endStr = campaign.endDate;
    }

    const confirmPrepare = window.confirm(`Bạn có chắc chắn muốn chuẩn bị trước nội dung cho bài viết tháng này (${startStr} đến ${endStr})?`);
    if (!confirmPrepare) return;

    setIsBatchPreparing(true);
    try {
      const response = await marketingCampaignService.batchPrepare(campaign._id, startStr, endStr);
      toast.success(`Đã thêm thành công ${response.enqueued} bài viết vào hàng chờ tạo nội dung AI!`);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Chuẩn bị nội dung hàng loạt thất bại.');
    } finally {
      setIsBatchPreparing(false);
    }
  };

  // Action: Prepare Custom Date Range
  const handleBatchPrepareCustom = async () => {
    if (!customStartStr || !customEndStr) {
      toast.error('Vui lòng nhập đầy đủ ngày bắt đầu và kết thúc.');
      return;
    }
    if (customStartStr > customEndStr) {
      toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      return;
    }
    
    const confirmPrepare = window.confirm(`Bạn có chắc chắn muốn chuẩn bị trước nội dung cho bài viết trong khoảng từ ${customStartStr} đến ${customEndStr}?`);
    if (!confirmPrepare) return;
    
    setIsBatchPreparing(true);
    try {
      const response = await marketingCampaignService.batchPrepare(campaign._id, customStartStr, customEndStr);
      toast.success(`Đã thêm thành công ${response.enqueued} bài viết vào hàng chờ tạo nội dung AI!`);
      setShowCustomPrepare(false);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Chuẩn bị nội dung hàng loạt thất bại.');
    } finally {
      setIsBatchPreparing(false);
    }
  };

  // Action: Bulk approve selected slots
  const handleBulkApprove = async () => {
    if (selectedSlotIds.length === 0) return;
    setIsBulkApproving(true);
    let successCount = 0;
    let failCount = 0;
    try {
      const slotsToApprove = slots.filter(
        s => selectedSlotIds.includes(s._id) && s.status === 'pending_approval'
      );
      
      if (slotsToApprove.length === 0) {
        toast.info('Không có bài viết nào đang chờ duyệt trong danh sách đã chọn.');
        return;
      }

      await Promise.all(
        slotsToApprove.map(async (slot) => {
          try {
            await marketingCampaignService.approveSlot(campaign._id, slot._id);
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

  // Action: Bulk retry selected failed/needs_attention slots
  const handleBulkRetry = async () => {
    if (selectedSlotIds.length === 0 || !onRetrySlot) return;
    setIsBulkRetrying(true);
    let successCount = 0;
    let failCount = 0;
    try {
      const slotsToRetry = slots.filter(
        s => selectedSlotIds.includes(s._id) && ['failed', 'needs_attention'].includes(s.status)
      );

      if (slotsToRetry.length === 0) {
        toast.info('Không có bài viết nào bị lỗi hoặc cần chú ý trong danh sách đã chọn.');
        return;
      }

      await Promise.all(
        slotsToRetry.map(async (slot) => {
          try {
            await onRetrySlot(campaign._id, slot._id);
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

  const now = new Date();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 select-none">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Lịch trình đăng bài chi tiết (Campaign Slots)</span>
          {activeSlot && <span className="text-[10px] text-indigo-650 font-bold bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded mt-1 inline-block">Bấm chọn slot để xem/sửa chi tiết</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const todayStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: campaign.timezone || 'Asia/Bangkok',
                year: 'numeric', month: '2-digit', day: '2-digit'
              }).format(new Date());
              handleShareDailyReviewLink(todayStr);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10.5px] font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-655 transition cursor-pointer shadow-3xs"
            title="Lấy link để gửi người ngoài duyệt toàn bộ bài đăng của ngày hôm nay"
          >
            <Share2 size={11} className="text-slate-400" />
            Chia sẻ duyệt bài hôm nay
          </button>

          <button
            type="button"
            onClick={handleShareMonthlyReviewLink}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[10.5px] font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-655 transition cursor-pointer shadow-3xs"
            title="Lấy link để gửi người ngoài duyệt toàn bộ bài đăng của tháng này"
          >
            <Share2 size={11} className="text-slate-400" />
            Chia sẻ duyệt tháng này
          </button>

          <button
            type="button"
            onClick={handleBatchPrepareMonth}
            disabled={isBatchPreparing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 text-[10.5px] font-bold text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900 transition cursor-pointer shadow-3xs disabled:opacity-50"
            title="Chuẩn bị hàng loạt nội dung AI cho tháng này"
          >
            {isBatchPreparing ? (
              <Loader2 size={11} className="animate-spin text-indigo-500" />
            ) : (
              <CalendarClock size={11} className="text-indigo-500" />
            )}
            Chuẩn bị nội dung tháng này
          </button>

          <button
            type="button"
            onClick={() => setShowCustomPrepare(!showCustomPrepare)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10.5px] font-bold transition cursor-pointer shadow-3xs ${
              showCustomPrepare
                ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-650/15'
                : 'border-indigo-150 bg-indigo-50/50 text-indigo-755 hover:bg-indigo-50 hover:text-indigo-900'
            }`}
            title="Chuẩn bị hàng loạt nội dung AI cho bài đăng theo khoảng ngày tự chọn"
          >
            <CalendarClock size={11} className={showCustomPrepare ? 'text-white' : 'text-indigo-500'} />
            Tạo nội dung theo khoảng ngày
          </button>
        </div>
      </div>

      {showCustomPrepare && (
        <div className="bg-slate-50 border border-slate-250/70 rounded-xl p-3 flex flex-wrap items-end gap-3.5 animate-in fade-in slide-in-from-top-1 duration-200 select-none">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Từ ngày</span>
            <input
              type="date"
              value={customStartStr}
              onChange={(e) => setCustomStartStr(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-indigo-655 focus:outline-hidden"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Đến ngày</span>
            <input
              type="date"
              value={customEndStr}
              onChange={(e) => setCustomEndStr(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-indigo-655 focus:outline-hidden"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isBatchPreparing}
              onClick={handleBatchPrepareCustom}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isBatchPreparing ? (
                <Loader2 size={12} className="animate-spin text-white" />
              ) : (
                <Check size={12} />
              )}
              Bắt đầu tạo
            </button>
            <button
              type="button"
              onClick={() => setShowCustomPrepare(false)}
              className="bg-white hover:bg-slate-100 text-slate-550 hover:text-slate-800 border border-slate-200 font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

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
                  className="text-[11px] text-indigo-655 hover:text-indigo-850 hover:underline font-bold transition cursor-pointer"
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
              Duyệt hàng loạt ({slots.filter(s => selectedSlotIds.includes(s._id) && s.status === 'pending_approval').length})
            </button>
            {onRetrySlot && (
              <button
                type="button"
                disabled={isBulkRetrying}
                onClick={handleBulkRetry}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-55"
              >
                {isBulkRetrying ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Thử lại ({slots.filter(s => selectedSlotIds.includes(s._id) && ['failed', 'needs_attention'].includes(s.status)).length})
              </button>
            )}
          </div>
        </div>
      ) : (
        pendingApprovalSlots.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-600">
            <span className="font-medium">Có <span className="font-bold text-indigo-655">{pendingApprovalSlots.length}</span> bài viết đang chờ duyệt.</span>
            <button
              type="button"
              onClick={handleSelectAllPending}
              className="text-[11px] text-indigo-655 hover:text-indigo-850 hover:underline font-bold transition cursor-pointer"
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
              <tr className="bg-slate-550/5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-150 select-none">
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
                    timeZone: campaign.timezone || 'Asia/Bangkok',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                  }).format(scheduledDate);

                  const progress = getSlotProgress(slot.status);

                  return (
                    <tr
                      key={slot._id}
                      onClick={() => onSelectSlot(slot)}
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
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-750 select-none capitalize">
                          {slot.platform === 'TikTok' ? (
                            <>
                              <TikTokIcon className="h-3 w-3 text-slate-800 shrink-0" />
                              TikTok
                            </>
                          ) : (
                            <>
                              <Facebook size={12} className="text-blue-600 shrink-0" />
                              Facebook
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px] sm:max-w-[300px] md:max-w-[400px] xl:max-w-[600px]">
                        <div className="flex flex-wrap gap-1.5 mb-1.5 select-none">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[9px] text-indigo-755 font-bold">
                            🏢 {slot.pillar}
                          </span>
                          {(() => {
                            const funnel = getFunnelStage(slot);
                            return (
                              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${funnel.color}`}>
                                🎯 {funnel.label}
                              </span>
                            );
                          })()}
                          {slot.variant && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 border border-purple-100 text-[9px] text-purple-755 font-bold">
                              📐 Góc tiếp cận: {slot.variant}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-650 truncate leading-relaxed font-sans" title={slot.topicBrief}>
                          {slot.topicBrief}
                        </p>
                        {slot.objective && (
                          <p className="text-[10px] text-slate-400 mt-0.5 italic font-sans">
                            Mục tiêu: {slot.objective}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold select-none ${slotStatusColors[slot.status] || 'bg-slate-100 text-slate-655 border-slate-200'}`}>
                          {slotStatusLabel[slot.status] || slot.status}
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
                                {onRetrySlot && campaign.status === 'active' && (
                                  <button
                                    type="button"
                                    disabled={retryingSlotId === slot._id}
                                    onClick={async () => {
                                      setRetryingSlotId(slot._id);
                                      try {
                                        await onRetrySlot(campaign._id, slot._id);
                                      } finally {
                                        setRetryingSlotId(null);
                                      }
                                    }}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-650 hover:bg-indigo-100 transition cursor-pointer disabled:opacity-55"
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
                                {onRetrySlot && campaign.status === 'active' && (
                                  <button
                                    type="button"
                                    disabled={retryingSlotId === slot._id}
                                    onClick={async () => {
                                      setRetryingSlotId(slot._id);
                                      try {
                                        await onRetrySlot(campaign._id, slot._id);
                                      } finally {
                                        setRetryingSlotId(null);
                                      }
                                    }}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-650 hover:bg-indigo-100 transition cursor-pointer disabled:opacity-55"
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
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-[9px] font-bold text-indigo-655 hover:bg-indigo-100 transition cursor-pointer"
                                  title="Lấy link để gửi người ngoài duyệt slot này"
                                >
                                  Chia sẻ slot
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
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-650 transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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
                          : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-650'
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
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-650 transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
