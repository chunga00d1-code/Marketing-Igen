import React from 'react';
import { ChevronRight, Pause, Play, XCircle } from 'lucide-react';
import { CampaignStatus, MarketingCampaignSummary } from '../../services/marketingCampaignService';

interface CampaignItemProps {
  campaign: MarketingCampaignSummary;
  statusLabel: Record<CampaignStatus, string>;
  onOpenDetail: (campaignId: string) => void;
  onLifecycle: (campaign: MarketingCampaignSummary, action: 'pause' | 'resume' | 'cancel') => void;
}

export default function CampaignItem({
  campaign,
  statusLabel,
  onOpenDetail,
  onLifecycle,
}: CampaignItemProps) {
  const completed = campaign.statistics.publishedSlots + campaign.statistics.failedSlots;
  const progress = campaign.statistics.totalSlots > 0 ? Math.round((completed / campaign.statistics.totalSlots) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 p-4 hover:border-slate-350 hover:shadow-2xs transition-all">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="cursor-pointer group flex-1" onClick={() => onOpenDetail(campaign._id)}>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-850 group-hover:text-indigo-600 transition flex items-center gap-1 select-none">
              {campaign.title}
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </h4>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${campaign.status === 'active' ? 'bg-green-50 text-green-700' : campaign.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-660 bg-slate-100 text-slate-600'}`}>{statusLabel[campaign.status]}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-550">{campaign.startDate} → {campaign.endDate} · {campaign.statistics.totalSlots} slot · {campaign.candidateCount} phương án/slot</p>
        </div>
        <div className="flex gap-2">
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
