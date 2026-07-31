import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Database,
  FileSpreadsheet,
  Link2,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DataColumn, DataRow, TemplateLayer } from './types';
import { readImage } from './utils';

interface DataPanelProps {
  layers: TemplateLayer[];
  rows: DataRow[];
  dataColumns: DataColumn[];
  dataStep: 1 | 2 | 3;
  dataSourceName: string;
  activeRowId: string;
  sheetInput: string;
  googleSheetUrl: string;
  loadingSheet: boolean;
  campaigns: Array<{ _id: string; title: string; startDate: string; endDate: string; statistics: { totalSlots: number } }>;
  selectedCampaignId: string;
  bulkTarget: 'standalone' | 'campaign';
  campaignContext: {
    campaign: { title: string };
    slots: Array<{ _id: string; platform: string; status: string; mediaType: string; topicBrief: string; scheduledAt: string }>;
  } | null;
  loadingCampaigns: boolean;
  loadingCampaignOrders: boolean;
  readyCount: number;
  onDataStep: (step: 1 | 2 | 3) => void;
  onGoogleSheetUrl: (value: string) => void;
  onImportGoogleSheet: () => void;
  onLoadCampaigns: () => void;
  onSelectCampaign: (campaignId: string) => void;
  onBulkTarget: (target: 'standalone' | 'campaign') => void;
  onImportCampaignOrders: () => void;
  onImportExcel: (file: File) => void;
  onSheetInput: (value: string) => void;
  onImportSheet: () => void;
  onConnectLayer: (layerId: string, columnKey: string) => void;
  onAutoMatch: () => void;
  onToggleRow: (rowId: string) => void;
  onSelectAllRows: (selected: boolean) => void;
  onCreatePages: () => void;
  onAddRow: () => void;
  onSelectRow: (id: string) => void;
  onAssignCampaignSlot: (rowId: string, slotId: string) => void;
  onUpdateCell: (rowId: string, layerId: string, value: string) => void;
  onDuplicateRow: (row: DataRow) => void;
  onRemoveRow: (id: string) => void;
}

const STEPS = [
  { id: 1 as const, label: 'Chọn dữ liệu' },
  { id: 2 as const, label: 'Kết nối trường' },
  { id: 3 as const, label: 'Tạo trang' },
];

