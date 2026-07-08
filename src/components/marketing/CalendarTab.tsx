import React, { useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { ContentApprovalCard, PublishEvent } from "../../types";
import { toast } from "../../pages/Toast";

interface CalendarTabProps {
  isUserRole: boolean;
  approvalCards: ContentApprovalCard[];
}

export default function CalendarTab({ isUserRole, approvalCards }: CalendarTabProps) {
  // 1. Calendar States
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
  const joinedEvents: PublishEvent[] = (approvalCards || [])
    .filter((c) => c.status === "scheduled")
    .map((c, index): PublishEvent | null => {
      let assignedDay = ((index * 5 + 11) % 28) + 1;
      if (c.scheduledDate) {
        const dateObj = new Date(c.scheduledDate);
        if (!isNaN(dateObj.getTime())) {
          if (dateObj.getFullYear() === currentYear && dateObj.getMonth() === currentMonth) {
            assignedDay = dateObj.getDate();
          } else {
            return null;
          }
        }
      }
      return {
        id: c.id,
        date: assignedDay,
        title: `[Lịch đăng] ${c.title}${c.scheduledTime ? ` - ${c.scheduledTime}` : ""}`,
        type: c.contentType,
        channel: c.channel,
        status: "Approved" as const,
      };
    })
    .filter((e): e is PublishEvent => e !== null);

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
                  className={`h-16 p-2 text-left rounded-xl border transition-all cursor-pointer relative ${
                    isSelected 
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
          👉 Click chọn các ngày có gắn sự kiện để truy lục lịch truyền thông tương ứng của iGen ERP
        </div>
      </div>

      {/* Right Card: Day content schedule timeline detail */}
      <div className="bg-white border p-6 rounded-2xl flex flex-col h-full min-h-[500px]" id="calendar_events_details_col">
        {selectedDay ? (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-850 text-sm font-sans tracking-tight uppercase">
                📅 Lịch đăng ngày {selectedDay}/{currentMonth + 1}/{currentYear}
              </h4>
              <button 
                onClick={() => setSelectedDay(null)}
                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-mono text-[9px] font-bold border border-indigo-150 transition-colors cursor-pointer"
              >
                Xem tất cả ✕
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Danh sách chuỗi nội dung truyền thông cần vận hành trong ngày.</p>

            <div className="flex-1 overflow-y-auto mt-6 space-y-4 text-xs text-slate-550 text-left">
              {joinedEvents.filter(e => e.date === selectedDay).length === 0 ? (
                <div className="p-8 text-center bg-gray-50 text-gray-400 italic rounded-xl">
                  Không có lịch đăng tải nào được lập cho ngày này! Bạn có thể chuyển bản nháp sang Chờ đăng tải.
                </div>
              ) : (
                joinedEvents.filter(e => e.date === selectedDay).map(event => (
                  <div key={event.id} className="p-4 bg-slate-50 border border-gray-155 rounded-xl relative flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 bg-slate-200 rounded-sm font-bold font-mono text-[9px] uppercase">
                        Kênh: {event.channel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-sm font-bold font-mono text-[9px] uppercase text-white ${
                        event.status === "Published" 
                          ? "bg-green-500" 
                          : event.status === "Approved" 
                            ? "bg-blue-600" 
                            : "bg-amber-500"
                      }`}>
                        {event.status}
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
                📅 Lịch đăng tháng {currentMonth + 1}/{currentYear}
              </h4>
              <span className="px-2 py-0.5 bg-slate-100 rounded font-mono text-[9px] font-bold border border-gray-200">
                {joinedEvents.length} bài viết
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Tất cả bài đăng dự kiến trong tháng này.</p>

            <div className="flex-1 overflow-y-auto mt-6 space-y-4 text-xs text-slate-550 text-left">
              {joinedEvents.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 text-gray-400 italic rounded-xl">
                  Không có lịch đăng tải nào được lập trong tháng này!
                </div>
              ) : (
                [...joinedEvents]
                  .sort((a, b) => a.date - b.date)
                  .map(event => (
                    <div key={event.id} className="p-4 bg-slate-50 border border-gray-150 rounded-xl relative flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="px-2 py-0.5 bg-slate-200 rounded-sm font-bold font-mono text-[9px] uppercase">
                          Ngày {event.date} • {event.channel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm font-bold font-mono text-[9px] uppercase text-white ${
                          event.status === "Published" 
                            ? "bg-green-500" 
                            : event.status === "Approved" 
                              ? "bg-blue-600" 
                              : "bg-amber-500"
                        }`}>
                          {event.status}
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
