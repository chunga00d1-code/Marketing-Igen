import React, { useEffect, useState } from "react";
import { LogOut, Search, Settings, Shield, Wallet } from "lucide-react";
import type { TabType } from "../types";
import { useAuth } from "../context/AuthContext";
import { walletService } from "../services/walletService";

interface HeaderProps {
  currentTab: TabType;
  onSearchSelect: (tab: TabType, subTab?: string) => void;
}

const searchIndex = [
  { label: "Len y tuong AI Marketing", tab: "MARKETING" as TabType, subTab: "LÊN Ý TƯỞNG AI", keywords: "viet content y tuong campaign facebook tiktok copywriter" },
  { label: "Duyet noi dung Marketing", tab: "MARKETING" as TabType, subTab: "DUYỆT NỘI DUNG", keywords: "duyet content post facebook linkedin tiktok" },
  { label: "Lich dang Content", tab: "MARKETING" as TabType, subTab: "LỊCH ĐĂNG CONTENT", keywords: "lich dang content calendar publish" },
  { label: "Pheu Khach hang", tab: "SALES CRM" as TabType, subTab: "PHỄU KHÁCH HÀNG", keywords: "crm phieu khach hang lead cold warm hot" },
  { label: "Omni-Inbox Chat", tab: "SALES CRM" as TabType, subTab: "OMNI-INBOX CHAT", keywords: "chat vip mailbox tro ly ai" },
  { label: "Quan tri user", tab: "QUẢN TRỊ USER" as TabType, keywords: "user admin role permission cong ty wallet balance" },
  { label: "Vi & Nap tien", tab: "VÍ & NẠP TIỀN" as TabType, keywords: "vi nap tien so du payos vietqr nap bank" },
  { label: "Cai dat", tab: "CÀI ĐẶT" as TabType, keywords: "cai dat profile integration cong ty" },
];

export default function Header({ currentTab, onSearchSelect }: HeaderProps) {
  const { userProfile, logout } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const nextBalance = await walletService.getWalletBalance();
        setBalance(nextBalance);
      } catch (error) {
        console.error("Khong the tai so du vi trong Header:", error);
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
          placeholder={`Tim kiem trong ${currentTab.toLowerCase()}...`}
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
              Ket qua tim kiem ({filteredResults.length})
            </div>
            {filteredResults.length > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                {filteredResults.map((item, index) => (
                  <button
                    key={`${item.label}_${index}`}
                    onClick={() => {
                      onSearchSelect(item.tab, item.subTab);
                      setSearchQuery("");
                      setShowResults(false);
                    }}
                    className="flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-blue-50/60"
                  >
                    <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                    <span className="text-[10px] text-gray-400">
                      {item.tab}
                      {item.subTab ? ` > ${item.subTab}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-gray-500">Khong tim thay phan muc phu hop.</div>
            )}
          </div>
        )}
        {showResults && <div className="fixed inset-0 z-[-1]" onClick={() => setShowResults(false)} />}
      </div>

      <div className="ml-6 flex items-center gap-3" id="header_controls">
        {userProfile && (
          <button
            onClick={() => onSearchSelect("VÍ & NẠP TIỀN" as TabType)}
            className="flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 transition-all hover:bg-blue-100/50"
            id="header_wallet_pill"
          >
            <Wallet className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-700">
              {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(balance)} Credit
            </span>
          </button>
        )}

        {(userProfile?.role === "superadmin" || userProfile?.role === "admin") && (
          <button
            onClick={() => onSearchSelect("QUẢN TRỊ USER" as TabType)}
            className="rounded-xl p-2.5 text-gray-600 transition-all hover:bg-gray-50"
            title="Quan tri user"
          >
            <Shield className="h-5 w-5" />
          </button>
        )}

        <button
          onClick={() => onSearchSelect("CÀI ĐẶT" as TabType)}
          className="rounded-xl p-2.5 text-gray-600 transition-all hover:bg-gray-50"
          title="Cai dat"
        >
          <Settings className="h-5 w-5" />
        </button>

        <button
          onClick={logout}
          className="rounded-xl p-2.5 text-gray-600 transition-all hover:bg-gray-50"
          title="Dang xuat"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
