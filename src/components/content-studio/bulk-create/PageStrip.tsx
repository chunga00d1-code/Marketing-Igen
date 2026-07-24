import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { PageContextMenu } from './PageContextMenu';
import { SceneCanvas, type BulkSceneDocument } from './SceneCanvas';
import type { DataRow, PageRenderState } from './types';

interface PageStripProps {
  scene: BulkSceneDocument;
  rows: DataRow[];
  activeRowId: string;
  pageResults: Record<string, PageRenderState>;
  isRowReady: (row: DataRow) => boolean;
  getRowIssue: (row: DataRow) => string | null;
  onSelectRow: (rowId: string) => void;
  onAddRow: () => void;
  hasCopiedPage: boolean;
  onCopyRow: (row: DataRow) => void;
  onPasteRow: (afterRowId: string) => void;
  onDuplicateRow: (row: DataRow) => void;
  onRenameRow: (rowId: string, name: string) => void;
  onDeleteRow: (rowId: string) => void;
  onDownloadRow: (row: DataRow, index: number) => void;
  zoomPercent: number;
  zoomMode: 'fit' | 'manual';
  changeZoom: (zoom: number) => void;
  fitCanvasToViewport: () => void;
}

function PageStatus({
  result,
  ready,
  reason,
}: {
  result?: PageRenderState;
  ready: boolean;
  reason?: string | null;
}) {
  if (result?.status === 'queued' || result?.status === 'processing') {
    return (
      <span
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow"
        title={result.status === 'queued' ? 'Đang chờ tạo ảnh' : 'Đang tạo ảnh'}
      >
        <LoaderCircle className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (result?.status === 'completed') {
    return (
      <span
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow"
        title="Đã tạo ảnh"
      >
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (result?.status === 'failed') {
    return (
      <span
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow"
        title={result.errorMessage || 'Tạo ảnh thất bại'}
      >
        <X className="h-3 w-3" />
      </span>
    );
  }
  if (result?.status === 'cancelled') {
    return (
      <span
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white shadow"
        title="Đã dừng tạo ảnh"
      >
        <X className="h-3 w-3" />
      </span>
    );
  }
  if (!ready) {
    return (
      <span
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow"
        title={reason || 'Trang đang thiếu dữ liệu'}
        aria-label={reason || 'Trang đang thiếu dữ liệu'}
      >
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }
  return null;
}

function PageThumbnail({
  scene,
  row,
  index,
  active,
  result,
  ready,
  issue,
  onSelect,
  onOpenContextMenu,
}: {
  scene: BulkSceneDocument;
  row: DataRow;
  index: number;
  active: boolean;
  result?: PageRenderState;
  ready: boolean;
  issue?: string | null;
  onSelect: () => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(index < 8);
  const scale = useMemo(
    () => Math.min(104 / scene.canvas.width, 64 / scene.canvas.height),
    [scene.canvas.height, scene.canvas.width]
  );

  useEffect(() => {
    const element = hostRef.current;
    if (!element || visible || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (active) {
      hostRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [active]);

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={onSelect}
      onContextMenu={onOpenContextMenu}
      className={`group flex h-[96px] w-[142px] shrink-0 flex-col gap-1 rounded-xl border p-1 text-left transition ${
        active
          ? 'border-indigo-600 bg-white ring-2 ring-indigo-200 shadow-sm'
          : 'border-transparent bg-transparent hover:border-slate-300 hover:bg-white/70'
      }`}
      aria-label={`Mở trang ${index + 1}`}
    >
      <span className="flex min-h-0 w-full flex-1 items-end gap-2">
        <span className="w-4 shrink-0 pb-0.5 text-center text-xs font-extrabold text-slate-500">
          {index + 1}
        </span>
        <span className="relative flex h-[70px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {result?.status === 'completed' && result.outputUrl ? (
            <img
              src={result.outputUrl}
              alt={`Trang ${index + 1}`}
              className="h-full w-full object-contain"
            />
          ) : visible ? (
            <SceneCanvas scene={scene} values={row.values} scale={scale} />
          ) : null}
          <PageStatus
            result={result}
            ready={ready || scene.layers.length === 0}
            reason={issue}
          />
        </span>
      </span>
      <span className="ml-6 block w-[108px] truncate text-center text-[10px] font-bold text-slate-500">
        {row.name || `Trang ${index + 1}`}
      </span>
    </button>
  );
}

export function PageStrip({
  scene,
  rows,
  activeRowId,
  pageResults,
  isRowReady,
  getRowIssue,
  onSelectRow,
  onAddRow,
  hasCopiedPage,
  onCopyRow,
  onPasteRow,
  onDuplicateRow,
  onRenameRow,
  onDeleteRow,
  onDownloadRow,
  zoomPercent,
  zoomMode,
  changeZoom,
  fitCanvasToViewport,
}: PageStripProps) {
  const activeIndex = rows.findIndex((row) => row.id === activeRowId);
  const activeRow = rows[activeIndex];
  const activeIssue = activeRow ? getRowIssue(activeRow) : null;
  const [pageMenu, setPageMenu] = useState<{
    x: number;
    y: number;
    row: DataRow;
    index: number;
  } | null>(null);

  return (
    <div className="flex h-[148px] shrink-0 flex-col border-t border-slate-200 bg-white">
      <div className="min-h-0 flex-1 overflow-x-auto bg-[#f4f5f7] [scrollbar-width:thin]">
        <div className="mx-auto flex h-full w-max min-w-full items-center justify-center gap-3 px-4">
          {rows.map((row, index) => (
            <PageThumbnail
              key={row.id}
              scene={scene}
              row={row}
              index={index}
              active={row.id === activeRowId}
              result={pageResults[row.id]}
              ready={isRowReady(row)}
              issue={getRowIssue(row)}
              onSelect={() => onSelectRow(row.id)}
              onOpenContextMenu={(event) => {
                event.preventDefault();
                onSelectRow(row.id);
                setPageMenu({
                  x: event.clientX,
                  y: event.clientY,
                  row,
                  index,
                });
              }}
            />
          ))}
          <button
            type="button"
            onClick={onAddRow}
            className="flex h-[80px] w-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent bg-slate-200/70 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-200"
            title="Thêm một trang"
          >
            <Plus className="h-6 w-6" />
            Thêm trang
          </button>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-bold text-slate-500">
            Trang {Math.max(1, activeIndex + 1)} / {Math.max(1, rows.length)}
          </span>
          {activeIssue && (
            <span
              className="flex min-w-0 items-center gap-1.5 truncate rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700"
              title={activeIssue}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">{activeIssue}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeZoom(zoomPercent - 5)}
            disabled={zoomPercent <= 10}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            title="Thu nhỏ"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={zoomPercent}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="hidden h-1.5 w-24 cursor-pointer accent-indigo-600 sm:block lg:w-32"
            aria-label="Thu phóng thiết kế"
          />
          <button
            type="button"
            onClick={() => changeZoom(zoomPercent + 5)}
            disabled={zoomPercent >= 200}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            title="Phóng to"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="w-11 text-right text-xs font-bold text-slate-700">
            {zoomPercent}%
          </span>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={fitCanvasToViewport}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
              zoomMode === 'fit'
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Hiển thị vừa màn hình"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Vừa trang</span>
          </button>
        </div>
      </div>

      {pageMenu && (
        <PageContextMenu
          x={pageMenu.x}
          y={pageMenu.y}
          pageName={pageMenu.row.name || `Trang ${pageMenu.index + 1}`}
          hasCopiedPage={hasCopiedPage}
          onClose={() => setPageMenu(null)}
          onCopy={() => onCopyRow(pageMenu.row)}
          onPaste={() => onPasteRow(pageMenu.row.id)}
          onDuplicate={() => onDuplicateRow(pageMenu.row)}
          onRename={(name) => onRenameRow(pageMenu.row.id, name)}
          onDelete={() => onDeleteRow(pageMenu.row.id)}
          onDownload={() => onDownloadRow(pageMenu.row, pageMenu.index)}
        />
      )}
    </div>
  );
}
