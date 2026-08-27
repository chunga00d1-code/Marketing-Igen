import { useState } from "react";
import {
  Image as ImageIcon,
  Mic,
  Sparkles,
  Video,
  X,
} from "lucide-react";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabCategory = "all" | "image" | "video" | "text" | "voice";

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const [activeTab, setActiveTab] = useState<TabCategory>("all");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 fade-in duration-200 text-slate-800">
        {/* Header */}
        <div className="border-b border-slate-100 p-5 bg-white sticky top-0 z-20">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-500" />
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Bảng giá dịch vụ
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Chi phí được tính dựa trên số lượng Credit tiêu thụ cho mỗi đơn vị sử dụng.
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-600">
                <span>Quy đổi: 100 VND = 1 Credit</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 mt-3.5 overflow-x-auto pb-0.5 text-xs font-semibold">
            {[
              { id: "all", label: "Tất cả" },
              { id: "image", label: "Hình ảnh" },
              { id: "video", label: "Video" },
              { id: "text", label: "Văn bản / Prompt" },
              { id: "voice", label: "Voice & RAG" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabCategory)}
                className={`rounded-xl px-3.5 py-1.5 transition cursor-pointer text-xs ${activeTab === tab.id
                  ? "bg-[#0284c7] text-white font-bold shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* 1. HÌNH ẢNH */}
          {(activeTab === "all" || activeTab === "image") && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-500 border border-sky-100">
                  <ImageIcon className="h-3.5 w-3.5" />
                </div>
                <span>Hình ảnh</span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-2xs">
                <div className="grid grid-cols-12 bg-slate-50/80 px-3.5 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  <div className="col-span-6">Mô hình / Dịch vụ</div>
                  <div className="col-span-4 text-center">Giá (Credit)</div>
                  <div className="col-span-2 text-right">Đơn vị</div>
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-12 items-center px-3.5 py-2.5 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen-3.1-flash-image</h4>
                      <p className="text-[10px] text-slate-400">1K: 27.5 | 2K: 42 (Tính theo Credit)</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      27.5
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / ảnh
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center px-3.5 py-2.5 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen-3-pro-image</h4>
                      <p className="text-[10px] text-slate-400">1K: 57 | 2K: 57 (Tính theo Credit)</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      57
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / ảnh
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center px-3.5 py-2.5 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen Imagen Flash</h4>
                      <p className="text-[10px] text-slate-400">Google Imagen 3.0 Fast Generate</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      13.75
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / ảnh
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. VIDEO */}
          {(activeTab === "all" || activeTab === "video") && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-500 border border-sky-100">
                  <Video className="h-3.5 w-3.5" />
                </div>
                <span>Video</span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-2xs">
                <div className="grid grid-cols-12 bg-slate-50/80 px-3.5 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  <div className="col-span-5">Mô hình / Dịch vụ</div>
                  <div className="col-span-5 text-center">Giá (Credit)</div>
                  <div className="col-span-2 text-right">Đơn vị</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {/* iGen Veo 3.1 Fast */}
                  <div className="grid grid-cols-12 items-center px-3.5 py-3 hover:bg-slate-50/50 transition">
                    <div className="col-span-5">
                      <h4 className="font-bold text-slate-900 text-xs">iGen Veo 3.1 Fast</h4>
                      <p className="text-[10px] text-slate-400">Có âm thanh môi trường</p>
                    </div>
                    <div className="col-span-5 flex justify-center">
                      <div className="text-[10px]">
                        <div className="flex items-center gap-2 text-slate-400 font-bold border-b border-slate-100 pb-0.5 mb-0.5">
                          <span className="w-9">Res</span>
                          <span className="w-9 text-center">4s</span>
                          <span className="w-9 text-center">6s</span>
                          <span className="w-9 text-center">8s</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                          <span className="w-9 text-slate-500 font-medium">720P</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">162.0</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">243.0</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">324.0</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                          <span className="w-9 text-slate-500 font-medium">1080P</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">194.4</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">291.6</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">388.8</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / video (lần)
                    </div>
                  </div>

                  {/* iGen Veo 3.1 Lite */}
                  <div className="grid grid-cols-12 items-center px-3.5 py-3 hover:bg-slate-50/50 transition">
                    <div className="col-span-5">
                      <h4 className="font-bold text-slate-900 text-xs">iGen Veo 3.1 Lite</h4>
                      <p className="text-[10px] text-slate-400">Tiết kiệm chi phí</p>
                    </div>
                    <div className="col-span-5 flex justify-center">
                      <div className="text-[10px]">
                        <div className="flex items-center gap-2 text-slate-400 font-bold border-b border-slate-100 pb-0.5 mb-0.5">
                          <span className="w-9">Res</span>
                          <span className="w-9 text-center">4s</span>
                          <span className="w-9 text-center">6s</span>
                          <span className="w-9 text-center">8s</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                          <span className="w-9 text-slate-500 font-medium">720P</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">81.0</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">121.5</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">162.0</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                          <span className="w-9 text-slate-500 font-medium">1080P</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">129.6</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">194.4</span>
                          <span className="w-9 text-center font-extrabold text-sky-600">259.2</span>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / video (lần)
                    </div>
                  </div>

                  {/* BDS MapTour Studio */}
                  <div className="grid grid-cols-12 items-center px-3.5 py-2.5 hover:bg-slate-50/50 transition">
                    <div className="col-span-5">
                      <h4 className="font-bold text-slate-900 text-xs">BDS MapTour Studio 3D</h4>
                      <p className="text-[10px] text-slate-400">Xuất MP4 60fps & Keyframes</p>
                    </div>
                    <div className="col-span-5 text-center font-extrabold text-sky-600 text-base">
                      35.0
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / video (lần)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. VĂN BẢN / PROMPT */}
          {(activeTab === "all" || activeTab === "text") && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500 border border-emerald-100 font-black text-xs">
                  TT
                </div>
                <span>Văn bản / Prompt</span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-2xs">
                <div className="grid grid-cols-12 bg-slate-50/80 px-3.5 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  <div className="col-span-6">Mô hình / Dịch vụ</div>
                  <div className="col-span-4 text-center">Giá (Credit)</div>
                  <div className="col-span-2 text-right">Đơn vị</div>
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-12 items-center px-3.5 py-2 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen 3.1 pro</h4>
                      <p className="text-[10px] text-slate-400">Cố định mỗi lần tạo</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      10
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / lần
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center px-3.5 py-2 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen 3.1 flash lite</h4>
                      <p className="text-[10px] text-slate-400">Cố định mỗi lần tạo</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      1.5
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / lần
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center px-3.5 py-2 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen 3 flash</h4>
                      <p className="text-[10px] text-slate-400">Cố định mỗi lần tạo</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      2.5
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / lần
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center px-3.5 py-2 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen Text V4 Flash</h4>
                      <p className="text-[10px] text-slate-400">Auto-Reply Comment & Inbox</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-emerald-600 text-base">
                      1.0
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / lần
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. VOICE & RAG */}
          {(activeTab === "all" || activeTab === "voice") && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-500 border border-amber-100">
                  <Mic className="h-3.5 w-3.5" />
                </div>
                <span>Giọng nói & RAG</span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-2xs">
                <div className="grid grid-cols-12 bg-slate-50/80 px-3.5 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  <div className="col-span-6">Mô hình / Dịch vụ</div>
                  <div className="col-span-4 text-center">Giá (Credit)</div>
                  <div className="col-span-2 text-right">Đơn vị</div>
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-12 items-center px-3.5 py-2 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">iGen Voice Flash</h4>
                      <p className="text-[10px] text-slate-400">Lồng tiếng AI chuẩn</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-sky-600 text-base">
                      0.15
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / giây
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center px-3.5 py-2 hover:bg-slate-50/50 transition">
                    <div className="col-span-6">
                      <h4 className="font-bold text-slate-900 text-xs">AI RAG Search Tri thức</h4>
                      <p className="text-[10px] text-slate-400">Truy vấn tri thức nội bộ</p>
                    </div>
                    <div className="col-span-4 text-center font-extrabold text-emerald-600 text-base">
                      0.5
                    </div>
                    <div className="col-span-2 text-right text-slate-400 font-medium">
                      / lần
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Note */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center text-xs text-slate-400 italic">
            * Bảng giá có thể thay đổi tùy theo chính sách của nhà cung cấp dịch vụ AI.
          </div>
        </div>
      </div>
    </div>
  );
}
