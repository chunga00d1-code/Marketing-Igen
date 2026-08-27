import React, { useState } from "react";
import {
  LayoutDashboard,
  Megaphone,
  Palette,
  MessageSquareShare,
  Settings,
  ShieldCheck,
  Wallet,
  BookOpen,
  LibraryBig,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BRAND_LOGO_PATH,
  BRAND_NAME,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  USER_DATA_DELETION_URL,
} from "../config/brand";
import type { TabType } from "../types";
import { useAuth } from "../context/AuthContext";
import { openVideoStudio } from "../utils/videoStudioNavigation";

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

interface NavItemConfig {
  label: TabType;
  title: string;
  icon: React.ElementType;
  isSuperAdminOnly?: boolean;
  requiresAuth?: boolean;
}

interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

const navGroups: NavGroupConfig[] = [
  {
    title: "TỔNG QUAN",
    items: [
      {
        label: "TONG QUAN",
        title: "Tổng quan",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "VẬN HÀNH",
    items: [
      {
        label: "MARKETING",
        title: "Marketing Hub",
        icon: Megaphone,
      },
      {
        label: "SALES CRM",
        title: "Sales CRM",
        icon: MessageSquareShare,
      },
    ],
  },
  {
    title: "CÔNG CỤ",
    items: [
      {
        label: "XUONG NOI DUNG",
        title: "Xưởng nội dung",
        icon: Palette,
      },
      {
        label: "VIDEO STUDIO",
        title: "Video Studio",
        icon: Clapperboard,
      },
      {
        label: "KHO TRI THUC",
        title: "Kho tri thức",
        icon: LibraryBig,
      },
    ],
  },
  {
    title: "HỆ THỐNG",
    items: [
      {
        label: "QUAN TRI USER",
        title: "Quản lý người dùng",
        icon: ShieldCheck,
        isSuperAdminOnly: true,
      },
      {
        label: "VI & NAP TIEN",
        title: "Ví & Nạp tiền",
        icon: Wallet,
        requiresAuth: true,
      },
      {
        label: "CAI DAT",
        title: "Cài đặt hệ thống",
        icon: Settings,
      },
      {
        label: "HUONG DAN SU DUNG",
        title: "Hướng dẫn sử dụng",
        icon: BookOpen,
      },
    ],
  },
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { userProfile } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isAdminOrSuperAdmin =
    userProfile?.role === "superadmin" || userProfile?.role === "admin";

  const filteredGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.isSuperAdminOnly && !isAdminOrSuperAdmin) return false;
      if (item.requiresAuth && !userProfile) return false;
      return true;
    }),
  }));

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-100 bg-white text-slate-800 shadow-[18px_0_45px_rgba(15,23,42,0.03)] transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-68"
      }`}
      id="sidebar_container"
    >
      {/* Brand Header */}
      <div
        className={`flex items-center border-b border-slate-100 ${
          isCollapsed ? "justify-center px-3 py-5" : "px-5 py-5"
        }`}
        id="sidebar_brand_header"
      >
        <div
          onClick={() => setActiveTab("TONG QUAN")}
          className={`flex min-w-0 items-center cursor-pointer select-none group ${
            isCollapsed ? "justify-center" : "gap-3.5"
          }`}
          title="Về dashboard"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-gradient-to-b from-white to-sky-50/50 p-1 shadow-xs transition-transform group-hover:scale-105 group-active:scale-95">
            <img
              src={BRAND_LOGO_PATH}
              alt={BRAND_NAME}
              className="h-8 w-8 object-contain rounded-lg"
            />
          </div>
          {!isCollapsed ? (
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold tracking-tight text-[#0284c7]">
                iGen <span className="text-slate-800 font-bold">ERP</span>
              </h2>
              <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                ENTERPRISE HUB
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Nav Menu */}
      <nav
        className={`flex-1 select-none space-y-4 overflow-y-auto ${
          isCollapsed ? "px-2 py-4" : "px-3.5 py-4"
        }`}
        id="sidebar_nav"
      >
        {filteredGroups.map((group, gIdx) => {
          if (group.items.length === 0) return null;

          return (
            <div key={group.title} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  {group.title}
                </p>
              ) : (
                gIdx > 0 && <div className="mx-2 my-2 border-t border-slate-100" />
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeTab === item.label;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        if (item.label === "VIDEO STUDIO") {
                          openVideoStudio();
                          return;
                        }
                        setActiveTab(item.label);
                      }}
                      className={`group flex w-full items-center rounded-xl font-sans transition-all duration-150 active:scale-[0.98] ${
                        isCollapsed
                          ? "justify-center p-2.5"
                          : "justify-between px-3.5 py-2.5 text-left"
                      } ${
                        isActive
                          ? "bg-[#f0f7ff] text-[#0284c7] font-semibold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                      }`}
                      id={`sidebar_menu_${item.label.replace(/\s+/g, "_")}`}
                      data-navigation={item.label === "VI & NAP TIEN" ? "wallet" : undefined}
                      title={isCollapsed ? item.title : undefined}
                    >
                      <div className={`flex min-w-0 items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
                        <Icon
                          className={`h-5 w-5 shrink-0 transition-colors ${
                            isActive
                              ? "text-[#0284c7]"
                              : "text-slate-400 group-hover:text-slate-600"
                          }`}
                        />
                        {!isCollapsed ? (
                          <span className="truncate text-sm">
                            {item.title}
                          </span>
                        ) : null}
                      </div>

                      {!isCollapsed && isActive ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#0284c7]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle & Footer */}
      <div className="border-t border-slate-100 px-4 py-3 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 active:scale-95 cursor-pointer"
          title={isCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          aria-label={isCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        {!isCollapsed ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600 hover:underline transition-colors"
            >
              Bảo mật
            </a>
            <span className="text-slate-300 select-none">•</span>
            <a
              href={TERMS_OF_SERVICE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600 hover:underline transition-colors"
            >
              Điều khoản
            </a>
            <span className="text-slate-300 select-none">•</span>
            <a
              href={USER_DATA_DELETION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600 hover:underline transition-colors"
            >
              Xóa dữ liệu
            </a>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
