import React from "react";
import { Shield, X, RefreshCw } from "lucide-react";
import { UserProfile } from "../../types";
import { RolePermission, Permission } from "../../services/rolePermissionService";

export interface RoleModalProps {
  open: boolean;
  onClose: () => void;
  editingRole: RolePermission | null;
  roleSlug: string;
  setRoleSlug: (val: string) => void;
  roleDisplayName: string;
  setRoleDisplayName: (val: string) => void;
  roleLevel: number;
  setRoleLevel: (val: number) => void;
  selectedPermissions: string[];
  setSelectedPermissions: React.Dispatch<React.SetStateAction<string[]>>;
  userProfile: UserProfile | null;
  selectedCompanyCode: string;
  systemPermissions: Permission[];
  submittingRole: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function RoleModal({
  open,
  onClose,
  editingRole,
  roleSlug,
  setRoleSlug,
  roleDisplayName,
  setRoleDisplayName,
  roleLevel,
  setRoleLevel,
  selectedPermissions,
  setSelectedPermissions,
  userProfile,
  systemPermissions,
  submittingRole,
  onSubmit,
}: RoleModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-650 rounded-xl">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider font-sans">
                {editingRole ? "Cấu hình vai trò & Phân quyền" : "Tạo vai trò tùy chỉnh mới"}
              </h3>
              <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                {editingRole ? `Vai trò: ${roleSlug}` : "Thiết lập vai trò dành cho doanh nghiệp"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
            <div className="grid grid-cols-2 gap-4">
              {/* Mã vai trò */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Mã vai trò (slug) *</label>
                <input
                  type="text"
                  required
                  disabled={!!editingRole}
                  placeholder="Ví dụ: hr_lead (viết thường, không dấu)"
                  value={roleSlug}
                  onChange={(e) => setRoleSlug(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              {/* Tên hiển thị */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Tên hiển thị (Tiếng Việt) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Trưởng phòng nhân sự"
                  value={roleDisplayName}
                  onChange={(e) => setRoleDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Level vai trò */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block flex items-center gap-1">
                Cấp bậc vai trò (Level) *
                <span className="text-[9px] font-normal normal-case text-gray-400">
                  {userProfile?.role === "superadmin"
                    ? "(2 = cao nhất, 10 = thấp nhất. Superadmin mặc định level 1)"
                    : "(1 = cao nhất, 9 = thấp nhất)"}
                </span>
              </label>
              <select
                value={roleLevel}
                onChange={(e) => setRoleLevel(parseInt(e.target.value, 10))}
                disabled={editingRole?.role === "admin" || editingRole?.role === "superadmin"}
                className="w-full p-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 bg-white cursor-pointer outline-none disabled:bg-gray-150 disabled:cursor-not-allowed"
              >
                {(() => {
                  const minLevel = userProfile?.role === "superadmin" ? 1 : 3;
                  const levels = [];
                  for (let i = minLevel; i <= 10; i++) {
                    levels.push(i);
                  }
                  return levels.map((l) => {
                    const displayL = userProfile?.role === "superadmin" ? l : l - 1;
                    return (
                      <option key={l} value={l}>
                        Cấp độ {displayL}
                      </option>
                    );
                  });
                })()}
              </select>
            </div>

            {/* Danh sách mã quyền gán */}
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Thiết lập các mã quyền được phép truy cập *</label>
              
              {editingRole?.role === "superadmin" ? (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-700 font-mono italic">
                  Vai trò Superadmin tự động có tất cả quyền trong hệ thống (*) và không thể sửa đổi quyền.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1 pr-2">
                  {systemPermissions.map((perm) => {
                    const isChecked = selectedPermissions.includes(perm.code) || selectedPermissions.includes("*");
                    return (
                      <div
                        key={perm.code}
                        onClick={() => {
                          if (selectedPermissions.includes("*")) return; // Super permissions overrides all
                          setSelectedPermissions((prev) => {
                            if (prev.includes(perm.code)) {
                              return prev.filter((p) => p !== perm.code);
                            } else {
                              return [...prev, perm.code];
                            }
                          });
                        }}
                        className={`flex items-start gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all select-none hover:border-indigo-300 ${
                          isChecked
                            ? "bg-indigo-50/50 border-indigo-200"
                            : "bg-white border-gray-150"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={selectedPermissions.includes("*")}
                          readOnly
                          className="mt-0.5 cursor-pointer accent-indigo-650"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-800 block leading-tight">{perm.name}</span>
                          <span className="text-[9px] text-indigo-600 font-mono leading-none block mt-0.5">{perm.code}</span>
                          {perm.description && (
                            <span className="text-[9px] text-gray-400 mt-1 block leading-normal">{perm.description}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 justify-end p-6 border-t border-gray-100 shrink-0 bg-gray-50/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 bg-white rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submittingRole || editingRole?.role === "superadmin"}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submittingRole ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Đang cập nhật...
                </>
              ) : (
                "Lưu cấu hình"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
