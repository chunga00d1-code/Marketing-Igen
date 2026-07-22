import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, Video, Layers, Zap, Check, Eye } from "lucide-react";

interface IdeationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IdeationGuideModal({ isOpen, onClose }: IdeationGuideModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const steps = [
    {
      title: "Bước 1: Mô tả mục tiêu chiến dịch",
      subtitle: "Khởi động ý tưởng chiến dịch tiếp thị",
      icon: <Sparkles className="h-6 w-6 text-indigo-600 animate-pulse" />,
      colorClass: "from-indigo-500/10 to-blue-500/10 text-indigo-700 border-indigo-150",
      accentBg: "bg-indigo-50",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Nhập mô tả ngắn gọn về chương trình khuyến mãi, sự kiện hoặc sản phẩm bạn muốn quảng bá vào ô nhập liệu (ví dụ: <span className="italic font-semibold text-slate-800">"Khởi động ra mắt bàn phím cơ Workspace V2, chiết khấu 10%"</span>).
          </p>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3.5 space-y-2">
            <h5 className="text-[11px] font-bold text-indigo-850 uppercase tracking-wider font-mono flex items-center gap-1.5">
              💡 Mẹo nhỏ cho bạn:
            </h5>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
              <li>Bạn có thể đính kèm file tài liệu (<span className="font-semibold text-indigo-700">PDF, Word, TXT, MD</span>) để AI đọc và trích xuất dữ liệu chính xác nhất.</li>
              <li>Đính kèm thêm <span className="font-semibold text-indigo-700">hình ảnh sản phẩm</span> để trợ lý AI tham chiếu trực quan.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      title: "Bước 2: Chọn nền tảng & Loại Media",
      subtitle: "Tiếp cận khách hàng đúng kênh & hình thức",
      icon: <Video className="h-6 w-6 text-amber-600 animate-bounce" />,
      colorClass: "from-amber-500/10 to-orange-500/10 text-amber-700 border-amber-150",
      accentBg: "bg-amber-50",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Lựa chọn kênh đăng tải và định dạng truyền thông phù hợp để thu hút sự chú ý tối đa của khách hàng:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="p-3 border border-slate-100 bg-slate-50/60 rounded-xl">
              <span className="text-xs font-bold text-slate-850 block mb-1">📢 Chọn nền tảng:</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Tích hợp sẵn <span className="font-semibold text-slate-700">Facebook</span> và <span className="font-semibold text-slate-700">TikTok</span>. Bạn có thể chọn đăng song song cả hai kênh.
              </p>
            </div>
            <div className="p-3 border border-slate-100 bg-slate-50/60 rounded-xl">
              <span className="text-xs font-bold text-slate-850 block mb-1">🎨 Chọn loại Media:</span>
              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                Linh hoạt giữa <span className="font-semibold text-slate-700">Hình ảnh AI</span>, <span className="font-semibold text-slate-700">Video AI</span> ngắn, hoặc độc đáo nhất là <span className="font-semibold text-slate-700">Video người ảo AI</span> tự động đọc lời thoại.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Bước 3: Định hướng Content Pillars",
      subtitle: "Bố cục chiến dịch cân bằng, không nhàm chán",
      icon: <Layers className="h-6 w-6 text-teal-650" />,
      colorClass: "from-teal-500/10 to-emerald-500/10 text-teal-700 border-teal-150",
      accentBg: "bg-teal-50",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Một chiến dịch tiếp thị hiệu quả cần sự đa dạng nội dung. Sau khi nhấn <span className="font-bold text-indigo-700">"Phân tích Mục tiêu AI"</span>, hệ thống sẽ đề xuất 3 trụ cột nội dung:
          </p>
          <div className="rounded-2xl border border-teal-100 bg-teal-50/30 p-3.5 space-y-2">
            <div className="flex gap-2 items-start text-xs">
              <span className="w-4 h-4 rounded-full bg-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800">Trụ cột A: Educate & Guides</span> (35%): Chia sẻ kiến thức, hướng dẫn có ích cho người đọc.
              </div>
            </div>
            <div className="flex gap-2 items-start text-xs">
              <span className="w-4 h-4 rounded-full bg-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800">Trụ cột B: Storytelling & Social Proof</span> (40%): Câu chuyện khách hàng thực tế và đánh giá uy tín.
              </div>
            </div>
            <div className="flex gap-2 items-start text-xs">
              <span className="w-4 h-4 rounded-full bg-indigo-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800">Trụ cột C: Offers & Promotions</span> (25%): Ưu đãi khẩn cấp kích thích mua hàng ngay.
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            👉 Bạn có thể bật/tắt hoặc bấm "Đổi trụ cột" để AI tạo phương án mới phù hợp hơn.
          </p>
        </div>
      )
    },
    {
      title: "Bước 4: Chạy Tự động với Auto-pilot",
      subtitle: "Vận hành chiến dịch chỉ bằng 1-Click chuột",
      icon: <Zap className="h-6 w-6 text-purple-650" />,
      colorClass: "from-purple-500/10 to-pink-500/10 text-purple-700 border-purple-150",
      accentBg: "bg-purple-50",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Nếu bạn bận rộn và không có thời gian duyệt từng bài viết, hãy kích hoạt công nghệ <span className="font-extrabold text-purple-700">Tự động hoàn toàn (Auto-pilot)</span>:
          </p>
          <div className="p-3.5 border border-purple-100 bg-purple-50/20 rounded-2xl space-y-2">
            <div className="flex gap-2.5 items-start">
              <span className="p-1 rounded-lg bg-purple-100 text-purple-700 font-mono text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <p className="text-xs text-slate-700"><span className="font-bold">Lên ý tưởng & Viết bài tự động:</span> AI tự động sinh các bản thảo chi tiết.</p>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="p-1 rounded-lg bg-purple-100 text-purple-700 font-mono text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <p className="text-xs text-slate-700"><span className="font-bold">Thiết kế ảnh & video AI:</span> Tự động tạo phương tiện truyền thông chạy nền.</p>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="p-1 rounded-lg bg-purple-100 text-purple-700 font-mono text-[10px] font-bold shrink-0 mt-0.5">3</span>
              <p className="text-xs text-slate-700"><span className="font-bold">Đặt lịch hoặc đăng ngay:</span> Tự kết nối social và đăng bài theo thời gian định trước.</p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem("igen_ideation_guide_seen", "true");
    } else {
      localStorage.removeItem("igen_ideation_guide_seen");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl flex flex-col justify-between max-h-[90vh]">
        
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-white border border-slate-200/60 flex items-center justify-center shadow-xs">
              <Eye className="h-5 w-5 text-indigo-650" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-850">Hướng dẫn Lên ý tưởng</h3>
              <p className="text-[10px] text-gray-500 font-mono tracking-wider uppercase font-semibold">Tạo chiến dịch tiếp thị đơn giản cùng iGen AI</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-gray-400 hover:bg-white hover:text-gray-700 transition-colors shadow-2xs border border-transparent hover:border-slate-100"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 pt-5 shrink-0">
          <div className="flex items-center justify-between gap-1 text-[10px] font-mono font-bold text-indigo-600 mb-2">
            <span>TIẾN TRÌNH HƯỚNG DẪN</span>
            <span>BƯỚC {currentStep + 1} / {steps.length}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
            {steps.map((_, idx) => (
              <div
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-full flex-1 rounded-full cursor-pointer transition-all duration-300 ${
                  idx <= currentStep ? "bg-indigo-600" : "bg-slate-200/80 hover:bg-slate-300"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 md:py-6">
          <div className="flex flex-col gap-4">
            
            {/* Step banner card */}
            <div className={`p-4 rounded-2xl border bg-gradient-to-br ${steps[currentStep].colorClass} flex items-start gap-3.5`}>
              <div className={`h-12 w-12 rounded-xl ${steps[currentStep].accentBg} border border-white flex items-center justify-center shadow-sm shrink-0`}>
                {steps[currentStep].icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-extrabold text-slate-850 tracking-tight">{steps[currentStep].title}</h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{steps[currentStep].subtitle}</p>
              </div>
            </div>

            {/* Custom Step Content */}
            <div className="mt-1 min-h-[140px] flex flex-col justify-center">
              {steps[currentStep].content}
            </div>

          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 bg-slate-50/50">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4.5 w-4.5 rounded-lg border-slate-300 text-indigo-650 focus:ring-indigo-500/20 cursor-pointer"
            />
            <span className="text-[11.5px] font-medium text-slate-500">Không hiển thị lại hướng dẫn này</span>
          </label>

          <div className="flex items-center justify-end gap-2.5">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer shadow-3xs"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-650 hover:bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/10 active:scale-95 transition-all cursor-pointer"
            >
              {currentStep === steps.length - 1 ? (
                <>
                  <Check className="h-4 w-4" />
                  Bắt đầu ngay
                </>
              ) : (
                <>
                  Tiếp theo
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
