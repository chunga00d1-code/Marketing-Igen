import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Activity, Zap, FileText, DollarSign, MessageSquare } from "lucide-react";
import { CRMSubTabType, ChatMessage, CustomerInbox, AIChatConfig, ChatPagination } from "../types";
import { geminiApi } from "../api/gemini";
import { toast } from "./Toast";
import { crmService, ExtendedLeadCard } from "../services/crmService";
import { useAuth } from "../context/AuthContext";
import { fbMessengerService } from "../services/fbMessengerService";
import { zaloMessengerService } from "../services/zaloMessengerService";
import { tiktokMessengerService } from "../services/tiktokMessengerService";
import { getAccessToken } from "../services/authService";
import { socketService } from "../services/socketService";
import { useSubTabRouter } from "../hooks/useSubTabRouter";
import { socialIntegrationService, SocialIntegration } from "../services/socialIntegrationService";

// Lazy-loaded subcomponents
const PipelineTab = lazy(() =>
  import("../components/crm/PipelineTab").then((module) => ({
    default: module.PipelineTab,
  }))
);
const OmniChatTab = lazy(() =>
  import("../components/crm/OmniChatTab").then((module) => ({
    default: module.OmniChatTab,
  }))
);
const AiCommentReplyManager = lazy(() =>
  import("../components/crm/AiCommentReplyManager").then((module) => ({
    default: module.AiCommentReplyManager,
  }))
);

const CRM_SUB_TAB_ROUTES = [
  { slug: "pipeline", value: "PHỄU KHÁCH HÀNG" as CRMSubTabType },
  { slug: "omni-chat", value: "OMNI-INBOX CHAT" as CRMSubTabType },
  { slug: "comment-reply", value: "AI COMMENT AUTO-REPLY" as CRMSubTabType },
] as const;

