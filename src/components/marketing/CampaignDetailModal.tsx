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

const DEFAULT_SLOT_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700 border-slate-200',
  queued: 'bg-blue-50 text-blue-755 border-blue-200',
  generating: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
  scoring: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
  generating_media: 'bg-pink-50 text-pink-700 border-pink-200 animate-pulse',
  verifying: 'bg-cyan-50 text-cyan-700 border-cyan-200 animate-pulse',
  ready_to_publish: 'bg-teal-50 text-teal-750 border-teal-200',
  publishing: 'bg-yellow-50 text-yellow-700 border-yellow-200 animate-pulse',
  published: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-750 border-red-200',
  cancelled: 'bg-slate-150 text-slate-500 border-slate-200',
  skipped: 'bg-gray-150 text-gray-500 border-gray-200',
  retrying: 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse',
  needs_attention: 'bg-amber-50 text-amber-700 border-amber-200',
};

const DEFAULT_SLOT_STATUS_LABEL: Record<string, string> = {
  planned: 'Lên kế hoạch',
  queued: 'Trong hàng đợi',
  generating: 'Đang tạo bài viết...',
  scoring: 'Đang chấm điểm AI...',
  generating_media: 'Đang thiết kế ảnh...',
  verifying: 'Đang duyệt chất lượng...',
  ready_to_publish: 'Sẵn sàng đăng',
  publishing: 'Đang đăng...',
  published: 'Đã đăng thành công',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
  skipped: 'Đã bỏ qua',
  retrying: 'Đang thử lại...',
  needs_attention: 'Cần chú ý',
};

