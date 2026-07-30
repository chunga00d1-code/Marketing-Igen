import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Info, Loader2, MessageSquare,
  Repeat, Scissors, ShieldCheck, Users, X,
} from 'lucide-react';
import type { CampaignSlot } from './CampaignDetailModal';
import type { TikTokBatchPublishOptions } from '../../services/marketingCampaignService';
import {
  socialIntegrationService,
  type TikTokCreatorInfo,
  type TikTokPrivacyLevel,
} from '../../services/socialIntegrationService';

interface TikTokBatchApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: CampaignSlot[];
  integrationId?: string;
  onConfirmApprove: (payload: {
    tiktokPublishOptions: TikTokBatchPublishOptions;
    videoDurations: Record<string, number>;
  }) => Promise<void>;
  isApproving: boolean;
}

const PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: 'Công khai',
  MUTUAL_FOLLOW_FRIENDS: 'Bạn bè',
  FOLLOWER_OF_CREATOR: 'Người theo dõi',
  SELF_ONLY: 'Chỉ mình tôi',
};

const getPreferenceKey = (integrationId?: string) => `tiktok-publish-preset:${integrationId || 'default'}`;

function getVideoUrl(slot: CampaignSlot) {
  return slot.content?.videoUrl
    || slot.content?.mediaUrls?.[0]
    || slot.ingestedMedia?.[0]?.url
    || slot.realImageDirectUrls?.[0]
    || '';
}

