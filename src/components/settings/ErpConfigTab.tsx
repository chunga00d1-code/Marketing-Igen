import React, { useState } from "react";
import { Sliders, Moon, Sun, Bell, Sparkles, Laptop } from "lucide-react";
import { toast } from "../../pages/Toast";
import { AI_REPLY_PRIMARY_MODEL, AI_REPLY_FALLBACK_MODEL } from "../../../shared/ai-reply-models";

export default function ErpConfigTab() {
  const [darkMode, setDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);

  return (
    <div className="bg-white/80 backdrop-blur-md border border-gray-200/80 rounded-2xl p-6 shadow-xs space-y-6">
      {/* Preferences Section */}
      <div>
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
          <Sliders className="h-5 w-5 text-purple-500" />
          Cài đặt hiển thị & Thông báo
        </h3>

        <div className="space-y-4">
          {/* Dark Mode toggle simulation */}
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${darkMode ? "bg-slate-800 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
                {darkMode ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
              </div>
              <div className="text-left">
                <h4 className="text-xs font-bold text-gray-800">Chế độ giao diện tối (Dark Mode)</h4>
                <p className="text-[10px] text-gray-500 mt-0.5">Tiết kiệm pin và bảo vệ mắt vào ban đêm.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => {
                  setDarkMode(e.target.checked);
                  toast.success(e.target.checked ? "Đã chuyển sang giao diện tối (Giả lập)" : "Đã chuyển sang giao diện sáng (Giả lập)");
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* Email notification toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Bell className="h-4.5 w-4.5" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-bold text-gray-800">Nhận thông báo qua Email</h4>
                <p className="text-[10px] text-gray-500 mt-0.5">Nhận các báo cáo tóm tắt hàng ngày qua email đăng ký.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => {
                  setEmailNotifications(e.target.checked);
                  toast.success(e.target.checked ? "Đã bật thông báo qua email" : "Đã tắt thông báo qua email");
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* AI Copilot & Data Settings */}
      <div>
        <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          Mô hình Trợ lý AI & Dữ liệu
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 text-left">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mô hình AI Auto-Reply</label>
            <input
              value={AI_REPLY_PRIMARY_MODEL}
              readOnly
              aria-label="Model AI Auto-Reply chính"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800"
            />
            <p className="text-[10px] text-gray-500">Dự phòng khi model chính lỗi: {AI_REPLY_FALLBACK_MODEL}. Áp dụng thống nhất cho mọi tài khoản.</p>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-150 rounded-xl mt-4 md:mt-0 text-left">
            <div className="flex items-center gap-2.5">
              <Laptop className="h-4.5 w-4.5 text-gray-500" />
              <div>
                <h4 className="text-[11px] font-bold text-gray-800">Auto-Backup Dữ liệu</h4>
                <p className="text-[9px] text-gray-400">Sao lưu tự động sang Firestore</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={(e) => setAutoBackup(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
