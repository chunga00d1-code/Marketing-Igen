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

  const [inputValue, setInputValue] = useState(timeString);

  useEffect(() => {
    setInputValue(timeString);
  }, [timeString]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;

    // 1. Only allow digits and colon
    val = val.replace(/[^0-9:]/g, "");

    // 2. Prevent multiple colons (keep only the first one)
    const parts = val.split(":");
    if (parts.length > 2) {
      val = parts[0] + ":" + parts.slice(1).join("");
    }

    // 3. Limit to max 5 characters (HH:MM)
    val = val.slice(0, 5);

    setInputValue(val);

    // Strict HH:MM check (24h format) to update parent immediately
    const strictTimeRegex = /^(0\d|1\d|2[0-3]):[0-5]\d$/;
    if (strictTimeRegex.test(val)) {
      onChange(val);
    }
  };

  const handleInputBlur = () => {
    const val = inputValue.trim();

    // 1. Try standard flexible HH:MM format first
    const flexibleTimeRegex = /^(\d{1,2}):(\d{1,2})$/;
    const match = val.match(flexibleTimeRegex);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        setInputValue(formatted);
        onChange(formatted);
        return;
      }
    }

    // 2. Try parsing pure digits if no colon is present (e.g. "930" -> "09:30")
    if (/^\d{1,4}$/.test(val)) {
      let h = 0;
      let m = 0;
      if (val.length === 4) {
        h = parseInt(val.slice(0, 2), 10);
        m = parseInt(val.slice(2, 4), 10);
      } else if (val.length === 3) {
        h = parseInt(val.slice(0, 1), 10);
        m = parseInt(val.slice(1, 3), 10);
      } else {
        h = parseInt(val, 10);
        m = 0;
      }

      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        setInputValue(formatted);
        onChange(formatted);
        return;
      }
    }

    // If not a valid format, reset to current timeString
    setInputValue(timeString);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      setIsOpen(false);
    }
  };

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
      <div className="relative mt-1.5 w-full">
        <input
          type="text"
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder="HH:MM"
          className="block w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-10 py-2.5 text-xs font-mono font-semibold text-slate-750 outline-none transition hover:bg-slate-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-indigo-600 transition disabled:text-slate-350 cursor-pointer disabled:cursor-not-allowed"
        >
          <Clock size={14} />
        </button>
      </div>

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
