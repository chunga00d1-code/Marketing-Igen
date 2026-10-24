import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

type FilterKey = "campaign" | "platform" | "from" | "to";

interface ReportFilterControlsProps {
  campaigns: { value: string; label: string }[];
  campaignId: string;
  platform: string;
  startDate: string;
  endDate: string;
  onCampaignChange: (value: string) => void;
  onPlatformChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PLATFORM_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "Facebook", label: "Facebook Page" },
  { value: "TikTok", label: "TikTok Channel" },
];

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

function dateLabel(value: string): string {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("vi-VN") : "Chọn ngày";
}

export default function ReportFilterControls({
  campaigns,
  campaignId,
  platform,
  startDate,
  endDate,
  onCampaignChange,
  onPlatformChange,
  onStartDateChange,
  onEndDateChange,
}: ReportFilterControlsProps) {
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchors = useRef<Record<FilterKey, HTMLButtonElement | null>>({ campaign: null, platform: null, from: null, to: null });
  const popoverRef = useRef<HTMLDivElement>(null);
  const focusedFilter = useRef<FilterKey | null>(null);

  useEffect(() => {
    if (!openFilter) return;
    const updatePosition = () => {
      const anchor = anchors.current[openFilter];
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const isDate = openFilter === "from" || openFilter === "to";
      const width = isDate ? 292 : 264;
      const estimatedHeight = isDate ? 352 : 248;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const showAbove = below < estimatedHeight + 16 && above > below;
      setPosition({
        top: showAbove ? Math.max(8, rect.top - estimatedHeight - 8) : rect.bottom + 8,
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
        width,
      });
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !anchors.current[openFilter]?.contains(target)) {
        setOpenFilter(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenFilter(null);
        anchors.current[openFilter]?.focus();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openFilter]);

  useEffect(() => {
    if (!openFilter) {
      focusedFilter.current = null;
      return;
    }
    if (!position || focusedFilter.current === openFilter) return;
    const firstChoice = popoverRef.current?.querySelector<HTMLButtonElement>("[aria-selected='true']")
      ?? popoverRef.current?.querySelector<HTMLButtonElement>("button");
    firstChoice?.focus();
    focusedFilter.current = openFilter;
  }, [openFilter, position]);

  const toggle = (key: FilterKey) => {
    if (openFilter === key) {
      setOpenFilter(null);
      return;
    }
    if (key === "from" || key === "to") {
      const selected = parseDate(key === "from" ? startDate : endDate) ?? new Date();
      setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
    setPosition(null);
    setOpenFilter(key);
  };

  const filterButton = (key: FilterKey, label: string, value: string, isDate = false) => (
    <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-white/90 px-3 py-1 shadow-sm">
      <span className="text-[11px] text-slate-500">{label}:</span>
      <button
        ref={(element) => { anchors.current[key] = element; }}
        type="button"
        aria-label={`${label}: ${value}`}
        aria-haspopup={isDate ? "dialog" : "listbox"}
        aria-expanded={openFilter === key}
        onClick={() => toggle(key)}
        className={`flex min-w-24 max-w-40 cursor-pointer items-center justify-between gap-2 rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-800 transition-colors hover:border-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${openFilter === key ? "border-sky-400 bg-sky-50/60" : "border-slate-200"}`}
      >
        <span className="truncate">{value}</span>
        {isDate ? <CalendarDays className="h-3.5 w-3.5 shrink-0 text-sky-500" /> : <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${openFilter === key ? "rotate-180" : ""}`} />}
      </button>
    </div>
  );

  const selectOption = (key: "campaign" | "platform", value: string) => {
    if (key === "campaign") onCampaignChange(value);
    else onPlatformChange(value);
    setOpenFilter(null);
    anchors.current[key]?.focus();
  };

  const selectDate = (value: string) => {
    if (openFilter === "from") onStartDateChange(value);
    else if (openFilter === "to") onEndDateChange(value);
    if (openFilter) anchors.current[openFilter]?.focus();
    setOpenFilter(null);
  };

  const isDateOpen = openFilter === "from" || openFilter === "to";
  const selectedDate = openFilter === "from" ? startDate : endDate;
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const today = new Date();
  const monthLabel = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(visibleMonth);
  const options = openFilter === "campaign" ? [{ value: "", label: "Tất cả" }, ...campaigns] : PLATFORM_OPTIONS;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {filterButton("campaign", "Chiến dịch", campaigns.find((item) => item.value === campaignId)?.label ?? "Tất cả")}
        {filterButton("platform", "Nền tảng", PLATFORM_OPTIONS.find((item) => item.value === platform)?.label ?? "Tất cả")}
        {filterButton("from", "Từ", dateLabel(startDate), true)}
        {filterButton("to", "Đến", dateLabel(endDate), true)}
      </div>
      {openFilter && position && createPortal(
        <div
          ref={popoverRef}
          role={isDateOpen ? "dialog" : "listbox"}
          aria-label={isDateOpen ? `Chọn ngày ${openFilter === "from" ? "bắt đầu" : "kết thúc"}` : `Chọn ${openFilter === "campaign" ? "chiến dịch" : "nền tảng"}`}
          onKeyDown={(event) => {
            if (isDateOpen || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const choices = Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>("[role='option']") ?? []);
            const currentIndex = choices.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : event.key === "ArrowDown"
              ? Math.min(currentIndex + 1, choices.length - 1)
              : Math.max(currentIndex - 1, 0);
            choices[nextIndex]?.focus();
            event.preventDefault();
          }}
          className="fixed z-[100] max-h-[min(352px,calc(100vh-16px))] overflow-y-auto rounded-2xl border border-sky-100 bg-white p-2 shadow-[0_16px_48px_rgba(30,77,125,0.18)]"
          style={position}
        >
          {isDateOpen ? (
            <div className="p-2">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm capitalize text-slate-800">{monthLabel}</span>
                <div className="flex gap-1">
                  <button type="button" aria-label="Tháng trước" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-600"><ChevronLeft size={17} /></button>
                  <button type="button" aria-label="Tháng sau" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-600"><ChevronRight size={17} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((day) => <span key={day} className="py-1 text-xs text-slate-400">{day}</span>)}
                {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1);
                  const key = dateKey(date);
                  const isSelected = selectedDate === key;
                  const isToday = dateKey(today) === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={date.toLocaleDateString("vi-VN")}
                      aria-pressed={isSelected}
                      onClick={() => selectDate(key)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${isSelected ? "bg-sky-500 text-white" : isToday ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200" : "text-slate-700 hover:bg-sky-50 hover:text-sky-700"}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <button type="button" onClick={() => selectDate("")} className="rounded-lg px-2 py-1.5 text-slate-500 hover:bg-slate-50">Xóa ngày</button>
                <button type="button" onClick={() => selectDate(dateKey(today))} className="rounded-lg px-2 py-1.5 text-sky-600 hover:bg-sky-50">Hôm nay</button>
              </div>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {options.map((option) => {
                const selected = option.value === (openFilter === "campaign" ? campaignId : platform);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={option.label}
                    onClick={() => selectOption(openFilter as "campaign" | "platform", option.value)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${selected ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-sky-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
