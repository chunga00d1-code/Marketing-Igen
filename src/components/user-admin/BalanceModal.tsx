import React from "react";
import { Wallet, X, RefreshCw } from "lucide-react";
import { AdminUserBalance } from "../../services/walletService";

export interface BalanceModalProps {
  open: boolean;
  onClose: () => void;
  editingBalanceUser: AdminUserBalance | null;
  balanceAction: "add" | "subtract";
  setBalanceAction: (action: "add" | "subtract") => void;
  newBalanceValue: string;
  setNewBalanceValue: (val: string) => void;
  balanceNote: string;
  setBalanceNote: (val: string) => void;
  submittingBalance: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function BalanceModal({
  open,
  onClose,
  editingBalanceUser,
  balanceAction,
  setBalanceAction,
  newBalanceValue,
  setNewBalanceValue,
  balanceNote,
  setBalanceNote,
  submittingBalance,
  onSubmit,
}: BalanceModalProps) {
  if (!open || !editingBalanceUser) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-[440px] w-full overflow-hidden transform transition-all scale-100 flex flex-col">
        <div className="bg-emerald-600 text-white px-5 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-lg">
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider font-sans">
                {balanceAction === "add" ? "Cộng số dư người dùng" : "Trừ số dư người dùng"}
              </h3>
              <p className="mt-0.5 text-[11px] text-emerald-100">
                {editingBalanceUser.displayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-emerald-500 rounded-md text-emerald-100 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col">
          <div className="p-5 space-y-3.5 text-left">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBalanceAction("add")}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  balanceAction === "add"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-gray-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">Tác vụ</div>
                <div className="mt-0.5 text-sm font-bold">+ Cộng</div>
              </button>
              <button
                type="button"
                onClick={() => setBalanceAction("subtract")}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  balanceAction === "subtract"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-gray-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">Tác vụ</div>
                <div className="mt-0.5 text-sm font-bold">- Trừ</div>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Số dư hiện tại</div>
                <div className="mt-1 text-lg font-bold text-slate-800">
                  {new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(editingBalanceUser.balance || 0)} Credit
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sau điều chỉnh</div>
                <div className="mt-1 text-lg font-bold text-slate-800">
                  {new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
                    Math.max(
                      0,
                      Number(
                        (
                          Number(editingBalanceUser.balance || 0) +
                          (balanceAction === "add" ? 1 : -1) * (Number(newBalanceValue || 0) || 0)
                        ).toFixed(2)
                      )
                    )
                  )} Credit
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Số tiền {balanceAction === "add" ? "cộng thêm" : "trừ đi"} (Credit)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newBalanceValue}
                onChange={(e) => setNewBalanceValue(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Ghi chú nội bộ</label>
              <textarea
                value={balanceNote}
                onChange={(e) => setBalanceNote(e.target.value)}
                rows={2}
                placeholder="Ví dụ: cấp bổ sung công nợ, tăng thưởng, điều chỉnh sau đối soát..."
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-100 bg-gray-50/70">
            <button
              type="button"
              onClick={onClose}
              className="min-w-[94px] px-4 py-2 border border-gray-200 bg-white rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submittingBalance}
              className="min-w-[150px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submittingBalance ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                balanceAction === "add" ? "Xác nhận cộng tiền" : "Xác nhận trừ tiền"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
