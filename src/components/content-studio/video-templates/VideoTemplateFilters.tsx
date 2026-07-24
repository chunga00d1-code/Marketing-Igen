import { VideoTemplateCategory, VideoTemplateAspectRatio } from '../../../types/video-template';
import { SlidersHorizontal, ArrowUpDown, Smartphone, Square, Monitor } from 'lucide-react';

interface VideoTemplateFiltersProps {
  categories: VideoTemplateCategory[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  selectedAspectRatio: 'all' | VideoTemplateAspectRatio;
  onSelectAspectRatio: (ratio: 'all' | VideoTemplateAspectRatio) => void;
  selectedDuration: 'all' | 'short' | 'medium' | 'long';
  onSelectDuration: (duration: 'all' | 'short' | 'medium' | 'long') => void;
  selectedSort: 'popular' | 'newest';
  onSelectSort: (sort: 'popular' | 'newest') => void;
}

export function VideoTemplateFilters({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedAspectRatio,
  onSelectAspectRatio,
  selectedDuration,
  onSelectDuration,
  selectedSort,
  onSelectSort,
}: VideoTemplateFiltersProps) {
  return (
    <div className="flex flex-col gap-3 py-1">
      {/* Category Chips Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
        {categories.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Filter Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-2xs">
        {/* Left: Aspect Ratio & Duration Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 mr-1">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            Lọc:
          </span>

          {/* Aspect Ratio Chips */}
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 p-0.5 border border-slate-200/60">
            <button
              type="button"
              onClick={() => onSelectAspectRatio('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                selectedAspectRatio === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả tỉ lệ
            </button>
            <button
              type="button"
              onClick={() => onSelectAspectRatio('9:16')}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                selectedAspectRatio === '9:16'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-3 w-3" />
              9:16
            </button>
            <button
              type="button"
              onClick={() => onSelectAspectRatio('1:1')}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                selectedAspectRatio === '1:1'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Square className="h-3 w-3" />
              1:1
            </button>
            <button
              type="button"
              onClick={() => onSelectAspectRatio('16:9')}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                selectedAspectRatio === '16:9'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="h-3 w-3" />
              16:9
            </button>
          </div>

          {/* Duration Filter */}
          <select
            value={selectedDuration}
            onChange={(e) => onSelectDuration(e.target.value as 'all' | 'short' | 'medium' | 'long')}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="all">Thời lượng: Tất cả</option>
            <option value="short">Ngắn (&le; 15 giây)</option>
            <option value="medium">Trung bình (15s - 30s)</option>
            <option value="long">Dài (&gt; 30 giây)</option>
          </select>
        </div>

        {/* Right: Sort Options */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            Sắp xếp:
          </span>
          <select
            value={selectedSort}
            onChange={(e) => onSelectSort(e.target.value as 'popular' | 'newest')}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="popular">Phổ biến nhất</option>
            <option value="newest">Mới nhất</option>
          </select>
        </div>
      </div>
    </div>
  );
}
