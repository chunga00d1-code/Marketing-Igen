import React, { useState, useEffect } from 'react';
import { Check, X, Loader2, Facebook, Calendar, AlertCircle, MessageSquare } from 'lucide-react';
import { marketingCampaignService, CampaignSlot, MarketingContent, MarketingCampaignSummary } from '../services/marketingCampaignService';
import { BRAND_LOGO_PATH, BRAND_NAME } from '../config/brand';

// Custom SVG icon for TikTok
const TikTokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.07-2.88-.49-4.13-1.24-.26-.15-.52-.33-.77-.51v7.6c.01 2.37-1.12 4.7-3.23 5.79-2.17 1.14-5.01.99-7.01-.41-2.09-1.42-3.13-4.09-2.58-6.54.51-2.45 2.59-4.43 5.09-4.66.08-.01.16-.01.24-.01v4.07c-.96.11-1.89.7-2.32 1.57-.61 1.15-.31 2.76.7 3.56 1 .8 2.53.64 3.32-.38.41-.5.59-1.14.59-1.78V.02z" />
  </svg>
);

export default function PublicSlotApproval() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<CampaignSlot | null>(null);
  const [content, setContent] = useState<MarketingContent | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaignSummary | null>(null);

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionSuccess, setActionSuccess] = useState<'approved' | 'rejected' | null>(null);

  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setError('Mã xác thực (token) không hợp lệ hoặc thiếu trong đường dẫn.');
      setLoading(false);
      return;
    }

    async function fetchDetail() {
      try {
        const data = await marketingCampaignService.getPublicSlot(token!);
        setSlot(data.slot);
        setContent(data.content);
        setCampaign(data.campaign);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin bài viết. Vui lòng kiểm tra lại liên kết của bạn.');
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [token]);

  const handleApprove = async () => {
    if (!token || isApproving || isRejecting) return;
    setIsApproving(true);
    try {
      await marketingCampaignService.publicSlotAction(token, 'approve');
      setActionSuccess('approved');
      if (slot) {
        setSlot({ ...slot, status: 'ready_to_publish' });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Duyệt bài viết thất bại.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || isApproving || isRejecting) return;
    if (!rejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối bài viết.');
      return;
    }
    setIsRejecting(true);
    try {
      await marketingCampaignService.publicSlotAction(token, 'reject', rejectReason.trim());
      setActionSuccess('rejected');
      if (slot) {
        setSlot({ ...slot, status: 'needs_attention' });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gửi phản hồi từ chối bài viết thất bại.');
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex flex-col items-center justify-center font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <p className="text-sm font-semibold tracking-wider text-slate-500 animate-pulse">
          ĐANG TẢI NỘI DUNG BÀI VIẾT...
        </p>
      </div>
    );
  }

  if (error && !actionSuccess) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-2xl p-6 text-center shadow-xl">
          <AlertCircle className="h-14 w-14 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Đã xảy ra lỗi</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">{error}</p>
          <div className="text-xs text-slate-400">
            Hãy liên hệ với người phụ trách chiến dịch marketing của bạn để được hỗ trợ.
          </div>
        </div>
      </div>
    );
  }

  if (actionSuccess) {
    return (
      <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xl">
          {actionSuccess === 'approved' ? (
            <>
              <div className="h-16 w-16 bg-green-50 border border-green-200 text-green-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm">
                <Check className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Đã duyệt bài viết thành công</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Nội dung đã được đưa vào lịch đăng bài chính thức và sẽ tự động đăng tải theo thời gian đã định. Cảm ơn phản hồi của bạn!
              </p>
            </>
          ) : (
            <>
              <div className="h-16 w-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm">
                <X className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Đã gửi từ chối bài viết</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Hệ thống đã nhận phản hồi từ chối của bạn. Yêu cầu cải thiện và lý do sẽ được chuyển đến người phụ trách kỹ thuật để biên tập lại nội dung bài viết.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isTikTok = slot?.platform === 'TikTok';
  const scheduledDate = slot ? new Date(slot.scheduledAt) : new Date();
  const displayTime = new Intl.DateTimeFormat('vi-VN', {
    timeZone: campaign?.timezone || 'Asia/Bangkok',
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(scheduledDate);

  const isPending = slot?.status === 'pending_approval';

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-800 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur-md px-6 py-4 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-9 w-9 rounded-xl border border-slate-200/60 object-cover shadow-md" />
          <div>
            <h1 className="text-sm font-black tracking-wide text-slate-900 uppercase">{BRAND_NAME}</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider">CỔNG PHÊ DUYỆT BÀI ĐĂNG NGOÀI HỆ THỐNG</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border border-slate-200 ${
            isPending ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
            slot?.status === 'ready_to_publish' ? 'bg-green-50 text-green-700 border-green-200' :
            slot?.status === 'needs_attention' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600'
          }`}>
            {isPending ? 'Chờ Phê Duyệt' :
             slot?.status === 'ready_to_publish' ? 'Đã Duyệt (Sẵn sàng đăng)' :
             slot?.status === 'needs_attention' ? 'Đã Từ Chối (Cần kiểm tra)' : slot?.status}
          </span>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col lg:flex-row gap-8 items-start justify-center">
        
        {/* Left Side: Campaign details & Action Buttons */}
        <div className="w-full lg:w-5/12 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <span className="text-[9px] font-black tracking-widest text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">Chiến dịch Marketing</span>
              <h2 className="text-lg font-extrabold text-slate-900 mt-1.5 leading-snug">{campaign?.title || 'Tên chiến dịch'}</h2>
              <p className="text-xs text-slate-600 mt-2 font-medium font-sans leading-relaxed">
                <b>Nội dung gốc:</b> {campaign?.sourceBrief}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Lịch đăng:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <Calendar size={12} className="text-slate-400" />
                  {displayTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Kênh đăng:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 capitalize">
                  {isTikTok ? (
                    <>
                      <TikTokIcon className="h-3.5 w-3.5 text-slate-800" />
                      TikTok
                    </>
                  ) : (
                    <>
                      <Facebook size={13} className="text-blue-550 fill-blue-500/10" />
                      Facebook
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Pillar:</span>
                <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                  {slot?.pillar}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-slate-500 font-medium shrink-0">Chủ đề:</span>
                <span className="font-medium text-slate-700 text-right leading-relaxed font-sans">{slot?.topicBrief}</span>
              </div>
            </div>

            {/* Approval Decisions */}
            {isPending ? (
              <div className="border-t border-slate-100 pt-5 space-y-4">
                {!showRejectForm ? (
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      disabled={isApproving || isRejecting}
                      onClick={handleApprove}
                      className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-green-650/15 cursor-pointer disabled:opacity-50"
                    >
                      {isApproving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Duyệt bài viết
                    </button>
                    <button
                      type="button"
                      disabled={isApproving || isRejecting}
                      onClick={() => setShowRejectForm(true)}
                      className="bg-rose-50 border border-rose-250 hover:bg-rose-100 text-rose-700 font-extrabold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <X size={14} />
                      Từ chối
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleReject} className="space-y-3.5 animate-fadeIn">
                    <div>
                      <label htmlFor="reason" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1 font-mono">
                        <MessageSquare size={10} />
                        Lý do từ chối bài viết
                      </label>
                      <textarea
                        id="reason"
                        required
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Hãy nêu rõ điểm cần chỉnh sửa (ví dụ: nội dung chưa chính xác, ảnh chưa phù hợp, thiếu thông tin,...)..."
                        className="w-full bg-slate-50 border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl px-3 py-2.5 text-xs text-slate-850 placeholder-slate-400 focus:outline-none min-h-[90px] font-sans resize-y leading-relaxed"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={isRejecting}
                        className="flex-1 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold py-2.5 rounded-lg text-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isRejecting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Xác nhận từ chối
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRejectForm(false);
                          setRejectReason('');
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="border-t border-slate-100 pt-4 text-center">
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Bài đăng này đã được phê duyệt hoặc từ chối từ trước. Cổng thông tin công khai không thể cập nhật thêm quyết định mới.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Visual Post Preview Mockups */}
        <div className="w-full lg:w-7/12 flex justify-center">
          {isTikTok ? (
            /* TikTok Mockup */
            <div className="w-[340px] aspect-[9/19] bg-black border-[6px] border-slate-900 rounded-[36px] shadow-2xl relative overflow-hidden flex flex-col select-none">
              {/* Media Video Container */}
              <div className="absolute inset-0 z-0 bg-slate-950 flex items-center justify-center">
                {content?.videoUrl || content?.mediaUrls?.[0] ? (
                  <video
                    src={content.videoUrl || content.mediaUrls[0]}
                    controls
                    autoPlay
                    loop
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-slate-600 p-6 flex flex-col items-center">
                    <Loader2 size={32} className="animate-spin mb-3 text-slate-700" />
                    <p className="text-xs font-bold uppercase tracking-wider font-mono">Đang render video mẫu...</p>
                  </div>
                )}
              </div>

              {/* TikTok Overlay Top */}
              <div className="absolute top-4 left-0 right-0 z-10 flex justify-center gap-6 text-sm font-bold text-white/60 drop-shadow-md">
                <span className="cursor-pointer hover:text-white transition">Đang follow</span>
                <span className="text-white border-b-2 border-white pb-1 cursor-pointer">Dành cho bạn</span>
              </div>

              {/* TikTok Right Actions Overlay */}
              <div className="absolute right-3.5 bottom-28 z-10 flex flex-col items-center gap-5 text-white drop-shadow-md">
                <div className="relative">
                  <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-10 w-10 rounded-full border-2 border-white object-cover select-none shadow-md" />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-rose-500 text-white rounded-full text-[9px] px-1 font-bold shadow-md">+</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl">❤️</span>
                  <span className="text-[10px] font-bold mt-0.5">0</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl">💬</span>
                  <span className="text-[10px] font-bold mt-0.5">0</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl">⚡</span>
                  <span className="text-[10px] font-bold mt-0.5">0</span>
                </div>
              </div>

              {/* TikTok Bottom Text Caption */}
              <div className="absolute left-4 right-16 bottom-6 z-10 text-white drop-shadow-md text-left font-sans">
                <h4 className="font-bold text-sm">@{campaign?.title?.replace(/\s+/g, '').toLowerCase() || 'igentech'}</h4>
                <p className="text-xs text-slate-200 mt-1 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {content?.bodyText}
                </p>
                <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-slate-350">
                  <span>🎵</span>
                  <span className="truncate font-mono">Âm thanh nguyên bản - iGen Studio AI</span>
                </div>
              </div>

              {/* Home Indicator */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-28 bg-white/40 rounded-full z-10" />
            </div>
          ) : (
            /* Facebook Mockup */
            <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden font-sans text-slate-800 select-none text-left">
              {/* FB Post Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-indigo-650 font-bold select-none shrink-0">
                    {campaign?.title?.slice(0, 2).toUpperCase() || 'FB'}
                  </div>
                  <div>
                    <span className="block text-xs font-black text-slate-800 hover:underline cursor-pointer">
                      {campaign?.title || 'Trang Facebook'}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold mt-0.5">
                      {displayTime} · 🌐
                    </span>
                  </div>
                </div>
              </div>

              {/* FB Post Text Body */}
              <div className="px-4 pb-3.5 text-xs text-slate-750 leading-relaxed whitespace-pre-wrap font-sans">
                {content?.title && (
                  <h4 className="font-bold text-slate-900 mb-1.5 text-sm">{content.title}</h4>
                )}
                {content?.bodyText || 'Chưa có nội dung bài viết...'}
              </div>

              {/* FB Post Media */}
              {(content?.imageUrl || content?.mediaUrls?.[0]) && (
                <div className="border-t border-b border-slate-100 bg-slate-950 aspect-video flex items-center justify-center relative overflow-hidden select-none">
                  {content?.mediaType === 'video' || content?.videoUrl ? (
                    <video src={content.videoUrl || content.mediaUrls[0]} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={content.imageUrl || content.mediaUrls[0]} alt="Facebook Post Preview" className="w-full h-full object-contain" />
                  )}
                </div>
              )}

              {/* FB Mock Statistics */}
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 text-[10px] text-slate-450 font-semibold select-none">
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center justify-center h-4.5 w-4.5 rounded-full bg-blue-600 text-white text-[8px] font-bold shadow-xs">👍</span>
                  <span>0 lượt thích</span>
                </div>
                <div className="flex gap-2">
                  <span>0 bình luận</span>
                  <span>0 lượt chia sẻ</span>
                </div>
              </div>

              {/* FB Action Buttons Mock */}
              <div className="px-1 py-1 grid grid-cols-3 gap-1 text-slate-500 font-bold text-[10px] select-none">
                <button type="button" className="py-2.5 hover:bg-slate-50 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer">
                  👍 Thích
                </button>
                <button type="button" className="py-2.5 hover:bg-slate-50 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer">
                  💬 Bình luận
                </button>
                <button type="button" className="py-2.5 hover:bg-slate-50 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer">
                  ➡️ Chia sẻ
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
