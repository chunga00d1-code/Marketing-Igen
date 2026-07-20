import React, { useState, useEffect } from "react";
import {
  X,
  Globe,
  Users,
  Lock,
  MessageSquare,
  Repeat,
  Scissors,
  ShieldCheck,
  Music,
  Tag,
  Sparkles,
  Info,
  CheckCircle2
} from "lucide-react";
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

  useEffect(() => {
    if (card) {
      setCaption(card.bodyText || card.title || "");
    }
  }, [card]);

  if (!isOpen || !card) return null;

  const handleAddHashtag = (tag: string) => {
    if (!caption.includes(tag)) {
      setCaption((prev) => (prev ? `${prev} ${tag}` : tag));
    }
  };

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

  const username = tiktokAccount?.username || "igen_marketing_bot";
  const displayName = tiktokAccount?.displayName || "iGen TikTok Studio";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-[#121212] border border-slate-800 text-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] font-sans">
        
        {/* Header with TikTok Premium Identity */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#161823] via-[#121212] to-[#1e1e24] border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black border border-slate-700/80 flex items-center justify-center shadow-lg relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#25F4EE]/20 to-[#FE2C55]/20 opacity-60"></div>
              <svg className="w-5 h-5 fill-current text-white relative z-10" viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.7a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.04z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  Share to TikTok
                </h3>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-[#FE2C55]/15 text-[#FE2C55] border border-[#FE2C55]/30">
                  Direct Post API
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Tài khoản: <span className="font-bold text-slate-200">@{username}</span> ({displayName})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Left Column: Phone Mockup Video Preview (5 cols) */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-[220px] aspect-[9/16] bg-black rounded-[28px] overflow-hidden border-[3px] border-slate-700 shadow-2xl relative flex flex-col justify-between group">
                {card.videoUrl ? (
                  <video src={card.videoUrl} controls autoPlay loop muted className="w-full h-full object-cover" />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-slate-500">
                    <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
                    <span className="text-xs">Chưa có Video Preview</span>
                  </div>
                )}

                {/* TikTok UI Overlay Simulation */}
                <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between bg-gradient-to-b from-black/40 via-transparent to-black/70">
                  <div className="flex items-center justify-between text-[10px] text-white font-bold">
                    <span className="bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20">
                      ♪ TikTok Direct
                    </span>
                    <span className="text-[#25F4EE]">LIVE</span>
                  </div>
                  
                  <div className="space-y-1 text-left text-white">
                    <p className="text-[11px] font-extrabold drop-shadow-md">@{username}</p>
                    <p className="text-[9.5px] text-slate-200 line-clamp-2 leading-tight drop-shadow">
                      {caption || "Mô tả bài viết TikTok..."}
                    </p>
                    <div className="flex items-center gap-1 text-[9px] text-slate-300">
                      <Music className="w-2.5 h-2.5 animate-spin" />
                      <span>Original Sound - iGen AI Studio</span>
                    </div>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 mt-2 font-mono">Xem trước diện mạo bài đăng</span>
            </div>

            {/* Right Column: Settings & Direct Post Options (7 cols) */}
            <div className="md:col-span-7 space-y-5">
              
              {/* Caption & Hashtag Assist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#25F4EE]" /> Mô tả & Hashtag
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    <span className={caption.length > 2000 ? "text-amber-400 font-bold" : "text-slate-300"}>
                      {caption.length}
                    </span> / 2200
                  </span>
                </div>
                
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  maxLength={2200}
                  className="w-full bg-[#18181c] border border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-100 focus:outline-none focus:border-[#25F4EE] transition-all resize-none font-sans leading-relaxed"
                  placeholder="Nhập mô tả thu hút người xem và gắn hashtag #..."
                />

                {/* Quick Hashtag Suggestions */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-500 font-bold mr-1">Gợi ý:</span>
                  {["#iGenERP", "#MarketingAI", "#Automation", "#TikTokStudio", "#Trending"].map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => handleAddHashtag(tag)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-mono transition-all border border-slate-700/60 cursor-pointer"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Privacy Level Controls */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider">
                  Quyền riêng tư (Privacy Level)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPrivacyLevel("PUBLIC_TO_EVERYONE")}
                    className={`p-3 rounded-2xl border text-left flex flex-col items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                      privacyLevel === "PUBLIC_TO_EVERYONE"
                        ? "bg-[#25F4EE]/10 border-[#25F4EE] text-[#25F4EE] font-bold shadow-md shadow-[#25F4EE]/10"
                        : "bg-[#18181c] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    <span className="text-[11px]">Công khai</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrivacyLevel("MUTUAL_FOLLOW_FRIENDS")}
                    className={`p-3 rounded-2xl border text-left flex flex-col items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                      privacyLevel === "MUTUAL_FOLLOW_FRIENDS"
                        ? "bg-[#25F4EE]/10 border-[#25F4EE] text-[#25F4EE] font-bold shadow-md shadow-[#25F4EE]/10"
                        : "bg-[#18181c] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="text-[11px]">Bạn bè</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrivacyLevel("SELF_ONLY")}
                    className={`p-3 rounded-2xl border text-left flex flex-col items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                      privacyLevel === "SELF_ONLY"
                        ? "bg-[#25F4EE]/10 border-[#25F4EE] text-[#25F4EE] font-bold shadow-md shadow-[#25F4EE]/10"
                        : "bg-[#18181c] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span className="text-[11px]">Chỉ mình tôi</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Interaction Controls */}
          <div className="bg-[#18181c] border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center justify-between">
              <span>Quyền tương tác người xem (Interaction Permissions)</span>
              <span className="text-[10px] text-slate-400 font-normal font-mono">Cho phép người dùng TikTok</span>
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center justify-between p-3 bg-[#121212] border border-slate-700/60 rounded-xl cursor-pointer hover:border-slate-600 transition-all">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#25F4EE]" /> Bình luận
                </span>
                <input
                  type="checkbox"
                  checked={allowComment}
                  onChange={(e) => setAllowComment(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-[#FE2C55] focus:ring-0 w-4 h-4 cursor-pointer accent-[#FE2C55]"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-[#121212] border border-slate-700/60 rounded-xl cursor-pointer hover:border-slate-600 transition-all">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-purple-400" /> Duet
                </span>
                <input
                  type="checkbox"
                  checked={allowDuet}
                  onChange={(e) => setAllowDuet(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-[#FE2C55] focus:ring-0 w-4 h-4 cursor-pointer accent-[#FE2C55]"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-[#121212] border border-slate-700/60 rounded-xl cursor-pointer hover:border-slate-600 transition-all">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-emerald-400" /> Stitch
                </span>
                <input
                  type="checkbox"
                  checked={allowStitch}
                  onChange={(e) => setAllowStitch(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-[#FE2C55] focus:ring-0 w-4 h-4 cursor-pointer accent-[#FE2C55]"
                />
              </label>
            </div>

            {/* Commercial Content Toggle */}
            <div className="pt-3 border-t border-slate-800/80">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-400" /> Khai báo nội dung thương mại / Quảng cáo
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    Bật nếu bài viết này chứa thông tin tiếp thị sản phẩm, tài trợ thương hiệu
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={brandContent}
                  onChange={(e) => setBrandContent(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-[#FE2C55] focus:ring-0 w-4 h-4 cursor-pointer accent-[#FE2C55]"
                />
              </label>
            </div>
          </div>

          {/* TikTok Terms & Compliance Footer Banner */}
          <div className="bg-[#18181c]/60 border border-slate-800 rounded-2xl p-3.5 text-[11px] text-slate-400 leading-relaxed flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#25F4EE] shrink-0 mt-0.5" />
            <div>
              Bằng việc nhấn nút <b>Share to TikTok</b>, bạn xác nhận đã rà soát nội dung và đồng ý với{" "}
              <a
                href="https://www.tiktok.com/legal/terms-of-service"
                target="_blank"
                rel="noreferrer"
                className="text-[#25F4EE] underline hover:text-[#25F4EE]/80 transition-colors font-medium"
              >
                Điều khoản dịch vụ
              </a>{" "}
              và{" "}
              <a
                href="https://www.tiktok.com/legal/privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="text-[#25F4EE] underline hover:text-[#25F4EE]/80 transition-colors font-medium"
              >
                Chính sách bảo mật
              </a>{" "}
              của TikTok Developer Platform.
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Sẵn sàng đăng bài Direct Post</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
              >
                Hủy
              </button>
              
              <button
                type="submit"
                disabled={isPublishing}
                className="px-6 py-2.5 bg-gradient-to-r from-[#FE2C55] to-[#E61B48] hover:from-[#e0264b] hover:to-[#cc153d] text-white font-extrabold text-xs rounded-xl shadow-lg shadow-[#FE2C55]/25 flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
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
          </div>

        </form>
      </div>
    </div>
  );
}
