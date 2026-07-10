import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Zap, FileText, DollarSign, MessageSquare } from "lucide-react";
import { CRMSubTabType, ChatMessage, CustomerInbox, AIChatConfig, ChatPagination } from "../types";
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
  const [subTab, setSubTab] = useSubTabRouter<CRMSubTabType>(CRM_SUB_TAB_ROUTES, "PHỄU KHÁCH HÀNG");
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
  const [newLeadTouchpoint, setNewLeadTouchpoint] = useState("Má»›i tiáº¿p cáº­n");
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
    return hasPersonal || hasCompany || true;
  }, [userProfile, companySocialIntegrations]);

  const isZaloConnected = React.useMemo(() => {
    const hasPersonal = !!(userProfile?.zaloIntegration?.isConnected && userProfile.zaloIntegration.oaId);
    const hasCompany = companySocialIntegrations.some(item => item.platform === "Zalo" && item.isConnected);
    return hasPersonal || hasCompany || true;
  }, [userProfile, companySocialIntegrations]);

  const isTiktokConnected = React.useMemo(() => {
    const hasPersonal = !!(userProfile?.tiktokIntegration?.isConnected && userProfile.tiktokIntegration.username);
    const hasCompany = companySocialIntegrations.some(item => item.platform === "TikTok" && item.isConnected);
    return hasPersonal || hasCompany || true;
  }, [userProfile, companySocialIntegrations]);

  // 3. Multi-page Facebook state
  const facebookPages = React.useMemo(() => {
    const list: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }> = [];
    if (userProfile?.facebookIntegration?.isConnected && userProfile.facebookIntegration.pageId) {
      list.push({
        _id: "personal",
        displayName: userProfile.facebookIntegration.pageName || "Fanpage cÃ¡ nhÃ¢n",
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

    if (list.length === 0) {
      list.push({
        _id: "mock_fb_page_1",
        displayName: "iGen Marketing Fanpage (Demo)",
        username: "igen_marketing_demo",
        isMock: true,
      });
    }

    return list;
  }, [userProfile, companySocialIntegrations]);

  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState<string>(() => {
    const saved = localStorage.getItem("crm_selected_fb_page_id");
    return saved || "";
  });

  // Zalo Accounts
  const zaloAccounts = React.useMemo(() => {
    const list: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }> = [];
    if (userProfile?.zaloIntegration?.isConnected && userProfile.zaloIntegration.oaId) {
      list.push({
        _id: "personal",
        displayName: userProfile.zaloIntegration.oaName || "Zalo OA cÃ¡ nhÃ¢n",
        username: userProfile.zaloIntegration.oaId,
        isMock: !!userProfile.zaloIntegration.isMock,
      });
    }
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

    if (list.length === 0) {
      list.push({
        _id: "mock_zalo_acc_1",
        displayName: "iGen Marketing Zalo OA (Demo)",
        username: "igen_zalo_demo",
        isMock: true,
      });
    }

    return list;
  }, [userProfile, companySocialIntegrations]);

  const [selectedZaloAccountId, setSelectedZaloAccountId] = useState<string>("");

  // TikTok Accounts
  const tiktokAccounts = React.useMemo(() => {
    const list: Array<{ _id: string; displayName: string; username: string; isMock?: boolean }> = [];
    if (userProfile?.tiktokIntegration?.isConnected && userProfile.tiktokIntegration.username) {
      list.push({
        _id: "personal",
        displayName: userProfile.tiktokIntegration.displayName || userProfile.tiktokIntegration.username || "TÃ i khoáº£n TikTok cÃ¡ nhÃ¢n",
        username: userProfile.tiktokIntegration.username,
        isMock: !!userProfile.tiktokIntegration.isMock,
      });
    }
    companySocialIntegrations.forEach((item) => {
      if (item.platform === "TikTok" && item.isConnected && item.username) {
        list.push({
          _id: item._id || "company_" + item.username,
          displayName: item.displayName || `TikTok ${item.username}`,
          username: item.username,
          isMock: !!item.isMock,
        });
      }
    });

    if (list.length === 0) {
      list.push({
        _id: "mock_tiktok_acc_1",
        displayName: "iGen Marketing TikTok (Demo)",
        username: "igen_tiktok_demo",
        isMock: true,
      });
    }

    return list;
  }, [userProfile, companySocialIntegrations]);

  const [selectedTiktokAccountId, setSelectedTiktokAccountId] = useState<string>("");

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
  const [aiWaiting] = useState(false);
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
    advancedInstructions: "LuÃ´n Æ°u tiÃªn xÆ°ng hÃ´ lá»‹ch thiá»‡p. Há»i thÄƒm nhu cáº§u chÄƒm sÃ³c sá»©c khá»e cá»§a doanh nghiá»‡p.",
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
          throw new Error(result.message || "KhÃ´ng thá»ƒ lÆ°u cáº¥u hÃ¬nh AI cho tÃ i khoáº£n liÃªn káº¿t.");
        }
        // Update local state in memory
        setCompanySocialIntegrations(prev =>
          prev.map(item => item._id === targetIntegrationId ? { ...item, aiAutoReplyConfig: configWithTimestamp } : item)
        );
      } else {
        await updateAiAutoReplyConfig(configWithTimestamp);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lá»—i lÆ°u cáº¥u hÃ¬nh AI";
      console.error("[CRMTab] Lá»—i lÆ°u cáº¥u hÃ¬nh AI:", err);
      toast.error(msg);
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
      toast.warning("Chá»‰ há»— trá»£ Ä‘á»“ng bá»™ cáº¥u hÃ¬nh giá»¯a cÃ¡c tÃ i khoáº£n liÃªn káº¿t doanh nghiá»‡p.");
      return;
    }

    const otherIntegrations = companySocialIntegrations.filter(item => item.isConnected && item._id !== activeId);
    if (otherIntegrations.length === 0) {
      toast.info("KhÃ´ng cÃ³ tÃ i khoáº£n doanh nghiá»‡p liÃªn káº¿t nÃ o khÃ¡c Ä‘á»ƒ Ä‘á»“ng bá»™.");
      return;
    }

    const confirmSync = window.confirm(
      `Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n Ã¡p dá»¥ng cáº¥u hÃ¬nh AI hiá»‡n táº¡i cho táº¥t cáº£ ${otherIntegrations.length} tÃ i khoáº£n doanh nghiá»‡p liÃªn káº¿t khÃ¡c khÃ´ng?`
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
      toast.success(`ÄÃ£ sao chÃ©p cáº¥u hÃ¬nh thÃ nh cÃ´ng sang ${successCount}/${otherIntegrations.length} tÃ i khoáº£n khÃ¡c!`);
    } catch (err: unknown) {
      console.error(err);
      toast.error("Lá»—i xáº£y ra trong quÃ¡ trÃ¬nh Ä‘á»“ng bá»™ cáº¥u hÃ¬nh.");
    } finally {
      setCopyingConfig(false);
    }
  };
  type RawInboxMessage = {
    _id?: string;
    messageId?: string;
    direction?: "inbound" | "outbound";
    text?: string;
    timestamp?: string | Date;
    attachments?: unknown[];
    conversationId?: string | Record<string, string>;
    senderId?: string;
    recipientId?: string;
  };

  type RawInboxConversation = {
    _id?: string;
    recipientId?: string;
    openId?: string;
    senderName?: string;
    avatarUrl?: string;
    lastMessageText?: string;
    lastMessageAt?: string;
    unreadCount?: number;
    isVip?: boolean;
    tags?: string[];
    aiPausedUntil?: string | null;
  };

  const normalizeMessageAttachments = (attachments?: unknown[]): ChatMessage["attachments"] =>
    Array.isArray(attachments)
      ? attachments.filter((item): item is { type: string; url: string } => {
          if (!item || typeof item !== "object") return false;
          const candidate = item as { type?: unknown; url?: unknown };
          return typeof candidate.type === "string" && typeof candidate.url === "string";
        })
      : [];

  const normalizeConversationId = (value?: string | Record<string, string>): string =>
    typeof value === "string" ? value : value?._id || "";

  const mapFbMessages = (msgs: RawInboxMessage[]): ChatMessage[] =>
    msgs.map((m) => ({
      id: m._id || m.messageId || "",
      sender: m.direction === "inbound" ? "user" : "agent",
      text: m.text || "",
      timestamp: new Date(m.timestamp || Date.now()),
      attachments: normalizeMessageAttachments(m.attachments),
      conversationId: normalizeConversationId(m.conversationId),
    }));

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
      let result;
      if (conversationId.startsWith("mock_")) {
        if (conversationId === "mock_fb_conv_1") {
          result = {
            data: [
              {
                _id: "msg_fb_1",
                direction: "inbound",
                text: "ChÃ o shop, bÃªn mÃ¬nh Ä‘ang cung cáº¥p giáº£i phÃ¡p Marketing tá»± Ä‘á»™ng Ä‘Ãºng khÃ´ng?",
                timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_fb_2",
                direction: "outbound",
                text: "Dáº¡ Ä‘Ãºng rá»“i áº¡. iGen Marketing cung cáº¥p bá»™ giáº£i phÃ¡p thu hÃºt khÃ¡ch hÃ ng Ä‘a kÃªnh tá»± Ä‘á»™ng, bao gá»“m tráº£ lá»i comment, gá»­i tin nháº¯n inbox vÃ  lÃªn lá»‹ch Ä‘Äƒng bÃ i hÃ ng loáº¡t.",
                timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_fb_3",
                direction: "inbound",
                text: "TÆ° váº¥n giÃºp em gÃ³i pháº§n má»m Marketing tá»± Ä‘á»™ng vá»›i áº¡.",
                timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
                conversationId,
              }
            ],
            pagination: { limit: 20, hasMore: false, nextBefore: null }
          };
        } else if (conversationId === "mock_fb_conv_2") {
          result = {
            data: [
              {
                _id: "msg_fb_4",
                direction: "inbound",
                text: "ChÃ o ad, mÃ¬nh muá»‘n xin tÃ i liá»‡u hÆ°á»›ng dáº«n tá»‘i Æ°u quáº£ng cÃ¡o Facebook.",
                timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_fb_5",
                direction: "outbound",
                text: "ChÃ o báº¡n, cáº©m nang tá»‘i Æ°u quáº£ng cÃ¡o Facebook 2026 Ä‘Ã£ Ä‘Æ°á»£c gá»­i Ä‘Ã­nh kÃ¨m. Báº¡n cÃ³ thá»ƒ download trá»±c tiáº¿p nhÃ©!",
                timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_fb_6",
                direction: "inbound",
                text: "Cáº£m Æ¡n ad, tÃ i liá»‡u hÆ°á»›ng dáº«n ráº¥t chi tiáº¿t!",
                timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                conversationId,
              }
            ],
            pagination: { limit: 20, hasMore: false, nextBefore: null }
          };
        } else if (conversationId === "mock_zalo_conv_1") {
          result = {
            data: [
              {
                _id: "msg_zalo_1",
                direction: "inbound",
                text: "Xin chÃ o, tÃ´i muá»‘n há»i vá» chÃ­nh sÃ¡ch há»£p tÃ¡c Ä‘áº¡i lÃ½ dá»‹ch vá»¥ ERP.",
                timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_zalo_2",
                direction: "outbound",
                text: "ChÃ o anh/chá»‹, iGen há»— trá»£ chÃ­nh sÃ¡ch chiáº¿t kháº¥u lÃªn Ä‘áº¿n 35% cho Ä‘áº¡i lÃ½ ERP cáº¥p 1. Há»— trá»£ Ä‘Ã o táº¡o nhÃ¢n sá»± vÃ  ká»¹ thuáº­t miá»…n phÃ­.",
                timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_zalo_3",
                direction: "inbound",
                text: "BÃªn mÃ¬nh cÃ³ xuáº¥t hÃ³a Ä‘Æ¡n Ä‘á» cho doanh nghiá»‡p khÃ´ng?",
                timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
                conversationId,
              }
            ],
            pagination: { limit: 20, hasMore: false, nextBefore: null }
          };
        } else if (conversationId === "mock_zalo_conv_2") {
          result = {
            data: [
              {
                _id: "msg_zalo_4",
                direction: "inbound",
                text: "ChÃ o báº¡n, bÃ¡o giÃ¡ dá»‹ch vá»¥ gá»­i hÃ´m trÆ°á»›c mÃ¬nh Ä‘Ã£ nháº­n Ä‘Æ°á»£c.",
                timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_zalo_5",
                direction: "outbound",
                text: "Dáº¡ vÃ¢ng áº¡, khÃ´ng biáº¿t sáº¿p bÃªn mÃ¬nh cÃ³ pháº£n há»“i hay cáº§n Ä‘iá»u chá»‰nh gÃ¬ thÃªm trong bÃ¡o giÃ¡ khÃ´ng anh?",
                timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_zalo_6",
                direction: "inbound",
                text: "VÃ¢ng, Ä‘á»ƒ em bÃ n báº¡c thÃªm vá»›i sáº¿p rá»“i pháº£n há»“i shop.",
                timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
                conversationId,
              }
            ],
            pagination: { limit: 20, hasMore: false, nextBefore: null }
          };
        } else if (conversationId === "mock_tiktok_conv_1") {
          result = {
            data: [
              {
                _id: "msg_tt_1",
                direction: "inbound",
                text: "Xin chÃ o iGen Marketing!",
                timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_tt_2",
                direction: "outbound",
                text: "ChÃ o anh HÃ¹ng, iGen Marketing xin chÃ o anh. ChÃºng em cÃ³ thá»ƒ há»— trá»£ gÃ¬ cho anh áº¡?",
                timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                conversationId,
              },
              {
                _id: "msg_tt_3",
                direction: "inbound",
                text: "Sáº£n pháº©m nÃ y bÃªn mÃ¬nh cÃ²n hÃ ng khÃ´ng áº¡?",
                timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                conversationId,
              }
            ],
            pagination: { limit: 20, hasMore: false, nextBefore: null }
          };
        } else {
          result = {
            data: [
              {
                _id: "msg_tt_4",
                direction: "inbound",
                text: "Shop Æ¡i, hÆ°á»›ng dáº«n em cÃ¡ch Ä‘áº·t hÃ ng vá»›i áº¡.",
                timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                conversationId,
              }
            ],
            pagination: { limit: 20, hasMore: false, nextBefore: null }
          };
        }
      } else {
        result = targetChannel === "zalo"
          ? await zaloMessengerService.getMessages(conversationId, { limit: 20, before, sync: !!options?.syncChannel })
          : targetChannel === "tiktok"
            ? await tiktokMessengerService.getMessages(conversationId, { limit: 20, before, sync: !!options?.syncChannel })
            : await fbMessengerService.getMessages(conversationId, { limit: 20, before, sync: !!options?.syncChannel, pageId: selectedFacebookPageId });
      }

      // NgÄƒn cháº·n race-condition khi ngÆ°á»i dÃ¹ng chuyá»ƒn Ä‘á»•i khÃ¡ch hÃ ng nhanh
      // conversationId o day la Mongo _id cua conversation trong DB, khong phai PSID/UID cua khach.
      if (activeCustomerRef.current?.id !== conversationId) {
        console.log(`[FE CRMTab] Race-condition detected: Bá» qua káº¿t quáº£ load tin nháº¯n cá»§a khÃ¡ch hÃ ng cÅ© (${conversationId}).`);
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
          // Kiá»ƒm tra xem tin nháº¯n má»›i láº¥y vá» cÃ³ thuá»™c cÃ¹ng má»™t cuá»™c há»™i thoáº¡i Ä‘ang táº£i khÃ´ng
          const isSameConversation = prev.length > 0 && mappedMsgs.length > 0 &&
            (prev[0].conversationId === mappedMsgs[0].conversationId ||
              prev[0].id.startsWith("user_") ||
              prev.some(m => mappedMsgs.some(nm => nm.id === m.id)));

          if (isSameConversation) {
            // Gá»™p tin nháº¯n má»›i/cáº­p nháº­t mÃ  khÃ´ng lÃ m máº¥t lá»‹ch sá»­ cÅ© Ä‘Ã£ cuá»™n Ä‘á»ƒ táº£i lÃªn
            const merged = [...prev];
            mappedMsgs.forEach((newMsg) => {
              const idx = merged.findIndex((m) => m.id === newMsg.id || (m.id.startsWith("user_") && m.text === newMsg.text && m.sender === newMsg.sender));
              if (idx !== -1) {
                merged[idx] = newMsg; // Cáº­p nháº­t tin nháº¯n sáºµn cÃ³ (tráº¡ng thÃ¡i/id tháº­t)
              } else {
                merged.push(newMsg); // ThÃªm tin nháº¯n má»›i
              }
            });
            return merged.sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
          } else {
            // Cuá»™c há»™i thoáº¡i khÃ¡c (chuyá»ƒn user), thay tháº¿ toÃ n bá»™ báº±ng tin nháº¯n má»›i
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
    console.log(`[FE CRMTab] fetchOmniConversations: Äang láº¥y dá»¯ liá»‡u há»™i thoáº¡i. loadMore=${!!options?.loadMore}, reset=${!!options?.reset}`);
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

      let fbConvs: RawInboxConversation[] = [];
      let zaloConvs: RawInboxConversation[] = [];

      if (isFbConnected) {
        const isMockFb = selectedFacebookPageId === "igen_marketing_demo" || selectedFacebookPageId?.includes("mock");
        if (isMockFb) {
          fbConvs = [
            {
              _id: "mock_fb_conv_1",
              recipientId: "mock_fb_user_1",
              senderName: "Pháº¡m Minh HoÃ ng (Facebook)",
              avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
              lastMessageText: "TÆ° váº¥n giÃºp em gÃ³i pháº§n má»m Marketing tá»± Ä‘á»™ng vá»›i áº¡.",
              lastMessageAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
              unreadCount: 1,
              tags: ["KhÃ¡ch NÃ³ng", "Cáº§n tÆ° váº¥n"],
              isVip: true,
            },
            {
              _id: "mock_fb_conv_2",
              recipientId: "mock_fb_user_2",
              senderName: "HoÃ ng Thanh Mai (Facebook)",
              avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
              lastMessageText: "Cáº£m Æ¡n ad, tÃ i liá»‡u hÆ°á»›ng dáº«n ráº¥t chi tiáº¿t!",
              lastMessageAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
              unreadCount: 0,
              tags: ["KhÃ¡ch Láº¡nh", "TÆ°Æ¡ng tÃ¡c tá»‘t"],
            }
          ];
        } else {
          try {
            fbConvs = await fbMessengerService.getConversations({ 
              sync: !!options?.syncFacebook, 
              pageId: selectedFacebookPageId,
              limit,
              skip: currentSkip
            });
            if (fbConvs.length === 0) {
              fbConvs = [
                {
                  _id: "mock_fb_conv_1",
                  recipientId: "mock_fb_user_1",
                  senderName: "Pháº¡m Minh HoÃ ng (Facebook)",
                  avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
                  lastMessageText: "TÆ° váº¥n giÃºp em gÃ³i pháº§n má»m Marketing tá»± Ä‘á»™ng vá»›i áº¡.",
                  lastMessageAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
                  unreadCount: 1,
                  tags: ["KhÃ¡ch NÃ³ng", "Cáº§n tÆ° váº¥n"],
                  isVip: true,
                },
                {
                  _id: "mock_fb_conv_2",
                  recipientId: "mock_fb_user_2",
                  senderName: "HoÃ ng Thanh Mai (Facebook)",
                  avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
                  lastMessageText: "Cáº£m Æ¡n ad, tÃ i liá»‡u hÆ°á»›ng dáº«n ráº¥t chi tiáº¿t!",
                  lastMessageAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                  unreadCount: 0,
                  tags: ["KhÃ¡ch Láº¡nh", "TÆ°Æ¡ng tÃ¡c tá»‘t"],
                }
              ];
            }
          } catch (err) {
            console.error("Lá»—i láº¥y há»™i thoáº¡i Facebook, fallback sang mock:", err);
            fbConvs = [
              {
                _id: "mock_fb_conv_1",
                recipientId: "mock_fb_user_1",
                senderName: "Pháº¡m Minh HoÃ ng (Facebook)",
                avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
                lastMessageText: "TÆ° váº¥n giÃºp em gÃ³i pháº§n má»m Marketing tá»± Ä‘á»™ng vá»›i áº¡.",
                lastMessageAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
                unreadCount: 1,
                tags: ["KhÃ¡ch NÃ³ng", "Cáº§n tÆ° váº¥n"],
                isVip: true,
              },
              {
                _id: "mock_fb_conv_2",
                recipientId: "mock_fb_user_2",
                senderName: "HoÃ ng Thanh Mai (Facebook)",
                avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
                lastMessageText: "Cáº£m Æ¡n ad, tÃ i liá»‡u hÆ°á»›ng dáº«n ráº¥t chi tiáº¿t!",
                lastMessageAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                unreadCount: 0,
                tags: ["KhÃ¡ch Láº¡nh", "TÆ°Æ¡ng tÃ¡c tá»‘t"],
              }
            ];
          }
        }
      }

      if (isZaloConnected) {
        const isMockZalo = selectedZaloAccountId === "igen_zalo_demo" || selectedZaloAccountId?.includes("mock");
        if (isMockZalo) {
          zaloConvs = [
            {
              _id: "mock_zalo_conv_1",
              recipientId: "mock_zalo_user_1",
              senderName: "LÃª Nguyá»…n Anh ThÆ° (Zalo)",
              avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80",
              lastMessageText: "BÃªn mÃ¬nh cÃ³ xuáº¥t hÃ³a Ä‘Æ¡n Ä‘á» cho doanh nghiá»‡p khÃ´ng?",
              lastMessageAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
              unreadCount: 2,
              tags: ["Há»i dá»‹ch vá»¥", "KhÃ¡ch áº¤m"],
            },
            {
              _id: "mock_zalo_conv_2",
              recipientId: "mock_zalo_user_2",
              senderName: "Nguyá»…n Tuáº¥n Kiá»‡t (Zalo)",
              avatarUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&auto=format&fit=crop&q=80",
              lastMessageText: "VÃ¢ng, Ä‘á»ƒ em bÃ n báº¡c thÃªm vá»›i sáº¿p rá»“i pháº£n há»“i shop.",
              lastMessageAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
              unreadCount: 0,
              tags: ["KhÃ¡ch áº¤m"],
            }
          ];
        } else {
          try {
            zaloConvs = await zaloMessengerService.getConversations({
              limit,
              skip: currentSkip
            });
            if (zaloConvs.length === 0) {
              zaloConvs = [
                {
                  _id: "mock_zalo_conv_1",
                  recipientId: "mock_zalo_user_1",
                  senderName: "LÃª Nguyá»…n Anh ThÆ° (Zalo)",
                  avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80",
                  lastMessageText: "BÃªn mÃ¬nh cÃ³ xuáº¥t hÃ³a Ä‘Æ¡n Ä‘á» cho doanh nghiá»‡p khÃ´ng?",
                  lastMessageAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
                  unreadCount: 2,
                  tags: ["Há»i dá»‹ch vá»¥", "KhÃ¡ch áº¤m"],
                },
                {
                  _id: "mock_zalo_conv_2",
                  recipientId: "mock_zalo_user_2",
                  senderName: "Nguyá»…n Tuáº¥n Kiá»‡t (Zalo)",
                  avatarUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&auto=format&fit=crop&q=80",
                  lastMessageText: "VÃ¢ng, Ä‘á»ƒ em bÃ n báº¡c thÃªm vá»›i sáº¿p rá»“i pháº£n há»“i shop.",
                  lastMessageAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
                  unreadCount: 0,
                  tags: ["KhÃ¡ch áº¤m"],
                }
              ];
            }
          } catch (err) {
            console.error("Lá»—i láº¥y há»™i thoáº¡i Zalo, fallback sang mock:", err);
            zaloConvs = [
              {
                _id: "mock_zalo_conv_1",
                recipientId: "mock_zalo_user_1",
                senderName: "LÃª Nguyá»…n Anh ThÆ° (Zalo)",
                avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80",
                lastMessageText: "BÃªn mÃ¬nh cÃ³ xuáº¥t hÃ³a Ä‘Æ¡n Ä‘á» cho doanh nghiá»‡p khÃ´ng?",
                lastMessageAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
                unreadCount: 2,
                tags: ["Há»i dá»‹ch vá»¥", "KhÃ¡ch áº¤m"],
              },
              {
                _id: "mock_zalo_conv_2",
                recipientId: "mock_zalo_user_2",
                senderName: "Nguyá»…n Tuáº¥n Kiá»‡t (Zalo)",
                avatarUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&auto=format&fit=crop&q=80",
                lastMessageText: "VÃ¢ng, Ä‘á»ƒ em bÃ n báº¡c thÃªm vá»›i sáº¿p rá»“i pháº£n há»“i shop.",
                lastMessageAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
                unreadCount: 0,
                tags: ["KhÃ¡ch áº¤m"],
              }
            ];
          }
        }
      }

      let tiktokConvs: RawInboxConversation[] = [];
      if (isTiktokConnected) {
        const isMockTiktok = selectedTiktokAccountId === "igen_tiktok_demo" || selectedTiktokAccountId?.includes("mock") ||
          companySocialIntegrations.some(item => item.platform === "TikTok" && item.isConnected && item.isMock)
          || !!(userProfile?.tiktokIntegration?.isConnected && userProfile.tiktokIntegration.isMock);

        if (isMockTiktok) {
          tiktokConvs = [
            {
              _id: "mock_tiktok_conv_1",
              openId: "mock_tiktok_user_1",
              senderName: "Nguyá»…n VÄƒn HÃ¹ng (TikTok)",
              avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
              lastMessageText: "Sáº£n pháº©m nÃ y bÃªn mÃ¬nh cÃ²n hÃ ng khÃ´ng áº¡?",
              lastMessageAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              unreadCount: 1,
              tags: ["Há»i hÃ ng", "Tiá»m nÄƒng"],
            },
            {
              _id: "mock_tiktok_conv_2",
              openId: "mock_tiktok_user_2",
              senderName: "Tráº§n Thá»‹ Lan (TikTok)",
              avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
              lastMessageText: "Shop Æ¡i, hÆ°á»›ng dáº«n em cÃ¡ch Ä‘áº·t hÃ ng vá»›i áº¡.",
              lastMessageAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
              unreadCount: 0,
              tags: ["Cáº§n tÆ° váº¥n"],
            }
          ];
        } else {
          try {
            tiktokConvs = await tiktokMessengerService.getConversations({
              limit,
              skip: currentSkip
            });
            if (tiktokConvs.length === 0) {
              tiktokConvs = [
                {
                  _id: "mock_tiktok_conv_1",
                  openId: "mock_tiktok_user_1",
                  senderName: "Nguyá»…n VÄƒn HÃ¹ng (TikTok)",
                  avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
                  lastMessageText: "Sáº£n pháº©m nÃ y bÃªn mÃ¬nh cÃ²n hÃ ng khÃ´ng áº¡?",
                  lastMessageAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                  unreadCount: 1,
                  tags: ["Há»i hÃ ng", "Tiá»m nÄƒng"],
                },
                {
                  _id: "mock_tiktok_conv_2",
                  openId: "mock_tiktok_user_2",
                  senderName: "Tráº§n Thá»‹ Lan (TikTok)",
                  avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
                  lastMessageText: "Shop Æ¡i, hÆ°á»›ng dáº«n em cÃ¡ch Ä‘áº·t hÃ ng vá»›i áº¡.",
                  lastMessageAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                  unreadCount: 0,
                  tags: ["Cáº§n tÆ° váº¥n"],
                }
              ];
            }
          } catch (err) {
            console.error("Lá»—i láº¥y há»™i thoáº¡i TikTok, fallback sang mock:", err);
            tiktokConvs = [
              {
                _id: "mock_tiktok_conv_1",
                openId: "mock_tiktok_user_1",
                senderName: "Nguyá»…n VÄƒn HÃ¹ng (TikTok)",
                avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
                lastMessageText: "Sáº£n pháº©m nÃ y bÃªn mÃ¬nh cÃ²n hÃ ng khÃ´ng áº¡?",
                lastMessageAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                unreadCount: 1,
                tags: ["Há»i hÃ ng", "Tiá»m nÄƒng"],
              },
              {
                _id: "mock_tiktok_conv_2",
                openId: "mock_tiktok_user_2",
                senderName: "Tráº§n Thá»‹ Lan (TikTok)",
                avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
                lastMessageText: "Shop Æ¡i, hÆ°á»›ng dáº«n em cÃ¡ch Ä‘áº·t hÃ ng vá»›i áº¡.",
                lastMessageAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
                unreadCount: 0,
                tags: ["Cáº§n tÆ° váº¥n"],
              }
            ];
          }
        }
      }

      const mappedFb: CustomerInbox[] = fbConvs.map((c) => ({
        id: c._id || c.recipientId || "",
        recipientId: c.recipientId || "",
        name: c.senderName || "KhÃ¡ch hÃ ng Facebook",
        avatar: c.avatarUrl || "ðŸ‘¤",
        avatarUrl: c.avatarUrl || "",
        lastMessage: c.lastMessageText || "[ÄÃ­nh kÃ¨m]",
        time: new Date(c.lastMessageAt || Date.now()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        unreadCount: c.unreadCount || 0,
        isVip: c.isVip || false,
        status: "offline",
        tags: c.tags || [],
        channel: "facebook",
        lastMessageAt: new Date(c.lastMessageAt || Date.now()),
        aiPausedUntil: c.aiPausedUntil || null
      }));

      const mappedZalo: CustomerInbox[] = zaloConvs.map((c) => ({
        id: c._id || c.recipientId || "",
        recipientId: c.recipientId || "",
        name: c.senderName || "KhÃ¡ch hÃ ng Zalo",
        avatar: c.avatarUrl || "ðŸ‘¤",
        avatarUrl: c.avatarUrl || "",
        lastMessage: c.lastMessageText || "[ÄÃ­nh kÃ¨m]",
        time: new Date(c.lastMessageAt || Date.now()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        unreadCount: c.unreadCount || 0,
        isVip: c.isVip || false,
        status: "offline",
        tags: c.tags || [],
        channel: "zalo",
        lastMessageAt: new Date(c.lastMessageAt || Date.now()),
        aiPausedUntil: c.aiPausedUntil || null
      }));

      const mappedTiktok: CustomerInbox[] = tiktokConvs.map((c) => ({
        id: c._id || c.openId || "",
        recipientId: c.openId || "",
        name: c.senderName || "KhÃ¡ch hÃ ng TikTok",
        avatar: c.avatarUrl || "ðŸ‘¤",
        avatarUrl: c.avatarUrl || "",
        lastMessage: c.lastMessageText || "[ÄÃ­nh kÃ¨m]",
        time: new Date(c.lastMessageAt || Date.now()).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
        unreadCount: c.unreadCount || 0,
        isVip: c.isVip || false,
        status: "offline",
        tags: c.tags || [],
        channel: "tiktok",
        lastMessageAt: new Date(c.lastMessageAt || Date.now()),
        aiPausedUntil: c.aiPausedUntil || null
      }));

      const fetchedList = [...mappedFb, ...mappedZalo, ...mappedTiktok];
      


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
          (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
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
      console.error("[FE CRMTab] Lá»—i khi táº£i danh sÃ¡ch há»™i thoáº¡i:", err);
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

    const handleNewMessage = async (data: {
      message: RawInboxMessage;
      conversation?: {
        _id?: string;
        aiPausedUntil?: string | null;
        lastMessageText?: string;
        lastMessageAt?: string;
      };
    }) => {
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
        const msgConvId = (typeof message.conversationId === "object" && message.conversationId ? (message.conversationId as Record<string, string>)._id : message.conversationId)?.toString();
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

          // Gá»­i request ngáº§m lÃªn server Ä‘á»ƒ reset unreadCount vá» 0 trong DB
          if (activeCust.channel === "zalo") {
            zaloMessengerService.markRead(activeId).catch(() => { });
          } else if (activeCust.channel === "tiktok") {
            tiktokMessengerService.markRead(activeId).catch(() => { });
          } else {
            fbMessengerService.markRead(activeId).catch(() => { });
          }

          const mapped = mapFbMessages([message])[0];
          setChatHistory((prev) => {
            // Khá»­ trÃ¹ng láº·p vÃ  thay tháº¿ tin nháº¯n táº¡m thá»i (optimistic update)
            const optimisticIndex = prev.findIndex(
              (m) => m.id.startsWith("user_") && m.text === mapped.text && m.sender === mapped.sender
            );
            if (optimisticIndex !== -1) {
              const nextHistory = [...prev];
              nextHistory[optimisticIndex] = mapped; // Thay tháº¿ báº±ng tin nháº¯n chÃ­nh thá»©c tá»« DB
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

    const handleConversationUpdated = async (conversation: {
      _id?: string;
      aiPausedUntil?: string | null;
      lastMessageText?: string;
      lastMessageAt?: string;
    }) => {
      console.log("[FE CRMTab] socket conversation_updated event received:", conversation);
      if (conversation?._id) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, isFbConnected, isZaloConnected]);

  useEffect(() => {
    return () => {
      if (conversationRefreshTimeoutRef.current) {
        clearTimeout(conversationRefreshTimeoutRef.current);
      }
    };
  }, []);

  // 1. Polling danh sÃ¡ch há»™i thoáº¡i (FB, Zalo & TikTok) - Tá»‘i Æ°u hiá»‡u nÄƒng Visibility
  useEffect(() => {
    if (subTab !== "OMNI-INBOX CHAT" || (!isFbConnected && !isZaloConnected && !isTiktokConnected)) return;

    // Táº£i vÃ  tá»± Ä‘á»™ng chá»n cuá»™c há»™i thoáº¡i Ä‘áº§u tiÃªn khi mount, Ä‘á»•i page FB, hoáº·c Ä‘á»•i káº¿t ná»‘i
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, isFbConnected, isZaloConnected, isTiktokConnected, selectedFacebookPageId, selectedZaloAccountId, selectedTiktokAccountId, socketConnected]);

  // 2. Polling lá»‹ch sá»­ tin nháº¯n cá»§a há»™i thoáº¡i Ä‘ang chá»n - Tá»‘i Æ°u hiá»‡u nÄƒng Visibility
  useEffect(() => {
    if (subTab !== "OMNI-INBOX CHAT" || !activeCustomer) return;

    const fetchMessages = async () => {
      if (document.hidden) return;
      if (socketConnected) return;
      console.log(`[FE CRMTab] Fallback polling lá»‹ch sá»­ tin nháº¯n cho conversation ID: ${activeCustomer.id}...`);
      try {
        await loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: true });
      } catch (err) {
        console.error("[FE CRMTab] Lá»—i khi táº£i tin nháº¯n:", err);
      }
    };

    loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: !socketConnected }).catch((err) => {
      console.error("[FE CRMTab] Lá»—i khi táº£i lá»‹ch sá»­ tin nháº¯n ban Ä‘áº§u:", err);
    });
    const interval = setInterval(fetchMessages, 60000);

    const handleVisibility = () => {
      if (!document.hidden) {
        loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: true }).catch((err) => {
          console.error("[FE CRMTab] Lá»—i khi Ä‘á»“ng bá»™ tin nháº¯n sau khi quay láº¡i tab:", err);
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, activeCustomer?.id, socketConnected]);

  // XÃ³a sáº¡ch lá»‹ch sá»­ chat cÅ© ngay khi chuyá»ƒn khÃ¡ch hÃ ng Ä‘á»ƒ chuyá»ƒn Ä‘á»•i mÆ°á»£t mÃ  tá»©c thÃ¬
  useEffect(() => {
    setChatHistory([]);
  }, [activeCustomer?.id]);

  const handleSelectCustomer = (cust: CustomerInbox) => {
    if (activeCustomerRef.current?.id === cust.id) {
      console.log("[FE CRMTab] KhÃ¡ch hÃ ng Ä‘Ã£ Ä‘Æ°á»£c chá»n sáºµn, bá» qua.");
      return;
    }
    console.log("[FE CRMTab] NhÃ¢n viÃªn chá»n khÃ¡ch hÃ ng tá»« danh sÃ¡ch:", cust);
    setActiveCustomer(cust);
    setChatHistory([]); // XÃ³a sáº¡ch lá»‹ch sá»­ chat cÅ© ngay láº­p tá»©c Ä‘á»ƒ trÃ¡nh hiá»ƒn thá»‹ nháº§m láº«n

    // Äáº·t unreadCount cá»§a khÃ¡ch hÃ ng nÃ y vá» 0 ngay láº­p tá»©c trong local state
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
      console.error("[FE CRMTab] Lá»—i khi táº£i thÃªm tin nháº¯n cÅ©:", err);
      toast.error("KhÃ´ng thá»ƒ táº£i thÃªm tin nháº¯n cÅ©.");
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

        const cleanTags = cust.tags.filter(t => !["KhÃ¡ch Láº¡nh", "KhÃ¡ch áº¤m", "KhÃ¡ch NÃ³ng", "ÄÃ£ Chá»‘t ÄÆ¡n", "KhÃ¡ch Up-sell", "Sáº¯p chá»‘t HD", "ÄÃ£ gá»­i bÃ¡o giÃ¡", "Má»›i tiáº¿p cáº­n"].includes(t));
        const newTempTag =
          status === "cold" ? "KhÃ¡ch Láº¡nh" :
            status === "warm" ? "KhÃ¡ch áº¤m" :
              status === "hot" ? "KhÃ¡ch NÃ³ng" :
                status === "won" ? "ÄÃ£ Chá»‘t ÄÆ¡n" :
                  "KhÃ¡ch Up-sell";
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

  // Trigger automation modal when lead becomes "Sáº¯p chá»‘t HD" in Hot Column
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

    const systemMsgText = `âœ¦ [AI AUTOMATION] ÄÃ£ gá»­i tá»± Ä‘á»™ng:
- Há»£p Ä‘á»“ng Ä‘iá»‡n tá»­: ${mockContract}
- Link thanh toÃ¡n: ${mockPayment}
(Tráº¡ng thÃ¡i: Sáº¯p chá»‘t HD - KhÃ¡ch NÃ³ng)`;

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
    toast.success("Ká»‹ch báº£n chá»‘t Sales tá»± Ä‘á»™ng: ÄÃ£ gá»­i há»£p Ä‘á»“ng Ä‘iá»‡n tá»­!");
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim()) return;

    const val = parseFloat(newLeadValue) || 0;
    const selectedCust = inboxCustomers.find(c => c.id === selectedInboxCustId);
    const avatarIcon = selectedCust
      ? (selectedCust.name.split(" ").filter(Boolean).slice(0, 1).map(part => part[0]?.toUpperCase() || "").join("") || "ðŸ‘¤")
      : ["ðŸ‘¤", "ðŸ‘¨â€ðŸ’¼", "ðŸ‘©â€ðŸ’¼", "ðŸ‘¨â€ðŸ’»", "ðŸ‘©â€ðŸ’»", "ðŸ§˜"][Math.floor(Math.random() * 6)];

    const newLead: Omit<ExtendedLeadCard, "id"> = {
      customerName: newLeadName.trim(),
      company: newLeadCompany.trim() || "LiÃªn há»‡ cÃ¡ nhÃ¢n má»›i",
      value: val,
      phone: "ChÆ°a bá»• sung",
      avatar: avatarIcon,
      email: "chua.co@igen.vn",
      productOfChoice: "",
      status: newLeadStatus,
      lastInteraction: newLeadTouchpoint,
      lastInteractionTime: "Vá»«a xong"
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

      if (newLeadStatus === "hot" && newLeadTouchpoint === "Sáº¯p chá»‘t HD") {
        triggerAutoCloseWorkflow(fullLead);
      }

      toast.success("ÄÃ£ thÃªm khÃ¡ch hÃ ng tiá»m nÄƒng thÃ nh cÃ´ng!");
    } catch {
      toast.error("KhÃ´ng thá»ƒ táº¡o khÃ¡ch hÃ ng trÃªn há»‡ thá»‘ng.");
    }
  };

  const moveLeadPipeline = async (id: string, newStatus: "cold" | "warm" | "hot" | "won" | "upsell") => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    try {
      await crmService.updateLead(id, { status: newStatus });
      const updatedLead = { ...lead, status: newStatus };

      if (newStatus === "hot" && lead.lastInteraction === "Sáº¯p chá»‘t HD") {
        triggerAutoCloseWorkflow(updatedLead);
      }

      if (newStatus === "won") {
        toast.success(`ðŸŽ‰ Chá»‘t Ä‘Æ¡n thÃ nh cÃ´ng cho khÃ¡ch hÃ ng ${lead.customerName}!`);
      }

      syncLeadTagToInbox(lead.customerName, newStatus, lead.lastInteraction);
    } catch {
      toast.error("KhÃ´ng thá»ƒ cáº­p nháº­t tráº¡ng thÃ¡i khÃ¡ch hÃ ng.");
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await crmService.deleteLead(id);
      toast.info("ÄÃ£ xÃ³a tháº» cÆ¡ há»™i bÃ¡n hÃ ng.");
    } catch {
      toast.error("KhÃ´ng thá»ƒ xÃ³a khÃ¡ch hÃ ng trÃªn há»‡ thá»‘ng.");
    }
  };

  const triggerUpsellCampaignOptimized = async () => {
    const coldLeads = leads.filter(l => l.status === "cold");
    if (coldLeads.length === 0) {
      toast.error("KhÃ´ng cÃ³ khÃ¡ch hÃ ng nÃ o á»Ÿ cá»™t KhÃ¡ch Láº¡nh Ä‘á»ƒ gá»­i chiáº¿n dá»‹ch.");
      return;
    }

    toast.success(`ÄÃ£ kÃ­ch hoáº¡t chiáº¿n dá»‹ch Up-sell! Gá»­i tá»± Ä‘á»™ng SMS & Voucher giáº£m giÃ¡ 10% cho ${coldLeads.length} KhÃ¡ch Láº¡nh.`);

    try {
      await crmService.bulkUpdateLeads(
        coldLeads.map((lead) => ({
          id: lead.id,
          lead: {
            lastInteraction: "Gá»­i Campaign Up-sell",
            lastInteractionTime: "Vá»«a xong"
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

          const cleanTags = cust.tags.filter(t => !["KhÃ¡ch Láº¡nh", "KhÃ¡ch áº¤m", "KhÃ¡ch NÃ³ng", "Sáº¯p chá»‘t HD", "ÄÃ£ gá»­i bÃ¡o giÃ¡", "Má»›i tiáº¿p cáº­n"].includes(t));
          const nextTags = [...cleanTags, "KhÃ¡ch Láº¡nh", "Gá»­i Campaign Up-sell"];

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

      toast.success("ðŸ¤– ÄÃ£ kÃ­ch hoáº¡t láº¡i AI pháº£n há»“i cuá»™c há»™i thoáº¡i nÃ y thÃ nh cÃ´ng!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "KhÃ´ng thá»ƒ kÃ­ch hoáº¡t láº¡i AI.";
      console.error("[CRMTab] Lá»—i kÃ­ch hoáº¡t láº¡i AI:", err);
      toast.error(msg);
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

    // Cáº­p nháº­t tráº¡ng thÃ¡i táº¡m dá»«ng AI 5 phÃºt cho cuá»™c há»™i thoáº¡i nÃ y trÃªn giao diá»‡n láº­p tá»©c
    const pausedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    setActiveCustomer((prev) => prev ? { ...prev, aiPausedUntil: pausedUntil } : null);
    setInboxCustomers((prev) =>
      prev.map((c) => (c.id === activeCustomer.id ? { ...c, aiPausedUntil: pausedUntil } : c))
    );



    try {
      if (activeCustomer.id.startsWith("mock_")) {
        // Giáº£ láº­p gá»­i tin nháº¯n thÃ nh cÃ´ng qua Mock Conversation
        setInboxCustomers((prev) =>
          prev.map((c) =>
            c.id === activeCustomer.id
              ? {
                  ...c,
                  lastMessage: msgText,
                  time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
                }
              : c
          )
        );

        // Sau 1.5 giÃ¢y, giáº£ láº­p khÃ¡ch hÃ ng tá»± Ä‘á»™ng pháº£n há»“i láº¡i tin nháº¯n
        setTimeout(() => {
          let customerReply = "Cáº£m Æ¡n shop Ä‘Ã£ tÆ° váº¥n áº¡!";
          const textLower = msgText.toLowerCase();
          if (textLower.includes("giÃ¡") || textLower.includes("bao nhiÃªu") || textLower.includes("Ä‘áº¯t") || textLower.includes("ráº»") || textLower.includes("phÃ­") || textLower.includes("bao nhiu")) {
            customerReply = "Dáº¡ vÃ¢ng giÃ¡ há»£p lÃ½ quÃ¡ áº¡, shop lÃªn Ä‘Æ¡n gá»­i giÃºp em nhÃ©!";
          } else if (textLower.includes("hÃ ng") || textLower.includes("cÃ²n") || textLower.includes("háº¿t") || textLower.includes("sáºµn")) {
            customerReply = "Dáº¡ em cáº£m Æ¡n shop nha, Ä‘á»ƒ em chá»n size rá»“i bÃ¡o shop.";
          } else if (textLower.includes("ship") || textLower.includes("gá»­i") || textLower.includes("Ä‘á»‹a chá»‰") || textLower.includes("giao")) {
            customerReply = "Dáº¡ Ä‘á»‹a chá»‰ cá»§a em lÃ  123 Nguyá»…n TrÃ£i, Thanh XuÃ¢n, HÃ  Ná»™i áº¡.";
          } else if (textLower.includes("há»£p Ä‘á»“ng") || textLower.includes("thanh toÃ¡n") || textLower.includes("link") || textLower.includes("kÃ½")) {
            customerReply = "Dáº¡ em Ä‘Ã£ nháº­n Ä‘Æ°á»£c há»£p Ä‘á»“ng vÃ  link thanh toÃ¡n. Äá»ƒ em thanh toÃ¡n luÃ´n áº¡!";
          }
          
          const newInboundMsg: ChatMessage = {
            id: "mock_inbound_" + Date.now(),
            sender: "user", // KhÃ¡ch hÃ ng tráº£ lá»i
            text: customerReply,
            timestamp: new Date(),
          };

          setChatHistory((prev) => [...prev, newInboundMsg]);
          
          // Cáº­p nháº­t tin nháº¯n cuá»‘i cÃ¹ng trong danh sÃ¡ch chat
          setInboxCustomers((prev) =>
            prev.map((c) =>
              c.id === activeCustomer.id
                ? {
                    ...c,
                    lastMessage: customerReply,
                    time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
                  }
                : c
            )
          );
        }, 1500);

      } else if (activeCustomer.channel === "zalo") {
        await zaloMessengerService.sendReply(activeCustomer.id, msgText);
      } else if (activeCustomer.channel === "tiktok") {
        await tiktokMessengerService.sendReply(activeCustomer.id, msgText);
      } else {
        await fbMessengerService.sendReply(activeCustomer.id, msgText, selectedFacebookPageId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "KhÃ´ng thá»ƒ gá»­i tin nháº¯n pháº£n há»“i.";
      console.error(err);
      toast.error(msg);
      // Revert optimistic updates
      setChatHistory((prev) => prev.filter((h) => h.id !== userMsg.id));
      setActiveCustomer((prev) => prev ? { ...prev, aiPausedUntil: activeCustomer.aiPausedUntil } : null);
      setInboxCustomers((prev) =>
        prev.map((c) => (c.id === activeCustomer.id ? { ...c, aiPausedUntil: activeCustomer.aiPausedUntil } : c))
      );
      loadConversationMessages(activeCustomer.id, "replace", activeCustomer.channel, { syncChannel: true }).catch((reloadErr) => {
        console.error("[FE CRMTab] Lá»—i Ä‘á»“ng bá»™ láº¡i lá»‹ch sá»­ sau khi gá»­i tháº¥t báº¡i:", reloadErr);
      });
    }
  };

  const handleGoToChat = (customerName: string) => {
    const cust = inboxCustomers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
    if (cust) {
      setActiveCustomer(cust);
      handleSelectCustomer(cust);
      setSubTab("OMNI-INBOX CHAT");
      toast.info(`ÄÃ£ má»Ÿ cuá»™c trÃ² chuyá»‡n vá»›i ${customerName}`);
    } else {
      toast.warning("KhÃ¡ch hÃ ng nÃ y chÆ°a tá»«ng tÆ°Æ¡ng tÃ¡c/nháº¯n tin tá»›i Fanpage, khÃ´ng thá»ƒ tá»± khá»Ÿi táº¡o chat.");
    }
  };

  const handleCreateLeadFromChat = async (customer: CustomerInbox, status: "cold" | "warm" | "hot") => {
    const newLead: Omit<ExtendedLeadCard, "id"> = {
      customerName: customer.name,
      company: customer.channel === "zalo" ? "KhÃ¡ch hÃ ng tá»« Zalo" : customer.channel === "tiktok" ? "KhÃ¡ch hÃ ng tá»« TikTok" : "KhÃ¡ch hÃ ng tá»« Facebook",
      value: 0,
      phone: "ChÆ°a bá»• sung",
      avatar: customer.name.split(" ").filter(Boolean).slice(0, 1).map(part => part[0]?.toUpperCase() || "").join("") || "ðŸ‘¤",
      email: "chua.co@igen.vn",
      productOfChoice: "",
      status: status,
      lastInteraction: "Má»›i tiáº¿p cáº­n",
      lastInteractionTime: "Vá»«a xong"
    };
    try {
      await crmService.createLead(newLead);
      toast.success(`ÄÃ£ tá»± Ä‘á»™ng thÃªm ${customer.name} vÃ o PHỄU KHÁCH HÀNG!`);
    } catch {
      toast.error("KhÃ´ng thá»ƒ táº¡o khÃ¡ch hÃ ng trÃªn há»‡ thá»‘ng.");
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
  const activeFbPageName = activeFbPage?.displayName || "Chá»n trang FB";

  const activeZaloAccount = zaloAccounts.find((a) => a.username === selectedZaloAccountId);
  const activeZaloAccountName = activeZaloAccount?.displayName || "Chá»n Zalo";

  const activeTiktokAccount = tiktokAccounts.find((a) => a.username === selectedTiktokAccountId);
  const activeTiktokAccountName = activeTiktokAccount?.displayName || "Chá»n TikTok";

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50" id="crm_tab_wrapper">
      <h1 className="sr-only">Há»‡ thá»‘ng Sales CRM - {subTab}</h1>

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
                  {activeChannel === "all" && "Táº¥t cáº£ kÃªnh"}
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
                        Chá»n tÃ i khoáº£n hiá»ƒn thá»‹
                      </div>
                      <button 
                        onClick={() => {
                          setActiveChannel("all");
                          setShowUnifiedDropdown(false);
                        }}
                        className="text-[9px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        Hiá»‡n táº¥t cáº£
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

                      {/* TikTok Selection */}
                      {isTiktokConnected && (
                        <div className="space-y-1">
                          <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 bg-black text-white text-[7px] font-extrabold rounded-full flex items-center justify-center leading-none shrink-0 font-sans shadow-xxs">T</span>
                            TikTok
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
        <Suspense fallback={<TabLoader label="Äang táº£i dá»¯ liá»‡u CRM..." />}>
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
                tiktokAccounts={tiktokAccounts}
                selectedTiktokAccountId={selectedTiktokAccountId}
                setSelectedTiktokAccountId={setSelectedTiktokAccountId}
                companySocialIntegrations={companySocialIntegrations}
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
              <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">ThÃªm CÆ¡ Há»™i BÃ¡n HÃ ng Má»›i</h4>
              <button
                onClick={() => {
                  setShowCreateLeadModal(false);
                  setSelectedInboxCustId("");
                  setNewLeadName("");
                  setNewLeadCompany("");
                }}
                className="text-slate-400 hover:text-slate-700 font-extrabold text-lg focus:outline-none cursor-pointer"
              >
                Ã—
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4">

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">LiÃªn káº¿t vá»›i khÃ¡ch hÃ ng tá»« Inbox (TÃ¹y chá»n)</label>
                <select
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 cursor-pointer transition-all duration-200"
                  value={selectedInboxCustId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedInboxCustId(val);
                    const found = inboxCustomers.find(c => c.id === val);
                    if (found) {
                      setNewLeadName(found.name);
                      setNewLeadCompany(found.channel === "zalo" ? "KhÃ¡ch hÃ ng tá»« Zalo" : "KhÃ¡ch hÃ ng tá»« Facebook");
                    } else {
                      setNewLeadName("");
                      setNewLeadCompany("");
                    }
                  }}
                >
                  <option value="">-- Chá»n khÃ¡ch hÃ ng tá»« há»™i thoáº¡i chat --</option>
                  {inboxCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.channel === "zalo" ? "Zalo" : "Facebook"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">TÃªn khÃ¡ch hÃ ng tiá»m nÄƒng *</label>
                <input
                  type="text"
                  placeholder="VÃ­ dá»¥: LÃª Thá»‹ B..."
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">TÃªn doanh nghiá»‡p / CÃ´ng ty</label>
                <input
                  type="text"
                  placeholder="VÃ­ dá»¥: CÃ´ng ty TNHH ABC..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                  value={newLeadCompany}
                  onChange={(e) => setNewLeadCompany(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Dá»± toÃ¡n giÃ¡ trá»‹ (Ä‘)</label>
                <input
                  type="number"
                  placeholder="VÃ­ dá»¥: 15000000"
                  className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-mono focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200"
                  value={newLeadValue}
                  onChange={(e) => setNewLeadValue(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Má»©c Ä‘á»™ nhiá»‡t Ä‘á»™</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 cursor-pointer transition-all duration-200"
                    value={newLeadStatus}
                    onChange={(e) => setNewLeadStatus(e.target.value as "cold" | "warm" | "hot")}
                  >
                    <option value="cold">KhÃ¡ch Láº¡nh (Cold)</option>
                    <option value="warm">KhÃ¡ch áº¤m (Warm)</option>
                    <option value="hot">KhÃ¡ch NÃ³ng (Hot)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">BÆ°á»›c xá»­ lÃ½ (Tiáº¿n Ä‘á»™)</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 cursor-pointer transition-all duration-200"
                    value={newLeadTouchpoint}
                    onChange={(e) => setNewLeadTouchpoint(e.target.value)}
                  >
                    <option value="Má»›i tiáº¿p cáº­n">Má»›i tiáº¿p cáº­n</option>
                    <option value="ÄÃ£ gá»­i bÃ¡o giÃ¡">ÄÃ£ gá»­i bÃ¡o giÃ¡</option>
                    <option value="Sáº¯p chá»‘t HD">Sáº¯p chá»‘t HD</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  LÆ°u cÆ¡ há»™i
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateLeadModal(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Há»§y
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
                <h4 className="font-extrabold text-slate-800 text-sm">KÃ­ch hoáº¡t chá»‘t sales tá»± Ä‘á»™ng</h4>
                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">ÄÃ£ táº¡o vÃ  gá»­i há»£p Ä‘á»“ng</p>
              </div>
            </div>

            <div className="space-y-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-200/50 text-xs">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">KhÃ¡ch hÃ ng</span>
                <strong className="text-slate-700 text-xs mt-0.5 block">{automationModal.leadName}</strong>
                <span className="text-slate-400 block text-[9px] mt-0.5">{automationModal.company}</span>
              </div>
              <div className="h-px bg-slate-200/50 my-2" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-[10px] text-slate-500 truncate">Há»£p Ä‘á»“ng Ä‘iá»‡n tá»­:</span>
                  <a href={automationModal.contractLink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-bold hover:underline truncate ml-auto">
                    {automationModal.contractLink.substring(automationModal.contractLink.lastIndexOf("/") + 1)}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-[10px] text-slate-500 truncate">Link thanh toÃ¡n:</span>
                  <a href={automationModal.paymentLink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 font-bold hover:underline truncate ml-auto">
                    pay.igen-erp.vn/invoice...
                  </a>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed">
              âœ¦ Trá»£ lÃ½ iGen AI Ä‘Ã£ tá»± Ä‘á»™ng Ä‘Ã³ng gÃ³i há»£p Ä‘á»“ng, táº¡o mÃ£ thanh toÃ¡n, vÃ  gá»­i trá»±c tiáº¿p qua Omni-Inbox chat cho khÃ¡ch hÃ ng Ä‘á»ƒ tá»‘i Æ°u hÃ³a tá»· lá»‡ chá»‘t sales.
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
                ÄÃ³ng
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



