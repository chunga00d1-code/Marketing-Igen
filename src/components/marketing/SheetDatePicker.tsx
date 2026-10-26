import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface SheetDatePickerProps {
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function SheetDatePicker({ value, min, max, onChange }: SheetDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parseDateKey(value || min || '') || new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = parseDateKey(value);
    if (selected) setMonth(selected);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstDayOffset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const previousMonthLastDay = dateKey(new Date(Date.UTC(year, monthIndex, 0)));
  const nextMonthFirstDay = dateKey(new Date(Date.UTC(year, monthIndex + 1, 1)));
  const selectedDate = parseDateKey(value);

  return (
    <div ref={containerRef} className="relative mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Chọn ngày đăng"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-normal text-slate-800 transition hover:border-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-100"
      >
        <span>{selectedDate ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(selectedDate) : 'Chọn ngày'}</span>
        <CalendarDays className="h-4 w-4 text-sky-600" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-sky-100 bg-white p-3 shadow-2xl shadow-slate-900/15">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex - 1, 1)))} disabled={Boolean(min && previousMonthLastDay < min)} aria-label="Tháng trước" className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize text-slate-800">{new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(month)}</span>
            <button type="button" onClick={() => setMonth(new Date(Date.UTC(year, monthIndex + 1, 1)))} disabled={Boolean(max && nextMonthFirstDay > max)} aria-label="Tháng sau" className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => <span key={day} className="py-1 text-[11px] font-semibold text-slate-400">{day}</span>)}
            {Array.from({ length: 42 }, (_, index) => {
              const day = new Date(Date.UTC(year, monthIndex, index - firstDayOffset + 1));
              const key = dateKey(day);
              if (day.getUTCMonth() !== monthIndex) return <span key={index} />;
              const disabled = Boolean((min && key < min) || (max && key > max));
              return <button key={key} type="button" disabled={disabled} onClick={() => { onChange(key); setOpen(false); }} aria-label={new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', dateStyle: 'full' }).format(day)} aria-pressed={value === key} className={`aspect-square rounded-lg text-xs transition ${value === key ? 'bg-sky-500 font-bold text-white shadow-sm' : 'text-slate-700 hover:bg-sky-50'} disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}>{day.getUTCDate()}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
