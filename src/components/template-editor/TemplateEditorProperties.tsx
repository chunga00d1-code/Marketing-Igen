  import React from 'react';
import {
  X,
  Volume2,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Layers,
} from 'lucide-react';
import { TemplateEditorItem } from './types';

interface TemplateEditorPropertiesProps {
  selectedItem: TemplateEditorItem | null;
  onUpdateItem: (itemId: string, patch: Partial<TemplateEditorItem>) => void;
  onRemoveItem: (itemId: string) => void;
  onClose: () => void;
}

export function TemplateEditorProperties({
  selectedItem,
  onUpdateItem,
  onRemoveItem,
  onClose,
}: TemplateEditorPropertiesProps) {
  if (!selectedItem) {
    return null;
  }

  return (
    <aside className="w-[300px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden select-none z-20 shadow-lg">
      {/* Header */}
      <div className="h-12 shrink-0 border-b border-slate-200 px-4 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Layers className="h-4 w-4 text-cyan-600" />
          {selectedItem
            ? selectedItem.type === 'video'
              ? 'Thuộc tính Clip Video'
              : selectedItem.type === 'image'
              ? 'Thuộc tính Hình Ảnh'
              : selectedItem.type === 'text'
              ? 'Thuộc tính Văn Bản'
              : 'Thuộc tính Âm Thanh'
            : 'Cấu Hình Mẫu Video'}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* ITEM PROPERTIES */}
        {selectedItem && (
          <div className="flex flex-col gap-4">
            {/* VIDEO / IMAGE PROPERTIES */}
            {(selectedItem.type === 'video' || selectedItem.type === 'image') && (
              <>
                {/* Name & Duration */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Tên clip / nhãn</label>
                  <input
                    type="text"
                    value={selectedItem.label || ''}
                    onChange={(e) => onUpdateItem(selectedItem.id, { label: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Thời lượng (giây)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    step={0.5}
                    value={selectedItem.duration}
                    onChange={(e) => onUpdateItem(selectedItem.id, { duration: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Volume Slider */}
                {selectedItem.type === 'video' && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                      <span className="flex items-center gap-1">
                        <Volume2 className="h-3.5 w-3.5 text-slate-500" /> Âm lượng
                      </span>
                      <span>{Math.round((selectedItem.volume ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedItem.volume ?? 1}
                      onChange={(e) => onUpdateItem(selectedItem.id, { volume: Number(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>
                )}

                {/* Fit Mode Toggle */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Chế độ hiển thị khung hình</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateItem(selectedItem.id, { fitMode: 'cover' })}
                      className={`rounded-xl py-1.5 text-xs font-bold border cursor-pointer ${
                        selectedItem.fitMode !== 'fit'
                          ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Cover (Đầy)
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateItem(selectedItem.id, { fitMode: 'fit' })}
                      className={`rounded-xl py-1.5 text-xs font-bold border cursor-pointer ${
                        selectedItem.fitMode === 'fit'
                          ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Fit (Vừa)
                    </button>
                  </div>
                </div>

              </>
            )}

            {/* TEXT PROPERTIES */}
            {selectedItem.type === 'text' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Nội dung chữ</label>
                  <textarea
                    rows={2}
                    value={selectedItem.text || ''}
                    onChange={(e) => onUpdateItem(selectedItem.id, { text: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Font Size & Color */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600">Cỡ chữ (px)</label>
                    <input
                      type="number"
                      min={12}
                      max={72}
                      value={selectedItem.style?.fontSize || 28}
                      onChange={(e) =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, fontSize: Number(e.target.value) },
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-600">Màu chữ</label>
                    <input
                      type="color"
                      value={selectedItem.style?.color || '#00e5ff'}
                      onChange={(e) =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, color: e.target.value },
                        })
                      }
                      className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Alignment & Bold / Italic */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, align: 'left' },
                        })
                      }
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        selectedItem.style?.align === 'left' ? 'bg-white shadow-xs text-cyan-600' : 'text-slate-500'
                      }`}
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, align: 'center' },
                        })
                      }
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        selectedItem.style?.align === 'center' ? 'bg-white shadow-xs text-cyan-600' : 'text-slate-500'
                      }`}
                    >
                      <AlignCenter className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, align: 'right' },
                        })
                      }
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        selectedItem.style?.align === 'right' ? 'bg-white shadow-xs text-cyan-600' : 'text-slate-500'
                      }`}
                    >
                      <AlignRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, bold: !selectedItem.style?.bold },
                        })
                      }
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        selectedItem.style?.bold ? 'bg-white shadow-xs text-cyan-600' : 'text-slate-500'
                      }`}
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateItem(selectedItem.id, {
                          style: { ...selectedItem.style!, italic: !selectedItem.style?.italic },
                        })
                      }
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        selectedItem.style?.italic ? 'bg-white shadow-xs text-cyan-600' : 'text-slate-500'
                      }`}
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Delete Action Button */}
            <button
              type="button"
              onClick={() => onRemoveItem(selectedItem.id)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs py-2 shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa khỏi timeline
            </button>
          </div>
        )}

      </div>
    </aside>
  );
}
