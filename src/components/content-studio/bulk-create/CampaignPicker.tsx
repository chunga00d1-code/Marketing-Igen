import { Check, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface CampaignOption {
  _id: string;
  title: string;
  statistics: { totalSlots: number };
}

interface CampaignPickerProps {
  campaigns: CampaignOption[];
  selectedCampaignId: string;
  loading?: boolean;
  emptyLabel?: string;
  onLoad: () => void;
  onSelect: (campaignId: string) => void;
}

export function CampaignPicker({
  campaigns,
  selectedCampaignId,
  loading = false,
  emptyLabel = 'Chọn chiến dịch Facebook',
  onLoad,
  onSelect,
}: CampaignPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedCampaign = campaigns.find((campaign) => campaign._id === selectedCampaignId);
  const matchingCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalizedQuery) return campaigns;
    return campaigns.filter((campaign) => campaign.title.toLocaleLowerCase('vi-VN').includes(normalizedQuery));
  }, [campaigns, query]);

  const chooseCampaign = (campaignId: string) => {
    onSelect(campaignId);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={loading}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white px-3 text-left shadow-sm transition hover:border-indigo-400 focus:border-indigo-500 focus:outline-none disabled:cursor-wait disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-800">{selectedCampaign?.title || emptyLabel}</span>
          {selectedCampaign && <span className="block text-[10px] font-semibold text-slate-500">{selectedCampaign.statistics.totalSlots} bài trong chiến dịch</span>}
        </span>
        <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-extrabold text-indigo-700">Đổi</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[90] overflow-hidden rounded-2xl border border-indigo-200 bg-white p-2 shadow-xl shadow-slate-900/15">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm chiến dịch..."
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={onLoad}
              disabled={loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              title="Tải lại danh sách chiến dịch"
            >
              {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto overscroll-contain pr-1">
            {matchingCampaigns.map((campaign) => {
              const selected = campaign._id === selectedCampaignId;
              return (
                <button
                  key={campaign._id}
                  type="button"
                  onClick={() => chooseCampaign(campaign._id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-indigo-50'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{campaign.title}</span>
                    <span className={`block text-[10px] font-semibold ${selected ? 'text-indigo-100' : 'text-slate-400'}`}>{campaign.statistics.totalSlots} bài</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
            {!loading && matchingCampaigns.length === 0 && (
              <p className="px-3 py-4 text-center text-xs font-semibold text-slate-500">Không tìm thấy chiến dịch phù hợp.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
