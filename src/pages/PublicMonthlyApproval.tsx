import React, { useState, useEffect, useMemo } from 'react';
import { Check, X, Loader2, Facebook, Calendar, AlertCircle, MessageSquare, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { marketingCampaignService, CampaignSlot, MarketingContent, MarketingCampaignSummary } from '../services/marketingCampaignService';
import { BRAND_LOGO_PATH, BRAND_NAME } from '../config/brand';

const TikTokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.07-2.88-.49-4.13-1.24-.26-.15-.52-.33-.77-.51v7.6c.01 2.37-1.12 4.7-3.23 5.79-2.17 1.14-5.01.99-7.01-.41-2.09-1.42-3.13-4.09-2.58-6.54.51-2.45 2.59-4.43 5.09-4.66.08-.01.16-.01.24-.01v4.07c-.96.11-1.89.7-2.32 1.57-.61 1.15-.31 2.76.7 3.56 1 .8 2.53.64 3.32-.38.41-.5.59-1.14.59-1.78V.02z" />
  </svg>
);

function getFunnelStage(objective: string): { label: string; color: string } {
  const obj = (objective || '').toLowerCase();
  if (
    obj.includes('nhận diện') ||
    obj.includes('tiếp cận') ||
    obj.includes('giới thiệu') ||
    obj.includes('awareness') ||
    obj.includes('discovery') ||
    obj.includes('nhận biết') ||
    obj.includes('thương hiệu')
  ) {
    return { label: 'TOFU: Nhận diện', color: 'bg-blue-50 text-blue-700 border-blue-150' };
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

type SlotWithContent = CampaignSlot & { content: MarketingContent | null };

const TIKTOK_MONTHLY_EXTERNAL_REVIEWER = 'External Reviewer (Monthly · TikTok content)';

function isTikTokContentApproved(slot: SlotWithContent) {
  return slot.platform === 'TikTok'
    && slot.status === 'pending_approval'
    && slot.approvedBy === TIKTOK_MONTHLY_EXTERNAL_REVIEWER;
}

function slotStatusLabel(slot: SlotWithContent) {
  return isTikTokContentApproved(slot)
    ? 'Đã duyệt nội dung · chờ chủ TikTok xác nhận'
    : SLOT_STATUS_LABELS[slot.status] || slot.status;
}

function slotStatusClass(slot: SlotWithContent) {
  return isTikTokContentApproved(slot)
    ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
    : SLOT_STATUS_COLORS[slot.status] || 'bg-slate-50 text-slate-500 border-slate-200';
}

const SLOT_STATUS_LABELS: Record<string, string> = {
  planned: 'Lên lịch',
  queued: 'Đang xếp hàng',
  generating: 'Đang tạo',
  scoring: 'Đang chấm điểm',
  generating_media: 'Đang tạo ảnh',
  pending_approval: 'Chờ duyệt',
  ready_to_publish: 'Sẵn sàng đăng',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Lỗi đăng bài',
  needs_attention: 'Cần chú ý',
  cancelled: 'Đã hủy',
  skipped: 'Đã bỏ qua',
};

const SLOT_STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_to_publish: 'bg-green-50 text-green-700 border-green-200',
  needs_attention: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  published: 'bg-blue-50 text-blue-700 border-blue-200',
  planned: 'bg-slate-50 text-slate-650 border-slate-200',
};

export default function PublicMonthlyApproval() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotWithContent[]>([]);
  const [campaign, setCampaign] = useState<MarketingCampaignSummary | null>(null);
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  // Selection state for bulk actions
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  // Action states
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Bulk action states
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all');

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setError('Mã xác thực (token) không hợp lệ hoặc thiếu trong đường dẫn.');
      setLoading(false);
      return;
    }

    async function fetchMonthlySlots() {
      try {
        const data = await marketingCampaignService.getPublicMonthlySlots(token!);
        setSlots(data.slots);
        setCampaign(data.campaign);
        setStartDateStr(data.startDate);
        setEndDateStr(data.endDate);
        if (data.slots.length > 0) {
          // Find first pending_approval slot to activate
          const firstPending = data.slots.find(s => s.status === 'pending_approval' && !isTikTokContentApproved(s));
          setActiveSlotId(firstPending ? firstPending._id : data.slots[0]._id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin chiến dịch. Vui lòng kiểm tra lại liên kết.');
      } finally {
        setLoading(false);
      }
    }

    fetchMonthlySlots();
  }, [token]);

  const activeSlot = slots.find(s => s._id === activeSlotId) || null;

  useEffect(() => {
    setShowRejectForm(false);
    setRejectReason('');
  }, [activeSlotId]);


  // Filter slots to show
  const filteredSlots = useMemo(() => {
    return slots.filter(slot => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending_approval') return slot.status === 'pending_approval' && !isTikTokContentApproved(slot);
      if (statusFilter === 'approved') return slot.status === 'ready_to_publish' || slot.status === 'published' || isTikTokContentApproved(slot);
      if (statusFilter === 'rejected') return slot.status === 'needs_attention';
      return true;
    });
  }, [slots, statusFilter]);

  const filteredGroupedSlots = useMemo(() => {
    const groups: Record<string, SlotWithContent[]> = {};
    filteredSlots.forEach(slot => {
      const dateStr = new Date(slot.scheduledAt).toISOString().split('T')[0];
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(slot);
    });
    return groups;
  }, [filteredSlots]);

  // Checkable slots (only those in pending_approval state)
  const checkableSlots = useMemo(() => {
    return filteredSlots.filter(s => s.status === 'pending_approval' && !isTikTokContentApproved(s));
  }, [filteredSlots]);

  const isAllSelected = useMemo(() => {
    if (checkableSlots.length === 0) return false;
    return checkableSlots.every(s => selectedSlotIds.has(s._id));
  }, [checkableSlots, selectedSlotIds]);

  const handleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all
      setSelectedSlotIds(prev => {
        const next = new Set(prev);
        checkableSlots.forEach(s => next.delete(s._id));
        return next;
      });
    } else {
      // Select all checkable
      setSelectedSlotIds(prev => {
        const next = new Set(prev);
        checkableSlots.forEach(s => next.add(s._id));
        return next;
      });
    }
  };

  const handleSelectSlot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSlotIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const handleApprove = async () => {
    if (!token || !activeSlot || isApproving || isRejecting) return;
    setIsApproving(true);
    try {
      const result = await marketingCampaignService.publicMonthlySlotAction(token, activeSlot._id, 'approve') as { slot?: CampaignSlot };
      if (result.slot) {
        setSlots(prev => prev.map(s => s._id === activeSlot._id ? { ...s, ...result.slot } : s));
      }
      setSelectedSlotIds(prev => {
        const next = new Set(prev);
        next.delete(activeSlot._id);
        return next;
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Duyệt bài viết thất bại.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeSlot || isApproving || isRejecting) return;
    if (!rejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối bài viết.');
      return;
    }
    setIsRejecting(true);
    try {
      await marketingCampaignService.publicMonthlySlotAction(token, activeSlot._id, 'reject', rejectReason.trim());
      setSlots(prev => prev.map(s => s._id === activeSlot._id ? { ...s, status: 'needs_attention', errorMessage: rejectReason.trim() } : s));
      setSelectedSlotIds(prev => {
        const next = new Set(prev);
        next.delete(activeSlot._id);
        return next;
      });
      setShowRejectForm(false);
      setRejectReason('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gửi phản hồi từ chối bài viết thất bại.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!token || selectedSlotIds.size === 0 || isBulkProcessing) return;
    const confirmApprove = window.confirm(`Bạn có chắc chắn muốn duyệt ${selectedSlotIds.size} bài viết đã chọn?`);
    if (!confirmApprove) return;

    setIsBulkProcessing(true);
    const idsToProcess = Array.from(selectedSlotIds);
    try {
      await marketingCampaignService.publicMonthlyBulkAction(token, idsToProcess, 'approve');
      const refreshed = await marketingCampaignService.getPublicMonthlySlots(token);
      setSlots(refreshed.slots);
      setSelectedSlotIds(new Set());
      alert('Đã duyệt nội dung hàng loạt. TikTok vẫn cần chủ tài khoản xác nhận trước khi đăng.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Duyệt hàng loạt thất bại.');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || selectedSlotIds.size === 0 || isBulkProcessing) return;
    if (!bulkRejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối hàng loạt.');
      return;
    }

    setIsBulkProcessing(true);
    const idsToProcess = Array.from(selectedSlotIds);
    try {
      await marketingCampaignService.publicMonthlyBulkAction(token, idsToProcess, 'reject', bulkRejectReason.trim());
      setSlots(prev => prev.map(s => idsToProcess.includes(s._id) ? { ...s, status: 'needs_attention', errorMessage: bulkRejectReason.trim() } : s));
      setSelectedSlotIds(new Set());
      setShowBulkRejectModal(false);
      setBulkRejectReason('');
      alert('Đã từ chối hàng loạt bài viết thành công.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Từ chối hàng loạt thất bại.');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex flex-col items-center justify-center font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <p className="text-sm font-semibold tracking-wider text-slate-500 animate-pulse uppercase">
          ĐANG TẢI BÀI VIẾT THEO THÁNG...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-2xl p-6 text-center shadow-xl">
          <AlertCircle className="h-14 w-14 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Đã xảy ra lỗi</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">{error}</p>
          <div className="text-xs text-slate-400">
            Hãy liên hệ với người quản lý chiến dịch của bạn để được hỗ trợ.
          </div>
        </div>
      </div>
    );
  }

  const formatDateRange = () => {
    if (!startDateStr || !endDateStr) return '';
    const start = new Date(startDateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const end = new Date(endDateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${start} - ${end}`;
  };

  // Stats calculation
  const totalPending = slots.filter(s => s.status === 'pending_approval' && !isTikTokContentApproved(s)).length;
  const totalApproved = slots.filter(s => s.status === 'ready_to_publish' || s.status === 'published' || isTikTokContentApproved(s)).length;
  const totalRejected = slots.filter(s => s.status === 'needs_attention').length;

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex flex-col font-sans h-screen overflow-hidden">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-9 w-9 rounded-xl border border-slate-200/60 object-cover shadow-md" />
          <div>
            <h1 className="text-sm font-black tracking-wide text-slate-900 uppercase">{BRAND_NAME}</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider">CỔNG DUYỆT BÀI ĐĂNG THEO THÁNG</p>
          </div>
        </div>
        
        {/* Statistics Bar */}
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100 font-bold">
            Chờ duyệt: {totalPending}
          </div>
          <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2.5 py-1 rounded-lg border border-green-100 font-bold">
            Đã duyệt: {totalApproved}
          </div>
          <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-lg border border-rose-100 font-bold">
            Cần sửa: {totalRejected}
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-xl">
            <Calendar size={13} className="text-indigo-650" />
            <span className="font-bold text-indigo-755 font-mono">
              {formatDateRange()}
            </span>
          </div>
        </div>
      </header>

      {/* Bulk Action and Filtering Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 select-none shrink-0 shadow-sm z-10">
        {/* Filters */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-bold text-slate-400 mr-2 uppercase tracking-wider font-mono">Lọc trạng thái:</span>
          {(['all', 'pending_approval', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === f
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/10'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {f === 'all' && `Tất cả (${slots.length})`}
              {f === 'pending_approval' && `Chờ duyệt (${totalPending})`}
              {f === 'approved' && `Đã duyệt (${totalApproved})`}
              {f === 'rejected' && `Cần sửa (${totalRejected})`}
            </button>
          ))}
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0">
          <div className="flex items-center gap-2">
            {checkableSlots.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-650 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                Chọn tất cả chờ duyệt ({checkableSlots.length})
              </label>
            )}
          </div>

          {selectedSlotIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-150">
                Đã chọn: {selectedSlotIds.size}
              </span>
              <button
                onClick={handleBulkApprove}
                disabled={isBulkProcessing}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isBulkProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Duyệt đã chọn
              </button>
              <button
                onClick={() => setShowBulkRejectModal(true)}
                disabled={isBulkProcessing}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                <X size={12} />
                Từ chối đã chọn
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden w-full max-w-[1800px] mx-auto p-3 md:p-5 gap-4 md:gap-5 h-[calc(100vh-130px)]">
        
        {/* Left Side: Slots Grouped by Date */}
        <div className="w-full lg:w-[310px] shrink-0 flex flex-col gap-4 overflow-hidden h-full">
          {/* Campaign details */}
          <div className="bg-white border border-slate-250/70 rounded-2xl p-4 shadow-sm select-none shrink-0">
            <span className="text-[9px] font-black tracking-widest text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">Chiến dịch Marketing</span>
            <h2 className="text-base font-extrabold text-slate-900 mt-1.5 leading-snug">{campaign?.title || 'Tên chiến dịch'}</h2>
            <p className="text-xs text-slate-550 mt-1.5 leading-relaxed truncate" title={campaign?.sourceBrief}>
              <b>Tóm tắt:</b> {campaign?.sourceBrief}
            </p>
          </div>

          {/* Date-Grouped list */}
          <div className="flex-grow bg-white border border-slate-250/70 rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[300px]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between select-none">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Lịch trình tháng ({filteredSlots.length} bài)
              </span>
            </div>

            <div className="flex-grow overflow-y-auto">
              {Object.keys(filteredGroupedSlots).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">Không tìm thấy bài viết nào khớp với bộ lọc.</div>
              ) : (
                Object.keys(filteredGroupedSlots).sort().map(dateKey => {
                  const daySlots = filteredGroupedSlots[dateKey];
                  const isCollapsed = collapsedDates.has(dateKey);
                  const displayDate = new Date(dateKey).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
                  
                  return (
                    <div key={dateKey} className="border-b border-slate-100 last:border-0">
                      {/* Date Header */}
                      <div
                        onClick={() => toggleDateCollapse(dateKey)}
                        className="bg-slate-50/70 hover:bg-slate-100/70 px-4 py-2 flex items-center justify-between cursor-pointer select-none transition"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          <span className="text-xs font-extrabold text-slate-700 capitalize">{displayDate}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full font-mono">
                          {daySlots.length} bài
                        </span>
                      </div>

                      {/* Day Slots List */}
                      {!isCollapsed && (
                        <div className="divide-y divide-slate-50">
                          {daySlots.map(s => {
                            const scheduledTime = new Date(s.scheduledAt);
                            const displayTime = new Intl.DateTimeFormat('vi-VN', {
                              timeZone: campaign?.timezone || 'Asia/Bangkok',
                              hour: '2-digit', minute: '2-digit', hour12: false
                            }).format(scheduledTime);

                            const isActive = s._id === activeSlotId;
                            const isTikTok = s.platform === 'TikTok';
                            const isChecked = selectedSlotIds.has(s._id);
                            const isCheckable = s.status === 'pending_approval' && !isTikTokContentApproved(s);

                            return (
                              <div
                                key={s._id}
                                onClick={() => {
                                  setActiveSlotId(s._id);
                                  setShowRejectForm(false);
                                  setRejectReason('');
                                }}
                                className={`p-3 cursor-pointer transition-all flex items-start gap-2.5 ${
                                  isActive ? 'bg-indigo-50/40 hover:bg-indigo-50/50 border-l-4 border-indigo-600' : 'hover:bg-slate-50/30 border-l-4 border-transparent'
                                }`}
                              >
                                {/* Checkbox for bulk actions */}
                                {isCheckable && (
                                  <div className="pt-0.5" onClick={(e) => handleSelectSlot(s._id, e)}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      readOnly
                                      className="h-3.5 w-3.5 rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </div>
                                )}
                                
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-650 text-[10px] flex items-center gap-0.5 shrink-0 font-mono">
                                      <Clock size={10} className="text-slate-400" />
                                      {displayTime}
                                    </span>
                                    <span className="text-[9px] text-slate-350 font-bold shrink-0">·</span>
                                    <span className="font-semibold text-slate-550 text-[10px] flex items-center gap-0.5 capitalize shrink-0 select-none">
                                      {isTikTok ? (
                                        <TikTokIcon className="h-2.5 w-2.5 text-slate-800" />
                                      ) : (
                                        <Facebook size={10} className="text-blue-600 fill-blue-500/10" />
                                      )}
                                      {s.platform || 'Facebook'}
                                    </span>
                                  </div>
                                  <p className={`text-xs font-semibold truncate ${isActive ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                                    {s.topicBrief}
                                  </p>
                                  
                                  {/* Badges row */}
                                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                    <span className="text-[8px] font-bold text-indigo-755 bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded shrink-0">
                                      🏢 {s.pillar?.slice(0, 15)}
                                    </span>
                                    {(() => {
                                      const funnel = getFunnelStage(s.objective || '');
                                      return (
                                        <span className={`text-[8px] font-bold px-1 py-0.2 rounded border shrink-0 ${funnel.color}`}>
                                          🎯 {funnel.label?.split(':')[0]}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>

                                <div className="shrink-0 pt-0.5 select-none">
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full border text-[8px] font-bold ${
                                    slotStatusClass(s)
                                  }`}>
                                    {slotStatusLabel(s)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Active Preview & Decision */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden h-full">
          {activeSlot ? (
            <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-5 overflow-hidden h-full">
              {/* Preview mockup (Facebook / TikTok) */}
              <div className="flex-1 min-w-0 flex items-start justify-center bg-slate-100/60 border border-slate-200/60 rounded-2xl p-4 md:p-6 overflow-y-auto h-full">
                {activeSlot.platform === 'TikTok' ? (
                  /* TikTok Mockup */
                  <div className="w-[310px] aspect-[9/19] bg-black border-[5px] border-slate-900 rounded-[32px] shadow-2xl relative overflow-hidden flex flex-col select-none shrink-0 my-auto">
                    <div className="absolute inset-0 z-0 bg-slate-950 flex items-center justify-center">
                      {activeSlot.content?.videoUrl || activeSlot.content?.mediaUrls?.[0] ? (
                        <video
                          src={activeSlot.content.videoUrl || activeSlot.content.mediaUrls[0]}
                          controls
                          autoPlay
                          loop
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-slate-600 p-6 flex flex-col items-center">
                          <Loader2 size={24} className="animate-spin mb-2 text-slate-700" />
                          <p className="text-[10px] font-bold uppercase tracking-wider font-mono">Đang tạo video mẫu...</p>
                        </div>
                      )}
                    </div>

                    <div className="absolute top-4 left-0 right-0 z-10 flex justify-center gap-5 text-xs font-bold text-white/60 drop-shadow-md">
                      <span className="cursor-pointer hover:text-white transition">Đang follow</span>
                      <span className="text-white border-b-2 border-white pb-0.5 cursor-pointer">Dành cho bạn</span>
                    </div>

                    <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-4 text-white drop-shadow-md">
                      <div className="relative">
                        <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-8 w-8 rounded-full border border-white object-cover shadow-md" />
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-rose-500 text-white rounded-full text-[8px] px-1 font-bold shadow-md">+</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl">❤️</span>
                        <span className="text-[9px] font-bold">0</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl">💬</span>
                        <span className="text-[9px] font-bold">0</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xl">⚡</span>
                        <span className="text-[9px] font-bold">0</span>
                      </div>
                    </div>

                    <div className="absolute left-4 right-14 bottom-5 z-10 text-white drop-shadow-md text-left font-sans">
                      <h4 className="font-bold text-xs">@{campaign?.title?.replace(/\s+/g, '').toLowerCase() || 'igentech'}</h4>
                      <p className="text-[11px] text-slate-200 mt-1 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                        {activeSlot.content?.bodyText}
                      </p>
                      <div className="flex items-center gap-1 mt-2 text-[9px] text-slate-350">
                        <span>🎵</span>
                        <span className="truncate font-mono">Âm thanh nguyên bản - iGen Studio AI</span>
                      </div>
                    </div>

                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-24 bg-white/40 rounded-full z-10" />
                  </div>
                ) : (
                  /* Facebook Mockup */
                  <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden font-sans text-slate-800 select-none text-left shrink-0 my-auto sm:my-0">
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-indigo-650 font-bold shrink-0">
                          {campaign?.title?.slice(0, 2).toUpperCase() || 'FB'}
                        </div>
                        <div>
                          <span className="block text-xs font-black text-slate-800 hover:underline cursor-pointer">
                            {campaign?.title || 'Trang Facebook'}
                          </span>
                          <span className="flex items-center gap-1 text-[9px] text-slate-400 font-semibold mt-0.5">
                            {new Intl.DateTimeFormat('vi-VN', {
                              timeZone: campaign?.timezone || 'Asia/Bangkok',
                              hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
                            }).format(new Date(activeSlot.scheduledAt))} · 🌐
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="px-3 pb-3 text-xs text-slate-750 leading-relaxed whitespace-pre-wrap font-sans">
                      {activeSlot.content?.title && (
                        <h4 className="font-bold text-slate-900 mb-1 text-xs">{activeSlot.content.title}</h4>
                      )}
                      {activeSlot.content?.bodyText || 'Chưa có nội dung bài viết...'}
                    </div>

                    {(activeSlot.content?.imageUrl || activeSlot.content?.mediaUrls?.[0]) && (
                      <div className="border-t border-b border-slate-100 bg-slate-950 aspect-video flex items-center justify-center relative overflow-hidden select-none">
                        {activeSlot.content?.mediaType === 'video' || activeSlot.content?.videoUrl ? (
                          <video src={activeSlot.content.videoUrl || activeSlot.content.mediaUrls[0]} controls className="w-full h-full object-contain" />
                        ) : (
                          <img src={activeSlot.content.imageUrl || activeSlot.content.mediaUrls[0]} alt="Facebook Post Preview" className="w-full h-full object-contain" />
                        )}
                      </div>
                    )}

                    <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100 text-[9px] text-slate-455 font-semibold">
                      <div className="flex items-center gap-1">
                        <span className="flex items-center justify-center h-4 w-4 rounded-full bg-blue-600 text-white text-[7px] font-bold">👍</span>
                        <span>0 thích</span>
                      </div>
                      <div className="flex gap-1.5">
                        <span>0 bình luận</span>
                        <span>0 chia sẻ</span>
                      </div>
                    </div>

                    <div className="px-1 py-0.5 grid grid-cols-3 gap-0.5 text-slate-500 font-bold text-[9px]">
                      <button type="button" className="py-2 hover:bg-slate-50 rounded flex items-center justify-center gap-1 transition cursor-pointer">👍 Thích</button>
                      <button type="button" className="py-2 hover:bg-slate-50 rounded flex items-center justify-center gap-1 transition cursor-pointer">💬 Bình luận</button>
                      <button type="button" className="py-2 hover:bg-slate-50 rounded flex items-center justify-center gap-1 transition cursor-pointer">➡️ Chia sẻ</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Column for the active slot */}
              <div className="w-full lg:w-[250px] shrink-0 flex flex-col gap-4 justify-between h-full bg-white border border-slate-250/70 rounded-2xl p-4 shadow-sm select-none overflow-y-auto min-h-0">
                <div className="space-y-4 overflow-y-auto">
                  <div>
                    <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-0.5">Trạng thái hiện tại</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[9px] font-bold ${
                      slotStatusClass(activeSlot)
                    }`}>
                      {slotStatusLabel(activeSlot)}
                    </span>
                  </div>

                  {/* Strategic Details */}
                  <div className="border-t border-slate-100 pt-3.5 space-y-3">
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Trụ cột nội dung (Pillar)</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-755 font-bold leading-normal whitespace-normal break-words">
                        🏢 {activeSlot.pillar}
                      </span>
                    </div>

                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Giai đoạn phễu (Funnel)</span>
                      {(() => {
                        const funnel = getFunnelStage(activeSlot.objective || '');
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${funnel.color}`}>
                            🎯 {funnel.label}
                          </span>
                        );
                      })()}
                    </div>

                    {activeSlot.variant && (
                      <div>
                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Góc sáng tạo (Creative Angle)</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 border border-purple-100 text-[10px] text-purple-755 font-bold leading-normal whitespace-normal break-words">
                          📐 {activeSlot.variant}
                        </span>
                      </div>
                    )}

                    {activeSlot.objective && (
                      <div>
                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-0.5">Mục tiêu</span>
                        <span className="text-[10px] text-slate-500 font-sans italic block leading-relaxed">{activeSlot.objective}</span>
                      </div>
                    )}
                  </div>

                  {activeSlot.status === 'needs_attention' && activeSlot.errorMessage && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-800 leading-relaxed font-sans">
                      <span className="font-bold block mb-0.5">Lý do từ chối trước đó:</span>
                      <p className="whitespace-pre-wrap font-medium">{activeSlot.errorMessage}</p>
                    </div>
                  )}

                  {activeSlot.status === 'failed' && activeSlot.errorMessage && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-[10px] text-red-800 leading-relaxed font-sans">
                      <span className="font-bold block mb-0.5">Chi tiết lỗi:</span>
                      <p className="whitespace-pre-wrap font-mono truncate">{activeSlot.errorMessage}</p>
                    </div>
                  )}

                  {activeSlot.status === 'pending_approval' && !isTikTokContentApproved(activeSlot) && !showRejectForm && (
                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        type="button"
                        disabled={isApproving}
                        onClick={handleApprove}
                        className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1 shadow-md shadow-green-650/10 cursor-pointer disabled:opacity-50"
                      >
                        {isApproving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        {activeSlot.platform === 'TikTok' ? 'Duyệt nội dung TikTok' : 'Duyệt bài đăng'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(true)}
                        className="w-full bg-rose-50 border border-rose-250 hover:bg-rose-100 text-rose-700 font-extrabold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <X size={13} />
                        Từ chối bài này
                      </button>
                    </div>
                  )}

                  {showRejectForm && (
                    <form onSubmit={handleReject} className="space-y-3 pt-2">
                      <div>
                        <label htmlFor="monthly_reason" className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                          <MessageSquare size={9} />
                          Lý do từ chối (Bắt buộc)
                        </label>
                        <textarea
                          id="monthly_reason"
                          required
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Nêu rõ lý do từ chối để chỉnh sửa..."
                          className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none min-h-[80px] font-sans resize-y leading-relaxed"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={isRejecting}
                          className="flex-grow bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-2 rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {isRejecting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowRejectForm(false);
                            setRejectReason('');
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-lg text-xs"
                        >
                          Hủy
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 text-center leading-relaxed shrink-0 pt-2 border-t border-slate-100">
                  Quyết định phê duyệt sẽ được cập nhật ngay lập tức vào lịch trình đăng bài của chiến dịch.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white border border-slate-250/70 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs">
              Chọn bài viết ở danh sách bên trái để bắt đầu phê duyệt.
            </div>
          )}
        </div>

      </div>

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl p-6 select-none animate-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-900 uppercase">Từ chối hàng loạt bài đăng</h3>
              <button
                onClick={() => setShowBulkRejectModal(false)}
                className="text-slate-400 hover:text-slate-650 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBulkRejectSubmit} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn đang từ chối <span className="font-bold text-rose-600">{selectedSlotIds.size}</span> bài viết đã chọn. Hãy nhập lý do bắt buộc để người tạo chiến dịch nắm bắt và chỉnh sửa.
              </p>

              <div>
                <label htmlFor="bulk_reason" className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                  <MessageSquare size={10} />
                  Lý do từ chối (Bắt buộc)
                </label>
                <textarea
                  id="bulk_reason"
                  required
                  value={bulkRejectReason}
                  onChange={(e) => setBulkRejectReason(e.target.value)}
                  placeholder="Ghi rõ yêu cầu sửa đổi cho các bài viết đã chọn..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none min-h-[100px] font-sans resize-y leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkRejectModal(false);
                    setBulkRejectReason('');
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isBulkProcessing || !bulkRejectReason.trim()}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1 shadow-md shadow-rose-650/10 cursor-pointer disabled:opacity-50"
                >
                  {isBulkProcessing ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  Xác nhận từ chối hàng loạt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
