import React, { useState, useEffect } from "react";
import { 
  Clock, 
  Trash2, 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Facebook, 
  ExternalLink, 
  RefreshCw,
  X,
  Loader2,
  ZoomIn
} from "lucide-react";
import { ContentApprovalCard } from "../../types";
import { formatCardDate, isRenderableVideoUrl, formatPublishError } from "./CardWidgets";
import { buildFacebookPostUrl, marketingService } from "../../services/marketingService";
import { toast } from "../../pages/Toast";

interface CardDetailDrawerProps {
  card: ContentApprovalCard | null;
  isOpen: boolean;
  onClose: () => void;
  isUserRole: boolean;
  onNextStatus: ((id: string, newStatus: any) => Promise<void>) | null;
  onPrevStatus: ((id: string, newStatus: any) => Promise<void>) | null;
  onDelete: (id: string) => Promise<void>;
  onPreviewMedia: (type: 'image' | 'video', url: string) => void;
  onGenerateMedia: (card: ContentApprovalCard, type?: 'image' | 'video' | 'voice') => void;
  fbIntegration?: any;
  tiktokIntegration?: any;
  onPublishToTikTok?: (card: ContentApprovalCard) => Promise<void>;
  isPublishingTikTok?: boolean;
  setSchedulingCard: (card: ContentApprovalCard | null) => void;
  setScheduleDate: (date: string) => void;
  setScheduleTime: (time: string) => void;
  onUpdateCard: (id: string, updatedFields: Partial<ContentApprovalCard>) => void;
  onPublishToPlatform?: (card: ContentApprovalCard) => Promise<void>;
  isPublishing?: boolean;
}

