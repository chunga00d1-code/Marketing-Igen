import React, { useState, useEffect, lazy, Suspense } from "react";
import {
  Zap,
  Trash2,
  Calendar,
  RefreshCw,
  Facebook,
  ChevronDown
} from "lucide-react";
import { MarketingSubTabType, ContentApprovalCard } from "../types";
import { buildFacebookPostUrl, buildFaithfulMediaPrompt, marketingService, extractDraftContent, sanitizeHumanVideoVoiceScript, stripHumanVideoOutlineSections } from "../services/marketingService";
import { toast } from "./Toast";
import { useAuth } from "../context/AuthContext";
import { parseFirebaseError } from "../utils/firebaseErrorParser";
import { socialIntegrationService, SocialIntegration } from "../services/socialIntegrationService";
import { useSubTabRouter } from "../hooks/useSubTabRouter";
import { estimateAudioDuration } from "../utils/usage-tracker";
import { isRenderableVideoUrl } from "../components/marketing/CardWidgets";

// Lazy-loaded subcomponents
const IdeationTab = lazy(() => import("../components/marketing/IdeationTab"));
const ApprovalTab = lazy(() => import("../components/marketing/ApprovalTab"));
const CalendarTab = lazy(() => import("../components/marketing/CalendarTab"));
const ContentStudioWorkspace = lazy(() =>
  import("../components/content-studio/ContentStudioWorkspace").then((module) => ({
    default: module.ContentStudioWorkspace,
  }))
);

