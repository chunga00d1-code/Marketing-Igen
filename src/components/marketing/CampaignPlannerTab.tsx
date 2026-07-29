import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Facebook, Loader2, Sparkles, FolderOpen, Globe, Zap } from 'lucide-react';
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
const CAMPAIGNS_PER_PAGE = 8;

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
  const [selectedPlatform, setSelectedPlatform] = useState<'Facebook' | 'TikTok'>('Facebook');
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaigns, setCampaigns] = useState<MarketingCampaignSummary[]>([]);
  const qualityMode = 'premium';
  const [publishMode, setPublishMode] = useState<'auto' | 'manual'>('manual');
  const [creationMode, setCreationMode] = useState<'single' | 'campaign' | null>(null);
  const [imageMode, setImageMode] = useState<'ai' | 'order'>('order');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [apifySources, setApifySources] = useState<string[]>(['google', 'facebook', 'tiktok']);
  const isSinglePost = creationMode === 'single';
  const isTikTokCampaign = selectedPlatform === 'TikTok';
  const canUseLocalMockFacebookPage = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const selectedPlatformLabel = isTikTokCampaign ? 'TikTok' : 'Facebook';
  const selectedAccountLabel = isTikTokCampaign
    ? 'Tài khoản TikTok nhận nội dung'
    : 'Facebook Page nhận bài đăng ngay';
  const missingIntegrationLabel = isTikTokCampaign
    ? 'Chưa có tài khoản TikTok doanh nghiệp được kết nối'
    : (canUseLocalMockFacebookPage ? 'Fanpage Facebook giả lập (local)' : 'Chưa có Facebook Page được kết nối');

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
  const [totalCampaigns, setTotalCampaigns] = useState(0);
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
      const result = await marketingCampaignService.list(page, CAMPAIGNS_PER_PAGE);
      setCampaigns(result.campaigns);
      setTotalPages(result.pagination.totalPages);
      setTotalCampaigns(result.pagination.total);
      setCurrentPage(result.pagination.page);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải danh sách chiến dịch.');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    let active = true;
    setIntegrationId('');
    void socialIntegrationService.getIntegrations(selectedPlatform).then((items) => {
      if (!active) return;
      const connected = items.filter((item) => item.isConnected);
      setIntegrations(connected);
      setIntegrationId(connected[0]?._id || '');
    }).catch(() => {
      if (active) setIntegrations([]);
    });
    return () => { active = false; };
  }, [selectedPlatform]);

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

  const handleCreateCampaign = async () => {
    if (!creationMode) return toast.warning('Vui lòng chọn tạo một bài đăng hoặc chiến dịch nhiều bài.');
    if (!prompt.trim()) return toast.warning('Vui lòng nhập mục tiêu hoặc brief chiến dịch.');
    if (!dayCount || totalPosts > 450) return toast.warning('Chiến dịch phải có ngày hợp lệ và tối đa 450 bài.');
    const hasPersonalFacebook = Boolean(userProfile?.facebookIntegration?.isConnected && userProfile?.facebookIntegration?.pageId);
    const canUsePersonalFacebook = selectedPlatform === 'Facebook' && hasPersonalFacebook;
    const canUseLocalMock = selectedPlatform === 'Facebook' && canUseLocalMockFacebookPage;
    if (!integrationId && !canUsePersonalFacebook && !canUseLocalMock) {
      return toast.warning(
        selectedPlatform === 'TikTok'
          ? 'Vui lòng kết nối tài khoản TikTok doanh nghiệp trước khi tạo chiến dịch video.'
          : 'Vui lòng kết nối một Facebook Page trước khi tạo lịch tự động.'
      );
    }

    setLoading(true);
    try {
      const brief = buildSourceBriefContext();
      const imagesParam = imageMode === 'order' ? undefined : (uploadedImageBase64 ? [uploadedImageBase64] : undefined);

      const result = await marketingCampaignService.create({
        sourceBrief: brief,
        campaignType: isSinglePost ? 'single' : 'campaign',
        startDate,
        endDate,
        postsPerDay,
        postingTimes,
        timezone: 'Asia/Bangkok',
        platforms: [selectedPlatform],
        integrationIds: integrationId ? { [selectedPlatform]: integrationId } : {},
        candidateCount: 1, // Single-Render Flow
        qualityMode,
        publishMode: isTikTokCampaign ? 'manual' : (isSinglePost ? 'auto' : publishMode),
        publishNow: isSinglePost && !isTikTokCampaign,
        imageMode,
        mediaPolicy: isTikTokCampaign ? 'video' : 'auto',
        images: imagesParam,
        customSchedule: Object.keys(customSchedule).length > 0 ? customSchedule : undefined,
        apifySources: apifySources.length > 0 ? apifySources : undefined,
      });
      setCampaigns((current) => [result.campaign, ...current]);
      setPrompt('');
      setUploadedDocName('');
      setUploadedDocText('');
      setUploadedImageBase64('');
      setImageMode('order');
      setApifySources(['google', 'facebook', 'tiktok']);
      setCustomSchedule({});
      setShowCustomSchedule(false);
      toast.success(isSinglePost
        ? (isTikTokCampaign
          ? 'Đã tạo video TikTok. Hệ thống sẽ chỉ cho đăng sau khi video hoàn tất và được xác nhận.'
          : 'Đã tạo bài và chuyển sang xử lý đăng ngay.')
        : `Đã khởi chạy “${result.campaign.title}”. Toàn bộ tháng đầu đang được render nền theo lô an toàn.`);
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
      <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
        <div>
          {/* Stepper Header Bar */}
          <div className="mb-6 border-b border-slate-150 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {[
                { step: 1, label: 'Lên ý tưởng' },
                { step: 2, label: 'Chọn nền tảng' },
                { step: 3, label: 'Chọn nguồn tài liệu' },
                { step: 4, label: 'Lên lịch đăng bài' },
              ].map((s) => {
                const isActive = wizardStep === s.step;
                const isCompleted = wizardStep > s.step;
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => {
                      const canOpen = s.step === 1
                        || (s.step === 2 && prompt.trim())
                        || (s.step >= 3 && prompt.trim() && creationMode);
                      if (canOpen) {
                        setWizardStep(s.step as 1 | 2 | 3 | 4);
                      }
                    }}
                    className={`group flex items-center gap-2 rounded-xl py-2 px-3 transition-all duration-200 cursor-pointer border ${isActive
                      ? 'bg-gradient-to-r from-cyan-50 to-blue-50/80 border-cyan-400 text-cyan-950 shadow-md shadow-cyan-500/10 ring-2 ring-cyan-400/20'
                      : isCompleted
                        ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 hover:bg-emerald-100/60 hover:-translate-y-0.5'
                        : 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-60 hover:opacity-80'
                      }`}
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-transform duration-200 group-hover:scale-110 ${isActive
                        ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-sm'
                        : isCompleted
                          ? 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                        }`}
                    >
                      {isCompleted ? '✓' : s.step}
                    </div>
                    <span className={`text-xs font-bold truncate transition-colors ${isActive ? 'text-cyan-950' : isCompleted ? 'text-emerald-950' : 'text-slate-600'}`}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BƯỚC 1: Ý TƯỞNG & PROMPT */}
          {wizardStep === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Nhập ý tưởng bài viết
                </label>
              </div>
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
            </div>
          )}

          {/* BƯỚC 2: NỀN TẢNG & HÌNH THỨC */}
          {wizardStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="mb-2 text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                  CHỌN NỀN TẢNG TRUYỀN THÔNG:
                </h3>
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Facebook */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlatform('Facebook');
                      setIntegrationId('');
                    }}
                    className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-xs font-extrabold shadow-2xs cursor-pointer transition-all ${selectedPlatform === 'Facebook'
                      ? 'border-slate-900 bg-blue-50/90 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:text-blue-700'
                      }`}
                  >
                    <Facebook size={16} className="text-blue-600 fill-blue-600/10" />
                    <span>Facebook</span>
                  </button>

                  {/* Zalo - Disabled */}
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-1.5 text-xs font-semibold text-slate-400 opacity-60 cursor-not-allowed"
                  >
                    <span className="text-[10px] font-extrabold tracking-tight text-slate-400">ZL</span>
                    <span>Zalo</span>
                  </button>

                  {/* TikTok */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlatform('TikTok');
                      setIntegrationId('');
                      setImageMode('order');
                    }}
                    className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-xs font-extrabold shadow-2xs cursor-pointer transition-all ${selectedPlatform === 'TikTok'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-500 hover:text-slate-900'
                      }`}
                  >
                    <span className={`text-[10px] font-extrabold tracking-tight ${selectedPlatform === 'TikTok' ? 'text-cyan-300' : 'text-slate-500'}`}>TT</span>
                    <span>TikTok</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    CHỌN LOẠI HÌNH NỘI DUNG:
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCreationMode('single');
                      setImageMode(isTikTokCampaign ? 'order' : 'ai');
                      setStartDate(today);
                      setEndDate(today);
                      changePostsPerDay(1);
                    }}
                    className={`group relative flex items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all duration-300 cursor-pointer ${creationMode === 'single'
                      ? 'border-indigo-500 bg-gradient-to-r from-indigo-50/90 to-purple-50/50 shadow-md shadow-indigo-500/10 ring-2 ring-indigo-500/20 -translate-y-0.5'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 hover:-translate-y-0.5 hover:shadow-md'
                      }`}
                  >
                    <div className={`rounded-xl p-2.5 shrink-0 transition-transform duration-300 group-hover:scale-110 ${creationMode === 'single' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30' : 'bg-slate-100 text-slate-500 group-hover:text-indigo-600'}`}>
                      <Zap size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="block text-xs font-extrabold text-slate-900">Một bài đăng</span>
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">⚡ Đăng ngay</span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCreationMode('campaign');
                      setImageMode('order');
                      if (startDate === endDate) setEndDate(nextWeek);
                    }}
                    className={`group relative flex items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all duration-300 cursor-pointer ${creationMode === 'campaign'
                      ? 'border-cyan-500 bg-gradient-to-r from-cyan-50/90 to-blue-50/50 shadow-md shadow-cyan-500/10 ring-2 ring-cyan-500/20 -translate-y-0.5'
                      : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/20 hover:-translate-y-0.5 hover:shadow-md'
                      }`}
                  >
                    <div className={`rounded-xl p-2.5 shrink-0 transition-transform duration-300 group-hover:scale-110 ${creationMode === 'campaign' ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30' : 'bg-slate-100 text-slate-500 group-hover:text-cyan-600'}`}>
                      <CalendarClock size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="block text-xs font-extrabold text-slate-900">Chiến dịch nhiều bài</span>
                        <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700">🚀 Lịch tự động</span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BƯỚC 3: NGUỒN TÀI LIỆU & HÌNH ẢNH */}
          {wizardStep === 3 && (
            <div className="space-y-5 animate-fadeIn">
              {/* Nguồn tư liệu & Hình ảnh */}
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Chọn nguồn ảnh cho bài viết
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isTikTokCampaign}
                    onClick={() => setImageMode('ai')}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${imageMode === 'ai'
                      ? 'border-indigo-400 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className={`rounded-lg p-2 ${imageMode === 'ai' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-800">AI tự vẽ ảnh</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImageMode('order')}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${imageMode === 'order'
                      ? 'border-indigo-400 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className={`rounded-lg p-2 ${imageMode === 'order' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <FolderOpen size={16} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-800">Order ảnh sau content</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">Nhập Drive trong chi tiết chiến dịch</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Nguồn nghiên cứu thị trường */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Nguồn AI tra cứu xu hướng
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'google', label: 'Tìm kiếm Google', icon: Globe },
                    { id: 'facebook', label: 'Bài viết Facebook', icon: Facebook },
                    { id: 'tiktok', label: 'Xu hướng TikTok', icon: Sparkles }
                  ].map((source) => {
                    const isSelected = apifySources.includes(source.id);
                    const IconComp = source.icon;
                    return (
                      <div
                        key={source.id}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border select-none relative opacity-65 cursor-default ${
                          isSelected
                            ? 'border-indigo-300 bg-indigo-50/50 text-indigo-950 font-bold'
                            : 'border-slate-200 bg-white text-slate-400'
                        }`}
                      >
                        <div className={`rounded-lg p-1.5 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          <IconComp size={15} />
                        </div>
                        <span className="text-xs font-bold text-slate-800">{source.label}</span>
                        {isSelected && (
                          <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* BƯỚC 4: CẤU HÌNH LỊCH CHẠY */}
          {wizardStep === 4 && (
            <div className="space-y-5 animate-fadeIn">
              <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${isSinglePost ? 'border-indigo-200 bg-indigo-50/60 text-indigo-950' : 'border-cyan-200 bg-cyan-50/60 text-cyan-950'}`}>
                <div className={`rounded-lg p-2 text-white shadow-2xs ${isSinglePost ? 'bg-indigo-600' : 'bg-cyan-600'}`}>
                  {isSinglePost ? <Zap size={16} /> : <CalendarClock size={16} />}
                </div>
                <div>
                  <p className="text-xs font-bold">{isSinglePost ? `Một bài đăng ${selectedPlatformLabel}` : `Chiến dịch ${selectedPlatformLabel} nhiều bài`}</p>
                </div>
              </div>

              {isSinglePost ? (
                <div className="space-y-4 animate-fadeIn">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 text-xs text-indigo-950 flex items-center gap-3">
                    <div className="rounded-lg bg-indigo-600 text-white p-1.5 shrink-0 shadow-2xs">
                      <Zap size={14} />
                    </div>
                    <p className="font-bold text-indigo-950 text-xs">
                      {isTikTokCampaign
                        ? 'Hệ thống sẽ tạo video TikTok. Video chỉ sẵn sàng đăng sau khi render hoàn tất và có xác nhận xuất bản.'
                        : 'Hệ thống sẽ tạo bài viết và tự động đăng ngay lên Facebook Page.'}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                      {selectedAccountLabel}
                    </label>
                    <select
                      value={integrationId}
                      onChange={(event) => setIntegrationId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white text-slate-800 focus:border-indigo-600 focus:outline-hidden shadow-2xs"
                    >
                      {!isTikTokCampaign && userProfile?.facebookIntegration?.isConnected && <option value="">{userProfile.facebookIntegration.pageName || 'Facebook Page cá nhân đã kết nối'}</option>}
                      {integrations.map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
                      {!integrations.length && (isTikTokCampaign || !userProfile?.facebookIntegration?.isConnected) && (
                        <option value="">{missingIntegrationLabel}</option>
                      )}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 animate-fadeIn">
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
                        <label className="mb-1.5 block text-[11px] font-bold text-slate-500 uppercase tracking-wide">{isTikTokCampaign ? 'Tài khoản TikTok nhận lịch đăng' : 'Facebook Page nhận lịch đăng'}</label>
                        <select
                          value={integrationId}
                          onChange={(event) => setIntegrationId(event.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:border-indigo-600 focus:outline-hidden"
                        >
                          {!isTikTokCampaign && userProfile?.facebookIntegration?.isConnected && <option value="">{userProfile.facebookIntegration.pageName || 'Facebook Page cá nhân đã kết nối'}</option>}
                          {integrations.map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
                          {!integrations.length && (isTikTokCampaign || !userProfile?.facebookIntegration?.isConnected) && (
                            <option value="">{missingIntegrationLabel}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Right Column: Auto-Publish & Posting Times */}
                    <div className="space-y-4.5">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wide">Tự động xuất bản</label>
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

                  {/* Detailed custom schedule editor */}
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800">Tùy chỉnh lịch chi tiết từng ngày</h4>
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="mt-6 pt-4 border-t border-slate-150 flex items-center justify-between gap-3">
          {wizardStep > 1 ? (
            <button
              type="button"
              onClick={() => setWizardStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
            >
              <span>◀ Quay lại</span>
            </button>
          ) : (
            <div />
          )}

          {wizardStep < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (wizardStep === 1 && !prompt.trim()) {
                  toast.warning('Vui lòng nhập ý tưởng hoặc brief bài viết trước khi tiếp tục.');
                  return;
                }
                if (wizardStep === 2 && !creationMode) {
                  toast.warning('Vui lòng chọn một bài đăng hoặc chiến dịch nhiều bài.');
                  return;
                }
                setWizardStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
              }}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer flex items-center gap-1.5 ml-auto"
            >
              <span>Tiếp tục (Bước {wizardStep + 1}/4) ➔</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateCampaign}
              disabled={loading || !creationMode || !prompt.trim() || !dayCount || (!isSinglePost && totalPosts > 450)}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 transition cursor-pointer flex items-center gap-2 ml-auto"
            >
              {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <Sparkles size={16} />}
              <span>{loading
                ? (isSinglePost ? 'AI đang tạo bài viết...' : 'AI đang lập chiến lược và xếp lô render tháng đầu...')
                : (isSinglePost ? '⚡ Tạo và đăng ngay 1 bài' : `🚀 Khởi chạy chiến dịch ${totalPosts || 0} bài`)}</span>
            </button>
          )}
        </div>
      </section>

      <aside className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
        <div className="flex items-center gap-2 text-indigo-700"><CalendarClock size={19} /><h3 className="text-sm font-extrabold">Tóm tắt thiết lập</h3></div>
        <div className="mt-5 space-y-3 text-xs text-slate-600">
          <div className="rounded-xl border border-white bg-white p-3"><b className="block text-slate-800">Hình thức</b><span>{creationMode === 'single' ? 'Một bài đăng' : creationMode === 'campaign' ? 'Chiến dịch nhiều bài' : 'Chưa chọn'}</span></div>
          <div className="rounded-xl border border-white bg-white p-3"><b className="block text-slate-800">Thời gian</b><span>{isSinglePost ? 'Đăng ngay sau khi tạo' : `${dayCount || 0} ngày · ${startDate} → ${endDate}`}</span></div>
          <div className="rounded-xl border border-white bg-white p-3"><b className="block text-slate-800">Sản lượng</b><span>{isSinglePost ? '1 bài' : `${postsPerDay} bài/ngày · tổng ${totalPosts || 0} bài`}</span></div>
          {!isSinglePost && <div className="rounded-xl border border-white bg-white p-3"><b className="block text-slate-800">Chu kỳ render</b><span>Render trọn tháng đầu; mỗi tháng tiếp theo bắt đầu trước 10 ngày</span></div>}
          {!isSinglePost && <div className="rounded-xl border border-white bg-white p-3"><b className="mb-1 flex items-center gap-1 text-slate-800"><Clock3 size={13} /> Khung giờ</b><span>{postingTimes.join(', ')}</span></div>}
          <div className="rounded-xl border border-white bg-white p-3"><b className="mb-1 flex items-center gap-1 text-slate-800"><Facebook size={13} /> Nền tảng</b><span>{selectedPlatformLabel}</span></div>
        </div>
        {!isSinglePost && totalPosts > 450 && <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600">Tối đa 450 bài mỗi chiến dịch. Hãy giảm số ngày hoặc số bài/ngày.</p>}
      </aside>

      <section className="xl:col-span-3 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-850">Lịch sử nội dung & chiến dịch</h3>
            {!loadingCampaigns && totalCampaigns > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Hiển thị {Math.min((currentPage - 1) * CAMPAIGNS_PER_PAGE + 1, totalCampaigns)}–{Math.min(currentPage * CAMPAIGNS_PER_PAGE, totalCampaigns)} / {totalCampaigns} chiến dịch
              </p>
            )}
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
          awaiting_assets: 'bg-amber-50 text-amber-700 border-amber-200',
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
          awaiting_assets: 'Chờ ảnh thiết kế',
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
