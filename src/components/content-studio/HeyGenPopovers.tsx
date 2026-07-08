import React from "react";
import { AudioLines, Check, ExternalLink, LoaderCircle, Play, UserRound, X } from "lucide-react";
import type { HeyGenLibraryItem } from "../../api/heygen";
import { HEYGEN_THEME } from "./heygenTheme";

export type ElevenLabsAudioRecord = {
  _id: string;
  url: string;
  prompt?: string;
  createdAt?: string;
  metadata?: {
    title?: string;
    voiceName?: string;
    duration?: number;
  };
};

export function ModelSelectionPopover({
  title,
  items,
  selectedValue,
  onClose,
  onSelect,
}: {
  title: string;
  items: Array<{ id: string; description: string; icon: string }>;
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-[360px] rounded-[24px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} p-3 shadow-2xl`}>
        <div className="mb-2 flex items-center justify-between gap-2 px-1 py-1">
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${HEYGEN_THEME.textMuted}`}>{title}</p>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            const isSelected = item.id === selectedValue;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                  isSelected ? `${HEYGEN_THEME.accentBorder} ${HEYGEN_THEME.accentBg} text-slate-900` : `${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} text-slate-600 hover:bg-slate-50`
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-300 via-violet-200 to-slate-300 text-xs font-bold text-slate-900">
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold">{item.id}</p>
                  <p className="text-xs leading-5 text-slate-500">{item.description}</p>
                </div>
                {isSelected ? <Check className="h-5 w-5 text-cyan-600" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PickerPopover({
  title,
  items,
  selectedId,
  onClose,
  onSelect,
  emptyLabel,
}: {
  title: string;
  items: HeyGenLibraryItem[];
  selectedId: string;
  onClose: () => void;
  onSelect: (item: HeyGenLibraryItem) => void;
  emptyLabel: string;
}) {
  const PAGE_SIZE = 12;
  const isAvatarMode = title.toLowerCase().includes("avatar");

  const [selectedFolder, setSelectedFolder] = React.useState<string>('');
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const gridScrollRef = React.useRef<HTMLDivElement>(null);

  // Group avatars by a pseudo‑folder (using avatar name as folder identifier)
  const avatarsByFolder = React.useMemo(() => {
    const map: Record<string, HeyGenLibraryItem[]> = {};
    const sourceItems = isAvatarMode ? items.filter(item => item.isCustom) : items;
    sourceItems.forEach(item => {
      const folder = item.name || item.id;
      if (!map[folder]) map[folder] = [];
      map[folder].push(item);
    });
    return map;
  }, [items, isAvatarMode]);

  const folderNames = React.useMemo(() => Object.keys(avatarsByFolder), [avatarsByFolder]);

  // Initialize selectedFolder to first folder when data changes
  React.useEffect(() => {
    if (folderNames.length > 0 && !folderNames.includes(selectedFolder)) {
      setSelectedFolder(folderNames[0]);
    }
  }, [folderNames]);

  // Reset visible count & scroll to top when folder changes
  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
  }, [selectedFolder]);

  const filteredItems = React.useMemo(() => {
    return selectedFolder ? avatarsByFolder[selectedFolder] || [] : [];
  }, [avatarsByFolder, selectedFolder]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleCount < filteredItems.length;

  // IntersectionObserver – load next batch when sentinel enters viewport
  React.useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredItems.length));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, filteredItems.length]);

  // UI render – split into two columns: folder list (left) and avatar grid (right)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div
        className={`flex w-full max-w-[min(92vw,820px)] flex-col overflow-hidden rounded-[28px] border ${HEYGEN_THEME.border} bg-white shadow-[0_32px_64px_rgba(0,0,0,0.18)]`}
        style={{ maxHeight: "min(90vh, 660px)" }}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-sm">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[11px] ${HEYGEN_THEME.textMuted}`}>
                  {isAvatarMode
                    ? `${folderNames.length} nhóm · ${items.filter(i => i.isCustom).length} avatar`
                    : `${items.length} mục`}
                </span>
                {selectedFolder && (
                  <>
                    <span className="text-slate-300 text-[11px]">›</span>
                    <span className="text-[11px] font-semibold text-cyan-600 truncate max-w-[140px]">
                      {selectedFolder}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ── */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/60 py-3 px-2">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Nhóm avatar
            </p>
            <ul className="space-y-1">
              {folderNames.map(name => {
                const isActive = name === selectedFolder;
                const folderItems = avatarsByFolder[name] ?? [];
                const count = folderItems.length;
                const thumb = folderItems[0]?.thumbnail || folderItems[0]?.avatarUrl || folderItems[0]?.previewImage || '';
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => setSelectedFolder(name)}
                      className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-2 py-2 text-left transition-all duration-150 ${
                        isActive
                          ? "bg-white shadow-sm ring-1 ring-slate-200"
                          : "hover:bg-white/70"
                      }`}
                    >
                      {/* Active left accent bar */}
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b from-cyan-400 to-violet-500" />
                      )}
                      {/* Folder thumbnail */}
                      <div className="ml-1 h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                        {thumb ? (
                          <img src={thumb} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                            <UserRound className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                      </div>
                      {/* Folder info */}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-semibold leading-tight ${isActive ? "text-slate-900" : "text-slate-600 group-hover:text-slate-800"}`}>
                          {name}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{count} avatar</p>
                      </div>
                      {/* Count pill */}
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700 tabular-nums">
                          {count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Avatar grid ── */}
          <div ref={gridScrollRef} className="flex-1 overflow-y-auto p-4">
            {filteredItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <UserRound className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-400">Không có avatar nào trong nhóm này.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {visibleItems.map(item => {
                    const isSelected = item.id === selectedId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item)}
                        className={`group relative overflow-hidden rounded-2xl text-left transition-all duration-200 ${
                          isSelected
                            ? "ring-2 ring-cyan-500 ring-offset-2 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                            : "ring-1 ring-slate-200 hover:ring-slate-300 hover:shadow-md"
                        } hover:scale-[1.025]`}
                      >
                        {/* Thumbnail with gradient name overlay */}
                        <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-100">
                          <img
                            src={item.thumbnail || item.avatarUrl || item.previewImage || ''}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.07]"
                          />
                          {/* Bottom gradient + name */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent px-2 pt-6 pb-2">
                            <p className="truncate text-[11px] font-semibold leading-tight text-white drop-shadow">
                              {item.name}
                            </p>
                          </div>
                          {/* Selected overlay */}
                          {isSelected && (
                            <div className="absolute inset-0 flex items-start justify-end bg-cyan-500/10 p-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* ── Infinite scroll sentinel + progress ── */}
                {hasMore ? (
                  <div ref={sentinelRef} className="mt-5 flex flex-col items-center gap-2 pb-2">
                    <div className="w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100 h-[3px]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-500"
                        style={{ width: `${Math.round((visibleCount / filteredItems.length) * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-400" />
                      <span className="text-[11px] text-slate-400">
                        {visibleCount} / {filteredItems.length} avatar
                      </span>
                    </div>
                  </div>
                ) : filteredItems.length > PAGE_SIZE ? (
                  <div className="mt-5 pb-2 flex items-center justify-center gap-1.5">
                    <span className="h-px flex-1 bg-slate-100" />
                    <p className="text-[11px] text-slate-400 px-2">Đã hiển thị tất cả {filteredItems.length} avatar</p>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AudioHistoryPopover({
  title,
  items,
  selectedId,
  isLoading,
  onRefresh,
  onClose,
  onSelect,
}: {
  title: string;
  items: ElevenLabsAudioRecord[];
  selectedId: string;
  isLoading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onSelect: (item: ElevenLabsAudioRecord) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-[min(92vw,760px)] rounded-[28px] border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surface} p-4 shadow-2xl`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className={`text-xs ${HEYGEN_THEME.textMuted}`}>Nguồn này được lấy từ lịch sử tạo giọng nói của ElevenLabs</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRefresh} className={`inline-flex h-8 items-center rounded-full border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-3 text-xs font-semibold text-slate-600 transition hover:text-slate-900`}>Làm mới</button>
            <button type="button" onClick={onClose} className={`flex h-8 w-8 items-center justify-center rounded-full border ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} text-slate-500 transition hover:text-slate-900`}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className={`flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} text-sm ${HEYGEN_THEME.textMuted}`}>
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            Đang tải audio...
          </div>
        ) : items.length === 0 ? (
          <div className={`rounded-2xl border border-dashed ${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} px-4 py-6 text-center text-sm ${HEYGEN_THEME.textMuted}`}>Chưa có audio ElevenLabs trong lịch sử.</div>
        ) : (
          <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1">
            {items.map((item) => {
              const isSelected = item._id === selectedId;
              return (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`rounded-[18px] border p-3 text-left transition ${
                    isSelected ? `${HEYGEN_THEME.accentBorder} ${HEYGEN_THEME.accentBg}` : `${HEYGEN_THEME.border} ${HEYGEN_THEME.surfaceMuted} hover:bg-slate-50`
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                        <AudioLines className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.metadata?.title || item.metadata?.voiceName || "Audio ElevenLabs"}</p>
                        <p className={`line-clamp-2 text-xs ${HEYGEN_THEME.textMuted}`}>{item.prompt || "Không có mô tả"}</p>
                        <p className="mt-2 text-[11px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "Mới tạo"}</p>
                      </div>
                    </div>
                    {isSelected ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white"><Check className="h-3.5 w-3.5" /></span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className={`inline-flex h-8 items-center gap-1.5 rounded-full border ${HEYGEN_THEME.border} bg-white px-3 text-xs font-semibold text-slate-600 transition hover:text-slate-900`}>
                      <Play className="h-3.5 w-3.5" />
                      Nghe
                    </a>
                    <a href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className={`inline-flex h-8 items-center gap-1.5 rounded-full border ${HEYGEN_THEME.border} bg-white px-3 text-xs font-semibold text-slate-600 transition hover:text-slate-900`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      Mở file
                    </a>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
