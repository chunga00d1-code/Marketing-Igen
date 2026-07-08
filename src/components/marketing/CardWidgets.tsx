import React from "react";
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
  Loader2,
  ZoomIn
} from "lucide-react";
import { ContentApprovalCard } from "../../types";
import { buildFacebookPostUrl } from "../../services/marketingService";

export const formatCardDate = (dateStr: any): string => {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return String(dateStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch (e) {
    return String(dateStr);
  }
};

export const isRenderableVideoUrl = (url?: string | null): boolean => {
  const value = String(url || "").trim();
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:") ||
    value.startsWith("data:video/")
  );
};

export const formatPublishError = (error: string | null | undefined): string => {
  if (!error) return "";
  const errStr = String(error);

  if (
    errStr.includes("Tried accessing nonexisting field (is_published)") ||
    errStr.includes("is_published")
  ) {
    return "Lỗi kết nối Facebook (Mã 100): Không thể truy cập trạng thái lên lịch của bài đăng (is_published). Điều này thường xảy ra khi bài viết đã được đăng tải thành công trực tiếp lên Fanpage từ trước, hoặc token quản trị Trang (Page Access Token) bị thiếu quyền truy cập. Vui lòng kiểm tra lại trực tiếp Fanpage Facebook của bạn.";
  }

  if (errStr.includes("OAuthException") && (errStr.includes("token") || errStr.includes("session") || errStr.includes("auth"))) {
    return "Lỗi xác thực Facebook: Mã Access Token quản trị trang đã hết hạn hoặc không hợp lệ. Vui lòng vào Cài đặt để ngắt kết nối và liên kết lại Fanpage.";
  }

  if (errStr.includes("Tài khoản chưa liên kết Facebook Page") || errStr.includes("chưa liên kết Facebook")) {
    return "Lỗi cấu hình: Bạn chưa thực hiện liên kết Facebook Fanpage cho tài khoản này. Vui lòng vào Cài đặt để liên kết trước khi đăng.";
  }

  if (errStr.includes("Không tìm thấy liên kết Facebook chỉ định") || errStr.includes("không tìm thấy liên kết Facebook")) {
    return "Lỗi cấu hình: Không tìm thấy tài khoản Facebook Page liên kết hoặc kết nối đã bị ngắt. Vui lòng kiểm tra lại cấu hình.";
  }

  return errStr;
};

interface ModerationPipCardProps {
  key?: string | number | null;
  card: ContentApprovalCard;
  onNextStatus: ((...args: any[]) => any) | null;
  onPrevStatus: ((...args: any[]) => any) | null;
  onDelete?: ((...args: any[]) => any) | null;
  onPreviewMedia: (type: 'image' | 'video', url: string) => void;
  onGenerateMedia: (card: ContentApprovalCard, type?: 'image' | 'video' | 'voice') => void;
  onOpenDetail?: () => void;
  onPublishToPlatform?: (card: ContentApprovalCard) => Promise<void>;
  isPublishing?: boolean;
  isPublishingTikTok?: boolean;
}

