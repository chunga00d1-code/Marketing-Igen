import React, { useState, lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
import {
  User,
  Calendar,
  Image as ImageIcon,
  Sliders,
  Building2
} from "lucide-react";
import { toast } from "./Toast";
import { useSubTabRouter } from "../hooks/useSubTabRouter";

// Lazy-loaded subcomponents
const ProfileTab = lazy(() => import("../components/settings/ProfileTab"));
const SecurityTab = lazy(() => import("../components/settings/SecurityTab"));
const ErpConfigTab = lazy(() => import("../components/settings/ErpConfigTab"));
const PersonalIntegrationsTab = lazy(() => import("../components/settings/PersonalIntegrationsTab"));
const CompanyIntegrationsTab = lazy(() => import("../components/settings/CompanyIntegrationsTab"));

export default function SettingsTab() {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { userProfile, uploadAvatar } = useAuth();
  
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || "");
  const [displayName, setDisplayName] = useState(userProfile?.displayName || "");
  const [uploading, setUploading] = useState(false);

  // Sub-tabs in Settings
  const SETTINGS_SUB_TAB_ROUTES = [
    { slug: "ho-so", value: "profile" as const },
    { slug: "bao-mat", value: "security" as const },
    { slug: "cau-hinh", value: "erp" as const },
    { slug: "mxh-ca-nhan", value: "personal-integrations" as const },
    { slug: "dong-bo", value: "company-integrations" as const },
  ] as const;
  const [activeSubTab, setActiveSubTab] = useSubTabRouter<"profile" | "security" | "erp" | "personal-integrations" | "company-integrations">(SETTINGS_SUB_TAB_ROUTES as any, "profile");

  // Synchronize display name and photo url from context if it updates
  React.useEffect(() => {
    if (userProfile?.displayName) {
      setDisplayName(userProfile.displayName);
    }
    if (userProfile?.photoURL) {
      setPhotoURL(userProfile.photoURL);
    }
  }, [userProfile]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn tệp tin hình ảnh hợp lệ!");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Kích thước hình ảnh không được vượt quá 5MB!");
      return;
    }

    setUploading(true);
    try {
      const downloadURL = await uploadAvatar(file);
      setPhotoURL(downloadURL);
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const getFormattedDate = () => {
    if (!userProfile?.createdAt) return "Chưa cập nhật";

    let date: Date;
    if (typeof userProfile.createdAt.toDate === "function") {
      date = userProfile.createdAt.toDate();
    } else if (userProfile.createdAt.seconds) {
      date = new Date(userProfile.createdAt.seconds * 1000);
    } else {
      date = new Date(userProfile.createdAt);
    }

    if (isNaN(date.getTime())) {
      return "Chưa cập nhật";
    }

    return date.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const formattedDate = getFormattedDate();

  return (
    <div className="h-full flex flex-col font-sans overflow-y-auto pr-2 pb-6" id="settings_tab_container">

      {/* Title Header with Glassmorphism Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Sliders className="h-5 w-5 text-indigo-650" />
            Cài đặt Hệ thống & Cá nhân
          </h1>
          <p className="text-xs text-gray-500 mt-1">Cấu hình thông tin hồ sơ của bạn và tùy chỉnh tham số vận hành của iGen ERP.</p>
        </div>
        <div className="flex gap-2 bg-gray-150/70 p-1 rounded-xl border border-gray-200 max-w-fit">
          <button
            onClick={() => setActiveSubTab("profile")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSubTab === "profile"
              ? "bg-white text-gray-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
              }`}
          >
            Hồ sơ cá nhân
          </button>
          <button
            onClick={() => setActiveSubTab("security")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSubTab === "security"
              ? "bg-white text-gray-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
              }`}
          >
            Bảo mật
          </button>
          <button
            onClick={() => setActiveSubTab("erp")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSubTab === "erp"
              ? "bg-white text-gray-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
              }`}
          >
            Cấu hình ERP
          </button>
          <button
            onClick={() => setActiveSubTab("personal-integrations")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSubTab === "personal-integrations"
              ? "bg-white text-gray-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
              }`}
          >
            MXH Ca Nhan
          </button>
          <button
            onClick={() => setActiveSubTab("company-integrations")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSubTab === "company-integrations"
              ? "bg-white text-gray-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
              }`}
          >
            🏢 MXH Doanh nghiệp
          </button>
        </div>
      </div>

      {/* Main Settings Body Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left Column: Quick Profile Card */}
        <div className="bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-2xl p-6 shadow-xs flex flex-col items-center text-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-80" />

          <div className="relative mt-10 cursor-pointer group" onClick={handleAvatarClick}>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
            />
            {uploading ? (
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-100 flex items-center justify-center relative z-10">
                <div className="w-6 h-6 border-2 border-indigo-650 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg relative z-10 group-hover:opacity-90 transition-opacity"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-3xl shadow-lg border-4 border-white relative z-10 select-none group-hover:bg-indigo-700 transition-colors">
                {displayName.slice(0, 2).toUpperCase() || "AD"}
              </div>
            )}
            <div className="absolute bottom-0 right-0 z-20 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
              <ImageIcon className="h-4 w-4 text-gray-500" />
            </div>
          </div>

          <div className="space-y-1 relative z-10 mt-2">
            <h3 className="text-base font-bold text-gray-800">{displayName}</h3>
            <p className="text-xs text-gray-500">{userProfile?.email}</p>
            <div className="pt-2 flex justify-center">
              <span className={`px-2.5 py-0.5 rounded-full font-mono font-bold text-[9px] uppercase border tracking-wider ${userProfile?.role === "superadmin"
                ? "bg-rose-50 border-rose-200 text-rose-600"
                : userProfile?.role === "admin"
                  ? "bg-amber-50 border-amber-200 text-amber-600"
                  : "bg-slate-50 border-slate-200 text-slate-600"
                }`}>
                Quyền hạn: {userProfile?.role}
              </span>
            </div>
          </div>

          <div className="w-full border-t border-gray-100 pt-4 mt-2 space-y-3 text-left text-xs text-gray-600">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-gray-400">
                <Calendar className="h-4 w-4" />
                Ngày tham gia
              </span>
              <span className="font-semibold text-gray-700">{formattedDate}</span>
            </div>
          </div>
        </div>

        {/* Right Columns: Settings Forms */}
        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<TabLoader label="Đang tải cấu hình..." />}>
            {activeSubTab === "profile" && <ProfileTab />}
            {activeSubTab === "security" && <SecurityTab />}
            {activeSubTab === "erp" && <ErpConfigTab />}
            {activeSubTab === "personal-integrations" && <PersonalIntegrationsTab />}
            {activeSubTab === "company-integrations" && <CompanyIntegrationsTab userProfile={userProfile} />}
          </Suspense>
        </div>

      </div>

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
