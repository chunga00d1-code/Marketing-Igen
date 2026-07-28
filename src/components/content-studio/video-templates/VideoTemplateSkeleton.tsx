export function VideoTemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 10 }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-2.5 shadow-2xs animate-pulse"
        >
          {/* Thumbnail Skeleton */}
          <div className="relative w-full aspect-16/9 rounded-xl bg-slate-200/80 overflow-hidden mb-3">
            <div className="absolute top-2.5 left-2.5 h-5 w-12 rounded-full bg-slate-300/80" />
            <div className="absolute top-2.5 right-2.5 h-6 w-6 rounded-full bg-slate-300/80" />
            <div className="absolute bottom-2.5 left-2.5 h-5 w-16 rounded-full bg-slate-300/80" />
          </div>

          {/* Title & Tag Skeletons */}
          <div className="px-1 flex flex-col gap-2">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-150" />
            <div className="mt-1 flex items-center justify-between">
              <div className="h-3 w-1/3 rounded bg-slate-150" />
              <div className="h-3 w-1/4 rounded bg-slate-150" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
