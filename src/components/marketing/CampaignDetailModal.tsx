import React from 'react';
import { CalendarClock, X, Loader2, Facebook, ExternalLink, AlertTriangle } from 'lucide-react';
import { CampaignStatus, MarketingCampaignSummary } from '../../services/marketingCampaignService';

interface CampaignSlot {
  _id: string;
  pillar: string;
  objective?: string;
  topicBrief: string;
  scheduledAt: string;
  status: string;
  errorMessage?: string;
  publishedPostUrl?: string;
}

interface CampaignDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  loadingDetail: boolean;
  campaignDetail: { campaign: MarketingCampaignSummary; slots: CampaignSlot[] } | null;
  statusLabel: Record<CampaignStatus, string>;
  slotStatusColors: Record<string, string>;
  slotStatusLabel: Record<string, string>;
}

export default function CampaignDetailModal({
  isOpen,
  onClose,
  loadingDetail,
  campaignDetail,
  statusLabel,
  slotStatusColors,
  slotStatusLabel,
}: CampaignDetailModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-scaleIn">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4.5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <CalendarClock size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-850">
                {loadingDetail ? 'Đang tải...' : campaignDetail?.campaign?.title || 'Chi tiết chiến dịch'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {!loadingDetail && campaignDetail && `${campaignDetail.campaign.startDate} → ${campaignDetail.campaign.endDate} · ${campaignDetail.campaign.statistics.totalSlots} bài viết`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loadingDetail ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <span className="text-xs text-slate-500 font-semibold font-mono">ĐANG TẢI CHI TIẾT CHIẾN DỊCH...</span>
            </div>
          ) : campaignDetail ? (
            <>
              {/* Campaign Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Trạng thái</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${campaignDetail.campaign.status === 'active' ? 'bg-green-50 text-green-700' : campaignDetail.campaign.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-150 text-slate-655'}`}>
                      {statusLabel[campaignDetail.campaign.status]}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Sản lượng</span>
                  <p className="mt-1.5 text-xs font-bold text-slate-800">
                    Đã xuất bản {campaignDetail.campaign.statistics.publishedSlots} / {campaignDetail.campaign.statistics.totalSlots} bài viết
                  </p>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{
                        width: `${campaignDetail.campaign.statistics.totalSlots > 0
                          ? Math.round((campaignDetail.campaign.statistics.publishedSlots / campaignDetail.campaign.statistics.totalSlots) * 100)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">Cấu hình</span>
                  <div className="mt-1.5 text-xs text-slate-600 leading-relaxed font-sans">
                    <p><b>Khung giờ:</b> {campaignDetail.campaign.postingTimes.join(', ')}</p>
                    <p className="mt-0.5"><b>Mật độ:</b> {campaignDetail.campaign.postsPerDay} bài/ngày · {campaignDetail.campaign.candidateCount} phương án/slot</p>
                  </div>
                </div>
              </div>

              {/* Expandable/Scrollable Brief Box */}
              <div className="rounded-xl border border-slate-150 p-4 bg-slate-50/30">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono mb-2">Định hướng chiến dịch (Source Brief)</span>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto p-3 border border-slate-100 bg-white rounded-lg">
                  {campaignDetail.campaign.sourceBrief}
                </pre>
              </div>

              {/* Content Pillars */}
              {campaignDetail.campaign.contentPillars?.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono mb-2.5">Các trụ cột nội dung (Content Pillars)</span>
                  <div className="flex flex-wrap gap-2">
                    {campaignDetail.campaign.contentPillars.map((pillar, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 select-none">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        {pillar}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Slots Table */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono mb-3">Lịch trình đăng bài chi tiết (Campaign Slots)</span>
                <div className="border border-slate-150 rounded-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-150 select-none">
                          <th className="px-4 py-3">Slot #</th>
                          <th className="px-4 py-3">Thời gian đăng (Zoned)</th>
                          <th className="px-4 py-3">Nền tảng</th>
                          <th className="px-4 py-3">Pillar & Brief</th>
                          <th className="px-4 py-3">Trạng thái</th>
                          <th className="px-4 py-3 text-right">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {campaignDetail.slots.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-sans">Không tìm thấy lịch trình bài đăng nào cho chiến dịch này.</td>
                          </tr>
                        ) : (
                          campaignDetail.slots.map((slot, index) => {
                            const scheduledDate = new Date(slot.scheduledAt);
                            const dateFormatted = new Intl.DateTimeFormat('vi-VN', {
                              timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', hour12: false
                            }).format(scheduledDate);

                            return (
                              <tr key={slot._id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3.5 font-bold font-mono text-slate-400 select-none">{index + 1}</td>
                                <td className="px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">{dateFormatted}</td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 font-semibold text-slate-750 select-none">
                                    <Facebook size={12} className="text-blue-600" />
                                    Facebook
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 max-w-xs md:max-w-sm">
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-[10px] text-indigo-750 font-bold mb-1 select-none">
                                    {slot.pillar}
                                  </span>
                                  <p className="text-slate-600 truncate leading-relaxed font-sans" title={slot.topicBrief}>
                                    {slot.topicBrief}
                                  </p>
                                  {slot.objective && (
                                    <p className="text-[10px] text-slate-400 mt-0.5 italic font-sans">
                                      Mục tiêu: {slot.objective}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold select-none ${slotStatusColors[slot.status] || 'bg-slate-100 text-slate-650'}`}>
                                    {slotStatusLabel[slot.status] || slot.status}
                                  </span>
                                  {slot.status === 'failed' && slot.errorMessage && (
                                    <p className="text-[9px] text-red-500 mt-1 max-w-[150px] truncate font-mono" title={slot.errorMessage}>
                                      Lỗi: {slot.errorMessage}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                  {slot.status === 'published' && slot.publishedPostUrl ? (
                                    <a
                                      href={slot.publishedPostUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-850 transition"
                                    >
                                      Xem bài viết
                                      <ExternalLink size={10} />
                                    </a>
                                  ) : slot.status === 'failed' ? (
                                    <div className="flex items-center justify-end gap-1 text-[10px] text-red-500 font-medium font-sans">
                                      <AlertTriangle size={10} />
                                      Có lỗi đăng bài
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium italic select-none">
                                      Chờ xử lý
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-slate-400 font-sans">Không có thông tin chi tiết.</div>
          )}
        </div>
        
        {/* Modal Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition active:scale-98"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
export type { CampaignSlot };
