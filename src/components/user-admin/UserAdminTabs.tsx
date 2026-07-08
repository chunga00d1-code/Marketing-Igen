import { Wallet } from "lucide-react";
import { UserProfile } from "../../types";
import { UserAdminTabKey } from "./types";

interface Props {
  activeTab: UserAdminTabKey;
  onChange: (tab: UserAdminTabKey) => void;
  userProfile?: UserProfile | null;
}

export function UserAdminTabs({ activeTab, onChange, userProfile }: Props) {
  return (
    <div className="border-b border-gray-200 px-6 py-2 bg-slate-50 flex gap-4 shrink-0" id="user_admin_subtabs">
      <button
        onClick={() => onChange("users")}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
          activeTab === "users" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-250"
        }`}
      >
        Danh sách tài khoản
      </button>
      <button
        onClick={() => onChange("roles")}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
          activeTab === "roles" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-250"
        }`}
      >
        Vai trò & Phân quyền
      </button>
      {userProfile?.role === "superadmin" && (
        <button
          onClick={() => onChange("balance")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === "balance" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-250"
          }`}
        >
          <Wallet className="h-3.5 w-3.5" />
          Số dư người dùng
        </button>
      )}
    </div>
  );
}
