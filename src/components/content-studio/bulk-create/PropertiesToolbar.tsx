import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Minus,
  Plus,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Copy,
  Eraser,
  LoaderCircle,
  PaintBucket,
  SlidersHorizontal,
  WandSparkles,
  Lock,
  Unlock,
  Trash2,
  MousePointer2,
} from 'lucide-react';
import type { TemplateLayer } from './types';
import { clamp } from './utils';

const COLOR_SWATCHES = [
  '#111827', '#475569', '#64748b', '#94a3b8', '#e2e8f0', '#ffffff',
  '#7f1d1d', '#dc2626', '#f97316', '#facc15', '#22c55e', '#14b8a6',
  '#0ea5e9', '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#ec4899',
  '#fecaca', '#fed7aa', '#fef3c7', '#dcfce7', '#ccfbf1', '#dbeafe',
  '#ddd6fe', '#fce7f3', '#7c2d12', '#a16207', '#166534', '#0f766e',
  '#1d4ed8', '#3730a3', '#6b21a8', '#9d174d',
];

function VerticalTextAlignIcon({
  position,
  className,
}: {
  position: 'top' | 'center' | 'bottom';
  className?: string;
}) {
  const lines = position === 'top' ? [7, 10, 13] : position === 'center' ? [10, 13, 16] : [13, 16, 19];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      {lines.map((y, index) => <path key={y} d={`M${index === 1 ? 7 : 8} ${y}h${index === 1 ? 10 : 8}`} />)}
    </svg>
  );
}

function VerticalAlignTop({ className }: { className?: string }) {
  return <VerticalTextAlignIcon position="top" className={className} />;
}

function VerticalAlignCenter({ className }: { className?: string }) {
  return <VerticalTextAlignIcon position="center" className={className} />;
}

function VerticalAlignBottom({ className }: { className?: string }) {
  return <VerticalTextAlignIcon position="bottom" className={className} />;
}

interface PropertiesToolbarProps {
  selectedLayer: TemplateLayer | undefined;
  recordLayerHistory: () => void;
  updateLayer: (id: string, values: Partial<TemplateLayer>) => void;
  changeLayer: (id: string, values: Partial<TemplateLayer>) => void;
  duplicateLayer: (layer: TemplateLayer) => void;
  removeLayer: (id: string) => void;
  alignLayer: (alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;
  onRemoveImageBackground: () => void;
  removingBackground: boolean;
  onOptimizeReadability: () => void;
}

export function PropertiesToolbar({
  selectedLayer,
  recordLayerHistory,
  updateLayer,
  changeLayer,
  duplicateLayer,
  removeLayer,
  alignLayer,
  onRemoveImageBackground,
  removingBackground,
  onOptimizeReadability,
}: PropertiesToolbarProps) {
  const [alignmentMenu, setAlignmentMenu] = useState<'horizontal' | 'vertical' | null>(null);
  const [alignmentMenuPosition, setAlignmentMenuPosition] = useState({ left: 0, top: 0 });
  const [colorMenu, setColorMenu] = useState<'fill' | 'text' | null>(null);
  const [colorMenuPosition, setColorMenuPosition] = useState({ left: 0, top: 0 });
  const [customColor, setCustomColor] = useState('#ffffff');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [styleMenuPosition, setStyleMenuPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setAlignmentMenu(null);
    setColorMenu(null);
    setStyleMenuOpen(false);
  }, [selectedLayer?.id, selectedLayer?.type]);
  const alignmentActions = alignmentMenu === 'horizontal'
    ? [
      ['left', 'Căn trái', AlignLeft],
      ['center-x', 'Căn giữa ngang', AlignCenter],
      ['right', 'Căn phải', AlignRight],
    ] as const
    : [
      ['top', 'Căn trên', VerticalAlignTop],
      ['center-y', 'Căn giữa dọc', VerticalAlignCenter],
      ['bottom', 'Căn dưới', VerticalAlignBottom],
    ] as const;

