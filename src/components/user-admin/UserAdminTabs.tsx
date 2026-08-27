import { Users, Shield, Wallet } from "lucide-react";
import { UserProfile } from "../../types";
import { UserAdminTabKey } from "./types";

interface Props {
  activeTab: UserAdminTabKey;
  onChange: (tab: UserAdminTabKey) => void;
  userProfile?: UserProfile | null;
}

export function UserAdminTabs({ activeTab, onChange, userProfile }: Props) {
  return (
    <div className="border-b border-slate-100 px-6 py-2.5 bg-white flex items-center gap-2 shrink-0 overflow-x-auto" id="user_admin_subtabs">
      <button
        onClick={() => onChange("users")}
        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer select-none ${
          activeTab === "users"
            ? "bg-[#0284c7] text-white shadow-xs"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <Users className={`h-4 w-4 ${activeTab === "users" ? "text-white" : "text-slate-500"}`} />
        <span>Danh sách tài khoản</span>
      </button>
      <button
        onClick={() => onChange("roles")}
        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer select-none ${
          activeTab === "roles"
            ? "bg-[#0284c7] text-white shadow-xs"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <Shield className={`h-4 w-4 ${activeTab === "roles" ? "text-white" : "text-slate-500"}`} />
        <span>Vai trò & Phân quyền</span>
      </button>
      {userProfile?.role === "superadmin" && (
        <button
          onClick={() => onChange("balance")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer select-none ${
            activeTab === "balance"
              ? "bg-[#0284c7] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Wallet className={`h-4 w-4 ${activeTab === "balance" ? "text-white" : "text-slate-500"}`} />
          <span>Số dư người dùng</span>
        </button>
      )}
    </div>
  );
}
