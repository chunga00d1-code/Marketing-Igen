import React, { useState, useEffect } from "react";
import {
  Building2, Plus, Save, Terminal, Key, Eye, EyeOff, Lock,
  Trash2, FileEdit, CheckCircle, Copy, Globe, RefreshCw
} from "lucide-react";
import { toast } from "../../pages/Toast";
import { socialIntegrationService, SocialIntegration } from "../../services/socialIntegrationService";
import { getAccessToken } from "../../services/authService";

interface CompanyIntegrationsTabProps {
  userProfile: any;
}

export default function CompanyIntegrationsTab({ userProfile }: CompanyIntegrationsTabProps) {
  // Company integrations state
  const [companyIntegrations, setCompanyIntegrations] = useState<SocialIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [submittingIntegration, setSubmittingIntegration] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [loadingFacebookDiagnostics, setLoadingFacebookDiagnostics] = useState(false);
  const [facebookDiagnostics, setFacebookDiagnostics] = useState<any | null>(null);
  const [loadingZaloDiagnostics, setLoadingZaloDiagnostics] = useState(false);
  const [zaloDiagnostics, setZaloDiagnostics] = useState<any | null>(null);
  const [connectingTikTokOAuth, setConnectingTikTokOAuth] = useState(false);

  // Company members integrations state
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Form states for Facebook credentials login
  const [fbConnectMode, setFbConnectMode] = useState<"oauth" | "token" | "credentials">("oauth");
  const [fbEmail, setFbEmail] = useState("");
  const [fbPassword, setFbPassword] = useState("");
  const [fbPagesList, setFbPagesList] = useState<any[]>([]);

  // Form states for company integration
  const [compPlatform, setCompPlatform] = useState<"TikTok" | "Facebook" | "Zalo">("TikTok");
  const [compDisplayName, setCompDisplayName] = useState("");
  const [compUsername, setCompUsername] = useState("");
  const [compBlotatoAccountId, setCompBlotatoAccountId] = useState("");
  const [compAccessToken, setCompAccessToken] = useState("");
  const [compRefreshToken, setCompRefreshToken] = useState("");
  const [compTokenExpiredAt, setCompTokenExpiredAt] = useState("");
  const [showCompToken, setShowCompToken] = useState(false);
  const [compAppSecret, setCompAppSecret] = useState("");
  const [compVerifyToken, setCompVerifyToken] = useState("");
  const platformMeta = {
    TikTok: {
      displayPlaceholder: "Vi du: TikTok Cong ty",
      usernameLabel: "Ten tai khoan (Username)",
      usernamePlaceholder: "igen_business",
      tokenLabel: "TikTok Access Token *",
      tokenPlaceholder: "Nhap TikTok Access Token",
      tokenHelp: "Access Token TikTok Direct dung de xac thuc va dang video truc tiep.",
      activeClass: "border-black bg-black text-white shadow-sm",
    },
    Facebook: {
      displayPlaceholder: "Vi du: Fanpage Chinh thuc",
      usernameLabel: "Page ID / Username",
      usernamePlaceholder: "Vi du: 123456789012345 hoac igen.erp.fanpage",
      tokenLabel: "Page Access Token *",
      tokenPlaceholder: "Nhap Page Access Token",
      tokenHelp: "Nen luu Page ID that cua fanpage de dung on dinh cho cac luong Facebook.",
      activeClass: "border-[#1877F2] bg-[#1877F2] text-white shadow-sm",
    },
    Zalo: {
      displayPlaceholder: "Vi du: Zalo OA Shop",
      usernameLabel: "OA ID hoac Username",
      usernamePlaceholder: "OA ID hoac Username",
      tokenLabel: "Zalo Access Token *",
      tokenPlaceholder: "Nhap Zalo Access Token",
      tokenHelp: "Access Token cua Official Account.",
      activeClass: "border-[#0068ff] bg-[#0068ff] text-white shadow-sm",
    },
  } as const;
  const currentPlatformMeta = platformMeta[compPlatform];
  const canStartCompanyTikTokOAuth = compPlatform === "TikTok";

  // Fetch company integrations
  const fetchCompanyIntegrations = async () => {
    setLoadingIntegrations(true);
    try {
      const data = await socialIntegrationService.getIntegrations();
      setCompanyIntegrations(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Lỗi khi tải danh sách liên kết mạng xã hội");
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const fetchCompanyUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/v1/auth/users", {
        headers: {
          "Authorization": `Bearer ${getAccessToken()}`,
        },
      });
      if (!res.ok) {
        throw new Error("Không thể tải danh sách nhân sự");
      }
      const result = await res.json();
      setCompanyUsers(result.data || []);
    } catch (err: any) {
      console.error("Lỗi khi tải danh sách nhân sự:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchCompanyIntegrations();
    fetchCompanyUsers();
  }, []);

  useEffect(() => {
    const handleTikTokOAuthPayload = async (payload: any) => {
      if (!payload) return;
      if (!payload.ok) {
        toast.error(payload.error || "Kết nối TikTok thất bại.");
        return;
      }
      if (payload.target !== "company") {
        return;
      }

      await fetchCompanyIntegrations();
      toast.success(`Đã kết nối TikTok doanh nghiệp: ${payload.profile?.displayName || payload.profile?.username || "TikTok"}`);
    };

    const handleTikTokOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "TIKTOK_OAUTH_RESULT") {
        void handleTikTokOAuthPayload(event.data.payload);
      }
    };

    window.addEventListener("message", handleTikTokOAuthMessage);
    return () => window.removeEventListener("message", handleTikTokOAuthMessage);
  }, []);

  const memberIntegrations = React.useMemo(() => {
    const list: Array<{
      userId: string;
      userName: string;
      email: string;
      platform: "Facebook" | "TikTok" | "Zalo";
      displayName: string;
      username: string;
    }> = [];

    companyUsers.forEach((u) => {
      const name = u.displayName || u.email || "Thành viên";
      
      if (u.facebookIntegration?.isConnected) {
        list.push({
          userId: u._id || u.uid,
          userName: name,
          email: u.email,
          platform: "Facebook",
          displayName: u.facebookIntegration.pageName || "Facebook Page",
          username: u.facebookIntegration.pageId || "",
        });
      }
      if (u.zaloIntegration?.isConnected) {
        list.push({
          userId: u._id || u.uid,
          userName: name,
          email: u.email,
          platform: "Zalo",
          displayName: u.zaloIntegration.oaName || "Zalo OA",
          username: u.zaloIntegration.oaId || "",
        });
      }
      if (u.tiktokIntegration?.isConnected) {
        list.push({
          userId: u._id || u.uid,
          userName: name,
          email: u.email,
          platform: "TikTok",
          displayName: u.tiktokIntegration.displayName || "TikTok Account",
          username: u.tiktokIntegration.username || "",
        });
      }
    });

    return list;
  }, [companyUsers]);

  const handleTikTokOAuth = async () => {
    setConnectingTikTokOAuth(true);
    try {
      localStorage.removeItem("tt_oauth_result");
      const authUrl = await socialIntegrationService.getTikTokOAuthUrl(
        "company",
        compPlatform === "TikTok" && editingIntegrationId ? editingIntegrationId : undefined,
        compVerifyToken.trim() || undefined,
        compAppSecret.trim() || undefined
      );
      if (!authUrl) {
        throw new Error("Khong tao duoc link dang nhap TikTok.");
      }

      const width = 620;
      const height = 760;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const oauthWindow = window.open(
        authUrl,
        "TikTokOAuthPopupCompany",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      if (!oauthWindow) {
        throw new Error("Trinh duyet dang chan popup TikTok.");
      }

      const checkInterval = setInterval(() => {
        const rawResult = localStorage.getItem("tt_oauth_result");
        if (rawResult) {
          clearInterval(checkInterval);
          localStorage.removeItem("tt_oauth_result");
          try {
            const payload = JSON.parse(rawResult);
            if (payload?.target === "company" && payload?.ok) {
              void fetchCompanyIntegrations();
              toast.success(`Đã kết nối TikTok doanh nghiệp: ${payload.profile?.displayName || payload.profile?.username || "TikTok"}`);
            } else if (payload?.ok === false) {
              toast.error(payload.error || "Kết nối TikTok thất bại.");
            }
          } catch (error) {
            console.error("Lỗi đọc kết quả TikTok OAuth company:", error);
          } finally {
            setConnectingTikTokOAuth(false);
          }
        }

        if (oauthWindow.closed) {
          clearInterval(checkInterval);
          setConnectingTikTokOAuth(false);
        }
      }, 800);
    } catch (error: any) {
      console.error("Loi khoi tao TikTok OAuth company:", error);
      toast.error(error.message || "Không thể mở cửa sổ kết nối TikTok.");
      setConnectingTikTokOAuth(false);
    }
  };

  // Lưu Fanpage Facebook sau khi lấy được token từ OAuth
  const handleFacebookPageSelected = async (page: any) => {
    if (!page || !page.id || !page.access_token) {
      toast.error("Dữ liệu Fanpage trả về không hợp lệ.");
      return;
    }

    toast.success(`Đang lưu Fanpage "${page.name}"...`);
    try {
      await socialIntegrationService.createIntegration({
        platform: "Facebook",
        displayName: page.name || `Fanpage ${page.id}`,
        username: page.id,
        accessToken: page.access_token,
        isConnected: true,
        createdBy: userProfile?.email || "system",
      });
      toast.success(`✅ Đã kết nối Fanpage "${page.name}" thành công!`);
      fetchCompanyIntegrations();
    } catch (err: any) {
      console.error("Lỗi lưu Fanpage Facebook:", err);
      toast.error(`Lỗi khi lưu Fanpage: ${err.message || "Không xác định"}`);
    }
  };

  // Mở popup OAuth để đăng nhập Facebook
  const handleFacebookOAuth = async () => {
    try {
      // Xóa kết quả cũ trong localStorage
      localStorage.removeItem("fb_oauth_result");

      // Lấy App ID từ server (lưu trong .env của VPS, không cần user nhập)
      const configRes = await fetch("/api/v1/facebook/config", {
        headers: { "Authorization": `Bearer ${getAccessToken()}` }
      });
      const configData = await configRes.json().catch(() => ({}));
      const appId = configData.appId;

      if (!appId) {
        toast.error("Hệ thống chưa cấu hình Facebook App ID. Liên hệ quản trị viên.");
        return;
      }

      const redirectUri = `${window.location.origin}/api/v1/facebook/oauth-callback`;
      const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_posts,pages_read_engagement,pages_show_list`;

      const width = 600;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const oauthWindow = window.open(
        oauthUrl,
        "FacebookOAuthPopup",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      // Định kỳ kiểm tra localStorage phòng trường hợp cửa sổ popup bị mất liên kết window.opener
      const checkInterval = setInterval(() => {
        const rawResult = localStorage.getItem("fb_oauth_result");
        if (rawResult) {
          clearInterval(checkInterval);
          localStorage.removeItem("fb_oauth_result");
          try {
            const result = JSON.parse(rawResult);
            if (result.type === "FACEBOOK_PAGE_SELECTED" && result.page) {
              handleFacebookPageSelected(result.page);
            } else if (result.type === "FACEBOOK_OAUTH_FAILED") {
              toast.error(`Kết nối Facebook thất bại: ${result.error || "Lỗi không xác định"}`);
            }
          } catch (err) {
            console.error("Lỗi đọc kết quả đăng nhập Facebook:", err);
          }
        }

        if (oauthWindow && oauthWindow.closed) {
          clearInterval(checkInterval);
        }
      }, 800);
    } catch (err: any) {
      console.error("Lỗi mở Facebook OAuth:", err);
      toast.error("Không thể mở cửa sổ đăng nhập Facebook.");
    }
  };

  // Lắng nghe sự kiện callback từ cửa sổ popup gửi về
  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data && event.data.type === "FACEBOOK_PAGE_SELECTED") {
        const page = event.data.page;
        handleFacebookPageSelected(page);
      } else if (event.data && event.data.type === "FACEBOOK_OAUTH_FAILED") {
        toast.error(`Kết nối Facebook thất bại: ${event.data.error || "Lỗi không xác định"}`);
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [userProfile]);

  const handleSaveCompanyIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compDisplayName.trim()) {
      toast.error("Vui lòng nhập Tên hiển thị!");
      return;
    }

    let finalAccessToken = compAccessToken.trim();
    let finalUsername = compUsername.trim();
    let finalDisplayName = compDisplayName.trim();
    const hasTikTokClientCredentials = !!compVerifyToken.trim() && !!compAppSecret.trim();

    // Nếu chọn kết nối Facebook bằng tài khoản/mật khẩu, gọi backend lấy token trước
    if (compPlatform === "Facebook" && fbConnectMode === "credentials") {
      if (!fbEmail.trim() || !fbPassword.trim()) {
        toast.error("Vui lòng nhập đầy đủ tài khoản và mật khẩu Facebook!");
        return;
      }
      setSubmittingIntegration(true);
      try {
        const response = await fetch("/api/v1/facebook/login-credentials", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAccessToken()}`
          },
          body: JSON.stringify({
            email: fbEmail.trim(),
            password: fbPassword.trim(),
            pageId: compUsername.trim() || undefined
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || "Đăng nhập Facebook thất bại.");
        }

        const result = await response.json();
        toast.success(result.message || "Tự động kết nối lấy token thành công!");
        finalAccessToken = result.accessToken;
        finalUsername = result.pageId;
        finalDisplayName = result.pageName || finalDisplayName;
      } catch (err: any) {
        toast.error(err.message || "Không thể kết nối. Vui lòng kiểm tra lại tài khoản.");
        setSubmittingIntegration(false);
        return;
      }
    } else {
      if (compPlatform === "TikTok" ? (!finalAccessToken && !hasTikTokClientCredentials) : !finalAccessToken) {
        toast.error("Vui lòng nhập Access Token hoặc API Key!");
        return;
      }
      if (compPlatform === "Facebook" && finalUsername && !/^\d+$/.test(finalUsername)) {
        toast.error("Facebook cần nhập Page ID dạng số thật, không dùng username/vanity URL.");
        return;
      }
    }

    setSubmittingIntegration(true);
    try {
      if (compPlatform === "TikTok" && finalAccessToken) {
        toast.info("Dang xac thuc TikTok voi ben thu 3...");
        const result = await socialIntegrationService.validateTikTokIntegration({
          username: compUsername.trim() || undefined,
          accessToken: finalAccessToken,
        });

        finalDisplayName = result.displayName || finalDisplayName;
      }

      if (compPlatform === "Facebook") {
        toast.info("Dang xac thuc Facebook Page voi ben thu 3...");
        await socialIntegrationService.validateFacebookIntegration({
          pageId: compUsername.trim(),
          accessToken: compAccessToken.trim(),
        });
      }

      if (compPlatform === "Zalo") {
        toast.info("Dang xac thuc Zalo OA voi ben thu 3...");
        await socialIntegrationService.validateZaloIntegration({
          oaId: compUsername.trim(),
          oaName: compDisplayName.trim(),
          accessToken: compAccessToken.trim(),
        });
      }

      const payload: Partial<SocialIntegration> = {
        platform: compPlatform,
        displayName: finalDisplayName,
        username: finalUsername || undefined,
        blotatoAccountId: undefined,
        accessToken: finalAccessToken,
        refreshToken: (compPlatform === "Zalo" || compPlatform === "TikTok") ? compRefreshToken.trim() || undefined : undefined,
        tokenExpiredAt: (compPlatform === "Zalo" || compPlatform === "TikTok") && compTokenExpiredAt ? new Date(compTokenExpiredAt).toISOString() : undefined,
        appSecret: (compPlatform === "Facebook" || compPlatform === "TikTok") ? compAppSecret.trim() : undefined,
        verifyToken: (compPlatform === "Facebook" || compPlatform === "TikTok") ? compVerifyToken.trim() : undefined,
        isConnected: true,
        createdBy: userProfile?.email || "system",
      };

      if (editingIntegrationId) {
        await socialIntegrationService.updateIntegration(editingIntegrationId, payload);
        toast.success("Cập nhật liên kết mạng xã hội thành công!");
      } else {
        await socialIntegrationService.createIntegration(payload);
        toast.success("Thêm liên kết mạng xã hội thành công!");
      }

      // Reset form and reload
      resetCompForm();
      fetchCompanyIntegrations();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Lỗi khi lưu thông tin liên kết");
    } finally {
      setSubmittingIntegration(false);
    }
  };

  const handleEditCompanyIntegration = (integration: SocialIntegration) => {
    if (!integration._id) return;
    setEditingIntegrationId(integration._id);
    setCompPlatform(integration.platform);
    setCompDisplayName(integration.displayName);
    setCompUsername(integration.username || "");
    setCompBlotatoAccountId(integration.blotatoAccountId || "");
    setCompAccessToken(integration.accessToken || "");
    setCompRefreshToken(integration.refreshToken || "");
    setCompTokenExpiredAt(
      integration.tokenExpiredAt
        ? new Date(integration.tokenExpiredAt).toISOString().slice(0, 16)
        : ""
    );
    setShowCompToken(false);
    setCompAppSecret(integration.appSecret || "");
    setCompVerifyToken(integration.verifyToken || "");
  };

  const handleDeleteCompanyIntegration = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa liên kết tài khoản mạng xã hội này? Hành động này không thể hoàn tác.")) {
      return;
    }
    setDeletingId(id);
    try {
      await socialIntegrationService.deleteIntegration(id);
      toast.success("Xóa liên kết thành công!");
      fetchCompanyIntegrations();
      if (editingIntegrationId === id) {
        resetCompForm();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Lỗi khi xóa liên kết");
    } finally {
      setDeletingId(null);
    }
  };

  const resetCompForm = () => {
    setEditingIntegrationId(null);
    setCompPlatform("TikTok");
    setCompDisplayName("");
    setCompUsername("");
    setCompBlotatoAccountId("");
    setCompAccessToken("");
    setCompRefreshToken("");
    setCompTokenExpiredAt("");
    setShowCompToken(false);
    setCompAppSecret("");
    setCompVerifyToken("");
  };

  const handleRunFacebookDiagnostics = async () => {
    setLoadingFacebookDiagnostics(true);
    try {
      const res = await fetch("/api/v1/facebook/messenger/diagnostics/page", {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.message || "Không thể lấy chẩn đoán Facebook.");
      }

      setFacebookDiagnostics(result.data || null);
      toast.success("Đã tải chẩn đoán Facebook.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Lỗi khi chẩn đoán Facebook.");
    } finally {
      setLoadingFacebookDiagnostics(false);
    }
  };

  const handleRunZaloDiagnostics = async () => {
    setLoadingZaloDiagnostics(true);
    try {
      const res = await fetch("/api/v1/zalo/diagnostics/oa", {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.message || "Không thể lấy chẩn đoán Zalo.");
      }

      setZaloDiagnostics(result.data || null);
      toast.success("Đã tải chẩn đoán Zalo.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Lỗi khi chẩn đoán Zalo.");
    } finally {
      setLoadingZaloDiagnostics(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 pb-4">
          <div className="text-left">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-650" />
              Mạng xã hội Doanh nghiệp
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Quản lý các tài khoản mạng xã hội dùng chung của công ty. Các bài viết tự động đăng tải sẽ lấy cấu hình tại đây.
            </p>
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              Đây là khu vực dùng chung theo doanh nghiệp. Nếu sửa hoặc xóa tại đây, mọi tài khoản cùng company sẽ bị ảnh hưởng.
            </p>
          </div>
          {editingIntegrationId && (
            <button
              onClick={resetCompForm}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-gray-200"
            >
              <Plus className="h-3.5 w-3.5" /> Hủy sửa & Thêm mới
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left: Form to Add/Edit Integration */}
          <div className="xl:col-span-2 bg-gray-50/50 border border-gray-150 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider text-left">
              {editingIntegrationId ? "Chỉnh sửa tài khoản" : "Thêm tài khoản liên kết"}
            </h4>

            <form onSubmit={handleSaveCompanyIntegration} className="space-y-4 text-left">
              {/* Platform Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Nền tảng *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "TikTok", label: "TikTok" },
                    { value: "Facebook", label: "Facebook" },
                    { value: "Zalo", label: "Zalo" }
                  ].map((p) => (
                    <label key={p.value} className="cursor-pointer">
                      <input
                        type="radio"
                        name="compPlatform"
                        value={p.value}
                        checked={compPlatform === p.value}
                        onChange={() => {
                          if (!editingIntegrationId) {
                            setCompPlatform(p.value as any);
                          }
                        }}
                        disabled={!!editingIntegrationId}
                        className="sr-only peer"
                      />
                      <div className={`py-2 text-center rounded-xl border text-xs font-semibold transition-all ${compPlatform === p.value
                        ? platformMeta[p.value as keyof typeof platformMeta].activeClass
                        : "border-gray-250 bg-white text-gray-500"
                        } ${editingIntegrationId ? "opacity-60 cursor-not-allowed" : "hover:border-gray-300"}`}>
                        {p.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Display Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tên hiển thị kênh *</label>
                <input
                  type="text"
                  required
                  value={compDisplayName}
                  onChange={(e) => setCompDisplayName(e.target.value)}
                  placeholder={currentPlatformMeta.displayPlaceholder}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              {/* Facebook Connection Mode Selector */}
              {compPlatform === "Facebook" && (
                <div className="space-y-1.5">
                  <div className="flex justify-end items-center mb-1">
                    {companyIntegrations.some(item => item.platform === "Facebook" && item.isConnected) && (
                      <button
                        type="button"
                        onClick={handleFacebookOAuth}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-855 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        Đổi tài khoản / Trang
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { value: "oauth", label: "Facebook Login" },
                      { value: "token", label: "Nhập Token trực tiếp" },
                      { value: "credentials", label: "Tài khoản & Mật khẩu" }
                    ].map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setFbConnectMode(mode.value as any)}
                        className={`py-2 text-[10px] font-bold text-center rounded-xl border transition-all cursor-pointer ${fbConnectMode === mode.value
                          ? "bg-indigo-650 border-indigo-650 text-white shadow-sm"
                          : "border-gray-250 bg-white text-gray-500 hover:border-gray-300"
                          }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditional Facebook Inputs */}
              {compPlatform === "Facebook" && fbConnectMode === "oauth" && (
                <div className="space-y-4 pt-2">
                  {companyIntegrations.filter(item => item.platform === "Facebook" && item.isConnected).map((item) => (
                    <div key={item._id} className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                      <div className="w-8 h-8 rounded-full bg-[#1877F2] flex items-center justify-center text-white text-xs font-bold font-sans">
                        f
                      </div>
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{item.displayName}</p>
                        <p className="text-[10px] text-gray-500 font-mono truncate">ID: {item.username}</p>
                      </div>
                      <span className="text-[10px] font-bold text-green-700 bg-green-100/50 px-2 py-0.5 rounded-full shrink-0">
                        Đã kết nối
                      </span>
                    </div>
                  ))}

                  {!companyIntegrations.some(item => item.platform === "Facebook" && item.isConnected) && (
                    <>
                      <button
                        type="button"
                        onClick={handleFacebookOAuth}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                      >
                        <Globe className="h-4 w-4" />
                        <span>Đăng nhập bằng Facebook</span>
                      </button>
                      <p className="text-[9px] text-gray-400 text-center leading-normal">
                        Bấm để mở popup đăng nhập Facebook. Hệ thống sẽ tự động lấy danh sách Fanpage và Page Token — bạn chỉ cần chọn Fanpage muốn kết nối.
                      </p>
                    </>
                  )}
                </div>
              )}

              {compPlatform === "Facebook" && fbConnectMode === "credentials" && (
                <>
                  {/* FB Account */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tài khoản Facebook (Email/SĐT) *</label>
                    <input
                      type="text"
                      required
                      value={fbEmail}
                      onChange={(e) => setFbEmail(e.target.value)}
                      placeholder="Nhập email hoặc số điện thoại đăng nhập"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>

                  {/* FB Password */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mật khẩu Facebook *</label>
                    <input
                      type="password"
                      required
                      value={fbPassword}
                      onChange={(e) => setFbPassword(e.target.value)}
                      placeholder="Nhập mật khẩu Facebook"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                    />
                    <p className="text-[9px] text-gray-450 leading-normal">
                      Mẹo: Nhập email chứa từ "demo" hoặc "mock" (ví dụ: `demo@gmail.com`) để liên kết Fanpage giả lập lập tức.
                    </p>
                  </div>

                  {/* FB Target Page ID (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mục tiêu Page ID (Tùy chọn)</label>
                    <input
                      type="text"
                      value={compUsername}
                      onChange={(e) => setCompUsername(e.target.value)}
                      placeholder="Để trống để tự động lấy Page đầu tiên"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </>
              )}

              {/* Standard Platform Fields (Visible when NOT in Facebook OAuth/Credentials mode) */}
              {!(compPlatform === "Facebook" && (fbConnectMode === "oauth" || fbConnectMode === "credentials")) && (
                <>
                  {compPlatform === "TikTok" && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-left text-white">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-200">TikTok OAuth</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-300">
                            Kết nối trực tiếp với TikTok để hệ thống tự lấy access token và refresh token cho kênh doanh nghiệp.
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-450">
                            Bấm kết nối trực tiếp bằng tài khoản hệ thống (hoặc điền Client Key và Client Secret riêng bên dưới nếu muốn dùng ứng dụng riêng).
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleTikTokOAuth}
                          disabled={connectingTikTokOAuth || !canStartCompanyTikTokOAuth}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-900 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          <span>{connectingTikTokOAuth ? "Đang kết nối..." : editingIntegrationId ? "Kết nối lại" : "Kết nối TikTok"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {compPlatform === "TikTok" && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cấu hình app TikTok</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                          Chỉ cần điền nếu doanh nghiệp muốn dùng Client Key và Client Secret của ứng dụng riêng. Bỏ trống để dùng mặc định hệ thống.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-gray-700">TikTok Client Key (tùy chọn)</label>
                        <input
                          type="text"
                          value={compVerifyToken}
                          onChange={(e) => setCompVerifyToken(e.target.value)}
                          placeholder="Nhap TikTok Client Key (Bỏ trống để dùng mặc định)"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-gray-700">TikTok Client Secret (tùy chọn)</label>
                        <input
                          type={showCompToken ? "text" : "password"}
                          value={compAppSecret}
                          onChange={(e) => setCompAppSecret(e.target.value)}
                          placeholder="Nhap TikTok Client Secret (Bỏ trống để dùng mặc định)"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                    </div>
                  )}

                  {/* Username (Page ID / Account Username) */}
                  {compPlatform !== "TikTok" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{currentPlatformMeta.usernameLabel}</label>
                      <div className="relative">
                        {compPlatform === "TikTok" && <span className="absolute left-3.5 top-2.5 text-xs text-gray-400 font-bold select-none">@</span>}
                        <input
                          type="text"
                          value={compUsername}
                          onChange={(e) => setCompUsername(e.target.value)}
                          placeholder={currentPlatformMeta.usernamePlaceholder}
                          className={`w-full ${compPlatform === "TikTok" ? "pl-8" : "px-3.5"} py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all`}
                        />
                      </div>
                      {compPlatform === "Facebook" && (
                        <p className="text-[9px] text-gray-400 leading-normal">
                          Ưu tiên nhập Page ID thật của fanpage. Đây là trường backend đang dùng để gọi lại các luồng Facebook.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Access Token / API Key / Zalo Configs */}
                  {compPlatform !== "TikTok" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{currentPlatformMeta.tokenLabel}</label>
                      <div className="relative flex items-center">
                        <input
                          type={showCompToken ? "text" : "password"}
                          required={fbConnectMode === "token" || compPlatform !== "Facebook"}
                          value={compAccessToken}
                          onChange={(e) => setCompAccessToken(e.target.value)}
                          placeholder={currentPlatformMeta.tokenPlaceholder}
                          className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCompToken(!showCompToken)}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          {showCompToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-400 leading-normal">{currentPlatformMeta.tokenHelp}</p>
                      {(compPlatform === "Zalo" || compPlatform === "TikTok") && (
                        <div className="mt-3 space-y-1">
                          <label className="text-[11px] font-semibold text-gray-700">Refresh Token (tùy chọn)</label>
                          <input
                            type={showCompToken ? "text" : "password"}
                            value={compRefreshToken}
                            onChange={(e) => setCompRefreshToken(e.target.value)}
                            placeholder="Dán Refresh Token nếu có"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm focus:border-[#0068ff] focus:outline-none focus:ring-1 focus:ring-[#0068ff]"
                          />
                          <p className="text-[9px] text-gray-400 leading-normal">Nếu Zalo OA của bạn có Refresh Token, hãy nhập để hệ thống tự làm mới token khi sắp hết hạn.</p>
                          <div className="pt-2 space-y-1">
                            <label className="text-[11px] font-semibold text-gray-700">Token hết hạn lúc (tùy chọn)</label>
                            <input
                              type="datetime-local"
                              value={compTokenExpiredAt}
                              onChange={(e) => setCompTokenExpiredAt(e.target.value)}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm focus:border-[#0068ff] focus:outline-none focus:ring-1 focus:ring-[#0068ff]"
                            />
                            <p className="text-[9px] text-gray-400 leading-normal">Nếu bạn biết thời điểm hết hạn của access token hiện tại, hãy lưu để backend chủ động refresh sớm hơn.</p>
                          </div>
                        </div>
                      )}
                      {compPlatform === "TikTok" && (
                        <div className="mt-3 space-y-3 border-t border-slate-150 pt-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-gray-700">TikTok Client Key (tùy chọn)</label>
                            <input
                              type="text"
                              value={compVerifyToken}
                              onChange={(e) => setCompVerifyToken(e.target.value)}
                              placeholder="Nhập TikTok Client Key"
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-gray-700">TikTok Client Secret (tùy chọn)</label>
                            <input
                              type={showCompToken ? "text" : "password"}
                              value={compAppSecret}
                              onChange={(e) => setCompAppSecret(e.target.value)}
                              placeholder="Nhập TikTok Client Secret"
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Facebook Message configurations: App Secret and Verify Token */}
              {compPlatform === "Facebook" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">App Secret</label>
                    <input
                      type="text"
                      value={compAppSecret}
                      onChange={(e) => setCompAppSecret(e.target.value)}
                      placeholder="Nhập Facebook App Secret (nếu dùng cho Message)"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                    />
                    <p className="text-[9px] text-gray-400 leading-normal">
                      App Secret của ứng dụng Facebook dùng để xác thực chữ ký tin nhắn.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Verify Token</label>
                    <input
                      type="text"
                      value={compVerifyToken}
                      onChange={(e) => setCompVerifyToken(e.target.value)}
                      placeholder="Nhập Webhook Verify Token (nếu dùng cho Message)"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-mono text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 outline-none transition-all"
                    />
                    <p className="text-[9px] text-gray-400 leading-normal">
                      Mã xác minh cấu hình trên Facebook Webhook dashboard.
                    </p>
                  </div>

                  <div className="mt-3 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl text-left">
                    <p className="text-[10px] font-bold text-indigo-750 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Terminal className="h-3.5 w-3.5 text-indigo-650" />
                      Hướng dẫn Webhook Facebook
                    </p>
                    <ul className="text-[9px] text-gray-500 list-disc pl-3.5 space-y-1 leading-normal">
                      <li><strong>Tin nhắn (Chat):</strong> Đăng ký sự kiện <code>messages</code> và <code>messaging_postbacks</code>.</li>
                      <li><strong>Bình luận (Auto Comment):</strong> Đăng ký sự kiện <code>feed</code> (bắt buộc để nhận bình luận bài viết).</li>
                      <li><strong>Verify Token:</strong> Điền mã xác minh trùng khớp với Verify Token cấu hình trên Meta Developer.</li>
                    </ul>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              {!(compPlatform === "Facebook" && fbConnectMode === "oauth" && !editingIntegrationId) && (
                <div className="pt-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={submittingIntegration}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    <span>{submittingIntegration ? "Đang lưu..." : editingIntegrationId ? "Cập nhật" : "Lưu liên kết"}</span>
                  </button>
                  {editingIntegrationId && (
                    <button
                      type="button"
                      onClick={resetCompForm}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all border border-gray-200 cursor-pointer"
                    >
                      Hủy
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Right: List of Connected Accounts */}
          <div className="xl:col-span-3 space-y-4">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-left">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-900">Zalo Debug</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-sky-800/80">
                    Kiểm tra OA ID đang resolve, token đang lấy từ user hay company, và refresh token có sẵn hay không.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunZaloDiagnostics}
                  disabled={loadingZaloDiagnostics}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-2 text-[11px] font-bold text-sky-700 transition-all hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{loadingZaloDiagnostics ? "Đang chẩn đoán..." : "Chạy chẩn đoán Zalo"}</span>
                </button>
              </div>

              {zaloDiagnostics && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Resolved OA ID</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-700">{zaloDiagnostics.resolvedOaId || "none"}</p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Source</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">{zaloDiagnostics.resolvedSource || "none"}</p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Token</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">
                        {zaloDiagnostics.hasResolvedToken ? `FOUND (...${zaloDiagnostics.resolvedTokenTail || ""})` : "NOT_FOUND"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Refresh</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">
                        {zaloDiagnostics.companyIntegrations?.some((item: any) => item.hasRefreshToken) || zaloDiagnostics.personalIntegration?.hasRefreshToken ? "YES" : "NO"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-sky-200 bg-slate-950 p-3">
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-green-200">
                      {JSON.stringify(zaloDiagnostics, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-left">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">Facebook Debug</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-blue-800/80">
                    Dùng mục này để kiểm tra pageId đang resolve, token có tìm thấy không, và các conversation pageId gần đây.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunFacebookDiagnostics}
                  disabled={loadingFacebookDiagnostics}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3 py-2 text-[11px] font-bold text-blue-700 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{loadingFacebookDiagnostics ? "Đang chẩn đoán..." : "Chạy chẩn đoán Facebook"}</span>
                </button>
              </div>

              {facebookDiagnostics && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-xl border border-blue-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Resolved Page ID</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-700">{facebookDiagnostics.resolvedPageId || "none"}</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Token</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">
                        {facebookDiagnostics.hasResolvedToken ? `FOUND (...${facebookDiagnostics.resolvedTokenTail || ""})` : "NOT_FOUND"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Conversations</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">{facebookDiagnostics.conversationsForResolvedPage ?? 0}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-slate-950 p-3">
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-green-200">
                      {JSON.stringify(facebookDiagnostics, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Danh sách tài khoản ({companyIntegrations.length})
              </h4>
              <button
                onClick={() => {
                  fetchCompanyIntegrations();
                  fetchCompanyUsers();
                }}
                disabled={loadingIntegrations || loadingUsers}
                className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded-lg transition-all cursor-pointer border border-transparent hover:border-gray-200"
                title="Tải lại danh sách"
              >
                <RefreshCw className={`h-4 w-4 ${loadingIntegrations ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingIntegrations ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 bg-gray-50/30 border border-gray-150 rounded-2xl">
                <div className="w-6 h-6 border-2 border-indigo-650 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Đang tải danh sách tài khoản doanh nghiệp...</p>
              </div>
            ) : companyIntegrations.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 bg-gray-50/30 border border-gray-150 rounded-2xl text-center px-4">
                <Globe className="h-8 w-8 text-gray-300 mb-1" />
                <p className="text-xs font-bold text-gray-600">Chưa có liên kết doanh nghiệp nào</p>
                <p className="text-[10px] text-gray-400 max-w-xs">
                  Điền thông tin ở biểu mẫu bên trái để liên kết tài khoản đầu tiên phục vụ đăng bài viết marketing.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
                {companyIntegrations.map((item) => (
                  <div
                    key={item._id}
                    className={`border rounded-2xl p-4 bg-white shadow-2xs flex flex-col justify-between gap-4 transition-all hover:shadow-xs ${editingIntegrationId === item._id ? "border-indigo-500 ring-2 ring-indigo-500/10" : "border-gray-200"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-3">
                        {/* Platform Icon */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 font-bold ${item.platform === "TikTok" ? "bg-black" : item.platform === "Facebook" ? "bg-blue-600" : "bg-[#0068ff]"
                          }`}>
                          {item.platform === "TikTok" ? "♪" : item.platform === "Facebook" ? "F" : "Z"}
                        </div>
                        <div className="text-left min-w-0">
                          <h5 className="text-xs font-bold text-gray-800 truncate" title={item.displayName}>
                            {item.displayName}
                          </h5>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">
                            {item.platform === "TikTok" ? `@${item.username || "n/a"}` : item.username || "n/a"}
                          </p>
                        </div>
                      </div>

                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-[9px] font-bold shrink-0">
                        <CheckCircle className="h-3 w-3" /> Đang chạy
                      </span>
                    </div>

                    {/* Details details */}
                    <div className="bg-gray-50/70 border border-gray-150/60 rounded-xl p-2.5 text-left text-[10px] space-y-1.5 font-mono text-gray-600">
                      {item.platform === "TikTok" && (
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">Che do:</span>
                          <span className="font-semibold truncate max-w-[130px]">TikTok Direct</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-400">Token/Key:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-semibold">••••••••</span>
                          <button
                            onClick={() => {
                              if (item.accessToken) {
                                navigator.clipboard.writeText(item.accessToken);
                                toast.success("Đã sao chép token!");
                              }
                            }}
                            className="p-0.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
                            title="Copy Token"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {item.platform === "Zalo" && (
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">Refresh:</span>
                          <span className="font-semibold truncate max-w-[130px]">
                            {item.refreshToken ? "Đã lưu" : "Chưa có"}
                          </span>
                        </div>
                      )}
                      {item.platform === "Zalo" && item.tokenExpiredAt && (
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">Hết hạn:</span>
                          <span className="font-semibold truncate max-w-[130px]">
                            {new Date(item.tokenExpiredAt).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      )}
                      {item.platform === "Facebook" && item.appSecret && (
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">App Secret:</span>
                          <span className="font-semibold truncate max-w-[130px]">{item.appSecret}</span>
                        </div>
                      )}
                      {item.platform === "Facebook" && item.verifyToken && (
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">Verify Token:</span>
                          <span className="font-semibold truncate max-w-[130px]">{item.verifyToken}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2 pt-1.5 border-t border-gray-150">
                        <span className="text-gray-400">Tạo bởi:</span>
                        <span className="truncate max-w-[140px]" title={item.createdBy}>{item.createdBy}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-gray-100 mt-1">
                      <button
                        onClick={() => handleEditCompanyIntegration(item)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <FileEdit className="h-3.5 w-3.5" /> Sửa
                      </button>
                      <button
                        onClick={() => item._id && handleDeleteCompanyIntegration(item._id)}
                        disabled={deletingId === item._id}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {deletingId === item._id ? "Đang xóa..." : "Xóa"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Personal Integrations of Members */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-left">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  Tài khoản cá nhân của các thành viên ({memberIntegrations.length})
                </h4>
                <button
                  onClick={fetchCompanyUsers}
                  disabled={loadingUsers}
                  className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded-lg transition-all cursor-pointer border border-transparent hover:border-gray-200"
                  title="Tải lại danh sách thành viên"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
                </button>
              </div>

              {loadingUsers ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 bg-gray-50/20 border border-gray-150 rounded-2xl">
                  <div className="w-5 h-5 border-2 border-indigo-650 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-gray-500">Đang tải danh sách tài khoản thành viên...</p>
                </div>
              ) : memberIntegrations.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 bg-gray-50/20 border border-gray-150 rounded-2xl text-center px-4">
                  <Globe className="h-6 w-6 text-gray-300 mb-1" />
                  <p className="text-xs font-bold text-gray-500">Chưa có liên kết cá nhân nào</p>
                  <p className="text-[10px] text-gray-400 max-w-xs">
                    Thành viên công ty chưa thêm liên kết cá nhân ở tab MXH Cá Nhân.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-1">
                  {memberIntegrations.map((item, idx) => (
                    <div
                      key={`${item.userId}-${item.platform}-${idx}`}
                      className="border border-gray-200 rounded-2xl p-4 bg-white shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold text-xs ${
                            item.platform === "TikTok" ? "bg-black" : item.platform === "Facebook" ? "bg-blue-600" : "bg-[#0068ff]"
                          }`}>
                            {item.platform === "TikTok" ? "♪" : item.platform === "Facebook" ? "F" : "Z"}
                          </div>
                          <div className="text-left min-w-0">
                            <h5 className="text-xs font-bold text-gray-800 truncate" title={item.displayName}>
                              {item.displayName}
                            </h5>
                            <p className="text-[10px] text-gray-500 truncate">
                              {item.platform === "TikTok" ? `@${item.username || "n/a"}` : item.username || "n/a"}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 rounded-full text-[9px] font-bold shrink-0">
                          Cá nhân
                        </span>
                      </div>

                      <div className="bg-slate-50/50 border border-gray-150 rounded-xl p-2.5 text-left text-[10px] space-y-1 font-mono text-gray-500">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">Thành viên:</span>
                          <span className="font-bold text-slate-700 truncate max-w-[130px]">{item.userName}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-400">Email:</span>
                          <span className="text-slate-600 truncate max-w-[150px]" title={item.email}>{item.email}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