export default function CardDetailDrawer({
  card,
  isOpen,
  onClose,
  isUserRole,
  onNextStatus,
  onPrevStatus,
  onDelete,
  onPreviewMedia,
  onGenerateMedia,
  fbIntegration,
  tiktokIntegration,
  onPublishToTikTok,
  isPublishingTikTok = false,
  setSchedulingCard,
  setScheduleDate,
  setScheduleTime,
  onUpdateCard,
  onPublishToPlatform,
  isPublishing = false,
}: CardDetailDrawerProps) {
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBodyText, setEditedBodyText] = useState("");
  const [editedOutline, setEditedOutline] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(true);

  useEffect(() => {
    if (card) {
      setEditedTitle(card.title || "");
      setEditedBodyText(card.bodyText || "");
      setEditedOutline(card.outline || "");
    }
  }, [card?.id]);

  useEffect(() => {
    if (isOpen && card) {
      setShouldAnimate(true);
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [card?.id, isOpen]);

  if (!isOpen || !card) return null;

  const hasChanges = (
    editedTitle !== (card.title || "") ||
    editedBodyText !== (card.bodyText || "") ||
    editedOutline !== (card.outline || "")
  );
  const canRenderVideo = isRenderableVideoUrl(card.videoUrl);

  const handleCancelEdit = () => {
    setEditedTitle(card.title || "");
    setEditedBodyText(card.bodyText || "");
    setEditedOutline(card.outline || "");
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const updatedFields = {
        title: editedTitle,
        bodyText: editedBodyText,
        outline: editedOutline,
      };
      
      await marketingService.updateCard(card.id, updatedFields);
      onUpdateCard(card.id, updatedFields);
      toast.success("Đã cập nhật thay đổi thành công!");
    } catch (err) {
      console.error(err);
      toast.error("Không thể lưu thay đổi. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNextStatusAction = () => {
    if (card.status === "draft" && onNextStatus) {
      onNextStatus(card.id, "pending");
    } else if (card.status === "pending" && onNextStatus && !isUserRole) {
      onNextStatus(card.id, "approved");
    } else if (card.status === "approved") {
      setSchedulingCard(card);
      setScheduleDate(new Date().toISOString().split('T')[0]);
      setScheduleTime("09:00");
    }
  };

  const handlePrevStatusAction = () => {
    if (card.status === "pending" && onPrevStatus) {
      onPrevStatus(card.id, "draft");
    } else if (card.status === "approved" && onPrevStatus && !isUserRole) {
      onPrevStatus(card.id, "pending");
    } else if ((card.status === "scheduled" || card.status === "failed") && onPrevStatus) {
      onPrevStatus(card.id, "approved");
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-6" id="card_detail_drawer_container">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div className={`relative w-full max-w-2xl bg-white rounded-3xl max-h-[90vh] shadow-2xl flex flex-col z-10 border border-gray-100 overflow-hidden ${
        shouldAnimate ? "animate-scale-in" : ""
      }`}>
        
        {/* Header */}
        <div className="p-5 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-150 rounded text-xs font-mono font-bold text-indigo-700 tracking-wider">
              {card.channel}
            </span>
            {card.mediaType && (
              <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold tracking-wide ${
                card.mediaType === 'human-video' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                card.mediaType === 'video' ? 'bg-sky-50 text-sky-700 border border-sky-100' :
                card.mediaType === 'image' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                'bg-slate-50 text-slate-600 border border-slate-100'
              }`}>
                {card.mediaType === 'human-video' ? 'Video người thật' : card.mediaType === 'video' ? 'Video AI' : card.mediaType === 'image' ? 'Ảnh AI' : 'Media AI'}
              </span>
            )}
            <span className="text-xs text-gray-400 font-mono tracking-wide">{card.contentType}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          
          {/* Media Section */}
          <div>
            <label className="block text-[10px] font-bold text-gray-450 font-mono uppercase mb-2">Phương tiện (Media)</label>
            {card.status === 'processing' && (
              <div className="relative overflow-hidden rounded-xl aspect-video w-full border border-purple-200 bg-purple-50/30 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-7 w-7 text-purple-600 animate-spin" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-purple-800 tracking-wide animate-pulse">Đang tạo phương tiện bằng AI...</span>
                  <span className="text-[10px] text-purple-400">Vui lòng đợi vài phút để hệ thống hoàn tất.</span>
                </div>
              </div>
            )}
            {card.imageUrl && (
              <div 
                onClick={() => onPreviewMedia('image', card.imageUrl!)}
                className="relative cursor-pointer overflow-hidden rounded-xl w-full border border-gray-150 shadow-xs hover:scale-[1.01] transition-all bg-slate-950 flex items-center justify-center min-h-[220px] group"
                title="Bấm để xem ảnh phóng to"
              >
                <img src={card.imageUrl} alt="AI Illustration" className="max-w-full max-h-[400px] object-contain transition-transform duration-300 group-hover:scale-[1.01]" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white gap-1.5 font-sans text-xs font-bold select-none">
                  <ZoomIn className="h-6 w-6 text-white animate-pulse" />
                  <span>Bấm để phóng to</span>
                </div>
              </div>
            )}

            {canRenderVideo && (
              <div 
                onClick={() => onPreviewMedia('video', card.videoUrl!)}
                className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-gray-150 shadow-xs hover:scale-[1.01] transition-transform bg-slate-900 flex items-center justify-center"
              >
                <video src={card.videoUrl} className="w-full h-full object-cover opacity-85" muted />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center text-slate-800 shadow-md">
                    <span className="ml-0.5 text-sm">▶</span>
                  </div>
                </div>
              </div>
            )}

            {!card.imageUrl && !card.videoUrl && card.status !== 'published' && card.status !== 'processing' && (
              <button
                onClick={() => onGenerateMedia(
                  card,
                  card.mediaType === 'human-video'
                    ? (card.engineType === 'avatar_iii' || card.usePersonalVoice ? 'video' : 'voice')
                    : card.mediaType === 'video' ? 'video' : 'image'
                )}
                className="w-full flex items-center justify-center gap-2 py-4 px-3 bg-purple-50 hover:bg-purple-100 text-purple-750 border border-purple-200 border-dashed rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.99]"
              >
                <Sparkles className="h-4 w-4 text-purple-500 animate-pulse" />
                <span>
                  {card.mediaType === "human-video"
                    ? (card.engineType === "avatar_iii" || card.usePersonalVoice ? "Tạo Video người thật mới (Direct Text)" : "Tạo Voice → Video người thật mới")
                    : card.mediaType === "video" ? "Tạo Video AI mới" :
                    card.mediaType === "image" ? "Tạo Ảnh AI mới" : "Tạo Ảnh / Video AI mới"}
                </span>
              </button>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-slate-450 font-mono uppercase tracking-wide">Tiêu đề chiến dịch</label>
            <input
              type="text"
              disabled={card.status === 'published'}
              className="w-full font-bold text-gray-800 text-sm leading-snug border border-slate-200/80 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none rounded-xl p-3 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed transition-all duration-200 shadow-3xs"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              placeholder="Nhập tiêu đề bài đăng..."
            />
          </div>

          {/* Body Text */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-slate-450 font-mono uppercase tracking-wide">Nội dung bài đăng (Body Text)</label>
            <textarea
              disabled={card.status === 'published'}
              className="w-full text-xs text-slate-650 leading-relaxed font-sans bg-white p-4 rounded-2xl border border-slate-200/80 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none select-text whitespace-pre-wrap min-h-[160px] resize-y disabled:bg-slate-50 disabled:cursor-not-allowed transition-all duration-200 shadow-3xs"
              value={editedBodyText}
              onChange={(e) => setEditedBodyText(e.target.value)}
              placeholder="Nhập nội dung chi tiết bài viết..."
            />
          </div>

          {/* Timing details */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <span className="block text-[10px] font-bold text-gray-405 font-mono uppercase">Ngày khởi tạo</span>
              <span className="text-[11px] text-gray-600 font-mono mt-1 block">{formatCardDate(card.generatedAt)}</span>
            </div>
            
            {card.scheduledDate && (
              <div>
                <span className="block text-[10px] font-bold text-gray-405 font-mono uppercase">Lên lịch đăng bài</span>
                <span className="text-[11px] text-emerald-700 font-mono font-medium mt-1 flex items-center gap-1 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded w-fit">
                  <Clock className="h-3 w-3" />
                  {card.scheduledDate} {card.scheduledTime && `lúc ${card.scheduledTime}`}
                </span>
              </div>
            )}

            {card.publishedAt && (
              <div>
                <span className="block text-[10px] font-bold text-gray-405 font-mono uppercase">Đã đăng tải vào</span>
                <span className="text-[11px] text-green-700 font-mono font-medium mt-1 flex items-center gap-1 bg-green-50 border border-green-150 px-2 py-0.5 rounded w-fit">
                  <CheckCircle2 className="h-3 w-3" />
                  {new Date(card.publishedAt).toLocaleString('vi-VN')}
                </span>
              </div>
            )}
          </div>

          {/* Status logs */}
          <div className="pt-2">
            <span className="block text-[10px] font-bold text-gray-405 font-mono uppercase mb-1.5">Trạng thái hiện tại</span>
            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              card.status === 'published' ? 'bg-green-100 text-green-800 border border-green-200' :
              card.status === 'scheduled' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
              card.status === 'approved' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
              card.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
              card.status === 'failed' ? 'bg-red-100 text-red-800 border border-red-200 animate-pulse' :
              'bg-gray-100 text-gray-800 border border-gray-250'
            }`}>
              {card.status === 'published' ? 'Đã đăng tải' :
               card.status === 'scheduled' ? 'Đã lên lịch' :
               card.status === 'approved' ? 'Đã phê duyệt' :
               card.status === 'pending' ? 'Chờ duyệt' :
               card.status === 'failed' ? 'Đăng thất bại' : 'Bản nháp'}
            </span>
          </div>

          {/* Error info */}
          {card.status === "failed" && card.publishError && (
            <div className="flex flex-col gap-1 text-[10px] text-red-750 font-mono bg-red-50 border border-red-200 p-3.5 rounded-xl">
              <span className="font-extrabold flex items-center gap-1">⚠️ LỖI TỰ ĐỘNG ĐĂNG:</span>
              <span className="leading-relaxed font-sans font-medium text-red-650">{formatPublishError(card.publishError)}</span>
            </div>
          )}

          {/* Platform specific links */}
          {card.postUrl || card.facebookPostId ? (
            card.postUrl ? (
              <a
                href={card.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Xem bài viết thật trên Facebook"
                className="text-[10px] text-blue-600 font-mono bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl flex items-center justify-between gap-1 hover:bg-blue-100 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Facebook className="h-3.5 w-3.5" />
                  <span>Xem bài viết Facebook</span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : (
              <div
                className="text-[10px] text-blue-600 font-mono bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl flex items-center justify-between gap-1 cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => {
                  if (card.facebookPostId?.includes('mock')) {
                    alert(`[Demo] Bài đăng Facebook ID: ${card.facebookPostId}`);
                  } else {
                    const targetUrl = buildFacebookPostUrl(card.facebookPostId);
                    if (targetUrl) {
                      window.open(targetUrl, '_blank');
                    }
                  }
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Facebook className="h-3.5 w-3.5" />
                  Post ID: {card.facebookPostId}
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </div>
            )
          ) : null}

          {/* TikTok Publish Button */}
          {card.channel === 'TikTok' && tiktokIntegration?.isConnected && onPublishToTikTok && card.status === 'scheduled' && (
            <button
              onClick={() => onPublishToTikTok(card)}
              disabled={isPublishingTikTok || !card.videoUrl}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                !card.videoUrl
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  : isPublishingTikTok
                  ? 'bg-slate-800 text-white border-slate-700 opacity-75 cursor-wait'
                  : 'bg-black hover:bg-slate-800 text-white border-black shadow-md hover:shadow-lg active:scale-[0.98]'
              }`}
            >
              {isPublishingTikTok ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /><span>Đang đăng lên TikTok...</span></>
              ) : (
                <><span className="text-sm font-sans">♪</span><span>Đăng ngay lên TikTok {tiktokIntegration.isMock ? '(Demo)' : ''}</span></>
              )}
            </button>
          )}

        </div>

        {/* Action Bar (Footer) */}
        <div className="p-4 border-t border-gray-150 bg-gray-50/50 shrink-0 flex items-center justify-between gap-3">
          {hasChanges ? (
            <>
              <button 
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-250 bg-white text-gray-650 hover:bg-gray-100 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Hủy thay đổi
              </button>
              <div className="flex-1" />
              <button 
                onClick={handleSaveChanges}
                disabled={isSaving || !editedTitle.trim() || !editedBodyText.trim()}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <span>Lưu thay đổi</span>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Back/Reject status button */}
              {card.status !== 'draft' && card.status !== 'published' && (
                <button 
                  onClick={handlePrevStatusAction}
                  disabled={isUserRole && card.status === 'approved'}
                  className={`flex items-center gap-1.5 px-3.5 py-2 border border-gray-250 bg-white text-gray-650 hover:bg-gray-100 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isUserRole && card.status === 'approved' ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
                  }`}
                  title="Quay lại trạng thái trước"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Quay lại</span>
                </button>
              )}

              <div className="flex-1" />

              {/* Delete button */}
              <button 
                onClick={() => onDelete(card.id)}
                className="p-2 text-red-500 hover:bg-red-50 border border-transparent hover:border-red-150 rounded-xl transition-all cursor-pointer"
                title="Xóa bài đăng"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              {/* Đăng ngay button */}
              {(card.status === 'approved' || card.status === 'scheduled' || card.status === 'failed') && onPublishToPlatform && (
                <button 
                  onClick={() => onPublishToPlatform(card)}
                  disabled={isPublishing || isPublishingTikTok || (card.channel === 'TikTok' && !card.videoUrl)}
                  className={`flex items-center gap-1.5 px-4.5 py-2.5 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
                    card.channel === 'TikTok' && !card.videoUrl
                      ? 'bg-gray-300 text-gray-400 cursor-not-allowed shadow-none'
                      : 'bg-green-600 hover:bg-green-700 shadow-green-150 active:scale-95'
                  }`}
                  title={card.channel === 'TikTok' && !card.videoUrl ? "Bài đăng TikTok cần có video" : "Đăng lên nền tảng ngay lập tức"}
                >
                  {(isPublishing || isPublishingTikTok) ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Đang đăng...</span>
                    </>
                  ) : (
                    <span>Đăng ngay</span>
                  )}
                </button>
              )}

              {/* Next status/approve/schedule button */}
              {card.status !== 'published' && card.status !== 'scheduled' && card.status !== 'failed' && (
                <button 
                  onClick={handleNextStatusAction}
                  disabled={isUserRole && card.status === 'pending'}
                  className={`flex items-center gap-1.5 px-4.5 py-2.5 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
                    isUserRole && card.status === 'pending'
                      ? 'bg-gray-300 text-gray-400 cursor-not-allowed shadow-none'
                      : 'bg-indigo-650 hover:bg-indigo-700 cursor-pointer shadow-indigo-150 active:scale-95'
                  }`}
                >
                  <span>
                    {card.status === "draft" ? "Gửi duyệt" : card.status === "pending" ? "Phê duyệt" : "Lên lịch đăng"}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
