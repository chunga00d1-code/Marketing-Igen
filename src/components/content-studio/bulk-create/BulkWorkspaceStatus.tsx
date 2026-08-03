import type { BulkRenderJob } from '../../../services/bulkCreateService';

interface BulkWorkspaceStatusProps {
  errorMessage: string;
  onDismissError: () => void;
  activeJob: BulkRenderJob | null;
}

export function BulkWorkspaceStatus({ errorMessage, onDismissError, activeJob }: BulkWorkspaceStatusProps) {
  return (
    <>
      {errorMessage && (
        <div className="mx-5 mt-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          <span>{errorMessage}</span>
          <button type="button" onClick={onDismissError}>Đóng</button>
        </div>
      )}
      {activeJob && ['queued', 'processing'].includes(activeJob.status) && (
        <div className="mx-5 mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm font-bold text-indigo-800">
            <span>Đang tạo {activeJob.completedItems}/{activeJob.totalItems} ảnh</span>
            <span>{activeJob.progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${activeJob.progress}%` }} />
          </div>
        </div>
      )}
    </>
  );
}
