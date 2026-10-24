/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Lightbulb } from "lucide-react";
import { ContentApprovalCard, PublishEvent } from "../../types";
import { toast } from "../../pages/Toast";
import { marketingCampaignService, MarketingCampaignCalendarSlot } from "../../services/marketingCampaignService";

interface CalendarTabProps {
  isUserRole: boolean;
  approvalCards: ContentApprovalCard[];
}

type CalendarEvent = PublishEvent & { statusLabel: string };

const EVENTS_PER_PAGE = 6;

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
  const [currentPage, setCurrentPage] = useState(1);
  const today = new Date();

  const monthNamesVi = [
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
    "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
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

  const displayedEvents = useMemo(
    () => [...joinedEvents]
      .filter((event) => selectedDay === null || event.date === selectedDay)
      .sort((a, b) => a.date - b.date),
    [joinedEvents, selectedDay],
  );

  const totalPages = Math.max(1, Math.ceil(displayedEvents.length / EVENTS_PER_PAGE));
  const paginatedEvents = displayedEvents.slice(
    (currentPage - 1) * EVENTS_PER_PAGE,
    currentPage * EVENTS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [currentMonth, currentYear, selectedDay]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginationControls = displayedEvents.length > EVENTS_PER_PAGE && (
    <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
      <span className="text-[10px] text-slate-400 font-mono">
        Trang {currentPage}/{totalPages}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={currentPage === 1}
          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-normal text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Trước
        </button>
        <button
          type="button"
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          disabled={currentPage === totalPages}
          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-normal text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]" id="publishing_calendar_block">
      {/* Left 2 Cols: Monthly grid view */}
      <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 text-xs shadow-sm" id="calendar_grid_container">
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 font-sans text-base font-normal tracking-tight text-slate-900">
              <CalendarDays className="h-5 w-5 shrink-0 text-sky-500" />
              Lịch Xuất Bản Content • {monthNamesVi[currentMonth]}, {currentYear}
            </h4>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs select-none">
              <button type="button" onClick={handlePrevMonth} aria-label="Tháng trước" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-700 transition hover:bg-white"><ChevronLeft size={16} /></button>
              <span className="min-w-28 text-center font-normal text-slate-900">{monthNamesVi[currentMonth]}, {currentYear}</span>
              <button type="button" onClick={handleNextMonth} aria-label="Tháng sau" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-700 transition hover:bg-white"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 rounded-t-xl border border-b-0 border-slate-200 bg-sky-50 py-1.5 text-center text-xs font-normal text-slate-500">
            <div>T2</div>
            <div>T3</div>
            <div>T4</div>
            <div>T5</div>
            <div>T6</div>
            <div>T7</div>
            <div>CN</div>
          </div>

          {/* Grid squares rendering dynamic items */}
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl border border-slate-200 bg-slate-200 font-sans text-xs" id="calendar_days_grid">
            {/* Mock padded previous month days */}
            {Array.from({ length: startOffset }).map((_, idx) => {
              const dayVal = prevMonthLastDate - startOffset + idx + 1;
              return (
                <div key={`prev-${idx}`} className="h-16 bg-slate-50 p-2 text-left text-slate-400 select-none">
                  {dayVal}
                </div>
              );
            })}

            {Array.from({ length: daysInMonth }).map((_, dIdx) => {
              const dayNum = dIdx + 1;
              const matchEvents = joinedEvents.filter(e => e.date === dayNum);
              const isSelected = selectedDay === dayNum;
              const isToday = currentYear === today.getFullYear() && currentMonth === today.getMonth() && dayNum === today.getDate();
              return (
                <div
                  key={dayNum}
                  onClick={() => setSelectedDay(dayNum)}
                  title={isToday ? 'Hôm nay' : undefined}
                  className={`relative h-16 cursor-pointer p-2 text-left transition-colors ${isSelected
                      ? "bg-sky-50 text-sky-900 ring-2 ring-inset ring-sky-400"
                      : isToday ? "bg-sky-50/70 hover:bg-sky-100" : "bg-white hover:bg-sky-50/50"
                    }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-normal select-none ${isToday ? 'bg-blue-600 text-white' : 'text-slate-900'}`}>{dayNum}</span>
                    {isToday && <span className="text-[10px] font-normal text-blue-700">Hôm nay</span>}
                  </div>
                  {matchEvents.length > 0 && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-col gap-0.5">
                      {matchEvents.slice(0, 2).map(e => {
                        const eventStyle =
                          e.channel === "Facebook" ? "bg-[#1877f2] text-white" :
                            e.channel === "TikTok" ? "bg-slate-900 text-white border border-slate-950" :
                              e.channel === "Zalo" ? "bg-sky-500 text-white" :
                                "bg-indigo-650 text-white";
                        return (
                          <div key={e.id} className={`px-1 rounded-md text-[8px] font-sans truncate font-normal uppercase tracking-wider text-center ${eventStyle}`}>
                            {e.channel}
                          </div>
                        );
                      })}
                      {matchEvents.length > 2 && (
                        <div className="text-[7px] text-slate-400 text-center font-normal font-sans tracking-wide leading-none mt-0.5">
                          + {matchEvents.length - 2} bài
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {Array.from({ length: (7 - ((startOffset + daysInMonth) % 7)) % 7 }).map((_, index) => (
              <div key={`next-${index}`} className="h-16 bg-slate-50" aria-hidden="true" />
            ))}
          </div>
        </div>

        <div className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-center text-xs text-slate-500 select-none">
          <Lightbulb className="h-4 w-4 shrink-0 text-sky-500" />
          <span>Click chọn các ngày có gắn sự kiện để truy lục lịch truyền thông tương ứng của iGen Marketing</span>
        </div>
      </div>

      {/* Right Card: Day content schedule timeline detail */}
      <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" id="calendar_events_details_col">
        {selectedDay ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-sans text-base font-normal tracking-tight text-slate-900">
                Lịch Đăng ngày {selectedDay}/{currentMonth + 1}/{currentYear}
              </h4>
              <button
                onClick={() => setSelectedDay(null)}
                className="cursor-pointer rounded-full bg-sky-50 px-3 py-1.5 text-xs font-normal text-sky-700 transition-colors hover:bg-sky-100"
              >
                Xem tất cả
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">Danh sách chuỗi nội dung cần vận hành trong ngày.</p>

            <div className="mt-6 flex-1 space-y-4 overflow-y-auto rounded-2xl bg-slate-50/60 p-4 text-left text-xs text-slate-600">
              {displayedEvents.length === 0 ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center gap-5 text-center text-sm text-slate-500">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 shadow-sm"><span className="absolute left-5 top-6 h-1.5 w-9 rounded-full bg-sky-400" /><span className="absolute left-5 top-10 h-1.5 w-12 rounded-full bg-sky-200" /><span className="absolute left-5 top-14 h-1.5 w-8 rounded-full bg-sky-200" /><CalendarDays className="absolute -bottom-2 -right-2 h-10 w-10 rounded-xl border-4 border-white bg-sky-500 p-1.5 text-white" /></div>
                  <span>{loadingCalendar ? "Đang tải lịch chiến dịch..." : "Không có lịch đăng tải nào trong ngày này."}</span>
                </div>
              ) : (
                paginatedEvents.map(event => (
                  <div key={event.id} className="p-4 bg-slate-50 border border-gray-155 rounded-xl relative flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 bg-slate-200 rounded-sm font-normal font-mono text-[9px] uppercase">
                        Kênh: {event.channel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-sm font-normal font-mono text-[9px] uppercase text-white ${event.status === "Published"
                          ? "bg-green-500"
                          : event.status === "Approved"
                            ? "bg-blue-600"
                            : "bg-amber-500"
                        }`}>
                        {event.statusLabel}
                      </span>
                    </div>
                    <h5 className="font-normal font-sans text-xs text-slate-800 leading-normal">{event.title}</h5>
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Định dạng: {event.type}
                    </span>
                  </div>
                ))
              )}
            </div>
            {paginationControls}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-sans text-base font-normal tracking-tight text-slate-900">
                Lịch Đăng tháng {currentMonth + 1}/{currentYear}
              </h4>
              <span className="shrink-0 rounded-full bg-sky-50 px-4 py-2 text-xs font-normal text-slate-800">
                {loadingCalendar ? "Đang tải..." : `${joinedEvents.length} bài viết`}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Tất cả bài đăng dự kiến trong tháng này.</p>

            <div className="mt-6 flex-1 space-y-4 overflow-y-auto rounded-2xl bg-slate-50/60 p-4 text-left text-xs text-slate-600">
              {displayedEvents.length === 0 ? (
                <div className="flex h-full min-h-72 flex-col items-center justify-center gap-5 text-center text-sm text-slate-500">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 shadow-sm"><span className="absolute left-5 top-6 h-1.5 w-9 rounded-full bg-sky-400" /><span className="absolute left-5 top-10 h-1.5 w-12 rounded-full bg-sky-200" /><span className="absolute left-5 top-14 h-1.5 w-8 rounded-full bg-sky-200" /><CalendarDays className="absolute -bottom-2 -right-2 h-10 w-10 rounded-xl border-4 border-white bg-sky-500 p-1.5 text-white" /></div>
                  <span>{loadingCalendar ? "Đang tải lịch chiến dịch..." : "Không có lịch đăng tải nào trong tháng này!"}</span>
                </div>
              ) : (
                paginatedEvents.map(event => (
                    <div key={event.id} className="p-4 bg-slate-50 border border-gray-150 rounded-xl relative flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="px-2 py-0.5 bg-slate-200 rounded-sm font-normal font-mono text-[9px] uppercase">
                          Ngày {event.date} • {event.channel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm font-normal font-mono text-[9px] uppercase text-white ${event.status === "Published"
                            ? "bg-green-500"
                            : event.status === "Approved"
                              ? "bg-blue-600"
                              : "bg-amber-500"
                          }`}>
                          {event.statusLabel}
                        </span>
                      </div>
                      <h5 className="font-normal font-sans text-xs text-slate-800 leading-normal">{event.title}</h5>
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Định dạng: {event.type}
                      </span>
                    </div>
                  ))
              )}
            </div>
            {paginationControls}
          </div>
        )}
      </div>
    </div>
  );
}


