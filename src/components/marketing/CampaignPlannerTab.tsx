import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Facebook, Loader2, Pause, Play, Sparkles, XCircle } from 'lucide-react';
import { socialIntegrationService, SocialIntegration } from '../../services/socialIntegrationService';
import { CampaignStatus, marketingCampaignService, MarketingCampaignSummary } from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';
import CustomTimePicker from '../common/CustomTimePicker';

interface CampaignPlannerTabProps {
  userProfile?: {
    uid?: string;
    id?: string;
    facebookIntegration?: {
      isConnected?: boolean;
      pageId?: string;
      pageName?: string;
    };
  } | null;
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

export default function CampaignPlannerTab({ userProfile }: CampaignPlannerTabProps) {
  const today = useMemo(() => toDateInput(new Date()), []);
  const nextWeek = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 6);
    return toDateInput(date);
  }, []);
  const [prompt, setPrompt] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextWeek);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [postingTimes, setPostingTimes] = useState(['09:00']);
  const [integrations, setIntegrations] = useState<SocialIntegration[]>([]);
  const [integrationId, setIntegrationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaigns, setCampaigns] = useState<MarketingCampaignSummary[]>([]);
  const [candidateCount, setCandidateCount] = useState(3);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      setCampaigns(await marketingCampaignService.list());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải danh sách chiến dịch.');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    void socialIntegrationService.getIntegrations('Facebook').then((items) => {
      const connected = items.filter((item) => item.isConnected);
      setIntegrations(connected);
      setIntegrationId(connected[0]?._id || '');
    }).catch(() => setIntegrations([]));
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const dayCount = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [startDate, endDate]);
  const totalPosts = dayCount * postsPerDay;

  const changePostsPerDay = (value: number) => {
    setPostsPerDay(value);
    setPostingTimes((current) => Array.from({ length: value }, (_, index) => current[index] || `${String(9 + index * 3).padStart(2, '0')}:00`));
  };

  const handleCreateCampaign = async () => {
    if (!prompt.trim()) return toast.warning('Vui lòng nhập mục tiêu hoặc brief chiến dịch.');
    if (!dayCount || totalPosts > 60) return toast.warning('Chiến dịch phải có ngày hợp lệ và tối đa 60 bài.');
    const hasPersonalFacebook = Boolean(userProfile?.facebookIntegration?.isConnected && userProfile?.facebookIntegration?.pageId);
    if (!integrationId && !hasPersonalFacebook) {
      return toast.warning('Vui lòng kết nối một Facebook Page trước khi tạo lịch tự động.');
    }

    setLoading(true);
    try {
      const result = await marketingCampaignService.create({
        sourceBrief: prompt.trim(),
        startDate,
        endDate,
        postsPerDay,
        postingTimes,
        timezone: 'Asia/Bangkok',
        platforms: ['Facebook'],
        integrationIds: integrationId ? { Facebook: integrationId } : {},
        candidateCount,
        mediaPolicy: 'auto',
      });
      setCampaigns((current) => [result.campaign, ...current]);
      setPrompt('');
      toast.success(`Đã khởi chạy chiến dịch “${result.campaign.title}” với ${result.campaign.statistics.totalSlots} slot.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo chiến dịch tự động.');
    } finally {
      setLoading(false);
    }
  };

  const handleLifecycle = async (campaign: MarketingCampaignSummary, action: 'pause' | 'resume' | 'cancel') => {
    try {
      const updated = await marketingCampaignService.lifecycle(campaign._id, action);
      setCampaigns((current) => current.map((item) => item._id === updated._id ? updated : item));
      toast.success(action === 'pause' ? 'Đã tạm dừng chiến dịch.' : action === 'resume' ? 'Đã tiếp tục chiến dịch.' : 'Đã hủy chiến dịch.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật chiến dịch.');
    }
  };

  const statusLabel: Record<CampaignStatus, string> = {
    draft: 'Bản nháp', active: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn thành', cancelled: 'Đã hủy', failed: 'Có lỗi',
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Sparkles size={20} /></div>
          <div>
            <h2 className="text-base font-extrabold text-slate-850">Tạo chiến dịch tự động từ một prompt</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">AI viết nội dung cho từng ngày, lưu thành bài duyệt và đăng ký lịch tự động lên Facebook.</p>
          </div>
        </div>

        <label className="mb-2 block text-xs font-bold text-slate-700">Mục tiêu và brief chiến dịch</label>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={7}
          placeholder="Ví dụ: Tạo chiến dịch 7 ngày ra mắt sản phẩm mới, tập trung vào khách hàng 25–35 tuổi, giọng văn gần gũi, mục tiêu tăng inbox..."
          className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">Ngày bắt đầu
            <input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          <label className="text-xs font-bold text-slate-700">Ngày kết thúc
            <input type="date" min={startDate || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold text-slate-700">Số bài mỗi ngày</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => changePostsPerDay(value)} className={`h-9 w-10 rounded-lg border text-xs font-bold ${postsPerDay === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{value}</button>)}
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold text-slate-700">Số phương án AI cho mỗi slot</label>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setCandidateCount(value)} className={`h-9 min-w-10 rounded-lg border px-3 text-xs font-bold ${candidateCount === value ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{value}</button>)}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">Các phương án sẽ được sinh gần giờ đăng; hệ thống chấm điểm và chọn bản tốt nhất.</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {postingTimes.map((time, index) => (
            <div key={index} className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-600">Giờ bài {index + 1}</span>
              <CustomTimePicker
                value={time}
                onChange={(newTime) =>
                  setPostingTimes((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? newTime : item))
                  )
                }
              />
            </div>
          ))}
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold text-slate-700">Facebook Page nhận lịch đăng</label>
          <select value={integrationId} onChange={(event) => setIntegrationId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            {userProfile?.facebookIntegration?.isConnected && <option value="">{userProfile.facebookIntegration.pageName || 'Facebook Page cá nhân đã kết nối'}</option>}
            {integrations.map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
            {!integrations.length && !userProfile?.facebookIntegration?.isConnected && <option value="">Chưa có Facebook Page được kết nối</option>}
          </select>
        </div>

        <button type="button" onClick={handleCreateCampaign} disabled={loading || !prompt.trim() || !dayCount || totalPosts > 60} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {loading ? 'AI đang lập chiến lược và tạo slot...' : `Khởi chạy chiến dịch ${totalPosts || 0} slot`}
        </button>
      </section>

      <aside className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
        <div className="flex items-center gap-2 text-indigo-700"><CalendarClock size={19} /><h3 className="text-sm font-extrabold">Tóm tắt lịch chạy</h3></div>
        <div className="mt-5 space-y-3 text-xs text-slate-600">
          <div className="rounded-xl border border-white bg-white p-3"><b className="block text-slate-800">Thời gian</b><span>{dayCount || 0} ngày · {startDate} → {endDate}</span></div>
          <div className="rounded-xl border border-white bg-white p-3"><b className="block text-slate-800">Sản lượng</b><span>{postsPerDay} bài/ngày · tổng {totalPosts || 0} bài</span></div>
          <div className="rounded-xl border border-white bg-white p-3"><b className="mb-1 flex items-center gap-1 text-slate-800"><Clock3 size={13} /> Khung giờ</b><span>{postingTimes.join(', ')}</span></div>
          <div className="rounded-xl border border-white bg-white p-3"><b className="mb-1 flex items-center gap-1 text-slate-800"><Facebook size={13} /> Nền tảng</b><span>Facebook</span></div>
        </div>
        {totalPosts > 60 && <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600">Tối đa 60 bài mỗi chiến dịch. Hãy giảm số ngày hoặc số bài/ngày.</p>}
        <p className="mt-5 text-[11px] leading-relaxed text-slate-500">Bước này chỉ lập chiến lược và lịch slot. Nội dung hoàn chỉnh sẽ được worker tạo gần giờ đăng, sau đó chấm điểm và chọn phương án tốt nhất.</p>
      </aside>

      <section className="xl:col-span-3 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div><h3 className="text-sm font-extrabold text-slate-800">Chiến dịch tự động</h3><p className="mt-1 text-xs text-slate-500">Trạng thái được lưu trên server và tiếp tục chạy khi đóng trình duyệt.</p></div>
          {loadingCampaigns && <Loader2 size={17} className="animate-spin text-indigo-600" />}
        </div>
        {!loadingCampaigns && campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">Chưa có chiến dịch nào.</div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const completed = campaign.statistics.publishedSlots + campaign.statistics.failedSlots;
              const progress = campaign.statistics.totalSlots > 0 ? Math.round(completed / campaign.statistics.totalSlots * 100) : 0;
              return <div key={campaign._id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="flex items-center gap-2"><h4 className="text-sm font-bold text-slate-800">{campaign.title}</h4><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${campaign.status === 'active' ? 'bg-green-50 text-green-700' : campaign.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[campaign.status]}</span></div><p className="mt-1 text-[11px] text-slate-500">{campaign.startDate} → {campaign.endDate} · {campaign.statistics.totalSlots} slot · {campaign.candidateCount} phương án/slot</p></div>
                  <div className="flex gap-2">
                    {campaign.status === 'active' && <button type="button" onClick={() => handleLifecycle(campaign, 'pause')} className="flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-[10px] font-bold text-amber-700"><Pause size={12} /> Tạm dừng</button>}
                    {campaign.status === 'paused' && <button type="button" onClick={() => handleLifecycle(campaign, 'resume')} className="flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1.5 text-[10px] font-bold text-green-700"><Play size={12} /> Tiếp tục</button>}
                    {['active', 'paused', 'failed', 'draft'].includes(campaign.status) && <button type="button" onClick={() => handleLifecycle(campaign, 'cancel')} className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-bold text-red-600"><XCircle size={12} /> Hủy</button>}
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div>
                <div className="mt-1.5 flex justify-between text-[10px] text-slate-400"><span>Đã đăng {campaign.statistics.publishedSlots}</span><span>{progress}%</span></div>
              </div>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
