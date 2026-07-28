import { useState, useEffect, useCallback } from 'react';
import { Search, Sparkles, RefreshCw, AlertCircle, Clock3 } from 'lucide-react';
import {
  VideoTemplateCategory,
  VideoTemplateSummary,
  VideoTemplateDetail,
  VideoTemplateAspectRatio,
  VideoProjectDetail,
  ShotstackSyncStatus,
  ShotstackSyncSummary,
} from '../../../types/video-template';
import { videoTemplateService } from '../../../services/videoTemplateService';
import { VideoTemplateCard } from './VideoTemplateCard';
import { VideoTemplateFilters } from './VideoTemplateFilters';
import { VideoTemplateSkeleton } from './VideoTemplateSkeleton';
import { VideoTemplateDetailModal } from './VideoTemplateDetailModal';
import {
  canManageShotstackTemplates,
  runShotstackTemplateSync,
} from './shotstackTemplateSync';
import { toast } from '../../../pages/Toast';
import { useAuth } from '../../../context/AuthContext';

interface VideoTemplateLibraryProps {
  onSelectEditTab: (
    projectId?: string,
    mediaUrl?: string,
    title?: string,
    aspectRatio?: VideoTemplateAspectRatio,
    duration?: number
  ) => void;
}

interface ShotstackSyncControlProps {
  canManageTemplates: boolean;
  isSyncing: boolean;
  status: ShotstackSyncStatus | null;
  latestSummary?: ShotstackSyncSummary | null;
  statusError?: string | null;
  onSync: () => void;
}

function formatSyncTime(value?: string): string {
  if (!value) return 'Chưa đồng bộ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';
  return date.toLocaleString('vi-VN');
}

function syncStateLabel(status: ShotstackSyncStatus['status']): string {
  if (status === 'success') return 'Thành công';
  if (status === 'partial') return 'Hoàn tất một phần';
  if (status === 'failed') return 'Thất bại';
  return 'Chưa đồng bộ';
}

function formatSyncSummary(summary: ShotstackSyncSummary): string {
  return `Đồng bộ hoàn tất: ${summary.created} tạo mới, ${summary.updated} cập nhật, ${summary.unchanged} không đổi, ${summary.archived} lưu trữ, ${summary.failedCount} lỗi.`;
}

