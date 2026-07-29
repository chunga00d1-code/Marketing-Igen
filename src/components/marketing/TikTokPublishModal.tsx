import React, { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Info, Loader2, MessageSquare,
  Music, Repeat, Scissors, ShieldCheck, Tag, X,
} from "lucide-react";
import { ContentApprovalCard } from "../../types";
import { extractDraftContent } from "../../services/marketingService";
import {
  socialIntegrationService,
  type TikTokCreatorInfo,
  type TikTokPrivacyLevel,
} from "../../services/socialIntegrationService";

interface TikTokPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: ContentApprovalCard | null;
  tiktokAccount: { isConnected?: boolean; integrationId?: string; source?: "personal" | "company" } | null;
  onConfirmPublish: (params: {
    caption: string;
    privacyLevel: TikTokPrivacyLevel;
    allowComment: boolean;
    allowDuet: boolean;
    allowStitch: boolean;
    brandContentToggle: boolean;
    brandContent: boolean;
    brandOrganic: boolean;
    isAigc: boolean;
    videoDurationSeconds: number;
    consentAccepted: boolean;
  }) => Promise<void>;
  isPublishing: boolean;
}

const PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Công khai",
  MUTUAL_FOLLOW_FRIENDS: "Bạn bè",
  FOLLOWER_OF_CREATOR: "Người theo dõi",
  SELF_ONLY: "Chỉ mình tôi",
};

