/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { ContentApprovalCard, PublishEvent } from "../../types";
import { toast } from "../../pages/Toast";
import { marketingCampaignService, MarketingCampaignCalendarSlot } from "../../services/marketingCampaignService";

interface CalendarTabProps {
  isUserRole: boolean;
  approvalCards: ContentApprovalCard[];
}

type CalendarEvent = PublishEvent & { statusLabel: string };

const campaignStatusLabel: Record<string, string> = {
  planned: "Đã lên lịch",
  queued: "Chờ xử lý",
  generating: "Đang tạo",
  researching: "Đang nghiên cứu",
  writing: "Đang viết",
  scoring: "Đang chấm điểm",
  awaiting_assets: "Chờ ảnh thiết kế",
  generating_media: "Đang tạo media",
  verifying: "Đang kiểm tra",
  pending_approval: "Chờ duyệt",
  ready_to_publish: "Sẵn sàng đăng",
  publishing: "Đang đăng",
  published: "Đã đăng",
  retrying: "Đang thử lại",
  needs_attention: "Cần xử lý",
  failed: "Thất bại",
  skipped: "Đã bỏ qua",
  cancelled: "Đã hủy",
};

export default function CalendarTab({ isUserRole, approvalCards }: CalendarTabProps) {
  // 1. Calendar States
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [campaignSlots, setCampaignSlots] = useState<MarketingCampaignCalendarSlot[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const monthNamesVi = [
    "THÁNG 1", "THÁNG 2", "THÁNG 3", "THÁNG 4", "THÁNG 5", "THÁNG 6",
    "THÁNG 7", "THÁNG 8", "THÁNG 9", "THÁNG 10", "THÁNG 11", "THÁNG 12"
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDay(null);
  };

  const startOffset = (() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    return firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  })();

  const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  useEffect(() => {
    let active = true;
    const month = String(currentMonth + 1).padStart(2, "0");
    const startDate = `${currentYear}-${month}-01`;
    const endDate = `${currentYear}-${month}-${String(daysInMonth).padStart(2, "0")}`;
    setLoadingCalendar(true);
    marketingCampaignService.calendar(startDate, endDate)
      .then((result) => {
        if (active) setCampaignSlots(result.slots);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCampaignSlots([]);
        toast.error(error instanceof Error ? error.message : "Không thể tải lịch chiến dịch.");
      })
      .finally(() => {
        if (active) setLoadingCalendar(false);
      });
    return () => {
      active = false;
    };
  }, [currentMonth, currentYear, daysInMonth]);

  const joinedEvents = useMemo<CalendarEvent[]>(() => {
    const campaignEvents = campaignSlots
      .map((slot): CalendarEvent | null => {
        const scheduledAt = new Date(slot.scheduledAt);
        if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getFullYear() !== currentYear || scheduledAt.getMonth() !== currentMonth) return null;
        const time = scheduledAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        const failedStatus = ["failed", "needs_attention", "cancelled", "skipped"].includes(slot.status);
        return {
          id: `campaign-${slot._id}`,
          date: scheduledAt.getDate(),
          title: `${slot.campaignType === "single" ? "[Bài đăng nhanh]" : `[${slot.campaignTitle}]`} ${slot.topicBrief} - ${time}`,
          type: slot.mediaType,
          channel: slot.platform,
          status: slot.status === "published" ? "Published" : failedStatus ? "Draft" : "Approved",
          statusLabel: campaignStatusLabel[slot.status] || slot.status,
        };
      })
      .filter((event): event is CalendarEvent => event !== null);

    const legacyEvents = (approvalCards || [])
      .filter((card) => card.status === "scheduled" && !card.campaignSlotId)
      .map((card, index): CalendarEvent | null => {
        let assignedDay = ((index * 5 + 11) % 28) + 1;
        if (card.scheduledDate) {
          const dateObj = new Date(card.scheduledDate);
          if (!Number.isFinite(dateObj.getTime())) return null;
          if (dateObj.getFullYear() !== currentYear || dateObj.getMonth() !== currentMonth) return null;
          assignedDay = dateObj.getDate();
        }
        return {
          id: `legacy-${card.id}`,
          date: assignedDay,
          title: `[Nội dung cũ] ${card.title}${card.scheduledTime ? ` - ${card.scheduledTime}` : ""}`,
          type: card.contentType,
          channel: card.channel,
          status: "Approved",
          statusLabel: "Đã lên lịch",
        };
      })
      .filter((event): event is CalendarEvent => event !== null);

    return [...campaignEvents, ...legacyEvents];
  }, [approvalCards, campaignSlots, currentMonth, currentYear]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="publishing_calendar_block">
      {/* Left 2 Cols: Monthly grid view */}
      <div className="xl:col-span-2 bg-white border border-slate-200/60 p-6 rounded-3xl text-xs flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow duration-300 animate-fadeIn" id="calendar_grid_container">
        <div>
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-slate-800 text-sm font-sans tracking-tight flex items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
              Lịch Xuất Bản Content • {monthNamesVi[currentMonth]}, {currentYear}
            </h4>
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/60 text-[11px] font-mono select-none">
              <button onClick={handlePrevMonth} className="p-1 px-2 hover:bg-white rounded-lg cursor-pointer transition-colors shadow-3xs font-extrabold text-slate-650">‹</button>
              <span className="font-bold px-2 text-slate-800 uppercase text-[10px] tracking-wide">{monthNamesVi[currentMonth]}, {currentYear}</span>
              <button onClick={handleNextMonth} className="p-1 px-2 hover:bg-white rounded-lg cursor-pointer transition-colors shadow-3xs font-extrabold text-slate-650">›</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 bg-slate-50/80 p-1.5 rounded-2xl text-center font-bold tracking-wider text-slate-500 text-[10px] uppercase mb-2 border border-slate-200/40">
            <div>T2</div>
            <div>T3</div>
            <div>T4</div>
            <div>T5</div>
            <div>T6</div>
            <div>T7</div>
            <div>CN</div>
          </div>

          {/* Grid squares rendering dynamic items */}
          <div className="grid grid-cols-7 gap-1.5 font-mono text-[11px]" id="calendar_days_grid">
            {/* Mock padded previous month days */}
            {Array.from({ length: startOffset }).map((_, idx) => {
              const dayVal = prevMonthLastDate - startOffset + idx + 1;
              return (
                <div key={`prev-${idx}`} className="h-16 p-2 bg-slate-50 text-slate-300 rounded-xl select-none text-left opacity-30 border border-transparent">
                  {dayVal}
                </div>
              );
            })}

            {Array.from({ length: daysInMonth }).map((_, dIdx) => {
              const dayNum = dIdx + 1;
              const matchEvents = joinedEvents.filter(e => e.date === dayNum);
              const isSelected = selectedDay === dayNum;
              return (
                <div
                  key={dayNum}
                  onClick={() => setSelectedDay(dayNum)}
                  className={`h-16 p-2 text-left rounded-xl border transition-all cursor-pointer relative ${isSelected
                      ? "bg-indigo-50/50 border-indigo-400 text-indigo-900 shadow-2xs"
                      : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200 hover:shadow-3xs"
                    }`}
                >
                  <span className="font-extrabold select-none text-[10px] text-slate-700">{dayNum}</span>
                  {matchEvents.length > 0 && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-col gap-0.5">
                      {matchEvents.slice(0, 2).map(e => {
                        const eventStyle =
                          e.channel === "Facebook" ? "bg-blue-600 text-white" :
                            e.channel === "TikTok" ? "bg-slate-900 text-white border border-slate-950" :
                              e.channel === "Zalo" ? "bg-sky-500 text-white" :
                                "bg-indigo-650 text-white";
                        return (
                          <div key={e.id} className={`px-1 rounded-md text-[8px] font-sans truncate font-bold uppercase tracking-wider text-center ${eventStyle}`}>
                            {e.channel}
                          </div>
                        );
                      })}
                      {matchEvents.length > 2 && (
                        <div className="text-[7px] text-slate-400 text-center font-bold font-sans tracking-wide leading-none mt-0.5">
                          + {matchEvents.length - 2} bài
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border-t border-slate-200/60 rounded-b-2xl select-none text-center text-[10px] text-slate-400 font-mono mt-5">
          Click chọn các ngày có gắn sự kiện để truy lục lịch truyền thông tương ứng của iGen Marketing
        </div>
      </div>

      {/* Right Card: Day content schedule timeline detail */}
      <div className="bg-white border p-6 rounded-2xl flex flex-col h-full min-h-[500px]" id="calendar_events_details_col">
        {selectedDay ? (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-850 text-sm font-sans tracking-tight uppercase">
                Lịch Đăng ngày {selectedDay}/{currentMonth + 1}/{currentYear}
              </h4>
              <button
                onClick={() => setSelectedDay(null)}
                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-mono text-[9px] font-bold border border-indigo-150 transition-colors cursor-pointer"
              >
                Xem tất cả
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Danh sách chuỗi nội dung cần vận hành trong ngày.</p>

            <div className="flex-1 overflow-y-auto mt-6 space-y-4 text-xs text-slate-550 text-left">
              {joinedEvents.filter(e => e.date === selectedDay).length === 0 ? (
                <div className="p-8 text-center bg-gray-50 text-gray-400 italic rounded-xl">
                  {loadingCalendar ? "Đang tải lịch chiến dịch..." : "Không có lịch đăng tải nào trong ngày này."}
                </div>
              ) : (
                joinedEvents.filter(e => e.date === selectedDay).map(event => (
                  <div key={event.id} className="p-4 bg-slate-50 border border-gray-155 rounded-xl relative flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 bg-slate-200 rounded-sm font-bold font-mono text-[9px] uppercase">
                        Kênh: {event.channel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-sm font-bold font-mono text-[9px] uppercase text-white ${event.status === "Published"
                          ? "bg-green-500"
                          : event.status === "Approved"
                            ? "bg-blue-600"
                            : "bg-amber-500"
                        }`}>
                        {event.statusLabel}
                      </span>
                    </div>
                    <h5 className="font-bold font-sans text-xs text-slate-800 leading-normal">{event.title}</h5>
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Định dạng: {event.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-850 text-sm font-sans tracking-tight uppercase">
                Lịch Đăng tháng {currentMonth + 1}/{currentYear}
              </h4>
              <span className="px-2 py-0.5 bg-slate-100 rounded font-mono text-[9px] font-bold border border-gray-200">
                {loadingCalendar ? "Đang tải..." : `${joinedEvents.length} bài viết`}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Tất cả bài đăng dự kiến trong tháng này.</p>

            <div className="flex-1 overflow-y-auto mt-6 space-y-4 text-xs text-slate-550 text-left">
              {joinedEvents.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 text-gray-400 italic rounded-xl">
                  {loadingCalendar ? "Đang tải lịch chiến dịch..." : "Không có lịch đăng tải nào trong tháng này!"}
                </div>
              ) : (
                [...joinedEvents]
                  .sort((a, b) => a.date - b.date)
                  .map(event => (
                    <div key={event.id} className="p-4 bg-slate-50 border border-gray-150 rounded-xl relative flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="px-2 py-0.5 bg-slate-200 rounded-sm font-bold font-mono text-[9px] uppercase">
                          NgÃ y {event.date} â€¢ {event.channel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm font-bold font-mono text-[9px] uppercase text-white ${event.status === "Published"
                            ? "bg-green-500"
                            : event.status === "Approved"
                              ? "bg-blue-600"
                              : "bg-amber-500"
                          }`}>
                          {event.statusLabel}
                        </span>
                      </div>
                      <h5 className="font-bold font-sans text-xs text-slate-800 leading-normal">{event.title}</h5>
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Định dạng: {event.type}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


