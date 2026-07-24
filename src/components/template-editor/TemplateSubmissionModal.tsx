import React, { useState } from 'react';
import { X, Send, CheckCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../pages/Toast';

interface TemplateSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
}

export function TemplateSubmissionModal({ isOpen, onClose, projectTitle }: TemplateSubmissionModalProps) {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'superadmin';

  const [category, setCategory] = useState('sales');
  const [description, setDescription] = useState('Mẫu video quảng cáo thời trang ngắn xu hướng TikTok 2026.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      if (isAdmin) {
        toast.success(`Đã xuất bản mẫu video "${projectTitle}" lên thư viện dùng chung!`);
      } else {
        toast.success(`Đã gửi mẫu "${projectTitle}" làm bản nháp. Trạng thái: Đang chờ admin duyệt.`);
      }
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            {isAdmin ? 'Xuất Bản Mẫu Hệ Thống' : 'Gửi Mẫu Video Để Duyệt'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">Tên mẫu video</label>
            <input
              type="text"
              disabled
              value={projectTitle}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">Danh mục phân loại</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              <option value="sales">Bán hàng</option>
              <option value="product_review">Review sản phẩm</option>
              <option value="tiktok">TikTok Trend</option>
              <option value="education">Giáo dục</option>
              <option value="vlog">Vlog</option>
              <option value="promo">Khuyến mãi</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">Mô tả mẫu</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isAdmin ? (
                <>
                  <CheckCircle className="h-4 w-4" /> Xuất bản ngay
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Gửi duyệt
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