export default function TikTokPublishModal({
  isOpen, onClose, card, tiktokAccount, onConfirmPublish, isPublishing,
}: TikTokPublishModalProps) {
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [creatorError, setCreatorError] = useState("");
  const [loadingCreator, setLoadingCreator] = useState(false);
  const [reloadCreatorKey, setReloadCreatorKey] = useState(0);
  const [caption, setCaption] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState<TikTokPrivacyLevel | "">("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [brandContentToggle, setBrandContentToggle] = useState(false);
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [isAigc, setIsAigc] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [videoMetadataError, setVideoMetadataError] = useState("");
  const activeCardId = card?.id || "";
  const initialCaption = card ? extractDraftContent(card.bodyText || card.title || "") : "";

  useEffect(() => {
    if (!isOpen || !activeCardId) return;
    let cancelled = false;

    setCaption(initialCaption);
    setPrivacyLevel("");
    setAllowComment(false);
    setAllowDuet(false);
    setAllowStitch(false);
    setBrandContentToggle(false);
    setBrandContent(false);
    setBrandOrganic(false);
    setIsAigc(false);
    setConsentAccepted(false);
    setVideoDurationSeconds(null);
    setVideoMetadataError("");
    setCreatorInfo(null);
    setCreatorError("");
    setLoadingCreator(true);

    socialIntegrationService.getTikTokCreatorInfo(tiktokAccount?.integrationId)
      .then((info) => {
        if (cancelled) return;
        if (!info.creatorNickname || !info.maxVideoPostDurationSec || info.privacyLevelOptions.length === 0) {
          throw new Error("Tài khoản TikTok hiện chưa thể đăng thêm bài. Vui lòng thử lại sau.");
        }
        setCreatorInfo(info);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCreatorError(error instanceof Error ? error.message : "Không thể tải creator info từ TikTok.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCreator(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, activeCardId, initialCaption, tiktokAccount?.integrationId, reloadCreatorKey]);

  if (!isOpen || !card) return null;

  const maxDuration = creatorInfo?.maxVideoPostDurationSec || 0;
  const captionTooLong = caption.length > 2200;
  const durationTooLong = videoDurationSeconds !== null && maxDuration > 0 && videoDurationSeconds > maxDuration;
  const commercialSelectionMissing = brandContentToggle && !brandContent && !brandOrganic;
  const brandedPrivate = brandContent && privacyLevel === "SELF_ONLY";
  const commercialLabel = brandContent
    ? "Your video will be labeled as 'Paid partnership'"
    : brandOrganic
      ? "Your video will be labeled as 'Promotional content'"
      : "";
  const canPublish = Boolean(
    creatorInfo && privacyLevel && consentAccepted && videoDurationSeconds && !videoMetadataError &&
    !captionTooLong && !durationTooLong && !commercialSelectionMissing && !brandedPrivate && !isPublishing
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canPublish || !privacyLevel || videoDurationSeconds === null) return;
    await onConfirmPublish({
      caption, privacyLevel, allowComment, allowDuet, allowStitch, brandContentToggle,
      brandContent, brandOrganic, isAigc, videoDurationSeconds,
      consentAccepted: true,
    });
  };

  const toggleCommercialDisclosure = (enabled: boolean) => {
    setBrandContentToggle(enabled);
    if (!enabled) {
      setBrandContent(false);
      setBrandOrganic(false);
    }
  };

  const setBrandedContent = (enabled: boolean) => {
    setBrandContent(enabled);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-[#121212] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#161823] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold">Share to TikTok</h3>
              <span className="rounded-md border border-emerald-400/25 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">Production API</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Ứng dụng TikTok đã được duyệt · Xác nhận trước khi gửi video</p>
          </div>
          <button type="button" onClick={onClose} disabled={isPublishing} className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-6">
          {loadingCreator ? (
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100"><Loader2 className="h-5 w-5 animate-spin" />Đang lấy quyền đăng mới nhất từ TikTok...</div>
          ) : creatorError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{creatorError}</span></div>
              <button type="button" onClick={() => setReloadCreatorKey((value) => value + 1)} className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-bold hover:bg-red-500/30">Thử lại</button>
            </div>
          ) : creatorInfo ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-[#18181c] p-4">
              {creatorInfo.creatorAvatarUrl ? <img src={creatorInfo.creatorAvatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 font-bold">♪</div>}
              <div><p className="text-xs text-slate-400">Video sẽ được đăng vào</p><p className="font-extrabold">{creatorInfo.creatorNickname}</p><p className="text-xs text-slate-400">@{creatorInfo.creatorUsername}</p></div>
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <div>
              <div className="aspect-[9/16] overflow-hidden rounded-[28px] border-4 border-slate-700 bg-black">
                <video src={card.videoUrl || ""} controls muted className="h-full w-full object-contain"
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration;
                    if (Number.isFinite(duration) && duration > 0) {
                      setVideoDurationSeconds(duration);
                      setVideoMetadataError("");
                    } else setVideoMetadataError("Không đọc được thời lượng video.");
                  }}
                  onError={() => setVideoMetadataError("Không thể tải video preview. Vui lòng upload lại video.")}
                />
              </div>
              <div className={`mt-2 rounded-xl border p-2 text-center text-[11px] ${durationTooLong || videoMetadataError ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-slate-700 bg-slate-800 text-slate-300"}`}>
                {videoMetadataError || (videoDurationSeconds ? `${Math.ceil(videoDurationSeconds)} giây / tối đa ${maxDuration || "..."} giây` : "Đang kiểm tra thời lượng video...")}
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between"><label htmlFor="tiktok-post-title" className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider"><Tag className="h-4 w-4 text-cyan-300" />Tiêu đề / Caption và hashtag</label><span className={`text-[10px] ${captionTooLong ? "font-bold text-red-300" : "text-slate-400"}`}>{caption.length}/2200</span></div>
                <textarea id="tiktok-post-title" value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2200} rows={5} className="w-full resize-none rounded-2xl border border-slate-700 bg-[#18181c] p-3.5 text-xs outline-none focus:border-cyan-400" />
                {captionTooLong && <p className="text-[11px] text-red-300">Caption đang vượt 2.200 ký tự. Hãy rút gọn trước khi đăng; hệ thống không tự cắt nội dung.</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="tiktok-privacy-level" className="text-xs font-extrabold uppercase tracking-wider">Quyền riêng tư *</label>
                <p className="text-[11px] text-slate-400">Bạn phải tự chọn từ dropdown các tùy chọn TikTok đang cho phép.</p>
                <select
                  id="tiktok-privacy-level"
                  value={privacyLevel}
                  onChange={(event) => setPrivacyLevel(event.target.value as TikTokPrivacyLevel | "")}
                  className="w-full rounded-2xl border border-slate-700 bg-[#18181c] p-3.5 text-xs text-white outline-none focus:border-cyan-400"
                >
                  <option value="">Chọn quyền riêng tư</option>
                  {(creatorInfo?.privacyLevelOptions || []).map((option) => (
                    <option key={option} value={option} disabled={option === "SELF_ONLY" && brandContent}>
                      {PRIVACY_LABELS[option]}
                    </option>
                  ))}
                </select>
                {brandContent && <p className="text-[11px] text-amber-200">Branded content visibility cannot be set to private.</p>}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#18181c] p-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wider">Cho phép tương tác</h4>
            <p className="text-[11px] text-slate-400">Tất cả đều tắt mặc định. Tùy chọn bị TikTok vô hiệu hóa sẽ không thể bật.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "Bình luận", icon: <MessageSquare className="h-4 w-4" />, checked: allowComment, disabled: creatorInfo?.commentDisabled, set: setAllowComment },
                { label: "Duet", icon: <Repeat className="h-4 w-4" />, checked: allowDuet, disabled: creatorInfo?.duetDisabled, set: setAllowDuet },
                { label: "Stitch", icon: <Scissors className="h-4 w-4" />, checked: allowStitch, disabled: creatorInfo?.stitchDisabled, set: setAllowStitch },
              ].map((item) => <label key={item.label} className={`flex items-center justify-between rounded-xl border border-slate-700 bg-[#121212] p-3 text-xs ${item.disabled ? "cursor-not-allowed opacity-35" : "cursor-pointer"}`}><span className="flex items-center gap-2">{item.icon}{item.label}</span><input type="checkbox" checked={item.checked} disabled={item.disabled} onChange={(event) => item.set(event.target.checked)} className="h-4 w-4 accent-[#FE2C55]" /></label>)}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#18181c] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span><span className="flex items-center gap-1.5 text-xs font-bold"><Info className="h-4 w-4 text-amber-300" />Nội dung thương mại</span><span className="mt-1 block text-[11px] text-slate-400">Nội dung quảng bá bản thân, thương hiệu, sản phẩm hoặc dịch vụ</span></span>
              <input type="checkbox" checked={brandContentToggle} onChange={(event) => toggleCommercialDisclosure(event.target.checked)} className="h-4 w-4 accent-[#FE2C55]" />
            </label>
            {brandContentToggle && <div className="grid gap-2 border-t border-slate-700 pt-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-slate-700 bg-[#121212] p-3 text-xs"><span className="flex items-center gap-2 font-bold"><input type="checkbox" checked={brandOrganic} onChange={(event) => setBrandOrganic(event.target.checked)} className="accent-[#FE2C55]" />Your Brand</span><span className="mt-1 block text-[10px] text-slate-400">Promoting yourself or your own business</span></label>
              <label title={privacyLevel === "SELF_ONLY" ? "Branded content visibility cannot be set to private." : undefined} className={`rounded-xl border border-slate-700 bg-[#121212] p-3 text-xs ${privacyLevel === "SELF_ONLY" ? "cursor-not-allowed opacity-35" : "cursor-pointer"}`}><span className="flex items-center gap-2 font-bold"><input type="checkbox" checked={brandContent} disabled={privacyLevel === "SELF_ONLY"} onChange={(event) => setBrandedContent(event.target.checked)} className="accent-[#FE2C55]" />Branded Content</span><span className="mt-1 block text-[10px] text-slate-400">Promoting another brand or a third party</span></label>
            </div>}
            {commercialLabel && <p className="text-[11px] text-amber-200">{commercialLabel}</p>}
            {commercialSelectionMissing && <p className="text-[11px] text-red-300">You need to indicate if your content promotes yourself, a third party, or both.</p>}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-800 bg-[#18181c] p-4">
            <input type="checkbox" checked={isAigc} onChange={(event) => setIsAigc(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#FE2C55]" />
            <span><span className="block text-xs font-bold">Nội dung do AI tạo</span><span className="mt-1 block text-[11px] text-slate-400">Bật nếu video được tạo hoặc chỉnh sửa đáng kể bằng AI để TikTok gắn nhãn phù hợp.</span></span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-[11px] leading-relaxed text-slate-300">
            <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#FE2C55]" />
            <span><ShieldCheck className="mr-1 inline h-4 w-4 text-cyan-300" />{brandContent ? <>By posting, you agree to TikTok&apos;s <a className="text-cyan-300 underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> and <a className="text-cyan-300 underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</> : <>By posting, you agree to TikTok&apos;s <a className="text-cyan-300 underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</>}</span>
          </label>

          <div className="flex items-center gap-2 rounded-xl bg-slate-800/70 p-3 text-[11px] text-slate-300"><Music className="h-4 w-4 shrink-0 text-cyan-300" />Sau khi đăng, TikTok có thể cần vài phút để xử lý và hiển thị video trên hồ sơ.</div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">{canPublish ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}{canPublish ? "Sẵn sàng đăng" : "Hoàn tất các mục bắt buộc"}</span>
            <div className="flex gap-2"><button type="button" onClick={onClose} disabled={isPublishing} className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold disabled:opacity-50">Hủy</button><span title={commercialSelectionMissing ? "You need to indicate if your content promotes yourself, a third party, or both." : undefined}><button type="submit" disabled={!canPublish} className="flex items-center gap-2 rounded-xl bg-[#FE2C55] px-6 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">{isPublishing ? <><Loader2 className="h-4 w-4 animate-spin" />Đang gửi...</> : "Share to TikTok"}</button></span></div>
          </div>
        </form>
      </div>
    </div>
  );
}
