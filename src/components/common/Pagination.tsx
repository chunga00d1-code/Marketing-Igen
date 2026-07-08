import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function buildPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export function Pagination({ currentPage, totalPages, onPageChange, className = "" }: PaginationProps) {
  const [jumpPage, setJumpPage] = useState(String(currentPage));

  useEffect(() => {
    setJumpPage(String(currentPage));
  }, [currentPage]);

  if (totalPages <= 1) return null;

  const pageItems = buildPageItems(currentPage, totalPages);

  const submitJump = () => {
    const nextPage = Number(jumpPage);
    if (!Number.isFinite(nextPage)) {
      setJumpPage(String(currentPage));
      return;
    }

    const normalized = Math.min(Math.max(1, Math.trunc(nextPage)), totalPages);
    onPageChange(normalized);
  };

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageItems.map((item, index) =>
          item === "..." ? (
            <span key={`ellipsis-${index}`} className="flex h-8 min-w-8 items-center justify-center px-1 text-xs font-semibold text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(Number(item))}
              className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-colors ${
                currentPage === item
                  ? "bg-slate-900 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Trang sau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-gray-500">Trang {currentPage}/{totalPages}</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpPage}
          onChange={(event) => setJumpPage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitJump();
          }}
          className="h-8 w-16 rounded-lg border border-gray-200 bg-slate-50 px-2 text-center font-semibold text-gray-700 outline-none focus:border-slate-400"
          aria-label="Nhập trang cần nhảy"
        />
        <button
          type="button"
          onClick={submitJump}
          className="h-8 rounded-lg border border-gray-200 px-3 font-bold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Di
        </button>
      </div>
    </div>
  );
}