export function ShotstackSyncControl({
  canManageTemplates,
  isSyncing,
  status,
  latestSummary,
  statusError,
  onSync,
}: ShotstackSyncControlProps) {
  if (!canManageTemplates) return null;

  const visibleSummary = latestSummary || status?.summary;
  const failedCount = visibleSummary?.failedCount ?? visibleSummary?.failed.length ?? 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={isSyncing}
        onClick={onSync}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:from-indigo-600 hover:to-cyan-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Shotstack'}
      </button>

      <div className="text-right text-[10px] leading-relaxed text-slate-300" aria-live="polite">
        {statusError ? (
          <span className="text-rose-300">{statusError}</span>
        ) : (
          <>
            <div>
              Trạng thái: {syncStateLabel(status?.status ?? null)}
              {failedCount > 0 ? ` · ${failedCount} mẫu lỗi` : ''}
            </div>
            <div>
              Lần đồng bộ gần nhất: {formatSyncTime(status?.lastAttemptAt)}
            </div>
            {status && !status.configured && (
              <div className="text-amber-300">Shotstack chưa được cấu hình.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function VideoTemplateLibrary({ onSelectEditTab }: VideoTemplateLibraryProps) {
  const { userProfile } = useAuth();
  const canManageTemplates = canManageShotstackTemplates(userProfile?.role);
  // State
  const [categories, setCategories] = useState<VideoTemplateCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<'all' | VideoTemplateAspectRatio>('all');
  const [selectedDuration, setSelectedDuration] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [selectedSort, setSelectedSort] = useState<'popular' | 'newest'>('popular');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [templates, setTemplates] = useState<VideoTemplateSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isError, setIsError] = useState(false);
  const [recentProjects, setRecentProjects] = useState<VideoProjectDetail[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ShotstackSyncStatus | null>(null);
  const [latestSyncSummary, setLatestSyncSummary] = useState<ShotstackSyncSummary | null>(null);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);

  // Selected Detail Modal
  const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<VideoTemplateDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Load Categories on Mount
  useEffect(() => {
    videoTemplateService
      .getCategories()
      .then((cats) => setCategories(cats))
      .catch((err) => console.error('Failed to load template categories:', err));
  }, []);

  useEffect(() => {
    videoTemplateService.getProjects()
      .then((items) => setRecentProjects(items.slice(0, 5)))
      .catch(() => setRecentProjects([]));
  }, []);

  // Fetch Templates callback
  const fetchTemplates = useCallback(
    async (currentPage: number, append = false) => {
      if (!append) setIsLoading(true);
      else setIsLoadingMore(true);
      setIsError(false);

      try {
        const response = await videoTemplateService.getTemplates({
          scope: 'discover',
          category: selectedCategory,
          aspectRatio: selectedAspectRatio,
          duration: selectedDuration,
          search: debouncedSearch,
          sort: selectedSort,
          page: currentPage,
          limit: 10,
        });

        if (append) {
          setTemplates((prev) => [...prev, ...response.items]);
        } else {
          setTemplates(response.items);
        }

        setHasMore(response.pagination.hasMore);
        setTotalCount(response.pagination.total);
      } catch (err) {
        console.error('Error loading video templates:', err);
        setIsError(true);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [selectedCategory, selectedAspectRatio, selectedDuration, debouncedSearch, selectedSort]
  );

  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await videoTemplateService.getShotstackSyncStatus();
      setSyncStatus(status);
      setSyncStatusError(null);
    } catch (error: unknown) {
      setSyncStatusError(
        error instanceof Error ? error.message : 'Không thể tải trạng thái đồng bộ Shotstack.'
      );
    }
  }, []);

  useEffect(() => {
    if (canManageTemplates) {
      void fetchSyncStatus();
    }
  }, [canManageTemplates, fetchSyncStatus]);

  // Reset to page 1 on filter/search/scope changes
  useEffect(() => {
    setPage(1);
    fetchTemplates(1, false);
  }, [fetchTemplates]);

  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchTemplates(nextPage, true);
    }
  };

  const handleCardClick = async (template: VideoTemplateSummary) => {
    try {
      const detail = await videoTemplateService.getTemplateById(template.id);
      setSelectedTemplateDetail(detail);
      setIsDetailModalOpen(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Lỗi mạng';
      toast.error(`Không thể tải thông tin mẫu: ${errorMsg}`);
    }
  };

  const handleShotstackSync = async () => {
    const summary = await runShotstackTemplateSync({
      sync: () => videoTemplateService.syncShotstackTemplates(),
      refreshCatalogue: () => fetchTemplates(1, false),
      refreshStatus: fetchSyncStatus,
      setSyncing: setIsSyncing,
      onSuccess: (result) => toast.success(formatSyncSummary(result)),
      onError: (message) => toast.error(message),
    });
    if (summary) {
      setPage(1);
      setLatestSyncSummary(summary);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-2 pb-10" id="video_template_library_root">
      {/* Header Banner Section */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 text-white shadow-md">
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-bold text-indigo-300 w-fit">
              <Sparkles className="h-3.5 w-3.5" />
              TikTok & CapCut Template Style
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Thư viện video mẫu
            </h1>
            <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Khám phá các video mẫu ngắn xu hướng và sử dụng ngay chỉ với một lần nhấn.
            </p>
          </div>

          <ShotstackSyncControl
            canManageTemplates={canManageTemplates}
            isSyncing={isSyncing}
            status={syncStatus}
            latestSummary={latestSyncSummary}
            statusError={syncStatusError}
            onSync={() => void handleShotstackSync()}
          />
        </div>

        {/* Search Bar Row */}
        <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm mẫu video (VD: Flash sale, Review, TikTok...)"
              className="w-full rounded-2xl border border-white/15 bg-slate-900/80 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-400 backdrop-blur-md focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters Component */}
      {recentProjects.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock3 className="h-4 w-4 text-cyan-600" />
            Dự án gần đây
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentProjects.map((recentProject) => (
              <button
                key={recentProject.id}
                type="button"
                onClick={() => onSelectEditTab(
                  recentProject.id,
                  recentProject.sourceMediaUrl,
                  recentProject.title,
                  recentProject.aspectRatio,
                  recentProject.duration
                )}
                className="min-w-44 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-cyan-400 hover:bg-cyan-50"
              >
                <span className="block truncate text-xs font-bold text-slate-800">{recentProject.title}</span>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {recentProject.aspectRatio} · {Math.round(recentProject.duration)} giây
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <VideoTemplateFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        selectedAspectRatio={selectedAspectRatio}
        onSelectAspectRatio={setSelectedAspectRatio}
        selectedDuration={selectedDuration}
        onSelectDuration={setSelectedDuration}
        selectedSort={selectedSort}
        onSelectSort={setSelectedSort}
      />

      {/* Main Grid View */}
      {isLoading ? (
        <VideoTemplateSkeleton />
      ) : isError ? (
        /* Error State */
        <div className="flex flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50/50 p-12 text-center my-6">
          <AlertCircle className="h-10 w-10 text-rose-500 mb-3 animate-bounce" />
          <h3 className="text-base font-bold text-slate-900">Tải dữ liệu mẫu video thất bại</h3>
          <p className="mt-1 text-xs text-slate-600 max-w-md">
            Có lỗi xảy ra khi kết nối dịch vụ. Vui lòng kiểm tra kết nối mạng hoặc thử lại.
          </p>
          <button
            type="button"
            onClick={() => fetchTemplates(1, false)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 shadow-sm transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </button>
        </div>
      ) : templates.length === 0 ? (
        /* Empty Search */
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-12 text-center my-6 shadow-2xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
            <Search className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Không tìm thấy mẫu phù hợp</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md">
            Thử tìm kiếm với từ khóa khác hoặc bỏ các bộ lọc tỷ lệ / danh mục hiện tại.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSelectedCategory('all');
              setSelectedAspectRatio('all');
              setSelectedDuration('all');
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2 transition-all cursor-pointer"
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : (
        /* Template Grid */
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-start">
            {templates.map((tmpl) => (
              <VideoTemplateCard
                key={tmpl.id}
                template={tmpl}
                onClick={handleCardClick}
                aspectRatioOverride="16:9"
              />
            ))}
          </div>

          {/* Load More Pagination */}
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs px-6 py-2.5 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                    Đang tải thêm...
                  </>
                ) : (
                  <>Xem thêm ({totalCount - templates.length} mẫu nữa)</>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <VideoTemplateDetailModal
        template={selectedTemplateDetail}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onSelectEditMode={(projectId, mediaUrl, title, aspectRatio, duration) => {
          onSelectEditTab(projectId, mediaUrl, title, aspectRatio, duration);
        }}
      />
    </div>
  );
}
