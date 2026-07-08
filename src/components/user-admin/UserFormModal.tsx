import React from "react";
import { User, Mail, Lock, X, RefreshCw } from "lucide-react";
import { CompanyProfile, UserProfile } from "../../types";

export interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  editingUser: UserProfile | null;
  userDisplayName: string;
  setUserDisplayName: (val: string) => void;
  userEmail: string;
  setUserEmail: (val: string) => void;
  userPassword: string;
  setUserPassword: (val: string) => void;
  userRole: string;
  setUserRole: (val: string) => void;
  userCompanyCode: string;
  setUserCompanyCode: (val: string) => void;
  userParentId: string;
  setUserParentId: (val: string) => void;
  userDepartment: string;
  setUserDepartment: (val: string) => void;
  userHeyGenAvatarIds: string;
  setUserHeyGenAvatarIds: (val: string) => void;
  userHeyGenVoiceId: string;
  setUserHeyGenVoiceId: (val: string) => void;
  userHeyGenApiKey: string;
  setUserHeyGenApiKey: (val: string) => void;
  getAvailableRoles: () => Array<{ role: string; displayName: string; level: number }>;
  userProfile: UserProfile | null;
  companies: CompanyProfile[];
  usersList: UserProfile[];
  onSubmit: (e: React.FormEvent) => void;
  submittingUser: boolean;
  parseAvatarIdsInput: (input: string) => string[];
}

export function UserFormModal({
  open,
  onClose,
  editingUser,
  userDisplayName,
  setUserDisplayName,
  userEmail,
  setUserEmail,
  userPassword,
  setUserPassword,
  userRole,
  setUserRole,
  userCompanyCode,
  setUserCompanyCode,
  userParentId,
  setUserParentId,
  userDepartment,
  setUserDepartment,
  userHeyGenAvatarIds,
  setUserHeyGenAvatarIds,
  userHeyGenVoiceId,
  setUserHeyGenVoiceId,
  userHeyGenApiKey,
  setUserHeyGenApiKey,
  getAvailableRoles,
  userProfile,
  companies,
  usersList,
  onSubmit,
  submittingUser,
}: UserFormModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center relative shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-650 rounded-xl shadow-lg shadow-indigo-500/20">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider font-sans">
                {editingUser ? "Sửa thông tin người dùng" : "Thêm người dùng mới"}
              </h3>
              <p className="text-[10px] text-slate-350 font-mono mt-0.5">
                {editingUser ? "Cập nhật hồ sơ, quyền hạn và công ty của tài khoản" : "Tạo tài khoản và gán doanh nghiệp"}
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

        {/* Modal Content / Form */}
        <form onSubmit={onSubmit} className="flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Họ và Tên */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 text-left sm:col-span-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Họ và Tên *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={userDisplayName}
                    onChange={(e) => setUserDisplayName(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Địa chỉ Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono font-medium"
                  />
                </div>
              </div>

              {/* Mật khẩu */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Mật khẩu *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    required={!editingUser}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  {editingUser && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Để trống nếu không cần đổi mật khẩu.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Quyền hạn */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Quyền hạn *</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 bg-white cursor-pointer outline-none"
                >
                  {getAvailableRoles().map((r, index) => (
                    <option key={`${r.role}-${index}`} value={r.role}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Doanh nghiệp */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Doanh nghiệp *</label>
                {userProfile?.role === "superadmin" ? (
                  <select
                    value={userCompanyCode}
                    onChange={(e) => setUserCompanyCode(e.target.value)}
                    className="w-full p-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 bg-white cursor-pointer outline-none"
                  >
                    <option value="SYSTEM">Hệ thống (SYSTEM)</option>
                    {companies.map((c) => (
                      <option key={c.id || c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={userProfile?.companyName || userProfile?.companyCode || ""}
                    className="w-full px-3.5 py-2 border border-gray-150 bg-gray-50 text-gray-500 rounded-xl text-xs outline-none"
                  />
                )}
              </div>
            </div>

            {/* Người quản lý trực tiếp */}
            {userCompanyCode && userCompanyCode !== "SYSTEM" && userRole === "user" && (
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  Người quản lý trực tiếp
                  <span className="ml-1.5 font-normal normal-case text-gray-400">(tự chọn — xác định cấp bậc trong sơ đồ nhân sự)</span>
                </label>
                {(() => {
                  const eligibleManagers = usersList.filter(
                    (u) => u.companyCode === userCompanyCode && u.role === "manager"
                  );
                  return eligibleManagers.length === 0 ? (
                    <div className="w-full px-3.5 py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 italic bg-gray-50/60">
                      Chưa có quản lý nào trong công ty này
                    </div>
                  ) : (
                    <div>
                      <select
                        value={userParentId}
                        onChange={(e) => setUserParentId(e.target.value)}
                        className="w-full p-2 pl-3.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 bg-white cursor-pointer outline-none"
                      >
                        <option value="">— Không có / Chọn sau —</option>
                        {eligibleManagers.map((mgr) => (
                          <option key={mgr.uid} value={mgr.uid}>
                            {`${mgr.displayName} (Manager${mgr.jobTitle ? " · " + mgr.jobTitle : ""}${mgr.department ? " · " + mgr.department : ""})`}
                          </option>
                        ))}
                      </select>
                      {userParentId && (
                        <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg w-max">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">Cấp bậc nhân viên mới:</span>
                          <span className="text-[10px] font-bold text-indigo-700 font-mono">
                            Level {(() => {
                              const rawL = (usersList.find((u) => u.uid === userParentId)?.level ?? 0) + 1;
                              return userProfile?.role === "superadmin" ? rawL : rawL - 1;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Phòng ban */}
            {(userRole === "user" || userRole === "manager") && (
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  {userRole === "manager" ? "Phòng ban quản lý *" : "Phòng ban *"}
                </label>
                <input
                  type="text"
                  required
                  disabled={userRole === "user" && !!userParentId}
                  placeholder="Ví dụ: Phòng Kỹ Thuật"
                  value={userDepartment}
                  onChange={(e) => setUserDepartment(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-gray-50 disabled:text-gray-450"
                />
                {userRole === "user" && !!userParentId && (
                  <p className="text-[10px] text-indigo-650 font-mono mt-0.5">
                    Tự động điền theo phòng ban của quản lý trực tiếp.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/30 p-4 space-y-3 text-left">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-800">Cấu hình HeyGen của Thành viên</p>
                <p className="mt-1 text-[11px] text-cyan-900/70">
                  Nhập khóa API HeyGen riêng nếu muốn tài khoản này hoạt động độc lập với tài khoản của doanh nghiệp.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Khóa API HeyGen (Override)
                </label>
                <input
                  type="text"
                  placeholder="Để trống nếu muốn sử dụng tài khoản HeyGen mặc định của doanh nghiệp"
                  value={userHeyGenApiKey}
                  onChange={(e) => setUserHeyGenApiKey(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 justify-end p-6 border-t border-gray-100 bg-white shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submittingUser}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submittingUser ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Đang đăng ký...
                </>
              ) : (
                "Lưu người dùng"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