export default function MarketingTab() {
  const { userProfile } = useAuth();
  const isUserRole = userProfile?.role === "user" || userProfile?.role === "manager";
  const MARKETING_SUB_TAB_ROUTES = [
    { slug: "y-tuong", value: "LÊN Ý TƯỞNG AI" as MarketingSubTabType },
    { slug: "duyet-noi-dung", value: "DUYỆT NỘI DUNG" as MarketingSubTabType },
    { slug: "lich-dang", value: "LỊCH ĐĂNG CONTENT" as MarketingSubTabType },
    { slug: "xuong-noi-dung", value: "XƯỞNG NỘI DUNG" as MarketingSubTabType },
  ] as const;
  const [subTab, setSubTab] = useSubTabRouter<MarketingSubTabType>(MARKETING_SUB_TAB_ROUTES as any, "LÊN Ý TƯỞNG AI");

  const CONTENT_STUDIO_SUB_TAB = MARKETING_SUB_TAB_ROUTES[3].value;
  const DEFAULT_HUMAN_VOICE_DURATION_SECONDS = 45;

  // AI Media Generation States
  const [publishingTikTokId, setPublishingTikTokId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [contentStudioParams, setContentStudioParams] = useState<{
    tab: 'image' | 'video' | 'voice';
    prompt: string;
    cardId: string;
    image?: string;
    autoTrigger?: boolean;
    videoSubTab?: 'veo' | 'heygen' | 'edit-video';
    title?: string;
    description?: string;
    engineType?: string;
  } | null>(null);

  // Lightbox Preview States
  const [activeLightboxCard, setActiveLightboxCard] = useState<ContentApprovalCard | null>(null);
  const [activeLightboxType, setActiveLightboxType] = useState<'image' | 'video' | null>(null);
  const [activeLightboxUrl, setActiveLightboxUrl] = useState<string | null>(null);
  const [showDeleteMediaConfirm, setShowDeleteMediaConfirm] = useState(false);

  // Scheduler States
  const [schedulingCard, setSchedulingCard] = useState<ContentApprovalCard | null>(null);
  const [scheduleDate, setScheduleDate] = useState("2026-10-15");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isScheduling, setIsScheduling] = useState(false);
  const [availableIntegrations, setAvailableIntegrations] = useState<SocialIntegration[]>([]);
  const [scheduleIntegrationId, setScheduleIntegrationId] = useState("");
  const [loadingIntegrationsForSchedule, setLoadingIntegrationsForSchedule] = useState(false);
  const [companySocialIntegrations, setCompanySocialIntegrations] = useState<SocialIntegration[]>([]);
  const [publishMode, setPublishMode] = useState<"instant" | "scheduled">("instant");
  const [publishQuantity, setPublishQuantity] = useState(1);

  const getPublishingAccounts = () => {
    const list: Array<{
      id: string;
      displayName: string;
      username: string;
      accessToken?: string;
      isMock?: boolean;
      platform: string;
    }> = [];

    const platform = schedulingCard?.channel || "";

    if (platform === "Facebook") {
      if (userProfile?.facebookIntegration?.isConnected && userProfile.facebookIntegration.pageId) {
        list.push({
          id: "personal",
          displayName: userProfile.facebookIntegration.pageName || "Fanpage cá nhân",
          username: userProfile.facebookIntegration.pageId,
          accessToken: userProfile.facebookIntegration.pageAccessToken,
          isMock: !!userProfile.facebookIntegration.isMock,
          platform: "Facebook",
        });
      }
    } else if (platform === "TikTok") {
      if (userProfile?.tiktokIntegration?.isConnected && userProfile.tiktokIntegration.username) {
        list.push({
          id: "personal",
          displayName: userProfile.tiktokIntegration.displayName || "Kênh TikTok cá nhân",
          username: userProfile.tiktokIntegration.username,
          accessToken: userProfile.tiktokIntegration.accessToken,
          isMock: !!userProfile.tiktokIntegration.isMock,
          platform: "TikTok",
        });
      }
    } else if (platform === "Zalo") {
      if (userProfile?.zaloIntegration?.isConnected && userProfile.zaloIntegration.username) {
        list.push({
          id: "personal",
          displayName: userProfile.zaloIntegration.displayName || "Zalo OA cá nhân",
          username: userProfile.zaloIntegration.username,
          accessToken: userProfile.zaloIntegration.accessToken,
          isMock: !!userProfile.zaloIntegration.isMock,
          platform: "Zalo",
        });
      }
    }

    availableIntegrations.forEach(item => {
      if (item.platform === platform && item.isConnected && item.username) {
        if (!list.some(p => p.username === item.username)) {
          list.push({
            id: item._id || "company_" + item.username,
            displayName: item.displayName || `${platform} OA/Page ${item.username}`,
            username: item.username,
            accessToken: item.accessToken,
            isMock: !!item.isMock,
            platform: platform,
          });
        }
      }
    });

    return list;
  };

  // Synchronize integration selection when integrations list loads
  useEffect(() => {
    if (schedulingCard) {
      const options = getPublishingAccounts();
      if (options.length > 0) {
        if (!options.some(opt => opt.id === scheduleIntegrationId)) {
          setScheduleIntegrationId(options[0].id);
        }
      } else {
        setScheduleIntegrationId("");
      }
    }
  }, [availableIntegrations, userProfile, schedulingCard]);

  // Shared Approval Cards State
  const [approvalCards, setApprovalCards] = useState<ContentApprovalCard[]>([]);

  // Real-time Firestore Live Synchronization
  useEffect(() => {
    const unsubscribe = marketingService.subscribeToContents(
      (cards) => {
        setApprovalCards(cards);
      },
      (error) => {
        console.error("Lỗi đồng bộ dữ liệu marketing:", error);
      },
      userProfile?.uid,
      userProfile?.role
    );

    return () => unsubscribe();
  }, [userProfile?.uid, userProfile?.role]);

  useEffect(() => {
    let cancelled = false;

    const loadCompanySocialIntegrations = async () => {
      try {
        const list = await socialIntegrationService.getIntegrations();
        if (!cancelled) {
          setCompanySocialIntegrations(list.filter((item) => item.isConnected));
        }
      } catch (error) {
        console.error("Khong the tai kenh doanh nghiep cho marketing publish:", error);
      }
    };

    void loadCompanySocialIntegrations();

    return () => {
      cancelled = true;
    };
  }, []);

  const companyTikTokIntegration =
    companySocialIntegrations.find((item) => item.platform === "TikTok" && item.isConnected) || null;
  const effectiveTikTokIntegration = userProfile?.tiktokIntegration?.isConnected
    ? {
      isConnected: true,
      username: userProfile.tiktokIntegration.username,
      displayName: userProfile.tiktokIntegration.displayName,
      accessToken: userProfile.tiktokIntegration.accessToken,
      privacyLevel: userProfile.tiktokIntegration.privacyLevel,
      isMock: userProfile.tiktokIntegration.isMock,
      source: "personal" as const,
    }
    : companyTikTokIntegration
      ? {
        isConnected: true,
        username: companyTikTokIntegration.username || "",
        displayName: companyTikTokIntegration.displayName,
        accessToken: companyTikTokIntegration.accessToken,
        privacyLevel: "SELF_ONLY",
        isMock: companyTikTokIntegration.isMock,
        integrationId: companyTikTokIntegration._id,
        source: "company" as const,
      }
      : null;

  // Load integrations dynamically when a card is selected for scheduling
  useEffect(() => {
    if (!schedulingCard) {
      setAvailableIntegrations([]);
      setScheduleIntegrationId("");
      return;
    }

    const loadIntegrationsForSchedule = async () => {
      setLoadingIntegrationsForSchedule(true);
      try {
        const platformMap: Record<string, string> = {
          "Facebook": "Facebook",
          "TikTok": "TikTok",
          "Zalo": "Zalo"
        };
        const platform = platformMap[schedulingCard.channel];
        if (platform) {
          const list = await socialIntegrationService.getIntegrations(platform);
          const connectedList = list.filter(item => item.isConnected);
          setAvailableIntegrations(connectedList);
        } else {
          setAvailableIntegrations([]);
        }
      } catch (err) {
        console.error("Lỗi khi tải tài khoản liên kết để lên lịch:", err);
        toast.error("Không thể tải danh sách tài khoản liên kết.");
        setAvailableIntegrations([]);
      } finally {
        setLoadingIntegrationsForSchedule(false);
      }
    };

    loadIntegrationsForSchedule();
  }, [schedulingCard]);

  const updateCardStatus = async (id: string, newStatus: "draft" | "pending" | "approved" | "scheduled" | "published") => {
    try {
      await marketingService.updateCardStatus(id, newStatus);
      setApprovalCards(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      toast.success(`Đã cập nhật trạng thái bài viết.`);
    } catch (e) {
      toast.error("Không thể cập nhật trạng thái.");
    }
  };

  const handleConfirmPublishOrSchedule = async () => {
    if (!schedulingCard) return;

    const selectedAcc = getPublishingAccounts().find(a => a.id === scheduleIntegrationId);
    if (!selectedAcc) {
      toast.error("Vui lòng chọn tài khoản liên kết hợp lệ.");
      return;
    }

    setIsScheduling(true);
    try {
      if (publishMode === "instant") {
        if (schedulingCard.channel === "Facebook") {
          const pageToken = selectedAcc.accessToken;
          const pageId = selectedAcc.username;
          if (!pageToken || !pageId) {
            throw new Error("Không lấy được Page Token hoặc Page ID.");
          }
          let lastPostId = "";
          for (let i = 0; i < publishQuantity; i++) {
            lastPostId = await marketingService.publishToFacebook(
              schedulingCard.id,
              pageToken,
              pageId,
              schedulingCard.bodyText,
              selectedAcc.isMock ?? false,
              schedulingCard.imageUrl || undefined,
              schedulingCard.videoUrl || undefined
            );
          }
          setApprovalCards(prev => prev.map(c => c.id === schedulingCard.id ? {
            ...c,
            status: "published",
            publishedAt: new Date().toISOString(),
            facebookPostId: lastPostId,
            postUrl: buildFacebookPostUrl(lastPostId)
          } : c));
          const countLabel = publishQuantity > 1 ? ` (x${publishQuantity})` : "";
          toast.success(`Đã đăng bài lên Facebook thành công${countLabel}! ${selectedAcc.isMock ? '(Demo)' : ''} ID: ${lastPostId.slice(-8)}`);
        } else if (schedulingCard.channel === "TikTok") {
          if (!schedulingCard.videoUrl) {
            throw new Error("Bài đăng TikTok cần có video. Hãy tạo video AI trước.");
          }
          const caption = extractDraftContent(schedulingCard.bodyText).slice(0, 2200);
          const publishResult = await marketingService.publishToTikTok(
            schedulingCard.id,
            caption,
            schedulingCard.videoUrl,
            selectedAcc.isMock ?? false,
            "SELF_ONLY",
            {
              integrationId: selectedAcc.id === "personal" ? undefined : selectedAcc.id,
              accessToken: selectedAcc.accessToken,
              username: selectedAcc.username,
            }
          );

          if (publishResult.status === "pending") {
            setApprovalCards((prev) =>
              prev.map((item) =>
                item.id === schedulingCard.id
                  ? {
                    ...item,
                    status: "processing",
                    tiktokPostId: publishResult.postId || item.tiktokPostId,
                    tiktokShareUrl: publishResult.shareUrl || item.tiktokShareUrl,
                  }
                  : item
              )
            );
            toast.success("Đã gửi video sang TikTok. Hệ thống đang chờ TikTok xử lý.");
          } else {
            setApprovalCards((prev) =>
              prev.map((item) =>
                item.id === schedulingCard.id
                  ? {
                    ...item,
                    status: "published",
                    publishedAt: new Date().toISOString(),
                    tiktokPostId: publishResult.postId || item.tiktokPostId,
                    tiktokShareUrl: publishResult.shareUrl || item.tiktokShareUrl,
                  }
                  : item
              )
            );
            toast.success(`Đã đăng video lên TikTok thành công! ${selectedAcc.isMock ? '(Demo)' : ''} ID: ${String(publishResult.postId || "").slice(-8)}`);
          }
        } else {
          toast.error(`Kênh "${schedulingCard.channel}" chưa hỗ trợ đăng tải trực tiếp.`);
        }
      } else {
        await marketingService.scheduleCard(
          schedulingCard.id,
          scheduleDate,
          scheduleTime,
          selectedAcc.id === "personal" ? undefined : selectedAcc.id
        );
        toast.success(`Đã lên lịch đăng bài "${schedulingCard.title}" thành công!`);
        setApprovalCards(prev => prev.map(c => c.id === schedulingCard.id ? {
          ...c,
          status: "scheduled",
          scheduledDate: scheduleDate,
          scheduledTime: scheduleTime,
          integrationId: selectedAcc.id === "personal" ? undefined : selectedAcc.id
        } : c));
      }
      setSchedulingCard(null);
      setPublishQuantity(1);
    } catch (e: any) {
      console.error("Lỗi khi xử lý bài đăng:", e);
      toast.error(e.message || "Lỗi khi xử lý bài đăng.");
    } finally {
      setIsScheduling(false);
    }
  };

  const deleteCard = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa bài viết này không?")) return;
    try {
      await marketingService.deleteCard(id);
      setApprovalCards(prev => prev.filter(c => c.id !== id));
      toast.success("Đã xóa bài viết.");
    } catch (e) {
      toast.error("Xóa bài viết thất bại.");
    }
  };

  const handleMediaSaved = (cardId: string, mediaUrl: string, type: 'image' | 'video') => {
    setApprovalCards(prev => prev.map(c => c.id === cardId ? {
      ...c,
      imageUrl: type === 'image' ? mediaUrl : c.imageUrl,
      videoUrl: type === 'video' ? mediaUrl : c.videoUrl
    } : c));
  };

  const handleOpenLightbox = (card: ContentApprovalCard, type: 'image' | 'video', url: string) => {
    if (type === "video" && !isRenderableVideoUrl(url)) {
      toast.info("Video đang xử lý, chưa có URL phát hợp lệ.");
      return;
    }
    setActiveLightboxCard(card);
    setActiveLightboxType(type);
    setActiveLightboxUrl(url);
  };

  const handleDeleteMedia = () => {
    if (!activeLightboxCard || !activeLightboxType) return;
    setShowDeleteMediaConfirm(true);
  };

  const handleConfirmDeleteMedia = async () => {
    if (!activeLightboxCard || !activeLightboxType) return;
    setShowDeleteMediaConfirm(false);
    try {
      await marketingService.updateCardMedia(null, activeLightboxType, [activeLightboxCard.id]);

      setApprovalCards(prev => prev.map(c => c.id === activeLightboxCard.id ? {
        ...c,
        imageUrl: activeLightboxType === 'image' ? null : c.imageUrl,
        videoUrl: activeLightboxType === 'video' ? null : c.videoUrl
      } : c));

      toast.success("Đã xóa phương tiện thành công!");
      setActiveLightboxCard(null);
      setActiveLightboxType(null);
      setActiveLightboxUrl(null);
    } catch (e: any) {
      console.error("Lỗi xóa phương tiện:", e);
      toast.error("Không thể xóa phương tiện lúc này.");
    }
  };

  const handlePublishToTikTok = async (card: ContentApprovalCard) => {
    const tiktok = effectiveTikTokIntegration;
    if (!tiktok?.isConnected) {
      toast.error("Chưa kết nối TikTok. Vui lòng vào Cài đặt → Liên kết MXH để kết nối.");
      return;
    }
    if (!card.videoUrl) {
      toast.error("Bài đăng TikTok cần có video. Hãy tạo video AI trước.");
      return;
    }
    setPublishingTikTokId(card.id);
    const integrationId = card.integrationId || tiktok.integrationId;
    const accessToken = tiktok.accessToken;
    const username = tiktok.username;
    try {
      const caption = extractDraftContent(card.bodyText).slice(0, 2200); // TikTok caption max 2200 chars
      const publishResult = await marketingService.publishToTikTok(
        card.id,
        caption,
        card.videoUrl,
        tiktok.isMock ?? false,
        tiktok.privacyLevel ?? 'SELF_ONLY',
        {
          integrationId,
          accessToken,
          username,
        }
      );
      const postId = String(publishResult.postId || "");
      if (publishResult.status === "pending") {
        setApprovalCards((prev) =>
          prev.map((item) =>
            item.id === card.id
              ? {
                ...item,
                status: "processing",
                tiktokPostId: publishResult.postId || item.tiktokPostId,
                tiktokShareUrl: publishResult.shareUrl || item.tiktokShareUrl,
              }
              : item
          )
        );
        toast.success("Da gui video sang TikTok. He thong dang cho TikTok xu ly.");
        return;
      }

      setApprovalCards((prev) =>
        prev.map((item) =>
          item.id === card.id
            ? {
              ...item,
              status: "published",
              publishedAt: new Date().toISOString(),
              tiktokPostId: publishResult.postId || item.tiktokPostId,
              tiktokShareUrl: publishResult.shareUrl || item.tiktokShareUrl,
            }
            : item
        )
      );
      toast.success(`Đã đăng video lên TikTok thành công! ${(tiktok.isMock ?? false) ? '(Demo)' : ''} ID: ${postId.slice(-8)}`);
    } catch (e: any) {
      console.error("Lỗi đăng TikTok:", e);
      toast.error(parseFirebaseError(e, "Không thể đăng bài lên TikTok. Vui lòng thử lại."));
    } finally {
      setPublishingTikTokId(null);
    }
  }

  const handlePublishCard = async (card: ContentApprovalCard) => {
    if (card.channel === 'TikTok') {
      await handlePublishToTikTok(card);
      return;
    }

    if (card.channel === 'Facebook') {
      const fb = userProfile?.facebookIntegration;
      if (!fb?.isConnected) {
        toast.error("Chưa kết nối Facebook Page. Vui lòng vào Cài đặt → Liên kết MXH để kết nối.");
        return;
      }
      if (!fb.pageId || !fb.pageAccessToken) {
        toast.error("Thông tin kết nối Facebook Page không đầy đủ.");
        return;
      }
      setIsPublishing(true);
      try {
        const postId = await marketingService.publishToFacebook(
          card.id,
          fb.pageAccessToken,
          fb.pageId,
          card.bodyText,
          fb.isMock ?? false,
          card.imageUrl || undefined,
          card.videoUrl || undefined
        );
        toast.success(`Đã đăng bài lên Facebook thành công! ${fb.isMock ? '(Demo)' : ''} ID: ${postId.slice(-8)}`);
      } catch (e: any) {
        console.error("Lỗi đăng Facebook:", e);
        toast.error("Không thể đăng bài lên Facebook. Vui lòng thử lại.");
      } finally {
        setIsPublishing(false);
      }
      return;
    }

    toast.error(`Kênh "${card.channel}" chưa hỗ trợ đăng tải trực tiếp.`);
  };;

  const handleInitAIGeneration = (card: ContentApprovalCard, type?: 'image' | 'video' | 'voice') => {
    // Clear auto-trigger cache so it can trigger exactly once upon redirection
    sessionStorage.removeItem(`autotrigger_image_${card.id}`);
    sessionStorage.removeItem(`autotrigger_video_${card.id}`);
    sessionStorage.removeItem(`autotrigger_voice_${card.id}`);

    const isHumanVideo = card.mediaType === 'human-video';
    const baseVoiceScript = stripHumanVideoOutlineSections(
      sanitizeHumanVideoVoiceScript(card.voiceScript || card.outline || extractDraftContent(card.bodyText) || "")
    );
    const bodyScript = stripHumanVideoOutlineSections(
      sanitizeHumanVideoVoiceScript(extractDraftContent(card.bodyText) || "")
    );
    const voiceScriptParts = [baseVoiceScript, bodyScript].filter(Boolean);
    const voiceScript = voiceScriptParts.join(" ").replace(/\s+/g, " ").trim();
    const estimatedVoiceDuration = estimateAudioDuration(voiceScript);

    const voiceTitle = `Voice cho ${card.title}`;
    const voiceDescription = [
      `Script tạo voice cho bài đăng kênh ${card.channel}.`,
      `Thời lượng mục tiêu khoảng ${DEFAULT_HUMAN_VOICE_DURATION_SECONDS} giây.`,
      `Thời lượng ước tính hiện tại khoảng ${estimatedVoiceDuration} giây.`,
      "Giữ nguyên sát nội dung chiến dịch, không tự ý thêm ý ngoài brief.",
      "Ưu tiên nhịp đọc rõ ràng, tự nhiên, đều tốc độ.",
      "Nếu dùng để tạo video người thật, hãy đọc đúng nhịp và không quá nhanh."
    ].join(" ");
    const selectedType = type ?? (
      isHumanVideo ? 'voice' :
        card.mediaType === 'video' ? 'video' :
          card.mediaType === 'image' ? 'image' :
            (card.channel === 'TikTok' ? 'video' : 'image')
    );

    if (isHumanVideo) {
      const isAvatarThree = card.engineType === 'avatar_iii';
      const isMyVoice = isAvatarThree || card.usePersonalVoice;
      if (isMyVoice) {
        setContentStudioParams({
          tab: 'video',
          videoSubTab: 'heygen',
          prompt: voiceScript,
          cardId: card.id,
          image: card.referenceImage,
          autoTrigger: false,
          title: voiceTitle,
          description: voiceDescription,
          engineType: card.engineType,
          usePersonalVoice: card.usePersonalVoice,
        });
        setSubTab(CONTENT_STUDIO_SUB_TAB);
        return;
      }

      void marketingService.updateCard(card.id, {
        voiceScript,
        voiceTitle,
        voiceDescription,
        humanDurationSeconds: DEFAULT_HUMAN_VOICE_DURATION_SECONDS,
      }).catch((error) => {
        console.error("Không thể lưu metadata voice vào card:", error);
      });

      setApprovalCards((prev) =>
        prev.map((item) =>
          item.id === card.id
            ? {
              ...item,
              voiceScript,
              voiceTitle,
              voiceDescription,
              humanDurationSeconds: DEFAULT_HUMAN_VOICE_DURATION_SECONDS,
            }
            : item
        )
      );

      setContentStudioParams({
        tab: 'voice',
        prompt: voiceScript,
        cardId: card.id,
        image: card.referenceImage,
        autoTrigger: false,
        videoSubTab: 'heygen',
        title: voiceTitle,
        description: voiceDescription,
      });
      setSubTab(CONTENT_STUDIO_SUB_TAB);
      return;
    }

    let cleanText = "";
    if (selectedType === 'voice') {
      cleanText = stripHumanVideoOutlineSections(
        sanitizeHumanVideoVoiceScript(card.voiceScript || card.outline || extractDraftContent(card.bodyText) || "")
      );
    } else {
      cleanText = buildFaithfulMediaPrompt(card, selectedType === "video" ? "video" : "image");
      if (!cleanText) {
        if (selectedType === 'video') {
          cleanText = card.outline || card.bodyText || "";
        } else {
          cleanText = extractDraftContent(card.bodyText);
        }
      }
    }

    setContentStudioParams({
      tab: selectedType,
      prompt: cleanText,
      cardId: card.id,
      image: card.referenceImage,
      autoTrigger: true
    });
    setSubTab(CONTENT_STUDIO_SUB_TAB);
  };

  return (
    <div className="flex flex-col h-full bg-white max-h-[85vh] overflow-hidden" id="marketing_tab_wrapper">
      <h1 className="sr-only">Chiến dịch Marketing - {subTab}</h1>

      {/* Sub Tabs control header switcher */}
      <div className="border-b border-gray-200 bg-gray-50/50 p-2 text-xs flex justify-between shrink-0" id="marketing_sub_tabs_switch">
        <div className="flex gap-2">
          {["LÊN Ý TƯỞNG AI", "DUYỆT NỘI DUNG", "LỊCH ĐĂNG CONTENT", "XƯỞNG NỘI DUNG"].map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab as MarketingSubTabType)}
              className={`px-4 py-2 rounded-lg border font-bold uppercase transition-all tracking-wide ${subTab === tab
                ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

      </div>

      <div className="flex-1 p-6 overflow-y-auto" id="marketing_tab_content">
        <Suspense fallback={<TabLoader label="Đang tải dữ liệu marketing..." />}>
          {/* SUB TAB 1: LÊN Ý TƯỞNG AI */}
          <div style={{ display: subTab === "LÊN Ý TƯỞNG AI" ? "block" : "none" }}>
            <IdeationTab
              userProfile={userProfile}
              setApprovalCards={setApprovalCards}
              setSubTab={setSubTab}
            />
          </div>

          {/* SUB TAB 2: DUYỆT NỘI DUNG */}
          {subTab === "DUYỆT NỘI DUNG" && (
            <ApprovalTab
              userProfile={userProfile}
              tiktokIntegration={effectiveTikTokIntegration}
              isUserRole={isUserRole}
              approvalCards={approvalCards}
              setApprovalCards={setApprovalCards}
              updateCardStatus={updateCardStatus}
              deleteCard={deleteCard}
              handleInitAIGeneration={handleInitAIGeneration}
              handleOpenLightbox={handleOpenLightbox}
              handlePublishToTikTok={handlePublishToTikTok}
              publishingTikTokId={publishingTikTokId}
              setSchedulingCard={(card) => {
                setSchedulingCard(card);
                setPublishMode("scheduled");
                if (card) {
                  setScheduleDate(new Date().toISOString().split("T")[0]);
                  setScheduleTime("09:00");
                }
              }}
              setScheduleDate={setScheduleDate}
              setScheduleTime={setScheduleTime}
              onPublishToPlatform={async (card) => {
                setSchedulingCard(card);
                setPublishMode("instant");
              }}
              isPublishing={isPublishing}
            />
          )}

          {/* SUB TAB 3: LỊCH ĐĂNG CONTENT */}
          {subTab === "LỊCH ĐĂNG CONTENT" && (
            <CalendarTab
              isUserRole={isUserRole}
              approvalCards={approvalCards}
            />
          )}

          {/* SUB TAB 4: XƯỞNG NỘI DUNG */}
          {subTab === "XƯỞNG NỘI DUNG" && (
            <ContentStudioWorkspace
              initialParams={contentStudioParams}
              onClearParams={() => setContentStudioParams(null)}
              onMediaSaved={handleMediaSaved}
            />
          )}
        </Suspense>
      </div>

      {/* Glassmorphic Lightbox Preview modal */}
      {activeLightboxCard && activeLightboxUrl && (activeLightboxType !== "video" || isRenderableVideoUrl(activeLightboxUrl)) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden text-left flex flex-col md:flex-row max-h-[85vh]">

            {/* Left side: Media preview */}
            <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 relative min-h-[300px]">
              {activeLightboxType === "image" ? (
                <img
                  src={activeLightboxUrl}
                  alt="AI Preview"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg animate-scaleIn"
                />
              ) : (
                <video
                  src={activeLightboxUrl}
                  controls
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded-lg shadow-lg bg-transparent"
                />
              )}
            </div>

            {/* Right side: Prompt details & actions */}
            <div className="w-full md:w-80 bg-slate-900/90 text-white p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-bold text-[10px] tracking-wide uppercase">
                    Preview Phương Tiện
                  </span>
                  <button
                    onClick={() => {
                      setActiveLightboxCard(null);
                      setActiveLightboxType(null);
                      setActiveLightboxUrl(null);
                      setShowDeleteMediaConfirm(false);
                    }}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-sm tracking-tight text-slate-100">{activeLightboxCard.title}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Kênh đăng: {activeLightboxCard.channel}</p>
                </div>

              </div>

              <div className="pt-4 border-t border-white/15">
                <button
                  onClick={handleDeleteMedia}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 border border-red-900/50 hover:border-red-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa phương tiện</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {showDeleteMediaConfirm && activeLightboxCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-gray-200/50 shadow-2xl w-full max-w-sm overflow-hidden font-sans animate-scaleIn">
            <div className="p-6 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4 border border-red-100">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <h4 className="font-bold text-gray-800 text-base mb-2">Xóa phương tiện?</h4>
              <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
                Bạn có chắc chắn muốn xóa {activeLightboxType === 'image' ? 'hình ảnh' : 'video'} này khỏi bài đăng? Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowDeleteMediaConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMedia}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm shadow-red-200"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Publishing/Scheduling Modal */}
      {schedulingCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden text-left flex flex-col md:flex-row max-h-[85vh] animate-fade-in-up">

            {/* Left side: Content Social Preview */}
            <div className="md:w-5/12 bg-slate-50 border-r border-slate-100 p-5 flex flex-col gap-4 overflow-y-auto max-h-[40vh] md:max-h-none">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Xem trước nội dung</h4>
              <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-3xs flex flex-col gap-3 font-sans">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-550 font-bold text-xs border border-slate-200">
                    {schedulingCard.channel[0]}
                  </div>
                  <div>
                    <h5 className="text-[11px] font-bold text-slate-800 leading-tight">iGen Brand Hub</h5>
                    <span className="text-[9px] text-slate-400">Vừa xong • Kênh {schedulingCard.channel}</span>
                  </div>
                </div>

                <p className="text-[10.5px] text-slate-650 leading-relaxed whitespace-pre-wrap line-clamp-6">
                  {schedulingCard.bodyText}
                </p>

                {schedulingCard.imageUrl && (
                  <div className="rounded-xl overflow-hidden aspect-video border border-slate-100 bg-slate-950 flex items-center justify-center">
                    <img src={schedulingCard.imageUrl} alt="Preview" className="w-full h-full object-contain" />
                  </div>
                )}
                {schedulingCard.videoUrl && (
                  <div className="rounded-xl overflow-hidden aspect-video border border-slate-100 bg-slate-950 flex items-center justify-center">
                    <video src={schedulingCard.videoUrl} className="w-full h-full object-cover" muted />
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Configuration & actions */}
            <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto max-h-[50vh] md:max-h-none">
              <div className="flex justify-between items-center pb-2 border-b border-slate-150">
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">
                  Đăng tải & Lên lịch
                </h3>
                <button
                  onClick={() => setSchedulingCard(null)}
                  className="text-slate-400 hover:text-slate-700 font-extrabold text-base focus:outline-none cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* Account Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Chọn tài khoản đăng tải *
                </label>
                {loadingIntegrationsForSchedule ? (
                  <div className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center gap-2 text-slate-400 text-xs">
                    <RefreshCw className="h-4 w-4 animate-spin text-indigo-650" />
                    <span>Đang tải danh sách tài khoản...</span>
                  </div>
                ) : getPublishingAccounts().length > 0 ? (
                  <select
                    disabled={isScheduling}
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-xs outline-none bg-white font-medium text-slate-750 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    value={scheduleIntegrationId}
                    onChange={(e) => setScheduleIntegrationId(e.target.value)}
                  >
                    {getPublishingAccounts().map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.displayName} {acc.isMock ? "(Demo)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3.5 border border-amber-250 bg-amber-50 text-amber-800 rounded-2xl space-y-1.5 text-xs text-left">
                    <p className="font-bold">
                      Chưa có tài khoản liên kết nào cho kênh này.
                    </p>
                    <p className="text-[10px] text-amber-700 leading-relaxed font-sans">
                      Vui lòng vào mục <strong>Cài đặt -&gt; MXH Doanh nghiệp</strong> hoặc <strong>Cá nhân</strong> để kết nối tài khoản {schedulingCard.channel} trước.
                    </p>
                  </div>
                )}
              </div>

              {/* Mode selection (Instant vs Scheduled) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Chế độ đăng tải
                </label>
                <div className="flex gap-3">
                  <label className="flex-1 flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 cursor-pointer transition-all duration-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="publishMode"
                        checked={publishMode === "instant"}
                        onChange={() => setPublishMode("instant")}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                        disabled={isScheduling}
                      />
                      <span className="text-xs font-bold text-slate-750 font-sans">Đăng ngay</span>
                    </div>
                  </label>
                  <label className="flex-1 flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 cursor-pointer transition-all duration-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="publishMode"
                        checked={publishMode === "scheduled"}
                        onChange={() => setPublishMode("scheduled")}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                        disabled={isScheduling}
                      />
                      <span className="text-xs font-bold text-slate-750 font-sans">Lên lịch đăng</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Quantity — visible in both modes */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Số lượng đăng
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={isScheduling}
                    className="w-20 p-2.5 border border-slate-200 rounded-xl text-xs font-mono outline-none bg-white font-bold text-slate-750 text-center focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    value={publishQuantity}
                    onChange={(e) => setPublishQuantity(Math.max(1, Math.min(10, Number(e.target.value))))}
                  />
                  <span className="text-[10px] text-slate-400 font-sans leading-relaxed">
                    {publishMode === "instant"
                      ? publishQuantity > 1
                        ? `Sẽ đăng ${publishQuantity} lần liên tiếp`
                        : "Đăng 1 lần"
                      : publishQuantity > 1
                        ? `Lên lịch ${publishQuantity} lần`
                        : "Lên lịch 1 lần"}
                  </span>
                </div>
              </div>

              {/* Scheduled fields */}
              {publishMode === "scheduled" && (
                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Ngày đăng *</label>
                    <input
                      type="date"
                      required
                      disabled={isScheduling}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono outline-none bg-white font-medium text-slate-750 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Giờ đăng *</label>
                    <input
                      type="time"
                      required
                      disabled={isScheduling}
                      className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono outline-none bg-white font-medium text-slate-750 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-3 border-t border-slate-150 mt-auto shrink-0">
                <button
                  type="button"
                  disabled={isScheduling}
                  onClick={() => setSchedulingCard(null)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all duration-250 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isScheduling || getPublishingAccounts().length === 0}
                  onClick={handleConfirmPublishOrSchedule}
                  className="flex-1 py-3 bg-blue-650 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all duration-250 shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isScheduling ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : publishMode === "instant" ? (
                    "Đăng ngay lập tức"
                  ) : (
                    "Xác nhận lên lịch"
                  )}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}

function TabLoader({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl bg-white border border-gray-150 p-6 text-center">
      <div className="w-8 h-8 border-3 border-indigo-650 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-gray-500 font-semibold">{label}</span>
    </div>
  );
}
