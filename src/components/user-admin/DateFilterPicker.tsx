import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date
    : null;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DateFilterPicker({ label, value, onChange, align = "left" }: Props) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseDate(value) ?? new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseDate(value);
  const today = new Date();
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(visibleMonth);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const changeMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`${label}: ${selected ? selected.toLocaleDateString("vi-VN") : "Chọn ngày"}`}
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            const date = selected ?? new Date();
            setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          }
          setOpen((current) => !current);
        }}
        className={`flex min-w-32 items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition-colors hover:border-[#00ADFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ADFC]/30 ${open ? "border-[#00ADFC] text-slate-800" : "border-slate-200 text-slate-700"}`}
      >
        <span>{selected ? selected.toLocaleDateString("vi-VN") : "Chọn ngày"}</span>
        <CalendarDays size={16} className="shrink-0 text-[#00ADFC]" />
      </button>

      {open && (
        <div className={`absolute top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold capitalize text-slate-800">{monthLabel}</span>
            <div className="flex gap-1">
              <button type="button" aria-label="Tháng trước" onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-[#00ADFC]"><ChevronLeft size={17} /></button>
              <button type="button" aria-label="Tháng sau" onClick={() => changeMonth(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-[#00ADFC]"><ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => <span key={day} className="py-1 text-xs font-medium text-slate-400">{day}</span>)}
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1);
              const key = dateKey(date);
              const isSelected = value === key;
              const isToday = dateKey(today) === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={date.toLocaleDateString("vi-VN")}
                  aria-pressed={isSelected}
                  onClick={() => { onChange(key); setOpen(false); }}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors ${isSelected ? "bg-[#00ADFC] text-white" : isToday ? "bg-sky-50 text-[#0089C8]" : "text-slate-700 hover:bg-sky-50 hover:text-[#0089C8]"}`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-slate-500 hover:text-[#0089C8]">Xóa ngày</button>
            <button type="button" onClick={() => { onChange(dateKey(today)); setOpen(false); }} className="font-medium text-[#0089C8] hover:text-[#0075AD]">Hôm nay</button>
          </div>
        </div>
      )}
    </div>
  );
}
