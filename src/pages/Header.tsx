import React, { useEffect, useState } from "react";
import { LogOut, Search, Settings, Wallet, Send, Receipt } from "lucide-react";
import type { TabType } from "../types";
import { useAuth } from "../context/AuthContext";
import { walletService } from "../services/walletService";
import PersonalIntegrationsTab from "../components/settings/PersonalIntegrationsTab";
import { PricingModal } from "../components/pricing/PricingModal";
import {
  openVideoStudio,
  type VideoStudioTool,
} from "../utils/videoStudioNavigation";

interface HeaderProps {
  currentTab: TabType;
  onSearchSelect: (tab: TabType, subTab?: string) => void;
}

type SearchItem = {
  label: string;
  tab: TabType;
  subTab?: string;
  videoTool?: Exclude<VideoStudioTool, "home">;
  keywords: string;
};

const searchIndex: SearchItem[] = [
  { label: "Dashboard tổng quan", tab: "TONG QUAN" as TabType, keywords: "dashboard tong quan sale marketing crm publishing kenh chat" },
  { label: "Tạo nội dung & chiến dịch", tab: "MARKETING" as TabType, subTab: "TẠO CHIẾN DỊCH", keywords: "viet content y tuong campaign facebook tiktok copywriter duyet" },
  { label: "Xưởng nội dung", tab: "XUONG NOI DUNG" as TabType, keywords: "tao anh thiet ke hang loat bulk create" },
  { label: "Video Studio", tab: "VIDEO STUDIO" as TabType, keywords: "tao video giong doc long tieng chinh sua phu de video nguoi dan motion long short" },
  { label: "Tạo video từ nội dung", tab: "VIDEO STUDIO" as TabType, videoTool: "ai-video", keywords: "veo tao video ai prompt hinh anh" },
  { label: "Tạo video người dẫn AI", tab: "VIDEO STUDIO" as TabType, videoTool: "human-video", keywords: "heygen avatar nguoi that video thuyet trinh" },
  { label: "Tạo chuyển động từ hình ảnh", tab: "VIDEO STUDIO" as TabType, videoTool: "motion", keywords: "kling motion control chuyen dong nhan vat" },
  { label: "Chỉnh sửa video", tab: "VIDEO STUDIO" as TabType, videoTool: "edit-video", keywords: "edit cat ghep chinh sua video" },
  { label: "Cắt video dài thành video ngắn", tab: "VIDEO STUDIO" as TabType, videoTool: "long-to-short", keywords: "long to short video ngan highlight" },
  { label: "Tạo giọng đọc", tab: "VIDEO STUDIO" as TabType, videoTool: "voice", keywords: "voice giong noi giong doc long tieng elevenlabs audio" },
  { label: "Thêm phụ đề vào video", tab: "VIDEO STUDIO" as TabType, videoTool: "caption", keywords: "caption subtitle phu de timeline video" },
  { label: "Kho tri thức doanh nghiệp", tab: "KHO TRI THUC" as TabType, keywords: "rag tai lieu doanh nghiep sale reply ai caption marketing drive" },
  { label: "Lịch đăng Content", tab: "MARKETING" as TabType, subTab: "LỊCH ĐĂNG CONTENT", keywords: "lich dang content calendar publish" },
  { label: "Phễu khách hàng", tab: "SALES CRM" as TabType, subTab: "PHỄU KHÁCH HÀNG", keywords: "crm phieu khach hang lead cold warm hot" },
  { label: "Hộp thư hội thoại ", tab: "SALES CRM" as TabType, subTab: "OMNI-INBOX CHAT", keywords: "chat vip mailbox tro ly ai omni inbox hop thu" },
  { label: "Quản trị user", tab: "QUAN TRI USER" as TabType, keywords: "user admin role permission cong ty wallet balance" },
  { label: "Ví & Nạp tiền", tab: "VI & NAP TIEN" as TabType, keywords: "vi nap tien so du payos vietqr nap bank" },
  { label: "Cài đặt hệ thống", tab: "CAI DAT" as TabType, keywords: "cai dat profile integration cong ty" },
  { label: "Hướng dẫn sử dụng", tab: "HUONG DAN SU DUNG" as TabType, keywords: "huong dan su dung tro giup documentation guide nontech cam nang" },
];

