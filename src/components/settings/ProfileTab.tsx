import React, { useState } from "react";
import { User, Mail, Save } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../pages/Toast";

export default function ProfileTab() {
  const { userProfile, updateProfileInfo } = useAuth();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || "");
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("Họ và tên không được để trống!");
      return;
    }
    setUpdatingProfile(true);
    try {
      await updateProfileInfo(displayName, userProfile?.photoURL || "");
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingProfile(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-2xl p-6 shadow-xs">
      <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
        <User className="h-5 w-5 text-blue-500" />
        Cập nhật thông tin hồ sơ
      </h3>

      <form onSubmit={handleUpdateProfile} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Họ và Tên *</label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Họ và tên của bạn"
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Địa chỉ Email (Không được đổi)</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-300" />
              <input
                type="email"
                disabled
                value={userProfile?.email || ""}
                className="w-full pl-11 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-xs text-gray-400 outline-none cursor-not-allowed select-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={updatingProfile}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 flex items-center gap-2 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>{updatingProfile ? "Đang lưu..." : "Lưu thay đổi"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
