import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardPaste,
  Copy,
  Download,
  Files,
  Pencil,
  Trash2,
} from 'lucide-react';

interface PageContextMenuProps {
  x: number;
  y: number;
  pageName: string;
  hasCopiedPage: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDownload: () => void;
}

export function PageContextMenu({
  x,
  y,
  pageName,
  hasCopiedPage,
  onClose,
  onCopy,
  onPaste,
  onDuplicate,
  onRename,
  onDelete,
  onDownload,
}: PageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [nextName, setNextName] = useState(pageName);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const menuWidth = 276;
  const menuHeight = 330;
  const adjustedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const adjustedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = nextName.trim().slice(0, 80);
    if (!normalizedName) return;
    onRename(normalizedName);
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Tùy chọn cho ${pageName}`}
      className="fixed z-[10020] w-[276px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_55px_rgba(15,23,42,0.22)]"
      style={{ left: adjustedX, top: adjustedY }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {renaming ? (
        <form onSubmit={submitRename} className="border-b border-slate-100 p-2 pb-3">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Đổi tên trang
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              ref={renameInputRef}
              value={nextName}
              maxLength={80}
              onChange={(event) => setNextName(event.target.value)}
              onBlur={() => {
                if (!nextName.trim()) setRenaming(false);
              }}
              className="h-9 min-w-0 flex-1 rounded-lg border border-blue-300 bg-blue-50/50 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={!nextName.trim()}
              className="rounded-lg bg-blue-600 px-3 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Lưu
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold text-slate-900">{pageName}</span>
            <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Nhấn để đổi tên</span>
          </span>
          <Pencil className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      )}

      <div className="mt-1 space-y-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => runAndClose(onCopy)}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
        >
          <Copy className="h-4 w-4" />
          Sao chép
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!hasCopiedPage}
          onClick={() => {
            if (hasCopiedPage) runAndClose(onPaste);
          }}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ClipboardPaste className="h-4 w-4" />
          Dán
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runAndClose(onDuplicate)}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
        >
          <Files className="h-4 w-4" />
          Tạo bản sao
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runAndClose(onDownload)}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
        >
          <Download className="h-4 w-4" />
          Tải xuống 1 trang
        </button>

        <div className="my-1 border-t border-slate-100" />

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            if (window.confirm(`Xóa “${pageName}”?`)) runAndClose(onDelete);
          }}
          className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Xóa trang
        </button>
      </div>
    </div>,
    document.body
  );
}
