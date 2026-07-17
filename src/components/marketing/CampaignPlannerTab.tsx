import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Facebook, Loader2, Sparkles, FolderOpen, Globe, LucideIcon } from 'lucide-react';
import { socialIntegrationService, SocialIntegration } from '../../services/socialIntegrationService';
import { CampaignStatus, marketingCampaignService, MarketingCampaignSummary, DriveFileItem } from '../../services/marketingCampaignService';
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
  const [customSchedule, setCustomSchedule] = useState<Record<string, string[]>>({});
  const [showCustomSchedule, setShowCustomSchedule] = useState(false);
  const [customSchedulePage, setCustomSchedulePage] = useState(1);
  const [integrations, setIntegrations] = useState<SocialIntegration[]>([]);
  const [integrationId, setIntegrationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaigns, setCampaigns] = useState<MarketingCampaignSummary[]>([]);
  const qualityMode = 'premium';
  const [publishMode, setPublishMode] = useState<'auto' | 'manual'>('manual');
  const [imageMode, setImageMode] = useState<'ai' | 'real'>('ai');
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState('');
  const [drivePreviews, setDrivePreviews] = useState<DriveFileItem[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [apifySources, setApifySources] = useState<string[]>(['google']);

  const toggleApifySource = (source: string) => {
    setApifySources((prev) => {
      if (prev.includes(source)) {
        return prev.filter((s) => s !== source);
      } else {
        if (prev.length >= 3) {
          toast.warning('Chỉ được chọn tối đa 3 nguồn dữ liệu nghiên cứu.');
          return prev;
        }
        return [...prev, source];
      }
    });
  };

  // Cleanup customSchedule when date range changes
  useEffect(() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    setCustomSchedule((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
        return {};
      }

      const updated = { ...prev };
      let changed = false;
      for (const date of Object.keys(updated)) {
        const d = new Date(`${date}T00:00:00`);
        if (d < start || d > end) {
          delete updated[date];
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [startDate, endDate]);

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

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
    cancelText?: string;
    isDangerous?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

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

  const allDatesInRange = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];

    const dates: string[] = [];
    const temp = new Date(start);
    while (temp <= end) {
      dates.push(temp.toISOString().slice(0, 10));
      temp.setDate(temp.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  const dayCount = allDatesInRange.length;

  const totalPosts = useMemo(() => {
    let count = 0;
    for (const date of allDatesInRange) {
      const times = customSchedule[date] || postingTimes;
      count += times.length;
    }
    return count;
  }, [allDatesInRange, customSchedule, postingTimes]);

  // Reset customSchedule page when dates range length changes
  useEffect(() => {
    setCustomSchedulePage(1);
  }, [allDatesInRange.length]);

  const changePostsPerDay = (value: number) => {
    setPostsPerDay(value);
    setPostingTimes((current) => Array.from({ length: value }, (_, index) => current[index] || `${String(9 + index * 3).padStart(2, '0')}:00`));
  };

  const handlePreviewDrive = async () => {
    if (!googleDriveFolderUrl.trim()) {
      toast.warning('Vui lòng điền link thư mục Google Drive công khai trước.');
      return;
    }
    setLoadingPreviews(true);
    try {
      const files = await marketingCampaignService.previewDrive(googleDriveFolderUrl.trim());
      setDrivePreviews(files);
      if (files.length === 0) {
        toast.error('Không tìm thấy ảnh hoặc video nào trong thư mục Google Drive. Vui lòng kiểm tra quyền chia sẻ công khai.');
      } else {
        toast.success(`Đã quét thấy và kết nối thành công ${files.length} ảnh/video.`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể quét thư mục Google Drive. Vui lòng kiểm tra lại đường dẫn.');
    } finally {
      setLoadingPreviews(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!prompt.trim()) return toast.warning('Vui lòng nhập mục tiêu hoặc brief chiến dịch.');
    if (imageMode === 'real' && !googleDriveFolderUrl.trim()) return toast.warning('Vui lòng điền link thư mục Google Drive công khai.');
    if (!dayCount || totalPosts > 450) return toast.warning('Chiến dịch phải có ngày hợp lệ và tối đa 450 bài.');
    const hasPersonalFacebook = Boolean(userProfile?.facebookIntegration?.isConnected && userProfile?.facebookIntegration?.pageId);
    if (!integrationId && !hasPersonalFacebook) {
      return toast.warning('Vui lòng kết nối một Facebook Page trước khi tạo lịch tự động.');
    }

    setLoading(true);
    try {
      const brief = buildSourceBriefContext();
      const imagesParam = imageMode === 'real' ? undefined : (uploadedImageBase64 ? [uploadedImageBase64] : undefined);

      const result = await marketingCampaignService.create({
        sourceBrief: brief,
        startDate,
        endDate,
        postsPerDay,
        postingTimes,
        timezone: 'Asia/Bangkok',
        platforms: ['Facebook'],
        integrationIds: integrationId ? { Facebook: integrationId } : {},
        candidateCount: 1, // Single-Render Flow
        qualityMode,
        publishMode,
        imageMode,
        googleDriveFolderUrl: imageMode === 'real' ? googleDriveFolderUrl.trim() : undefined,
        mediaPolicy: 'auto',
        images: imagesParam,
        customSchedule: Object.keys(customSchedule).length > 0 ? customSchedule : undefined,
        apifySources: apifySources.length > 0 ? apifySources : undefined,
      });
      setCampaigns((current) => [result.campaign, ...current]);
      setPrompt('');
      setUploadedDocName('');
      setUploadedDocText('');
      setUploadedImageBase64('');
      setGoogleDriveFolderUrl('');
      setDrivePreviews([]);
      setImageMode('ai');
      setApifySources(['google']);
      setCustomSchedule({});
      setShowCustomSchedule(false);
      toast.success(`Đã khởi chạy chiến dịch “${result.campaign.title}” với ${result.campaign.statistics.totalSlots} slot.`);
      void loadCampaigns(1);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo chiến dịch.');
    } finally {
      setLoading(false);
    }
  };

  const executeLifecycle = async (campaign: MarketingCampaignSummary, action: 'pause' | 'resume' | 'cancel') => {
    try {
      const updated = await marketingCampaignService.lifecycle(campaign._id, action);
      setCampaigns((current) => current.map((item) => item._id === updated._id ? updated : item));
      toast.success(action === 'pause' ? 'Đã tạm dừng chiến dịch.' : action === 'resume' ? 'Đã tiếp tục chiến dịch.' : 'Đã hủy chiến dịch.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật chiến dịch.');
    }
  };

  const handleLifecycle = async (campaign: MarketingCampaignSummary, action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'cancel') {
      setConfirmConfig({
        isOpen: true,
        title: 'Hủy chiến dịch',
        message: `Bạn có chắc chắn muốn hủy chiến dịch "${campaign.title}" không? Tất cả các lịch bài đăng dự kiến chưa hoàn thành sẽ bị hủy bỏ.`,
        isDangerous: true,
        confirmText: 'Xác nhận hủy',
        cancelText: 'Quay lại',
        onConfirm: async () => {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          await executeLifecycle(campaign, action);
        }
      });
      return;
    }
    await executeLifecycle(campaign, action);
  };

  const statusLabel: Record<CampaignStatus, string> = {
    draft: 'Bản nháp', active: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn thành', cancelled: 'Đã hủy', failed: 'Có lỗi',
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600"><Sparkles size={16} /></div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-850">Tạo chiến dịch tự động</h2>
            <p className="mt-0.5 text-[10px] text-slate-400">AI tự động viết nội dung, tạo ảnh minh họa và chuẩn bị lịch đăng bài Facebook.</p>
          </div>
        </div>

        <div className="mt-3 mb-4">
          <label className="mb-1.5 block text-xs font-bold text-slate-700">Nguồn tư liệu & Hình ảnh</label>
          <div className="flex p-1 bg-slate-100 rounded-xl max-w-md">
            <button
              type="button"
              onClick={() => {
                setImageMode('ai');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-bold transition-all cursor-pointer ${imageMode === 'ai'
                  ? 'bg-white text-slate-850 shadow-xs'
                  : 'text-slate-500 hover:text-slate-850'
                }`}
            >
              <Sparkles size={13} className={imageMode === 'ai' ? 'text-indigo-600' : ''} />
              <span>Hình ảnh sinh từ AI</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setImageMode('real');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-bold transition-all cursor-pointer ${imageMode === 'real'
                  ? 'bg-white text-slate-850 shadow-xs'
                  : 'text-slate-500 hover:text-slate-850'
                }`}
            >
              <FolderOpen size={13} className={imageMode === 'real' ? 'text-indigo-600' : ''} />
              <span>Kho Ảnh thật (Drive)</span>
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            {imageMode === 'ai'
              ? 'AI tự nghiên cứu chủ đề, viết bài và vẽ ảnh minh họa phù hợp.'
              : 'Quét toàn bộ ảnh/video từ một thư mục Google Drive công khai.'}
          </p>
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

        {imageMode === 'real' && (
          <div className="mt-3.5 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Đường dẫn thư mục Google Drive công khai</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={googleDriveFolderUrl}
                  onChange={(e) => setGoogleDriveFolderUrl(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-850 placeholder:text-slate-450 focus:border-indigo-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handlePreviewDrive}
                  disabled={loadingPreviews || !googleDriveFolderUrl}
                  className="rounded-xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 transition-all shrink-0"
                >
                  {loadingPreviews ? (
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                  ) : (
                    <FolderOpen size={14} />
                  )}
                  <span>Quét ảnh</span>
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50/60 border border-amber-200/40 p-2.5 text-[10px] leading-relaxed text-amber-850 font-medium">
              <p className="font-bold mb-0.5">💡 Quy tắc đặt tên file trong thư mục Drive:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Đặt link Drive ở chế độ <strong className="text-amber-900 font-bold">"Bất kỳ ai có liên kết đều có thể xem"</strong>.</li>
                <li>Bài viết đơn: chứa số thứ tự bài (Ví dụ: <code className="bg-amber-100/50 px-1 rounded font-bold">1.jpg</code>, <code className="bg-amber-100/50 px-1 rounded font-bold">2.mp4</code>).</li>
                <li>Bài viết nhiều hình (Album): chứa số thứ tự và gạch dưới (Ví dụ: <code className="bg-amber-100/50 px-1 rounded font-bold">3_1.jpg</code>, <code className="bg-amber-100/50 px-1 rounded font-bold">3_2.png</code>).</li>
              </ul>
            </div>

            {drivePreviews.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Tư liệu đã quét ({drivePreviews.length} tệp)</span>
                  <button
                    type="button"
                    onClick={() => setDrivePreviews([])}
                    className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
                  >
                    Xóa xem trước
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
                  {drivePreviews.map((file) => {
                    const hasNumber = /\d+/.test(file.name);
                    return (
                      <div
                        key={file.id}
                        className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-white group shadow-xs ${hasNumber ? "border-slate-200" : "border-red-300 ring-1 ring-red-300"
                          }`}
                      >
                        {file.isVideo ? (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 text-white select-none">
                            <span className="text-[9px] font-bold uppercase text-red-500 font-mono">Video</span>
                            <span className="mt-0.5 max-w-full truncate px-1 text-[7px] text-slate-400">{file.name}</span>
                          </div>
                        ) : (
                          <img
                            src={file.directUrl}
                            alt={file.name}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                        {!hasNumber && (
                          <div
                            className="absolute top-0.5 right-0.5 h-4.5 w-4.5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shadow-sm select-none"
                            title="Tên file thiếu số thứ tự (Ví dụ: 1.jpg, 2_1.jpg)"
                          >
                            ⚠️
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-0.5 justify-center">
                          <span className="text-[7px] text-white truncate max-w-full font-medium">{file.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Warning details for invalid file names */}
                {drivePreviews.some((file) => !/\d+/.test(file.name)) && (
                  <div className="rounded-lg border border-red-200 bg-red-50/75 p-3 text-[10.5px] leading-relaxed text-red-800 font-medium space-y-1">
                    <span className="font-bold flex items-center gap-1 text-red-900">
                      ⚠️ Tên tệp không hợp lệ (Không chứa số thứ tự bài đăng):
                    </span>
                    <p className="text-[10px] text-red-700">
                      Các tệp dưới đây sẽ bị bỏ qua vì hệ thống không xác định được thứ tự đăng bài tương ứng. Vui lòng đổi tên tệp trên Google Drive (ví dụ: thêm số thứ tự như <code className="bg-red-100/50 px-1 rounded font-bold">1_product.jpg</code>) và quét lại.
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-red-800 font-mono max-h-32 overflow-y-auto mt-1.5">
                      {drivePreviews
                        .filter((file) => !/\d+/.test(file.name))
                        .map((file) => (
                          <li key={file.id} className="truncate" title={file.name}>
                            {file.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-slate-150 pt-4">
          <label className="mb-1 block text-xs font-bold text-slate-700">Nguồn nghiên cứu thị trường </label>
          <p className="mb-3 text-[10px] text-slate-400">Chọn nguồn dữ liệu để AI tự động nghiên cứu và thu thập xu hướng trước khi viết bài.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'google', label: 'Google Search', icon: Globe, disabled: false },
              { id: 'facebook', label: 'Facebook Search', icon: Facebook, disabled: false },
              { id: 'tiktok', label: 'TikTok Trends', icon: Sparkles, disabled: false }
            ].map((source: { id: string; label: string; icon: LucideIcon; disabled: boolean; tooltip?: string }) => {
              const isSelected = apifySources.includes(source.id);
              const IconComp = source.icon;
              return (
                <button
                  type="button"
                  key={source.id}
                  disabled={source.disabled}
                  onClick={() => !source.disabled && toggleApifySource(source.id)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all select-none relative ${source.disabled
                      ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                      : isSelected
                        ? 'border-indigo-600 bg-indigo-50/20 text-indigo-750 shadow-xs cursor-pointer'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer'
                    }`}
                  title={source.disabled ? source.tooltip : undefined}
                >
                  <div className={`rounded-lg p-1.5 ${source.disabled ? 'bg-slate-200 text-slate-450' : isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    <IconComp size={16} />
                  </div>
                  <span className={`text-xs font-bold ${source.disabled ? 'text-slate-400' : 'text-slate-850'}`}>{source.label}</span>
                  {source.disabled && (
                    <span className="ml-auto text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md">
                      Khóa
                    </span>
                  )}
                  {isSelected && !source.disabled && (
                    <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-150 pt-4">
          <h3 className="text-xs font-bold text-slate-850 uppercase tracking-wider mb-3">Cấu hình lịch chạy</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Dates & Count & Channel */}
            <div className="space-y-4.5">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  Ngày bắt đầu
                  <input
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-normal focus:border-indigo-600 focus:outline-hidden"
                  />
                </label>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  Ngày kết thúc
                  <input
                    type="date"
                    min={startDate || today}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-normal focus:border-indigo-600 focus:outline-hidden"
                  />
                </label>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Số bài mỗi ngày</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => changePostsPerDay(value)}
                      className={`h-7 w-8.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${postsPerDay === value
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Facebook Page nhận lịch đăng</label>
                <select
                  value={integrationId}
                  onChange={(event) => setIntegrationId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:border-indigo-600 focus:outline-hidden"
                >
                  {userProfile?.facebookIntegration?.isConnected && <option value="">{userProfile.facebookIntegration.pageName || 'Facebook Page cá nhân đã kết nối'}</option>}
                  {integrations.map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
                  {!integrations.length && !userProfile?.facebookIntegration?.isConnected && <option value="">Chưa có Facebook Page được kết nối</option>}
                </select>
              </div>
            </div>

            {/* Right Column: Auto-Publish & Posting Times */}
            <div className="space-y-4.5">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wide">Tự động xuất bản</label>
                  <p className="mt-0.5 text-[10px] text-slate-400 leading-normal">
                    AI tự duyệt & đăng bài lên Facebook mà không cần phê duyệt tay thủ công.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPublishMode(publishMode === 'auto' ? 'manual' : 'auto')}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${publishMode === 'auto' ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${publishMode === 'auto' ? 'translate-x-4' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Khung giờ bài đăng</label>
                <div className="grid grid-cols-3 gap-2">
                  {postingTimes.map((time, index) => (
                    <div key={index} className="flex flex-col">
                      <span className="text-[9px] font-semibold text-slate-400 uppercase">Giờ {index + 1}</span>
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
              </div>
            </div>
          </div>
        </div>

        {/* Detailed custom schedule editor */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-extrabold text-slate-800">Tùy chỉnh lịch chi tiết từng ngày (Tùy chọn)</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Thiết lập giờ đăng riêng cho từng ngày cụ thể nếu không muốn dùng giờ mặc định.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomSchedule(!showCustomSchedule)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              {showCustomSchedule ? 'Thu gọn' : 'Cấu hình chi tiết'}
            </button>
          </div>

          {showCustomSchedule && allDatesInRange.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-150 bg-slate-50/30 p-4">
              {/* Pagination controls for days */}
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-[11px] font-bold text-slate-500">
                  Hiển thị ngày {Math.min(allDatesInRange.length, (customSchedulePage - 1) * 7 + 1)} - {Math.min(allDatesInRange.length, customSchedulePage * 7)} trong tổng số {allDatesInRange.length} ngày
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={customSchedulePage === 1}
                    onClick={() => setCustomSchedulePage(customSchedulePage - 1)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Tuần trước
                  </button>
                  <button
                    type="button"
                    disabled={customSchedulePage >= Math.ceil(allDatesInRange.length / 7)}
                    onClick={() => setCustomSchedulePage(customSchedulePage + 1)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Tuần sau
                  </button>
                </div>
              </div>

              {/* Days List */}
              <div className="space-y-4">
                {allDatesInRange
                  .slice((customSchedulePage - 1) * 7, customSchedulePage * 7)
                  .map((date) => {
                    const isCustomized = !!customSchedule[date];
                    const times = customSchedule[date] || postingTimes;

                    // Format date string nicely: e.g. "Thứ Hai, 13/07/2026"
                    const formattedDate = new Intl.DateTimeFormat('vi-VN', {
                      weekday: 'long',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }).format(new Date(date));

                    return (
                      <div key={date} className="flex flex-col gap-3 rounded-lg border border-slate-150 bg-white p-3.5 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-800 capitalize">{formattedDate}</span>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isCustomized ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-100 text-slate-500'}`}>
                              {isCustomized ? 'Đã tùy chỉnh' : 'Mặc định'}
                            </span>
                            {isCustomized ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = { ...customSchedule };
                                  delete updated[date];
                                  setCustomSchedule(updated);
                                }}
                                className="text-[10px] font-extrabold text-red-550 hover:underline cursor-pointer"
                              >
                                Reset về mặc định
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomSchedule({
                                    ...customSchedule,
                                    [date]: [...postingTimes]
                                  });
                                }}
                                className="text-[10px] font-extrabold text-indigo-655 hover:underline cursor-pointer"
                              >
                                Tùy chỉnh ngày này
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Times listing */}
                        <div className="flex flex-wrap items-end gap-3.5">
                          {times.map((time, idx) => (
                            <div key={idx} className="flex flex-col w-32 relative">
                              <div className="flex items-center justify-between select-none">
                                <span className="text-[10px] font-bold text-slate-500">Giờ bài {idx + 1}</span>
                                {isCustomized && times.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedTimes = times.filter((_, tIdx) => tIdx !== idx);
                                      setCustomSchedule({
                                        ...customSchedule,
                                        [date]: updatedTimes
                                      });
                                    }}
                                    className="text-[9px] font-extrabold text-red-500 hover:text-red-700 cursor-pointer"
                                  >
                                    Xóa
                                  </button>
                                )}
                              </div>
                              <CustomTimePicker
                                value={time}
                                disabled={!isCustomized}
                                onChange={(newTime) => {
                                  const updatedTimes = times.map((t, tIdx) => tIdx === idx ? newTime : t);
                                  setCustomSchedule({
                                    ...customSchedule,
                                    [date]: updatedTimes
                                  });
                                }}
                              />
                            </div>
                          ))}

                          {isCustomized && times.length < 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextHour = times.length > 0
                                  ? String(parseInt(times[times.length - 1].split(':')[0]) + 2).padStart(2, '0') + ':00'
                                  : '09:00';
                                const validatedHour = parseInt(nextHour.split(':')[0]) >= 24 ? '23:00' : nextHour;
                                setCustomSchedule({
                                  ...customSchedule,
                                  [date]: [...times, validatedHour]
                                });
                              }}
                              className="h-9 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 px-3 text-[11px] font-extrabold text-indigo-655 hover:bg-indigo-50 hover:border-indigo-300 transition cursor-pointer"
                            >
                              + Thêm khung giờ
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Reset All Button */}
              {Object.keys(customSchedule).length > 0 && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmConfig({
                        isOpen: true,
                        title: 'Đặt lại lịch đăng',
                        message: 'Bạn có chắc muốn đặt lại tất cả các ngày về giờ đăng mặc định không?',
                        isDangerous: true,
                        confirmText: 'Xác nhận xóa',
                        cancelText: 'Quay lại',
                        onConfirm: () => {
                          setCustomSchedule({});
                          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="text-[11px] font-bold text-red-655 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                  >
                    Xóa tất cả tùy chỉnh
                  </button>
                </div>
              )}
            </div>
          )}
        </div>



        <button type="button" onClick={handleCreateCampaign} disabled={loading || !prompt.trim() || !dayCount || totalPosts > 450} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 cursor-pointer">
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
        {totalPosts > 450 && <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600">Tối đa 450 bài mỗi chiến dịch. Hãy giảm số ngày hoặc số bài/ngày.</p>}
        <p className="mt-5 text-[11px] leading-relaxed text-slate-500">Bước này lập lịch các bài viết dưới dạng chờ duyệt. Khi đến hạn, AI sẽ tự động sinh nội dung trước giờ đăng và gửi yêu cầu phê duyệt từ bạn.</p>
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${filterStatus === tab.value
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
          queued: 'bg-blue-50 text-blue-755 border-blue-200',
          generating: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
          researching: 'bg-teal-50 text-teal-700 border-teal-200 animate-pulse',
          writing: 'bg-violet-50 text-violet-750 border-violet-200 animate-pulse',
          scoring: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
          generating_media: 'bg-pink-50 text-pink-700 border-pink-200 animate-pulse',
          verifying: 'bg-cyan-50 text-cyan-700 border-cyan-200 animate-pulse',
          pending_approval: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
          ready_to_publish: 'bg-teal-50 text-teal-755 border-teal-200',
          publishing: 'bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse',
          published: 'bg-green-50 text-green-700 border-green-200',
          failed: 'bg-red-50 text-red-755 border-red-200',
          cancelled: 'bg-slate-150 text-slate-500 border-slate-200',
          skipped: 'bg-gray-150 text-gray-500 border-gray-200',
          retrying: 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse',
          needs_attention: 'bg-amber-50 text-amber-700 border-amber-200',
        }}
        slotStatusLabel={{
          planned: 'Lên kế hoạch',
          queued: 'Trong hàng đợi',
          generating: 'Đang chuẩn bị...',
          researching: 'Đang nghiên cứu...',
          writing: 'Đang viết bài viết...',
          scoring: 'Đang chấm điểm AI...',
          generating_media: 'Đang thiết kế ảnh...',
          verifying: 'Đang duyệt chất lượng...',
          pending_approval: 'Chờ duyệt',
          ready_to_publish: 'Sẵn sàng đăng',
          publishing: 'Đang đăng...',
          published: 'Đã đăng thành công',
          failed: 'Thất bại',
          cancelled: 'Đã hủy',
          skipped: 'Đã bỏ qua',
          retrying: 'Đang thử lại...',
          needs_attention: 'Cần chú ý',
        }}
        onRetrySlot={async (campaignId, slotId) => {
          setCampaignDetail(prev => {
            if (!prev) return null;
            return {
              ...prev,
              slots: prev.slots.map(s => s._id === slotId ? { ...s, status: 'planned', errorMessage: undefined } : s)
            };
          });
          try {
            await marketingCampaignService.retrySlot(campaignId, slotId);
            toast.success('Đã đặt lại slot để thử lại.');
            const res = await marketingCampaignService.detail(campaignId);
            setCampaignDetail({ campaign: res.campaign, slots: res.slots as CampaignSlot[] });
          } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Không thể thử lại slot.');
          }
        }}
        onRetryAll={async (campaignId) => {
          try {
            const result = await marketingCampaignService.retryAllSlots(campaignId);
            toast.success(`Đã đặt lại ${result.retriedCount} slot để thử lại.`);
            const res = await marketingCampaignService.detail(campaignId);
            setCampaignDetail({ campaign: res.campaign, slots: res.slots as CampaignSlot[] });
          } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Không thể thử lại các slot.');
          }
        }}
        onRefresh={async () => {
          if (selectedCampaignId) {
            const res = await marketingCampaignService.detail(selectedCampaignId);
            setCampaignDetail({ campaign: res.campaign, slots: res.slots as CampaignSlot[] });
          }
        }}
        onUpdateSlot={(slotId, updatedFields) => {
          setCampaignDetail(prev => {
            if (!prev) return null;
            return {
              ...prev,
              slots: prev.slots.map(s => s._id === slotId ? { ...s, ...updatedFields } : s)
            };
          });
        }}
      />

      {confirmConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
          <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-slate-850">{confirmConfig.title || 'Xác nhận'}</h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">{confirmConfig.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors"
              >
                {confirmConfig.cancelText || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                onClick={confirmConfig.onConfirm}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer transition-colors ${confirmConfig.isDangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
              >
                {confirmConfig.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