const getSlotProgress = (status: string): { percentage: number; label: string } | null => {
  switch (status) {
    case 'queued':
      return { percentage: 10, label: 'Chờ hàng đợi' };
    case 'generating':
      return { percentage: 30, label: 'Đang viết bài' };
    case 'scoring':
      return { percentage: 50, label: 'Đang chấm điểm AI' };
    case 'generating_media':
      return { percentage: 70, label: 'Đang tạo ảnh' };
    case 'verifying':
      return { percentage: 85, label: 'Đang duyệt bài' };
    case 'ready_to_publish':
      return { percentage: 95, label: 'Sẵn sàng đăng' };
    case 'publishing':
      return { percentage: 98, label: 'Đang gửi đăng' };
    case 'published':
      return { percentage: 100, label: 'Đã đăng' };
    case 'failed':
      return { percentage: 0, label: 'Lỗi' };
    case 'cancelled':
      return { percentage: 0, label: 'Đã hủy' };
    case 'skipped':
      return { percentage: 0, label: 'Đã bỏ qua' };
    case 'retrying':
      return { percentage: 40, label: 'Đang thử lại' };
    default:
      return null;
  }
};

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

  // Compute detailed status counts & next/last slots
  const now = new Date();
  const sortedSlots = [...(campaignDetail?.slots || [])].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  const totalSlots = sortedSlots.length;
  const publishedSlots = sortedSlots.filter((s) => s.status === 'published').length;
  const inProgressSlots = sortedSlots.filter((s) =>
    ['queued', 'generating', 'scoring', 'generating_media', 'verifying', 'ready_to_publish', 'publishing', 'retrying'].includes(s.status)
  ).length;

  const nextSlot = sortedSlots.find(
    (s) =>
      ['planned', 'queued', 'generating', 'scoring', 'generating_media', 'verifying', 'ready_to_publish', 'publishing', 'retrying'].includes(s.status) &&
      new Date(s.scheduledAt) > now
  );

  const lastPublishedSlot = [...sortedSlots]
    .reverse()
    .find((s) => s.status === 'published');

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
              {/* Real-time Activity Banner */}
              {campaignDetail.campaign.status === 'active' && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/25 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 flex flex-wrap items-center gap-1.5 leading-none">
                        Chiến dịch đang hoạt động tự động
                        <span className="text-[9px] font-bold font-mono text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 rounded animate-pulse">
                          Auto-Polling Live
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {inProgressSlots > 0
                          ? `Đang có ${inProgressSlots} bài viết đang trong tiến trình xử lý (AI soạn thảo, chấm điểm, thiết kế ảnh)...`
                          : 'Hệ thống đang chạy ngầm ổn định, chờ đến khung giờ tiếp theo để xử lý bài viết.'}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 text-left md:text-right shrink-0 font-sans leading-relaxed">
                    {nextSlot && (
                      <p>
                        <b>Bài tiếp theo:</b> {new Intl.DateTimeFormat('vi-VN', {
                          timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        }).format(new Date(nextSlot.scheduledAt))}
                      </p>
                    )}
                    {lastPublishedSlot && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        <b>Đã đăng gần nhất:</b> {new Intl.DateTimeFormat('vi-VN', {
                          timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        }).format(new Date(lastPublishedSlot.scheduledAt))}
                      </p>
                    )}
                  </div>
                </div>
              )}

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
                    Đã xuất bản {publishedSlots} / {totalSlots} bài viết
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{
                        width: `${totalSlots > 0 ? Math.round((publishedSlots / totalSlots) * 100) : 0}%`
                      }}
                    />
                  </div>
                  <span className="mt-1.5 block text-[9px] text-slate-400 font-bold font-mono">
                    Tiến độ hoàn thành: {totalSlots > 0 ? Math.round((publishedSlots / totalSlots) * 100) : 0}%
                  </span>
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
                        {sortedSlots.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-sans">Không tìm thấy lịch trình bài đăng nào cho chiến dịch này.</td>
                          </tr>
                        ) : (
                          sortedSlots.map((slot, index) => {
                            const scheduledDate = new Date(slot.scheduledAt);
                            const dateFormatted = new Intl.DateTimeFormat('vi-VN', {
                              timeZone: campaignDetail.campaign.timezone || 'Asia/Bangkok',
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', hour12: false
                            }).format(scheduledDate);

                            const progress = getSlotProgress(slot.status);

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
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold select-none ${slotStatusColors[slot.status] || DEFAULT_SLOT_STATUS_COLORS[slot.status] || 'bg-slate-100 text-slate-655 border-slate-200'}`}>
                                    {slotStatusLabel[slot.status] || DEFAULT_SLOT_STATUS_LABEL[slot.status] || slot.status}
                                  </span>
                                  {progress && progress.percentage > 0 && progress.percentage < 100 && (
                                    <div className="mt-1.5 w-28">
                                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold mb-0.5 font-mono select-none">
                                        <span>{progress.label}</span>
                                        <span>{progress.percentage}%</span>
                                      </div>
                                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-indigo-500 rounded-full animate-pulse transition-all duration-300"
                                          style={{ width: `${progress.percentage}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {slot.status === 'failed' && slot.errorMessage && (
                                    <p className="text-[9px] text-red-500 mt-1 max-w-[150px] truncate font-mono" title={slot.errorMessage}>
                                      Lỗi: {slot.errorMessage}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                  {(() => {
                                    if (slot.status === 'published' && slot.publishedPostUrl) {
                                      return (
                                        <a
                                          href={slot.publishedPostUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-850 transition cursor-pointer"
                                        >
                                          Xem bài viết
                                          <ExternalLink size={10} />
                                        </a>
                                      );
                                    }
                                    if (slot.status === 'failed') {
                                      return (
                                        <div className="flex items-center justify-end gap-1 text-[10px] text-red-500 font-medium font-sans">
                                          <AlertTriangle size={10} />
                                          Có lỗi đăng bài
                                        </div>
                                      );
                                    }
                                    if (slot.status === 'cancelled') {
                                      return (
                                        <span className="text-[10px] text-slate-400 font-medium italic select-none">
                                          Đã hủy
                                        </span>
                                      );
                                    }
                                    if (slot.status === 'skipped') {
                                      return (
                                        <span className="text-[10px] text-slate-400 font-medium italic select-none">
                                          Đã bỏ qua
                                        </span>
                                      );
                                    }
                                    if (slot.status === 'needs_attention') {
                                      return (
                                        <div className="flex items-center justify-end gap-1 text-[10px] text-amber-600 font-semibold font-sans">
                                          <AlertTriangle size={10} />
                                          Cần kiểm tra
                                        </div>
                                      );
                                    }
                                    if ([
                                      'generating',
                                      'scoring',
                                      'generating_media',
                                      'verifying',
                                      'ready_to_publish',
                                      'publishing',
                                      'retrying',
                                    ].includes(slot.status)) {
                                      return (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-650 font-semibold select-none animate-pulse">
                                          Đang xử lý
                                        </span>
                                      );
                                    }

                                    // Planned/Pending slots
                                    const scheduledTime = new Date(slot.scheduledAt).getTime();
                                    const diffMs = scheduledTime - now.getTime();

                                    if (diffMs > 3600000) {
                                      return (
                                        <span className="text-[10px] text-slate-400 font-medium select-none" title="Hệ thống tự động chạy trước giờ đăng 1 tiếng">
                                          Chờ chạy (trước 1h)
                                        </span>
                                      );
                                    }
                                    if (diffMs > 0) {
                                      return (
                                        <span className="text-[10px] text-indigo-550 font-bold animate-pulse select-none" title="Đang chuẩn bị khởi chạy">
                                          Chuẩn bị chạy
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="text-[10px] text-amber-600 font-medium select-none">
                                        Chờ xếp lịch chạy
                                      </span>
                                    );
                                  })()}
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
            className="rounded-xl border border-slate-200 bg-white px-4.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition active:scale-98 cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
export type { CampaignSlot };