  const openAlignmentMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    menu: 'horizontal' | 'vertical'
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAlignmentMenuPosition({ left: rect.left, top: rect.bottom + 6 });
    setAlignmentMenu((current) => current === menu ? null : menu);
    setColorMenu(null);
    setStyleMenuOpen(false);
  };

  const openColorMenu = (event: React.MouseEvent<HTMLButtonElement>, menu: 'fill' | 'text') => {
    const rect = event.currentTarget.getBoundingClientRect();
    const currentColor = menu === 'fill'
      ? selectedLayer?.fillColor || '#ffffff'
      : selectedLayer?.color || '#111827';
    setColorMenuPosition({ left: rect.left, top: rect.bottom + 6 });
    setCustomColor(/^#[0-9a-f]{6}$/i.test(currentColor) ? currentColor : '#ffffff');
    setColorMenu((current) => current === menu ? null : menu);
    setAlignmentMenu(null);
    setStyleMenuOpen(false);
  };

  const openStyleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setStyleMenuPosition({ left: rect.left, top: rect.bottom + 6 });
    setStyleMenuOpen((current) => !current);
    setAlignmentMenu(null);
    setColorMenu(null);
  };

  const applyColor = (color: string) => {
    if (!selectedLayer || !colorMenu) return;
    recordLayerHistory();
    updateLayer(selectedLayer.id, colorMenu === 'fill' ? { fillColor: color } : { color });
    setColorMenu(null);
  };

  const previewCustomColor = (color: string) => {
    if (!selectedLayer || !colorMenu) return;
    updateLayer(selectedLayer.id, colorMenu === 'fill' ? { fillColor: color } : { color });
  };

  const selectedColor = colorMenu === 'fill'
    ? selectedLayer?.fillColor || '#ffffff'
    : selectedLayer?.color || '#111827';

  return (
    <div className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2 [scrollbar-width:thin]">
        <button
          type="button"
          onClick={onOptimizeReadability}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
          title="Tối ưu dễ đọc cho mẫu"
          aria-label="Tối ưu dễ đọc cho mẫu"
        >
          <WandSparkles className="h-4 w-4" />
        </button>
        <span className="h-6 shrink-0 border-l border-slate-200" />
        {selectedLayer ? (
          <>
            {selectedLayer.type === 'text' && (
              <>
                <button
                  type="button"
                  onClick={(event) => openColorMenu(event, 'text')}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white transition hover:bg-indigo-50 hover:text-indigo-700 ${
                    colorMenu === 'text' ? 'border-indigo-400 text-indigo-700 ring-2 ring-indigo-100' : 'border-slate-200 text-slate-700'
                  }`}
                  title="Màu chữ"
                >
                  <span className="text-lg font-black text-slate-800">
                    A
                  </span>
                  <span
                    className="absolute bottom-1 h-1.5 w-6 rounded-full border border-slate-300"
                    style={{ backgroundColor: selectedLayer.color || '#ffffff' }}
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => openColorMenu(event, 'fill')}
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white transition hover:bg-indigo-50 hover:text-indigo-700 ${
                    colorMenu === 'fill' ? 'border-indigo-400 text-indigo-700 ring-2 ring-indigo-100' : 'border-slate-200 text-slate-700'
                  }`}
                  title="Màu nền thành phần"
                >
                  <PaintBucket className="h-4 w-4" strokeWidth={2.3} />
                  <span className="absolute bottom-1 h-1.5 w-5 rounded-full border border-slate-300" style={{ backgroundColor: selectedLayer.fillColor || 'transparent' }} />
                </button>
                <button
                  type="button"
                  onClick={openStyleMenu}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white transition hover:bg-indigo-50 hover:text-indigo-700 ${
                    styleMenuOpen ? 'border-indigo-400 text-indigo-700 ring-2 ring-indigo-100' : 'border-slate-200 text-slate-700'
                  }`}
                  title="Tùy chỉnh viền, bo góc, đệm và độ mờ"
                  aria-label="Mở tùy chỉnh thành phần"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </>
            )}
            <input
              value={selectedLayer.fieldName}
              onFocus={recordLayerHistory}
              onChange={(event) => updateLayer(selectedLayer.id, { fieldName: event.target.value })}
              className="h-10 w-40 shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-indigo-500"
              aria-label="Tên trường"
            />
            {selectedLayer.type === 'text' && selectedLayer.layerKind !== 'shape' && (
              <>
                <select
                  value={selectedLayer.fontFamily || 'DejaVu Sans'}
                  onChange={(event) => changeLayer(selectedLayer.id, { fontFamily: event.target.value })}
                  className="h-10 w-28 shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-sm font-bold"
                  title="Phông chữ"
                >
                  <optgroup label="Sans-serif">
                    <option value="DejaVu Sans">DejaVu Sans</option>
                    <option value="Noto Sans">Noto Sans</option>
                    <option value="Inter">Inter</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Raleway">Raleway</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Oswald">Oswald</option>
                    <option value="Bebas Neue">Bebas Neue</option>
                    <option value="Fredoka">Fredoka</option>
                    <option value="Righteous">Righteous</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value="Be Vietnam Pro">Be Vietnam Pro</option>
                    <option value="Nunito">Nunito</option>
                    <option value="Quicksand">Quicksand</option>
                    <option value="Anton">Anton</option>
                    <option value="Sora">Sora</option>
                    <option value="Manrope">Manrope</option>
                    <option value="Arial">Arial</option>
                  </optgroup>
                  <optgroup label="Serif">
                    <option value="Noto Serif">Noto Serif</option>
                    <option value="Playfair Display">Playfair Display</option>
                    <option value="Lora">Lora</option>
                    <option value="Merriweather">Merriweather</option>
                    <option value="Abril Fatface">Abril Fatface</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                  </optgroup>
                  <optgroup label="Viết tay & Trang trí">
                    <option value="Lobster">Lobster</option>
                    <option value="Pacifico">Pacifico</option>
                    <option value="Dancing Script">Dancing Script</option>
                    <option value="Caveat">Caveat</option>
                    <option value="Permanent Marker">Permanent Marker</option>
                  </optgroup>
                  <optgroup label="Monospace">
                    <option value="JetBrains Mono">JetBrains Mono</option>
                  </optgroup>
                </select>

                <div className="grid h-10 w-[104px] shrink-0 grid-cols-3 items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() =>
                      changeLayer(selectedLayer.id, {
                        fontSize: Math.max(8, (selectedLayer.fontSize || 60) - 2),
                      })
                    }
                    className="h-full w-full px-0 hover:bg-slate-50"
                    title="Giảm cỡ chữ"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min="8"
                    max="300"
                    value={selectedLayer.fontSize || 60}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        fontSize: clamp(Number(event.target.value), 8, 300),
                      })
                    }
                    className="h-full w-full border-x border-slate-200 text-center text-sm font-bold outline-none [appearance:textfield]"
                    aria-label="Cỡ chữ"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      changeLayer(selectedLayer.id, {
                        fontSize: Math.min(300, (selectedLayer.fontSize || 60) + 2),
                      })
                    }
                    className="h-full w-full px-0 hover:bg-slate-50"
                    title="Tăng cỡ chữ"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    changeLayer(selectedLayer.id, {
                      fontWeight: (selectedLayer.fontWeight || 700) >= 700 ? 400 : 700,
                    })
                  }
                  className={`rounded-lg border p-2.5 ${
                    (selectedLayer.fontWeight || 700) >= 700
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  title="In đậm"
                >
                  <Bold className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeLayer(selectedLayer.id, {
                      fontStyle: selectedLayer.fontStyle === 'italic' ? 'normal' : 'italic',
                    })
                  }
                  className={`rounded-lg border p-2.5 ${
                    selectedLayer.fontStyle === 'italic'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  title="In nghiêng"
                >
                  <Italic className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeLayer(selectedLayer.id, {
                      textDecoration:
                        selectedLayer.textDecoration === 'underline' ? 'none' : 'underline',
                    })
                  }
                  className={`rounded-lg border p-2.5 ${
                    selectedLayer.textDecoration === 'underline'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  title="Gạch chân"
                >
                  <Underline className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeLayer(selectedLayer.id, {
                      textDecoration:
                        selectedLayer.textDecoration === 'line-through' ? 'none' : 'line-through',
                    })
                  }
                  className={`rounded-lg border p-2.5 ${
                    selectedLayer.textDecoration === 'line-through'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  title="Gạch ngang"
                >
                  <Strikethrough className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const transforms: Array<NonNullable<TemplateLayer['textTransform']>> = [
                      'none',
                      'uppercase',
                      'lowercase',
                      'capitalize',
                    ];
                    const currentIndex = transforms.indexOf(selectedLayer.textTransform || 'none');
                    changeLayer(selectedLayer.id, {
                      textTransform: transforms[(currentIndex + 1) % transforms.length],
                    });
                  }}
                  className="h-10 min-w-10 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                  title="Đổi chữ hoa / chữ thường"
                >
                  {selectedLayer.textTransform === 'uppercase'
                    ? 'AA'
                    : selectedLayer.textTransform === 'lowercase'
                      ? 'aa'
                      : selectedLayer.textTransform === 'capitalize'
                        ? 'Aa'
                        : 'aA'}
                </button>

              </>
            )}
            {selectedLayer.type === 'image' && (
              <>
                <select
                  value={selectedLayer.fit || 'contain'}
                  onChange={(event) =>
                    changeLayer(selectedLayer.id, { fit: event.target.value as 'cover' | 'contain' })
                  }
                  className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold"
                >
                  <option value="contain">Vừa khung</option>
                  <option value="cover">Lấp đầy</option>
                </select>
                <button
                  type="button"
                  onClick={onRemoveImageBackground}
                  disabled={removingBackground}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 text-xs font-extrabold text-white shadow-[0_4px_12px_rgba(79,70,229,0.28)] transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700 hover:shadow-[0_7px_18px_rgba(79,70,229,0.36)] active:translate-y-0 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
                  title="Chỉ xóa nền, giữ lại vật thể chính"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
                    {removingBackground ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
                  </span>
                  {removingBackground ? 'Đang xóa nền…' : 'Xóa nền AI'}
                </button>
              </>
            )}
            <div className="flex h-10 shrink-0 items-center rounded-lg border border-slate-200 bg-white p-1" title="Căn layer theo canvas">
              <button
                type="button"
                onClick={(event) => openAlignmentMenu(event, 'horizontal')}
                className={`flex h-8 items-center gap-0.5 rounded-md px-1.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 ${alignmentMenu === 'horizontal' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                title="Căn ngang"
                aria-label="Mở lựa chọn căn ngang"
              >
                <AlignLeft className="h-4 w-4" />
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <span className="mx-1 h-5 border-l border-slate-200" />
              <button
                type="button"
                onClick={(event) => openAlignmentMenu(event, 'vertical')}
                className={`flex h-8 items-center gap-0.5 rounded-md px-1.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 ${alignmentMenu === 'vertical' ? 'bg-indigo-50 text-indigo-700' : ''}`}
                title="Căn dọc"
                aria-label="Mở lựa chọn căn dọc"
              >
                <VerticalAlignTop className="h-4 w-4" />
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => duplicateLayer(selectedLayer)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Nhân bản"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => changeLayer(selectedLayer.id, { locked: !selectedLayer.locked })}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title={selectedLayer.locked ? 'Mở khóa' : 'Khóa'}
            >
              {selectedLayer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => removeLayer(selectedLayer.id)}
              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
              title="Xóa"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <MousePointer2 className="h-4 w-4" /> Chọn chữ, ảnh hoặc nền trang để chỉnh sửa
          </div>
        )}
      </div>
      {colorMenu && selectedLayer?.type === 'text' && createPortal(
        <div
          className="fixed z-[10000] w-[248px] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
          style={{ left: colorMenuPosition.left, top: colorMenuPosition.top }}
          role="menu"
          aria-label={colorMenu === 'fill' ? 'Màu nền thành phần' : 'Màu chữ'}
        >
          <p className="mb-2 text-xs font-extrabold text-slate-700">
            {colorMenu === 'fill' ? 'Màu nền thành phần' : 'Màu chữ'}
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyColor(color)}
                className={`h-7 w-7 rounded-full border shadow-sm transition hover:scale-110 ${
                  selectedColor.toLowerCase() === color.toLowerCase()
                    ? 'border-indigo-600 ring-2 ring-indigo-200 ring-offset-1'
                    : 'border-slate-200'
                }`}
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`Chọn màu ${color}`}
                role="menuitem"
              />
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Tùy chỉnh</span>
              <input
                type="text"
                value={customColor}
                onChange={(event) => setCustomColor(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(customColor)) applyColor(customColor);
                }}
                className="h-8 min-w-0 flex-1 rounded border border-slate-200 px-2 text-xs font-bold uppercase outline-none focus:border-indigo-500"
                aria-label="Mã màu HEX"
                placeholder="#000000"
              />
              <input
                type="color"
                value={customColor}
                onFocus={recordLayerHistory}
                onChange={(event) => {
                  setCustomColor(event.target.value);
                  previewCustomColor(event.target.value);
                }}
                className="h-8 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                aria-label="Chọn màu tùy chỉnh"
              />
            </div>
            <button
              type="button"
              disabled={!/^#[0-9a-f]{6}$/i.test(customColor)}
              onClick={() => applyColor(customColor)}
              className="mt-2 h-8 w-full rounded-lg bg-indigo-600 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Áp dụng màu
            </button>
          </div>
        </div>,
        document.body
      )}
      {styleMenuOpen && selectedLayer && createPortal(
        <div
          className="fixed z-[10000] w-[276px] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
          style={{ left: styleMenuPosition.left, top: styleMenuPosition.top }}
          role="dialog"
          aria-label="Tùy chỉnh thành phần"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-700">Tùy chỉnh thành phần</p>
            <button
              type="button"
              onClick={() => changeLayer(selectedLayer.id, { fillColor: undefined })}
              className="text-xs font-bold text-slate-500 hover:text-rose-600"
            >
              Nền trong
            </button>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">
              <span className="mb-1.5 flex justify-between"><span>Bo góc</span><span>{selectedLayer.borderRadius || 0}</span></span>
              <input
                type="range"
                min="0"
                max="100"
                value={selectedLayer.borderRadius || 0}
                onPointerDown={recordLayerHistory}
                onChange={(event) => changeLayer(selectedLayer.id, { borderRadius: clamp(Number(event.target.value), 0, 100) })}
                className="w-full accent-indigo-600"
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              <span className="mb-1.5 flex justify-between"><span>Độ dày viền</span><span>{selectedLayer.borderWidth || 0}</span></span>
              <input
                type="range"
                min="0"
                max="30"
                value={selectedLayer.borderWidth || 0}
                onPointerDown={recordLayerHistory}
                onChange={(event) => changeLayer(selectedLayer.id, { borderWidth: clamp(Number(event.target.value), 0, 30) })}
                className="w-full accent-indigo-600"
              />
            </label>
            <label className="flex items-center justify-between text-xs font-bold text-slate-600">
              Màu viền
              <input
                type="color"
                value={selectedLayer.borderColor || selectedLayer.color || '#000000'}
                onFocus={recordLayerHistory}
                onChange={(event) => updateLayer(selectedLayer.id, { borderColor: event.target.value })}
                className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                aria-label="Màu viền"
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              <span className="mb-1.5 flex justify-between"><span>Khoảng đệm</span><span>{selectedLayer.padding || 0}</span></span>
              <input
                type="range"
                min="0"
                max="80"
                value={selectedLayer.padding || 0}
                onPointerDown={recordLayerHistory}
                onChange={(event) => changeLayer(selectedLayer.id, { padding: clamp(Number(event.target.value), 0, 80) })}
                className="w-full accent-indigo-600"
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              <span className="mb-1.5 flex justify-between"><span>Độ mờ</span><span>{Math.round((selectedLayer.opacity ?? 1) * 100)}%</span></span>
              <input
                type="range"
                min="5"
                max="100"
                value={Math.round((selectedLayer.opacity ?? 1) * 100)}
                onPointerDown={recordLayerHistory}
                onChange={(event) => changeLayer(selectedLayer.id, { opacity: clamp(Number(event.target.value), 5, 100) / 100 })}
                className="w-full accent-indigo-600"
              />
            </label>
            {selectedLayer.type === 'text' && (
              <>
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>Căn chữ</span>
                  <div className="flex overflow-hidden rounded-lg border border-slate-200">
                    {([
                      ['left', AlignLeft, 'Căn trái'],
                      ['center', AlignCenter, 'Căn giữa'],
                      ['right', AlignRight, 'Căn phải'],
                    ] as const).map(([align, Icon, title]) => (
                      <button
                        key={align}
                        type="button"
                        onClick={() => changeLayer(selectedLayer.id, { textAlign: align })}
                        className={`flex h-8 w-9 items-center justify-center border-r border-slate-200 last:border-r-0 ${
                          (selectedLayer.textAlign || 'left') === align
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                        title={title}
                        aria-label={title}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-xs font-bold text-slate-600">
                  <span className="mb-1.5 flex justify-between"><span>Giãn chữ</span><span>{selectedLayer.letterSpacing || 0}</span></span>
                  <input
                    type="range"
                    min="-5"
                    max="30"
                    value={selectedLayer.letterSpacing || 0}
                    onPointerDown={recordLayerHistory}
                    onChange={(event) => changeLayer(selectedLayer.id, { letterSpacing: clamp(Number(event.target.value), -5, 30) })}
                    className="w-full accent-indigo-600"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  <span className="mb-1.5 flex justify-between"><span>Khoảng dòng</span><span>{selectedLayer.lineHeight || 1.2}</span></span>
                  <input
                    type="range"
                    min="0.8"
                    max="3"
                    step="0.1"
                    value={selectedLayer.lineHeight || 1.2}
                    onPointerDown={recordLayerHistory}
                    onChange={(event) => changeLayer(selectedLayer.id, { lineHeight: clamp(Number(event.target.value), 0.8, 3) })}
                    className="w-full accent-indigo-600"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-bold text-slate-600">
                  Tự co chữ
                  <input
                    type="checkbox"
                    checked={selectedLayer.autoFit !== false}
                    onChange={(event) => changeLayer(selectedLayer.id, { autoFit: event.target.checked })}
                    className="h-4 w-4 accent-indigo-600"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-bold text-slate-600">
                  Cỡ tối thiểu
                  <input
                    type="number"
                    min="8"
                    max={selectedLayer.fontSize || 60}
                    value={selectedLayer.minFontSize || 12}
                    disabled={selectedLayer.autoFit === false}
                    onChange={(event) => changeLayer(selectedLayer.id, { minFontSize: clamp(Number(event.target.value), 8, selectedLayer.fontSize || 60) })}
                    className="w-12 rounded border border-slate-200 py-1 text-center text-sm font-bold text-slate-800 outline-none disabled:opacity-40"
                    aria-label="Cỡ chữ tối thiểu khi tự co"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-bold text-slate-600">
                  Tối đa dòng
                  <input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="∞"
                    value={selectedLayer.maxLines || ''}
                    disabled={selectedLayer.autoFit === false}
                    onChange={(event) => changeLayer(selectedLayer.id, { maxLines: event.target.value ? clamp(Number(event.target.value), 1, 20) : undefined })}
                    className="w-12 rounded border border-slate-200 py-1 text-center text-sm font-bold text-slate-800 outline-none disabled:opacity-40"
                    aria-label="Số dòng tối đa"
                  />
                </label>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {alignmentMenu && createPortal(
        <div
          className="fixed z-[10000] flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
          style={{ left: alignmentMenuPosition.left, top: alignmentMenuPosition.top }}
          role="menu"
          aria-label={alignmentMenu === 'horizontal' ? 'Căn ngang' : 'Căn dọc'}
        >
          {alignmentActions.map(([alignment, label, Icon]) => (
            <button
              key={alignment}
              type="button"
              onClick={() => {
                alignLayer(alignment);
                setAlignmentMenu(null);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
              title={label}
              aria-label={label}
              role="menuitem"
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
