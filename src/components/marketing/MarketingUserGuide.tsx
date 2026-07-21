import React, { useState } from "react";
import {
  Rocket,
  Sparkles,
  Layers,
  Calendar,
  Palette,
  BarChart3,
  MessageSquare,
  Video,
  Settings,
  HelpCircle,
  ArrowRight,
  Search,
  BookOpen
} from "lucide-react";

interface StepperItem {
  number: number;
  title: string;
  path: string;
}

const STEPPER_ITEMS: StepperItem[] = [
  {
    number: 1,
    title: "1. Ý tưởng & Mô tả",
    path: "/marketing",
  },
  {
    number: 2,
    title: "2. Tài liệu & Ảnh",
    path: "/marketing",
  },
  {
    number: 3,
    title: "3. Lịch đăng bài",
    path: "/marketing",
  },
  {
    number: 4,
    title: "4. Tự động CSKH",
    path: "/sales-crm",
  },
];

export default function MarketingUserGuide() {
  const [activeMenuId, setActiveMenuId] = useState<string>("quick-start");
  const [searchTerm, setSearchTerm] = useState("");

  const navigateTo = (path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new Event("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    setActiveMenuId(id);
    const element = document.getElementById(`section-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const menuItems = [
    { id: "quick-start", label: "🚀 Quy trình 4 bước nhanh", icon: Rocket },
    { id: "s1-campaign", label: "1. Ý tưởng & Tạo bài AI", icon: Sparkles },
    { id: "s2-approval", label: "2. Duyệt bài & MC ảo", icon: Layers },
    { id: "s3-calendar", label: "3. Lịch đăng & Link tháng", icon: Calendar },
    { id: "s4-studio", label: "4. Xưởng ảnh & Voice AI", icon: Palette },
    { id: "s5-short", label: "5. Xưởng Video Ngắn", icon: Video },
    { id: "s6-crm", label: "6. Quản lý khách & CSKH", icon: MessageSquare },
    { id: "s7-analytics", label: "7. Báo cáo hiệu suất", icon: BarChart3 },
    { id: "s8-settings", label: "8. Cài đặt & Ví tiền", icon: Settings },
    { id: "s9-faq", label: "❓ Hỏi đáp ngắn", icon: HelpCircle },
  ];

  const filteredMenuItems = menuItems.filter((item) =>
    searchTerm.trim() === "" || item.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto pb-20 font-sans text-slate-800" id="user_guide_layout">
      
      {/* CỘT TRÁI: MENU DANH MỤC TỐI GIẢN */}
      <aside className="w-full lg:w-64 shrink-0 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs sticky top-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">DANH MỤC HƯỚNG DẪN</span>
            <BookOpen className="h-4 w-4 text-slate-400" />
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mục..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition"
            />
          </div>

          <nav className="space-y-1">
            {filteredMenuItems.map((item) => {
              const isActive = activeMenuId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isActive
                      ? "bg-cyan-50 text-cyan-800 font-bold border border-cyan-200 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? "bg-cyan-600" : "bg-slate-300"}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* CỘT PHẢI: CHI TIẾT TỐI GIẢN (CLEAN & SHORT) */}
      <main className="flex-1 min-w-0 space-y-5">

        {/* STEPPER NHƯ ẢNH MẪU */}
        <section id="section-quick-start" className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-cyan-600" />
              <h2 className="text-sm font-bold text-slate-800">Quy trình vận hành 4 bước</h2>
            </div>
            <span className="text-[11px] text-slate-400">Bấm để mở trang</span>
          </div>

          {/* Thanh quy trình dạng Pill kết nối */}
          <div className="flex flex-col md:flex-row items-center gap-3 overflow-x-auto pb-1">
            {STEPPER_ITEMS.map((item, idx) => (
              <React.Fragment key={item.number}>
                <div
                  onClick={() => navigateTo(item.path)}
                  className={`flex-1 w-full border rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                    idx === 0
                      ? "border-cyan-400 bg-cyan-50/50 shadow-2xs hover:border-cyan-500"
                      : "border-slate-200/90 bg-white hover:border-cyan-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                      idx === 0 ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {item.number}
                  </div>
                  <span className={`text-xs font-bold truncate ${idx === 0 ? "text-cyan-900" : "text-slate-800"}`}>
                    {item.title}
                  </span>
                </div>
                {idx < STEPPER_ITEMS.length - 1 && (
                  <div className="h-[2px] w-4 bg-slate-200 shrink-0 hidden md:block" />
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* 1. Ý TƯỞNG & TẠO BÀI AI */}
        <section id="section-s1-campaign" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">1. Ý tưởng & Tạo chiến dịch 30 bài AI</h3>
            </div>
            <button onClick={() => navigateTo("/marketing")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600 space-y-2">
            <p><strong className="text-slate-800">Mục tiêu:</strong> Tự động lên kế hoạch nội dung truyền thông cho cả tháng trong 30 giây.</p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
              <p>• <strong>Bước 1:</strong> Vào mục Marketing -&gt; Chọn <strong>"Lên ý tưởng AI"</strong>.</p>
              <p>• <strong>Bước 2:</strong> Nhập mô tả sản phẩm (Ví dụ: <em>"Quảng cáo khóa học tiếng Anh giao tiếp"</em>).</p>
              <p>• <strong>Bước 3:</strong> Bấm <strong>"Tạo chiến dịch AI"</strong> để sinh danh sách 30 bài viết.</p>
            </div>
          </div>
        </section>

        {/* 2. DUYỆT BÀI & MC ẢO */}
        <section id="section-s2-approval" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">2. Duyệt bài viết & Tạo Media AI (Ảnh / MC ảo)</h3>
            </div>
            <button onClick={() => navigateTo("/marketing")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600 space-y-2">
            <p><strong className="text-slate-800">Mục tiêu:</strong> Kiểm tra nội dung bài viết, vẽ ảnh minh họa hoặc xuất Video có MC ảo nói.</p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
              <p>• <strong>Sinh ảnh AI:</strong> Bấm nút <em>"Sinh ảnh AI"</em> bên cạnh bài viết để tạo ảnh chuẩn nét.</p>
              <p>• <strong>Tạo Video MC:</strong> Bấm <em>"Tạo Video AI"</em> -&gt; Chọn MC ảo -&gt; Xuất video giọng đọc mượt mà.</p>
            </div>
          </div>
        </section>

        {/* 3. LỊCH ĐĂNG & DUYỆT THÁNG */}
        <section id="section-s3-calendar" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">3. Quản lý lịch đăng & Chia sẻ link duyệt tháng</h3>
            </div>
            <button onClick={() => navigateTo("/marketing")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600 space-y-2">
            <p><strong className="text-slate-800">Mục tiêu:</strong> Quản lý bài theo ngày/tháng và gửi đường link công khai cho Sếp duyệt nhanh 1-Click.</p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              • Bấm <strong>"Chia sẻ trang duyệt tháng"</strong> -&gt; Gửi đường link qua Zalo cho Sếp duyệt trực tiếp trên điện thoại.
            </div>
          </div>
        </section>

        {/* 4. XƯỞNG ẢNH & VOICE AI */}
        <section id="section-s4-studio" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">4. Xưởng vẽ ảnh & Giọng đọc AI độc lập</h3>
            </div>
            <button onClick={() => navigateTo("/marketing")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600 space-y-1.5">
            <p>• <strong>Vẽ ảnh AI:</strong> Tạo thiết kế ảnh quảng cáo độc quyền theo mô tả.</p>
            <p>• <strong>Tạo giọng đọc AI:</strong> Chuyển bài viết thành file âm thanh phát thanh viên chuyên nghiệp.</p>
          </div>
        </section>

        {/* 5. XƯỞNG VIDEO NGẮN */}
        <section id="section-s5-short" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">5. Xưởng Video Ngắn TikTok (Cắt clip dài)</h3>
            </div>
            <button onClick={() => navigateTo("/marketing")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600">
            Dán link YouTube hoặc tải video dài lên. AI tự trích xuất 5-10 clip ngắn TikTok dọc 9:16 có phụ đề.
          </div>
        </section>

        {/* 6. QUẢN LÝ KHÁCH & CSKH */}
        <section id="section-s6-crm" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">6. Quản lý khách hàng & AI tự đọc bảng giá Excel</h3>
            </div>
            <button onClick={() => navigateTo("/sales-crm")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600 space-y-1.5">
            <p>• <strong>Hộp thư tập trung:</strong> Gom toàn bộ tin nhắn từ Facebook và TikTok về 1 màn hình.</p>
            <p>• <strong>AI tự trả lời:</strong> Nạp file Excel bảng giá để AI tự trả lời tin nhắn/bình luận 24/7 chính xác 100%.</p>
          </div>
        </section>

        {/* 7. BÁO CÁO HIỆU SUẤT */}
        <section id="section-s7-analytics" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">7. Báo cáo hiệu suất & Xuất Excel</h3>
            </div>
            <button onClick={() => navigateTo("/marketing")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600">
            Xem tổng số lượt xem, tương tác, bình luận thực tế và xuất file báo cáo Excel gửi quản lý.
          </div>
        </section>

        {/* 8. CÀI ĐẶT & VÍ TÀI KHOẢN */}
        <section id="section-s8-settings" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-800">8. Cài đặt Fanpage & Nạp ngân sách Ví</h3>
            </div>
            <button onClick={() => navigateTo("/cai-dat")} className="text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1 cursor-pointer">
              Mở trang <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4 text-xs text-slate-600">
            Liên kết quyền đăng bài Facebook/TikTok và quét mã VietQR nạp thêm ngân sách chạy tác vụ AI.
          </div>
        </section>

        {/* 9. HỎI ĐÁP NGẮN */}
        <section id="section-s9-faq" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold text-slate-800">❓ Hỏi đáp nhanh</h3>
          </div>
          <div className="p-4 space-y-2 text-xs text-slate-600">
            <p>• <strong>AI có tự đăng bài khi tắt máy không?</strong> Có, máy chủ tự chạy ngầm 24/7.</p>
            <p>• <strong>Sếp có cần tài khoản để duyệt bài không?</strong> Không, chỉ cần bấm link chia sẻ là duyệt được.</p>
            <p>• <strong>AI có trả lời sai giá không?</strong> Không, AI chỉ đọc dữ liệu từ file Excel bạn nạp lên.</p>
          </div>
        </section>

      </main>
    </div>
  );
}