export default function Header({ currentTab, onSearchSelect }: HeaderProps) {
  const { userProfile, logout } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const nextBalance = await walletService.getWalletBalance();
        setBalance(nextBalance);
      } catch (error) {
        console.error("Không thể tải số dư ví trong Header:", error);
      }
    };

    void fetchBalance();
    const interval = window.setInterval(() => void fetchBalance(), 10000);
    return () => window.clearInterval(interval);
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredResults =
    normalizedQuery === ""
      ? []
      : searchIndex.filter(
        (item) =>
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.keywords.toLowerCase().includes(normalizedQuery)
      );

  return (
    <header className="sticky top-0 z-40 flex h-18 items-center justify-between border-b border-gray-100 bg-white px-6 shadow-xs" id="app_header">
      <div className="relative w-full max-w-2xl" id="search_container">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={`Tìm kiếm trong ${currentTab.toLowerCase()}...`}
          className="block h-12 w-full rounded-full border border-gray-200 bg-white pl-12 pr-5 text-sm text-gray-900 shadow-[0_8px_24px_rgba(15,23,42,0.05)] outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          id="global_search_input"
        />

        {showResults && searchQuery.trim() !== "" && (
          <div className="absolute left-0 z-50 mt-3 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white font-sans text-xs shadow-2xl">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Kết quả tìm kiếm ({filteredResults.length})
            </div>
            {filteredResults.length > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                {filteredResults.map((item, index) => (
                  <button
                    key={`${item.label}_${index}`}
                    onClick={() => {
                      if (item.videoTool) {
                        openVideoStudio({ tool: item.videoTool });
                      } else {
                        onSearchSelect(item.tab, item.subTab);
                      }
                      setSearchQuery("");
                      setShowResults(false);
                    }}
                    className="flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-blue-50/60"
                  >
                    <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                    <span className="text-[10px] text-gray-400">
                      {item.tab}
                      {item.videoTool ? ` > ${item.label}` : item.subTab ? ` > ${item.subTab}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-gray-500">Không tìm thấy phân mục phù hợp.</div>
            )}
          </div>
        )}
        {showResults && <div className="fixed inset-0 z-[-1]" onClick={() => setShowResults(false)} />}
      </div>

      <div className="ml-6 flex items-center gap-3" id="header_controls">
        {/* Nút Bảng Giá Dịch Vụ */}
        <button
          onClick={() => setShowPricingModal(true)}
          className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/80 px-3.5 py-2 text-sky-700 hover:bg-sky-100 transition-all cursor-pointer shadow-xs"
          title="Bảng giá dịch vụ AI & Credit"
          id="header_pricing_trigger"
        >
          <Receipt className="h-4 w-4 text-sky-600" />
          <span className="text-xs font-bold hidden sm:inline">Bảng giá</span>
        </button>

        {userProfile && (
          <button
            onClick={() => onSearchSelect("VI & NAP TIEN" as TabType)}
            className="flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 transition-all hover:bg-blue-100/50 cursor-pointer"
            id="header_wallet_pill"
          >
            <Wallet className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-700">
              {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(balance)} Credit
            </span>
          </button>
        )}

        {/* User Profile Dropdown */}
        {userProfile && (
          <div className="relative">
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center gap-2.5 rounded-full p-1.5 pr-3 hover:bg-gray-50 border border-gray-100 transition-all cursor-pointer select-none"
              id="header_profile_trigger"
            >
              {userProfile.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName}
                  className="h-8 w-8 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-xs select-none">
                  {(userProfile.displayName || "User").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-gray-800 line-clamp-1">
                  {userProfile.displayName}
                </span>
                <span className="text-[9px] text-gray-400 font-medium tracking-wide">
                  {userProfile.role.toUpperCase()}
                </span>
              </div>
            </button>

            {showProfileDropdown && (
              <>
                {/* Backdrop overlay to click away */}
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />

                <div className="absolute right-0 mt-2.5 w-64 rounded-2xl border border-gray-150 bg-white p-4 shadow-xl z-50 animate-fade-in text-left">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-3">
                    {userProfile.photoURL ? (
                      <img
                        src={userProfile.photoURL}
                        alt={userProfile.displayName}
                        className="h-10 w-10 rounded-full object-cover border border-gray-200 animate-pulse"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-sm select-none">
                        {(userProfile.displayName || "User").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-gray-800 truncate">
                        {userProfile.displayName}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate">
                        {userProfile.email}
                      </span>
                      <span className={`mt-1 max-w-fit px-2 py-0.5 rounded-full font-mono font-bold text-[8px] uppercase tracking-wider border ${userProfile.role === "superadmin" || userProfile.role === "admin"
                        ? "bg-rose-50 border-rose-200 text-rose-600"
                        : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}>
                        {userProfile.role}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        onSearchSelect("CAI DAT");
                        setShowProfileDropdown(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <Settings className="h-4 w-4 text-gray-400" />
                      Cài đặt tài khoản
                    </button>

                    <button
                      onClick={() => {
                        setShowIntegrationsModal(true);
                        setShowProfileDropdown(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <Send className="h-4 w-4 text-sky-500" />
                      Kết nối Telegram
                    </button>

                    <button
                      onClick={() => {
                        logout();
                        setShowProfileDropdown(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50/50 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 text-red-500" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showIntegrationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="fixed inset-0" onClick={() => setShowIntegrationsModal(false)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-50 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-scale-up">

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-4">
              <div className="text-left">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Send className="h-5 w-5 text-sky-500 animate-pulse" />
                  Kết Nối Telegram
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cấu hình nhận thông báo phê duyệt bài đăng và báo cáo nhanh từ AI qua Telegram
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIntegrationsModal(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-slate-100 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <PersonalIntegrationsTab />
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200/80 bg-white px-6 py-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowIntegrationsModal(false)}
                className="rounded-xl border border-gray-200 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Pricing Table Modal */}
      <PricingModal
        isOpen={showPricingModal}
        onClose={() => setShowPricingModal(false)}
      />
    </header>
  );
}
