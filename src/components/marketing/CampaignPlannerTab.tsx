import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Facebook, Loader2, Sparkles } from 'lucide-react';
import { socialIntegrationService, SocialIntegration } from '../../services/socialIntegrationService';
import { CampaignStatus, marketingCampaignService, MarketingCampaignSummary } from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';
import CustomTimePicker from '../common/CustomTimePicker';
import CampaignPromptBox from './CampaignPromptBox';
import CampaignDetailModal, { CampaignSlot } from './CampaignDetailModal';
import CampaignItem from './CampaignItem';

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

  // File Upload states
  const [uploadedDocName, setUploadedDocName] = useState('');
  const [uploadedDocText, setUploadedDocText] = useState('');
  const [uploadedImageBase64, setUploadedImageBase64] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterStatus, setFilterStatus] = useState<'all' | CampaignStatus>('all');

  // Detail Modal states
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [campaignDetail, setCampaignDetail] = useState<{ campaign: MarketingCampaignSummary; slots: CampaignSlot[] } | null>(null);

  const filteredCampaigns = useMemo(() => {
    if (filterStatus === 'all') return campaigns;
    return campaigns.filter((item) => item.status === filterStatus);
  }, [campaigns, filterStatus]);

  // Polling for campaign list
  useEffect(() => {
    const hasActiveCampaign = campaigns.some(c => c.status === 'active');
    if (!hasActiveCampaign) return;

    const interval = setInterval(() => {
      if (document.hidden) return; // Skip if tab is in background
      void loadCampaigns(currentPage);
    }, 120000); // 2 minutes

    return () => clearInterval(interval);
  }, [currentPage, campaigns]);

  // Polling for campaign detail modal
  useEffect(() => {
    if (!selectedCampaignId || !campaignDetail || campaignDetail.campaign.status !== 'active') return;

    const interval = setInterval(() => {
      if (document.hidden) return; // Skip if tab is in background
      marketingCampaignService.detail(selectedCampaignId)
        .then((res) => {
          setCampaignDetail({
            campaign: res.campaign,
            slots: res.slots as CampaignSlot[],
          });
        })
        .catch(console.error);
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [selectedCampaignId, campaignDetail]);

  const loadCampaigns = async (page = 1) => {
    setLoadingCampaigns(true);
    try {
      const result = await marketingCampaignService.list(page, 10);
      setCampaigns(result.campaigns);
      setTotalPages(result.pagination.totalPages);
      setCurrentPage(result.pagination.page);
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
    void loadCampaigns(1);
  }, []);

  const loadScript = (src: string, globalVar: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const windowRecord = window as unknown as Record<string, unknown>;
      if (windowRecord[globalVar]) {
        resolve(windowRecord[globalVar]);
        return;
      }
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(windowRecord[globalVar]));
        existingScript.addEventListener('error', (e) => reject(e));
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(windowRecord[globalVar]);
      script.onerror = (e) => reject(e);
      document.body.appendChild(script);
    });
  };

  const processFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.warning('Dung lượng file không được vượt quá 10MB!');
      return;
    }

    setUploadedDocName(file.name);
    setLoadingDoc(true);
    setUploadedDocText('');
    setUploadedImageBase64('');

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const isImage = file.type.startsWith('image/');

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64Data = evt.target?.result as string;
        setUploadedImageBase64(base64Data);
        setLoadingDoc(false);
        toast.success('Đã tải hình ảnh lên thành công!');
      };
      reader.onerror = () => {
        setLoadingDoc(false);
        toast.error('Lỗi khi đọc tệp tin hình ảnh.');
      };
      reader.readAsDataURL(file);
    } else if (fileExt === 'txt' || fileExt === 'md') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setUploadedDocText(text);
        setLoadingDoc(false);
        toast.success('Đã trích xuất nội dung văn bản thành công!');
      };
      reader.onerror = () => {
        setLoadingDoc(false);
        toast.error('Lỗi khi đọc file văn bản.');
      };
      reader.readAsText(file);
    } else if (fileExt === 'pdf') {
      try {
        const pdfjsObj = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js', 'pdfjsLib');
        const pdfjs = pdfjsObj as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (args: { data: Uint8Array }) => {
            promise: Promise<{
              numPages: number;
              getPage: (num: number) => Promise<{
                getTextContent: () => Promise<{
                  items: Array<{ str: string }>;
                }>;
              }>;
            }>;
          };
        };
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        let extractedText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(' ');
          extractedText += pageText + '\n';
        }
        if (!extractedText.trim()) {
          throw new Error('Không thể trích xuất văn bản từ PDF (tài liệu rỗng hoặc dạng scan ảnh).');
        }
        setUploadedDocText(extractedText);
        setLoadingDoc(false);
        toast.success(`Đã trích xuất tài liệu PDF (${pdf.numPages} trang) thành công!`);
      } catch (err: unknown) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Lỗi xử lý file PDF.');
      }
    } else if (fileExt === 'docx') {
      try {
        const mammothObj = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth');
        const mammoth = mammothObj as {
          extractRawText: (args: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
        };
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const extractedText = result.value;
        if (!extractedText.trim()) {
          throw new Error('Tài liệu Word trống hoặc không có văn bản.');
        }
        setUploadedDocText(extractedText);
        setLoadingDoc(false);
        toast.success('Đã trích xuất tài liệu Word thành công!');
      } catch (err: unknown) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Lỗi xử lý file Word.');
      }
    } else {
      setLoadingDoc(false);
      toast.error('Định dạng file không được hỗ trợ. Vui lòng tải hình ảnh, .txt, .md, .pdf hoặc .docx');
    }
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleRemoveDocument = () => {
    setUploadedDocName('');
    setUploadedDocText('');
    setUploadedImageBase64('');
    toast.success('Đã gỡ tập tin đính kèm.');
  };

  const buildSourceBriefContext = (baseText?: string) => {
    const primaryText = String(baseText || prompt || '').trim();
    const parts = [primaryText];

    if (uploadedDocText) {
      parts.push(
        `TÀI LIỆU ĐÍNH KÈM:\nTên tài liệu: ${uploadedDocName || 'Tài liệu tải lên'}\nNội dung tài liệu:\n${uploadedDocText}`
      );
    }

    return parts.filter(Boolean).join('\n\n').trim();
  };

  // Load campaign details on selection
  useEffect(() => {
    if (!selectedCampaignId) {
      setCampaignDetail(null);
      return;
    }
    let active = true;
    setLoadingDetail(true);
    marketingCampaignService.detail(selectedCampaignId)
      .then((res) => {
        if (active) {
          setCampaignDetail({
            campaign: res.campaign,
            slots: res.slots as CampaignSlot[],
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : 'Không thể tải chi tiết chiến dịch.');
          setSelectedCampaignId(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingDetail(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

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
      const brief = buildSourceBriefContext();
      const imagesParam = uploadedImageBase64 ? [uploadedImageBase64] : undefined;

      const result = await marketingCampaignService.create({
        sourceBrief: brief,
        startDate,
        endDate,
        postsPerDay,
        postingTimes,
        timezone: 'Asia/Bangkok',
        platforms: ['Facebook'],
        integrationIds: integrationId ? { Facebook: integrationId } : {},
        candidateCount,
        mediaPolicy: 'auto',
        images: imagesParam,
      });
      setCampaigns((current) => [result.campaign, ...current]);
      setPrompt('');
      setUploadedDocName('');
      setUploadedDocText('');
      setUploadedImageBase64('');
      toast.success(`Đã khởi chạy chiến dịch “${result.campaign.title}” với ${result.campaign.statistics.totalSlots} slot.`);
      void loadCampaigns(1);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo chiến dịch tự động.');
    } finally {
      setLoading(false);
    }
  };

  const handleLifecycle = async (campaign: MarketingCampaignSummary, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel') {
      const isConfirmed = window.confirm(
        `Bạn có chắc chắn muốn hủy chiến dịch "${campaign.title}" không? Tất cả các lịch bài đăng dự kiến chưa hoàn thành sẽ bị hủy bỏ.`
      );
      if (!isConfirmed) return;
    }
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
        <CampaignPromptBox
          prompt={prompt}
          setPrompt={setPrompt}
          uploadedDocName={uploadedDocName}
          uploadedImageBase64={uploadedImageBase64}
          loadingDoc={loadingDoc}
          isDragging={isDragging}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          handleDocumentUpload={handleDocumentUpload}
          handleRemoveDocument={handleRemoveDocument}
          onClearAll={() => {
            setPrompt('');
            setUploadedDocName('');
            setUploadedDocText('');
            setUploadedImageBase64('');
          }}
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-850">Chiến dịch tự động</h3>
            <p className="mt-1 text-xs text-slate-500 font-medium">Trạng thái được lưu trên server và tiếp tục chạy khi đóng trình duyệt.</p>
          </div>
          <div className="flex items-center gap-2">
            {loadingCampaigns && <Loader2 size={17} className="animate-spin text-indigo-600" />}
          </div>
        </div>

        {/* Filter Status Tabs */}
        {campaigns.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-100 pb-3 select-none">
            {(
              [
                { value: 'all', label: 'Tất cả' },
                { value: 'active', label: 'Đang chạy' },
                { value: 'paused', label: 'Tạm dừng' },
                { value: 'completed', label: 'Hoàn thành' },
                { value: 'cancelled', label: 'Đã hủy' },
                { value: 'failed', label: 'Có lỗi' },
              ] as const
            ).map((tab) => {
              return (
                <button
                  type="button"
                  key={tab.value}
                  onClick={() => setFilterStatus(tab.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    filterStatus === tab.value
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/40'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {!loadingCampaigns && campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-10 text-center bg-slate-50/20">
            <div className="rounded-full bg-indigo-50 p-4 text-indigo-600 mb-4 shadow-xs border border-indigo-100/50">
              <Sparkles size={28} className="animate-pulse" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">Chưa có chiến dịch Marketing nào</h4>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-6 font-medium">
              Lập lịch bài đăng tự động bằng AI sẽ giúp bạn tiết kiệm thời gian và tiếp cận khách hàng liên tục. Hãy nhập mục tiêu chiến dịch của bạn ở bên trái để bắt đầu!
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-md bg-white border border-slate-100 p-3.5 rounded-xl text-[11px] text-slate-500 font-sans text-left leading-relaxed">
              <div className="flex gap-2">
                <span className="text-indigo-600 font-bold select-none">💡</span>
                <span><b>Gợi ý:</b> Nhập prompt cụ thể (sản phẩm, giọng điệu, đối tượng khách hàng) hoặc tải lên file tài liệu/ảnh hỗ trợ để AI lập lịch chính xác nhất.</span>
              </div>
            </div>
          </div>
        ) : !loadingCampaigns && filteredCampaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
            Không tìm thấy chiến dịch nào với trạng thái này.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCampaigns.map((campaign) => (
              <CampaignItem
                key={campaign._id}
                campaign={campaign}
                statusLabel={statusLabel}
                onOpenDetail={(campaignId) => setSelectedCampaignId(campaignId)}
                onLifecycle={handleLifecycle}
              />
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-slate-100 select-none">
                <button
                  type="button"
                  onClick={() => void loadCampaigns(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition cursor-pointer"
                >
                  Trang trước
                </button>
                <span className="text-xs text-slate-500 font-medium">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => void loadCampaigns(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition cursor-pointer"
                >
                  Trang sau
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <CampaignDetailModal
        isOpen={Boolean(selectedCampaignId)}
        onClose={() => setSelectedCampaignId(null)}
        loadingDetail={loadingDetail}
        campaignDetail={campaignDetail}
        statusLabel={statusLabel}
        slotStatusColors={{
          planned: 'bg-slate-100 text-slate-700 border-slate-200',
          queued: 'bg-blue-50 text-blue-750 border-blue-200',
          generating: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
          scoring: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
          generating_media: 'bg-pink-50 text-pink-700 border-pink-200 animate-pulse',
          verifying: 'bg-cyan-50 text-cyan-700 border-cyan-200 animate-pulse',
          ready_to_publish: 'bg-teal-50 text-teal-750 border-teal-200',
          publishing: 'bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse',
          published: 'bg-green-50 text-green-700 border-green-200',
          failed: 'bg-red-50 text-red-750 border-red-200',
          cancelled: 'bg-slate-150 text-slate-500 border-slate-200',
          skipped: 'bg-gray-150 text-gray-500 border-gray-200',
          retrying: 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse',
          needs_attention: 'bg-amber-50 text-amber-700 border-amber-200',
        }}
        slotStatusLabel={{
          planned: 'Lên kế hoạch',
          queued: 'Trong hàng đợi',
          generating: 'Đang tạo bài viết...',
          scoring: 'Đang chấm điểm AI...',
          generating_media: 'Đang thiết kế ảnh...',
          verifying: 'Đang duyệt chất lượng...',
          ready_to_publish: 'Sẵn sàng đăng',
          publishing: 'Đang đăng...',
          published: 'Đã đăng thành công',
          failed: 'Thất bại',
          cancelled: 'Đã hủy',
          skipped: 'Đã bỏ qua',
          retrying: 'Đang thử lại...',
          needs_attention: 'Cần chú ý',
        }}
      />
    </div>
  );
}
