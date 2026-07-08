import React, { useState } from "react";
import { 
  ArrowRight, 
  CheckCircle2, 
  MessageSquare, 
  ShoppingBag, 
  Users, 
  ShieldCheck, 
  Globe, 
  Sparkles, 
  Layers, 
  Database,
  Lock,
  ChevronRight,
  Menu,
  X,
  ChevronDown,
  Phone,
  Mail,
  MapPin,
  ExternalLink
} from "lucide-react";
import {
  BRAND_LOGO_PATH,
  BRAND_NAME,
  BRAND_TAGLINE,
  PRIVACY_POLICY_URL,
  SUPPORT_URL,
  TERMS_OF_SERVICE_URL,
  USER_DATA_DELETION_URL,
} from "../config/brand";
import { SEOHead } from "../seo/SEOHead";

export default function LandingPage() {
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const meta = {
    title: `${BRAND_NAME} - Nền tảng quản trị doanh nghiệp tích hợp AI`,
    description: "Giải pháp ERP thế hệ mới tích hợp AI giúp quản trị doanh nghiệp, CRM đa kênh Facebook, Zalo, TikTok, quản lý nhân sự HRM và kho vận tối ưu.",
    keywords: "igen erp, erp tich hop ai, omni channel crm, quan ly kho, nhan su hrm, tiktok api integration",
    path: "/",
  };

  const features = [
    {
      icon: <MessageSquare className="h-6 w-6 text-blue-600" />,
      title: "Omni-Channel CRM",
      desc: "Quản lý hội thoại tập trung từ Facebook, Zalo và TikTok Shop. Tự động phân chia khách hàng cho nhân viên sale."
    },
    {
      icon: <ShoppingBag className="h-6 w-6 text-emerald-600" />,
      title: "Quản lý Kho & Sản phẩm",
      desc: "Theo dõi tồn kho theo SKU thực tế, tự động cập nhật số lượng khi có đơn hàng mới từ các kênh thương mại điện tử."
    },
    {
      icon: <Users className="h-6 w-6 text-purple-600" />,
      title: "Quản trị Nhân sự HRM",
      desc: "Xây dựng sơ đồ tổ chức, quản lý KPI và chấm công, tự động hóa quy trình đào tạo và đánh giá nhân sự."
    },
    {
      icon: <Sparkles className="h-6 w-6 text-amber-500" />,
      title: "Trợ lý AI Doanh nghiệp",
      desc: "Tạo nội dung marketing, kịch bản video AI và tự động trả lời bình luận, tin nhắn của khách hàng 24/7."
    }
  ];

  return (
    <div className="min-h-screen bg-[#f6f8fd] text-slate-800 font-sans overflow-x-hidden">
      <SEOHead meta={meta} />

      {/* Background Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-400/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-400/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-teal-400/5 blur-[120px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={BRAND_LOGO_PATH} 
              alt={BRAND_NAME} 
              className="h-11 w-11 rounded-2xl border border-white object-cover shadow-sm"
            />
            <div>
              <span className="font-extrabold text-xl text-slate-900 tracking-tight block">{BRAND_NAME}</span>
              <span className="text-[9px] uppercase font-bold tracking-widest text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {BRAND_TAGLINE}
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-650">
            <a href="#tong-quan" className="hover:text-blue-600 transition-colors py-2">Tổng quan</a>
            
            {/* Dropdown Solutions */}
            <div className="relative" onMouseEnter={() => setSolutionsOpen(true)} onMouseLeave={() => setSolutionsOpen(false)}>
              <button className="flex items-center gap-1 hover:text-blue-600 transition-colors py-2 cursor-pointer focus:outline-none">
                <span>Giải pháp</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${solutionsOpen ? "rotate-180" : ""}`} />
              </button>
              {solutionsOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-64 bg-white border border-slate-100 rounded-2xl p-4 shadow-xl animate-scale-in text-left space-y-3 z-50">
                  <div>
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-blue-600" /> Hệ thống ERP Core</h5>
                    <p className="text-[10px] text-slate-400 pl-5">Vận hành doanh nghiệp tổng thể</p>
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-teal-600" /> Sales CRM & OmniChat</h5>
                    <p className="text-[10px] text-slate-400 pl-5">Inbox tập trung Facebook, Zalo, TikTok</p>
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-purple-600" /> Quản trị Nhân sự HRM</h5>
                    <p className="text-[10px] text-slate-400 pl-5">Sơ đồ tổ chức, KPI, chấm công</p>
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown Integrations */}
            <div className="relative" onMouseEnter={() => setIntegrationsOpen(true)} onMouseLeave={() => setIntegrationsOpen(false)}>
              <button className="flex items-center gap-1 hover:text-blue-600 transition-colors py-2 cursor-pointer focus:outline-none">
                <span>Tích hợp</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${integrationsOpen ? "rotate-180" : ""}`} />
              </button>
              {integrationsOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-56 bg-white border border-slate-100 rounded-2xl p-4 shadow-xl animate-scale-in text-left space-y-3 z-50">
                  <a href="#tich-hop-tiktok" className="block hover:bg-slate-50 p-1.5 rounded-lg transition-colors">
                    <span className="font-bold text-slate-800 text-xs block">TikTok Shop API</span>
                    <span className="text-[9px] text-slate-400">Đồng bộ đơn hàng, kho, chat</span>
                  </a>
                  <div className="p-1.5">
                    <span className="font-bold text-slate-500 text-xs block">Facebook Messenger</span>
                    <span className="text-[9px] text-slate-400">Tự động trả lời, phân luồng</span>
                  </div>
                  <div className="p-1.5">
                    <span className="font-bold text-slate-500 text-xs block">Zalo OA Chat</span>
                    <span className="text-[9px] text-slate-400">Chăm sóc khách hàng Zalo</span>
                  </div>
                </div>
              )}
            </div>

            <a href="#tich-hop-tiktok" className="hover:text-blue-600 transition-colors py-2">Tích hợp TikTok</a>
            <a href="#phap-ly" className="hover:text-blue-600 transition-colors py-2">Liên hệ</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <a 
              href="/dang-nhap" 
              className="text-xs font-bold text-slate-700 hover:text-blue-600 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all bg-white"
            >
              Đăng nhập
            </a>
            <a 
              href="/dang-nhap" 
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/10 hover:shadow-lg transition-all active:scale-[0.97]"
            >
              Dùng thử miễn phí
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-blue-650 focus:outline-none cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-6 space-y-4 shadow-inner animate-fade-in text-left">
            <div className="space-y-2">
              <a href="#tong-quan" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-xs font-bold text-slate-700 hover:text-blue-600">Tổng quan</a>
              <a href="#tinh-nang" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-xs font-bold text-slate-700 hover:text-blue-600">Tính năng</a>
              <a href="#tich-hop-tiktok" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-xs font-bold text-slate-700 hover:text-blue-600">Tích hợp TikTok Shop</a>
              <a href={PRIVACY_POLICY_URL} className="block py-2 text-xs font-bold text-slate-700 hover:text-blue-600">Privacy Policy</a>
              <a href={TERMS_OF_SERVICE_URL} className="block py-2 text-xs font-bold text-slate-700 hover:text-blue-600">Terms of Service</a>
              <a href={USER_DATA_DELETION_URL} className="block py-2 text-xs font-bold text-slate-700 hover:text-blue-600">Data Deletion Instructions</a>
            </div>
            <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
              <a 
                href="/dang-nhap" 
                className="w-full text-center text-xs font-bold text-slate-700 border border-slate-200 py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Đăng nhập
              </a>
              <a 
                href="/dang-nhap" 
                className="w-full text-center text-xs font-bold text-white bg-blue-600 py-3 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Đăng ký dùng thử
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Main Content wrapper for semantic HTML */}
      <main id="main_content">
        {/* Hero Section */}
        <section id="tong-quan" className="relative pt-12 pb-20 lg:pt-20 lg:pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6 text-left animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                <span>ERP tích hợp AI thế hệ mới</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Tối ưu hóa Vận hành Doanh nghiệp của Bạn
              </h1>
              
              <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
                {BRAND_NAME} mang đến giải pháp quản trị doanh nghiệp toàn diện. Đồng bộ và kết nối liền mạch các kênh bán hàng, mạng xã hội, quản lý nhân sự HRM và kho vận trên một nền tảng trực quan, hiện đại.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <a 
                  href="/dang-nhap" 
                  id="hero_btn_get_started"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/15 hover:shadow-blue-600/25 transition-all"
                >
                  <span>Bắt đầu ngay hôm nay</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a 
                  href="#tich-hop-tiktok" 
                  id="hero_btn_tiktok_features"
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3.5 px-6 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <span>Xem tích hợp TikTok</span>
                </a>
              </div>

            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200/80">
              <div>
                <span className="block text-2xl font-extrabold text-slate-900">99.9%</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Thời gian hoạt động</span>
              </div>
              <div>
                <span className="block text-2xl font-extrabold text-slate-900">10x</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Hiệu suất vận hành</span>
              </div>
              <div>
                <span className="block text-2xl font-extrabold text-slate-900">24/7</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Hỗ trợ AI tự động</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Mockup */}
          <div className="lg:col-span-6 animate-float relative">
            <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-r from-blue-600 to-teal-500 opacity-10 blur-xl" />
            <div className="relative border border-slate-200/80 rounded-3xl bg-white shadow-2xl p-4 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="bg-slate-100 px-6 py-1 rounded-full text-[10px] text-slate-400 font-medium">
                  erp.igentechsolutions.com/tong-quan
                </div>
                <div className="w-6" />
              </div>
              
              <div className="space-y-4">
                {/* Simulated Dashboard UI */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-2xl text-left">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Doanh thu tháng</span>
                    <span className="block text-lg font-extrabold text-blue-600 mt-1">428,50M đ</span>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-2xl text-left">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đơn hàng mới</span>
                    <span className="block text-lg font-extrabold text-emerald-600 mt-1">1,248</span>
                  </div>
                  <div className="bg-purple-50/50 border border-purple-100 p-3 rounded-2xl text-left">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Khách kết nối</span>
                    <span className="block text-lg font-extrabold text-purple-600 mt-1">8,940</span>
                  </div>
                </div>

                <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">OmniChat Inbox & Khách hàng TikTok Shop</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-md uppercase">Đang chạy</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">T</div>
                        <div>
                          <span className="font-semibold text-slate-700 block">Nguyễn Văn A (TikTok Shop)</span>
                          <span className="text-[9px] text-slate-400">"Sản phẩm này còn size M màu xanh không shop?"</span>
                        </div>
                      </div>
                      <span className="text-slate-400 text-[9px]">Vừa xong</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">AI</div>
                        <div>
                          <span className="font-semibold text-blue-600 block">iGen AI Assistant (Auto)</span>
                          <span className="text-[9px] text-slate-500">"Dạ sản phẩm này bên em còn hàng ạ. Bạn có thể..."</span>
                        </div>
                      </div>
                      <span className="text-slate-400 text-[9px]">1 giây trước</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="tinh-nang" className="py-20 bg-white border-y border-slate-200/60 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tính năng Nổi bật của iGen ERP</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Giải pháp all-in-one giúp vận hành mọi phòng ban trơn tru, đồng bộ dữ liệu theo thời gian thực và tự động hóa tác vụ bằng trí tuệ nhân tạo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feat, index) => (
              <div 
                key={index} 
                className="border border-slate-100 hover:border-slate-200 rounded-3xl p-6 bg-slate-50/50 hover:bg-white hover:shadow-lg transition-all duration-300 text-left space-y-4 group"
              >
                <div className="p-3 bg-white rounded-2xl w-fit shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
                  {feat.icon}
                </div>
                <h3 className="font-bold text-slate-900 text-base">{feat.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Showcase - Real UI Mockups */}
      <section className="py-20 bg-slate-50 border-b border-slate-200/60 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
              <Layers className="h-3.5 w-3.5" />
              <span>Giao diện Trải nghiệm thực tế</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Vận hành đa kênh trên một màn hình duy nhất</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Trực quan hóa hoạt động bán hàng, quản lý đơn hàng, tồn kho và chăm sóc khách hàng tự động với trợ lý ảo iGen AI.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-left">
            {/* Mockup 1: OmniChat Inbox */}
            <div className="border border-slate-200/80 rounded-3xl bg-white shadow-lg overflow-hidden flex flex-col h-[380px]">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider">OMNICHAT INBOX - HỘP THƯ TẬP TRUNG</span>
                <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded font-bold">LIVE</span>
              </div>
              <div className="flex flex-1 overflow-hidden bg-slate-50/20">
                {/* Sidebar */}
                <div className="w-1/3 border-r border-slate-100 bg-slate-50 p-2 space-y-2 flex flex-col justify-start">
                  <div className="p-1.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-700">TikTok Shop</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>
                  <div className="p-1.5 bg-white border border-slate-100 rounded-lg flex items-center justify-between text-slate-500">
                    <span className="text-[10px] font-semibold">Zalo OA</span>
                    <span className="text-[8px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">3</span>
                  </div>
                  <div className="p-1.5 bg-white border border-slate-100 rounded-lg flex items-center justify-between text-slate-500">
                    <span className="text-[10px] font-semibold">Facebook Page</span>
                    <span className="text-[8px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">1</span>
                  </div>
                </div>
                {/* Chat window */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div className="space-y-3 overflow-y-auto text-[11px]">
                    {/* Customer Message */}
                    <div className="flex items-start gap-2 max-w-[85%]">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-[10px] font-bold text-purple-700">KH</div>
                      <div className="bg-slate-100 p-2.5 rounded-2xl rounded-tl-none text-slate-750">
                        Sản phẩm này bên mình còn size L màu đen ở kho Hà Nội không shop để em đặt mua qua TikTok Shop?
                      </div>
                    </div>
                    {/* AI auto reply */}
                    <div className="flex items-start gap-2 max-w-[85%] self-end flex-row-reverse ml-auto">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 text-[9px] font-bold">AI</div>
                      <div className="bg-blue-600 text-white p-2.5 rounded-2xl rounded-tr-none">
                        Chào bạn, iGen AI đã kiểm tra tồn kho hệ thống: Sản phẩm Áo khoác Blazer đen size L hiện còn 12 chiếc tại kho Nguyễn Thị Định, Hà Nội. Bạn có thể lên đơn trực tiếp ạ!
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-150 pt-2 flex items-center justify-between gap-2">
                    <div className="bg-slate-100 flex-1 px-3 py-1.5 rounded-full text-[10px] text-slate-400">
                      iGen AI đã soạn sẵn câu trả lời...
                    </div>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl">Gửi</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Mockup 2: Order sync & Inventory table */}
            <div className="border border-slate-200/80 rounded-3xl bg-white shadow-lg overflow-hidden flex flex-col h-[380px]">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider">ĐỒNG BỘ ĐƠN HÀNG & KHO VẬN ĐA KÊNH</span>
                <span className="text-[10px] bg-teal-600 px-2 py-0.5 rounded font-bold">LIVE DATA</span>
              </div>
              <div className="flex-1 p-4 space-y-4 flex flex-col justify-start">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Danh sách đơn hàng mới nhất</span>
                  <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1"><Database className="h-3 w-3 text-slate-400" /> Cập nhật: 1 giây trước</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold">
                        <th className="pb-2">MÃ ĐƠN</th>
                        <th className="pb-2">KHÁCH HÀNG</th>
                        <th className="pb-2">KÊNH BÁN</th>
                        <th className="pb-2">TỔNG TIỀN</th>
                        <th className="pb-2 text-right">TRẠNG THÁI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-[10.5px]">
                      <tr className="text-slate-705">
                        <td className="py-2.5 font-bold">#TT-8941</td>
                        <td className="py-2.5">Trần Khánh Ly</td>
                        <td className="py-2.5"><span className="px-1.5 py-0.5 bg-black text-white text-[8px] font-bold rounded">TikTok Shop</span></td>
                        <td className="py-2.5 font-semibold">280,000 đ</td>
                        <td className="py-2.5 text-right"><span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-bold rounded">Đã đồng bộ</span></td>
                      </tr>
                      <tr className="text-slate-705">
                        <td className="py-2.5 font-bold">#ZL-3829</td>
                        <td className="py-2.5">Lê Minh Quang</td>
                        <td className="py-2.5"><span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-bold rounded">Zalo OA</span></td>
                        <td className="py-2.5 font-semibold">1,250,000 đ</td>
                        <td className="py-2.5 text-right"><span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-bold rounded">Đang xử lý</span></td>
                      </tr>
                      <tr className="text-slate-705">
                        <td className="py-2.5 font-bold">#FB-4712</td>
                        <td className="py-2.5">Nguyễn Thị Mai</td>
                        <td className="py-2.5"><span className="px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-bold rounded">Facebook</span></td>
                        <td className="py-2.5 font-semibold">450,000 đ</td>
                        <td className="py-2.5 text-right"><span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-250 text-[8px] font-bold rounded">Chờ xác nhận</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-150 p-2.5 rounded-2xl flex items-center justify-between text-[10px]">
                  <span className="text-emerald-800 font-semibold">Tự động trừ tồn kho (Real-time Stock Update):</span>
                  <span className="font-bold text-emerald-800">Đã cập nhật - 3 kho hàng đồng bộ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TikTok Integration Details (CRITICAL FOR REVIEW) */}
      <section id="tich-hop-tiktok" className="py-20 bg-slate-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Visual Representation of TikTok integration */}
            <div className="lg:col-span-5 order-last lg:order-first">
              <div className="relative border border-slate-200/80 rounded-3xl bg-white shadow-xl p-6 space-y-6 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800">Tích hợp TikTok Developer</span>
                  </div>
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded-full">
                    Official API Connection
                  </span>
                </div>

                <div className="flex items-center justify-center gap-8 py-4">
                  <div className="flex flex-col items-center gap-2">
                    <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="w-16 h-16 rounded-2xl shadow-md border border-slate-100" />
                    <span className="text-[10px] font-bold text-slate-500">iGen ERP App</span>
                  </div>
                  <div className="flex items-center justify-center flex-1 h-[2px] bg-gradient-to-r from-blue-500 to-black relative">
                    <div className="absolute px-3 py-1 bg-slate-100 rounded-full border border-slate-200 text-[9px] font-bold text-slate-500">
                      OAuth 2.0
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 bg-black rounded-2xl shadow-md flex items-center justify-center">
                      <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.63 4.19 1.12 1.25 2.7 2.01 4.38 2.21v3.9c-1.74-.06-3.47-.63-4.88-1.68-.31-.22-.6-.47-.87-.73v7.33c-.02 2.24-.88 4.48-2.51 6.09-1.87 1.83-4.58 2.66-7.14 2.19-2.73-.48-5.11-2.43-6.09-5.06-1.12-2.92-.37-6.49 1.88-8.65 1.93-1.89 4.82-2.55 7.4-1.7v4.06c-1.39-.46-2.99-.07-4 .97-.97.98-1.27 2.51-.77 3.81.47 1.28 1.77 2.17 3.14 2.16 1.74.02 3.27-1.32 3.4-3.05.05-1.57.02-3.15.03-4.73V0z"/>
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-slate-800">TikTok Platform</span>
                  </div>
                </div>

                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-700 block">Quyền (Scopes) ứng dụng sử dụng:</span>
                  <ul className="space-y-2 text-[11px] text-slate-500">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <span><strong>user.info.basic</strong>: Dùng để xác thực và kết nối tài khoản kênh sáng tạo/kênh bán hàng TikTok.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <span><strong>seller.order</strong> (TikTok Shop): Đồng bộ đơn hàng phát sinh trên TikTok Shop về hệ thống iGen ERP để lên đơn vận chuyển.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <span><strong>seller.product</strong> (TikTok Shop): Đồng bộ danh mục sản phẩm, tồn kho tự động để tránh lệch kho bán hàng.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Informational description */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-wider">
                <Globe className="h-3.5 w-3.5" />
                <span>Liên kết mạng xã hội chính thức</span>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tích hợp và Đồng bộ TikTok thông minh</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Hệ thống iGen ERP kết nối chính thức với API của TikTok thông qua luồng xác thực bảo mật OAuth 2.0. Việc tích hợp này giúp các nhà bán hàng và doanh nghiệp tối ưu hóa hoạt động vận hành mà không cần chuyển đổi nhiều tab.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    Đăng nhập và Liên kết nhanh
                  </h4>
                  <p className="text-xs text-slate-400 pl-3.5 leading-relaxed">
                    Sử dụng luồng Đăng nhập với TikTok để kết nối tài khoản cá nhân hoặc tài khoản TikTok Shop vào hệ thống chỉ trong vài giây.
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    Đồng bộ Tin nhắn & Chat
                  </h4>
                  <p className="text-xs text-slate-400 pl-3.5 leading-relaxed">
                    Quản lý toàn bộ tin nhắn từ khách hàng TikTok Shop ngay trên phần CRM OmniChat của ERP, tăng tốc thời gian phản hồi.
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    Quản lý Đơn hàng tập trung
                  </h4>
                  <p className="text-xs text-slate-400 pl-3.5 leading-relaxed">
                    Đơn hàng từ TikTok Shop được tự động đẩy về hệ thống của iGen ERP phục vụ cho kiểm đếm kho và thống kê doanh thu.
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    Đồng bộ Tồn kho tự động
                  </h4>
                  <p className="text-xs text-slate-400 pl-3.5 leading-relaxed">
                    Đảm bảo số lượng sản phẩm thực tế và số lượng sản phẩm đăng trên TikTok Shop luôn đồng nhất, giảm tỷ lệ hủy đơn do hết hàng.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* OAuth Authorization Flow Step Indicator */}
      <section className="py-16 bg-white border-t border-slate-200/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Quy trình tích hợp chính thức</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Quy trình cấp quyền & kết nối 3 bước</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Dễ dàng thiết lập liên kết tài khoản TikTok Shop của bạn qua cổng xác thực chính thức OAuth 2.0 an toàn và bảo mật.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md">
                1
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Yêu cầu kết nối</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Tại trang Quản trị iGen ERP, bạn truy cập mục "Cấu hình tích hợp", sau đó chọn "Kết nối TikTok Shop" để kích hoạt luồng kết nối chính thức.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md">
                2
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Xác thực OAuth 2.0</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Hệ thống sẽ chuyển hướng bạn sang cổng xác thực an toàn của TikTok Shop. Bạn tiến hành đăng nhập tài khoản Shop và xác nhận đồng ý cung cấp quyền.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center space-y-4 relative z-10">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md">
                3
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Hoàn tất & Đồng bộ</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                TikTok chuyển hướng trở lại iGen ERP. Token kết nối bảo mật được thiết lập, hệ thống bắt đầu đồng bộ đơn hàng, tin nhắn và sản phẩm tự động.
              </p>
            </div>

            {/* Connecting Line (Only visible on larger screens) */}
            <div className="hidden md:block absolute top-6 left-[16.6%] right-[16.6%] h-[2px] bg-slate-100 z-0" />
          </div>
        </div>
      </section>

      {/* Data Security and User Control Section */}
      <section id="bao-mat" className="py-20 bg-white border-t border-slate-200/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Cam kết Bảo mật & Kiểm soát Dữ liệu</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Chúng tôi luôn tôn trọng quyền riêng tư của bạn và tuân thủ các quy tắc bảo mật dữ liệu nghiêm ngặt nhất.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border border-slate-100 rounded-3xl p-6 bg-slate-50/50 space-y-3 text-left">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-fit">
                <Lock className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Mã hóa Dữ liệu Truyền tải</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tất cả dữ liệu trao đổi giữa iGen ERP và TikTok được mã hóa sử dụng chuẩn HTTPS/TLS 1.3 bảo mật, chống nghe lén thông tin.
              </p>
            </div>

            <div className="border border-slate-100 rounded-3xl p-6 bg-slate-50/50 space-y-3 text-left">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-fit">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Quyền kiểm soát tài khoản</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Người dùng hoàn toàn chủ động kết nối hoặc ngắt kết nối tài khoản TikTok bất cứ lúc nào trong bảng điều khiển Cấu hình của ERP.
              </p>
            </div>

            <div className="border border-slate-100 rounded-3xl p-6 bg-slate-50/50 space-y-3 text-left">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl w-fit">
                <Database className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Yêu cầu Xóa dữ liệu</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Chúng tôi cung cấp trang Yêu cầu xóa dữ liệu chuyên biệt để người dùng có thể yêu cầu xóa toàn bộ thông tin đã đồng bộ khỏi hệ thống.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-slate-50 border-t border-slate-200/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-12">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Câu hỏi thường gặp (FAQ)</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Giải đáp các thắc mắc phổ biến về việc tích hợp API và chính sách bảo mật thông tin tài khoản TikTok.
            </p>
          </div>

          <div className="space-y-4 text-left">
            {[
              {
                q: "iGen ERP kết nối với TikTok bằng cách nào và có an toàn không?",
                a: "iGen ERP kết nối trực tiếp với TikTok Shop thông qua giao thức API chính thức (TikTok Shop Open Platform) sử dụng chuẩn xác thực bảo mật OAuth 2.0. Hệ thống không yêu cầu người dùng cung cấp mật khẩu tài khoản TikTok, đảm bảo an toàn tuyệt đối."
              },
              {
                q: "Quyền 'seller.order' và 'seller.product' được sử dụng cụ thể vào mục đích gì?",
                a: "Quyền 'seller.order' giúp hệ thống tự động tải đơn hàng mới phát sinh trên TikTok Shop về ERP để đóng gói, in vận đơn. Quyền 'seller.product' được dùng để đồng bộ danh mục sản phẩm, giúp cập nhật tồn kho tức thời (khi có đơn ở kho vật lý hoặc các kênh khác, số lượng trên TikTok Shop sẽ tự động trừ đi để tránh tình trạng lệch kho)."
              },
              {
                q: "Tôi có thể hủy liên kết tài khoản TikTok Shop bất cứ lúc nào không?",
                a: "Hoàn toàn được. Bạn có thể ngắt kết nối tài khoản TikTok Shop của mình ngay lập tức chỉ với một nút bấm trong mục 'Cài đặt kết nối' của ERP. Sau khi ngắt kết nối, iGen ERP sẽ ngưng mọi hoạt động truy xuất dữ liệu từ API TikTok."
              },
              {
                q: "Làm cách nào để yêu cầu xóa toàn bộ dữ liệu đã đồng bộ khỏi hệ thống?",
                a: "Chúng tôi tuân thủ nghiêm ngặt chính sách bảo vệ dữ liệu người dùng. Bạn có thể truy cập trang 'Data Deletion Instructions' tại chân trang hoặc gửi yêu cầu xóa dữ liệu tự động. Hệ thống sẽ tiến hành xóa vĩnh viễn toàn bộ dữ liệu đơn hàng và chat đã đồng bộ trong vòng 72 giờ làm việc."
              }
            ].map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div key={index} className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden transition-all">
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-800 text-[11px] sm:text-xs hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="p-5 pt-0 border-t border-slate-100 text-[11px] text-slate-550 leading-relaxed bg-slate-50/20">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta_section" className="py-16 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Sẵn sàng nâng tầm chuyển đổi số doanh nghiệp?</h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Đăng ký trải nghiệm iGen ERP tích hợp AI ngay hôm nay để nhận 14 ngày dùng thử miễn phí và kết nối không giới hạn Facebook, Zalo, TikTok Shop.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href="/dang-nhap" 
              id="cta_btn_free_trial"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-8 rounded-xl text-xs shadow-lg transition-all active:scale-[0.98]"
            >
              Dùng thử miễn phí
            </a>
            <a 
              href={PRIVACY_POLICY_URL} 
              id="cta_btn_privacy_policy"
              className="w-full sm:w-auto bg-transparent hover:bg-white/5 border border-white/20 text-white font-bold py-3.5 px-8 rounded-xl text-xs transition-all"
            >
              Chính sách bảo mật
            </a>
          </div>
        </div>
      </section>
      </main>

      {/* Footer (CRITICAL FOR REVIEW - LINKS TO LEGAL PAGES) */}
      <footer id="phap-ly" className="bg-slate-950 border-t border-slate-900 text-slate-400 py-16 text-[11px] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 border-b border-slate-900 pb-12">
            
            {/* Column 1: Brand Profile */}
            <div className="lg:col-span-4 space-y-4 text-left">
              <div className="flex items-center gap-2.5">
                <img src={BRAND_LOGO_PATH} alt={BRAND_NAME} className="h-9 w-9 rounded-xl object-cover shadow-md" />
                <div>
                  <span className="font-extrabold text-white text-lg tracking-tight block">{BRAND_NAME}</span>
                  <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">Enterprise Solutions</span>
                </div>
              </div>
              <p className="text-slate-500 leading-relaxed text-[11px]">
                Nền tảng ERP toàn diện tích hợp Trí tuệ Nhân tạo (AI). Giải quyết bài toán quản trị vận hành, nhân sự HRM, quản trị kho hàng và sales CRM đa kênh trên cùng một hệ thống duy nhất.
              </p>
              <div className="space-y-2 text-slate-500 pt-2 border-t border-slate-900">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-slate-600" />
                  <span><strong>Đơn vị chủ quản:</strong> CÔNG TY CỔ PHẦN CÔNG NGHỆ IGEN</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-600 mt-0.5 shrink-0" />
                  <span><strong>Địa chỉ:</strong> Lô LK3 LK4 Đường Lạc Long Quân, Phường Kinh Bắc, Thành phố Bắc Ninh, Tỉnh Bắc Ninh, Việt Nam</span>
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
                  <span><strong>MST/GPKD:</strong> 2301355232 (Cấp bởi Sở KH&ĐT Tỉnh Bắc Ninh)</span>
                </div>
              </div>
            </div>

            {/* Column 2: ERP Solutions */}
            <div className="lg:col-span-3 lg:col-start-6 text-left space-y-4">
              <h4 className="font-bold text-white uppercase tracking-wider text-[10px] border-b border-slate-900 pb-2">Giải pháp sản phẩm</h4>
              <ul className="space-y-2.5">
                <li><span className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Hệ thống ERP quản trị lõi</span></li>
                <li><a href="#tinh-nang" className="hover:text-white transition-colors flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Sales CRM & OmniChat</a></li>
                <li><span className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Quản trị nhân sự HRM</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Quản lý Kho & Tồn kho SKU</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Marketing AI (HeyGen Videos)</span></li>
              </ul>
            </div>

            {/* Column 3: Integrations & API */}
            <div className="lg:col-span-2 text-left space-y-4">
              <h4 className="font-bold text-white uppercase tracking-wider text-[10px] border-b border-slate-900 pb-2">Kết nối & Tích hợp</h4>
              <ul className="space-y-2.5">
                <li><a href="#tich-hop-tiktok" className="hover:text-white transition-colors flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> TikTok Shop API (Official)</a></li>
                <li><span className="hover:text-white transition-colors flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Facebook Graph API</span></li>
                <li><span className="hover:text-white transition-colors flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Zalo Business API</span></li>
                <li><a href="#tich-hop-tiktok" className="hover:text-white transition-colors flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-slate-600" /> Quy trình cấp quyền OAuth</a></li>
              </ul>
            </div>

            {/* Column 4: Legal & Support */}
            <div className="lg:col-span-3 text-left space-y-4">
              <h4 className="font-bold text-white uppercase tracking-wider text-[10px] border-b border-slate-900 pb-2">Thông tin Pháp lý</h4>
              <ul className="space-y-2.5">
                <li>
                  <a href={PRIVACY_POLICY_URL} id="footer_link_privacy" className="hover:text-white transition-colors flex items-center gap-1.5 font-semibold text-slate-300">
                    <ChevronRight className="h-3 w-3 text-slate-600" /> Privacy Policy (Bảo mật)
                  </a>
                </li>
                <li>
                  <a href={TERMS_OF_SERVICE_URL} id="footer_link_terms" className="hover:text-white transition-colors flex items-center gap-1.5 font-semibold text-slate-300">
                    <ChevronRight className="h-3 w-3 text-slate-600" /> Terms of Service (Điều khoản)
                  </a>
                </li>
                <li>
                  <a href={USER_DATA_DELETION_URL} id="footer_link_data_deletion" className="hover:text-white transition-colors flex items-center gap-1.5 font-semibold text-slate-300">
                    <ChevronRight className="h-3 w-3 text-slate-600" /> Data Deletion Instructions
                  </a>
                </li>
                <li>
                  <a href={SUPPORT_URL} id="footer_link_support" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3 text-slate-600" /> Liên hệ Phòng hỗ trợ
                  </a>
                </li>
              </ul>
              
              <div className="pt-2">
                {/* Simulated Ministry of Industry and Trade badge */}
                <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-950/20 px-3 py-1.5 rounded-lg text-emerald-400">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-[9px] uppercase tracking-wider">Đã Đăng Ký Bộ Công Thương</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between text-slate-500 gap-4 pt-4">
            <span className="text-left">© {new Date().getFullYear()} CÔNG TY CỔ PHẦN CÔNG NGHỆ IGEN. Tất cả các quyền được bảo hộ. Bản quyền website thuộc về iGen Solutions.</span>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Bảo mật SSL mã hóa 256-bit</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
