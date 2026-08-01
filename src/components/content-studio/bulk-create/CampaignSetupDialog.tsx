import { ArrowLeft, LoaderCircle, Search, X } from 'lucide-react';
import type { CampaignAssetOrderData, MarketingCampaignSummary } from '../../../services/marketingCampaignService';

export type CampaignSetupStep = 'target' | 'select_campaign' | 'confirm_campaign';

type Props = {
  open: boolean;
  step: CampaignSetupStep;
  search: string;
  campaigns: MarketingCampaignSummary[];
  selectedCampaign?: MarketingCampaignSummary;
  selectedCampaignId: string;
  campaignContext: CampaignAssetOrderData | null;
  loadingCampaigns: boolean;
  loadingCampaignOrders: boolean;
  availableCampaignSlotCount: number;
  onSearch: (value: string) => void;
  onStep: (step: CampaignSetupStep) => void;
  onChooseStandalone: () => void;
  onChooseCampaign: () => void;
  onSelectCampaign: (campaignId: string) => void;
  onConfirmCampaign: () => void;
};

export function CampaignSetupDialog(props: Props) {
  if (!props.open) return null;
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={props.onChooseStandalone} className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="Đóng và thiết kế tự do" aria-label="Đóng và thiết kế tự do">
          <X className="h-5 w-5" />
        </button>

        {props.step === 'target' && <>
          <p className="text-lg font-extrabold text-slate-900">Bạn muốn thiết kế cho đâu?</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">Chọn Campaign để ảnh tạo xong tự xuất hiện đúng trong lịch nội dung.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={props.onChooseStandalone} className="rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-slate-400">
              <span className="block text-sm font-extrabold text-slate-800">Thiết kế tự do</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">Tạo ảnh độc lập, không gắn vào Campaign.</span>
            </button>
            <button type="button" onClick={props.onChooseCampaign} className="rounded-2xl border-2 border-indigo-200 bg-white p-4 text-left transition hover:border-indigo-400">
              <span className="block text-sm font-extrabold text-indigo-800">Cho Campaign</span>
              <span className="mt-1 block text-xs leading-5 text-indigo-700">Map từng ảnh vào bài Facebook của chiến dịch.</span>
            </button>
          </div>
        </>}

        {props.step === 'select_campaign' && <>
          <button type="button" onClick={() => props.onStep('target')} className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-500 hover:text-indigo-700"><ArrowLeft className="h-4 w-4" /> Quay lại</button>
          <p className="mt-3 text-lg font-extrabold text-slate-900">Chọn Campaign đang chạy</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">Chỉ hiển thị Campaign Facebook còn hoạt động.</p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input autoFocus value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Tìm chiến dịch..." className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
            {props.loadingCampaigns && <LoaderCircle className="h-4 w-4 animate-spin text-indigo-600" />}
          </div>
          <div className="mt-3 max-h-[310px] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {props.campaigns.map((campaign) => <button key={campaign._id} type="button" onClick={() => props.onSelectCampaign(campaign._id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-black text-indigo-700">{campaign.statistics.totalSlots}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-slate-800">{campaign.title}</span><span className="mt-0.5 block text-xs font-semibold text-slate-500">bài trong Campaign</span></span>
            </button>)}
            {!props.loadingCampaigns && props.campaigns.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-500">Không có Campaign đang chạy phù hợp.</p>}
          </div>
        </>}

        {props.step === 'confirm_campaign' && <>
          <button type="button" onClick={() => { props.onSearch(''); props.onStep('select_campaign'); }} className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-500 hover:text-indigo-700"><ArrowLeft className="h-4 w-4" /> Đổi Campaign</button>
          <p className="mt-3 text-lg font-extrabold text-slate-900">Xác nhận Campaign nhận ảnh</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">Sau khi tạo xong, ảnh sẽ tự hiện trong Campaign này để bạn xem trước và gắn vào bài.</p>
          <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="truncate text-base font-extrabold text-indigo-950">{props.selectedCampaign?.title || 'Đang tải Campaign...'}</p>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"><span className="text-xs font-semibold text-slate-600">Bài Facebook có thể nhận ảnh</span><span className="text-lg font-black text-indigo-700">{props.loadingCampaignOrders ? '...' : props.availableCampaignSlotCount}</span></div>
          </div>
          {!props.loadingCampaignOrders && props.campaignContext && props.availableCampaignSlotCount === 0 && <p className="mt-3 text-xs font-semibold leading-5 text-amber-700">Campaign này hiện không còn bài Facebook nào có thể nhận ảnh.</p>}
          <button type="button" disabled={!props.selectedCampaignId || !props.campaignContext || props.loadingCampaignOrders || props.availableCampaignSlotCount === 0} onClick={props.onConfirmCampaign} className="mt-5 h-11 w-full rounded-xl bg-indigo-600 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">Tiếp tục chọn dữ liệu</button>
        </>}
      </div>
    </div>
  );
}
