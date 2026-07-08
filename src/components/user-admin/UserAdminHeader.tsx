import { Plus, RefreshCw, Users } from "lucide-react";
import { CompanyProfile, UserProfile } from "../../types";

interface Props {
  userProfile?: UserProfile | null;
  companies: CompanyProfile[];
  selectedCompanyCode: string;
  onSelectedCompanyCodeChange: (value: string) => void;
  onOpenCompanyModal: () => void;
  onOpenCreateUserModal: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export function UserAdminHeader({
  userProfile,
  companies,
  selectedCompanyCode,
  onSelectedCompanyCodeChange,
  onOpenCompanyModal,
  onOpenCreateUserModal,
  onRefresh,
  loading,
}: Props) {
  return (
    <div className="border-b border-gray-200 bg-gray-50/50 p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0" id="user_admin_header">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-150">
          <Users className="h-5 w-5 text-indigo-650" />
        </div>
        <div>
          <h4 className="font-bold text-slate-800 text-sm font-sans tracking-tight uppercase">
            Quản trị Tài khoản & Phân quyền
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {userProfile?.role === "superadmin"
              ? "Quản trị toàn bộ hệ thống SaaS Multi-tenant và các tài khoản doanh nghiệp."
              : `Quản lý và cấp quyền hạn cho tất cả thành viên trong công ty ${userProfile?.companyName || ""}.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {userProfile?.role === "superadmin" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">Doanh nghiệp:</span>
              <select
                value={selectedCompanyCode}
                onChange={(e) => onSelectedCompanyCodeChange(e.target.value)}
                className="p-1.5 border border-gray-200 bg-white rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                <option value="all">Tất cả doanh nghiệp</option>
                {companies.map((c) => (
                  <option key={c.id || c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onOpenCompanyModal}
              className="p-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Đăng ký doanh nghiệp
            </button>
          </>
        )}

        {(userProfile?.role === "superadmin" || userProfile?.role === "admin") && (
          <button
            onClick={onOpenCreateUserModal}
            className="p-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm người dùng
          </button>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 px-3.5 bg-white hover:bg-slate-100 border border-gray-205 rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Tải lại danh sách
        </button>
      </div>
    </div>
  );
}

