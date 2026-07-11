import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";

interface CustomTimePickerProps {
  value: string; // Format "HH:MM"
  onChange: (newValue: string) => void;
  disabled?: boolean;
}

export default function CustomTimePicker({ value, onChange, disabled }: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Safeguard format and parse hour/minute
  const timeString = typeof value === "string" && value.includes(":") ? value : "09:00";
  const [hour, minute] = timeString.split(":");

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  
  // Create 5-minute step increments, adding the current minute if it is not a multiple of 5
  const baseMinutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
  const minutesList = [...baseMinutes];
  if (!minutesList.includes(minute)) {
    minutesList.push(minute);
    minutesList.sort((a, b) => Number(a) - Number(b));
  }

  const handleSelectHour = (h: string) => {
    onChange(`${h}:${minute}`);
  };

  const handleSelectMinute = (m: string) => {
    onChange(`${hour}:${m}`);
  };

  return (
    <div className="relative font-sans w-full" ref={containerRef} id="custom_time_picker_container">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-750 outline-none transition hover:bg-slate-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
      >
        <span>{timeString}</span>
        <Clock size={14} className="text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 md:left-0 z-50 mt-1.5 flex w-44 rounded-2xl border border-slate-150 bg-white p-3 shadow-xl animate-fadeIn">
          <div className="flex w-full gap-2">
            {/* Hours Column */}
            <div className="flex-1">
              <div className="mb-1.5 text-center text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Giờ</div>
              <div className="h-44 overflow-y-auto pr-1 select-none scrollbar-thin scrollbar-thumb-slate-200">
                {hours.map((h) => {
                  const isSelected = h === hour;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleSelectHour(h)}
                      className={`block w-full rounded-lg py-1.5 text-center text-xs font-mono font-bold transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="w-px bg-slate-100 self-stretch my-1" />

            {/* Minutes Column */}
            <div className="flex-1">
              <div className="mb-1.5 text-center text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Phút</div>
              <div className="h-44 overflow-y-auto pr-1 select-none scrollbar-thin scrollbar-thumb-slate-200">
                {minutesList.map((m) => {
                  const isSelected = m === minute;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectMinute(m)}
                      className={`block w-full rounded-lg py-1.5 text-center text-xs font-mono font-bold transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
