import React, { useState } from 'react';
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
  Lock,
  Unlock,
  Trash2,
  MousePointer2,
} from 'lucide-react';
import type { TemplateLayer } from './types';
import { clamp } from './utils';

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
}: PropertiesToolbarProps) {
  const [alignmentMenu, setAlignmentMenu] = useState<'horizontal' | 'vertical' | null>(null);
  const [alignmentMenuPosition, setAlignmentMenuPosition] = useState({ left: 0, top: 0 });
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
  };

  return (
    <div className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2 [scrollbar-width:thin]">
        {selectedLayer ? (
          <>
            {selectedLayer.type === 'text' && (
              <>
                <label
                  className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white"
                  title="Màu nền thành phần"
                >
                  <span
                    className="h-6 w-6 rounded-md border border-slate-200"
                    style={{ backgroundColor: selectedLayer.fillColor || 'transparent' }}
                  />
                  <input
                    type="color"
                    value={selectedLayer.fillColor || '#ffffff'}
                    onFocus={recordLayerHistory}
                    onChange={(event) => updateLayer(selectedLayer.id, { fillColor: event.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Màu nền thành phần"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => changeLayer(selectedLayer.id, { fillColor: undefined })}
                  className="h-10 shrink-0 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
                  title="Bỏ màu nền"
                >
                  Nền trong
                </button>
                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Bo góc
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={selectedLayer.borderRadius || 0}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        borderRadius: clamp(Number(event.target.value), 0, 100),
                      })
                    }
                    className="w-10 text-center text-sm font-bold text-slate-800 outline-none"
                    aria-label="Độ bo góc"
                  />
                </label>
                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Viền
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={selectedLayer.borderWidth || 0}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        borderWidth: clamp(Number(event.target.value), 0, 30),
                      })
                    }
                    className="w-9 text-center text-sm font-bold text-slate-800 outline-none"
                    aria-label="Độ dày viền"
                  />
                </label>
                <label
                  className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white"
                  title="Màu viền"
                >
                  <span
                    className="h-6 w-6 rounded-md border-2"
                    style={{ borderColor: selectedLayer.borderColor || selectedLayer.color || '#000000' }}
                  />
                  <input
                    type="color"
                    value={selectedLayer.borderColor || selectedLayer.color || '#000000'}
                    onFocus={recordLayerHistory}
                    onChange={(event) => updateLayer(selectedLayer.id, { borderColor: event.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Màu viền"
                  />
                </label>
                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Đệm
                  <input
                    type="number"
                    min="0"
                    max="80"
                    value={selectedLayer.padding || 0}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        padding: clamp(Number(event.target.value), 0, 80),
                      })
                    }
                    className="w-9 text-center text-sm font-bold text-slate-800 outline-none"
                    aria-label="Khoảng đệm"
                  />
                </label>
                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Mờ
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={Math.round((selectedLayer.opacity ?? 1) * 100)}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        opacity: clamp(Number(event.target.value), 5, 100) / 100,
                      })
                    }
                    className="w-9 text-center text-sm font-bold text-slate-800 outline-none"
                    aria-label="Độ trong suốt"
                  />
                </label>
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
                  className="h-10 w-36 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold"
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

                <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() =>
                      changeLayer(selectedLayer.id, {
                        fontSize: Math.max(8, (selectedLayer.fontSize || 60) - 2),
                      })
                    }
                    className="h-full px-2 hover:bg-slate-50"
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
                    className="h-full w-12 border-x border-slate-200 text-center text-sm font-bold outline-none"
                    aria-label="Cỡ chữ"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      changeLayer(selectedLayer.id, {
                        fontSize: Math.min(300, (selectedLayer.fontSize || 60) + 2),
                      })
                    }
                    className="h-full px-2 hover:bg-slate-50"
                    title="Tăng cỡ chữ"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <label
                  className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white"
                  title="Màu chữ"
                >
                  <span className="text-lg font-black" style={{ color: selectedLayer.color || '#ffffff' }}>
                    A
                  </span>
                  <span
                    className="absolute bottom-1 h-1 w-6 rounded-full"
                    style={{ backgroundColor: selectedLayer.color || '#ffffff' }}
                  />
                  <input
                    type="color"
                    value={selectedLayer.color || '#ffffff'}
                    onFocus={recordLayerHistory}
                    onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Màu chữ"
                  />
                </label>

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

                <div
                  className="flex h-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                  title="Căn chữ"
                >
                  {([
                    ['left', AlignLeft, 'Căn trái'],
                    ['center', AlignCenter, 'Căn giữa'],
                    ['right', AlignRight, 'Căn phải'],
                  ] as const).map(([align, Icon, title]) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => changeLayer(selectedLayer.id, { textAlign: align })}
                      className={`flex w-9 items-center justify-center border-r border-slate-200 last:border-r-0 ${
                        (selectedLayer.textAlign || 'left') === align
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                      title={title}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>

                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Giãn chữ
                  <input
                    type="number"
                    min="-5"
                    max="30"
                    step="1"
                    value={selectedLayer.letterSpacing || 0}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        letterSpacing: clamp(Number(event.target.value), -5, 30),
                      })
                    }
                    className="w-10 text-center text-sm font-bold text-slate-800 outline-none"
                    aria-label="Khoảng cách chữ"
                  />
                </label>

                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Dòng
                  <input
                    type="number"
                    min="0.8"
                    max="3"
                    step="0.1"
                    value={selectedLayer.lineHeight || 1.2}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        lineHeight: clamp(Number(event.target.value), 0.8, 3),
                      })
                    }
                    className="w-10 text-center text-sm font-bold text-slate-800 outline-none"
                    aria-label="Khoảng cách dòng"
                  />
                </label>

                <button
                  type="button"
                  onClick={() =>
                    changeLayer(selectedLayer.id, {
                      autoFit: selectedLayer.autoFit === false,
                    })
                  }
                  className={`h-10 shrink-0 rounded-lg border px-2.5 text-xs font-extrabold ${
                    selectedLayer.autoFit !== false
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                  title="Tự giảm cỡ chữ để nội dung vừa khung"
                >
                  Tự co chữ
                </button>

                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Cỡ tối thiểu
                  <input
                    type="number"
                    min="8"
                    max={selectedLayer.fontSize || 60}
                    value={selectedLayer.minFontSize || 12}
                    disabled={selectedLayer.autoFit === false}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        minFontSize: clamp(
                          Number(event.target.value),
                          8,
                          selectedLayer.fontSize || 60
                        ),
                      })
                    }
                    className="w-10 text-center text-sm font-bold text-slate-800 outline-none disabled:opacity-40"
                    aria-label="Cỡ chữ tối thiểu khi tự co"
                  />
                </label>

                <label className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500">
                  Tối đa dòng
                  <input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="∞"
                    value={selectedLayer.maxLines || ''}
                    disabled={selectedLayer.autoFit === false}
                    onChange={(event) =>
                      changeLayer(selectedLayer.id, {
                        maxLines: event.target.value
                          ? clamp(Number(event.target.value), 1, 20)
                          : undefined,
                      })
                    }
                    className="w-9 text-center text-sm font-bold text-slate-800 outline-none disabled:opacity-40"
                    aria-label="Số dòng tối đa"
                  />
                </label>
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
