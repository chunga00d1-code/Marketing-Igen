import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Facebook, RefreshCw, Trash2, User, MessageCircleMore, Film } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { socialIntegrationService, SocialIntegration } from "../../services/socialIntegrationService";
import { toast } from "../../pages/Toast";

export default function PersonalIntegrationsTab() {
  const {
    userProfile,
    refreshProfile,
    saveFacebookIntegration,
    removeFacebookIntegration,
    saveZaloIntegration,
    removeZaloIntegration,
    saveTikTokIntegration,
    removeTikTokIntegration,
  } = useAuth();

  const [companyIntegrations, setCompanyIntegrations] = useState<SocialIntegration[]>([]);
  const [loadingCompanyIntegrations, setLoadingCompanyIntegrations] = useState(false);
  const [savingFacebook, setSavingFacebook] = useState(false);
  const [savingZalo, setSavingZalo] = useState(false);
  const [savingTikTok, setSavingTikTok] = useState(false);
  const [connectingTikTokOAuth, setConnectingTikTokOAuth] = useState(false);

  const [facebookForm, setFacebookForm] = useState({
    pageId: "",
    pageName: "",
    pageAccessToken: "",
    appSecret: "",
    verifyToken: "",
  });
  const [zaloForm, setZaloForm] = useState({
    oaId: "",
    oaName: "",
    accessToken: "",
    refreshToken: "",
  });
  const [tiktokForm, setTiktokForm] = useState({
    username: "",
    displayName: "",
    accessToken: "",
    refreshToken: "",
    clientKey: "",
    clientSecret: "",
    tokenExpiredAt: "",
  });

  useEffect(() => {
    setFacebookForm({
      pageId: userProfile?.facebookIntegration?.pageId || "",
      pageName: userProfile?.facebookIntegration?.pageName || "",
      pageAccessToken: userProfile?.facebookIntegration?.pageAccessToken || "",
      appSecret: userProfile?.facebookIntegration?.appSecret || "",
      verifyToken: userProfile?.facebookIntegration?.verifyToken || "",
    });
    setZaloForm({
      oaId: userProfile?.zaloIntegration?.oaId || "",
      oaName: userProfile?.zaloIntegration?.oaName || "",
      accessToken: userProfile?.zaloIntegration?.accessToken || "",
      refreshToken: userProfile?.zaloIntegration?.refreshToken || "",
    });
    setTiktokForm({
      username: userProfile?.tiktokIntegration?.username || "",
      displayName: userProfile?.tiktokIntegration?.displayName || "",
      accessToken: userProfile?.tiktokIntegration?.accessToken || "",
      refreshToken: userProfile?.tiktokIntegration?.refreshToken || "",
      clientKey: userProfile?.tiktokIntegration?.clientKey || "",
      clientSecret: userProfile?.tiktokIntegration?.clientSecret || "",
      tokenExpiredAt: userProfile?.tiktokIntegration?.tokenExpiredAt
        ? new Date(userProfile.tiktokIntegration.tokenExpiredAt).toISOString().slice(0, 16)
        : "",
    });
  }, [userProfile]);

  useEffect(() => {
    let cancelled = false;

    const loadCompanyIntegrations = async () => {
      setLoadingCompanyIntegrations(true);
      try {
        const data = await socialIntegrationService.getIntegrations();
        if (!cancelled) {
          setCompanyIntegrations(data || []);
        }
      } catch (error: any) {
        console.error(error);
        if (!cancelled) {
          toast.error(error.message || "Không thể tải kênh doanh nghiệp.");
        }
      } finally {
        if (!cancelled) {
          setLoadingCompanyIntegrations(false);
        }
      }
    };

    void loadCompanyIntegrations();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleTikTokOAuthPayload = async (payload: any) => {
      if (!payload) return;
      if (!payload.ok) {
        toast.error(payload.error || "Kết nối TikTok thất bại.");
        return;
      }
      if (payload.target !== "personal") {
        return;
      }

      await refreshProfile();
      toast.success(`Đã kết nối TikTok cá nhân: ${payload.profile?.displayName || payload.profile?.username || "TikTok"}`);
    };

    const handleTikTokOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "TIKTOK_OAUTH_RESULT") {
        void handleTikTokOAuthPayload(event.data.payload);
      }
    };

    window.addEventListener("message", handleTikTokOAuthMessage);
    return () => window.removeEventListener("message", handleTikTokOAuthMessage);
  }, [refreshProfile]);

  const handleTikTokOAuth = async () => {
    setConnectingTikTokOAuth(true);
    try {
      localStorage.removeItem("tt_oauth_result");
      const authUrl = await socialIntegrationService.getTikTokOAuthUrl(
        "personal",
        undefined,
        tiktokForm.clientKey.trim() || undefined,
        tiktokForm.clientSecret.trim() || undefined
      );
      if (!authUrl) {
        throw new Error("Không tạo được link đăng nhập TikTok.");
      }

      const width = 620;
      const height = 760;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const oauthWindow = window.open(
        authUrl,
        "TikTokOAuthPopup",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      if (!oauthWindow) {
        throw new Error("Trình duyệt đang chặn popup TikTok.");
      }

      const checkInterval = setInterval(() => {
        const rawResult = localStorage.getItem("tt_oauth_result");
        if (rawResult) {
          clearInterval(checkInterval);
          localStorage.removeItem("tt_oauth_result");
          try {
            const payload = JSON.parse(rawResult);
            void refreshProfile();
            if (payload?.target === "personal" && payload?.ok) {
              toast.success(`Đã kết nối TikTok cá nhân: ${payload.profile?.displayName || payload.profile?.username || "TikTok"}`);
            } else if (payload?.ok === false) {
              toast.error(payload.error || "Kết nối TikTok thất bại.");
            }
          } catch (error) {
            console.error("Lỗi đọc kết quả TikTok OAuth:", error);
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
      console.error("Lỗi khởi tạo TikTok OAuth:", error);
      toast.error(error.message || "Không thể mở cửa sổ kết nối TikTok.");
      setConnectingTikTokOAuth(false);
    }
  };

  const companyFacebookIntegration = useMemo(
    () => companyIntegrations.find((item) => item.platform === "Facebook" && item.isConnected) || null,
    [companyIntegrations]
  );
  const companyZaloIntegration = useMemo(
    () => companyIntegrations.find((item) => item.platform === "Zalo" && item.isConnected) || null,
    [companyIntegrations]
  );
  const companyTikTokIntegration = useMemo(
    () => companyIntegrations.find((item) => item.platform === "TikTok" && item.isConnected) || null,
    [companyIntegrations]
  );
  const canStartPersonalTikTokOAuth = true;

  const handleSaveFacebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facebookForm.pageId.trim() || !facebookForm.pageAccessToken.trim()) {
      toast.error("Vui lòng nhập Page ID và Page Access Token.");
      return;
    }

    setSavingFacebook(true);
    try {
      await saveFacebookIntegration({
        isConnected: true,
        pageId: facebookForm.pageId.trim(),
        pageName: facebookForm.pageName.trim(),
        pageAccessToken: facebookForm.pageAccessToken.trim(),
        appSecret: facebookForm.appSecret.trim() || undefined,
        verifyToken: facebookForm.verifyToken.trim() || undefined,
        connectedAt: new Date().toISOString(),
      });
    } finally {
      setSavingFacebook(false);
    }
  };

  const handleSaveZalo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zaloForm.oaId.trim() || !zaloForm.oaName.trim() || !zaloForm.accessToken.trim()) {
      toast.error("Vui lòng nhập OA ID, tên OA và Access Token.");
      return;
    }

    setSavingZalo(true);
    try {
      await saveZaloIntegration({
        isConnected: true,
        oaId: zaloForm.oaId.trim(),
        oaName: zaloForm.oaName.trim(),
        accessToken: zaloForm.accessToken.trim(),
        refreshToken: zaloForm.refreshToken.trim(),
        connectedAt: new Date().toISOString(),
      });
    } finally {
      setSavingZalo(false);
    }
  };

  const handleSaveTikTok = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAccessToken = !!tiktokForm.accessToken.trim();
    const hasClientCredentials = !!tiktokForm.clientKey.trim() && !!tiktokForm.clientSecret.trim();
    if (!hasAccessToken && !hasClientCredentials) {
      toast.error("Vui lòng nhập Access Token TikTok.");
      return;
    }

    setSavingTikTok(true);
    try {
      await saveTikTokIntegration({
        isConnected: true,
        username: tiktokForm.username.trim() || "@igen_tech",
        displayName: tiktokForm.displayName.trim() || "TikTok Personal",
        accessToken: tiktokForm.accessToken.trim(),
        refreshToken: tiktokForm.refreshToken.trim() || undefined,
        clientKey: tiktokForm.clientKey.trim() || undefined,
        clientSecret: tiktokForm.clientSecret.trim() || undefined,
        tokenExpiredAt: tiktokForm.tokenExpiredAt ? new Date(tiktokForm.tokenExpiredAt).toISOString() : undefined,
        connectedAt: new Date().toISOString(),
      });
    } finally {
      setSavingTikTok(false);
    }
  };

  const handleRemoveTikTok = async () => {
    if (!window.confirm("Gỡ bỏ TikTok cá nhân chỉ ảnh hưởng tài khoản hiện tại. Bạn có chắc chắn muốn tiếp tục không?")) {
      return;
    }
    await removeTikTokIntegration();
  };

  const renderSourceSummary = (
    title: string,
    personal: { name: string; identifier: string } | null,
    company: { name: string; identifier: string } | null
  ) => {
    const activeSource = personal ? "personal" : company ? "company" : null;

    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
            <p className="mt-1 text-[11px] text-slate-500">
              Hệ thống ưu tiên kênh cá nhân trước. Nếu tài khoản hiện tại chưa kết nối, bot mới dùng kênh doanh nghiệp.
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase ${activeSource === "personal"
              ? "bg-emerald-100 text-emerald-700"
              : activeSource === "company"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-200 text-slate-600"
            }`}>
            {activeSource === "personal" ? "Đang dùng cá nhân" : activeSource === "company" ? "Đang fallback doanh nghiệp" : "Chưa kết nối"}
          </span>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Kênh cá nhân</p>
            {personal ? (
              <>
                <p className="mt-2 text-[11px] font-bold text-slate-700">{personal.name}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{personal.identifier}</p>
              </>
            ) : (
              <p className="mt-2 text-[10px] text-slate-400">Chưa kết nối cho tài khoản hiện tại.</p>
            )}
          </div>

          <div className="rounded-xl border border-amber-100 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Kênh doanh nghiệp</p>
            {company ? (
              <>
                <p className="mt-2 text-[11px] font-bold text-slate-700">{company.name}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{company.identifier}</p>
              </>
            ) : (
              <p className="mt-2 text-[10px] text-slate-400">Doanh nghiệp chưa cấu hình kênh này.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="text-left">
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-800">
              <User className="h-5 w-5 text-emerald-600" />
              MXH Cá Nhân
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Cấu hình riêng cho tài khoản đang đăng nhập. Sửa ở đây chỉ ảnh hưởng đến tài khoản hiện tại.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setLoadingCompanyIntegrations(true);
              try {
                const data = await socialIntegrationService.getIntegrations();
                setCompanyIntegrations(data || []);
              } catch (error: any) {
                toast.error(error.message || "Không thể tải lại danh sách.");
              } finally {
                setLoadingCompanyIntegrations(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingCompanyIntegrations ? "animate-spin" : ""}`} />
            Tải lại
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {renderSourceSummary(
            "Facebook",
            userProfile?.facebookIntegration?.isConnected
              ? {
                name: userProfile.facebookIntegration.pageName || "Facebook Page cá nhân",
                identifier: userProfile.facebookIntegration.pageId || "",
              }
              : null,
            companyFacebookIntegration
              ? {
                name: companyFacebookIntegration.displayName || "Facebook Page doanh nghiệp",
                identifier: companyFacebookIntegration.username || "",
              }
              : null
          )}

          {renderSourceSummary(
            "Zalo",
            userProfile?.zaloIntegration?.isConnected
              ? {
                name: userProfile.zaloIntegration.oaName || "Zalo OA cá nhân",
                identifier: userProfile.zaloIntegration.oaId || "",
              }
              : null,
            companyZaloIntegration
              ? {
                name: companyZaloIntegration.displayName || "Zalo OA doanh nghiệp",
                identifier: companyZaloIntegration.username || "",
              }
              : null
          )}

          {renderSourceSummary(
            "TikTok",
            userProfile?.tiktokIntegration?.isConnected
              ? {
                name: userProfile.tiktokIntegration.displayName || "TikTok cá nhân",
                identifier: userProfile.tiktokIntegration.username || "",
              }
              : null,
            companyTikTokIntegration
              ? {
                name: companyTikTokIntegration.displayName || "TikTok doanh nghiệp",
                identifier: companyTikTokIntegration.username || "",
              }
              : null
          )}
        </div>
      </div>

      {/* Connected personal accounts list */}
      <div className="rounded-2xl border border-gray-200 bg-white/80 p-6 shadow-xs">
        <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-3 text-left flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          Danh Sách Tài Khoản Cá Nhân Đã Kết Nối
        </h3>
        
        {!(userProfile?.facebookIntegration?.isConnected || userProfile?.zaloIntegration?.isConnected || userProfile?.tiktokIntegration?.isConnected) ? (
          <div className="text-center py-6 text-gray-400 text-xs italic">
            Chưa có tài khoản mạng xã hội cá nhân nào được thêm. Hãy cấu hình ở các biểu mẫu bên dưới.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {userProfile?.facebookIntegration?.isConnected && (
              <div className="flex items-center justify-between p-4 border border-blue-100 bg-blue-50/30 rounded-2xl">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <Facebook className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{userProfile.facebookIntegration.pageName || "Facebook Page"}</p>
                    <p className="text-[10px] text-gray-500 font-mono truncate">ID: {userProfile.facebookIntegration.pageId}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded-full">Facebook</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Bạn có chắc chắn muốn gỡ liên kết Facebook cá nhân không?")) {
                      void removeFacebookIntegration();
                    }
                  }}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                  title="Gỡ liên kết"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

            {userProfile?.zaloIntegration?.isConnected && (
              <div className="flex items-center justify-between p-4 border border-sky-100 bg-sky-50/30 rounded-2xl">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <MessageCircleMore className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{userProfile.zaloIntegration.oaName || "Zalo OA"}</p>
                    <p className="text-[10px] text-gray-500 font-mono truncate">ID: {userProfile.zaloIntegration.oaId}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-sky-100 text-sky-700 text-[9px] font-bold rounded-full">Zalo OA</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Bạn có chắc chắn muốn gỡ liên kết Zalo cá nhân không?")) {
                      void removeZaloIntegration();
                    }
                  }}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                  title="Gỡ liên kết"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

            {userProfile?.tiktokIntegration?.isConnected && (
              <div className="flex items-center justify-between p-4 border border-red-100 bg-red-50/30 rounded-2xl">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white shrink-0 shadow-xs">
                    <Film className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{userProfile.tiktokIntegration.displayName || "TikTok Account"}</p>
                    <p className="text-[10px] text-gray-500 font-mono truncate">User: {userProfile.tiktokIntegration.username}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded-full">TikTok</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Bạn có chắc chắn muốn gỡ liên kết TikTok cá nhân không?")) {
                      void removeTikTokIntegration();
                    }
                  }}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                  title="Gỡ liên kết"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 text-left">
            <Facebook className="h-5 w-5 text-blue-600" />
            <div>
              <h4 className="text-sm font-bold text-slate-800">Facebook Cá Nhân</h4>
              <p className="text-[11px] text-slate-500">Page riêng của tài khoản đang đăng nhập.</p>
            </div>
          </div>

          <form onSubmit={handleSaveFacebook} className="mt-4 space-y-3 text-left">
            <input
              type="text"
              value={facebookForm.pageId}
              onChange={(e) => setFacebookForm((prev) => ({ ...prev, pageId: e.target.value }))}
              placeholder="Page ID"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={facebookForm.pageName}
              onChange={(e) => setFacebookForm((prev) => ({ ...prev, pageName: e.target.value }))}
              placeholder="Tên page"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={facebookForm.pageAccessToken}
              onChange={(e) => setFacebookForm((prev) => ({ ...prev, pageAccessToken: e.target.value }))}
              placeholder="Page Access Token"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={facebookForm.appSecret}
              onChange={(e) => setFacebookForm((prev) => ({ ...prev, appSecret: e.target.value }))}
              placeholder="App Secret (tùy chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={facebookForm.verifyToken}
              onChange={(e) => setFacebookForm((prev) => ({ ...prev, verifyToken: e.target.value }))}
              placeholder="Verify Token (tùy chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={savingFacebook}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {savingFacebook ? "Đang lưu..." : "Lưu Facebook Cá Nhân"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Gỡ bỏ Facebook Cá Nhân chỉ ảnh hưởng tài khoản hiện tại. Bạn có chắc chắn muốn tiếp tục không?")) {
                    return;
                  }
                  void removeFacebookIntegration();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Gỡ bỏ FaceBook
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 text-left">
            <MessageCircleMore className="h-5 w-5 text-sky-600" />
            <div>
              <h4 className="text-sm font-bold text-slate-800">Zalo OA Cá Nhân</h4>
              <p className="text-[11px] text-slate-500">OA riêng của tài khoản đang đăng nhập .</p>
            </div>
          </div>

          <form onSubmit={handleSaveZalo} className="mt-4 space-y-3 text-left">
            <input
              type="text"
              value={zaloForm.oaId}
              onChange={(e) => setZaloForm((prev) => ({ ...prev, oaId: e.target.value }))}
              placeholder="OA ID"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={zaloForm.oaName}
              onChange={(e) => setZaloForm((prev) => ({ ...prev, oaName: e.target.value }))}
              placeholder="Tên OA"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={zaloForm.accessToken}
              onChange={(e) => setZaloForm((prev) => ({ ...prev, accessToken: e.target.value }))}
              placeholder="Access Token"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={zaloForm.refreshToken}
              onChange={(e) => setZaloForm((prev) => ({ ...prev, refreshToken: e.target.value }))}
              placeholder="Refresh Token (tùy chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={savingZalo}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {savingZalo ? "Đang lưu..." : "Lưu Zalo Cá Nhân"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Gỡ bỏ Zalo Cá Nhân chỉ ảnh hưởng tài khoản hiện tại. Bạn có chắc chắn muốn tiếp tục không?")) {
                    return;
                  }
                  void removeZaloIntegration();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Go bo
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 text-left">
            <Film className="h-5 w-5 text-red-600" />
            <div>
              <h4 className="text-sm font-bold text-slate-800">TikTok Cá Nhân</h4>
              <p className="text-[11px] text-slate-500">Tài khoản riêng của tài khoản đang đăng nhập.</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-3 text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-red-900">Kết nối nhanh bằng TikTok OAuth</p>
                <p className="mt-1 text-[10px] leading-relaxed text-red-800/80">
                  Bấm một lần để lấy access token và refresh token từ TikTok. Hệ thống sẽ tự lưu vào tài khoản hiện tại.
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-red-700/75">
                  Bấm kết nối trực tiếp bằng tài khoản hệ thống (hoặc điền Client Key và Client Secret riêng bên dưới nếu có ứng dụng riêng).
                </p>
              </div>
              <button
                type="button"
                onClick={handleTikTokOAuth}
                disabled={connectingTikTokOAuth || !canStartPersonalTikTokOAuth}
                className="inline-flex items-center gap-1.5 rounded-xl bg-black px-3 py-2 text-[11px] font-bold text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Film className="h-3.5 w-3.5" />
                {connectingTikTokOAuth ? " Đang kết nối..." : userProfile?.tiktokIntegration?.isConnected ? "Kết nối lại" : "Kết nối TikTok"}
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveTikTok} className="mt-4 space-y-3 text-left">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cau hinh app TikTok</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Chỉ cần điền nếu bạn muốn sử dụng Client Key và Client Secret của ứng dụng TikTok riêng. Bỏ trống để dùng mặc định hệ thống.
              </p>
            </div>
            {false && (
              <>
                <input
                  type="text"
                  value={tiktokForm.username}
                  onChange={(e) => setTiktokForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="Username TikTok (e.g. @username)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={tiktokForm.displayName}
                  onChange={(e) => setTiktokForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Tên hiển thị"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={tiktokForm.accessToken}
                  onChange={(e) => setTiktokForm((prev) => ({ ...prev, accessToken: e.target.value }))}
                  placeholder="Access Token"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={tiktokForm.refreshToken}
                  onChange={(e) => setTiktokForm((prev) => ({ ...prev, refreshToken: e.target.value }))}
                  placeholder="Refresh Token (tùy chọn)"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </>
            )}
            <input
              type="text"
              value={tiktokForm.clientKey}
              onChange={(e) => setTiktokForm((prev) => ({ ...prev, clientKey: e.target.value }))}
              placeholder="Client Key (tùy chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="password"
              value={tiktokForm.clientSecret}
              onChange={(e) => setTiktokForm((prev) => ({ ...prev, clientSecret: e.target.value }))}
              placeholder="Client Secret (tùy chọn)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-gray-500">Hạn dùng Access Token (tùy chọn)</label>
              <input
                type="datetime-local"
                value={tiktokForm.tokenExpiredAt}
                onChange={(e) => setTiktokForm((prev) => ({ ...prev, tokenExpiredAt: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-gray-800"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={savingTikTok}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {savingTikTok ? "Đang lưu..." : "Luu TikTok cá nhân"}
              </button>
              <button
                type="button"
                onClick={handleRemoveTikTok}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Go bo
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left">
        <div className="flex items-start gap-2">
          <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
          <div className="text-[11px] leading-relaxed text-emerald-800">
            <p className="font-bold">Nguyên tắc vận hành</p>
            <p className="mt-1">
              1 tài khoản có thể có kênh riêng. Nếu có, CRM và bot ưu tiên sử dụng kênh riêng của tài khoản đó.
              Chỉ khi tài khoản hiện tại chưa kết nối, hệ thống mới fallback sang kênh dùng chung của doanh nghiệp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
