import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Images, Loader2, RefreshCw } from 'lucide-react';
import {
  type CampaignBulkImportJob,
  type CampaignBulkImportPreview,
  type CampaignDriveImportPreview,
  marketingCampaignService,
} from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

interface CampaignDriveImportPanelProps {
  campaignId: string;
  mediaKind: 'image' | 'video';
  allowBulkCreate?: boolean;
  awaitingAssetCount?: number;
  onCreateBulk?: () => void;
  onApplied?: () => void | Promise<void>;
}

export default function CampaignDriveImportPanel({
  campaignId,
  mediaKind,
  allowBulkCreate,
  awaitingAssetCount = 0,
  onCreateBulk,
  onApplied,
}: CampaignDriveImportPanelProps) {
  const [sourceMode, setSourceMode] = useState<'drive' | 'bulk'>('drive');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [driveImportPreview, setDriveImportPreview] = useState<CampaignDriveImportPreview | null>(null);
  const [driveImportLoading, setDriveImportLoading] = useState(false);
  const [driveImportApplying, setDriveImportApplying] = useState(false);
  const [bulkJobs, setBulkJobs] = useState<CampaignBulkImportJob[]>([]);
  const [selectedBulkJobId, setSelectedBulkJobId] = useState('');
  const [bulkPreview, setBulkPreview] = useState<CampaignBulkImportPreview | null>(null);
  const [bulkImportMode, setBulkImportMode] = useState<'replace' | 'append'>('replace');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const isVideo = mediaKind === 'video';
  const bulkEnabled = allowBulkCreate ?? !isVideo;
  const selectedBulkJob = bulkJobs.find((job) => job._id === selectedBulkJobId);
  const selectedBulkJobIsComplete = selectedBulkJob
    ? ['completed', 'partial'].includes(selectedBulkJob.status)
    : false;

  const loadBulkJobs = useCallback(async (silent = false) => {
    setBulkLoading(true);
    try {
      const jobs = await marketingCampaignService.listBulkImportJobs(campaignId);
      setBulkJobs(jobs);
      setSelectedBulkJobId((current) => (
        current && jobs.some((job) => job._id === current)
          ? current
          : jobs[0]?._id || ''
      ));
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : 'Không thể tải lịch sử Bulk Create.');
    } finally {
      setBulkLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (sourceMode === 'bulk' && bulkEnabled && bulkJobs.length === 0) {
      void loadBulkJobs();
    }
  }, [sourceMode, bulkEnabled, bulkJobs.length, loadBulkJobs]);

  const hasPendingBulkJob = bulkJobs.some((job) => ['queued', 'processing'].includes(job.status));

  useEffect(() => {
    if (sourceMode !== 'bulk' || !bulkEnabled || !hasPendingBulkJob) return;
    const timer = window.setInterval(() => void loadBulkJobs(true), 5000);
    return () => window.clearInterval(timer);
  }, [sourceMode, bulkEnabled, hasPendingBulkJob, loadBulkJobs]);

  useEffect(() => {
    if (!selectedBulkJobId || !selectedBulkJobIsComplete) {
      setBulkPreview(null);
      return;
    }
    let active = true;
    setBulkLoading(true);
    void marketingCampaignService.previewAssetOrdersFromBulkImport(campaignId, selectedBulkJobId)
      .then((preview) => {
        if (active) setBulkPreview(preview);
      })
      .catch((error) => {
        if (active) {
          setBulkPreview(null);
          toast.error(error instanceof Error ? error.message : 'Không thể xem trước kết quả Bulk Create.');
        }
      })
      .finally(() => {
        if (active) setBulkLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, selectedBulkJobId, selectedBulkJobIsComplete]);

  const applyBulkImport = async () => {
    if (!selectedBulkJobId || !bulkPreview) return;
    const actionLabel = bulkImportMode === 'append' ? 'bổ sung vào album' : 'thay thế ảnh hiện tại';
    if (!window.confirm(
      `Xác nhận ${actionLabel} cho ${bulkPreview.applicableOrders} bài bằng ${bulkPreview.linkedOutputCount} ảnh Bulk Create?`,
    )) return;
    setBulkApplying(true);
    try {
      const result = await marketingCampaignService.syncAssetOrdersFromBulkImport(
        campaignId,
        selectedBulkJobId,
        bulkImportMode,
      );
      if (!result.attachedSlots) {
        toast.warning(
          'Job này không có Order thuộc chiến dịch hiện tại. Hãy tạo Bulk Create từ Order của chiến dịch rồi thử lại.',
        );
        return;
      }
      await onApplied?.();
      toast.success(
        `Đã ${bulkImportMode === 'append' ? 'bổ sung' : 'thay thế'} ảnh cho ${result.attachedSlots} bài; ${result.queuedSlots} bài đã được đưa vào xử lý media.${result.truncatedImages ? ` Đã bỏ qua ${result.truncatedImages} ảnh vượt giới hạn album.` : ''}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể gắn Bulk Create vào chiến dịch.');
    } finally {
      setBulkApplying(false);
    }
  };

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
            {sourceMode === 'drive'
              ? <FolderOpen className="h-5 w-5" />
              : <Images className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                Thêm {isVideo ? 'video' : 'ảnh thiết kế'} vào chiến dịch
              </h3>
              {awaitingAssetCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-800">
                  {awaitingAssetCount} bài đang chờ {isVideo ? 'video' : 'ảnh'}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Chọn nguồn media, xem trước kết quả ghép rồi xác nhận đưa thẳng vào từng bài.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="inline-flex rounded-xl border border-blue-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setSourceMode('drive')}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-extrabold transition ${
              sourceMode === 'drive'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            Google Drive
          </button>
          <button
            type="button"
            onClick={() => {
              if (bulkEnabled) setSourceMode('bulk');
            }}
            disabled={!bulkEnabled}
            title={!bulkEnabled ? 'Chiến dịch này không có bài Facebook để nhận ảnh Bulk Create.' : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              sourceMode === 'bulk'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Images className="h-4 w-4" />
            Bulk Create
          </button>
        </div>

        {bulkEnabled && onCreateBulk && (
          <button
            type="button"
            onClick={onCreateBulk}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 text-xs font-extrabold text-violet-700 transition hover:bg-violet-100"
          >
            <Images className="h-4 w-4" />
            Tạo mới trong Bulk Create
          </button>
        )}

        {sourceMode === 'drive' ? (
          <>
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
          </>
        ) : (
          <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBulkJobId}
                onChange={(event) => setSelectedBulkJobId(event.target.value)}
                disabled={bulkLoading || bulkApplying}
                className="h-11 min-w-72 flex-1 rounded-xl border-2 border-blue-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="">Chọn Bulk Create của chiến dịch</option>
                {bulkJobs.map((job) => (
                  <option key={job._id} value={job._id}>
                    {job.templateName} · {job.status === 'completed' ? 'Hoàn tất' : job.status === 'partial' ? 'Hoàn tất một phần' : job.status === 'processing' ? 'Đang tạo' : job.status === 'queued' ? 'Đang chờ' : job.status === 'failed' ? 'Lỗi' : 'Đã hủy'} · {job.linkedOutputCount}/{job.linkedItemCount} ảnh · {new Date(job.createdAt).toLocaleString('vi-VN')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadBulkJobs()}
                disabled={bulkLoading || bulkApplying}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-extrabold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {bulkLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                Làm mới
              </button>
            </div>

            {selectedBulkJob && !selectedBulkJobIsComplete && (
              <p className="mt-3 text-xs font-semibold text-amber-700">
                Bulk Create đang ở trạng thái {selectedBulkJob.status === 'processing' ? 'đang tạo ảnh' : selectedBulkJob.status === 'queued' ? 'đang chờ xử lý' : selectedBulkJob.status === 'failed' ? 'lỗi' : 'đã hủy'}. Khi hoàn tất, bấm Làm mới để gắn ảnh vào chiến dịch.
              </p>
            )}

            {bulkPreview && (
              <div className="mt-3 rounded-lg bg-blue-50 px-3 py-3 text-xs text-blue-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-extrabold">
                      {bulkPreview.linkedOutputCount} ảnh · {bulkPreview.applicableOrders} bài có thể nhận
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-blue-700">
                      Mỗi bài nhận tối đa {bulkPreview.maxImagesPerOrder} ảnh, đúng theo Order ID và thứ tự trang Bulk Create.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bulkPreview.mappings.slice(0, 10).map((mapping) => (
                    <div
                      key={mapping.orderId}
                      className={`rounded-lg border px-3 py-2 ${
                        mapping.canApply
                          ? 'border-emerald-200 bg-white'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold text-slate-700">{mapping.title}</span>
                        <span className={`shrink-0 font-extrabold ${
                          mapping.canApply ? 'text-emerald-700' : 'text-amber-700'
                        }`}>
                          {mapping.outputUrls.length} ảnh
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-500">
                        {mapping.canApply
                          ? `${mapping.currentUrls.length} ảnh hiện tại · ${mapping.platform}`
                          : mapping.blockedReason}
                      </p>
                    </div>
                  ))}
                </div>

                {(bulkPreview.blockedOrders > 0 || bulkPreview.missingOrderIds.length > 0) && (
                  <p className="mt-2 text-[11px] font-semibold text-amber-700">
                    {bulkPreview.blockedOrders} bài bị bỏ qua do nền tảng/trạng thái; {bulkPreview.missingOrderIds.length} Order không thuộc chiến dịch.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-blue-200 pt-3">
                  <div className="inline-flex rounded-lg border border-blue-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setBulkImportMode('replace')}
                      className={`h-8 rounded-md px-3 text-[11px] font-extrabold ${
                        bulkImportMode === 'replace'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Thay thế ảnh cũ
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkImportMode('append')}
                      className={`h-8 rounded-md px-3 text-[11px] font-extrabold ${
                        bulkImportMode === 'append'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Bổ sung vào album
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void applyBulkImport()}
                    disabled={bulkLoading || bulkApplying || bulkPreview.applicableOrders === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {bulkApplying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Xác nhận {bulkImportMode === 'append' ? 'bổ sung' : 'thay thế'}
                  </button>
                </div>
              </div>
            )}

            {!bulkLoading && bulkJobs.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Chưa có Bulk Create nào được tạo từ Order của chiến dịch này. Hãy nhập Order chiến dịch sang Bulk Create rồi tạo ảnh.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
