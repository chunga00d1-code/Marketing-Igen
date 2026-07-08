import React from "react";
import { SlidersHorizontal, X, RefreshCw } from "lucide-react";
import { UserProfile } from "../../types";

export interface HeyGenModalProps {
  open: boolean;
  onClose: () => void;
  editingHeyGenUser: UserProfile | null;
  editingHeyGenAvatarIds: string;
  setEditingHeyGenAvatarIds: (val: string) => void;
  editingHeyGenVoiceId: string;
  setEditingHeyGenVoiceId: (val: string) => void;
  editingHeyGenApiKey: string;
  setEditingHeyGenApiKey: (val: string) => void;
  savingHeyGenAccess: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function HeyGenModal({
  open,
  onClose,
  editingHeyGenUser,
  editingHeyGenAvatarIds,
  setEditingHeyGenAvatarIds,
  editingHeyGenVoiceId,
  setEditingHeyGenVoiceId,
  editingHeyGenApiKey,
  setEditingHeyGenApiKey,
  savingHeyGenAccess,
  onSubmit,
}: HeyGenModalProps) {
  if (!open || !editingHeyGenUser) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
        <div className="bg-cyan-600 text-white p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl">
              <SlidersHorizontal className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm uppercase tracking-wider font-sans">
                Cấu hình HeyGen cho người dùng
              </h3>
              <p className="text-[10px] text-cyan-100 font-mono mt-0.5">
                {editingHeyGenUser.displayName} · {editingHeyGenUser.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-cyan-500 rounded-lg text-cyan-100 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/30 p-4 space-y-3">
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
                  value={editingHeyGenApiKey}
                  onChange={(e) => setEditingHeyGenApiKey(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
                />
              </div>
            </div>
          </div>

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
              disabled={savingHeyGenAccess}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-600/10 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {savingHeyGenAccess ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Lưu cấu hình HeyGen"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
