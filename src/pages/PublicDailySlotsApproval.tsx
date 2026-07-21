import React, { useState, useEffect } from 'react';
import { Check, X, Loader2, Facebook, Calendar, AlertCircle, MessageSquare, Clock } from 'lucide-react';
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

export default function PublicDailySlotsApproval() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotWithContent[]>([]);
  const [campaign, setCampaign] = useState<MarketingCampaignSummary | null>(null);
  const [dateStr, setDateStr] = useState<string>('');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setError('Mã xác thực (token) không hợp lệ hoặc thiếu trong đường dẫn.');
      setLoading(false);
      return;
    }

    async function fetchDailySlots() {
      try {
        const data = await marketingCampaignService.getPublicDailySlots(token!);
        setSlots(data.slots);
        setCampaign(data.campaign);
        setDateStr(data.date);
        if (data.slots.length > 0) {
          setActiveSlotId(data.slots[0]._id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin chiến dịch. Vui lòng kiểm tra lại liên kết.');
      } finally {
        setLoading(false);
      }
    }

    fetchDailySlots();
  }, [token]);

  const activeSlot = slots.find(s => s._id === activeSlotId) || null;

  useEffect(() => {
    setShowRejectForm(false);
    setRejectReason('');
  }, [activeSlotId]);

  const handleApprove = async () => {
    if (!token || !activeSlot || isApproving || isRejecting) return;
    setIsApproving(true);
    try {
      await marketingCampaignService.publicDailySlotAction(token, activeSlot._id, 'approve');
      setSlots(prev => prev.map(s => s._id === activeSlot._id ? { ...s, status: 'ready_to_publish' } : s));
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
      await marketingCampaignService.publicDailySlotAction(token, activeSlot._id, 'reject', rejectReason.trim());
      setSlots(prev => prev.map(s => s._id === activeSlot._id ? { ...s, status: 'needs_attention', errorMessage: rejectReason.trim() } : s));
      setShowRejectForm(false);
      setRejectReason('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gửi phản hồi từ chối bài viết thất bại.');
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex flex-col items-center justify-center font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <p className="text-sm font-semibold tracking-wider text-slate-500 animate-pulse uppercase">
          ĐANG TẢI BÀI VIẾT THEO NGÀY...
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

  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur-md px-6 py-4 flex items-center justify-between select-none shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-9 w-9 rounded-xl border border-slate-200/60 object-cover shadow-md" />
          <div>
            <h1 className="text-sm font-black tracking-wide text-slate-900 uppercase">{BRAND_NAME}</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider">CỔNG DUYỆT BÀI ĐĂNG HÀNG NGÀY</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3.5 py-1.5 rounded-xl">
          <Calendar size={13} className="text-indigo-650" />
          <span className="text-xs font-bold text-indigo-755 font-mono">
            {formattedDate}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden max-w-[1800px] w-full mx-auto p-3 md:p-5 gap-4 md:gap-5 h-[calc(100vh-130px)]">
        
        {/* Left Side: Campaign Info & Slots List */}
        <div className="w-full lg:w-[310px] shrink-0 flex flex-col gap-4 overflow-hidden h-full">
          {/* Campaign details */}
          <div className="bg-white border border-slate-250/70 rounded-2xl p-4 shadow-sm select-none shrink-0">
            <span className="text-[9px] font-black tracking-widest text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">Chiến dịch Marketing</span>
            <h2 className="text-base font-extrabold text-slate-900 mt-1.5 leading-snug">{campaign?.title || 'Tên chiến dịch'}</h2>
            <p className="text-xs text-slate-550 mt-1.5 leading-relaxed truncate" title={campaign?.sourceBrief}>
              <b>Tóm tắt:</b> {campaign?.sourceBrief}
            </p>
          </div>

          {/* Slots Table/List */}
          <div className="flex-1 bg-white border border-slate-250/70 rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[300px]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between select-none">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Bài đăng trong ngày ({slots.length})</span>
            </div>

            <div className="flex-grow overflow-y-auto divide-y divide-slate-100">
              {slots.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">Không có bài viết nào được lên lịch trong ngày này.</div>
              ) : (
                slots.map((s, _idx) => {
                  const scheduledTime = new Date(s.scheduledAt);
                  const displayTime = new Intl.DateTimeFormat('vi-VN', {
                    timeZone: campaign?.timezone || 'Asia/Bangkok',
                    hour: '2-digit', minute: '2-digit', hour12: false
                  }).format(scheduledTime);

                  const isActive = s._id === activeSlotId;
                  const isTikTok = s.platform === 'TikTok';

                  return (
                    <div
                      key={s._id}
                      onClick={() => {
                        setActiveSlotId(s._id);
                        setShowRejectForm(false);
                        setRejectReason('');
                      }}
                      className={`p-4 cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isActive ? 'bg-indigo-50/40 hover:bg-indigo-50/50 border-l-4 border-indigo-600' : 'hover:bg-slate-50/50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700 text-xs flex items-center gap-1 shrink-0 font-mono">
                            <Clock size={11} className="text-slate-400" />
                            {displayTime}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold shrink-0">·</span>
                          <span className="font-semibold text-slate-600 text-xs flex items-center gap-1 capitalize shrink-0 select-none">
                            {isTikTok ? (
                              <TikTokIcon className="h-3 w-3 text-slate-800" />
                            ) : (
                              <Facebook size={12} className="text-blue-600 fill-blue-500/10" />
                            )}
                            {s.platform || 'Facebook'}
                          </span>
                        </div>
                        <p className={`text-xs font-medium truncate ${isActive ? 'text-slate-900 font-bold' : 'text-slate-655'}`}>
                          {s.topicBrief}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-bold text-indigo-755 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                            🏢 {s.pillar}
                          </span>
                          {(() => {
                            const funnel = getFunnelStage(s.objective || '');
                            return (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${funnel.color}`}>
                                🎯 {funnel.label}
                              </span>
                            );
                          })()}
                          {s.variant && (
                            <span className="text-[9px] font-bold text-purple-755 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded">
                              📐 {s.variant}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5 select-none">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                          SLOT_STATUS_COLORS[s.status] || 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {SLOT_STATUS_LABELS[s.status] || s.status}
                        </span>
                      </div>
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

                    <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100 text-[9px] text-slate-450 font-semibold">
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
                <div className="space-y-4">
                  <div>
                    <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-0.5">Trạng thái hiện tại</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[9px] font-bold ${
                      SLOT_STATUS_COLORS[activeSlot.status] || 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      {SLOT_STATUS_LABELS[activeSlot.status] || activeSlot.status}
                    </span>
                  </div>

                  {/* Strategic Details */}
                  <div className="border-t border-slate-100 pt-3.5 space-y-3">
                    <div>
                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1">Trụ cột nội dung (Pillar)</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-755 font-bold">
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 border border-purple-100 text-[10px] text-purple-755 font-bold">
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

                  {activeSlot.status === 'pending_approval' && !showRejectForm && (
                    <div className="flex flex-col gap-2 pt-2">
                      <button
                        type="button"
                        disabled={isApproving}
                        onClick={handleApprove}
                        className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1 shadow-md shadow-green-650/10 cursor-pointer disabled:opacity-50"
                      >
                        {isApproving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Duyệt bài đăng
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(true)}
                        className="w-full bg-rose-50 border border-rose-250 hover:bg-rose-100 text-rose-700 font-extrabold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <X size={13} />
                        Từ chối
                      </button>
                    </div>
                  )}

                  {showRejectForm && (
                    <form onSubmit={handleReject} className="space-y-3 pt-2">
                      <div>
                        <label htmlFor="daily_reason" className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                          <MessageSquare size={9} />
                          Lý do từ chối
                        </label>
                        <textarea
                          id="daily_reason"
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

                <div className="text-[10px] text-slate-400 text-center leading-relaxed">
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
    </div>
  );
}
