import React, { useState } from "react";
import { Search, Zap, Plus } from "lucide-react";
import { ExtendedLeadCard } from "../../services/crmService";
import { PipelineCard } from "./PipelineCard";

import { CustomerInbox } from "../../types";

type PipelineTabProps = {
  leads: ExtendedLeadCard[];
  searchPipeline: string;
  setSearchPipeline: (val: string) => void;
  triggerUpsellCampaignOptimized: () => void;
  setShowCreateLeadModal: (show: boolean) => void;
  moveLeadPipeline: (id: string, newStatus: "cold" | "warm" | "hot") => void;
  deleteLead: (id: string) => void;
  handleGoToChat: (customerName: string) => void;
  activeChannel: "all" | "facebook" | "zalo";
  inboxCustomers: CustomerInbox[];
  isFbConnected: boolean;
  isZaloConnected: boolean;
};

export const PipelineTab: React.FC<PipelineTabProps> = ({
  leads,
  searchPipeline,
  setSearchPipeline,
  triggerUpsellCampaignOptimized,
  setShowCreateLeadModal,
  moveLeadPipeline,
  deleteLead,
  handleGoToChat,
  activeChannel,
  inboxCustomers,
  isFbConnected,
  isZaloConnected,
}) => {

  // HTML5 Drag and Drop states
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedLeadId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, status: "cold" | "warm" | "hot") => {
    e.preventDefault();
    setActiveColumn(status);
  };

  const handleDragLeave = () => {
    setActiveColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: "cold" | "warm" | "hot") => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggedLeadId;
    if (id) {
      moveLeadPipeline(id, targetStatus);
    }
    setDraggedLeadId(null);
    setActiveColumn(null);
  };

  // Lọc và gom nhóm cơ hội theo trạng thái và kênh mxh
  const filteredLeads = leads.filter(l => {
    // 1. Tìm kiếm
    const matchesSearch = 
      l.customerName.toLowerCase().includes(searchPipeline.toLowerCase()) ||
      l.company.toLowerCase().includes(searchPipeline.toLowerCase()) ||
      (l.productOfChoice && l.productOfChoice.toLowerCase().includes(searchPipeline.toLowerCase()));
    
    if (!matchesSearch) return false;

    // 2. Phân loại theo kênh mạng xã hội
    const isFbLead = 
      l.company.toLowerCase().includes("facebook") ||
      inboxCustomers.some(c => c.name.toLowerCase() === l.customerName.toLowerCase() && c.channel === "facebook");
    
    const isZaloLead = 
      l.company.toLowerCase().includes("zalo") ||
      inboxCustomers.some(c => c.name.toLowerCase() === l.customerName.toLowerCase() && c.channel === "zalo");

    if (activeChannel === "all") return true;
    if (activeChannel === "facebook") return isFbLead;
    if (activeChannel === "zalo") return isZaloLead;
  });

  const groupedLeads = {
    cold: [] as ExtendedLeadCard[],
    warm: [] as ExtendedLeadCard[],
    hot: [] as ExtendedLeadCard[],
  };

  filteredLeads.forEach((lead) => {
    if (lead.status === "cold") {
      groupedLeads.cold.push(lead);
      return;
    }
    if (lead.status === "warm") {
      groupedLeads.warm.push(lead);
      return;
    }
    if (lead.status === "hot") {
      groupedLeads.hot.push(lead);
    }
  });

  return (
    <div className="p-3.5 overflow-y-auto h-full space-y-3.5 flex flex-col" id="leads_pipeline_kanban">
      
      {/* Search and Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 border border-slate-100 p-3 rounded-2xl shrink-0">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm kiếm cơ hội bán hàng (tên, công ty, sản phẩm)..."
            value={searchPipeline}
            onChange={(e) => setSearchPipeline(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-white rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-150"
          />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={triggerUpsellCampaignOptimized}
            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-indigo-200/50 transition-all cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5 text-indigo-500" />
            Gửi Up-sell hàng loạt
          </button>
          <button 
            onClick={() => setShowCreateLeadModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-500/10 hover:shadow-lg active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm cơ hội mới
          </button>
        </div>
      </div>

      {/* Pipeline Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden pb-2" id="pipeline_columns_grid">
        
        {/* COLD: KHÁCH LẠNH */}
        <div 
          onDragOver={(e) => handleDragOver(e, "cold")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "cold")}
          className={`bg-slate-50/70 border-2 p-3 rounded-2xl flex flex-col h-full overflow-hidden transition-all duration-200 ${
            activeColumn === "cold" ? "border-blue-500 bg-blue-50/30 scale-[1.01]" : "border-slate-100"
          }`} 
          id="pipeline_cold"
        >
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200/50 shrink-0">
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">KHÁCH LẠNH (COLD)</span>
              <span className="text-[9px] text-slate-400">Chưa xác định rõ nhu cầu</span>
            </div>
            <span className="bg-slate-200 text-slate-800 text-[9px] font-bold px-2 py-0.5 rounded-full">
              {groupedLeads.cold.length}
            </span>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {groupedLeads.cold.map(l => (
              <PipelineCard 
                key={l.id} 
                lead={l} 
                onMove={(ns) => moveLeadPipeline(l.id, ns)} 
                onDelete={() => deleteLead(l.id)} 
                onDragStart={(e) => handleDragStart(e, l.id)}
                onGoToChat={handleGoToChat}
              />
            ))}
            {groupedLeads.cold.length === 0 && (
              <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs italic font-sans">
                Không có khách hàng
              </div>
            )}
          </div>
        </div>

        {/* WARM: KHÁCH ẤM */}
        <div 
          onDragOver={(e) => handleDragOver(e, "warm")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "warm")}
          className={`bg-orange-50/20 border-2 p-3 rounded-2xl flex flex-col h-full overflow-hidden transition-all duration-200 ${
            activeColumn === "warm" ? "border-amber-500 bg-amber-50/30 scale-[1.01]" : "border-slate-100"
          }`} 
          id="pipeline_warm"
        >
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-orange-100/50 shrink-0">
            <div className="text-left">
              <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider block">KHÁCH WARM (ẤM)</span>
              <span className="text-[9px] text-orange-500">Đã tương tác hoặc nhận báo giá</span>
            </div>
            <span className="bg-orange-100 text-orange-800 text-[9px] font-bold px-2 py-0.5 rounded-full">
              {groupedLeads.warm.length}
            </span>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {groupedLeads.warm.map(l => (
              <PipelineCard 
                key={l.id} 
                lead={l} 
                onMove={(ns) => moveLeadPipeline(l.id, ns)} 
                onDelete={() => deleteLead(l.id)} 
                onDragStart={(e) => handleDragStart(e, l.id)}
                onGoToChat={handleGoToChat}
              />
            ))}
            {groupedLeads.warm.length === 0 && (
              <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs italic font-sans">
                Không có khách hàng
              </div>
            )}
          </div>
        </div>

        {/* HOT: KHÁCH NÓNG */}
        <div 
          onDragOver={(e) => handleDragOver(e, "hot")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "hot")}
          className={`bg-rose-50/20 border-2 p-3 rounded-2xl flex flex-col h-full overflow-hidden transition-all duration-200 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/10 ${
            activeColumn === "hot" ? "border-emerald-500 bg-emerald-50/10 scale-[1.01]" : "border-slate-100"
          }`} 
          id="pipeline_hot"
        >
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-red-100/50 shrink-0">
            <div className="text-left">
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block flex items-center gap-1.5">
                KHÁCH HOT (NÓNG)
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
              </span>
              <span className="text-[9px] text-red-500">Chuẩn bị ký kết & chốt hợp đồng</span>
            </div>
            <span className="bg-red-100 text-red-800 text-[9px] font-bold px-2 py-0.5 rounded-full">
              {groupedLeads.hot.length}
            </span>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            {groupedLeads.hot.map(l => (
              <PipelineCard 
                key={l.id} 
                lead={l} 
                onMove={(ns) => moveLeadPipeline(l.id, ns)} 
                onDelete={() => deleteLead(l.id)} 
                onDragStart={(e) => handleDragStart(e, l.id)}
                onGoToChat={handleGoToChat}
              />
            ))}
            {groupedLeads.hot.length === 0 && (
              <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs italic font-sans">
                Không có khách hàng
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
