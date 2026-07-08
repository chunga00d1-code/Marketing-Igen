import React from "react";
import { Clock, Trash2, MessageSquare } from "lucide-react";
import { ExtendedLeadCard } from "../../services/crmService";

type PipelineCardProps = {
  lead: ExtendedLeadCard;
  onMove: (ns: "cold" | "warm" | "hot") => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onGoToChat: (customerName: string) => void;
};

export const PipelineCard: React.FC<PipelineCardProps> = ({
  lead,
  onMove,
  onDelete,
  onDragStart,
  onGoToChat
}) => {
  const isHot = lead.status === "hot";

  return (
    <div 
      draggable
      onDragStart={onDragStart}
      className={`bg-white border border-slate-200 rounded-2xl p-3 shadow-xs hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing flex flex-col gap-2.5 relative text-left ${
        isHot 
          ? "border-rose-350 shadow-rose-100/20" 
          : lead.status === "warm"
            ? "border-orange-200 shadow-orange-50/20"
            : "border-slate-200 shadow-slate-50"
      }`}
      id={`pipeline_card_${lead.id}`}
    >
      {/* Badge & Avatar Header */}
      <div className="flex items-center gap-2.5">
        <div className="text-lg p-1 bg-slate-50 border border-slate-100 rounded-xl select-none shrink-0 shadow-xxs">
          {lead.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <h5 className="font-extrabold text-slate-800 text-xs leading-none truncate font-sans">{lead.customerName}</h5>
          <p className="text-[10px] text-slate-400 font-mono mt-1 leading-none truncate">{lead.company}</p>
        </div>
      </div>

      {/* Status & Value Row */}
      <div className="flex items-center justify-between py-1.5 border-y border-slate-100 text-[11px] leading-tight">
        <div>
          <span className="text-[8.5px] text-slate-400 block font-bold uppercase tracking-wider">Tiến độ</span>
          <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[8px] font-bold rounded-md uppercase tracking-wider ${
            lead.lastInteraction === "Sắp chốt HD" 
              ? "bg-red-50 text-red-600 border border-red-100" 
              : lead.lastInteraction === "Đã gửi báo giá"
                ? "bg-blue-50 text-blue-600 border border-blue-100"
                : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}>
            {lead.lastInteraction || "Mới tiếp cận"}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[8.5px] text-slate-400 block font-bold uppercase tracking-wider">Dự toán đơn</span>
          <strong className="text-blue-600 font-extrabold font-mono text-[10.5px] block mt-0.5">
            {lead.value > 0 ? `${lead.value.toLocaleString("vi-VN")} đ` : "Chưa xác định"}
          </strong>
        </div>
      </div>

      {/* Time & Delete Action Row */}
      <div className="flex items-center justify-between text-[9.5px] text-slate-400 pt-0.5">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-300" />
          <span>{lead.lastInteractionTime || "Chưa rõ"}</span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }} 
          className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-md transition-colors cursor-pointer"
          title="Xóa cơ hội này"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hybrid Action Controls for Lowtech Users */}
      <div className="grid grid-cols-2 gap-1.5 mt-0.5 pt-1.5 border-t border-slate-100 shrink-0">
        <button
          onClick={() => onGoToChat(lead.customerName)}
          className="py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-xl text-[9.5px] font-bold transition-all border border-slate-200 hover:border-blue-200 flex items-center justify-center gap-1 cursor-pointer"
        >
          <MessageSquare className="w-3 h-3 shrink-0" />
          Nhắn tin
        </button>

        {lead.status === "cold" && (
          <button 
            onClick={() => onMove("warm")}
            className="py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[9.5px] font-bold transition-all flex items-center justify-center gap-0.5 cursor-pointer shadow-sm shadow-orange-500/10 active:scale-95"
          >
            Chuyển Ấm →
          </button>
        )}
        
        {lead.status === "hot" && (
          <button 
            onClick={() => onMove("warm")}
            className="py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-[9.5px] font-bold transition-all flex items-center justify-center gap-0.5 cursor-pointer shadow-sm shadow-slate-500/10 active:scale-95"
          >
            ← Chuyển Ấm
          </button>
        )}

        {lead.status === "warm" && (
          <div className="flex gap-1">
            <button 
              onClick={() => onMove("cold")}
              className="flex-1 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-[9.5px] font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
              title="Chuyển Lạnh"
            >
              ← Lạnh
            </button>
            <button 
              onClick={() => onMove("hot")}
              className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[9.5px] font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
              title="Chuyển Nóng"
            >
              Nóng →
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
