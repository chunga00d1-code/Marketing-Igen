import React from 'react';
import {
  Trash2,
  Upload,
  Globe2,
  Share2,
  Type,
  ImagePlus,
  Image as ImageIcon,
  Square,
  Tag,
  Megaphone,
  Star,
  Layers3,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type {
  EditorTool,
  LayerPresetDragPayload,
  LayerType,
  TemplateLayer,
  DataRow,
} from './types';
import type {
  BulkTemplate,
  BulkRenderJob,
  BulkRenderItem,
  BulkAsset,
  BulkDataColumn,
  CanvaConnectionStatus,
  CanvaDesign,
} from '../../../services/bulkCreateService';
import type { CampaignAssetOrderData, MarketingCampaignSummary } from '../../../services/marketingCampaignService';
import { TOOLS } from './constants';
import { CanvasSizePicker } from './CanvasSizePicker';
import { TemplatePreview } from './TemplatePreview';
import { DataPanel } from './DataPanel';
import { JobPanel } from './JobPanel';
import type { BulkMarketingPreset } from './systemTemplates';
import { toast } from '../../../pages/Toast';

export interface EditorPanelProps {
  activeTool: EditorTool;
  backgroundImage: string;
  backgroundColor: string;
  layers: TemplateLayer[];
  selectedLayerId?: string;
  rows: DataRow[];
  dataColumns: BulkDataColumn[];
  dataStep: 1 | 2 | 3;
  dataSourceName: string;
  activeRowId: string;
  sheetInput: string;
  googleSheetUrl: string;
  loadingSheet: boolean;
  campaigns: MarketingCampaignSummary[];
  selectedCampaignId: string;
  bulkTarget: 'standalone' | 'campaign';
  campaignContext: CampaignAssetOrderData | null;
  loadingCampaigns: boolean;
  loadingCampaignOrders: boolean;
  readyCount: number;
  canvasSize: { width: number; height: number };
  systemTemplates: BulkMarketingPreset[];
  templates: BulkTemplate[];
  loadingTemplates: boolean;
  templatesTotal: number;
  templatePage: number;
  onChangeTemplatePage: (page: number) => void;
  communityTemplates: BulkTemplate[];
  jobs: BulkRenderJob[];
  activeJob: BulkRenderJob | null;
  jobItems: BulkRenderItem[];
  onBackgroundUpload: (value: string) => void;
  onUploadAsset: (file: File, target: 'background' | 'layer') => void;
  onBackgroundColor: (value: string) => void;
  onRemoveBackground: () => void;
  onAddLayer: (type: LayerType, initialValue?: string, overrides?: Partial<TemplateLayer>) => void;
  onSelectLayer: (id: string) => void;
  onSheetInput: (value: string) => void;
  onImportSheet: () => void;
  onDataStep: (step: 1 | 2 | 3) => void;
  onGoogleSheetUrl: (value: string) => void;
  onImportGoogleSheet: () => void;
  onLoadCampaigns: () => void;
  onSelectCampaign: (campaignId: string) => void;
  onBulkTarget: (target: 'standalone' | 'campaign') => void;
  onImportCampaignOrders: () => void;
  onConnectLayer: (layerId: string, columnKey: string) => void;
  onAutoMatch: () => void;
  onToggleRow: (rowId: string) => void;
  onSelectAllRows: (selected: boolean) => void;
  onCreatePages: () => void;
  onImportExcel: (file: File) => void;
  onCanvasSize: (size: { width: number; height: number }) => void;
  onApplySystemTemplate: (template: BulkMarketingPreset) => void;
  onAddRow: () => void;
  onSelectRow: (id: string) => void;
  onAssignCampaignSlot: (rowId: string, slotId: string) => void;
  onUpdateCell: (rowId: string, layerId: string, value: string) => void;
  onDuplicateRow: (row: DataRow) => void;
  onRemoveRow: (id: string) => void;
  onLoadTemplate: (template: BulkTemplate) => void;
  onLoadMoreTemplates: () => void;
  onArchiveTemplate: (templateId: string) => void;
  onPublishTemplate: (templateId: string) => void;
  onUnpublishTemplate: (templateId: string) => void;
  onUseCommunityTemplate: (templateId: string) => void;
  onOpenJob: (job: BulkRenderJob) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onDownloadJob: (job: BulkRenderJob) => void;
  onClose: () => void;
  uploadedImages: BulkAsset[];
  uploadingAsset: boolean;
  onDeleteUploadedImage: (assetId: string) => void;
  importingTemplate: boolean;
  onImportTemplate: (file: File) => void;
  onStartCanvaConnection: () => void;
  canvaStatus: CanvaConnectionStatus;
  canvaDesigns: CanvaDesign[];
  loadingCanva: boolean;
  canvaError: string;
  onRefreshCanva: () => void;
}

export function EditorPanel(props: EditorPanelProps) {
  const {
    activeTool,
    backgroundImage,
    backgroundColor,
    layers,
    uploadedImages,
    onDeleteUploadedImage,
    loadingTemplates,
    templatesTotal,
    templatePage,
    onChangeTemplatePage,
  } = props;

  const startLayerPresetDrag = (
    event: React.DragEvent<HTMLElement>,
    payload: LayerPresetDragPayload,
  ) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-igen-bulk-layer-preset', JSON.stringify(payload));
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5">
        <h3 className="text-lg font-extrabold text-slate-900">
          {TOOLS.find((tool) => tool.id === activeTool)?.label}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {activeTool === 'data'
            ? 'Mỗi dòng tạo ra một thiết kế.'
            : 'Chọn hoặc thêm nội dung vào mẫu.'}
        </p>
      </div>

      <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-scroll overscroll-contain p-4 [scrollbar-gutter:stable]">
        {activeTool === 'canva' && (
          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-base font-black text-white">C</span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900">Thiết kế Canva</p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">Xem các thiết kế gần đây của tài khoản đã kết nối và mở chúng trực tiếp trong Canva.</p>
                </div>
              </div>
            </div>

            {props.loadingCanva ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Đang đồng bộ Canva...
              </div>
            ) : props.canvaStatus.connected ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-extrabold text-emerald-900">Đã kết nối Canva</p>
                {props.canvaStatus.connectedAt && (
                  <p className="mt-1 text-xs text-emerald-800">Kết nối lúc {new Date(props.canvaStatus.connectedAt).toLocaleString('vi-VN')}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={props.onRefreshCanva} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100">Làm mới</button>
                  <button type="button" onClick={props.onStartCanvaConnection} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-violet-700">Đổi tài khoản</button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-extrabold text-amber-900">Chưa kết nối Canva</p>
                <p className="mt-1 break-words text-xs leading-relaxed text-amber-800">Kết nối tài khoản Canva để tải danh sách thiết kế của tài khoản đó.</p>
                <button type="button" onClick={props.onStartCanvaConnection} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700"><Globe2 className="h-4 w-4" /> Kết nối Canva</button>
              </div>
            )}

            {props.canvaError && (
              <div className="break-words rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-relaxed text-rose-700">{props.canvaError}</div>
            )}

            {!props.loadingCanva && props.canvaStatus.connected && (
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-extrabold text-slate-800">Thiết kế gần đây</p>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{props.canvaDesigns.length}</span>
                </div>
                {props.canvaDesigns.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs leading-relaxed text-slate-600">Chưa tìm thấy thiết kế nào trong tài khoản Canva này.</div>
                ) : (
                  <div className="min-w-0 space-y-2">
                    {props.canvaDesigns.map((design) => {
                      const designUrl = design.urls?.edit_url || design.urls?.view_url;
                      return (
                        <button
                          key={design.id}
                          type="button"
                          disabled={!designUrl}
                          onClick={() => designUrl && window.open(designUrl, '_blank', 'noopener,noreferrer')}
                          className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-violet-300 hover:shadow-sm disabled:cursor-default"
                        >
                          <span className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                            {design.thumbnail?.url ? (
                              <img src={design.thumbnail.url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-slate-400" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-extrabold text-slate-800">{design.title || 'Thiết kế chưa đặt tên'}</span>
                            <span className="mt-1 block truncate text-[10px] font-semibold text-violet-600">{designUrl ? 'Mở trong Canva' : 'Không có liên kết mở'}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {activeTool === 'background' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2.5">
              <p className="text-sm font-extrabold text-violet-900">Ảnh nền luôn ở dưới các trường</p>
              <p className="mt-0.5 text-xs leading-relaxed text-violet-700">
                Chọn hoặc kéo ảnh từ thư viện vào trang để thay nền. Muốn thay ảnh sản phẩm, hãy chuyển sang mục Hình ảnh.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
              <div>
                <p className="text-sm font-extrabold text-slate-800">Mẫu marketing có sẵn</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Chọn mẫu để mở trong trình biên tập, sau đó sửa layer hoặc map dữ liệu để tạo hàng loạt.</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {props.systemTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => props.onApplySystemTemplate(template)}
                    className="group min-h-24 rounded-xl border border-white bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                  >
                    <span className="mb-2 block h-1.5 w-10 rounded-full" style={{ backgroundColor: template.accent }} />
                    <span className="block text-xs font-extrabold text-slate-800">{template.name}</span>
                    <span className="mt-1 block text-[10px] leading-snug text-slate-500">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <label
              className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition ${
                props.importingTemplate
                  ? 'cursor-wait border-indigo-400 bg-indigo-50'
                  : 'border-violet-300 bg-violet-50/60 hover:border-violet-500 hover:bg-violet-50'
              }`}
            >
              <Upload className={`mb-2 h-6 w-6 ${props.importingTemplate ? 'animate-bounce text-indigo-600' : 'text-violet-600'}`} />
              <span className="text-sm font-extrabold text-slate-800">
                {props.importingTemplate ? 'Đang chuyển mẫu thành template...' : 'Nhập mẫu thành template'}
              </span>
              <span className="mt-1 max-w-[240px] text-xs leading-relaxed text-slate-500">
                PNG, JPG, WEBP hoặc PDF. Hệ thống tự nhận diện vùng nội dung để mở ngay trong editor.
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf"
                className="hidden"
                disabled={props.importingTemplate}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) props.onImportTemplate(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <p className="-mt-2 text-[10px] leading-relaxed text-slate-400">
              AI tạo bản nháp có thể chỉnh sửa; hãy kiểm tra preview trước khi render hàng loạt.
            </p>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-extrabold text-slate-700">Màu nền trang</p>
                  <p className="mt-0.5 text-xs text-slate-500">Bấm trực tiếp vào trang để chỉnh nhanh.</p>
                </div>
                <label
                  className="relative h-10 w-10 cursor-pointer overflow-hidden rounded-lg border border-slate-300 shadow-sm"
                  style={{ backgroundColor }}
                >
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => props.onBackgroundColor(event.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Màu nền trang"
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-8 gap-2">
                {['#ffffff', '#f8fafc', '#e2e8f0', '#fef3c7', '#fee2e2', '#dcfce7', '#dbeafe', '#ede9fe'].map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => props.onBackgroundColor(color)}
                      className={`aspect-square rounded-full border shadow-sm ${
                        backgroundColor === color && !backgroundImage
                          ? 'ring-2 ring-indigo-500 ring-offset-2'
                          : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  )
                )}
              </div>
              {backgroundImage && (
                <button
                  type="button"
                  onClick={props.onRemoveBackground}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" /> Xóa ảnh nền
                </button>
              )}
            </div>

            <CanvasSizePicker size={props.canvasSize} onChange={props.onCanvasSize} />

            <label
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center hover:border-indigo-500 hover:bg-indigo-50 ${
                backgroundImage ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'
              }`}
            >
              <Upload className="mb-2 h-6 w-6 text-indigo-600" />
              <span className="text-sm font-extrabold">Tải ảnh nền của bạn</span>
              <span className="mt-1 text-xs text-slate-500">PNG hoặc JPG</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) props.onUploadAsset(file, 'background');
                  event.currentTarget.value = '';
                }}
                disabled={props.uploadingAsset}
              />
            </label>

            {/* Lịch sử ảnh tải lên */}
            {uploadedImages.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-extrabold text-slate-700">Lịch sử ảnh tải lên</p>
                <div className="grid grid-cols-3 gap-2">
                  {uploadedImages.map((asset, idx) => (
                    <div
                      key={asset._id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('application/x-igen-bulk-asset', asset.url);
                        event.dataTransfer.setData('text/uri-list', asset.url);
                      }}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={() => props.onBackgroundUpload(asset.url)}
                        className="relative h-full w-full p-0"
                        title="Đặt làm ảnh nền"
                      >
                        <img src={asset.url} alt={asset.originalName || `Upload ${idx}`} className="h-full w-full object-cover" />
                        <span className="absolute inset-x-1 bottom-1 rounded-md bg-slate-900/70 px-1 py-0.5 text-[9px] font-extrabold text-white opacity-0 transition group-hover:opacity-100">
                          Đặt làm nền
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteUploadedImage(asset._id);
                        }}
                        className="absolute right-1 top-1 hidden rounded-full bg-slate-900/60 p-1 text-white hover:bg-slate-900 group-hover:block"
                        title="Xóa khỏi lịch sử"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(props.templates.length > 0 || props.loadingTemplates) && (
              <div>
                <p className="mb-2 text-sm font-extrabold text-slate-700">Mẫu thiết kế của tôi</p>
                <div className="space-y-2">
                  <div className={`space-y-2 transition-opacity duration-200 ${loadingTemplates ? 'opacity-60 pointer-events-none' : ''}`}>
                    {props.templates.map((template) => (
                      <div
                        key={template._id}
                        className="flex items-center rounded-xl border border-slate-200 hover:border-indigo-400 bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => props.onLoadTemplate(template)}
                          className="min-w-0 flex-1 px-3 py-3 text-left"
                        >
                          <span className="block truncate text-sm font-bold text-slate-800">
                            {template.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {template.layers.length} trường ·{' '}
                            {template.visibility === 'public'
                              ? 'Đang chia sẻ'
                              : `bản ${template.version}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            template.visibility === 'public'
                              ? props.onUnpublishTemplate(template._id)
                              : props.onPublishTemplate(template._id)
                          }
                          className={`rounded-lg p-2 ${
                            template.visibility === 'public'
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                          title={
                            template.visibility === 'public'
                              ? 'Ngừng chia sẻ'
                              : 'Chia sẻ vào kho mẫu'
                          }
                        >
                          {template.visibility === 'public' ? (
                            <Globe2 className="h-4 w-4" />
                          ) : (
                            <Share2 className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onArchiveTemplate(template._id)}
                          className="mr-2 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Lưu trữ mẫu thiết kế"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {props.templates.length === 0 && loadingTemplates && (
                    <div className="space-y-2">
                      {[0, 1, 2].map((item) => (
                        <div
                          key={item}
                          className="h-[74px] animate-pulse rounded-xl border border-slate-200 bg-slate-100"
                        />
                      ))}
                    </div>
                  )}

                  {templatesTotal > 0 && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        disabled={templatePage <= 1 || loadingTemplates}
                        onClick={() => onChangeTemplatePage(templatePage - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-500 transition cursor-pointer"
                        title="Trang trước"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <div className="text-center">
                        <span className="text-[11px] font-bold text-slate-600 block">
                          Trang {templatePage} / {Math.ceil(templatesTotal / 6) || 1}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">
                          Tổng số {templatesTotal} mẫu
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={templatePage >= Math.ceil(templatesTotal / 6) || loadingTemplates}
                        onClick={() => onChangeTemplatePage(templatePage + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-500 transition cursor-pointer"
                        title="Trang sau"
                      >
                        {loadingTemplates ? (
                          <LoaderCircle className="h-4 w-4 animate-spin text-indigo-600" />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-700">Kho mẫu cộng đồng</p>
                <span className="text-xs text-slate-400">{props.communityTemplates.length} mẫu</span>
              </div>
              {props.communityTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs leading-relaxed text-slate-500">
                  Chưa có mẫu cộng đồng. Hãy lưu thiết kế rồi bấm biểu tượng chia sẻ để đóng góp mẫu đầu tiên.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {props.communityTemplates.map((template) => (
                    <div
                      key={template._id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <TemplatePreview template={template} />
                      <div className="p-2.5">
                        <p className="truncate text-xs font-extrabold text-slate-800">
                          {template.name}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {template.layers.length} trường · {template.useCount || 0} lượt dùng
                        </p>
                        <button
                          type="button"
                          onClick={() => props.onUseCommunityTemplate(template._id)}
                          className="mt-2 h-8 w-full rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          Dùng mẫu này
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTool === 'text' && (
          <div className="space-y-5">
            {/* ── Kiểu chữ mặc định ── */}
            <div>
              <p className="mb-3 px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">Kiểu chữ mặc định</p>
              <div className="space-y-2">
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => startLayerPresetDrag(event, {
                    type: 'text',
                    overrides: { fontSize: 80, fontWeight: 800, fieldName: 'Thêm tiêu đề' },
                  })}
                  onClick={() => props.onAddLayer('text', '', { fontSize: 80, fontWeight: 800, fieldName: 'Thêm tiêu đề' })}
                  className="group flex w-full cursor-grab items-center gap-3.5 rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-50/80 to-white p-4 text-left transition-all duration-200 hover:border-indigo-400 hover:shadow-md active:cursor-grabbing active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-xl font-black text-indigo-600 shadow-sm transition-colors duration-200 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-indigo-200">
                    H₁
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-extrabold text-slate-900">Thêm tiêu đề</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">Cỡ 80px · Đậm nhất</span>
                  </span>
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => startLayerPresetDrag(event, {
                    type: 'text',
                    overrides: { fontSize: 48, fontWeight: 600, fieldName: 'Thêm tiêu đề phụ' },
                  })}
                  onClick={() => props.onAddLayer('text', '', { fontSize: 48, fontWeight: 600, fieldName: 'Thêm tiêu đề phụ' })}
                  className="group flex w-full cursor-grab items-center gap-3.5 rounded-2xl border border-slate-200 bg-gradient-to-r from-violet-50/80 to-white p-4 text-left transition-all duration-200 hover:border-violet-400 hover:shadow-md active:cursor-grabbing active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-lg font-bold text-violet-600 shadow-sm transition-colors duration-200 group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-violet-200">
                    H₂
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Thêm tiêu đề phụ</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">Cỡ 48px · Hơi đậm</span>
                  </span>
                </button>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => startLayerPresetDrag(event, {
                    type: 'text',
                    overrides: { fontSize: 32, fontWeight: 400, fieldName: 'Thêm nội dung văn bản' },
                  })}
                  onClick={() => props.onAddLayer('text', '', { fontSize: 32, fontWeight: 400, fieldName: 'Thêm nội dung văn bản' })}
                  className="group flex w-full cursor-grab items-center gap-3.5 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50/80 to-white p-4 text-left transition-all duration-200 hover:border-slate-400 hover:shadow-md active:cursor-grabbing active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-medium text-slate-500 shadow-sm transition-colors duration-200 group-hover:bg-slate-600 group-hover:text-white group-hover:shadow-slate-200">
                    Aa
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-600">Thêm nội dung văn bản</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">Cỡ 32px · Bình thường</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
              <p className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-indigo-500">Thành phần thiết kế</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { kind: 'shape' as const, label: 'Hình khối', icon: Square, value: '' },
                  { kind: 'badge' as const, label: 'Nhãn / badge', icon: Tag, value: 'MỚI' },
                  { kind: 'cta' as const, label: 'Nút CTA', icon: Megaphone, value: 'Mua ngay' },
                  { kind: 'icon' as const, label: 'Biểu tượng', icon: Star, value: '★' },
                ].map(({ kind, label, icon: Icon, value }) => (
                  <button
                    key={kind}
                    type="button"
                    draggable
                    onDragStart={(event) => startLayerPresetDrag(event, {
                      type: 'text',
                      initialValue: value,
                      overrides: { layerKind: kind },
                    })}
                    onClick={() => props.onAddLayer('text', value, { layerKind: kind })}
                    className="flex cursor-grab items-center gap-2 rounded-xl border border-white bg-white px-2.5 py-2.5 text-left text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700 active:cursor-grabbing"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Kết hợp phông chữ ── */}
            <div>
              <p className="mb-3 px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">Kết hợp phông chữ</p>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { name: 'Thanh lịch', heading: { font: 'Playfair Display', weight: 700, text: 'Elegant' }, body: { font: 'Raleway', weight: 400, text: 'Clean & minimal style' }, bg: 'bg-gradient-to-br from-amber-50 to-orange-50', accent: 'text-amber-900' },
                  { name: 'Hiện đại', heading: { font: 'Montserrat', weight: 800, text: 'MODERN' }, body: { font: 'Inter', weight: 400, text: 'Simple and bold' }, bg: 'bg-gradient-to-br from-slate-900 to-slate-800', accent: 'text-white' },
                  { name: 'Vui nhộn', heading: { font: 'Fredoka', weight: 600, text: 'Fun Time' }, body: { font: 'Poppins', weight: 400, text: 'Playful & friendly' }, bg: 'bg-gradient-to-br from-pink-50 to-violet-50', accent: 'text-pink-600' },
                  { name: 'Cổ điển', heading: { font: 'Abril Fatface', weight: 400, text: 'Classic' }, body: { font: 'Lora', weight: 400, text: 'Timeless elegance' }, bg: 'bg-gradient-to-br from-stone-100 to-stone-50', accent: 'text-stone-800' },
                  { name: 'Sáng tạo', heading: { font: 'Permanent Marker', weight: 400, text: 'Creative' }, body: { font: 'Caveat', weight: 500, text: 'Handwritten feel' }, bg: 'bg-gradient-to-br from-lime-50 to-emerald-50', accent: 'text-emerald-700' },
                  { name: 'Năng động', heading: { font: 'Bebas Neue', weight: 400, text: 'DYNAMIC' }, body: { font: 'Roboto', weight: 300, text: 'Strong & powerful' }, bg: 'bg-gradient-to-br from-red-50 to-orange-50', accent: 'text-red-700' },
                  { name: 'Lãng mạn', heading: { font: 'Dancing Script', weight: 700, text: 'Romance' }, body: { font: 'Playfair Display', weight: 400, text: 'Soft & dreamy' }, bg: 'bg-gradient-to-br from-rose-50 to-pink-50', accent: 'text-rose-600' },
                  { name: 'Công nghệ', heading: { font: 'Space Grotesk', weight: 700, text: 'Tech Hub' }, body: { font: 'JetBrains Mono', weight: 400, text: 'Code & design' }, bg: 'bg-gradient-to-br from-cyan-50 to-blue-50', accent: 'text-cyan-700' },
                ].map((combo) => (
                  <button
                    key={combo.name}
                    type="button"
                    onClick={() => {
                      props.onAddLayer('text', combo.heading.text, {
                        fontSize: 72,
                        fontFamily: combo.heading.font,
                        fontWeight: combo.heading.weight,
                        fieldName: `${combo.name} Heading`,
                      });
                      props.onAddLayer('text', combo.body.text, {
                        fontSize: 32,
                        fontFamily: combo.body.font,
                        fontWeight: combo.body.weight,
                        fieldName: `${combo.name} Body`,
                        y: 22,
                      });
                    }}
                    className={`group relative flex min-h-[92px] flex-col items-start justify-end overflow-hidden rounded-2xl border border-slate-200/80 p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-lg active:scale-[0.97] ${combo.bg}`}
                  >
                    <span
                      className={`text-[15px] leading-tight drop-shadow-sm ${combo.accent}`}
                      style={{ fontFamily: combo.heading.font, fontWeight: combo.heading.weight }}
                    >
                      {combo.heading.text}
                    </span>
                    <span
                      className="mt-1.5 text-[10px] leading-tight opacity-60"
                      style={{ fontFamily: combo.body.font, fontWeight: combo.body.weight }}
                    >
                      {combo.body.text}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 flex h-7 items-center justify-center bg-gradient-to-t from-black/25 to-transparent text-[9px] font-extrabold tracking-wide text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                      {combo.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Văn bản trên mẫu ── */}
            <div>
              <p className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">Văn bản trên mẫu</p>
              {layers.filter((layer) => layer.type === 'text').length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center">
                  <Type className="h-6 w-6 text-slate-300" />
                  <span className="text-xs leading-relaxed text-slate-400">Chưa có văn bản nào trên mẫu.<br/>Thêm từ mục phía trên.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {layers
                    .filter((layer) => layer.type === 'text')
                    .map((layer) => (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => props.onSelectLayer(layer.id)}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all duration-200 hover:border-indigo-400 hover:bg-indigo-50/50 hover:shadow-sm"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600 shadow-sm transition-all duration-200 group-hover:from-indigo-500 group-hover:to-violet-500 group-hover:text-white group-hover:shadow-indigo-200">
                          <Type className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-800">{layer.fieldName}</span>
                          {layer.dataBinding && (
                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-violet-500">🔗 {layer.dataBinding.columnLabel}</span>
                          )}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTool === 'image' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => props.onAddLayer('image')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-extrabold text-white"
            >
              <ImagePlus className="h-5 w-5" /> Thêm khung ảnh
            </button>
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700">
              <Upload className="h-4 w-4" /> {props.uploadingAsset ? 'Đang tải ảnh...' : 'Tải ảnh và thêm vào mẫu'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) props.onUploadAsset(file, 'layer');
                  event.currentTarget.value = '';
                }}
                disabled={props.uploadingAsset}
              />
            </label>

            {/* Lịch sử ảnh tải lên */}
            {uploadedImages.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-bold text-slate-600">Lịch sử ảnh tải lên</p>
                <div className="grid grid-cols-3 gap-2">
                  {uploadedImages.map((asset, idx) => {
                    const selectedImageLayer = layers.find(
                      (l) => l.id === props.selectedLayerId && l.type === 'image'
                    );
                    return (
                      <div
                        key={asset._id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData('application/x-igen-bulk-asset', asset.url);
                          event.dataTransfer.setData('text/uri-list', asset.url);
                        }}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition cursor-pointer"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedImageLayer && !selectedImageLayer.locked && props.activeRowId) {
                              props.onUpdateCell(props.activeRowId, selectedImageLayer.id, asset.url);
                              toast.success(`Đã thay ảnh cho “${selectedImageLayer.fieldName}”.`);
                            } else {
                              props.onAddLayer('image', asset.url);
                            }
                          }}
                          className="relative h-full w-full p-0"
                          title={selectedImageLayer ? `Thay ảnh cho ${selectedImageLayer.fieldName}` : 'Thêm khung ảnh này'}
                        >
                          <img src={asset.url} alt={asset.originalName || `Upload ${idx}`} className="h-full w-full object-cover" />
                          {selectedImageLayer && (
                            <span className="absolute inset-x-1 bottom-1 rounded-md bg-indigo-600/80 px-1 py-0.5 text-[9px] font-extrabold text-white opacity-0 transition group-hover:opacity-100">
                              Thay vào layer
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteUploadedImage(asset._id);
                          }}
                          className="absolute right-1 top-1 hidden rounded-full bg-slate-900/60 p-1 text-white hover:bg-slate-900 group-hover:block"
                          title="Xóa khỏi lịch sử"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="px-1 pt-2 text-sm font-bold text-slate-600">Hình ảnh trên mẫu</p>
            {layers
              .filter((layer) => layer.type === 'image')
              .map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => props.onSelectLayer(layer.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <ImageIcon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-bold">{layer.fieldName}</span>
                </button>
              ))}
          </div>
        )}

        {activeTool === 'data' && <DataPanel {...props} />}
        {activeTool === 'history' && <JobPanel {...props} />}

        {layers.length > 0 && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Tất cả layer</p>
              <span className="text-[10px] font-bold text-slate-400">{layers.length}</span>
            </div>
            <div className="space-y-1">
              {layers
                .slice()
                .sort((left, right) => right.zIndex - left.zIndex)
                .map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => props.onSelectLayer(layer.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-indigo-50"
                  >
                    <Layers3 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{layer.fieldName}</span>
                    <span className="text-[9px] font-semibold text-slate-400">
                      {layer.layerKind || layer.type}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
