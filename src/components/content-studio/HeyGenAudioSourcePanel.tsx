import { AudioLines, Check, ExternalLink, LoaderCircle, Play, RefreshCw } from "lucide-react";

export type ElevenLabsAudioRecord = {
  _id: string;
  url: string;
  prompt?: string;
  createdAt?: string;
  metadata?: {
    title?: string;
    voiceName?: string;
    duration?: number;
    description?: string;
  };
};

type HeyGenAudioSourcePanelProps = {
  records: ElevenLabsAudioRecord[];
  selectedRecordId: string;
  isLoading: boolean;
  onRefresh: () => void;
  onSelect: (recordId: string) => void;
};

function formatDuration(value: unknown) {
  const duration = Number(value || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "Audio";
  }
  return `${Math.max(1, Math.round(duration))}s`;
}

export function HeyGenAudioSourcePanel({
  records,
  selectedRecordId,
  isLoading,
  onRefresh,
  onSelect,
}: HeyGenAudioSourcePanelProps) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Audio từ ElevenLabs</p>
          <p className="text-xs text-slate-500">Chọn một audio đã tạo để đưa thẳng vào HeyGen qua `audio_url`.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Tải lại
        </button>
      </div>

      {isLoading ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50 text-slate-500">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Đang tải lịch sử audio...
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Chưa có audio ElevenLabs trong lịch sử.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {records.map((record) => {
            const isSelected = record._id === selectedRecordId;
            return (
              <button
                key={record._id}
                type="button"
                onClick={() => onSelect(record._id)}
                className={`rounded-[20px] border p-4 text-left transition ${
                  isSelected
                    ? "border-cyan-300 bg-cyan-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                      <AudioLines className="h-4 w-4" />
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {record.metadata?.title || record.metadata?.voiceName || "ElevenLabs audio"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{record.prompt || "Không có mô tả"}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{formatDuration(record.metadata?.duration)}</span>
                      <span>{record.createdAt ? new Date(record.createdAt).toLocaleString("vi-VN") : "Mới tạo"}</span>
                    </div>
                  </div>
                  {isSelected ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <a
                    href={record.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Nghe audio
                  </a>
                  <a
                    href={record.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  >
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
  );
}
