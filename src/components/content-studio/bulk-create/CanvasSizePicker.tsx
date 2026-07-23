import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CANVAS_PRESETS, QUICK_CANVAS_PRESETS } from './constants';

interface CanvasSizePickerProps {
  size: { width: number; height: number };
  onChange: (size: { width: number; height: number }) => void;
}

export function CanvasSizePicker({ size, onChange }: CanvasSizePickerProps) {
  const selected = CANVAS_PRESETS.find(
    (preset) => preset.width === size.width && preset.height === size.height
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <label htmlFor="bulk-canvas-size" className="block text-sm font-extrabold text-slate-700">
        Kích thước thiết kế
      </label>
      <div className="relative mt-2">
        <select
          id="bulk-canvas-size"
          value={selected?.id || 'custom'}
          onChange={(event) => {
            const preset = CANVAS_PRESETS.find((item) => item.id === event.target.value);
            if (preset) onChange({ width: preset.width, height: preset.height });
          }}
          className="h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500"
        >
          {!selected && (
            <option value="custom">
              Kích thước đã lưu · {size.width} × {size.height}
            </option>
          )}
          {CANVAS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} · {preset.size} px
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
      </div>

      <p className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Chọn nhanh</p>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_CANVAS_PRESETS.map((quick) => {
          const preset = CANVAS_PRESETS.find((item) => item.id === quick.id)!;
          const active = preset.id === selected?.id;
          const ratio = preset.width / preset.height;
          const iconStyle =
            ratio >= 1
              ? { width: 28, height: Math.max(12, 28 / ratio) }
              : { width: Math.max(12, 28 * ratio), height: 28 };
          return (
            <button
              key={quick.id}
              type="button"
              onClick={() => onChange({ width: preset.width, height: preset.height })}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-bold transition ${
                active
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <span className="flex h-8 items-center justify-center">
                <span
                  className={`block rounded-sm border ${
                    active ? 'border-indigo-500 bg-white' : 'border-slate-400 bg-slate-50'
                  }`}
                  style={iconStyle}
                />
              </span>
              {quick.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span>{selected?.name || 'Kích thước tùy chỉnh'}</span>
        <strong className="text-slate-700">{size.width} × {size.height} px</strong>
      </div>
    </section>
  );
}
