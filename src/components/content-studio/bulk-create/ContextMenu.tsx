import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Copy,
  Clipboard,
  Files,
  Trash2,
  ChevronRight,
  Maximize2,
  Database,
  Search,
  X,
} from 'lucide-react';
import { CANVAS_PRESETS } from './constants';
import type { DataColumn, TemplateLayer } from './types';

interface ContextMenuProps {
  x: number;
  y: number;
  hasLayerSelected: boolean;
  hasCopiedLayer: boolean;
  canvasSize: { width: number; height: number };
  selectedLayer?: TemplateLayer;
  layers: TemplateLayer[];
  dataColumns: DataColumn[];
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onResize: (width: number, height: number) => void;
  onConnectData: (layerId: string, columnKey: string) => void;
}

function PresetIllustration({
  preset,
}: {
  preset: (typeof CANVAS_PRESETS)[number];
}) {
  const ratio = preset.width / preset.height;
  const previewWidth = ratio >= 1 ? 82 : 82 * ratio;
  const previewHeight = ratio >= 1 ? 82 / ratio : 82;
  const platform =
    preset.id.includes('instagram') || preset.id === 'story'
      ? { label: 'IG', color: 'bg-gradient-to-br from-fuchsia-500 to-orange-400' }
      : preset.id.includes('facebook')
        ? { label: 'f', color: 'bg-blue-600' }
        : preset.id.includes('youtube')
          ? { label: '▶', color: 'bg-red-500' }
          : preset.id.includes('linkedin')
            ? { label: 'in', color: 'bg-sky-700' }
            : { label: 'P', color: 'bg-rose-600' };

  return (
    <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
      <div
        className="relative overflow-hidden rounded-[5px] border border-slate-200 bg-white shadow-[4px_5px_0_rgba(148,163,184,0.20)]"
        style={{ width: previewWidth, height: previewHeight }}
      >
        <div className={`absolute left-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded px-1 text-[7px] font-black text-white ${platform.color}`}>
          {platform.label}
        </div>
        <div className="absolute inset-x-2 top-[32%] h-[34%] rounded bg-gradient-to-br from-indigo-100 via-violet-100 to-rose-100" />
        <div className="absolute bottom-2 left-2 h-1.5 w-1/2 rounded-full bg-slate-700/80" />
        <div className="absolute bottom-1 left-2 h-1 w-1/3 rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

export function ContextMenu({
  x,
  y,
  hasLayerSelected,
  hasCopiedLayer,
  canvasSize,
  selectedLayer,
  layers,
  dataColumns,
  onClose,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onResize,
  onConnectData,
}: ContextMenuProps) {
  const [resizeDialogOpen, setResizeDialogOpen] = useState(false);
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customWidth, setCustomWidth] = useState(String(canvasSize.width));
  const [customHeight, setCustomHeight] = useState(String(canvasSize.height));
  const menuRef = useRef<HTMLDivElement>(null);
  const resizeDialogRef = useRef<HTMLDivElement>(null);
  const bindingDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !resizeDialogRef.current?.contains(target) &&
        !bindingDialogRef.current?.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust coordinates if menu goes off screen
  const menuWidth = 240;
  const menuHeight = 270;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 20);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 20);

  const handleApplyCustomSize = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Math.max(100, Math.min(5000, Number(customWidth) || 1080));
    const h = Math.max(100, Math.min(5000, Number(customHeight) || 1080));
    onResize(w, h);
    onClose();
  };
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('vi-VN');
  const filteredPresets = CANVAS_PRESETS.filter((preset) =>
    `${preset.name} ${preset.width} ${preset.height}`
      .toLocaleLowerCase('vi-VN')
      .includes(normalizedSearch)
  );
  const compatibleColumns = selectedLayer
    ? dataColumns.filter((column) => column.type === selectedLayer.type)
    : [];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-60 rounded-xl border border-slate-100 bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.15)] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
    >
      <div className="space-y-0.5">
        {/* Copy */}
        <button
          type="button"
          onClick={() => {
            if (hasLayerSelected) {
              onCopy();
              onClose();
            }
          }}
          disabled={!hasLayerSelected}
          className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-55 disabled:opacity-40"
        >
          <span className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-slate-500" />
            Sao chép
          </span>
          <kbd className="text-[10px] text-slate-400 font-sans">Ctrl+C</kbd>
        </button>

        {/* Paste */}
        <button
          type="button"
          onClick={() => {
            if (hasCopiedLayer) {
              onPaste();
              onClose();
            }
          }}
          disabled={!hasCopiedLayer}
          className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-55 disabled:opacity-40"
        >
          <span className="flex items-center gap-2">
            <Clipboard className="h-4 w-4 text-slate-500" />
            Dán
          </span>
          <kbd className="text-[10px] text-slate-400 font-sans">Ctrl+V</kbd>
        </button>

        {/* Duplicate */}
        <button
          type="button"
          onClick={() => {
            if (hasLayerSelected) {
              onDuplicate();
              onClose();
            }
          }}
          disabled={!hasLayerSelected}
          className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-55 disabled:opacity-40"
        >
          <span className="flex items-center gap-2">
            <Files className="h-4 w-4 text-slate-500" />
            Tạo bản sao
          </span>
          <kbd className="text-[10px] text-slate-400 font-sans">Ctrl+D</kbd>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-500" />
            {hasLayerSelected ? 'Xóa layer' : 'Xóa nền'}
          </span>
          <kbd className="text-[10px] text-rose-400 font-sans">DELETE</kbd>
        </button>

        <div className="my-1 border-t border-slate-100" />

        {/* Resize page submenu */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setResizeDialogOpen(true);
            }}
            className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-55"
          >
            <span className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4 text-slate-500" />
              Đổi cỡ trang
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (selectedLayer && compatibleColumns.length > 0) setBindingDialogOpen(true);
          }}
          disabled={!selectedLayer || compatibleColumns.length === 0}
          className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-xs font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"
        >
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 text-violet-600" />
            Kết nối dữ liệu
          </span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </button>
      </div>
      {resizeDialogOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            <div
              ref={resizeDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Đổi cỡ trang"
              className="flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
            >
              <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-5">
                <button
                  type="button"
                  onClick={() => setResizeDialogOpen(false)}
                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                  title="Quay lại"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h3 className="flex-1 text-lg font-extrabold text-slate-900">Đổi cỡ trang</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  title="Đóng"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
                <label className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                  <Search className="h-5 w-5 shrink-0 text-slate-500" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Tìm theo tên hoặc kích thước..."
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>

                <div className="mt-5 flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-slate-800">
                    {normalizedSearch ? 'Kết quả tìm kiếm' : 'Kích thước phổ biến'}
                  </h4>
                  <span className="text-xs font-bold text-slate-400">
                    {filteredPresets.length} lựa chọn
                  </span>
                </div>

                {filteredPresets.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filteredPresets.map((preset) => {
                      const selected =
                        preset.width === canvasSize.width && preset.height === canvasSize.height;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            onResize(preset.width, preset.height);
                            onClose();
                          }}
                          className={`rounded-2xl border p-2 text-left transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md ${
                            selected
                              ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <PresetIllustration preset={preset} />
                          <span className="mt-2 block truncate text-sm font-extrabold text-slate-800">
                            {preset.name}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-500">
                            {preset.width} × {preset.height} px
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm font-medium text-slate-500">
                    Không tìm thấy kích thước phù hợp.
                  </div>
                )}

                <form
                  onSubmit={handleApplyCustomSize}
                  className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-3">
                    <h4 className="text-sm font-extrabold text-slate-800">Kích thước tùy chỉnh</h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Nhập chiều rộng và chiều cao theo pixel.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="text-xs font-bold text-slate-600">
                      Chiều rộng
                      <input
                        type="number"
                        min="100"
                        max="5000"
                        value={customWidth}
                        onChange={(event) => setCustomWidth(event.target.value)}
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Chiều cao
                      <input
                        type="number"
                        min="100"
                        max="5000"
                        value={customHeight}
                        onChange={(event) => setCustomHeight(event.target.value)}
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </label>
                    <button
                      type="submit"
                      className="h-11 rounded-xl bg-slate-900 px-6 text-sm font-extrabold text-white hover:bg-slate-800"
                    >
                      Áp dụng
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}
      {bindingDialogOpen && selectedLayer &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setBindingDialogOpen(false);
            }}
          >
            <div
              ref={bindingDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Kết nối dữ liệu"
              className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Database className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold text-slate-900">Kết nối dữ liệu</h3>
                  <p className="truncate text-xs text-slate-500">{selectedLayer.fieldName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBindingDialogOpen(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  title="Đóng"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto p-4">
                <button
                  type="button"
                  onClick={() => {
                    onConnectData(selectedLayer.id, '');
                    onClose();
                  }}
                  className={`w-full rounded-xl border p-3 text-left text-sm font-bold ${
                    !selectedLayer.dataBinding
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-600 hover:border-violet-300'
                  }`}
                >
                  Không kết nối · giữ nguyên nội dung
                </button>
                {compatibleColumns.map((column) => {
                  const connectedLayer = layers.find((layer) =>
                    layer.id !== selectedLayer.id &&
                    layer.dataBinding?.columnKey === column.key
                  );
                  const selected = selectedLayer.dataBinding?.columnKey === column.key;
                  return (
                    <button
                      key={column.key}
                      type="button"
                      disabled={!!connectedLayer}
                      onClick={() => {
                        if (connectedLayer) return;
                        onConnectData(selectedLayer.id, column.key);
                        onClose();
                      }}
                      className={`w-full rounded-xl border p-3 text-left ${
                        selected
                          ? 'border-violet-500 bg-violet-50'
                          : connectedLayer
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60'
                            : 'border-slate-200 hover:border-violet-300'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="block text-sm font-extrabold text-slate-800">{column.label}</span>
                        {connectedLayer && (
                          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-extrabold text-slate-600">
                            Đã kết nối
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {connectedLayer
                          ? `Đang dùng bởi ${connectedLayer.fieldName}`
                          : column.samples.slice(0, 3).join(', ') || 'Chưa có giá trị mẫu'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
export default ContextMenu;
