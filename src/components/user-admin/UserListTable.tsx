import { MoreVertical, Pencil, Shield, Trash2, Wallet } from "lucide-react";
import { UserTableProps } from "./types";

export function UserListTable({
  users,
  currentUser,
  rolePermissionsList,
  balanceByUserId,
  userPage,
  totalUserPages,
  onPageChange,
  getAvailableRoles,
  onRoleChange,
  openActionMenuId,
  onToggleActionMenu,
  onEditUser,
  onDeleteUser,
  onOpenBalance,
  setActiveTab,
}: UserTableProps) {
  return (
    <div className="max-w-full rounded-2xl border border-gray-150 bg-white shadow-xs" style={{ overflow: "clip" }}>
      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1180px] border-collapse text-left font-sans text-xs">
          <thead>
            <tr className="border-b border-gray-150 bg-gray-50 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <th className="p-4 pl-6">Thành viên</th>
              <th className="p-4">Địa chỉ email</th>
              {currentUser?.role === "superadmin" && <th className="p-4">Doanh nghiệp</th>}
              <th className="p-4">Ngày đăng ký</th>
              <th className="p-4">Quyền hạn (role)</th>
              {currentUser?.role === "superadmin" && <th className="p-4">Số dư</th>}
              <th className="p-4">HeyGen</th>
              <th className="p-4 pr-6 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-slate-700">
            {users.map((usr) => {
              const isSelf = usr.uid === currentUser?.uid;
              const userBalance = balanceByUserId[usr.uid];
              return (
                <tr key={usr.uid} className="transition-colors hover:bg-slate-50/40">
                  <td className="flex items-center gap-3 p-4 pl-6">
                    {usr.photoURL && (usr.photoURL.startsWith("http") || usr.photoURL.startsWith("/")) ? (
                      <img src={usr.photoURL} alt={usr.displayName} className="h-8 w-8 rounded-full border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-700">
                        {(usr.displayName || usr.email || "US").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                        {usr.displayName}
                        {isSelf && (
                          <span className="rounded-sm border border-blue-150 bg-blue-50 px-1.5 py-0.5 font-mono text-[8px] font-bold text-blue-700">
                            BẠN
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-gray-400">UID: {usr.uid.slice(0, 8)}...</span>
                    </div>
                  </td>
                  <td className="p-4 font-mono">{usr.email}</td>
                  {currentUser?.role === "superadmin" && (
                    <td className="p-4 font-semibold text-slate-700">
                      {usr.companyName ? (
                        <span title={usr.companyCode}>{usr.companyName}</span>
                      ) : (
                        <span className="italic text-gray-400">Hệ thống ({usr.companyCode || "SYSTEM"})</span>
                      )}
                    </td>
                  )}
                  <td className="p-4 font-mono text-gray-400">
                    {usr.createdAt ? new Date(usr.createdAt).toLocaleDateString("vi-VN") : "Hôm nay"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`flex w-max items-center gap-1.5 rounded-full px-2.5 py-0.75 font-mono text-[9px] font-bold uppercase tracking-wider ${
                        usr.role === "superadmin"
                          ? "border border-rose-200 bg-rose-50 text-rose-800"
                          : usr.role === "admin"
                            ? "border border-amber-200 bg-amber-50 text-amber-800"
                            : usr.role === "manager"
                              ? "border border-blue-200 bg-blue-50 text-blue-800"
                              : usr.role === "user"
                                ? "border border-slate-200 bg-slate-50 text-slate-600"
                                : "border border-indigo-200 bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      <Shield className="h-3 w-3" />
                      {usr.role === "user" ? "user" : rolePermissionsList.find((rp) => rp.role === usr.role)?.displayName || usr.role}
                    </span>
                  </td>
                  {currentUser?.role === "superadmin" && (
                    <td className="min-w-[170px] p-4">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenBalance(usr, userBalance);
                            setActiveTab("balance");
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-sky-900 transition hover:bg-sky-100"
                        >
                          <Wallet className="h-3.5 w-3.5 text-sky-600" />
                          <span className="text-xs font-bold">
                            {new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(userBalance?.balance || 0)} Credit
                          </span>
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-[9px] font-semibold text-cyan-800 uppercase tracking-wider">
                          Theo công ty
                        </span>
                        <div className="group relative flex cursor-help items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 h-4 w-4">
                          <span className="text-[10px] font-bold">i</span>
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-52 -translate-x-1/2 scale-95 rounded-lg bg-slate-900 p-2.5 text-[10px] font-normal leading-relaxed text-white opacity-0 shadow-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
                            Avatar và voice được lấy từ account HeyGen của doanh nghiệp.
                            <div className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1 bg-slate-900 rotate-45" />
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[9px] text-slate-400">Mã: {usr.companyCode || "SYSTEM"}</span>
                    </div>
                  </td>
                  <td className="p-4 pr-6">
                    <div className="flex items-center justify-end gap-3">
                      <select
                        disabled={isSelf || usr.role === "superadmin" || (usr.role === "admin" && currentUser?.role === "admin")}
                        value={usr.role}
                        onChange={(e) => onRoleChange(usr.uid, usr.displayName, e.target.value as any)}
                        className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-indigo-500 ${
                          isSelf || usr.role === "superadmin" || (usr.role === "admin" && currentUser?.role === "admin")
                            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-50"
                            : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300"
                        }`}
                      >
                        {[
                          ...getAvailableRoles(),
                          ...(!getAvailableRoles().some((r) => r.role === usr.role) ? [{ role: usr.role, displayName: usr.role.toUpperCase(), level: 99 }] : []),
                        ].map((r, index) => (
                          <option key={`${usr.uid}-${r.role}-${index}`} value={r.role}>
                            {r.displayName}
                          </option>
                        ))}
                      </select>

                      <div className="relative" data-action-menu>
                        <button
                          type="button"
                          onClick={() => onToggleActionMenu(usr.uid)}
                          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition hover:bg-gray-50"
                          title="Thao tác"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {openActionMenuId === usr.uid && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                            <button
                              type="button"
                              onClick={() => onEditUser(usr)}
                              disabled={usr.role === "superadmin" && !isSelf && currentUser?.role !== "superadmin"}
                              className="flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5 text-indigo-600" />
                              Sửa thông tin
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteUser(usr)}
                              disabled={isSelf || usr.role === "superadmin"}
                              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              Xóa tài khoản
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-[11px] text-slate-500">
          Trang {userPage} / {totalUserPages} · Hiển thị {users.length} tài khoản
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange((prev) => Math.max(1, Number(prev) - 1))}
            disabled={userPage === 1}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Trang trước
          </button>
          {Array.from({ length: totalUserPages }, (_, index) => index + 1)
            .slice(Math.max(0, userPage - 3), Math.min(totalUserPages, userPage + 2))
            .map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                className={`h-9 min-w-9 rounded-xl px-3 text-[11px] font-bold transition ${
                  page === userPage ? "bg-slate-900 text-white" : "border border-gray-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            ))}
          <button
            type="button"
            onClick={() => onPageChange((prev) => Math.min(totalUserPages, Number(prev) + 1))}
            disabled={userPage === totalUserPages}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Trang sau
          </button>
        </div>
      </div>
    </div>
  );
}
