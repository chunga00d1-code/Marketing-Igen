import React, { useState } from "react";
import { ShieldAlert, ArrowLeftRight, HelpCircle, Video, MessageSquare, MessageCircle, ShoppingBag } from "lucide-react";

export default function TikTokSandboxOAuth() {
  const [authorizing, setAuthorizing] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const target = searchParams.get("target") || "personal";

  const handleAuthorize = () => {
    setAuthorizing(true);
    setTimeout(() => {
      const payload = {
        ok: true,
        target,
        profile: {
          username: "igen_marketing_sandbox",
          displayName: target === "company" ? "iGen Marketing Business Shop" : "iGen Marketing Sandbox",
          avatarUrl: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&auto=format&fit=crop&q=80"
        }
      };

      try {
        localStorage.setItem("tt_oauth_result", JSON.stringify(payload));
      } catch (e) {
        console.error("Local storage error:", e);
      }

      try {
        if (window.opener) {
          window.opener.postMessage({ type: "TIKTOK_OAUTH_RESULT", payload }, window.location.origin);
        }
      } catch (e) {
        console.error("PostMessage error:", e);
      }

      // Đóng popup
      window.close();
    }, 1200);
  };

  const handleCancel = () => {
    const payload = {
      ok: false,
      target,
      error: "Người dùng đã hủy ủy quyền kết nối TikTok Sandbox."
    };

    try {
      localStorage.setItem("tt_oauth_result", JSON.stringify(payload));
    } catch (e) {
      console.warn("Cancel local storage save error:", e);
    }

    try {
      if (window.opener) {
        window.opener.postMessage({ type: "TIKTOK_OAUTH_RESULT", payload }, window.location.origin);
      }
    } catch (e) {
      console.warn("Cancel postMessage send error:", e);
    }

    window.close();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-100 font-sans flex flex-col justify-between selection:bg-[#fe2c55]/30">
      {/* Top Header */}
      <header className="border-b border-slate-900 bg-[#0f0f10] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          {/* TikTok Mini Logo */}
          <div className="relative w-8 h-8 flex items-center justify-center bg-black rounded-lg border border-slate-800">
            <span className="text-white font-black text-sm tracking-tighter">TikTok</span>
            <div className="absolute -inset-0.5 bg-[#fe2c55] rounded-lg blur-xs opacity-20 animate-pulse"></div>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Developer Sandbox</span>
        </div>
        <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 text-amber-500 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
          Testing Environment
        </div>
      </header>

      {/* Main Consent Form */}
      <main className="flex-1 max-w-md w-full mx-auto px-6 py-8 flex flex-col justify-center">
        {/* App Info Panel */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-6 mb-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-650 flex items-center justify-center shadow-lg border border-indigo-500/30">
              <span className="text-white font-extrabold text-2xl font-serif">iM</span>
            </div>
            <ArrowLeftRight className="h-5 w-5 text-slate-500 animate-pulse" />
            <div className="w-16 h-16 rounded-full bg-[#111] border border-slate-800 flex items-center justify-center overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&auto=format&fit=crop&q=80"
                alt="TikTok Sandbox"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-xl font-bold text-white tracking-tight">
            Authorize <span className="text-indigo-400">iGen Marketing</span>
          </h1>
          <p className="text-slate-400 text-xs mt-2 leading-relaxed">
            to access your TikTok Sandbox Account. This application is undergoing TikTok developer review.
          </p>
        </div>

        {/* Sandbox Warning Banner */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 mb-6 flex gap-3 text-left">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-200">Developer Testing Mode Enabled</p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              You are authorizing in the Developer Sandbox. This allows testing automation features for **Auto-posting**, **Auto-replies**, and **Comment integration** before the app is fully published.
            </p>
          </div>
        </div>

        {/* Scopes Section */}
        <div className="space-y-4 text-left">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            This App will receive permission to:
          </p>

          <div className="bg-[#0f0f10] border border-slate-900 rounded-2xl p-4 space-y-4">
            {/* Scope 1: video.publish */}
            <div className="flex gap-3.5 items-start">
              <div className="w-8 h-8 rounded-xl bg-[#fe2c55]/10 border border-[#fe2c55]/20 flex items-center justify-center text-[#fe2c55] shrink-0">
                <Video className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-200">Đăng bài tự động (Publish videos)</p>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded-md">video.publish</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Cho phép ứng dụng tải video lên tài khoản của bạn dưới dạng nháp hoặc công khai trực tiếp theo lịch biểu.
                </p>
              </div>
            </div>

            {/* Scope 2: business.message */}
            <div className="flex gap-3.5 items-start border-t border-slate-950 pt-4">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-200">Quản lý hộp thư Inbox (Direct Messages)</p>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded-md">business.message</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Đọc tin nhắn từ khách hàng gửi đến kênh TikTok và kích hoạt gửi câu trả lời tự động thông qua cấu hình AI.
                </p>
              </div>
            </div>

            {/* Scope 3: comment.reply */}
            <div className="flex gap-3.5 items-start border-t border-slate-950 pt-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-200">Đọc và trả lời Bình luận (Comments)</p>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded-md">comment.reply</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Cho phép quét tất cả các bình luận bên dưới video đã đăng tải và tự động viết phản hồi trả lời tương tác.
                </p>
              </div>
            </div>

            {/* Scope 4: TikTok Shop Sandbox (only if company) */}
            {target === "company" && (
              <div className="flex gap-3.5 items-start border-t border-slate-950 pt-4 animate-fadeIn">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-200">Tích hợp TikTok Shop Sandbox</p>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded-md">seller.order</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Đồng bộ danh sách sản phẩm và quản lý trạng thái đơn hàng của cửa hàng thử nghiệm (Sandbox Seller).
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Help Text */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-slate-500">
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="text-[10px]">Bạn có thể thu hồi quyền truy cập này bất kỳ lúc nào trong phần cài đặt của TikTok.</span>
        </div>
      </main>

      {/* Sticky Bottom Actions */}
      <footer className="border-t border-slate-900 bg-[#0f0f10] px-6 py-5 flex items-center gap-4 sticky bottom-0 z-10">
        <button
          onClick={handleCancel}
          disabled={authorizing}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700/50"
        >
          Cancel (Từ chối)
        </button>
        <button
          onClick={handleAuthorize}
          disabled={authorizing}
          className="flex-1 py-3 bg-gradient-to-r from-[#fe2c55] to-[#f2203e] hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#fe2c55]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {authorizing ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Đang kết nối...</span>
            </>
          ) : (
            <span>Authorize (Đồng ý ủy quyền)</span>
          )}
        </button>
      </footer>
    </div>
  );
}
