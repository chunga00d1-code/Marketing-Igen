import { useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import {
  type CampaignDriveImportPreview,
  marketingCampaignService,
} from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

interface CampaignDriveImportPanelProps {
  campaignId: string;
  mediaKind: 'image' | 'video';
  awaitingAssetCount?: number;
  onApplied?: () => void | Promise<void>;
}

export default function CampaignDriveImportPanel({
  campaignId,
  mediaKind,
  awaitingAssetCount = 0,
  onApplied,
}: CampaignDriveImportPanelProps) {
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [driveImportPreview, setDriveImportPreview] = useState<CampaignDriveImportPreview | null>(null);
  const [driveImportLoading, setDriveImportLoading] = useState(false);
  const [driveImportApplying, setDriveImportApplying] = useState(false);
  const isVideo = mediaKind === 'video';

  const previewDriveImport = async () => {
    const folderUrl = driveFolderUrl.trim();
    if (!folderUrl) {
      toast.warning('Vui lòng nhập link thư mục Google Drive công khai.');
      return;
    }
    setDriveImportLoading(true);
    try {
      setDriveImportPreview(
        await marketingCampaignService.previewAssetOrderDriveImport(campaignId, folderUrl),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Không thể quét ${isVideo ? 'video' : 'ảnh'} từ Google Drive.`,
      );
    } finally {
      setDriveImportLoading(false);
    }
  };

  const applyDriveImport = async () => {
    const folderUrl = driveFolderUrl.trim();
    if (!driveImportPreview || !folderUrl) return;
    if (
      driveImportPreview.missingOrders.length > 0
      && !window.confirm(
        `Có ${driveImportPreview.missingOrders.length} bài chưa tìm thấy file. Vẫn nhập ${driveImportPreview.mappedOrders} bài đã ghép?`,
      )
    ) {
      return;
    }

    setDriveImportApplying(true);
    try {
      const result = await marketingCampaignService.applyAssetOrderDriveImport(
        campaignId,
        folderUrl,
      );
      setDriveImportPreview(result);
      await onApplied?.();
      toast.success(
        `Đã nhập ${result.appliedOrders || result.mappedOrders} ${isVideo ? 'video' : 'Order ảnh'} từ Drive; ${result.queuedSlots || 0} bài đã được đưa vào xử lý media.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Không thể nhập ${isVideo ? 'video' : 'ảnh'} Drive vào chiến dịch.`,
      );
    } finally {
      setDriveImportApplying(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-white to-emerald-50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-200">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {isVideo ? 'Nhập video TikTok từ Google Drive' : 'Nhập ảnh thiết kế từ Google Drive'}
              </h3>
              {awaitingAssetCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-800">
                  {awaitingAssetCount} bài đang chờ {isVideo ? 'video' : 'ảnh'}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Dán link thư mục để hệ thống tự ghép {isVideo ? 'video' : 'ảnh'} vào từng bài theo số thứ tự, sau đó xem trước trước khi xác nhận.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={driveFolderUrl}
            onChange={(event) => {
              setDriveFolderUrl(event.target.value);
              setDriveImportPreview(null);
            }}
            placeholder="Dán link thư mục Drive công khai tại đây..."
            className="h-11 min-w-72 flex-1 rounded-xl border-2 border-blue-200 bg-white px-4 text-sm text-slate-800 shadow-inner outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => void previewDriveImport()}
            disabled={driveImportLoading || driveImportApplying || !driveFolderUrl.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {driveImportLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FolderOpen className="h-4 w-4" />}
            Quét và xem trước
          </button>
        </div>
        <p className="rounded-lg bg-white/80 px-3 py-2 text-[11px] leading-5 text-blue-900">
          <strong>Quy tắc tên file:</strong>{' '}
          {isVideo ? (
            <>
              <code>1.mp4</code> hoặc <code>1</code> nếu Drive nhận diện MIME video; video phải là MP4, MOV hoặc WebM.
            </>
          ) : (
            <>
              <code>1.jpg</code>, <code>2.png</code>; album dùng <code>3_1.jpg</code>, <code>3_2.jpg</code>.
            </>
          )}{' '}
          Hệ thống không tự dồn file khi thiếu số.
        </p>

        {driveImportPreview && (
          <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-700">
                Ghép được {driveImportPreview.mappedOrders}/{driveImportPreview.totalOrders} bài từ {driveImportPreview.totalFiles} file
              </span>
              <button
                type="button"
                onClick={() => void applyDriveImport()}
                disabled={driveImportApplying || !driveImportPreview.mappedOrders}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {driveImportApplying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Xác nhận nhập {isVideo ? 'video' : 'ảnh'}
              </button>
            </div>
            <div className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
              {driveImportPreview.mappings.slice(0, 8).map((mapping) => (
                <div
                  key={mapping.orderId}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                >
                  <span className="truncate">#{mapping.position} · {mapping.title}</span>
                  <span className="shrink-0 font-bold text-emerald-700">{mapping.files.length} file</span>
                </div>
              ))}
            </div>
            {driveImportPreview.missingOrders.length > 0 && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700">
                Còn {driveImportPreview.missingOrders.length} bài chưa có file; file không có số hoặc vượt số bài: {driveImportPreview.unmatchedFiles.length}.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
