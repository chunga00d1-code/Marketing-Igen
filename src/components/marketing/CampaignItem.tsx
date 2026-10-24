import React from 'react';
import { ChevronRight, MessageCircle, Pause, Play, Settings2, XCircle } from 'lucide-react';
import { CampaignStatus, MarketingCampaignSummary } from '../../services/marketingCampaignService';

interface CampaignItemProps {
  campaign: MarketingCampaignSummary;
  statusLabel: Record<CampaignStatus, string>;
  onOpenDetail: (campaignId: string) => void;
  onOpenChat?: (campaignId: string) => void;
  onLifecycle: (campaign: MarketingCampaignSummary, action: 'pause' | 'resume' | 'cancel') => void;
  compact?: boolean;
  selected?: boolean;
}

export default function CampaignItem({
  campaign,
  statusLabel,
  onOpenDetail,
  onOpenChat,
  onLifecycle,
  compact = false,
  selected = false,
}: CampaignItemProps) {
  const completed = campaign.statistics.publishedSlots + campaign.statistics.failedSlots;
  const progress = campaign.statistics.totalSlots > 0 ? Math.round((completed / campaign.statistics.totalSlots) * 100) : 0;

  if (compact) {
    return (
      <div className={`group rounded-xl border p-2 transition ${selected ? 'border-blue-200 bg-blue-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
        <button type="button" onClick={() => (onOpenChat || onOpenDetail)(campaign._id)} className="w-full text-left">
          <span className="block truncate text-xs font-semibold text-slate-800" title={campaign.title}>{campaign.title}</span>
          <span className="mt-1 block text-[10px] text-slate-500">{statusLabel[campaign.status]} · {campaign.statistics.totalSlots} bài</span>
        </button>
        <div className="mt-2 flex items-center gap-1 border-t border-slate-200/70 pt-1.5">
          <button type="button" onClick={() => onOpenDetail(campaign._id)} title="Xem chi tiết chiến dịch" className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-blue-600"><Settings2 size={14} /></button>
          {campaign.status === 'active' && <button type="button" onClick={() => onLifecycle(campaign, 'pause')} title="Tạm dừng" className="rounded-md p-1 text-amber-700 hover:bg-white"><Pause size={14} /></button>}
          {campaign.status === 'paused' && <button type="button" onClick={() => onLifecycle(campaign, 'resume')} title="Tiếp tục" className="rounded-md p-1 text-green-700 hover:bg-white"><Play size={14} /></button>}
          {['active', 'paused', 'failed', 'draft'].includes(campaign.status) && <button type="button" onClick={() => onLifecycle(campaign, 'cancel')} title="Hủy chiến dịch" className="ml-auto rounded-md p-1 text-red-600 hover:bg-white"><XCircle size={14} /></button>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 hover:border-slate-350 hover:shadow-2xs transition-all">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="cursor-pointer group flex-1" onClick={() => onOpenDetail(campaign._id)}>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-850 group-hover:text-indigo-600 transition flex items-center gap-1 select-none">
              {campaign.title}
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </h4>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${campaign.campaignType === 'single' ? 'bg-indigo-50 text-indigo-700' : 'bg-cyan-50 text-cyan-700'}`}>
              {campaign.campaignType === 'single' ? 'Bài đăng nhanh' : 'Chiến dịch'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${campaign.status === 'active' ? 'bg-green-50 text-green-700' : campaign.status === 'paused' ? 'bg-amber-50 text-amber-700' : campaign.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-extrabold' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[campaign.status] || campaign.status}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-550">{campaign.campaignType === 'single'
            ? '1 bài · Bắt đầu sau khi xác nhận'
            : `${campaign.startDate} → ${campaign.endDate} · ${campaign.statistics.totalSlots} slot · ${campaign.candidateCount} phương án/slot`}</p>
        </div>
        <div className="flex gap-2">
          {onOpenChat && <button type="button" onClick={() => onOpenChat(campaign._id)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50"><MessageCircle size={12} /> Hội thoại</button>}
          {campaign.status === 'draft' && <button type="button" onClick={() => onOpenDetail(campaign._id)} className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 transition hover:bg-indigo-100 active:scale-98"><Settings2 size={12} /> Thiết lập & chạy</button>}
          {campaign.status === 'active' && <button type="button" onClick={() => onLifecycle(campaign, 'pause')} className="flex items-center gap-1 rounded-lg border border-amber-255 hover:bg-amber-50/50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 transition active:scale-98"><Pause size={12} /> Tạm dừng</button>}
          {campaign.status === 'paused' && <button type="button" onClick={() => onLifecycle(campaign, 'resume')} className="flex items-center gap-1 rounded-lg border border-green-255 hover:bg-green-50/50 px-2.5 py-1.5 text-[10px] font-bold text-green-700 transition active:scale-98"><Play size={12} /> Tiếp tục</button>}
          {['active', 'paused', 'failed', 'draft'].includes(campaign.status) && <button type="button" onClick={() => onLifecycle(campaign, 'cancel')} className="flex items-center gap-1 rounded-lg border border-red-255 hover:bg-red-50/50 px-2.5 py-1.5 text-[10px] font-bold text-red-600 transition active:scale-98"><XCircle size={12} /> Hủy</button>}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400"><span>Đã đăng {campaign.statistics.publishedSlots}</span><span>{progress}%</span></div>
    </div>
  );
}