export function DataPanel(props: DataPanelProps) {
  const selectedRows = props.rows.filter((row) => row.selected !== false).length;
  const mappedLayers = props.layers.filter((layer) => layer.dataBinding).length;
  const allRowsSelected = props.rows.length > 0 && selectedRows === props.rows.length;
  const campaignSlotById = new Map((props.campaignContext?.slots || []).map((slot) => [slot._id, slot]));

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {STEPS.map((step) => {
          const active = props.dataStep === step.id;
          const completed = props.dataStep > step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                if (
                  step.id === 1 ||
                  (step.id === 2 && props.dataColumns.length > 0) ||
                  (step.id === 3 && mappedLayers > 0)
                ) {
                  props.onDataStep(step.id);
                }
              }}
              className={`min-w-0 overflow-hidden rounded-lg px-1 py-2 text-center text-[11px] font-extrabold transition ${
                active
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : completed
                    ? 'text-emerald-700'
                    : 'text-slate-400'
              }`}
            >
              <span className={`mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active ? 'bg-indigo-600 text-white' : completed ? 'bg-emerald-100' : 'bg-slate-200'
              }`}>
                {completed ? <Check className="h-3 w-3" /> : step.id}
              </span>
              <span className="block min-w-0 break-words leading-tight">{step.label}</span>
            </button>
          );
        })}
      </div>

      {props.dataStep === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
            <p className="text-sm font-extrabold text-slate-900">Thiết kế cho đâu?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => props.onBulkTarget('standalone')}
                className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
                  props.bulkTarget === 'standalone'
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Thiết kế tự do
              </button>
              <button
                type="button"
                onClick={() => props.onBulkTarget('campaign')}
                className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
                  props.bulkTarget === 'campaign'
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-violet-200 bg-white text-violet-700'
                }`}
              >
                Cho Campaign
              </button>
            </div>
            {props.bulkTarget === 'campaign' && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={props.selectedCampaignId}
                    onChange={(event) => props.onSelectCampaign(event.target.value)}
                    disabled={props.loadingCampaigns || props.loadingCampaignOrders}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-500"
                  >
                    <option value="">Chọn chiến dịch Facebook</option>
                    {props.campaigns.map((campaign) => (
                      <option key={campaign._id} value={campaign._id}>
                        {campaign.title} · {campaign.statistics.totalSlots} bài
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={props.onLoadCampaigns}
                    className="rounded-lg border border-violet-200 bg-white px-3 text-xs font-bold text-violet-700"
                  >
                    {props.loadingCampaigns ? '...' : 'Tải'}
                  </button>
                </div>
                {props.campaignContext && (
                  <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold text-violet-900">
                    {props.campaignContext.campaign.title} · {props.campaignContext.slots.filter((slot) => slot.platform === 'Facebook' && !['video', 'human-video', 'published', 'cancelled'].includes(slot.mediaType) && !['published', 'cancelled'].includes(slot.status)).length} bài Facebook có thể nhận ảnh.
                  </p>
                )}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-base font-extrabold text-slate-900">Chọn dữ liệu của bạn</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Dòng đầu tiên là tiêu đề, mỗi dòng tiếp theo sẽ tạo một thiết kế.
            </p>
          </div>

          <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <p className="text-sm font-extrabold text-slate-900">Google Sheets</p>
            </div>
            <input
              value={props.googleSheetUrl}
              onChange={(event) => props.onGoogleSheetUrl(event.target.value)}
              placeholder="Dán liên kết Google Sheet"
              aria-label="Liên kết Google Sheet"
              className="mt-3 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500"
            />
            <p className="mt-1.5 break-words text-[11px] leading-relaxed text-slate-500">
              Hệ thống tự tìm đúng tab và vùng bảng, đồng thời đọc ảnh chèn trực tiếp trong ô.
            </p>
            <button
              type="button"
              onClick={props.onImportGoogleSheet}
              disabled={!props.googleSheetUrl.trim() || props.loadingSheet || (props.bulkTarget === 'campaign' && !props.selectedCampaignId)}
              className="mt-2 flex h-10 w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-600 px-2 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {props.loadingSheet ? (
                <><LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /><span className="min-w-0 truncate">Đang đọc dữ liệu...</span></>
              ) : (
                <><Link2 className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Nhập từ Google Sheet</span></>
              )}
            </button>
          </div>

          <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                <Database className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900">Order ảnh từ chiến dịch</p>
                <p className="mt-0.5 break-words text-[11px] leading-relaxed text-slate-500">Nhập các Order dạng Ảnh vào Bulk Create; Order Video được giữ ở luồng kịch bản.</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <select
                value={props.selectedCampaignId}
                onChange={(event) => props.onSelectCampaign(event.target.value)}
                disabled={props.loadingCampaigns || props.loadingCampaignOrders}
                className="h-10 min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-500 disabled:opacity-60"
              >
                <option value="">Chọn chiến dịch</option>
                {props.campaigns.map((campaign) => (
                  <option key={campaign._id} value={campaign._id}>
                    {campaign.title} · {campaign.statistics.totalSlots} bài
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={props.onLoadCampaigns}
                disabled={props.loadingCampaigns || props.loadingCampaignOrders}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-white px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
              >
                {props.loadingCampaigns ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Tải'}
              </button>
            </div>
            <button
              type="button"
              onClick={props.onImportCampaignOrders}
              disabled={!props.selectedCampaignId || props.loadingCampaignOrders}
              className="mt-2 flex h-10 w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-xl bg-violet-600 px-2 text-sm font-extrabold text-white hover:bg-violet-700 disabled:bg-slate-300"
            >
              {props.loadingCampaignOrders
                ? <><LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /><span className="min-w-0 truncate">Đang nhập Order...</span></>
                : <><FileSpreadsheet className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Nhập Order vào Bulk Create</span></>}
            </button>
          </div>

          <details className="rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-extrabold text-slate-700">
              Cách nhập khác
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              <label className={`flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 ${
                props.loadingSheet || (props.bulkTarget === 'campaign' && !props.selectedCampaignId) ? 'cursor-wait bg-slate-50 opacity-60' : 'cursor-pointer hover:bg-slate-50'
              }`}>
                {props.loadingSheet ? (
                  <><LoaderCircle className="h-4 w-4 animate-spin" /> Đang đọc bảng tính...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Tải Excel hoặc CSV</>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={props.loadingSheet || (props.bulkTarget === 'campaign' && !props.selectedCampaignId)}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) props.onImportExcel(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <textarea
                value={props.sheetInput}
                onChange={(event) => props.onSheetInput(event.target.value)}
                rows={4}
                placeholder={'tên\tlớp\nTuna\tA\nQA\tB'}
                className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={props.onImportSheet}
                disabled={!props.sheetInput.trim() || (props.bulkTarget === 'campaign' && !props.selectedCampaignId)}
                className="h-10 w-full rounded-xl bg-slate-800 text-sm font-bold text-white disabled:bg-slate-300"
              >
                Dùng dữ liệu đã dán
              </button>
            </div>
          </details>
        </div>
      )}

      {props.dataStep === 2 && (
        <div className="space-y-4">
          <div>
            <button
              type="button"
              onClick={() => props.onDataStep(1)}
              className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600"
            >
              <ArrowLeft className="h-4 w-4" /> Chọn lại dữ liệu
            </button>
            <h4 className="text-base font-extrabold text-slate-900">Kết nối trường với thiết kế</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Chọn cột dữ liệu cho từng phần chữ hoặc ảnh. Bạn cũng có thể bấm chuột phải lên phần cần nối.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-700">
                {props.dataSourceName || 'Nguồn dữ liệu'}
              </span>
              <span className="text-[11px] font-bold text-slate-400">{props.rows.length} dòng</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-slate-800">Các phần trong thiết kế</p>
              <p className="text-xs text-slate-500">Đã kết nối {mappedLayers}/{props.layers.length}</p>
            </div>
            <button
              type="button"
              onClick={props.onAutoMatch}
              disabled={props.layers.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-extrabold text-indigo-700 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" /> Tự khớp
            </button>
          </div>

          {props.layers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              Hãy thêm chữ hoặc ảnh vào thiết kế trước khi kết nối.
            </div>
          ) : (
            <div className="space-y-2">
              {props.layers.map((layer) => (
                <label key={layer.id} className="block rounded-xl border border-slate-200 bg-white p-3">
                  <span className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-extrabold text-slate-800">{layer.fieldName}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
                      {layer.type === 'text' ? 'Chữ' : 'Ảnh'}
                    </span>
                  </span>
                  <select
                    value={layer.dataBinding?.columnKey || ''}
                    onChange={(event) => props.onConnectLayer(layer.id, event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="">Không kết nối · giữ nguyên</option>
                    {props.dataColumns
                      .filter((column) => column.type === layer.type)
                      .map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.label}
                          {column.type === 'image' ? ' · Ảnh' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {props.layers.length > 0 && mappedLayers === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
              Hãy kết nối ít nhất một phần trong thiết kế với một cột dữ liệu.
            </p>
          )}

          <button
            type="button"
            onClick={() => props.onDataStep(3)}
            disabled={mappedLayers === 0}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-extrabold text-white disabled:bg-slate-300"
          >
            Tiếp tục <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {props.dataStep === 3 && (
        <div className="space-y-4">
          {props.bulkTarget === 'campaign' && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
              Đã ghép {props.rows.filter((row) => Boolean(row.campaignSlotId)).length}/{props.rows.length} dòng với bài viết của Campaign theo thứ tự lịch đăng.
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => props.onDataStep(2)}
              className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600"
            >
              <ArrowLeft className="h-4 w-4" /> Kết nối lại trường
            </button>
            <h4 className="text-base font-extrabold text-slate-900">Chọn các trang cần tạo</h4>
            <p className="mt-1 text-xs text-slate-500">Mỗi dòng dữ liệu sẽ trở thành một trang ở dưới thiết kế.</p>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={allRowsSelected}
              onChange={(event) => props.onSelectAllRows(event.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
            <span className="text-sm font-extrabold text-slate-700">Chọn tất cả</span>
            <span className="ml-auto text-xs font-bold text-slate-400">{selectedRows}/{props.rows.length}</span>
          </label>

          <div className="max-h-72 min-w-0 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
            {props.rows.map((row, index) => {
              const missingFields = props.layers
                .filter((layer) => !row.values[layer.id]?.trim())
                .map((layer) => layer.fieldName);
              const textPreview = props.dataColumns
                .filter((column) => column.type === 'text')
                .slice(0, 2)
                .map((column) => row.sourceCells?.[column.key])
                .filter(Boolean);
              const imageCount = props.dataColumns.filter(
                (column) => column.type === 'image' && row.sourceCells?.[column.key]
              ).length;
              const previewValues = [
                ...textPreview,
                imageCount > 0 ? `${imageCount} ảnh` : '',
              ].filter(Boolean).join(' · ');
              const mappedSlot = row.campaignSlotId ? campaignSlotById.get(row.campaignSlotId) : undefined;
              return (
                <div
                  key={row.id}
                  className={`flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border p-3 ${
                    props.activeRowId === row.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={row.selected !== false}
                    onChange={() => props.onToggleRow(row.id)}
                    className="h-4 w-4 shrink-0 accent-indigo-600"
                    aria-label={`Chọn dòng ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => props.onSelectRow(row.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-sm font-extrabold text-slate-800">Trang {index + 1}</span>
                    <span className="block truncate text-xs text-slate-500">{previewValues || 'Chưa có dữ liệu'}</span>
                  </button>
                  {props.bulkTarget === 'campaign' && (
                    <select
                      value={row.campaignSlotId || ''}
                      onChange={(event) => props.onAssignCampaignSlot(row.id, event.target.value)}
                      className="h-8 max-w-28 rounded-md border border-violet-200 bg-white px-1 text-[10px] font-bold text-violet-800"
                      title={mappedSlot ? mappedSlot.topicBrief : 'Chưa ghép bài'}
                    >
                      <option value="">Chưa ghép</option>
                      {(props.campaignContext?.slots || [])
                        .filter((slot) => slot.platform === 'Facebook' && !['video', 'human-video'].includes(slot.mediaType) && !['published', 'cancelled'].includes(slot.status))
                        .map((slot, slotIndex) => (
                          <option key={slot._id} value={slot._id}>
                            Bài {slotIndex + 1}
                          </option>
                        ))}
                    </select>
                  )}
                  {missingFields.length > 0 && row.selected !== false && (
                    <span
                      className="shrink-0 text-amber-600"
                      title={`Thiếu dữ liệu: ${missingFields.join(', ')}`}
                      aria-label={`Thiếu dữ liệu: ${missingFields.join(', ')}`}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {selectedRows > props.readyCount && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-800">
              {selectedRows - props.readyCount} dòng đang thiếu dữ liệu. Bạn vẫn có thể đưa vào thiết kế để sửa,
              nhưng các dòng này chỉ được tạo ảnh sau khi điền đủ.
            </div>
          )}

          <button
            type="button"
            onClick={props.onCreatePages}
            disabled={selectedRows === 0}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-extrabold text-white shadow-sm disabled:from-slate-300 disabled:to-slate-300"
          >
            <><Sparkles className="h-4 w-4" /> Đưa {selectedRows} trang vào thiết kế</>
          </button>
          {selectedRows > 0 && (
            <p className="text-center text-[11px] font-semibold text-slate-500">
              {props.readyCount}/{selectedRows} trang đã sẵn sàng tạo ảnh
            </p>
          )}

          <details className="rounded-xl border border-slate-200">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold text-slate-500">
              Chỉnh sửa dữ liệu nâng cao
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-3">
              <button
                type="button"
                onClick={props.onAddRow}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-650"
              >
                <Plus className="h-4 w-4" /> Thêm dòng thủ công
              </button>
              {props.rows.map((row, index) => (
                <div key={row.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-extrabold text-slate-700">Trang {index + 1}</p>
                  <div className="space-y-2">
                    {props.layers.map((layer) => (
                      <label key={layer.id} className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-500">{layer.fieldName}</span>
                        {layer.type === 'text' ? (
                          <input
                            value={row.values[layer.id] || ''}
                            onChange={(event) => props.onUpdateCell(row.id, layer.id, event.target.value)}
                            className="h-9 w-full rounded-lg border border-slate-300 px-2 text-xs outline-none focus:border-indigo-500"
                          />
                        ) : (
                          <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-[11px] font-bold text-slate-600">
                            {row.values[layer.id] ? <><Check className="h-3.5 w-3.5" /> Đã có ảnh</> : <><Upload className="h-3.5 w-3.5" /> Chọn ảnh</>}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) readImage(file, (value) => props.onUpdateCell(row.id, layer.id, value));
                              }}
                            />
                          </label>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <button type="button" onClick={() => props.onDuplicateRow(row)} className="p-2 text-slate-500" title="Nhân bản">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => props.onRemoveRow(row.id)} className="p-2 text-rose-500" title="Xóa">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
