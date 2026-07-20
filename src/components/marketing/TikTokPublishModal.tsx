import React, { useState } from "react";
import { X, Globe, Users, Lock, MessageSquare, Repeat, Scissors, ShieldAlert } from "lucide-react";
import { ContentApprovalCard } from "../../types";

interface TikTokPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: ContentApprovalCard | null;
  tiktokAccount: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    isMock?: boolean;
  } | null;
  onConfirmPublish: (params: {
    caption: string;
    privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
    allowComment: boolean;
    allowDuet: boolean;
    allowStitch: boolean;
    brandContent: boolean;
  }) => Promise<void>;
  isPublishing: boolean;
}

export default function TikTokPublishModal({
  isOpen,
  onClose,
  card,
  tiktokAccount,
  onConfirmPublish,
  isPublishing,
}: TikTokPublishModalProps) {
  const [caption, setCaption] = useState(card?.bodyText || card?.title || "");
  const [privacyLevel, setPrivacyLevel] = useState<"PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY">("PUBLIC_TO_EVERYONE");
  const [allowComment, setAllowComment] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [brandContent, setBrandContent] = useState(false);

  React.useEffect(() => {
    if (card) {
      setCaption(card.bodyText || card.title || "");
    }
  }, [card]);

  if (!isOpen || !card) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirmPublish({
      caption,
      privacyLevel,
      allowComment,
      allowDuet,
      allowStitch,
      brandContent,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with TikTok Logo & Account */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black border border-slate-700 flex items-center justify-center text-white font-bold text-lg shadow-xs">
              <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.7a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.04z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight flex items-center gap-2">
                Share to TikTok <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">Direct Post</span>
              </h3>
              <p className="text-xs text-slate-400">
                Tài khoản: <span className="font-semibold text-slate-200">@{tiktokAccount?.username || "igen_marketing_bot"}</span> ({tiktokAccount?.displayName || "TikTok Account"})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Video Preview & Caption */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Video Player */}
            <div className="md:col-span-1 bg-black rounded-xl overflow-hidden aspect-[9/16] relative border border-slate-800 flex items-center justify-center">
              {card.videoUrl ? (
                <video src={card.videoUrl} controls className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-4 text-slate-500 text-xs">Không có video preview</div>
              )}
            </div>

            {/* Caption & Metadata */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mô tả / Caption TikTok
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  maxLength={2200}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                  placeholder="Nhập mô tả bài viết và hashtag #..."
                />
                <div className="text-right text-[10px] text-slate-500 font-mono mt-1">
                  {caption.length} / 2200 ký tự
                </div>
              </div>

              {/* Privacy Level */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Quyền riêng tư video (Privacy Level)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrivacyLevel("PUBLIC_TO_EVERYONE")}
                    className={`p-2.5 rounded-xl border text-left flex flex-col items-center gap-1 text-xs transition-all ${
                      privacyLevel === "PUBLIC_TO_EVERYONE"
                        ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    <span className="text-[11px]">Công khai</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrivacyLevel("MUTUAL_FOLLOW_FRIENDS")}
                    className={`p-2.5 rounded-xl border text-left flex flex-col items-center gap-1 text-xs transition-all ${
                      privacyLevel === "MUTUAL_FOLLOW_FRIENDS"
                        ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="text-[11px]">Bạn bè</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrivacyLevel("SELF_ONLY")}
                    className={`p-2.5 rounded-xl border text-left flex flex-col items-center gap-1 text-xs transition-all ${
                      privacyLevel === "SELF_ONLY"
                        ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span className="text-[11px]">Chỉ mình tôi</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Interaction Permissions */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Cài đặt Tương tác người xem (Interaction Permissions)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer">
                <span className="text-xs text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Bình luận
                </span>
                <input
                  type="checkbox"
                  checked={allowComment}
                  onChange={(e) => setAllowComment(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer">
                <span className="text-xs text-slate-300 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-purple-400" /> Duet
                </span>
                <input
                  type="checkbox"
                  checked={allowDuet}
                  onChange={(e) => setAllowDuet(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer">
                <span className="text-xs text-slate-300 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-emerald-400" /> Stitch
                </span>
                <input
                  type="checkbox"
                  checked={allowStitch}
                  onChange={(e) => setAllowStitch(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* Commercial Content Disclosure */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-200 block">Khai báo nội dung thương mại / Quảng cáo</span>
                  <span className="text-[11px] text-slate-400 block">Bật nếu bài viết này chứa thông tin quảng cáo, tài trợ sản phẩm</span>
                </div>
                <input
                  type="checkbox"
                  checked={brandContent}
                  onChange={(e) => setBrandContent(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* TikTok Terms & Privacy Disclaimer */}
          <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              Bằng việc nhấn <b>Share to TikTok</b>, bạn xác nhận đồng ý với{" "}
              <a
                href="https://www.tiktok.com/legal/terms-of-service"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 underline hover:text-cyan-300"
              >
                Điều khoản dịch vụ
              </a>{" "}
              và{" "}
              <a
                href="https://www.tiktok.com/legal/privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 underline hover:text-cyan-300"
              >
                Chính sách bảo mật
              </a>{" "}
              của TikTok.
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isPublishing}
              className="px-5 py-2.5 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-700 shadow-lg flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              {isPublishing ? (
                <span>Đang xử lý...</span>
              ) : (
                <>
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.7a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.04z"/>
                  </svg>
                  <span>Share to TikTok</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
