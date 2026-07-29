import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle, RotateCcw, Check, Upload, Image, Zap } from 'lucide-react';
import { CampaignSlot } from './CampaignDetailModal';
import { MarketingCampaignSummary, marketingCampaignService } from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

const DEFAULT_SLOT_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700 border-slate-200',
  queued: 'bg-blue-50 text-blue-755 border-blue-200',
  generating: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
  researching: 'bg-teal-50 text-teal-700 border-teal-200 animate-pulse',
  writing: 'bg-violet-50 text-violet-750 border-violet-200 animate-pulse',
  scoring: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
  awaiting_assets: 'bg-amber-50 text-amber-700 border-amber-200',
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
  awaiting_assets: 'Chờ ảnh thiết kế',
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

interface CampaignSlotDetailProps {
  campaign: MarketingCampaignSummary;
  activeSlot: CampaignSlot;
  onRefresh?: () => Promise<void>;
  onUpdateSlot?: (slotId: string, updatedFields: Partial<CampaignSlot>) => void;
  onRetrySlot?: (campaignId: string, slotId: string) => Promise<void>;
  slotStatusColors?: Record<string, string>;
  slotStatusLabel?: Record<string, string>;
  onCloseDetail: () => void;
}

export const CampaignSlotDetail: React.FC<CampaignSlotDetailProps> = ({
  campaign,
  activeSlot,
  onRefresh,
  onUpdateSlot,
  onRetrySlot,
  slotStatusColors = DEFAULT_SLOT_STATUS_COLORS,
  slotStatusLabel = DEFAULT_SLOT_STATUS_LABEL,
  onCloseDetail,
}) => {
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishingNow, setIsPublishingNow] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const [retryingSlotId, setRetryingSlotId] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [detailTab, setDetailTab] = useState<'preview' | 'edit'>('preview');
  const [aiLogTab, setAiLogTab] = useState<'research' | 'visual' | 'ops'>('research');

  const isEditable = ['pending_approval', 'needs_attention', 'failed'].includes(activeSlot.status);

  // Sync edits when active slot changes
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

  // Handle Slot Approval
  const handleApproveSlot = async () => {
    setIsApproving(true);
    if (onUpdateSlot) {
      onUpdateSlot(activeSlot._id, { status: 'ready_to_publish' });
    }
    try {
      await marketingCampaignService.approveSlot(campaign._id, activeSlot._id);
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

  // Handle Instant Publish (Đăng ngay)
  const handlePublishNowSlot = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn phát bài viết này lên Trang ngay lập tức không?')) return;
    setIsPublishingNow(true);
    if (onUpdateSlot) {
      onUpdateSlot(activeSlot._id, { status: 'publishing' });
    }
    try {
      await marketingCampaignService.publishNowSlot(campaign._id, activeSlot._id);
      toast.success('Đã kích hoạt xuất bản bài viết lên Trang ngay lập tức!');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể xuất bản bài viết ngay.');
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setIsPublishingNow(false);
    }
  };

  // Handle Slot Rejection
  const handleRejectSlot = async () => {
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
      await marketingCampaignService.rejectSlot(campaign._id, activeSlot._id, reason.trim());
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

  // Handle Content Save
  const handleSaveContent = async () => {
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
      await marketingCampaignService.updateSlotContent(campaign._id, activeSlot._id, {
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
    if (!file) return;

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
        await marketingCampaignService.replaceSlotImage(campaign._id, activeSlot._id, base64Data);
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

  // Parse evidence context safely if it is JSON
  const parsedEvidence = React.useMemo(() => {
    if (!activeSlot?.researchAnalysis?.context) return null;
    try {
      const parsed = JSON.parse(activeSlot.researchAnalysis.context);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // not JSON
    }
    return null;
  }, [activeSlot?.researchAnalysis?.context]);

  const scheduledDate = new Date(activeSlot.scheduledAt);
  const dateFormatted = new Intl.DateTimeFormat('vi-VN', {
    timeZone: campaign.timezone || 'Asia/Bangkok',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(scheduledDate);

  return (
    <div className="w-full lg:w-[450px] lg:shrink-0 border border-slate-200 rounded-2xl bg-slate-50/20 p-5 flex flex-col space-y-4 max-h-[75vh] overflow-y-auto transition-all duration-300">
      <div className="flex items-center justify-between border-b border-slate-150 pb-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Duyệt & Biên tập nội dung</h4>
          <p className="text-[10px] text-slate-400 font-semibold font-mono mt-0.5">
            Giờ đăng: {dateFormatted}
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseDetail}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Status & Actions Box */}
      <div className="flex flex-col gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-xs">
        <div className="flex items-center justify-between w-full">
          <div>
            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-0.5">Trạng thái slot</span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold select-none ${slotStatusColors[activeSlot.status] || 'bg-slate-100 text-slate-655'}`}>
              {slotStatusLabel[activeSlot.status] || activeSlot.status}
            </span>
          </div>

          {['pending_approval', 'ready_to_publish', 'needs_attention', 'failed'].includes(activeSlot.status) && (
            <div className="flex items-center gap-2">
              {['pending_approval', 'needs_attention', 'failed'].includes(activeSlot.status) && (
                <button
                  type="button"
                  disabled={isApproving || isPublishingNow || isRejecting || retryingSlotId === activeSlot._id}
                  onClick={handleApproveSlot}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shadow-2xs cursor-pointer disabled:opacity-55"
                >
                  {isApproving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Duyệt theo lịch
                </button>
              )}
              <button
                type="button"
                disabled={isApproving || isPublishingNow || isRejecting || retryingSlotId === activeSlot._id}
                onClick={handlePublishNowSlot}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shadow-2xs cursor-pointer disabled:opacity-55"
              >
                {isPublishingNow ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Đăng ngay
              </button>
              {activeSlot.status === 'pending_approval' && (
                <button
                  type="button"
                  disabled={isApproving || isPublishingNow || isRejecting}
                  onClick={handleRejectSlot}
                  className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-55"
                >
                  {isRejecting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  Từ chối
                </button>
              )}
              {['needs_attention', 'failed'].includes(activeSlot.status) && onRetrySlot && campaign.status === 'active' && (
                <button
                  type="button"
                  disabled={isApproving || isRejecting || retryingSlotId === activeSlot._id}
                  onClick={async () => {
                    setRetryingSlotId(activeSlot._id);
                    if (onUpdateSlot) {
                      onUpdateSlot(activeSlot._id, { status: 'planned', errorMessage: undefined });
                    }
                    try {
                      await onRetrySlot(campaign._id, activeSlot._id);
                      onCloseDetail();
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

        {activeSlot.status === 'pending_approval' && (() => {
          const localDateString = new Intl.DateTimeFormat('en-CA', {
            timeZone: campaign.timezone || 'Asia/Bangkok',
            year: 'numeric', month: '2-digit', day: '2-digit'
          }).format(scheduledDate);
          
          return (
            <div className="border-t border-slate-100 pt-2 flex flex-col gap-1 text-[10px] text-slate-500 font-sans leading-relaxed">
              <span className="flex items-center gap-1 font-semibold text-slate-600">
                💡 Cần gửi link duyệt nhanh?
              </span>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const response = await marketingCampaignService.getShareLink(campaign._id, activeSlot._id);
                      await navigator.clipboard.writeText(response.shareLink);
                      toast.success('Đã sao chép link duyệt bài đăng này!');
                    } catch {
                      toast.error('Lỗi khi lấy link chia sẻ.');
                    }
                  }}
                  className="text-indigo-650 hover:underline hover:text-indigo-850 font-bold transition text-left cursor-pointer"
                >
                  [Sao chép link slot này]
                </button>
                <div className="text-slate-300">|</div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const response = await marketingCampaignService.getDailyShareLink(campaign._id, localDateString);
                      await navigator.clipboard.writeText(response.shareLink);
                      toast.success(`Đã sao chép link duyệt ngày ${localDateString}!`);
                    } catch {
                      toast.error('Lỗi khi lấy link chia sẻ.');
                    }
                  }}
                  className="text-indigo-650 hover:underline hover:text-indigo-850 font-bold transition text-left cursor-pointer"
                >
                  [Sao chép link cả ngày {localDateString}]
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {activeSlot.status === 'needs_attention' && activeSlot.errorMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed font-sans shadow-2xs">
          <div className="flex items-center gap-1.5 font-bold mb-1 select-none">
            <span>⚠️ Yêu cầu sửa đổi / Từ chối bài đăng:</span>
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
          Xem trước {activeSlot.platform === 'TikTok' ? 'TikTok' : 'Facebook'}
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
              {activeSlot.platform === 'TikTok' ? (
                /* Realistic TikTok Post Preview */
                <div className="border border-slate-200 rounded-xl bg-slate-950 text-white shadow-xs overflow-hidden font-sans text-left relative aspect-[9/16] max-h-[500px] mx-auto flex flex-col justify-between">
                  {/* Media Content */}
                  <div className="absolute inset-0 z-0 bg-slate-900 flex items-center justify-center">
                    {activeSlot.content.mediaUrls && activeSlot.content.mediaUrls.length > 0 ? (
                      activeSlot.content.mediaType === 'video' ? (
                        <video src={activeSlot.content.mediaUrls[0]} controls className="w-full h-full object-contain" />
                      ) : (
                        <img src={activeSlot.content.mediaUrls[0]} alt="TikTok Media" className="w-full h-full object-contain" />
                      )
                    ) : (
                      <span className="text-xs text-slate-500 font-mono">Chưa có video/ảnh</span>
                    )}
                  </div>

                  {/* Header Overlay */}
                  <div className="relative z-10 p-3 bg-gradient-to-b from-black/55 to-transparent flex justify-between items-center text-xs">
                    <span className="font-bold">Following | For You</span>
                    <span>🔍</span>
                  </div>

                  {/* Right Side Icons */}
                  <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-4 text-xs select-none">
                    <div className="h-8 w-8 rounded-full bg-slate-700 border border-white flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {campaign.title?.slice(0, 2).toUpperCase() || 'TT'}
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl">❤️</span>
                      <span className="text-[10px]">0</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl">💬</span>
                      <span className="text-[10px]">0</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xl">⭐</span>
                      <span className="text-[10px]">0</span>
                    </div>
                  </div>

                  {/* Bottom Text Overlay */}
                  <div className="relative z-10 p-3.5 bg-gradient-to-t from-black/75 to-transparent text-xs space-y-1.5">
                    <h5 className="font-bold">@{campaign.title?.replace(/\s+/g, '').toLowerCase() || 'tiktok_channel'}</h5>
                    <p className="line-clamp-3 leading-relaxed text-slate-200 whitespace-pre-wrap">{editBody || 'Chưa có nội dung...'}</p>
                    {editTitle && <p className="text-[10px] text-indigo-400 font-bold"># {editTitle}</p>}
                  </div>
                </div>
              ) : (
                /* Realistic Facebook Post Preview */
                <div className="border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden font-sans text-left">
                  {/* Post Header */}
                  <div className="p-3.5 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-655 font-bold select-none shrink-0">
                      {campaign.title?.slice(0, 2).toUpperCase() || 'FB'}
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-800 hover:underline cursor-pointer">
                        {campaign.title || 'Trang Facebook'}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 select-none">
                        {dateFormatted}
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
              )}

              <div className="rounded-xl bg-indigo-50/50 border border-indigo-100/50 p-3.5 text-[11px] text-slate-600 leading-relaxed flex gap-2">
                <span>📢</span>
                <span>Đây là giao diện xem trước bài đăng thực tế của bạn trên mạng xã hội.</span>
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
                    <Image className="text-slate-350 mb-1.5" size={24} />
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
          <Image size={24} className="text-slate-355 mb-2 animate-pulse" />
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
              Chi phí: {((activeSlot.researchAnalysis?.cost || 0) + (activeSlot.visualAnalysis?.cost || 0)).toFixed(2)} Credit
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
              👁️ Ảnh
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
              ⚙️ Vận hành
            </button>
          </div>

          {/* AI Evidence Tabs Content */}
          <div className="max-h-[300px] overflow-y-auto space-y-3 font-sans">
            {aiLogTab === 'research' && (
              <div className="space-y-3.5">
                {parsedEvidence ? (
                  <div className="rounded-xl border border-teal-150 bg-white p-3.5 text-xs text-slate-700 leading-relaxed shadow-3xs space-y-3">
                    <div>
                      <span className="block text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-1.5 font-mono">Bối cảnh tổng hợp từ web:</span>
                      <p className="whitespace-pre-wrap font-sans text-slate-700 bg-teal-50/30 p-2.5 rounded-lg border border-teal-50">{parsedEvidence.summary || parsedEvidence.contextSummary}</p>
                    </div>
                    {(parsedEvidence.topKeywords || parsedEvidence.keywords) && (
                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">Từ khóa nổi bật / Xu hướng:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(parsedEvidence.topKeywords || parsedEvidence.keywords || []).map((kw: string, i: number) => (
                            <span key={i} className="bg-teal-50/50 text-teal-700 text-[10px] font-bold px-2 py-0.5 rounded border border-teal-100/50">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsedEvidence.angles && parsedEvidence.angles.length > 0 && (
                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">Góc tiếp cận đề xuất:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                          {parsedEvidence.angles.map((a: string, i: number) => <li key={i}>{a}</li>)}
                        </ul>
                      </div>
                    )}
                    {parsedEvidence.painPoints && parsedEvidence.painPoints.length > 0 && (
                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">Nỗi đau khách hàng:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                          {parsedEvidence.painPoints.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {parsedEvidence.facts && parsedEvidence.facts.length > 0 && (
                      <div>
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">Thông tin thực tế cần nhấn mạnh:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                          {parsedEvidence.facts.map((f: string, i: number) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs">Không có phân tích bối cảnh chi tiết.</div>
                )}

                {activeSlot.researchAnalysis?.evidence && activeSlot.researchAnalysis.evidence.length > 0 && (
                  <div className="space-y-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Tài liệu tham khảo thu thập ({activeSlot.researchAnalysis.evidence.length}):</span>
                    {activeSlot.researchAnalysis.evidence.map((ev, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-150 bg-white p-3 space-y-1.5 shadow-3xs text-xs">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                          <span className="font-bold text-slate-800 truncate flex items-center gap-1 max-w-[200px]" title={ev.title || ev.sourceUrl}>
                            {ev.source === 'facebook' ? '🔵' : ev.source === 'tiktok' ? '⚫' : '🔴'} {ev.title || 'Bài viết tham khảo'}
                          </span>
                          <a href={ev.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-650 hover:underline shrink-0 font-bold">
                            Chi tiết &rarr;
                          </a>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed italic line-clamp-3">&ldquo;{ev.text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aiLogTab === 'visual' && (
              <div className="space-y-3">
                {activeSlot.visualAnalysis ? (
                  <div className="rounded-xl border border-violet-150 bg-white p-4 shadow-3xs text-xs space-y-3.5">
                    {activeSlot.visualAnalysis.summary && (
                      <div>
                        <strong className="block text-[10px] font-bold text-violet-650 uppercase tracking-wide mb-1 font-mono">Ý tưởng mô tả:</strong>
                        <p className="text-slate-700 leading-relaxed font-sans">{activeSlot.visualAnalysis.summary}</p>
                      </div>
                    )}
                    
                    {activeSlot.visualAnalysis.visualStyle && (
                      <div className="grid grid-cols-2 gap-3.5 border-t border-slate-100 pt-3">
                        <div>
                          <strong className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Phong cách:</strong>
                          <span className="text-slate-850 font-semibold text-[11px] mt-0.5 block">{activeSlot.visualAnalysis.visualStyle}</span>
                        </div>
                        <div>
                          <strong className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Tông màu / Mood:</strong>
                          <span className="text-slate-850 font-semibold text-[11px] mt-0.5 block">{activeSlot.visualAnalysis.mood}</span>
                        </div>
                      </div>
                    )}

                    {activeSlot.visualAnalysis.cautions && activeSlot.visualAnalysis.cautions.length > 0 && (
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-[11px]">
                        <strong className="block text-[10px] font-extrabold text-amber-700 uppercase tracking-wide mb-1.5">⚠️ Lưu ý & Cần tránh:</strong>
                        <ul className="list-disc pl-4 space-y-1 text-amber-900 font-medium">
                          {activeSlot.visualAnalysis.cautions.map((caution, idx) => (
                            <li key={idx}>{caution}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs">Không có dữ liệu phân tích hình ảnh cho slot này.</div>
                )}
              </div>
            )}

            {aiLogTab === 'ops' && (
              <div className="space-y-4 text-xs">
                <div>
                  <p className="text-[11px] text-slate-650 font-semibold mb-2">Ảnh / Video gốc đã Ingest lên CDN Cloudinary:</p>
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
                            Mở CDN
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};
