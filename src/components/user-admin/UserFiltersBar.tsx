interface Props {
  searchQuery: string;
  filterStartDate: string;
  filterEndDate: string;
  visibleUsersCount: number;
  totalUsersCount: number;
  onSearchChange: (value: string) => void;
  onFilterStartDateChange: (value: string) => void;
  onFilterEndDateChange: (value: string) => void;
  onClear: () => void;
}

export function UserFiltersBar(props: Props) {
  const {
    searchQuery,
    filterStartDate,
    filterEndDate,
    visibleUsersCount,
    totalUsersCount,
    onSearchChange,
    onFilterStartDateChange,
    onFilterEndDateChange,
    onClear,
  } = props;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shrink-0">
      <div className="flex flex-wrap items-center gap-3 flex-1">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 border border-gray-200 bg-gray-50/50 hover:bg-white focus:bg-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-650 text-[10px] font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider font-mono">Từ ngày:</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => onFilterStartDateChange(e.target.value)}
            className="p-1.5 border border-gray-200 bg-gray-50/50 hover:bg-white focus:bg-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold cursor-pointer"
          />

          <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider font-mono">Đến ngày:</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => onFilterEndDateChange(e.target.value)}
            className="p-1.5 border border-gray-200 bg-gray-50/50 hover:bg-white focus:bg-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold cursor-pointer"
          />
        </div>

        <div className="text-[10px] text-gray-400 font-semibold font-mono">
          Kết quả: {visibleUsersCount} / {totalUsersCount}
        </div>
      </div>

      {(searchQuery || filterStartDate || filterEndDate) && (
        <button
          onClick={onClear}
          className="px-3.5 py-1.5 border border-dashed border-red-200 hover:border-red-400 bg-red-50/30 hover:bg-red-50 text-red-650 hover:text-red-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95"
        >
          ✕ Xóa bộ lọc
        </button>
      )}
    </div>
  );
}