export function ModerationPipCard({ 
  card, 
  onNextStatus, 
  onPrevStatus, 
  onDelete,
  onPreviewMedia,
  onGenerateMedia,
  onOpenDetail,
  onPublishToPlatform,
  isPublishing = false,
  isPublishingTikTok = false,
}: ModerationPipCardProps) {
  const isProcessing = card.status === 'processing';
  const isFailed = card.status === 'failed';
  const canRenderVideo = isRenderableVideoUrl(card.videoUrl);

  const channelBadgeStyles: Record<string, string> = {
    Facebook: "bg-blue-50 border-blue-250/30 text-blue-700",
    TikTok: "bg-slate-900 border-slate-950 text-white",
    Zalo: "bg-sky-50 border-sky-250/30 text-sky-700"
  };
  const channelStyle = channelBadgeStyles[card.channel] || "bg-slate-50 border-slate-200 text-slate-700";

  return (
    <div
      className={`border text-left p-4 rounded-2xl flex flex-col gap-3 relative group transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${
        card.isNew
          ? "bg-gradient-to-br from-cyan-50/60 via-white to-white border-cyan-300 shadow-[0_0_16px_rgba(6,182,212,0.25)] animate-[pulse-glow_2s_ease-in-out_3]"
          : "bg-white border-slate-200/70 shadow-3xs"
      }`}
      id={`approval_card_${card.id}`}
      style={card.isNew ? { animation: "pulseGlow 2s ease-in-out 3" } as React.CSSProperties : undefined}
    >
      
      {isProcessing && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-[1.5px] flex flex-col items-center justify-center gap-2 rounded-2xl z-20 select-none">
          <Loader2 className="h-5 w-5 text-indigo-650 animate-spin" />
          <span className="text-[9px] font-bold text-indigo-850 tracking-wide animate-pulse">Đang sinh phương tiện...</span>
        </div>
      )}

      {/* Category header */}
      <div className="flex justify-between items-center gap-2 cursor-pointer relative" onClick={onOpenDetail}>
        {card.isNew && (
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping opacity-75" />
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`px-2.5 py-0.5 border rounded-md text-[9px] font-mono font-bold tracking-wider shrink-0 uppercase ${channelStyle}`}>
            {card.channel}
          </span>
          {card.mediaType && (
            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold tracking-wide shrink-0 border ${
              card.mediaType === 'human-video' ? 'bg-amber-50 text-amber-700 border-amber-100' :
              card.mediaType === 'video' ? 'bg-sky-50 text-sky-700 border-sky-100' :
              card.mediaType === 'image' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
              'bg-slate-50 text-slate-600 border-slate-100'
            }`}>
              {card.mediaType === 'human-video' ? 'Video người thật' : card.mediaType === 'video' ? 'Video AI' : card.mediaType === 'image' ? 'Ảnh AI' : 'Media AI'}
            </span>
          )}
          {card.isNew && (
            <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-sm text-[9px] font-bold tracking-wider shrink-0 animate-pulse">
              🆕 MỚI
            </span>
          )}
          {isFailed && (
            <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-[8px] font-bold shrink-0">
              LỖI SINH
            </span>
          )}
        </div>
        <span className="text-[9px] text-slate-400 font-mono tracking-wide truncate" title={card.contentType}>{card.contentType}</span>
      </div>

      {/* Media Thumbnails */}
      {card.imageUrl && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onPreviewMedia('image', card.imageUrl!);
          }}
          className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-slate-100 shadow-2xs hover:scale-[1.015] transition-all bg-slate-950 flex items-center justify-center group"
          title="Bấm để phóng to"
        >
          <img src={card.imageUrl} alt="AI Illustration" className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white gap-1 font-sans text-[10px] font-bold select-none">
            <ZoomIn className="h-4 w-4 text-white animate-pulse" />
            <span>Bấm để phóng to</span>
          </div>
        </div>
      )}

      {canRenderVideo && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onPreviewMedia('video', card.videoUrl!);
          }}
          className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-slate-100 shadow-2xs hover:scale-[1.015] transition-all bg-slate-900 flex items-center justify-center"
        >
          <video src={card.videoUrl} className="w-full h-full object-cover opacity-80" muted />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
            <div className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center text-slate-800 shadow-md">
              <span className="ml-0.5 text-xs">▶</span>
            </div>
          </div>
        </div>
      )}

      {/* Generate Media Button if none exists */}
      {!card.imageUrl && !card.videoUrl && card.status !== 'published' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateMedia(
              card,
              card.mediaType === 'human-video'
                ? (card.engineType === 'avatar_iii' || card.usePersonalVoice ? 'video' : 'voice')
                : card.mediaType === 'video' ? 'video' : card.mediaType === 'image' ? 'image' : undefined
            );
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-800 border border-purple-200/50 rounded-xl text-[10px] font-bold transition-all shadow-3xs cursor-pointer active:scale-[0.98]"
        >
          <Sparkles className="h-3 w-3 text-purple-500 animate-pulse" />
          <span>
            {card.mediaType === "human-video" ? (card.engineType === "avatar_iii" || card.usePersonalVoice ? "Tạo Video người thật" : "Tạo Voice → Video") :
             card.mediaType === "video" ? "Tạo Video AI" :
             card.mediaType === "image" ? "Tạo Ảnh AI" : "Tạo Ảnh / Video AI"}
          </span>
        </button>
      )}

      {/* Title & Body Text (Clickable to open details drawer) */}
      <div 
        className="cursor-pointer space-y-1 hover:bg-slate-50/40 p-1.5 rounded-lg transition-colors"
        onClick={onOpenDetail}
        title="Bấm để xem chi tiết bài đăng"
      >
        <h5 className="font-bold text-gray-800 leading-tight text-xs font-sans line-clamp-2 hover:text-indigo-650 transition-colors">
          {card.title}
        </h5>
        <p className="text-[11px] text-slate-550 leading-relaxed font-sans line-clamp-2 whitespace-pre-wrap">
          {card.bodyText}
        </p>
      </div>

      {/* Detail list status */}
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-2.5 mt-auto">
        <div className="flex items-center justify-between text-gray-400 font-mono text-[8px] select-none">
          <span>Thời gian tạo:</span>
          <span>{formatCardDate(card.generatedAt)}</span>
        </div>
        
        {/* Approve/Reject Controls action buttons */}
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {onPrevStatus && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onPrevStatus();
              }}
              title={card.status === "pending" ? "Mục cũ: Nháp" : card.status === "approved" ? "Mục cũ: Chờ duyệt" : "Mục cũ: Đã duyệt"}
              className="p-1.5 text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-800 border border-slate-200/60 rounded-lg font-bold transition-all flex items-center justify-center cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}

          {onDelete && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Xóa bài đăng"
              className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-750 border border-red-100/50 rounded-lg font-bold transition-all flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}

          {card.status === "approved" && onPublishToPlatform && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onPublishToPlatform(card);
              }}
              disabled={isPublishing || isPublishingTikTok || (card.channel === 'TikTok' && !card.videoUrl)}
              className={`p-1.5 px-3 text-white rounded-lg font-bold transition-all flex items-center gap-1 text-[10px] cursor-pointer shadow-3xs ${
                (card.channel === 'TikTok' && !card.videoUrl)
                  ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
              title={card.channel === 'TikTok' && !card.videoUrl ? "Bài đăng TikTok cần có video" : "Đăng lên nền tảng ngay lập tức"}
            >
              {(isPublishing || isPublishingTikTok) ? (
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <span>Đăng ngay</span>
              )}
            </button>
          )}

          {onNextStatus && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onNextStatus();
              }}
              className="p-1.5 px-3.5 text-white bg-indigo-650 hover:bg-indigo-700 rounded-lg font-bold transition-all flex items-center gap-1.5 text-[10px] cursor-pointer shadow-3xs shadow-indigo-150"
            >
              <span>{card.status === "draft" ? "Sẵn sàng" : card.status === "pending" ? "Duyệt ✓" : "Lên lịch 📅"}</span>
              <ArrowRight className="h-2.5 w-2.5" />
            </button>
          )}

          {card.status === "scheduled" && (
            <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-255 text-emerald-800 rounded-md text-[9px] font-bold font-mono">
              ✓ ĐỒNG BỘ
            </span>
          )}
        </div>
      </div>

    </div>
  );
}