export default function TikTokBatchApprovalModal({
  isOpen,
  onClose,
  slots,
  integrationId,
  onConfirmApprove,
  isApproving,
}: TikTokBatchApprovalModalProps) {
  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [creatorError, setCreatorError] = useState('');
  const [loadingCreator, setLoadingCreator] = useState(false);
  const [reloadCreatorKey, setReloadCreatorKey] = useState(0);
  const [privacyLevel, setPrivacyLevel] = useState<TikTokPrivacyLevel | ''>('');
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [brandContentToggle, setBrandContentToggle] = useState(false);
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [isAigc, setIsAigc] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});

  const videoItems = useMemo(() => slots.map((slot) => ({
    id: slot._id,
    brief: slot.topicBrief,
    url: getVideoUrl(slot),
  })), [slots]);

  useEffect(() => {
    if (!isOpen || slots.length === 0) return;
    let cancelled = false;
    const emptyVideoErrors = Object.fromEntries(
      videoItems.filter((item) => !item.url).map((item) => [item.id, 'Chưa có video hoàn chỉnh.'])
    );
    let preset: Partial<TikTokBatchPublishOptions> = {};
    try {
      const saved = window.localStorage.getItem(getPreferenceKey(integrationId));
      preset = saved ? JSON.parse(saved) as Partial<TikTokBatchPublishOptions> : {};
    } catch {
      preset = {};
    }

    setPrivacyLevel(preset.privacyLevel || '');
    setAllowComment(Boolean(preset.allowComment));
    setAllowDuet(Boolean(preset.allowDuet));
    setAllowStitch(Boolean(preset.allowStitch));
    setBrandContentToggle(Boolean(preset.brandContentToggle));
    setBrandContent(Boolean(preset.brandContent));
    setBrandOrganic(Boolean(preset.brandOrganic));
    setIsAigc(Boolean(preset.isAigc));
    setConsentAccepted(false);
    setVideoDurations({});
    setVideoErrors(emptyVideoErrors);
    setCreatorInfo(null);
    setCreatorError('');
    setLoadingCreator(true);

    socialIntegrationService.getTikTokCreatorInfo(integrationId)
      .then((info) => {
        if (cancelled) return;
        if (!info.creatorNickname || !info.maxVideoPostDurationSec || info.privacyLevelOptions.length === 0) {
          throw new Error('Tài khoản TikTok hiện chưa thể đăng thêm bài. Vui lòng thử lại sau.');
        }
        setCreatorInfo(info);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCreatorError(error instanceof Error ? error.message : 'Không thể tải creator info từ TikTok.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCreator(false);
      });

    return () => { cancelled = true; };
  }, [integrationId, isOpen, reloadCreatorKey, slots.length, videoItems]);

  if (!isOpen || slots.length === 0) return null;

  const maxDuration = creatorInfo?.maxVideoPostDurationSec || 0;
  const metadataPending = videoItems.some((item) => item.url && !videoDurations[item.id] && !videoErrors[item.id]);
  const tooLongVideos = videoItems.filter((item) => maxDuration > 0 && (videoDurations[item.id] || 0) > maxDuration);
  const videoErrorList = Object.values(videoErrors);
  const commercialSelectionMissing = brandContentToggle && !brandContent && !brandOrganic;
  const brandedPrivate = brandContent && privacyLevel === 'SELF_ONLY';
  const canConfirm = Boolean(
    creatorInfo && privacyLevel && consentAccepted && !metadataPending && videoErrorList.length === 0
    && tooLongVideos.length === 0 && !commercialSelectionMissing && !brandedPrivate && !isApproving
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canConfirm || !privacyLevel) return;
    const tiktokPublishOptions: TikTokBatchPublishOptions = {
      privacyLevel,
      allowComment,
      allowDuet,
      allowStitch,
      brandContentToggle,
      brandContent,
      brandOrganic,
      isAigc,
      consentAccepted: true,
    };
    window.localStorage.setItem(getPreferenceKey(integrationId), JSON.stringify({
      ...tiktokPublishOptions,
      consentAccepted: false,
    }));
    await onConfirmApprove({ tiktokPublishOptions, videoDurations });
  };

  const toggleCommercialDisclosure = (enabled: boolean) => {
    setBrandContentToggle(enabled);
    if (!enabled) {
      setBrandContent(false);
      setBrandOrganic(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-[#121212] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#161823] px-6 py-4">
          <div>
            <div className="flex items-center gap-2"><h3 className="text-base font-extrabold">Duyệt nhiều video TikTok</h3><span className="rounded-md border border-emerald-400/25 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">Một lần xác nhận</span></div>
            <p className="mt-1 text-xs text-slate-400">Áp dụng cùng quyền đăng cho {slots.length} video; caption của mỗi bài vẫn được giữ riêng.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isApproving} className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-6">
          {loadingCreator ? (
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100"><Loader2 className="h-5 w-5 animate-spin" />Đang lấy quyền đăng mới nhất từ TikTok...</div>
          ) : creatorError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{creatorError}</span></div><button type="button" onClick={() => setReloadCreatorKey((value) => value + 1)} className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-bold hover:bg-red-500/30">Thử lại</button></div>
          ) : creatorInfo ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-[#18181c] p-4">
              {creatorInfo.creatorAvatarUrl ? <img src={creatorInfo.creatorAvatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 font-bold">♪</div>}
              <div><p className="text-xs text-slate-400">Các video sẽ được đăng vào</p><p className="font-extrabold">{creatorInfo.creatorNickname}</p><p className="text-xs text-slate-400">@{creatorInfo.creatorUsername}</p></div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-800 bg-[#18181c] p-4">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider"><Users className="h-4 w-4 text-cyan-300" />Video trong lần duyệt này</div>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
              {videoItems.map((item, index) => {
                const duration = videoDurations[item.id];
                const error = videoErrors[item.id];
                return <div key={item.id} className="rounded-xl border border-slate-700 bg-[#121212] px-3 py-2 text-xs">
                  {item.url && <video src={item.url} preload="metadata" muted className="hidden" onLoadedMetadata={(event) => {
                    const value = event.currentTarget.duration;
                    if (Number.isFinite(value) && value > 0) {
                      setVideoDurations((current) => ({ ...current, [item.id]: value }));
                      setVideoErrors((current) => { const next = { ...current }; delete next[item.id]; return next; });
                    } else setVideoErrors((current) => ({ ...current, [item.id]: 'Không đọc được thời lượng video.' }));
                  }} onError={() => setVideoErrors((current) => ({ ...current, [item.id]: 'Không thể tải video để kiểm tra thời lượng.' }))} />}
                  <div className="flex items-start justify-between gap-3"><span className="line-clamp-2 font-medium text-slate-200">{index + 1}. {item.brief}</span><span className={`shrink-0 text-[10px] ${error || (maxDuration && duration && duration > maxDuration) ? 'text-red-300' : 'text-slate-400'}`}>{error || (duration ? `${Math.ceil(duration)} giây / tối đa ${maxDuration || '...'}` : 'Đang kiểm tra...')}</span></div>
                </div>;
              })}
            </div>
            {tooLongVideos.length > 0 && <p className="mt-3 text-[11px] text-red-300">Có video vượt quá thời lượng TikTok đang cho phép. Hãy thay video trước khi duyệt.</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="tiktok-batch-privacy-level" className="text-xs font-extrabold uppercase tracking-wider">Quyền riêng tư *</label>
            <p className="text-[11px] text-slate-400">Lựa chọn gần nhất được điền sẵn; bạn vẫn có thể đổi cho cả nhóm video này.</p>
            <select id="tiktok-batch-privacy-level" value={privacyLevel} onChange={(event) => setPrivacyLevel(event.target.value as TikTokPrivacyLevel | '')} className="w-full rounded-2xl border border-slate-700 bg-[#18181c] p-3.5 text-xs text-white outline-none focus:border-cyan-400">
              <option value="">Chọn quyền riêng tư</option>
              {(creatorInfo?.privacyLevelOptions || []).map((option) => <option key={option} value={option} disabled={option === 'SELF_ONLY' && brandContent}>{PRIVACY_LABELS[option]}</option>)}
            </select>
            {brandContent && <p className="text-[11px] text-amber-200">Branded content visibility cannot be set to private.</p>}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#18181c] p-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wider">Cho phép tương tác</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Bình luận', icon: <MessageSquare className="h-4 w-4" />, checked: allowComment, disabled: creatorInfo?.commentDisabled, set: setAllowComment },
                { label: 'Duet', icon: <Repeat className="h-4 w-4" />, checked: allowDuet, disabled: creatorInfo?.duetDisabled, set: setAllowDuet },
                { label: 'Stitch', icon: <Scissors className="h-4 w-4" />, checked: allowStitch, disabled: creatorInfo?.stitchDisabled, set: setAllowStitch },
              ].map((item) => <label key={item.label} className={`flex items-center justify-between rounded-xl border border-slate-700 bg-[#121212] p-3 text-xs ${item.disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}`}><span className="flex items-center gap-2">{item.icon}{item.label}</span><input type="checkbox" checked={item.checked} disabled={item.disabled} onChange={(event) => item.set(event.target.checked)} className="h-4 w-4 accent-[#FE2C55]" /></label>)}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#18181c] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-4"><span><span className="flex items-center gap-1.5 text-xs font-bold"><Info className="h-4 w-4 text-amber-300" />Nội dung thương mại</span><span className="mt-1 block text-[11px] text-slate-400">Nội dung quảng bá bản thân, thương hiệu, sản phẩm hoặc dịch vụ</span></span><input type="checkbox" checked={brandContentToggle} onChange={(event) => toggleCommercialDisclosure(event.target.checked)} className="h-4 w-4 accent-[#FE2C55]" /></label>
            {brandContentToggle && <div className="grid gap-2 border-t border-slate-700 pt-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-slate-700 bg-[#121212] p-3 text-xs"><span className="flex items-center gap-2 font-bold"><input type="checkbox" checked={brandOrganic} onChange={(event) => setBrandOrganic(event.target.checked)} className="accent-[#FE2C55]" />Your Brand</span></label>
              <label title={privacyLevel === 'SELF_ONLY' ? 'Branded content visibility cannot be set to private.' : undefined} className={`rounded-xl border border-slate-700 bg-[#121212] p-3 text-xs ${privacyLevel === 'SELF_ONLY' ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'}`}><span className="flex items-center gap-2 font-bold"><input type="checkbox" checked={brandContent} disabled={privacyLevel === 'SELF_ONLY'} onChange={(event) => setBrandContent(event.target.checked)} className="accent-[#FE2C55]" />Branded Content</span></label>
            </div>}
            {commercialSelectionMissing && <p className="text-[11px] text-red-300">You need to indicate if your content promotes yourself, a third party, or both.</p>}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-800 bg-[#18181c] p-4"><input type="checkbox" checked={isAigc} onChange={(event) => setIsAigc(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#FE2C55]" /><span><span className="block text-xs font-bold">Nội dung do AI tạo</span><span className="mt-1 block text-[11px] text-slate-400">Bật nếu video được tạo hoặc chỉnh sửa đáng kể bằng AI.</span></span></label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-[11px] leading-relaxed text-slate-300"><input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#FE2C55]" /><span><ShieldCheck className="mr-1 inline h-4 w-4 text-cyan-300" />Tôi xác nhận áp dụng các lựa chọn trên cho toàn bộ {slots.length} video và đồng ý điều khoản TikTok. Lựa chọn quyền đăng sẽ được nhớ cho lần duyệt nhóm sau.</span></label>

          <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4"><span className="flex items-center gap-1.5 text-xs text-slate-400">{canConfirm ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}{canConfirm ? 'Sẵn sàng duyệt theo lịch' : 'Hoàn tất các mục bắt buộc'}</span><div className="flex gap-2"><button type="button" onClick={onClose} disabled={isApproving} className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold disabled:opacity-50">Hủy</button><button type="submit" disabled={!canConfirm} className="flex items-center gap-2 rounded-xl bg-[#FE2C55] px-6 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">{isApproving ? <><Loader2 className="h-4 w-4 animate-spin" />Đang duyệt...</> : `Duyệt ${slots.length} video`}</button></div></div>
        </form>
      </div>
    </div>
  );
}
