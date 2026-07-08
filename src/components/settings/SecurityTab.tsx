import React, { useState } from "react";
import { Lock, Key, Eye, EyeOff } from "lucide-react";
import { authService } from "../../services/authService";
import { toast } from "../../pages/Toast";

export default function SecurityTab() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      toast.error("Mật khẩu mới không được để trống!");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới phải chứa ít nhất 6 ký tự!");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    setUpdatingPassword(true);
    try {
      await authService.changePassword(newPassword);
      toast.success("Thay đổi mật khẩu thành công!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Thay đổi mật khẩu thất bại. Vui lòng thử lại.");
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-2xl p-6 shadow-xs">
      <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
        <Lock className="h-5 w-5 text-amber-500" />
        Thay đổi mật khẩu tài khoản
      </h3>

      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mật khẩu mới *</label>
            <div className="relative">
              <Key className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập tối thiểu 6 ký tự"
                className="w-full pl-11 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Xác nhận mật khẩu mới *</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={updatingPassword}
            className="px-5 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 flex items-center gap-2 cursor-pointer"
          >
            <Lock className="h-4 w-4" />
            <span>{updatingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
