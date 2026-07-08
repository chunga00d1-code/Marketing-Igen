import React, { Suspense, lazy } from "react";
import { RefreshCw } from "lucide-react";
import Sidebar from "./pages/Sidebar";
import Header from "./pages/Header";
import { ToastContainer } from "./pages/Toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import type { TabType } from "./types";
import { SEOHead } from "./seo/SEOHead";
import { AUTH_SEO, getSeoForTab } from "./seo/seo-config";
import { AppRouterView, useTabRouter } from "./router";
import { socketService } from "./services/socketService";

const AuthPage = lazy(() => import("./pages/AuthPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const UserDataDeletion = lazy(() => import("./pages/UserDataDeletion"));
const LandingPage = lazy(() => import("./pages/LandingPage"));

function AppContent() {
  const { user, userProfile, loading } = useAuth();
  const currentPath = normalizePublicPath(window.location.pathname);
  const isLandingPage = currentPath === "/" || currentPath === "/landing" || currentPath === "/landing.html";
  const isLandingGuestPage = isLandingPage && !Boolean(user && userProfile);
  const isPrivacyPage = currentPath === "/privacy-policy" || currentPath === "/privacy-policy.html";
  const isTermsPage = currentPath === "/terms-of-service" || currentPath === "/terms-of-service.html";
  const isDeletionPage = currentPath === "/user-data-deletion" || currentPath === "/user-data-deletion.html";
  const isLegalPublicPage = isPrivacyPage || isTermsPage || isDeletionPage;
  const isPublicPage = isLandingGuestPage || isLegalPublicPage;

  const { activeTab, setActiveTab } = useTabRouter({
    enabled: !isPublicPage && !loading && Boolean(user && userProfile),
  });

  React.useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (user && token) {
      console.log("[App] Connecting global socket...");
      socketService.connect(token);
    } else {
      console.log("[App] Disconnecting global socket...");
      socketService.disconnect();
    }
  }, [user]);

  if (isLandingGuestPage) {
    return (
      <Suspense fallback={<AuthLoader />}>
        <LandingPage />
      </Suspense>
    );
  }

  if (isLegalPublicPage) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between py-10 px-4 font-sans overflow-y-auto">
        <div className="flex-1">
          <Suspense fallback={<AuthLoader />}>
            {isPrivacyPage ? (
              <PrivacyPolicy />
            ) : isTermsPage ? (
              <TermsOfService />
            ) : (
              <UserDataDeletion />
            )}
          </Suspense>
        </div>
        <div className="mt-8 text-center text-xs text-slate-400">
          <a href="/dang-nhap" className="font-semibold text-slate-500 hover:text-blue-600 underline">
            Quay lại trang Đăng nhập
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <SEOHead meta={{ ...AUTH_SEO, title: "Đang tải hệ thống iGen ERP", path: "/khoi-tao-he-thong" }} />
        <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#f6f8fd] via-[#eef2f7] to-[#e3ecf5] text-center font-sans">
          <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[600px] w-[600px] rounded-full bg-blue-400/5 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[600px] w-[600px] rounded-full bg-indigo-400/5 blur-[120px]" />

          <div className="z-10 flex flex-col items-center">
            <RefreshCw className="mb-4 h-10 w-10 animate-spin text-blue-600" />
            <span className="animate-pulse text-xs font-bold uppercase tracking-widest text-slate-500">
              Đang khởi tạo hệ thống ERP...
            </span>
          </div>
        </div>
      </>
    );
  }

  if (!user || !userProfile) {
    return (
      <>
        <SEOHead meta={AUTH_SEO} />
        <Suspense fallback={<AuthLoader />}>
          <AuthPage />
        </Suspense>
      </>
    );
  }

  const handleSearchNavigation = (tab: TabType, subTab?: string) => {
    setActiveTab(tab);
    console.log(`Global Navigation search redirected to Tab: ${tab}, Section: ${subTab || "None"}`);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-on-surface" id="app_root_layout">
      <SEOHead meta={getSeoForTab(activeTab)} />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex h-screen flex-1 flex-col overflow-hidden" id="main_content_area">
        <Header currentTab={activeTab} onSearchSelect={handleSearchNavigation} />

        <main className="flex-1 overflow-hidden bg-surface p-6" id="primary_page_container">
          <AppRouterView activeTab={activeTab} userProfile={userProfile} />
        </main>
      </div>
    </div>
  );
}

function normalizePublicPath(pathname: string) {
  const normalized = pathname.toLowerCase().trim();
  if (!normalized || normalized === "/") return "/";
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <ToastContainer />
    </AuthProvider>
  );
}

function AuthLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f8fd] via-[#eef2f7] to-[#e3ecf5] text-sm font-semibold text-slate-500">
      Đang tải trang đăng nhập...
    </div>
  );
}