export default function CRMTab() {
  const [subTab, setSubTab] = useSubTabRouter<CRMSubTabType>(CRM_SUB_TAB_ROUTES as any, "PHỄU KHÁCH HÀNG");
  const [activeChannel, setActiveChannel] = useState<"all" | "facebook" | "zalo" | "tiktok">("all");

  // 1. Leads Kanban Pipeline States loaded from Firebase
  const [leads, setLeads] = useState<ExtendedLeadCard[]>([]);

  useEffect(() => {
    const unsubscribe = crmService.subscribeLeads((loadedLeads) => {
      setLeads(loadedLeads);
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadValue, setNewLeadValue] = useState("");
  const [newLeadStatus, setNewLeadStatus] = useState<"cold" | "warm" | "hot">("cold");
  const [newLeadTouchpoint, setNewLeadTouchpoint] = useState("Mới tiếp cận");
  const [newLeadCompany, setNewLeadCompany] = useState("");

  const [searchPipeline, setSearchPipeline] = useState("");

  // Modals state
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false);
  const [selectedInboxCustId, setSelectedInboxCustId] = useState("");

  // Automation warning modal state
  const [automationModal, setAutomationModal] = useState<{
    isOpen: boolean;
    leadName: string;
    company: string;
    contractLink: string;
    paymentLink: string;
  } | null>(null);

  // 2. Omni-Inbox States
  const { userProfile, updateAiAutoReplyConfig } = useAuth();
  const [companySocialIntegrations, setCompanySocialIntegrations] = useState<SocialIntegration[]>([]);

  // Derived connection status from actual integrations (removing forced true)
  const isFbConnected = React.useMemo(() => {
    const hasPersonal = !!(userProfile?.facebookIntegration?.isConnected && userProfile.facebookIntegration.pageId);
    const hasCompany = companySocialIntegrations.some(item => item.platform === "Facebook" && item.isConnected);
    return hasPersonal || hasCompany;
  }, [userProfile, companySocialIntegrations]);

  const isZaloConnected = React.useMemo(() => {
    return companySocialIntegrations.some(item => item.platform === "Zalo" && item.isConnected);
  }, [companySocialIntegrations]);

  const isTiktokConnected = React.useMemo(() => {
    return companySocialIntegrations.some(item => item.platform === "TikTok" && item.isConnected);
  }, [companySocialIntegrations]);

  // 3. Multi-page Facebook state
  const facebookPages = React.useMemo(() => {
    const list: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }> = [];
    if (userProfile?.facebookIntegration?.isConnected && userProfile.facebookIntegration.pageId) {
      list.push({
        _id: "personal",
        displayName: userProfile.facebookIntegration.pageName || "Fanpage cá nhân",
        username: userProfile.facebookIntegration.pageId,
        isMock: !!userProfile.facebookIntegration.isMock,
      });
    }
    companySocialIntegrations.forEach((item) => {
      if (item.platform === "Facebook" && item.isConnected && item.username) {
        if (!list.some(p => p.username === item.username)) {
          list.push({
            _id: item._id || "company_" + item.username,
            displayName: item.displayName || `Fanpage ${item.username}`,
            username: item.username,
            isMock: !!item.isMock,
          });
        }
      }
    });

    return list;
  }, [userProfile, companySocialIntegrations]);

  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState<string>(() => {
    const saved = localStorage.getItem("crm_selected_fb_page_id");
    return saved || "";
  });

  // Zalo Accounts
  const zaloAccounts = React.useMemo(() => {
    const list: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }> = [];
    companySocialIntegrations.forEach((item) => {
      if (item.platform === "Zalo" && item.isConnected && item.username) {
        list.push({
          _id: item._id || "company_" + item.username,
          displayName: item.displayName || `Zalo OA ${item.username}`,
          username: item.username,
          isMock: !!item.isMock,
        });
      }
    });

    return list;
  }, [companySocialIntegrations]);

  const [selectedZaloAccountId, setSelectedZaloAccountId] = useState<string>("");

  // TikTok Accounts
  const tiktokAccounts = React.useMemo(() => {
    const list: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }> = [];
    companySocialIntegrations.forEach((item) => {
      if (item.platform === "TikTok" && item.isConnected && item.username) {
        list.push({
          _id: item._id || "company_" + item.username,
          displayName: item.displayName || `TikTok Shop ${item.username}`,
          username: item.username,
          isMock: !!item.isMock,
        });
      }
    });

    return list;
  }, [companySocialIntegrations]);

  const [selectedTiktokAccountId, setSelectedTiktokAccountId] = useState<string>("");

  const [showPageDropdown, setShowPageDropdown] = useState(false);
  const [showZaloDropdown, setShowZaloDropdown] = useState(false);
  const [showTiktokDropdown, setShowTiktokDropdown] = useState(false);
  const [showUnifiedDropdown, setShowUnifiedDropdown] = useState(false);

  // Synchronize selectedFacebookPageId when facebookPages changes
  useEffect(() => {
    const validPages = facebookPages.filter(p => p.username);
    if (validPages.length > 0) {
      const hasMatch = validPages.some(p => p.username === selectedFacebookPageId);
      if (!selectedFacebookPageId || !hasMatch) {
        const firstPage = validPages[0].username;
        setSelectedFacebookPageId(firstPage);
        localStorage.setItem("crm_selected_fb_page_id", firstPage);
      }
    } else {
      if (selectedFacebookPageId !== "") {
        setSelectedFacebookPageId("");
        localStorage.removeItem("crm_selected_fb_page_id");
      }
    }
  }, [facebookPages, selectedFacebookPageId]);

  // Synchronize Zalo & TikTok selected accounts
  useEffect(() => {
    if (zaloAccounts.length > 0) {
      if (!selectedZaloAccountId || !zaloAccounts.some(a => a.username === selectedZaloAccountId)) {
        setSelectedZaloAccountId(zaloAccounts[0].username);
      }
    }
  }, [zaloAccounts, selectedZaloAccountId]);

  useEffect(() => {
    if (tiktokAccounts.length > 0) {
      if (!selectedTiktokAccountId || !tiktokAccounts.some(a => a.username === selectedTiktokAccountId)) {
        setSelectedTiktokAccountId(tiktokAccounts[0].username);
      }
    }
  }, [tiktokAccounts, selectedTiktokAccountId]);

  useEffect(() => {
    let cancelled = false;

    const loadCompanyIntegrations = async () => {
      try {
        const data = await socialIntegrationService.getIntegrations();
        if (!cancelled) {
          setCompanySocialIntegrations(data || []);
          console.log("[FE CRMTab] Loaded company social integrations:", data);
        }
      } catch (error) {
        console.error("[FE CRMTab] Khong the tai company social integrations:", error);
      }
    };

    void loadCompanyIntegrations();

    return () => {
      cancelled = true;
    };
  }, []);

  const [inboxCustomers, setInboxCustomers] = useState<CustomerInbox[]>([]);
  const [activeCustomer, setActiveCustomer] = useState<CustomerInbox | null>(null);
  const [isInboxLoading, setIsInboxLoading] = useState(false);


  // Keep activeCustomer in a ref to avoid stale closures in socket handlers
  const activeCustomerRef = useRef<CustomerInbox | null>(null);
  useEffect(() => {
    activeCustomerRef.current = activeCustomer;
  }, [activeCustomer]);

  // Conversations list pagination state for infinite scroll
  const [convsPagination, setConvsPagination] = useState({
    limit: 20,
    skip: 0,
    hasMore: true,
    isLoadingMore: false,
  });

  const convsPaginationRef = useRef(convsPagination);
  useEffect(() => {
    convsPaginationRef.current = convsPagination;
  }, [convsPagination]);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatPagination, setChatPagination] = useState<ChatPagination>({
    limit: 20,
    hasMore: false,
    nextBefore: null,
    loadingMore: false,
  });

  const [typeMessage, setTypeMessage] = useState("");
  const [aiWaiting, setAIWaiting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const conversationRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI assistant configurations
  const [aiConfig, setAIConfig] = useState<AIChatConfig>({
    enabled: true,
    commentReplyEnabled: true,
    autoClassify: true,
    autoCloseDeal: true,
    autoFeedback: true,
    replyDelay: 15,
    advancedInstructions: "Luôn ưu tiên xưng hô lịch thiệp. Hỏi thăm nhu cầu chăm sóc sức khỏe của doanh nghiệp.",
    trainingKnowledge: "",
    model: localStorage.getItem("selected_ai_model") || "gemini-3.5-flash"
  });

  // Synchronize AI Config based on selected page/channel or fallback to userProfile
  useEffect(() => {
    let targetIntegration: SocialIntegration | null = null;

    if (activeCustomer?.channel === "zalo") {
      const zaloIntegration = companySocialIntegrations.find(item => item.platform === "Zalo" && item.isConnected);
      if (zaloIntegration) {
        targetIntegration = zaloIntegration;
      }
    } else {
      const selectedPage = facebookPages.find(p => p.username === selectedFacebookPageId);
      if (selectedPage && selectedPage._id !== "personal") {
        const integration = companySocialIntegrations.find(item => item._id === selectedPage._id);
        if (integration) {
          targetIntegration = integration;
        }
      }
    }

    if (targetIntegration?.aiAutoReplyConfig) {
      const config = targetIntegration.aiAutoReplyConfig;
      setAIConfig({
        enabled: config.enabled ?? true,
        commentReplyEnabled: config.commentReplyEnabled ?? true,
        autoClassify: true,
        autoCloseDeal: true,
        autoFeedback: true,
        replyDelay: config.replyDelay ?? 15,
        advancedInstructions: config.advancedInstructions ?? "",
        trainingKnowledge: config.trainingKnowledge ?? "",
        model: config.model || localStorage.getItem("selected_ai_model") || "gemini-3.5-flash"
      });
      return;
    }

    // fallback
    if (userProfile?.aiAutoReplyConfig) {
      setAIConfig({
        enabled: userProfile.aiAutoReplyConfig.enabled ?? true,
        commentReplyEnabled: userProfile.aiAutoReplyConfig.commentReplyEnabled ?? true,
        autoClassify: true,
        autoCloseDeal: true,
        autoFeedback: true,
        replyDelay: userProfile.aiAutoReplyConfig.replyDelay ?? 15,
        advancedInstructions: userProfile.aiAutoReplyConfig.advancedInstructions ?? "",
        trainingKnowledge: userProfile.aiAutoReplyConfig.trainingKnowledge ?? "",
        model: userProfile.aiAutoReplyConfig.model || localStorage.getItem("selected_ai_model") || "gemini-3.5-flash"
      });
    }
  }, [selectedFacebookPageId, facebookPages, companySocialIntegrations, userProfile, activeCustomer]);

  const handleUpdateAIConfig = async (newConfig: AIChatConfig) => {
    const configWithTimestamp = {
      ...newConfig,
      autoClassify: true,
      autoCloseDeal: true,
      autoFeedback: true,
      disabledAt: newConfig.enabled === false ? new Date().toISOString() : null,
    };
    
    setAIConfig(configWithTimestamp);
    try {
      let targetIntegrationId: string | null = null;

      if (activeCustomer?.channel === "zalo") {
        const zaloIntegration = companySocialIntegrations.find(item => item.platform === "Zalo" && item.isConnected);
        if (zaloIntegration) {
          targetIntegrationId = zaloIntegration._id;
        }
      } else {
        const selectedPage = facebookPages.find(p => p.username === selectedFacebookPageId);
        if (selectedPage && selectedPage._id !== "personal") {
          targetIntegrationId = selectedPage._id;
        }
      }

      if (targetIntegrationId) {
        const res = await fetch(`/api/v1/crud/social-integrations/${targetIntegrationId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ aiAutoReplyConfig: configWithTimestamp }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(result.message || "Không thể lưu cấu hình AI cho tài khoản liên kết.");
        }
        // Update local state in memory
        setCompanySocialIntegrations(prev =>
          prev.map(item => item._id === targetIntegrationId ? { ...item, aiAutoReplyConfig: configWithTimestamp } : item)
        );
      } else {
        await updateAiAutoReplyConfig(configWithTimestamp);
      }
    } catch (err: any) {
      console.error("[CRMTab] Lỗi lưu cấu hình AI:", err);
      toast.error(err.message || "Lỗi lưu cấu hình AI");
    }
  };

  const [copyingConfig, setCopyingConfig] = useState(false);

  const handleApplyToAllPages = async () => {
    let activeId: string | null = null;

    if (activeCustomer?.channel === "zalo") {
      const zaloIntegration = companySocialIntegrations.find(item => item.platform === "Zalo" && item.isConnected);
      if (zaloIntegration) {
        activeId = zaloIntegration._id || null;
      }
    } else {
      const selectedPage = facebookPages.find(p => p.username === selectedFacebookPageId);
      if (selectedPage && selectedPage._id !== "personal") {
        activeId = selectedPage._id;
      }
    }

    if (!activeId) {
      toast.warning("Chỉ hỗ trợ đồng bộ cấu hình giữa các tài khoản liên kết doanh nghiệp.");
      return;
    }

    const otherIntegrations = companySocialIntegrations.filter(item => item.isConnected && item._id !== activeId);
    if (otherIntegrations.length === 0) {
      toast.info("Không có tài khoản doanh nghiệp liên kết nào khác để đồng bộ.");
      return;
    }

    const confirmSync = window.confirm(
      `Bạn có chắc chắn muốn áp dụng cấu hình AI hiện tại cho tất cả ${otherIntegrations.length} tài khoản doanh nghiệp liên kết khác không?`
    );
    if (!confirmSync) return;

    setCopyingConfig(true);
    let successCount = 0;
    try {
      for (const integration of otherIntegrations) {
        const res = await fetch(`/api/v1/crud/social-integrations/${integration._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ aiAutoReplyConfig: aiConfig }),
        });
        if (res.ok) {
          successCount++;
          setCompanySocialIntegrations(prev =>
            prev.map(item => item._id === integration._id ? { ...item, aiAutoReplyConfig: aiConfig } : item)
          );
        }
      }
      toast.success(`Đã sao chép cấu hình thành công sang ${successCount}/${otherIntegrations.length} tài khoản khác!`);
    } catch (err: any) {
      console.error(err);
      toast.error("Lỗi xảy ra trong quá trình đồng bộ cấu hình.");
    } finally {
      setCopyingConfig(false);
    }
  };

  const mapFbMessages = (msgs: any[]): ChatMessage[] => msgs.map((m: any) => ({
    id: m._id || m.messageId,
    sender: m.direction === "inbound" ? "user" : "agent",
    text: m.text || "",
    timestamp: new Date(m.timestamp),
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    conversationId: m.conversationId,
  }));

  const areMessagesEqual = (left: ChatMessage[], right: ChatMessage[]) => {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (
        left[i].id !== right[i].id ||
        left[i].sender !== right[i].sender ||
        left[i].text !== right[i].text ||
        left[i].timestamp.getTime() !== right[i].timestamp.getTime() ||
        JSON.stringify(left[i].attachments || []) !== JSON.stringify(right[i].attachments || [])
      ) {
        return false;
      }
    }
    return true;
  };

  const loadConversationMessages = async (
    conversationId: string,
    mode: "replace" | "prepend" = "replace",
    channel?: "facebook" | "zalo" | "tiktok",
    options?: { syncChannel?: boolean }
  ) => {


    const before = mode === "prepend" ? chatPagination.nextBefore || undefined : undefined;
    if (mode === "prepend") {
      setChatPagination((prev) => ({ ...prev, loadingMore: true }));
    }

    const targetChannel = channel || activeCustomer?.channel || "facebook";

    try {
      const result = targetChannel === "zalo"
        ? await zaloMessengerService.getMessages(conversationId, { limit: 20, before, sync: !!options?.syncChannel })
        : targetChannel === "tiktok"
          ? await tiktokMessengerService.getMessages(conversationId, { limit: 20, before, sync: !!options?.syncChannel })
          : await fbMessengerService.getMessages(conversationId, { limit: 20, before, sync: !!options?.syncChannel, pageId: selectedFacebookPageId });

      // Ngăn chặn race-condition khi người dùng chuyển đổi khách hàng nhanh
      // conversationId o day la Mongo _id cua conversation trong DB, khong phai PSID/UID cua khach.
      if (activeCustomerRef.current?.id !== conversationId) {
        console.log(`[FE CRMTab] Race-condition detected: Bỏ qua kết quả load tin nhắn của khách hàng cũ (${conversationId}).`);
        return;
      }

      const mappedMsgs = mapFbMessages(result.data);

      if (mode === "prepend") {
        setChatHistory((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const older = mappedMsgs.filter((item) => !seen.has(item.id));
          if (older.length === 0) {
            return prev;
          }
          return [...older, ...prev];
        });
      } else {
        setChatHistory((prev) => {
          // Kiểm tra xem tin nhắn mới lấy về có thuộc cùng một cuộc hội thoại đang tải không
          const isSameConversation = prev.length > 0 && mappedMsgs.length > 0 &&
            (prev[0].conversationId === mappedMsgs[0].conversationId ||
              prev[0].id.startsWith("user_") ||
              prev.some(m => mappedMsgs.some(nm => nm.id === m.id)));

          if (isSameConversation) {
            // Gộp tin nhắn mới/cập nhật mà không làm mất lịch sử cũ đã cuộn để tải lên
            const merged = [...prev];
            mappedMsgs.forEach((newMsg) => {
              const idx = merged.findIndex((m) => m.id === newMsg.id || (m.id.startsWith("user_") && m.text === newMsg.text && m.sender === newMsg.sender));
              if (idx !== -1) {
                merged[idx] = newMsg; // Cập nhật tin nhắn sẵn có (trạng thái/id thật)
              } else {
                merged.push(newMsg); // Thêm tin nhắn mới
              }
            });
            return merged.sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
          } else {
            // Cuộc hội thoại khác (chuyển user), thay thế toàn bộ bằng tin nhắn mới
            return mappedMsgs;
          }
        });
      }

      setChatPagination({
        limit: result.pagination.limit || 20,
        hasMore: !!result.pagination.hasMore,
        nextBefore: result.pagination.nextBefore || null,
        loadingMore: false,
      });
    } catch (err) {
      setChatPagination((prev) => ({ ...prev, loadingMore: false }));
      throw err;
    }
  };

  const fetchOmniConversations = async (
    forceSelectFirst = false, 
    options?: { syncFacebook?: boolean; loadMore?: boolean; reset?: boolean }
  ) => {
    console.log(`[FE CRMTab] fetchOmniConversations: Đang lấy dữ liệu hội thoại. loadMore=${!!options?.loadMore}, reset=${!!options?.reset}`);
    try {
      const isLoadMore = !!options?.loadMore;
      const isReset = !!options?.reset;

      if (isLoadMore && !convsPaginationRef.current.hasMore) return;
      if (convsPaginationRef.current.isLoadingMore) return;

      if (isLoadMore) {
        setConvsPagination(prev => ({ ...prev, isLoadingMore: true }));
      }

      if (isReset) {
        setIsInboxLoading(true);
      }


      const currentSkip = isReset 
        ? 0 
        : (isLoadMore ? convsPaginationRef.current.skip + convsPaginationRef.current.limit : 0);
      
      const limit = isReset
        ? 20
        : (isLoadMore ? convsPaginationRef.current.limit : (convsPaginationRef.current.skip + convsPaginationRef.current.limit || 20));

      let fbConvs: any[] = [];
      let zaloConvs: any[] = [];

      if (isFbConnected) {
        try {
          fbConvs = await fbMessengerService.getConversations({ 
            sync: !!options?.syncFacebook, 
            pageId: selectedFacebookPageId,
            limit,
            skip: currentSkip
          });
        } catch (err) {
          console.error("Lỗi lấy hội thoại Facebook:", err);
        }
      }

      if (isZaloConnected) {
        try {
          zaloConvs = await zaloMessengerService.getConversations({
            limit,
            skip: currentSkip
          });
        } catch (err) {
          console.error("Lỗi lấy hội thoại Zalo:", err);
        }
      }

      let tiktokConvs: any[] = [];
      if (isTiktokConnected) {
        try {
          tiktokConvs = await tiktokMessengerService.getConversations({
            limit,
            skip: currentSkip
          });
        } catch (err) {
          console.error("Lỗi lấy hội thoại TikTok:", err);
        }
      }

      const mappedFb: CustomerInbox[] = fbConvs.map((c: any) => ({
        id: c._id,
        recipientId: c.recipientId,
        name: c.senderName || "Khách hàng Facebook",
        avatar: c.avatarUrl || "👤",
        avatarUrl: c.avatarUrl || "",
        lastMessage: c.lastMessageText || "[Đính kèm]",
        time: new Date(c.lastMessageAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        unreadCount: c.unreadCount || 0,
        isVip: c.isVip || false,
        status: "offline",
        tags: c.tags || [],
        channel: "facebook",
        lastMessageAt: new Date(c.lastMessageAt),
        aiPausedUntil: c.aiPausedUntil || null
      } as any));

      const mappedZalo: CustomerInbox[] = zaloConvs.map((c: any) => ({
        id: c._id,
        recipientId: c.recipientId,
        name: c.senderName || "Khách hàng Zalo",
        avatar: c.avatarUrl || "👤",
        avatarUrl: c.avatarUrl || "",
        lastMessage: c.lastMessageText || "[Đính kèm]",
        time: new Date(c.lastMessageAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        unreadCount: c.unreadCount || 0,
        isVip: c.isVip || false,
        status: "offline",
        tags: c.tags || [],
        channel: "zalo",
        lastMessageAt: new Date(c.lastMessageAt),
        aiPausedUntil: c.aiPausedUntil || null
      } as any));

      const mappedTiktok: CustomerInbox[] = tiktokConvs.map((c: any) => ({
        id: c._id,
        recipientId: c.openId,
        name: c.senderName || "Khách hàng TikTok",
        avatar: c.avatarUrl || "👤",
        avatarUrl: c.avatarUrl || "",
        lastMessage: c.lastMessageText || "[Đính kèm]",
        time: new Date(c.lastMessageAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        unreadCount: c.unreadCount || 0,
        isVip: c.isVip || false,
        status: "offline",
        tags: c.tags || [],
        channel: "tiktok",
        lastMessageAt: new Date(c.lastMessageAt),
        aiPausedUntil: c.aiPausedUntil || null
      } as any));

      let fetchedList = [...mappedFb, ...mappedZalo, ...mappedTiktok];
      


      const hasMoreFetched = fetchedList.length >= limit;

      setInboxCustomers((prev) => {
        const baseList = (isLoadMore && !isReset) ? prev : [];
        const existingIds = new Set(baseList.map((x) => x.id));
        const filteredNew = fetchedList.filter((x) => !existingIds.has(x.id));
        
        const combined = [...baseList, ...filteredNew].map((c) => {
          if (activeCustomerRef.current && c.id === activeCustomerRef.current.id) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        }).sort(
          (a: any, b: any) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
        );

        if (combined.length > 0) {
          setActiveCustomer((prevActive) => {
            if (prevActive && !forceSelectFirst) {
              const found = combined.find((x) => x.id === prevActive.id);
              return found || combined[0];
            }
            return combined[0];
          });
        } else {
          setActiveCustomer(null);
        }

        return combined;
      });

      setConvsPagination({
        limit: 20,
        skip: currentSkip,
        hasMore: hasMoreFetched,
        isLoadingMore: false,
      });
    } catch (err) {
      console.error("[FE CRMTab] Lỗi khi tải danh sách hội thoại:", err);
      setConvsPagination(prev => ({ ...prev, isLoadingMore: false }));
    } finally {
      setIsInboxLoading(false);
    }
  };

  const scheduleConversationRefresh = (options?: { syncFacebook?: boolean }) => {
    if (conversationRefreshTimeoutRef.current) {
      clearTimeout(conversationRefreshTimeoutRef.current);
    }

    conversationRefreshTimeoutRef.current = setTimeout(() => {
      conversationRefreshTimeoutRef.current = null;
      fetchOmniConversations(false, options);
    }, 180);
  };

  // Track Socket.IO connection status
  useEffect(() => {
    const unsubscribeStatus = socketService.onStatusChange(setSocketConnected);

    return () => {
      unsubscribeStatus();
    };
  }, []);

  // Handle Socket.IO realtime events
  useEffect(() => {
    if (subTab !== "OMNI-INBOX CHAT" || (!isFbConnected && !isZaloConnected && !isTiktokConnected)) return;

    const handleNewMessage = async (data: { message: any; conversation?: any }) => {
      console.log("[FE CRMTab] socket new_message event received:", data);
      const { message, conversation } = data;
      const activeCust = activeCustomerRef.current;

      if (conversation) {
        setInboxCustomers((prev) =>
          prev.map((c) =>
            c.id === conversation._id
              ? {
                  ...c,
                  aiPausedUntil: conversation.aiPausedUntil || null,
                  lastMessage: conversation.lastMessageText || c.lastMessage,
                  time: new Date(conversation.lastMessageAt || Date.now()).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }
              : c
          )
        );

        if (activeCust && activeCust.id === conversation._id) {
          setActiveCustomer((prev) =>
            prev
              ? {
                  ...prev,
                  aiPausedUntil: conversation.aiPausedUntil || null,
                }
              : null
          );
        }
      }

      if (activeCust) {
        const activeId = activeCust.id?.toString();
        const msgConvId = (message.conversationId?._id || message.conversationId)?.toString();
        const activeRecipientId = activeCust.recipientId?.toString();
        const msgSenderId = message.senderId?.toString();
        const msgRecipientId = message.recipientId?.toString();

        console.log("[FE CRMTab] Comparing active customer & new message:", {
          activeCustomer: { id: activeId, recipientId: activeRecipientId, name: activeCust.name },
          message: { conversationId: msgConvId, senderId: msgSenderId, recipientId: msgRecipientId }
        });

        const isMatch = (activeId && msgConvId && activeId === msgConvId) ||
          (activeRecipientId && msgSenderId && activeRecipientId === msgSenderId) ||
          (activeRecipientId && msgRecipientId && activeRecipientId === msgRecipientId);

        if (isMatch) {
          console.log("[FE CRMTab] Match found! Appending message to current chat view.");

          // Gửi request ngầm lên server để reset unreadCount về 0 trong DB
          if (activeCust.channel === "zalo") {
            zaloMessengerService.markRead(activeId).catch(() => { });
          } else if (activeCust.channel === "tiktok") {
            tiktokMessengerService.markRead(activeId).catch(() => { });
          } else {
            fbMessengerService.markRead(activeId).catch(() => { });
          }

          const mapped = mapFbMessages([message])[0];
          setChatHistory((prev) => {
            // Khử trùng lặp và thay thế tin nhắn tạm thời (optimistic update)
            const optimisticIndex = prev.findIndex(
              (m) => m.id.startsWith("user_") && m.text === mapped.text && m.sender === mapped.sender
            );
            if (optimisticIndex !== -1) {
              const nextHistory = [...prev];
              nextHistory[optimisticIndex] = mapped; // Thay thế bằng tin nhắn chính thức từ DB
              return nextHistory;
            }

            if (prev.some((m) => m.id === mapped.id)) return prev;
            return [...prev, mapped];
          });
        } else {
          console.log("[FE CRMTab] Conversation mismatch, message not appended to current view.");
        }
      } else {
        console.log("[FE CRMTab] No active customer selected, skipping message append.");
      }

      // Refresh conversations list to update unread count / last message
      scheduleConversationRefresh();
    };

    const handleConversationUpdated = async (conversation: any) => {
      console.log("[FE CRMTab] socket conversation_updated event received:", conversation);
      if (conversation) {
        setInboxCustomers((prev) =>
          prev.map((c) =>
            c.id === conversation._id
              ? {
                  ...c,
                  aiPausedUntil: conversation.aiPausedUntil || null,
                  lastMessage: conversation.lastMessageText || c.lastMessage,
                  time: new Date(conversation.lastMessageAt || Date.now()).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }
              : c
          )
        );

        const activeCust = activeCustomerRef.current;
        if (activeCust && activeCust.id === conversation._id) {
          setActiveCustomer((prev) =>
            prev
              ? {
                  ...prev,
                  aiPausedUntil: conversation.aiPausedUntil || null,
                }
              : null
          );
        }
      }
      scheduleConversationRefresh();
    };

    const unsubscribeNewMsg = socketService.onNewMessage(handleNewMessage);
    const unsubscribeConvUpdate = socketService.onConversationUpdated(handleConversationUpdated);

    return () => {
      unsubscribeNewMsg();
      unsubscribeConvUpdate();
    };
  }, [subTab, isFbConnected, isZaloConnected]);

  useEffect(() => {
    return () => {
      if (conversationRefreshTimeoutRef.current) {
        clearTimeout(conversationRefreshTimeoutRef.current);
      }
    };
  }, []);

  // 1. Polling danh sách hội thoại (FB, Zalo & TikTok) - Tối ưu hiệu năng Visibility
  useEffect(() => {
    if (subTab !== "OMNI-INBOX CHAT" || (!isFbConnected && !isZaloConnected && !isTiktokConnected)) return;

    // Tải và tự động chọn cuộc hội thoại đầu tiên khi mount, đổi page FB, hoặc đổi kết nối
    fetchOmniConversations(true, { syncFacebook: true, reset: true });

    const runFetch = () => {
      if (!document.hidden) {
        fetchOmniConversations(false, { syncFacebook: true });
      }
    };

    const interval = setInterval(runFetch, 60000);

    const handleVisibility = () => {
      if (!document.hidden) fetchOmniConversations(false, { syncFacebook: true });
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [subTab, isFbConnected, isZaloConnected, isTiktokConnected, selectedFacebookPageId, selectedZaloAccountId, selectedTiktokAccountId, socketConnected]);

  // 2. Polling lịch sử tin nhắn của hội thoại đang chọn - Tối ưu hiệu năng Visibility
  useEffect(() => {
    if (subTab !== "OMNI-INBOX CHAT" || !activeCustomer) return;

    const fetchMessages = async () => {
      if (document.hidden) return;
      if (socketConnected) return;
      console.log(`[FE CRMTab] Fallback polling lịch sử tin nhắn cho conversation ID: ${activeCustomer.id}...`);
      try {
        await loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: true });
      } catch (err) {
        console.error("[FE CRMTab] Lỗi khi tải tin nhắn:", err);
      }
    };

    loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: !socketConnected }).catch((err) => {
      console.error("[FE CRMTab] Lỗi khi tải lịch sử tin nhắn ban đầu:", err);
    });
    const interval = setInterval(fetchMessages, 60000);

    const handleVisibility = () => {
      if (!document.hidden) {
        loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: true }).catch((err) => {
          console.error("[FE CRMTab] Lỗi khi đồng bộ tin nhắn sau khi quay lại tab:", err);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [subTab, activeCustomer?.id, socketConnected]);

  // Xóa sạch lịch sử chat cũ ngay khi chuyển khách hàng để chuyển đổi mượt mà tức thì
  useEffect(() => {
    setChatHistory([]);
  }, [activeCustomer?.id]);

  const handleSelectCustomer = (cust: CustomerInbox) => {
    if (activeCustomerRef.current?.id === cust.id) {
      console.log("[FE CRMTab] Khách hàng đã được chọn sẵn, bỏ qua.");
      return;
    }
    console.log("[FE CRMTab] Nhân viên chọn khách hàng từ danh sách:", cust);
    setActiveCustomer(cust);
    setChatHistory([]); // Xóa sạch lịch sử chat cũ ngay lập tức để tránh hiển thị nhầm lẫn

    // Đặt unreadCount của khách hàng này về 0 ngay lập tức trong local state
    setInboxCustomers((prev) =>
      prev.map((c) => (c.id === cust.id ? { ...c, unreadCount: 0 } : c))
    );
    const markReadPromise = cust.channel === "zalo"
      ? zaloMessengerService.markRead(cust.id)
      : cust.channel === "tiktok"
        ? tiktokMessengerService.markRead(cust.id)
        : fbMessengerService.markRead(cust.id);
    markReadPromise.catch((err) => {
      console.error("[FE CRMTab] Khong the mark-read khi mo conversation:", err);
    });
  };

  const handleLoadOlderMessages = async () => {
    if (!activeCustomer || !chatPagination.hasMore || chatPagination.loadingMore) return;
    try {
      await loadConversationMessages(activeCustomer.id, "prepend", activeCustomer.channel);
    } catch (err) {
      console.error("[FE CRMTab] Lỗi khi tải thêm tin nhắn cũ:", err);
      toast.error("Không thể tải thêm tin nhắn cũ.");
    }
  };

  // Sync classification tags to Omni-Inbox
  const syncLeadTagToInbox = (name: string, status: "cold" | "warm" | "hot" | "won" | "upsell", touchpoint?: string) => {
    setInboxCustomers(prev => {
      let hasChanges = false;

      const nextCustomers = prev.map(cust => {
        if (cust.name.toLowerCase() !== name.toLowerCase()) {
          return cust;
        }

        const cleanTags = cust.tags.filter(t => !["Khách Lạnh", "Khách Ấm", "Khách Nóng", "Đã Chốt Đơn", "Khách Up-sell", "Sắp chốt HD", "Đã gửi báo giá", "Mới tiếp cận"].includes(t));
        const newTempTag =
          status === "cold" ? "Khách Lạnh" :
            status === "warm" ? "Khách Ấm" :
              status === "hot" ? "Khách Nóng" :
                status === "won" ? "Đã Chốt Đơn" :
                  "Khách Up-sell";
        const newTags = [...cleanTags, newTempTag];
        if (touchpoint) {
          newTags.push(touchpoint);
        }

        if (newTags.length === cust.tags.length && newTags.every((tag, index) => tag === cust.tags[index])) {
          return cust;
        }

        hasChanges = true;
        return { ...cust, tags: newTags };
      });

      return hasChanges ? nextCustomers : prev;
    });
  };

  // Trigger automation modal when lead becomes "Sắp chốt HD" in Hot Column
  const triggerAutoCloseWorkflow = (lead: ExtendedLeadCard) => {
    const mockContract = `https://igen-erp.vn/contracts/HD-2026-${lead.id.substring(0, 8) || "X1"}.pdf`;
    const mockPayment = `https://pay.igen-erp.vn/invoice/INV-2026-${lead.id.substring(0, 8) || "X1"}`;

    setAutomationModal({
      isOpen: true,
      leadName: lead.customerName,
      company: lead.company,
      contractLink: mockContract,
      paymentLink: mockPayment
    });

    const systemMsgText = `✦ [AI AUTOMATION] Đã gửi tự động:
- Hợp đồng điện tử: ${mockContract}
- Link thanh toán: ${mockPayment}
(Trạng thái: Sắp chốt HD - Khách Nóng)`;

    if (activeCustomer && activeCustomer.name.toLowerCase() === lead.customerName.toLowerCase()) {
      setChatHistory(prev => [
        ...prev,
        {
          id: "system_" + Date.now(),
          sender: "ai",
          text: systemMsgText,
          timestamp: new Date()
        }
      ]);
    }
    toast.success("Kịch bản chốt Sales tự động: Đã gửi hợp đồng điện tử!");
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim()) return;

    const val = parseFloat(newLeadValue) || 0;
    const selectedCust = inboxCustomers.find(c => c.id === selectedInboxCustId);
    const avatarIcon = selectedCust
      ? (selectedCust.name.split(" ").filter(Boolean).slice(0, 1).map(part => part[0]?.toUpperCase() || "").join("") || "👤")
      : ["👤", "👨‍💼", "👩‍💼", "👨‍💻", "👩‍💻", "🧘"][Math.floor(Math.random() * 6)];

    const newLead: Omit<ExtendedLeadCard, "id"> = {
      customerName: newLeadName.trim(),
      company: newLeadCompany.trim() || "Liên hệ cá nhân mới",
      value: val,
      phone: "Chưa bổ sung",
      avatar: avatarIcon,
      email: "chua.co@igen.vn",
      productOfChoice: "",
      status: newLeadStatus,
      lastInteraction: newLeadTouchpoint,
      lastInteractionTime: "Vừa xong"
    };

    setNewLeadName("");
    setNewLeadValue("");
    setNewLeadCompany("");
    setSelectedInboxCustId("");
    setShowCreateLeadModal(false);

    try {
      const createdId = await crmService.createLead(newLead);
      const fullLead = { ...newLead, id: createdId };

      const customerExists = inboxCustomers.some(c => c.name.toLowerCase() === newLead.customerName.toLowerCase());
      if (customerExists) {
        syncLeadTagToInbox(newLead.customerName, newLeadStatus, newLeadTouchpoint);
      }

      if (newLeadStatus === "hot" && newLeadTouchpoint === "Sắp chốt HD") {
        triggerAutoCloseWorkflow(fullLead);
      }

      toast.success("Đã thêm khách hàng tiềm năng thành công!");
    } catch (err) {
      toast.error("Không thể tạo khách hàng trên hệ thống.");
    }
  };

  const moveLeadPipeline = async (id: string, newStatus: "cold" | "warm" | "hot" | "won" | "upsell") => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    try {
      await crmService.updateLead(id, { status: newStatus });
      const updatedLead = { ...lead, status: newStatus };

      if (newStatus === "hot" && lead.lastInteraction === "Sắp chốt HD") {
        triggerAutoCloseWorkflow(updatedLead);
      }

      if (newStatus === "won") {
        toast.success(`🎉 Chốt đơn thành công cho khách hàng ${lead.customerName}!`);
      }

      syncLeadTagToInbox(lead.customerName, newStatus, lead.lastInteraction);
    } catch (err) {
      toast.error("Không thể cập nhật trạng thái khách hàng.");
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await crmService.deleteLead(id);
      toast.info("Đã xóa thẻ cơ hội bán hàng.");
    } catch (err) {
      toast.error("Không thể xóa khách hàng trên hệ thống.");
    }
  };

  const triggerUpsellCampaignOptimized = async () => {
    const coldLeads = leads.filter(l => l.status === "cold");
    if (coldLeads.length === 0) {
      toast.error("Không có khách hàng nào ở cột Khách Lạnh để gửi chiến dịch.");
      return;
    }

    toast.success(`Đã kích hoạt chiến dịch Up-sell! Gửi tự động SMS & Voucher giảm giá 10% cho ${coldLeads.length} Khách Lạnh.`);

    try {
      await crmService.bulkUpdateLeads(
        coldLeads.map((lead) => ({
          id: lead.id,
          lead: {
            lastInteraction: "Gửi Campaign Up-sell",
            lastInteractionTime: "Vừa xong"
          }
        }))
      );

      setInboxCustomers(prev => {
        let hasChanges = false;
        const nextCustomers = prev.map(cust => {
          const matchedLead = coldLeads.find(l => l.customerName.toLowerCase() === cust.name.toLowerCase());
          if (!matchedLead) {
            return cust;
          }

          const cleanTags = cust.tags.filter(t => !["Khách Lạnh", "Khách Ấm", "Khách Nóng", "Sắp chốt HD", "Đã gửi báo giá", "Mới tiếp cận"].includes(t));
          const nextTags = [...cleanTags, "Khách Lạnh", "Gửi Campaign Up-sell"];

          if (nextTags.length === cust.tags.length && nextTags.every((tag, index) => tag === cust.tags[index])) {
            return cust;
          }

          hasChanges = true;
          return { ...cust, tags: nextTags };
        });

        return hasChanges ? nextCustomers : prev;
      });
    } catch (err) {
      console.error("Error updating campaign status:", err);
    }
  };

  const handleResumeAI = async (conversationId: string, channel: "facebook" | "zalo" | "tiktok") => {
    try {
      if (channel === "zalo") {
        await zaloMessengerService.resumeAI(conversationId);
      } else if (channel === "tiktok") {
        await tiktokMessengerService.resumeAI(conversationId);
      } else {
        await fbMessengerService.resumeAI(conversationId, selectedFacebookPageId);
      }

      setActiveCustomer((prev) => prev && prev.id === conversationId ? { ...prev, aiPausedUntil: null } : prev);
      setInboxCustomers((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, aiPausedUntil: null } : c))
      );

      toast.success("🤖 Đã kích hoạt lại AI phản hồi cuộc hội thoại này thành công!");
    } catch (err: any) {
      console.error("[CRMTab] Lỗi kích hoạt lại AI:", err);
      toast.error(err.message || "Không thể kích hoạt lại AI.");
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const msgText = typeMessage.trim();
    if (!msgText || !activeCustomer) return;

    const userMsg: ChatMessage = {
      id: "user_" + Date.now(),
      sender: "agent",
      text: msgText,
      timestamp: new Date(),
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setTypeMessage("");

    // Cập nhật trạng thái tạm dừng AI 5 phút cho cuộc hội thoại này trên giao diện lập tức
    const pausedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    setActiveCustomer((prev) => prev ? { ...prev, aiPausedUntil: pausedUntil } : null);
    setInboxCustomers((prev) =>
      prev.map((c) => (c.id === activeCustomer.id ? { ...c, aiPausedUntil: pausedUntil } : c))
    );



    try {
      if (activeCustomer.channel === "zalo") {
        await zaloMessengerService.sendReply(activeCustomer.id, msgText);
      } else if (activeCustomer.channel === "tiktok") {
        await tiktokMessengerService.sendReply(activeCustomer.id, msgText);
      } else {
        await fbMessengerService.sendReply(activeCustomer.id, msgText, selectedFacebookPageId);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Không thể gửi tin nhắn phản hồi.");
      // Revert optimistic updates
      setChatHistory((prev) => prev.filter((h) => h.id !== userMsg.id));
      setActiveCustomer((prev) => prev ? { ...prev, aiPausedUntil: activeCustomer.aiPausedUntil } : null);
      setInboxCustomers((prev) =>
        prev.map((c) => (c.id === activeCustomer.id ? { ...c, aiPausedUntil: activeCustomer.aiPausedUntil } : c))
      );
      loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: true }).catch((reloadErr) => {
        console.error("[FE CRMTab] Lỗi đồng bộ lại lịch sử sau khi gửi thất bại:", reloadErr);
      });
    }
  };

  const handleGoToChat = (customerName: string) => {
    const cust = inboxCustomers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
    if (cust) {
      setActiveCustomer(cust);
      handleSelectCustomer(cust);
      setSubTab("OMNI-INBOX CHAT");
      toast.info(`Đã mở cuộc trò chuyện với ${customerName}`);
    } else {
      toast.warning("Khách hàng này chưa từng tương tác/nhắn tin tới Fanpage, không thể tự khởi tạo chat.");
    }
  };

  const handleCreateLeadFromChat = async (customer: CustomerInbox, status: "cold" | "warm" | "hot") => {
    const newLead: Omit<ExtendedLeadCard, "id"> = {
      customerName: customer.name,
      company: customer.channel === "zalo" ? "Khách hàng từ Zalo" : customer.channel === "tiktok" ? "Khách hàng từ TikTok" : "Khách hàng từ Facebook",
      value: 0,
      phone: "Chưa bổ sung",
      avatar: customer.name.split(" ").filter(Boolean).slice(0, 1).map(part => part[0]?.toUpperCase() || "").join("") || "👤",
      email: "chua.co@igen.vn",
      productOfChoice: "",
      status: status,
      lastInteraction: "Mới tiếp cận",
      lastInteractionTime: "Vừa xong"
    };
    try {
      await crmService.createLead(newLead);
      toast.success(`Đã tự động thêm ${customer.name} vào phễu khách hàng!`);
    } catch (err) {
      toast.error("Không thể tạo khách hàng trên hệ thống.");
    }
  };

  // Sync active Customer status tags when leads change
  useEffect(() => {
    if (!activeCustomer) return;
    const updatedActive = inboxCustomers.find(c => c.id === activeCustomer.id);
    if (updatedActive && updatedActive !== activeCustomer) {
      setActiveCustomer(updatedActive);
    }
  }, [activeCustomer, inboxCustomers]);

  const activeFbPage = facebookPages.find((p) => p.username === selectedFacebookPageId);
  const activeFbPageName = activeFbPage?.displayName || "Chọn trang FB";

  const activeZaloAccount = zaloAccounts.find((a) => a.username === selectedZaloAccountId);
  const activeZaloAccountName = activeZaloAccount?.displayName || "Chọn Zalo";

  const activeTiktokAccount = tiktokAccounts.find((a) => a.username === selectedTiktokAccountId);
  const activeTiktokAccountName = activeTiktokAccount?.displayName || "Chọn TikTok";

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50" id="crm_tab_wrapper">
      <h1 className="sr-only">Hệ thống Sales CRM - {subTab}</h1>

      {/* Sub tabs selector bar */}
      <div className="border-b border-slate-100 bg-[#f8fafc] p-2.5 text-xs flex justify-between items-center shrink-0" id="crm_sub_tabs_switch">
        <div className="flex gap-2">
          {["PHỄU KHÁCH HÀNG", "OMNI-INBOX CHAT", "AI COMMENT AUTO-REPLY"].map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab as CRMSubTabType)}
              className={`px-3.5 py-2 rounded-xl border font-bold uppercase transition-all tracking-wide text-[10px] cursor-pointer ${subTab === tab
                ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Global Social Media Channel Filters */}
        <div className="flex items-center gap-2 relative">
          <div className="flex items-center gap-1.5" id="inbox_channel_filters">
            {/* Unified Account Selector Button */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUnifiedDropdown(!showUnifiedDropdown);
                }}
                className="py-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-xxs text-[10px] font-extrabold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="flex items-center -space-x-1">
                  <span className="w-3.5 h-3.5 bg-blue-600 text-white text-[8px] font-extrabold rounded-full flex items-center justify-center leading-none ring-1.5 ring-white font-sans shrink-0 shadow-xxs">f</span>
                  <span className="w-3.5 h-3.5 bg-sky-500 text-white text-[8.5px] font-extrabold rounded-full flex items-center justify-center leading-none ring-1.5 ring-white font-sans shrink-0 shadow-xxs">Z</span>
                  <span className="w-3.5 h-3.5 bg-black text-white text-[7px] font-extrabold rounded-full flex items-center justify-center leading-none ring-1.5 ring-white font-sans shrink-0 shadow-xxs">T</span>
                </span>
                <span className="text-[10px] text-slate-800 font-bold max-w-[150px] truncate">
                  {activeChannel === "all" && "Tất cả kênh"}
                  {activeChannel === "facebook" && `FB: ${activeFbPageName}`}
                  {activeChannel === "zalo" && `Zalo: ${activeZaloAccountName}`}
                  {activeChannel === "tiktok" && `TikTok: ${activeTiktokAccountName}`}
                </span>
                <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${showUnifiedDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Unified Dropdown Menu */}
              {showUnifiedDropdown && (
                <>
                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setShowUnifiedDropdown(false)} />
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200/80 rounded-2xl shadow-xl z-50 p-3.5 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                    
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-3">
                      <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                        Chọn tài khoản hiển thị
                      </div>
                      <button 
                        onClick={() => {
                          setActiveChannel("all");
                          setShowUnifiedDropdown(false);
                        }}
                        className="text-[9px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        Hiện tất cả
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Facebook Page Selection */}
                      {isFbConnected && (
                        <div className="space-y-1">
                          <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 bg-blue-600 text-white text-[8px] font-extrabold rounded-full flex items-center justify-center leading-none shrink-0 font-sans shadow-xxs">f</span>
                            Facebook Page
                          </label>
                          <select
                            value={selectedFacebookPageId}
                            onChange={(e) => {
                              setSelectedFacebookPageId(e.target.value);
                              setActiveChannel("facebook");
                              scheduleConversationRefresh();
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] font-medium bg-slate-50 hover:bg-slate-100/50 transition-colors outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                          >
                            {facebookPages.map((page) => (
                              <option key={page._id} value={page.username}>{page.displayName}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Zalo Account Selection */}
                      {isZaloConnected && (
                        <div className="space-y-1">
                          <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 bg-sky-500 text-white text-[8px] font-extrabold rounded-full flex items-center justify-center leading-none shrink-0 font-sans shadow-xxs">Z</span>
                            Zalo Official Account
                          </label>
                          <select
                            value={selectedZaloAccountId}
                            onChange={(e) => {
                              setSelectedZaloAccountId(e.target.value);
                              setActiveChannel("zalo");
                              scheduleConversationRefresh();
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] font-medium bg-slate-50 hover:bg-slate-100/50 transition-colors outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                          >
                            {zaloAccounts.map((acc) => (
                              <option key={acc._id} value={acc.username}>{acc.displayName}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* TikTok Shop Selection */}
                      {isTiktokConnected && (
                        <div className="space-y-1">
                          <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 bg-black text-white text-[7px] font-extrabold rounded-full flex items-center justify-center leading-none shrink-0 font-sans shadow-xxs">T</span>
                            TikTok Shop
                          </label>
                          <select
                            value={selectedTiktokAccountId}
                            onChange={(e) => {
                              setSelectedTiktokAccountId(e.target.value);
                              setActiveChannel("tiktok");
                              scheduleConversationRefresh();
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] font-medium bg-slate-50 hover:bg-slate-100/50 transition-colors outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                          >
                            {tiktokAccounts.map((acc) => (
                              <option key={acc._id} value={acc.username}>{acc.displayName}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-grow flex-1 overflow-hidden" id="crm_tab_main_content">
        <Suspense fallback={<TabLoader label="Đang tải dữ liệu CRM..." />}>
          {subTab === "PHỄU KHÁCH HÀNG" && (
            <PipelineTab
              leads={leads}
              searchPipeline={searchPipeline}
              setSearchPipeline={setSearchPipeline}
              triggerUpsellCampaignOptimized={triggerUpsellCampaignOptimized}
              setShowCreateLeadModal={setShowCreateLeadModal}
              moveLeadPipeline={moveLeadPipeline}
              deleteLead={deleteLead}
              handleGoToChat={handleGoToChat}
              activeChannel={activeChannel}
              inboxCustomers={inboxCustomers}
              isFbConnected={isFbConnected}
              isZaloConnected={isZaloConnected}
            />
          )}

          {subTab === "OMNI-INBOX CHAT" && (
            <OmniChatTab
              inboxCustomers={inboxCustomers}
              activeCustomer={activeCustomer}
              chatHistory={chatHistory}
              chatPagination={chatPagination}
              typeMessage={typeMessage}
              setTypeMessage={setTypeMessage}
              aiWaiting={aiWaiting}
              aiConfig={aiConfig}
              setAIConfig={handleUpdateAIConfig}
              handleSelectCustomer={handleSelectCustomer}
              handleSendChatMessage={handleSendChatMessage}
              handleLoadOlderMessages={handleLoadOlderMessages}
              leads={leads}
              onCreateLeadFromChat={handleCreateLeadFromChat}
              onUpdateLeadStatus={moveLeadPipeline}
              facebookPages={facebookPages}
              selectedFacebookPageId={selectedFacebookPageId}
              setSelectedFacebookPageId={setSelectedFacebookPageId}
              handleApplyToAllPages={handleApplyToAllPages}
              copyingConfig={copyingConfig}
              onLoadMoreConversations={() => fetchOmniConversations(false, { loadMore: true })}
              hasMoreConversations={convsPagination.hasMore}
              activeChannel={activeChannel}
              setActiveChannel={setActiveChannel}
              isFbConnected={isFbConnected}
              isZaloConnected={isZaloConnected}
              isInboxLoading={isInboxLoading}
              onResumeAI={handleResumeAI}
            />
          )}

          {subTab === "AI COMMENT AUTO-REPLY" && (
            <div className="p-6 h-full overflow-y-auto">
              <AiCommentReplyManager
                facebookPages={facebookPages}
                selectedFacebookPageId={selectedFacebookPageId}
                setSelectedFacebookPageId={setSelectedFacebookPageId}
              />
            </div>
          )}
        </Suspense>
      </div>

      {/* Create Lead Modal Form */}
      {showCreateLeadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col gap-5 text-left animate-fade-in-up">

            <div className="flex justify-between items-center pb-2 border-b border-slate-100 shrink-0">
              <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Thêm Cơ Hội Bán Hàng Mới</h4>
              <button
                onClick={() => {
                  setShowCreateLeadModal(false);
                  setSelectedInboxCustId("");
                  setNewLeadName("");
                  setNewLeadCompany("");
                }}
                className="text-slate-400 hover:text-slate-700 font-extrabold text-lg focus:outline-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4">

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Liên kết với khách hàng từ Inbox (Tùy chọn)</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 cursor-pointer transition-all duration-200"
                  value={selectedInboxCustId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedInboxCustId(val);
                    const found = inboxCustomers.find(c => c.id === val);
                    if (found) {
                      setNewLeadName(found.name);
                      setNewLeadCompany(found.channel === "zalo" ? "Khách hàng từ Zalo" : "Khách hàng từ Facebook");
                    } else {
                      setNewLeadName("");
                      setNewLeadCompany("");
                    }
                  }}
                >
                  <option value="">-- Chọn khách hàng từ hội thoại chat --</option>
                  {inboxCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.channel === "zalo" ? "Zalo" : "Facebook"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tên khách hàng tiềm năng *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Lê Thị B..."
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tên doanh nghiệp / Công ty</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Công ty TNHH ABC..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                  value={newLeadCompany}
                  onChange={(e) => setNewLeadCompany(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Dự toán giá trị (đ)</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 15000000"
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-mono focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                  value={newLeadValue}
                  onChange={(e) => setNewLeadValue(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Mức độ nhiệt độ</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 cursor-pointer transition-all duration-200"
                    value={newLeadStatus}
                    onChange={(e) => setNewLeadStatus(e.target.value as "cold" | "warm" | "hot")}
                  >
                    <option value="cold">Khách Lạnh (Cold)</option>
                    <option value="warm">Khách Ấm (Warm)</option>
                    <option value="hot">Khách Nóng (Hot)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Bước xử lý (Tiến độ)</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 cursor-pointer transition-all duration-200"
                    value={newLeadTouchpoint}
                    onChange={(e) => setNewLeadTouchpoint(e.target.value)}
                  >
                    <option value="Mới tiếp cận">Mới tiếp cận</option>
                    <option value="Đã gửi báo giá">Đã gửi báo giá</option>
                    <option value="Sắp chốt HD">Sắp chốt HD</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Lưu cơ hội
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateLeadModal(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Automation Modal */}
      {automationModal && automationModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col gap-4 text-left animate-fade-in-up">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="p-2 bg-emerald-50 rounded-2xl">
                <Zap className="h-6 w-6" />
              </div>
              <div className="text-left">
                <h4 className="font-extrabold text-slate-800 text-sm">Kích hoạt chốt sales tự động</h4>
                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">Đã tạo và gửi hợp đồng</p>
              </div>
            </div>

            <div className="space-y-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-200/50 text-xs">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Khách hàng</span>
                <strong className="text-slate-700 text-xs mt-0.5 block">{automationModal.leadName}</strong>
                <span className="text-slate-400 block text-[9px] mt-0.5">{automationModal.company}</span>
              </div>
              <div className="h-px bg-slate-200/50 my-2" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-[10px] text-slate-500 truncate">Hợp đồng điện tử:</span>
                  <a href={automationModal.contractLink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-bold hover:underline truncate ml-auto">
                    {automationModal.contractLink.substring(automationModal.contractLink.lastIndexOf("/") + 1)}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-[10px] text-slate-500 truncate">Link thanh toán:</span>
                  <a href={automationModal.paymentLink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-bold hover:underline truncate ml-auto">
                    pay.igen-erp.vn/invoice...
                  </a>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed">
              ✦ Trợ lý iGen AI đã tự động đóng gói hợp đồng, tạo mã thanh toán, và gửi trực tiếp qua Omni-Inbox chat cho khách hàng để tối ưu hóa tỷ lệ chốt sales.
            </p>

            <div className="flex gap-2.5 mt-2">
              <button
                onClick={() => {
                  setAutomationModal(null);
                  setSubTab("OMNI-INBOX CHAT");
                }}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="h-4 w-4" />
                Xem chat
              </button>
              <button
                onClick={() => setAutomationModal(null)}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function TabLoader({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[250px] flex-col items-center justify-center gap-3 rounded-2xl bg-white border border-gray-150 p-6 text-center">
      <div className="w-8 h-8 border-3 border-indigo-650 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-gray-500 font-semibold">{label}</span>
    </div>
  );
}
