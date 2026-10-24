import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Loader2, Sparkles, FolderOpen, Upload, Zap, Plus, X, Check, Rocket, ArrowRight } from 'lucide-react';
import { socialIntegrationService, SocialIntegration } from '../../services/socialIntegrationService';
import { CampaignStatus, marketingCampaignService, MarketingCampaignSummary } from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';
import { uploadEditorMedia } from '../../services/videoProjectMediaService';
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

const CAMPAIGN_TIMEZONE = 'Asia/Bangkok';

function getDateKeyInTimezone(date: Date, timezone = CAMPAIGN_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? date
    : null;
}

function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

const toDateInput = (date: Date) => getDateKeyInTimezone(date);
const CAMPAIGNS_PER_PAGE = 20;
const CAMPAIGN_RESEARCH_SOURCES = ['google', 'facebook', 'tiktok'];

export default function CampaignPlannerTab({ userProfile }: CampaignPlannerTabProps) {
  const today = useMemo(() => toDateInput(new Date()), []);
  const nextWeek = useMemo(() => {
    return addDaysToDateKey(today, 6);
  }, [today]);
  const [prompt, setPrompt] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextWeek);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [postingTimes, setPostingTimes] = useState(['09:00']);
  const [customSchedule, setCustomSchedule] = useState<Record<string, string[]>>({});
  const [showCustomSchedule, setShowCustomSchedule] = useState(false);
  const [customSchedulePage, setCustomSchedulePage] = useState(1);
  const [integrations, setIntegrations] = useState<SocialIntegration[]>([]);
  const [integrationIds, setIntegrationIds] = useState<Partial<Record<'Facebook' | 'TikTok', string>>>({});
  const manuallySelectedIntegrations = useRef<Partial<Record<'Facebook' | 'TikTok', boolean>>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Array<'Facebook' | 'TikTok'>>(['Facebook']);
  const selectedPlatform = selectedPlatforms[0] || 'Facebook';
  const integrationId = integrationIds[selectedPlatform] || '';
  const setIntegrationId = (value: string) => {
    setIntegrationIds((current) => ({ ...current, [selectedPlatform]: value }));
  };
  const togglePlatform = (platform: 'Facebook' | 'TikTok') => {
    setSelectedPlatforms((current) => {
      if (creationMode === 'single') return [platform];
      if (current.includes(platform)) return current.length === 1 ? current : current.filter((item) => item !== platform);
      return [...current, platform];
    });
  };
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaigns, setCampaigns] = useState<MarketingCampaignSummary[]>([]);
  const qualityMode = 'premium';
  const [publishMode, setPublishMode] = useState<'auto' | 'manual'>('manual');
  const [creationMode, setCreationMode] = useState<'single' | 'campaign' | null>(null);
  const [imageMode, setImageMode] = useState<'ai' | 'order'>('order');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [initialBrief, setInitialBrief] = useState('');
  const [chatCampaign, setChatCampaign] = useState<MarketingCampaignSummary | null>(null);
  const [newConversationSelected, setNewConversationSelected] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; campaignId?: string }>>([]);
  const [chatSending, setChatSending] = useState(false);
  const isSinglePost = creationMode === 'single';
  const isTikTokCampaign = selectedPlatforms.includes('TikTok');
  const isTikTokOnly = selectedPlatforms.length === 1 && selectedPlatforms[0] === 'TikTok';
  const canUseLocalMockFacebookPage = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const canUseLocalMockTikTokAccount = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const selectedPlatformLabel = selectedPlatforms.join(' + ');
  const selectedAccountLabel = isTikTokCampaign
    ? 'Tài khoản TikTok nhận nội dung'
    : 'Facebook Page nhận bài đăng ngay';
  const missingIntegrationLabel = isTikTokCampaign
    ? 'Chưa có tài khoản TikTok doanh nghiệp được kết nối'
    : (canUseLocalMockFacebookPage ? 'Fanpage Facebook giả lập (local)' : 'Chưa có Facebook Page được kết nối');

  // Cleanup customSchedule when date range changes
  useEffect(() => {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);

    setCustomSchedule((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      if (!start || !end || end < start) {
        return {};
      }

      const updated = { ...prev };
      let changed = false;
      for (const date of Object.keys(updated)) {
        if (!parseDateKey(date) || date < startDate || date > endDate) {
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
  const [uploadedTikTokVideo, setUploadedTikTokVideo] = useState<{ name: string; url: string } | null>(null);
  const [uploadingTikTokVideo, setUploadingTikTokVideo] = useState(false);
  const [tiktokUploadProgress, setTiktokUploadProgress] = useState(0);
  const tiktokVideoInputRef = useRef<HTMLInputElement>(null);

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
    void socialIntegrationService.getIntegrations().then((items) => {
      if (!active) return;
      const connected = items
        .filter((item) => item.isConnected && (item.platform === 'Facebook' || item.platform === 'TikTok'))
        .sort((first, second) => String(first._id || '').localeCompare(String(second._id || '')));
      setIntegrations(connected);
    }).catch(() => {
      if (active) setIntegrations([]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setIntegrationIds((current) => {
      const next = { ...current };
      for (const platform of selectedPlatforms) {
        const accounts = integrations.filter((item) => item.platform === platform && item._id);
        if (accounts.some((account) => account._id === next[platform])) continue;
        if (next[platform] === '' && manuallySelectedIntegrations.current[platform]) continue;
        manuallySelectedIntegrations.current[platform] = false;
        next[platform] = accounts[0]?._id || '';
      }
      return selectedPlatforms.every((platform) => next[platform] === current[platform]) ? current : next;
    });
  }, [integrations, selectedPlatforms]);

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
    } else if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        let extractedText = '';
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          let csv = XLSX.utils.sheet_to_csv(worksheet);
          csv = csv
            .split('\n')
            .filter((line) => line.trim() && !/^,+$/.test(line.trim()))
            .join('\n');
          if (csv.trim()) {
            extractedText += `--- BẢNG TÍNH: ${sheetName} ---\n${csv}\n\n`;
          }
        }
        if (!extractedText.trim()) {
          throw new Error('Bảng tính Excel/CSV trống hoặc không có văn bản.');
        }
        setUploadedDocText(extractedText.trim());
        setLoadingDoc(false);
        toast.success('Đã trích xuất bảng tính Excel/CSV thành công!');
      } catch (err: unknown) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Lỗi xử lý file Excel/CSV.');
      }
    } else {
      setLoadingDoc(false);
      toast.error('Định dạng file không được hỗ trợ. Vui lòng tải hình ảnh, .txt, .md, .pdf, .docx hoặc Excel/CSV.');
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

  const handleTikTokVideoUpload = async (file: File) => {
    const supportedTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
    const supportedExtensions = /\.(mp4|mov|webm)$/i;
    if (!supportedTypes.has(file.type) && !supportedExtensions.test(file.name)) {
      toast.warning('TikTok chỉ nhận video MP4, MOV hoặc WebM.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.warning('Video tải trực tiếp tối đa 100MB. Video lớn hơn hãy nhập từ Google Drive.');
      return;
    }

    setUploadingTikTokVideo(true);
    setTiktokUploadProgress(0);
    try {
      const uploaded = await uploadEditorMedia(file, setTiktokUploadProgress);
      setUploadedTikTokVideo({ name: file.name, url: uploaded.url });
      setImageMode('order');
      toast.success('Đã tải video TikTok lên. Video sẽ được gắn vào bài này sau khi nội dung hoàn tất.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải video TikTok lên.');
    } finally {
      setUploadingTikTokVideo(false);
      setTiktokUploadProgress(0);
    }
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

  const openConversation = async (campaignId: string) => {
    try {
      const detail = await marketingCampaignService.detail(campaignId);
      setChatCampaign(detail.campaign);
      setNewConversationSelected(false);
      const history = detail.campaign.chatHistory?.length ? detail.campaign.chatHistory : [
        { role: 'user' as const, text: detail.campaign.sourceBrief, at: detail.campaign.createdAt },
        { role: 'assistant' as const, text: 'Kế hoạch chiến dịch đã được tạo. Mở chi tiết để xem trạng thái và các bài đăng.', at: detail.campaign.createdAt },
      ];
      setChatMessages(history.map((message) => ({
        role: message.role,
        text: message.text,
        campaignId: message.role === 'assistant' ? campaignId : undefined,
      })));
      setPrompt('');
      setInitialBrief('');
      setUploadedDocName('');
      setUploadedDocText('');
      setUploadedImageBase64('');
      setShowSetup(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể mở hội thoại chiến dịch.');
    }
  };

  const startNewConversation = () => {
    setChatCampaign(null);
    setNewConversationSelected(true);
    setChatMessages([]);
    manuallySelectedIntegrations.current = {};
    setIntegrationIds({});
    setPrompt('');
    setInitialBrief('');
    setUploadedDocName('');
    setUploadedDocText('');
    setUploadedImageBase64('');
    setUploadedTikTokVideo(null);
    setShowSetup(false);
    setShowAdvancedSetup(false);
    setSetupStep(1);
    setSelectedCampaignId(null);
    setWizardStep(2);
    setCreationMode(null);
    setSelectedPlatforms(['Facebook']);
    setIntegrationIds({});
    setStartDate(today);
    setEndDate(nextWeek);
    setPostsPerDay(1);
    setPostingTimes(['09:00']);
    setCustomSchedule({});
    setPublishMode('manual');
    setImageMode('order');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeSetup = () => {
    setPrompt(initialBrief);
    setInitialBrief('');
    setChatMessages([]);
    setShowSetup(false);
    setShowAdvancedSetup(false);
    setSetupStep(1);
  };

  const sendChat = async () => {
    const message = prompt.trim();
    if (!message || chatSending || loadingDoc) return;
    if (!chatCampaign) {
      setInitialBrief(message);
      setChatMessages([{ role: 'user', text: message }]);
      setPrompt('');
      setWizardStep(2);
      setSetupStep(1);
      setShowAdvancedSetup(false);
      setShowSetup(true);
      return;
    }
    if (chatCampaign.status !== 'draft') {
      toast.warning('Chiến dịch này đã bắt đầu xử lý. Hãy mở chi tiết để chỉnh sửa từng bài.');
      return;
    }
    setChatSending(true);
    try {
      const result = await marketingCampaignService.reviseDraft(chatCampaign._id, message, chatCampaign.draftRevision || 0);
      setChatMessages((current) => [
        ...current,
        { role: 'user', text: message },
        { role: 'assistant', text: 'Đã cập nhật bản kế hoạch theo yêu cầu. Mở chi tiết để kiểm tra trước khi khởi chạy.', campaignId: result.campaign._id },
      ]);
      setChatCampaign(result.campaign);
      setCampaigns((current) => current.map((item) => item._id === result.campaign._id ? result.campaign : item));
      setCampaignDetail((current) => current?.campaign._id === result.campaign._id
        ? { campaign: result.campaign, slots: result.slots as CampaignSlot[] }
        : current);
      setPrompt('');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Không thể sửa bản nháp.');
    } finally {
      setChatSending(false);
    }
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
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    if (!start || !end || end < start) return [];

    const dates: string[] = [];
    const temp = new Date(start);
    while (temp <= end) {
      dates.push(formatDateKey(temp));
      temp.setUTCDate(temp.getUTCDate() + 1);
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
    if (!initialBrief.trim()) return toast.warning('Vui lòng nhập mục tiêu hoặc brief chiến dịch.');
    if (!dayCount || totalPosts > 450) return toast.warning('Chiến dịch phải có ngày hợp lệ và tối đa 450 bài.');
    if (uploadingTikTokVideo) return toast.warning('Vui lòng chờ video TikTok tải lên hoàn tất.');
    const hasPersonalFacebook = Boolean(userProfile?.facebookIntegration?.isConnected && userProfile?.facebookIntegration?.pageId);
    if (selectedPlatforms.includes('TikTok') && !integrationIds.TikTok && !canUseLocalMockTikTokAccount) {
      return toast.warning('Please connect an active TikTok business account before creating this campaign.');
    }
    if (selectedPlatforms.includes('Facebook') && !integrationIds.Facebook
      && !(userProfile?.facebookIntegration?.isConnected && userProfile?.facebookIntegration?.pageId)
      && !canUseLocalMockFacebookPage) {
      return toast.warning('Please connect a Facebook Page before creating this campaign.');
    }

    const canUsePersonalFacebook = selectedPlatform === 'Facebook' && hasPersonalFacebook;
    const canUseLocalMock =
      (selectedPlatform === 'Facebook' && canUseLocalMockFacebookPage)
      || (selectedPlatform === 'TikTok' && canUseLocalMockTikTokAccount);
    if (!integrationId && !canUsePersonalFacebook && !canUseLocalMock) {
      return toast.warning(
        selectedPlatform === 'TikTok'
          ? 'Vui lòng kết nối tài khoản TikTok doanh nghiệp trước khi tạo chiến dịch video.'
          : 'Vui lòng kết nối một Facebook Page trước khi tạo lịch tự động.'
      );
    }

    setLoading(true);
    try {
      const brief = buildSourceBriefContext(initialBrief);
      const imagesParam = imageMode === 'order' ? undefined : (uploadedImageBase64 ? [uploadedImageBase64] : undefined);

      const result = await marketingCampaignService.create({
        sourceBrief: brief,
        campaignType: isSinglePost ? 'single' : 'campaign',
        startDate,
        endDate,
        postsPerDay,
        postingTimes,
        timezone: 'Asia/Bangkok',
        platforms: selectedPlatforms,
        integrationIds,
        candidateCount: 1, // Single-Render Flow
        qualityMode,
        publishMode: isTikTokOnly ? 'manual' : (isSinglePost ? 'auto' : publishMode),
        publishNow: false,
        imageMode,
        mediaPolicy: isTikTokOnly ? 'video' : 'auto',
        initialVideoUrl: isTikTokOnly && isSinglePost ? uploadedTikTokVideo?.url : undefined,
        images: imagesParam,
        customSchedule: Object.keys(customSchedule).length > 0 ? customSchedule : undefined,
        apifySources: CAMPAIGN_RESEARCH_SOURCES,
      });
      setCampaigns((current) => [result.campaign, ...current]);
      setChatCampaign(result.campaign);
      setNewConversationSelected(false);
      setChatMessages((current) => [...current, {
        role: 'assistant',
        text: isSinglePost
          ? 'Đã lập bản nháp một bài đăng. Mở chi tiết để xem kế hoạch; nhắn tiếp nếu cần sửa, rồi xác nhận để bắt đầu đăng.'
          : 'Đã lập bản kế hoạch chiến dịch. Mở chi tiết để xem lịch bài, rồi nhắn tiếp nếu cần điều chỉnh.',
        campaignId: result.campaign._id,
      }]);
      setShowSetup(false);
      setInitialBrief('');
      setPrompt('');
      setUploadedDocName('');
      setUploadedDocText('');
      setUploadedImageBase64('');
      setUploadedTikTokVideo(null);
      setImageMode('order');
      setCustomSchedule({});
      setShowCustomSchedule(false);
      toast.success(isSinglePost
        ? 'Đã tạo bản nháp một bài. Mở chi tiết để xem, sửa hoặc xác nhận bắt đầu đăng.'
        : `Đã tạo bản kế hoạch “${result.campaign.title}”. Hãy phân công từng bài rồi xác nhận khởi chạy.`);
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
      setChatCampaign((current) => current?._id === updated._id ? updated : current);
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
  const setupTitles = [
    'Chọn nền tảng truyền thông',
    'Chọn loại nội dung',
    'Chọn nguồn media',
    'Lên lịch đăng bài',
  ];
  const setupDescriptions = [
    'Bạn muốn triển khai chiến dịch trên nền tảng nào?',
    'Bạn muốn tạo một bài hay một chuỗi bài?',
    'Bạn muốn chuẩn bị ảnh và video bằng cách nào?',
    'Chọn thời gian và tài khoản nhận bài đăng.',
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch lg:gap-0 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
      <section className="flex min-h-[520px] min-w-0 w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs md:p-7 lg:col-start-2 lg:row-start-1 lg:rounded-none lg:border-0 lg:shadow-none">
        <div className="flex-1 space-y-5 overflow-y-auto py-6" aria-live="polite">
          {chatMessages.length === 0 && (
            <div className="mx-auto max-w-md py-16 text-center">
              <svg aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-blue-600" viewBox="0 0 40 40" fill="none">
                <rect x="5" y="4" width="30" height="32" rx="8" stroke="currentColor" strokeWidth="2.5" />
                <path d="M12 14h16M12 20h12M12 26h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="28" cy="27" r="3" fill="currentColor" />
              </svg>
              <h3 className="text-lg font-bold text-slate-800">Bạn muốn tạo chiến dịch gì?</h3>
              <p className="mt-2 text-sm text-slate-500">Mô tả sản phẩm, khách hàng và mục tiêu. Bạn có thể gửi tài liệu hoặc ảnh kèm theo.</p>
            </div>
          )}
          {chatMessages.map((message, index) => (
            <div key={`${index}-${message.role}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.campaignId && chatCampaign?._id === message.campaignId && (
                  <button type="button" onClick={() => setSelectedCampaignId(message.campaignId || null)} className="mt-3 flex w-full items-center justify-between gap-4 rounded-xl border border-blue-200 bg-white p-3 text-left text-blue-800 transition hover:bg-blue-50">
                    <span><b className="block text-sm">{chatCampaign.title}</b><span className="mt-1 block text-xs">{chatCampaign.statistics.totalSlots} bài dự kiến · {statusLabel[chatCampaign.status]} · Xem chi tiết</span></span>
                    <CalendarClock size={18} className="shrink-0" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          {chatCampaign && <p className="mb-2 text-xs text-slate-500">{chatCampaign.status === 'draft' ? 'Nhắn yêu cầu sửa bản kế hoạch; các lựa chọn nền tảng và lịch đăng được giữ nguyên.' : 'Mở chi tiết để theo dõi hoặc chỉnh sửa bài đang xử lý.'}</p>}
          <CampaignPromptBox prompt={prompt} setPrompt={setPrompt} uploadedDocName={uploadedDocName} uploadedImageBase64={uploadedImageBase64} loadingDoc={loadingDoc} isDragging={isDragging} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleDrop={handleDrop} handleDocumentUpload={handleDocumentUpload} handleRemoveDocument={handleRemoveDocument} onClearAll={() => { setPrompt(''); setUploadedDocName(''); setUploadedDocText(''); setUploadedImageBase64(''); }} onSend={() => void sendChat()} sending={chatSending} allowAttachments={!chatCampaign} placeholder={chatCampaign ? 'Nhập yêu cầu sửa bản kế hoạch chiến dịch...' : undefined} />
          <p className="text-[11px] text-slate-400">Enter để gửi · Shift + Enter để xuống dòng</p>
        </div>
      </section>

      {chatCampaign && <section className="w-full rounded-2xl border border-blue-100 bg-blue-50/50 p-5 lg:col-start-2 lg:row-start-2 lg:rounded-none lg:border-0 lg:border-t lg:border-slate-200">
        <div className="flex items-center gap-2 text-blue-700"><CalendarClock size={18} /><h3 className="text-sm font-extrabold">Tóm tắt chiến dịch</h3></div>
        <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-3"><b className="block text-slate-800">Hình thức</b>{chatCampaign.campaignType === 'single' ? 'Một bài đăng' : 'Chiến dịch nhiều bài'}</div>
          <div className="rounded-xl bg-white p-3"><b className="block text-slate-800">Lịch</b>{chatCampaign.startDate} → {chatCampaign.endDate}</div>
          <div className="rounded-xl bg-white p-3"><b className="block text-slate-800">Sản lượng và nền tảng</b>{chatCampaign.statistics.totalSlots} bài · {chatCampaign.platforms.join(' + ')}</div>
        </div>
      </section>}

      {showSetup && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-xs md:p-6"><div className={`my-auto w-full rounded-2xl bg-white p-5 shadow-2xl md:p-6 ${showAdvancedSetup ? 'max-w-5xl' : 'max-w-xl'}`}>
        {!showAdvancedSetup && (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold text-blue-600">Bước {setupStep} / 4</p>
                <h3 className="text-lg font-bold text-slate-900">{setupTitles[setupStep - 1]}</h3>
                <p className="mt-1 text-sm text-slate-500">{setupDescriptions[setupStep - 1]}</p>
              </div>
              <button type="button" onClick={closeSetup} aria-label="Đóng thiết lập" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="mt-5 flex gap-1.5" aria-hidden="true">{setupTitles.map((title, index) => <span key={title} className={`h-1 flex-1 rounded-full ${index < setupStep ? 'bg-blue-600' : 'bg-slate-200'}`} />)}</div>

            {setupStep === 1 && <div className="mt-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {(['Facebook', 'TikTok'] as const).map((platform) => <button key={platform} type="button" onClick={() => togglePlatform(platform)} className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${selectedPlatforms.includes(platform) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:border-blue-300'}`}>
                  <img src={platform === 'Facebook' ? '/facebook-logo.svg' : '/tiktok-logo.svg'} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />{platform}
                </button>)}
                <div aria-disabled="true" className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-400"><img src="/zalo-logo.svg" alt="" aria-hidden="true" className="h-8 w-8 object-contain grayscale opacity-50" />Zalo</div>
              </div>
              <p className="text-xs text-slate-500">Có thể chọn cả Facebook và TikTok cho chiến dịch nhiều bài.</p>
              <div className="space-y-3">
                {selectedPlatforms.map((platform) => (
                  <label key={platform} className="block text-sm text-slate-700">
                    {platform === 'Facebook' ? 'Facebook Page' : 'Kênh TikTok'}
                    <select
                      value={integrationIds[platform] || ''}
                      onChange={(event) => {
                        manuallySelectedIntegrations.current[platform] = true;
                        setIntegrationIds((current) => ({ ...current, [platform]: event.target.value }));
                      }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="" disabled={!(platform === 'Facebook' && (userProfile?.facebookIntegration?.isConnected || canUseLocalMockFacebookPage)) && !(platform === 'TikTok' && canUseLocalMockTikTokAccount)}>{platform === 'Facebook' && userProfile?.facebookIntegration?.isConnected ? userProfile.facebookIntegration.pageName || 'Facebook Page cá nhân' : platform === 'Facebook' && canUseLocalMockFacebookPage ? 'Fanpage giả lập (local)' : platform === 'TikTok' && canUseLocalMockTikTokAccount ? 'Tài khoản TikTok giả lập (local)' : 'Chưa có tài khoản được kết nối'}</option>
                      {integrations.filter((item) => item.platform === platform).map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>}

            {setupStep === 2 && <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => { setCreationMode('single'); setSelectedPlatforms([selectedPlatform]); setImageMode(selectedPlatform === 'TikTok' ? 'order' : 'ai'); setStartDate(today); setEndDate(today); changePostsPerDay(1); }} className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition ${creationMode === 'single' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:border-blue-300'}`}><Zap size={26} /><b className="text-sm">Một bài đăng</b><span className="text-xs font-normal text-slate-500">Tạo một bài, xác nhận rồi đăng</span></button>
              <button type="button" onClick={() => { setCreationMode('campaign'); setImageMode('order'); if (startDate === endDate) setEndDate(nextWeek); }} className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition ${creationMode === 'campaign' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:border-blue-300'}`}><CalendarClock size={26} /><b className="text-sm">Chiến dịch nhiều bài</b><span className="text-xs font-normal text-slate-500">Tạo kế hoạch và lịch đăng</span></button>
            </div>}

            {setupStep === 3 && <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setImageMode('ai')} className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition ${imageMode === 'ai' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:border-blue-300'}`}><Sparkles size={26} /><b className="text-sm">AI tạo ảnh</b><span className="text-xs font-normal text-slate-500">Tạo media khi chuẩn bị bài</span></button>
              <button type="button" onClick={() => setImageMode('order')} className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition ${imageMode === 'order' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:border-blue-300'}`}><FolderOpen size={26} /><b className="text-sm">Media của bạn</b><span className="text-xs font-normal text-slate-500">Nhập từ Drive hoặc tải lên sau</span></button>
            </div>}

            {setupStep === 4 && <div className="mt-6 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {isSinglePost ? <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">Một bài sẽ bắt đầu xử lý sau khi bạn xem bản nháp và xác nhận.</p> : <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-700">Bắt đầu<input type="date" min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-semibold text-slate-700">Kết thúc<input type="date" min={startDate || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                </div>
                <label className="block text-xs font-semibold text-slate-700">Số bài mỗi ngày<select value={postsPerDay} onChange={(event) => changePostsPerDay(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} bài</option>)}</select></label>
                <div><p className="mb-1.5 text-xs font-semibold text-slate-700">Giờ đăng</p><div className="grid grid-cols-2 gap-2">{postingTimes.map((time, index) => <input key={index} type="time" value={time} onChange={(event) => setPostingTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} aria-label={`Giờ đăng bài ${index + 1}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />)}</div></div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={publishMode === 'auto'} onChange={(event) => setPublishMode(event.target.checked ? 'auto' : 'manual')} className="accent-blue-600" /> Tự động đăng sau khi nội dung sẵn sàng</label>
              </>}
              {isSinglePost && isTikTokCampaign && <div className="rounded-xl border border-slate-200 p-3"><input ref={tiktokVideoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleTikTokVideoUpload(file); }} /><button type="button" onClick={() => tiktokVideoInputRef.current?.click()} disabled={uploadingTikTokVideo} className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700"><Upload size={16} />{uploadingTikTokVideo ? `Đang tải video ${tiktokUploadProgress}%` : uploadedTikTokVideo ? uploadedTikTokVideo.name : 'Tải video TikTok lên (hoặc nhập sau từ Drive)'}</button></div>}
              <p className="text-xs text-slate-500">{isSinglePost ? '1 bài đăng' : `${totalPosts} bài dự kiến`} · {selectedPlatforms.join(' + ')} · Asia/Bangkok</p>
              <button type="button" onClick={() => { setWizardStep(4); setShowAdvancedSetup(true); }} className="text-xs font-semibold text-blue-700 hover:underline">Tùy chọn lịch chi tiết</button>
            </div>}

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setupStep === 1 ? closeSetup() : setSetupStep(setupStep === 4 && isTikTokCampaign ? 2 : (setupStep - 1) as 1 | 2 | 3 | 4)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Quay lại</button>
              {setupStep < 4 ? <button type="button" onClick={() => { if (setupStep === 2 && !creationMode) return toast.warning('Vui lòng chọn một bài đăng hoặc chiến dịch nhiều bài.'); setSetupStep(setupStep === 2 && isTikTokCampaign ? 4 : (setupStep + 1) as 1 | 2 | 3 | 4); }} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Tiếp tục</button> : <button type="button" onClick={handleCreateCampaign} disabled={loading || uploadingTikTokVideo || !dayCount || totalPosts > 450} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{loading && <Loader2 size={14} className="animate-spin" />}Tạo bản nháp</button>}
            </div>
          </div>
        )}
        {showAdvancedSetup && <>
        <div className="mb-4 flex items-center justify-between"><div><h3 className="text-base font-extrabold text-slate-900">Tùy chọn lịch chi tiết</h3><p className="mt-1 text-xs text-slate-500">Thiết lập thêm khi lịch mặc định chưa phù hợp.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setShowAdvancedSetup(false)} className="text-xs font-semibold text-blue-700 hover:underline">Quay lại</button><button type="button" onClick={closeSetup} aria-label="Đóng thiết lập" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:p-6">
        <div>
          {/* Stepper Header Bar */}
          <div className="mb-6 border-b border-slate-150 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {[
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
                      const canOpen = s.step === 2
                        || (s.step >= 3 && initialBrief.trim() && creationMode);
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
                      {isCompleted ? <Check size={14} /> : s.step}
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
                  Chọn nền tảng truyền thông:
                </h3>
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Facebook */}
                  <button
                    type="button"
                    onClick={() => togglePlatform('Facebook')}
                    className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-xs font-extrabold shadow-2xs cursor-pointer transition-all ${selectedPlatforms.includes('Facebook')
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                       : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-700'
                      }`}
                  >
                    <img src="/facebook-logo.svg" alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                    <span>Facebook</span>
                  </button>

                  {/* Zalo - Disabled */}
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-1.5 text-xs font-semibold text-slate-400 opacity-60 cursor-not-allowed"
                  >
                    <img src="/zalo-logo.svg" alt="" aria-hidden="true" className="h-4 w-4 object-contain grayscale opacity-60" />
                    <span>Zalo</span>
                  </button>

                  {/* TikTok */}
                  <button
                    type="button"
                    onClick={() => { togglePlatform('TikTok'); setImageMode('order'); }}
                    className={`flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-xs font-extrabold shadow-2xs cursor-pointer transition-all ${selectedPlatforms.includes('TikTok')
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                       : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-700'
                      }`}
                  >
                    <img src="/tiktok-logo.svg" alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                    <span>TikTok</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    Chọn loại hình nội dung:
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCreationMode('single');
                      setSelectedPlatforms([selectedPlatform]);
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700"><Zap size={10} />Đăng sau khi xác nhận</span>
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700"><Rocket size={10} />Lịch tự động</span>
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
                  {isTikTokCampaign ? 'Chọn nguồn video cho bài viết' : 'Chọn nguồn ảnh cho bài viết'}
                </label>
                <div className={`grid gap-3 ${isTikTokCampaign && isSinglePost ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                      <span className="block text-xs font-bold text-slate-800">{isTikTokCampaign ? 'TikTok không nhận ảnh' : 'AI tự vẽ ảnh'}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setImageMode('order');
                      setUploadedTikTokVideo(null);
                    }}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${imageMode === 'order'
                      ? 'border-indigo-400 bg-indigo-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className={`rounded-lg p-2 ${imageMode === 'order' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <FolderOpen size={16} />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-800">{isTikTokCampaign ? 'Nhập video từ Drive' : 'Nhập ảnh, video từ Drive'}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{isTikTokCampaign ? 'Nhập video từ Google Drive trong chi tiết chiến dịch' : 'Nhập media từ Google Drive hoặc tải lên trong chi tiết chiến dịch'}</span>
                    </div>
                  </button>

                  {isTikTokCampaign && isSinglePost && (
                    <div className={`rounded-xl border p-3.5 ${uploadedTikTokVideo ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                      <input
                        ref={tiktokVideoInputRef}
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) void handleTikTokVideoUpload(file);
                        }}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`rounded-lg p-2 ${uploadedTikTokVideo ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {uploadingTikTokVideo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          </div>
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800">Tải video trực tiếp cho bài này</span>
                            <span className="mt-0.5 block text-[10px] text-slate-500">MP4, MOV hoặc WebM · tối đa 100MB</span>
                            {uploadedTikTokVideo && <span className="mt-1 block truncate text-[10px] font-bold text-emerald-700">Đã chọn: {uploadedTikTokVideo.name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {uploadedTikTokVideo && (
                            <button
                              type="button"
                              disabled={uploadingTikTokVideo}
                              onClick={() => setUploadedTikTokVideo(null)}
                              className="text-[10px] font-bold text-slate-500 hover:text-red-600 disabled:opacity-50"
                            >
                              Bỏ video
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={uploadingTikTokVideo}
                            onClick={() => tiktokVideoInputRef.current?.click()}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-extrabold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {uploadingTikTokVideo ? 'Đang tải video lên...' : uploadedTikTokVideo ? 'Thay video' : 'Chọn video'}
                          </button>
                        </div>
                      </div>
                      {uploadingTikTokVideo && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                            <span>Đang tải trực tiếp lên bộ nhớ video...</span>
                            <span>{tiktokUploadProgress}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
                              style={{ width: `${tiktokUploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                        ? (uploadedTikTokVideo
                          ? 'Video đã tải sẽ được gắn vào bài này. Hệ thống tạo nội dung, kiểm tra video, sau đó chờ bạn xác nhận xuất bản TikTok.'
                          : 'Hệ thống sẽ tạo nội dung TikTok và chờ video từ Google Drive. Video chỉ sẵn sàng đăng sau khi được nhập, kiểm tra và xác nhận xuất bản.')
                        : 'Sau khi bạn xác nhận, hệ thống sẽ tạo bài viết và đăng lên Facebook Page.'}
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
                      {integrations.filter((item) => item.platform === selectedPlatform).map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
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
                          {integrations.filter((item) => item.platform === selectedPlatform).map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
                          {!integrations.length && (isTikTokCampaign || !userProfile?.facebookIntegration?.isConnected) && (
                            <option value="">{missingIntegrationLabel}</option>
                          )}
                        </select>
                      </div>
                      {selectedPlatforms.slice(1).map((platform) => (
                        <div key={platform}>
                          <label className="mb-1.5 mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            {platform} account
                          </label>
                          <select
                            value={integrationIds[platform] || ''}
                            onChange={(event) => setIntegrationIds((current) => ({ ...current, [platform]: event.target.value }))}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-hidden"
                          >
                            <option value="">Select an account</option>
                            {integrations.filter((item) => item.platform === platform).map((item) => <option key={item._id} value={item._id}>{item.displayName || item.username}</option>)}
                          </select>
                        </div>
                      ))}


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
                                timeZone: CAMPAIGN_TIMEZONE,
                                weekday: 'long',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              }).format(parseDateKey(date) || new Date());

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
              onClick={() => wizardStep === 2 ? setShowAdvancedSetup(false) : setWizardStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)}
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
                if (wizardStep === 2 && !creationMode) {
                  toast.warning('Vui lòng chọn một bài đăng hoặc chiến dịch nhiều bài.');
                  return;
                }
                setWizardStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
              }}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer flex items-center gap-1.5 ml-auto"
            >
              <span className="inline-flex items-center gap-1">Tiếp tục (Bước {wizardStep + 1}/4) <ArrowRight size={14} /></span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateCampaign}
              disabled={loading || !creationMode || !initialBrief.trim() || !dayCount || (!isSinglePost && totalPosts > 450) || (isTikTokCampaign && !integrationIds.TikTok && !canUseLocalMockTikTokAccount)}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 transition cursor-pointer flex items-center gap-2 ml-auto"
            >
              {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <Sparkles size={16} />}
              <span>{loading
                ? (isSinglePost ? 'AI đang lập kế hoạch một bài...' : 'AI đang lập chiến lược và danh sách bài...')
                : (isSinglePost ? 'Tạo bản nháp 1 bài' : `Tạo kế hoạch chi tiết ${totalPosts || 0} bài`)}</span>
            </button>
          )}
        </div>
      </section>
      </>}
      </div></div>}

      <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:flex lg:max-h-[calc(100vh-12rem)] lg:flex-col lg:rounded-none lg:border-0 lg:border-r lg:border-slate-200">
        <button type="button" onClick={startNewConversation} aria-pressed={newConversationSelected} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${newConversationSelected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><Plus size={16} /> Chiến dịch mới</button>
        <div className="mt-5 flex items-center justify-between gap-2 px-2">
          <h3 className="text-xs font-bold text-slate-700">Chiến dịch đã tạo</h3>
          {loadingCampaigns ? <Loader2 size={14} className="animate-spin text-blue-600" /> : <span className="text-[10px] text-slate-400">{totalCampaigns}</span>}
        </div>

        {/* Filter Status Tabs */}
        {campaigns.length > 0 && <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as 'all' | CampaignStatus)} aria-label="Lọc chiến dịch" className="mx-2 mt-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
          <option value="all">Tất cả</option>
          <option value="draft">Bản nháp</option>
          <option value="active">Đang chạy</option>
          <option value="paused">Tạm dừng</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
          <option value="failed">Có lỗi</option>
        </select>}

        {!loadingCampaigns && campaigns.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-slate-400">Chưa có chiến dịch nào. Nhập ý tưởng ở khung bên phải để bắt đầu.</p>
        ) : !loadingCampaigns && filteredCampaigns.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-slate-400">
            Không tìm thấy chiến dịch nào với trạng thái này.
          </div>
        ) : (
          <div className="mt-3 min-h-0 space-y-1 overflow-y-auto">
            {filteredCampaigns.map((campaign) => (
              <CampaignItem
                key={campaign._id}
                campaign={campaign}
                statusLabel={statusLabel}
                onOpenDetail={(campaignId) => setSelectedCampaignId(campaignId)}
                onOpenChat={(campaignId) => void openConversation(campaignId)}
                onLifecycle={handleLifecycle}
                compact
                selected={chatCampaign?._id === campaign._id}
              />
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100 select-none">
                <button
                  type="button"
                  onClick={() => void loadCampaigns(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition cursor-pointer"
                >
                  Trang trước
                </button>
                <span className="text-[10px] text-slate-500 font-medium">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => void loadCampaigns(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition cursor-pointer"
                >
                  Trang sau
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

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
          generating: 'AI đang hình thành ý tưởng...',
          researching: 'AI đang phân tích xu hướng...',
          writing: 'AI đang viết bài...',
          scoring: 'AI đang đánh giá chất lượng...',
          awaiting_assets: 'Chờ media từ Drive',
          generating_media: 'AI đang chuẩn bị media...',
          verifying: 'AI đang kiểm tra chất lượng...',
          pending_approval: 'Chờ duyệt',
          ready_to_publish: 'Sẵn sàng đăng',
          publishing: 'Đang kết nối nền tảng để đăng...',
          published: 'Đã đăng thành công',
          failed: 'Thất bại',
          cancelled: 'Đã hủy',
          skipped: 'Đã bỏ qua',
          retrying: 'AI đang thử lại tác vụ...',
          needs_attention: 'Cần chú ý',
        }}
        onActivate={async (campaignId) => {
          const result = await marketingCampaignService.activate(campaignId);
          setCampaigns((current) => current.map((item) => item._id === result.campaign._id ? result.campaign : item));
          setChatCampaign((current) => current?._id === result.campaign._id ? result.campaign : current);
          setChatMessages((current) => chatCampaign?._id === result.campaign._id
            ? [...current, { role: 'assistant', text: 'Đã xác nhận. Hệ thống bắt đầu chuẩn bị và đăng bài theo thiết lập.', campaignId }]
            : current);
          const detail = await marketingCampaignService.detail(campaignId);
          setCampaignDetail({ campaign: detail.campaign, slots: detail.slots as CampaignSlot[] });
          const preparationMessage = result.preparation.enqueued > 0
            ? ` ${result.preparation.enqueued} bài đã được đưa vào hàng đợi chuẩn bị.`
            : ' Worker sẽ tự nhận bài theo lịch đã xác nhận.';
          toast.success(`Đã khởi chạy chiến dịch.${preparationMessage}`);
          void loadCampaigns(1);
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