interface ScheduledCardProps {
  key?: string | number | null;
  card: ContentApprovalCard;
  isUserRole: boolean;
  onPrevStatus: (...args: any[]) => any;
  onDelete: (...args: any[]) => any;
  fbIntegration?: { isConnected: boolean; pageId: string; pageName: string; pageAccessToken: string; isMock?: boolean } | null;
  tiktokIntegration?: { isConnected: boolean; username: string; displayName: string; isMock?: boolean; privacyLevel?: string } | null;
  onPreviewMedia: (type: 'image' | 'video', url: string) => void;
  onGenerateMedia: (card: ContentApprovalCard, type?: 'image' | 'video' | 'voice') => void;
  onPublishToTikTok?: (...args: any[]) => any;
  isPublishingTikTok?: boolean;
  onPublishToFacebook?: (...args: any[]) => any;
  isPublishingFacebook?: boolean;
  onOpenDetail?: () => void;
}

export function ScheduledCard({ 
  card, 
  isUserRole, 
  onPrevStatus, 
  onDelete, 
  fbIntegration,
  tiktokIntegration,
  onPreviewMedia,
  onGenerateMedia,
  onPublishToTikTok,
  isPublishingTikTok = false,
  onPublishToFacebook,
  isPublishingFacebook = false,
  onOpenDetail
}: ScheduledCardProps) {
  const canRenderVideo = isRenderableVideoUrl(card.videoUrl);

  const channelBadgeStyles: Record<string, string> = {
    Facebook: "bg-blue-50 border-blue-250/30 text-blue-700",
    TikTok: "bg-slate-900 border-slate-950 text-white",
    Zalo: "bg-sky-50 border-sky-250/30 text-sky-700"
  };
  const channelStyle = channelBadgeStyles[card.channel] || "bg-slate-50 border-slate-200 text-slate-700";

  return (
    <div className="bg-white border text-left border-slate-200/70 p-4 rounded-2xl shadow-3xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-3 relative group" id={`scheduled_card_${card.id}`}>
      
      <div className="flex justify-between items-center gap-2 cursor-pointer" onClick={onOpenDetail}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-150 rounded-sm text-[9px] font-mono font-bold text-indigo-700 tracking-wider shrink-0">
            {card.channel}
          </span>
          {card.mediaType && (
            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold tracking-wide shrink-0 border ${
              card.mediaType === 'human-video' ? 'bg-amber-50 text-amber-700 border-amber-100' :
              card.mediaType === 'video' ? 'bg-sky-50 text-sky-700 border-sky-100' :
              card.mediaType === 'image' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
              'bg-slate-50 text-slate-600 border-slate-100'
            }`}>
              {card.mediaType === 'human-video' ? 'Video người thật' : card.mediaType === 'video' ? 'Video AI' : card.mediaType === 'image' ? 'Ảnh AI' : 'Media AI'}
            </span>
          )}
        </div>
        <span className="text-[9px] text-gray-400 font-mono tracking-wide truncate" title={card.contentType}>{card.contentType}</span>
      </div>

      {/* Media Thumbnails */}
      {card.imageUrl && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onPreviewMedia('image', card.imageUrl!);
          }}
          className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-slate-100 shadow-2xs hover:scale-[1.015] transition-all bg-slate-950 flex items-center justify-center group"
          title="Bấm để phóng to"
        >
          <img src={card.imageUrl} alt="AI Illustration" className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white gap-1 font-sans text-[10px] font-bold select-none">
            <ZoomIn className="h-4 w-4 text-white animate-pulse" />
            <span>Bấm để phóng to</span>
          </div>
        </div>
      )}

      {canRenderVideo && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onPreviewMedia('video', card.videoUrl!);
          }}
          className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-slate-100 shadow-2xs hover:scale-[1.015] transition-all bg-slate-900 flex items-center justify-center"
        >
          <video src={card.videoUrl} className="w-full h-full object-cover opacity-80" muted />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
            <div className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center text-slate-800 shadow-md">
              <span className="ml-0.5 text-xs">▶</span>
            </div>
          </div>
        </div>
      )}

      {/* Generate Media Button if none exists */}
      {!card.imageUrl && !card.videoUrl && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateMedia(
              card,
              card.mediaType === 'human-video'
                ? (card.engineType === 'avatar_iii' || card.usePersonalVoice ? 'video' : 'voice')
                : card.mediaType === 'video' ? 'video' : 'image'
            );
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-800 border border-purple-200/50 rounded-xl text-[10px] font-bold transition-all shadow-3xs cursor-pointer active:scale-[0.98]"
        >
          <Sparkles className="h-3 w-3 text-purple-500 animate-pulse" />
          <span>{
            card.mediaType === "human-video"
              ? (card.engineType === "avatar_iii" || card.usePersonalVoice ? "Tạo Video người thật" : "Tạo Voice → Video người thật")
              : card.mediaType === "video" ? "Tạo Video AI" :
              card.mediaType === "image" ? "Tạo Ảnh AI" :
              "Tạo Ảnh / Video AI"
          }</span>
        </button>
      )}
      {card.mediaType && (card.imageUrl || card.videoUrl) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateMedia(
              card,
              card.mediaType === 'human-video'
                ? (card.engineType === 'avatar_iii' || card.usePersonalVoice ? 'video' : 'voice')
                : card.mediaType === 'video' ? 'video' : 'image'
            );
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
        >
          <Sparkles className="h-3 w-3 text-slate-500" />
          <span>{
            card.mediaType === "human-video"
              ? (card.engineType === "avatar_iii" || card.usePersonalVoice ? "Mở Xưởng Video người thật" : "Mở Xưởng Voice → Video")
              : card.mediaType === "video" ? "Mở Xưởng Video AI" :
              card.mediaType === "image" ? "Mở Xưởng Ảnh AI" :
              "Mở Xưởng Media"
          }</span>
        </button>
      )}

      {/* Title & Body Text (Clickable to open details drawer) */}
      <div 
        className="cursor-pointer space-y-1 hover:bg-slate-50/40 p-1.5 rounded-lg transition-colors"
        onClick={onOpenDetail}
        title="Bấm để xem chi tiết bài đăng"
      >
        <h5 className="font-bold text-gray-800 leading-tight text-xs font-sans line-clamp-2 hover:text-indigo-650 transition-colors">
          {card.title}
        </h5>
        <p className="text-[11px] text-slate-550 leading-relaxed font-sans line-clamp-2 whitespace-pre-wrap">
          {card.bodyText}
        </p>
      </div>

      {card.scheduledDate && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-mono bg-emerald-50 border border-emerald-200/70 px-2.5 py-1.5 rounded-xl font-medium">
          <Clock className="h-3.5 w-3.5 text-emerald-650" />
          <span>{card.scheduledDate} {card.scheduledTime && `lúc ${card.scheduledTime}`}</span>
        </div>
      )}

      {card.status === "failed" && card.publishError && (
        <div className="flex flex-col gap-1 text-[10px] text-red-750 font-mono bg-red-50 border border-red-200/80 p-3 rounded-xl">
          <span className="font-extrabold flex items-center gap-1">⚠️ LỖI TỰ ĐỘNG ĐĂNG:</span>
          <span className="leading-relaxed font-sans font-medium text-red-650 line-clamp-2">{formatPublishError(card.publishError)}</span>
        </div>
      )}

      {/* TikTok Publish Button - chỉ hiện khi channel TikTok và đã kết nối */}
      {card.channel === 'TikTok' && tiktokIntegration?.isConnected && onPublishToTikTok && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPublishToTikTok();
          }}
          disabled={isPublishingTikTok || !card.videoUrl}
          title={!card.videoUrl ? 'Cần có video để đăng lên TikTok' : (isPublishingTikTok ? 'Đang đăng...' : 'Đăng video lên TikTok')}
          className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[10px] font-bold transition-all cursor-pointer border ${
            !card.videoUrl
              ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed shadow-none'
              : isPublishingTikTok
              ? 'bg-slate-800 text-white border-slate-700 opacity-75 cursor-wait'
              : 'bg-black hover:bg-slate-800 text-white border-black shadow-sm hover:shadow-md active:scale-[0.98]'
          }`}
          id={`tiktok_publish_btn_${card.id}`}
        >
          {isPublishingTikTok ? (
            <><RefreshCw className="h-3 w-3 animate-spin" /><span>Đang đăng lên TikTok...</span></>
          ) : (
            <><span className="text-sm font-sans">♪</span><span>Đăng lên TikTok {tiktokIntegration.isMock ? '(Demo)' : ''}</span></>
          )}
        </button>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-2.5 mt-auto">
        <div className="flex items-center justify-between text-gray-400 font-mono text-[8px] select-none">
          <span>Thời gian tạo:</span>
          <span>{formatCardDate(card.generatedAt)}</span>
        </div>
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onPrevStatus();
            }} 
            title="Quay lại: Đã duyệt"
            className="p-1.5 text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-800 border border-slate-200/60 rounded-lg font-bold transition-all flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }} 
            title="Xóa bài đăng"
            className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-755 border border-red-100/50 rounded-lg font-bold transition-all flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {card.status === "failed" ? (
            <span className="px-2 py-0.5 bg-red-500 text-white border border-red-600 rounded-md text-[8px] font-bold font-mono animate-pulse">
              ⚠️ LỖI ĐĂNG
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded-md text-[9px] font-bold font-mono">
              ✓ LỊCH
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface PublishedCardProps {
  key?: string | number | null;
  card: ContentApprovalCard;
  onDelete: (...args: any[]) => any;
  isUserRole: boolean;
  onPreviewMedia: (type: 'image' | 'video', url: string) => void;
  onOpenDetail?: () => void;
}

export function PublishedCard({ card, onDelete, isUserRole, onPreviewMedia, onOpenDetail }: PublishedCardProps) {
  const canRenderVideo = isRenderableVideoUrl(card.videoUrl);

  const channelBadgeStyles: Record<string, string> = {
    Facebook: "bg-blue-50 border-blue-250/30 text-blue-700",
    TikTok: "bg-slate-900 border-slate-950 text-white",
    Zalo: "bg-sky-50 border-sky-250/30 text-sky-700"
  };
  const channelStyle = channelBadgeStyles[card.channel] || "bg-slate-50 border-slate-200 text-slate-700";

  return (
    <div className="bg-white border text-left border-green-200/80 p-4 rounded-2xl shadow-3xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-3 relative" id={`published_card_${card.id}`}>
      
      <div className="flex justify-between items-center gap-2 cursor-pointer" onClick={onOpenDetail}>
        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-md text-[9px] font-mono font-bold tracking-wider shrink-0">
          <CheckCircle2 className="h-3 w-3 text-green-600" /> ĐÃ ĐĂNG
        </span>
        <span className={`px-2 py-0.5 border rounded-md text-[9px] font-mono font-bold tracking-wider shrink-0 uppercase ${channelStyle}`}>
          {card.channel}
        </span>
      </div>

      {/* Media Thumbnails */}
      {card.imageUrl && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onPreviewMedia('image', card.imageUrl!);
          }}
          className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-slate-100 shadow-2xs hover:scale-[1.015] transition-all bg-slate-950 flex items-center justify-center group"
          title="Bấm để phóng to"
        >
          <img src={card.imageUrl} alt="AI Illustration" className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white gap-1 font-sans text-[10px] font-bold select-none">
            <ZoomIn className="h-4 w-4 text-white animate-pulse" />
            <span>Bấm để phóng to</span>
          </div>
        </div>
      )}

      {canRenderVideo && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onPreviewMedia('video', card.videoUrl!);
          }}
          className="relative cursor-pointer overflow-hidden rounded-xl aspect-video w-full border border-slate-100 shadow-2xs hover:scale-[1.015] transition-all bg-slate-900 flex items-center justify-center"
        >
          <video src={card.videoUrl} className="w-full h-full object-cover opacity-80" muted />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
            <div className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center text-slate-800 shadow-md">
              <span className="ml-0.5 text-xs">▶</span>
            </div>
          </div>
        </div>
      )}

      {/* Title & Body Text (Clickable to open details drawer) */}
      <div 
        className="cursor-pointer space-y-1 hover:bg-slate-50/40 p-1.5 rounded-lg transition-colors"
        onClick={onOpenDetail}
        title="Bấm để xem chi tiết bài đăng"
      >
        <h5 className="font-bold text-gray-850 leading-tight text-xs font-sans line-clamp-2 hover:text-indigo-650 transition-colors">
          {card.title}
        </h5>
        <p className="text-[11px] text-slate-550 leading-relaxed font-sans line-clamp-2 whitespace-pre-wrap">
          {card.bodyText}
        </p>
      </div>

      {card.publishedAt && (
        <div className="text-[10px] text-green-700 font-mono bg-green-50 border border-green-200/70 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-650 animate-pulse" />
          <span>Đăng lúc: {new Date(card.publishedAt).toLocaleString('vi-VN')}</span>
        </div>
      )}

      {card.postUrl || card.facebookPostId ? (
        card.postUrl ? (
          <a
            href={card.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Xem bài viết thật trên Facebook"
            className="text-[10px] text-blue-600 font-mono bg-blue-50 border border-blue-200/70 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-1.5 hover:bg-blue-100 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Facebook className="h-3.5 w-3.5" />
              <span>Xem bài viết Facebook</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <div
            title={`Facebook Post ID: ${card.facebookPostId}`}
            className="text-[10px] text-blue-600 font-mono bg-blue-50 border border-blue-200/70 px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-1.5 cursor-pointer hover:bg-blue-100 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
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
              <span>Post ID: {card.facebookPostId?.slice(0, 15)}...</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </div>
        )
      ) : null}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-2.5 mt-auto">
        <div className="flex items-center justify-between text-gray-400 font-mono text-[8px] select-none">
          <span>Thời gian tạo:</span>
          <span>{formatCardDate(card.generatedAt)}</span>
        </div>
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }} 
            title="Xóa bài đăng"
            className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-755 border border-red-100/50 rounded-lg transition-all flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
