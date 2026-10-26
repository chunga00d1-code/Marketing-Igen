import { useState } from "react";
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
import type { ElementType } from "react";
import { SidebarFilledIcon, type SidebarFilledIconName } from "../components/SidebarFilledIcon";
import {
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
  railTitle: string;
  icon: ElementType;
  filledIcon: SidebarFilledIconName;
  isSuperAdminOnly?: boolean;
  requiresAuth?: boolean;
}

interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

const navGroups: NavGroupConfig[] = [
  {
    title: "Tổng quan",
    items: [
      {
        label: "TONG QUAN",
        title: "Tổng quan",
        railTitle: "Tổng quan",
        icon: LayoutDashboard,
        filledIcon: "overview",
      },
    ],
  },
  {
    title: "Vận hành",
    items: [
      {
        label: "MARKETING",
        title: "Marketing Hub",
        railTitle: "Marketing",
        icon: Megaphone,
        filledIcon: "marketing",
      },
      {
        label: "SALES CRM",
        title: "Sales CRM",
        railTitle: "Sales CRM",
        icon: MessageSquareShare,
        filledIcon: "crm",
      },
      {
        label: "FB CHAT SIMULATOR",
        title: "Mô phỏng chat Facebook",
        railTitle: "FB Demo",
        icon: MessageSquareShare,
        filledIcon: "crm",
      },
    ],
  },
  {
    title: "Công cụ",
    items: [
      {
        label: "XUONG NOI DUNG",
        title: "Xưởng nội dung",
        railTitle: "Nội dung",
        icon: Palette,
        filledIcon: "content",
      },
      {
        label: "VIDEO STUDIO",
        title: "Video Studio",
        railTitle: "Video",
        icon: Clapperboard,
        filledIcon: "video",
      },
      {
        label: "KHO TRI THUC",
        title: "Kho tri thức",
        railTitle: "Tri thức",
        icon: LibraryBig,
        filledIcon: "knowledge",
      },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      {
        label: "QUAN TRI USER",
        title: "Quản lý người dùng",
        railTitle: "Người dùng",
        icon: ShieldCheck,
        filledIcon: "users",
        isSuperAdminOnly: true,
      },
      {
        label: "VI & NAP TIEN",
        title: "Ví & Nạp tiền",
        railTitle: "Ví tiền",
        icon: Wallet,
        filledIcon: "wallet",
        requiresAuth: true,
      },
      {
        label: "CAI DAT",
        title: "Cài đặt hệ thống",
        railTitle: "Cài đặt",
        icon: Settings,
        filledIcon: "settings",
      },
      {
        label: "HUONG DAN SU DUNG",
        title: "Hướng dẫn sử dụng",
        railTitle: "Hướng dẫn",
        icon: BookOpen,
        filledIcon: "guide",
      },
    ],
  },
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { userProfile } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(true);

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
        isCollapsed ? "w-[88px]" : "w-[220px]"
      }`}
      id="sidebar_container"
    >
      {/* Brand Header */}
      <div className="h-20 shrink-0 border-b border-slate-100" id="sidebar_brand_header">
        <button
          type="button"
          onClick={() => setActiveTab("TONG QUAN")}
          className="relative block h-full w-full overflow-hidden transition-transform active:scale-[0.98]"
          title="Về dashboard"
          aria-label="Về dashboard"
        >
          <img
            src="/brand-icon.png"
            alt=""
            className={`absolute top-1/2 max-w-none -translate-y-1/2 object-contain transition-all duration-300 ${isCollapsed ? "left-1/2 w-[70px] -translate-x-1/2" : "left-4 w-[100px] translate-x-0"}`}
          />
          <span className={`pointer-events-none absolute bottom-1.5 left-10 w-[100px] text-center text-[10px] font-medium tracking-[0.08em] text-slate-800 transition-opacity duration-300 ${isCollapsed ? "opacity-0" : "opacity-100"}`}>
            AI MARKETING
          </span>
        </button>
      </div>

      {/* Nav Menu */}
      <nav
        className={`flex-1 select-none overflow-y-auto ${
          isCollapsed ? "space-y-1 px-1.5 py-3" : "space-y-2 px-2.5 py-3"
        }`}
        id="sidebar_nav"
      >
        {filteredGroups.map((group) => {
          if (group.items.length === 0) return null;

          return (
            <div key={group.title} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 pb-1 pt-1 text-[11px] font-medium tracking-wider text-slate-400 uppercase">
                  {group.title}
                </p>
              ) : null}

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
                      className={`group flex w-full rounded-xl font-sans transition-all duration-150 active:scale-[0.98] ${
                        isCollapsed
                          ? "min-h-[70px] flex-col items-center justify-center gap-1 px-1 py-2 text-center"
                          : "min-h-10 justify-between px-3 py-2 text-left"
                      } ${
                        isActive
                          ? isCollapsed
                            ? "text-[#00ADFC] font-medium"
                            : "bg-[#eaf8ff] text-[#00ADFC] font-medium"
                          : "text-slate-600 hover:text-[#008fcf] font-normal"
                      }`}
                      id={`sidebar_menu_${item.label.replace(/\s+/g, "_")}`}
                      data-navigation={item.label === "VI & NAP TIEN" ? "wallet" : undefined}
                      title={item.title}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <div className={`flex min-w-0 items-center ${isCollapsed ? "flex-col gap-1" : "gap-3"}`}>
                        <span className={`flex shrink-0 items-center justify-center transition-colors ${isCollapsed ? "h-11 w-11 rounded-2xl" : "h-5 w-5"} ${isActive ? "bg-[#eaf8ff]" : "group-hover:bg-[#effaff]"}`}>
                          {isActive ? (
                            <SidebarFilledIcon name={item.filledIcon} className={`${isCollapsed ? "h-6 w-6" : "h-5 w-5"} text-[#00ADFC]`} />
                          ) : (
                            <Icon className={`${isCollapsed ? "h-6 w-6" : "h-5 w-5"} text-[#00ADFC]`} strokeWidth={1.7} />
                          )}
                        </span>
                        {isCollapsed ? <span className="max-w-[76px] text-[11px] leading-[14px]">{item.railTitle}</span> : null}
                        {!isCollapsed ? (
                          <span className="truncate text-sm">
                            {item.title}
                          </span>
                        ) : null}
                      </div>

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
