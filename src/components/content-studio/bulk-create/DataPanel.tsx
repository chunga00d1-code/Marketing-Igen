import React from 'react';
import {
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
  readyCount: number;
  onDataStep: (step: 1 | 2 | 3) => void;
  onGoogleSheetUrl: (value: string) => void;
  onImportGoogleSheet: () => void;
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

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
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
              className={`rounded-lg px-1 py-2 text-center text-[11px] font-extrabold transition ${
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
              {step.label}
            </button>
          );
        })}
      </div>

      {props.dataStep === 1 && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-extrabold text-slate-900">Chọn dữ liệu của bạn</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Dòng đầu tiên là tiêu đề, mỗi dòng tiếp theo sẽ tạo một thiết kế.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-3">
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
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Hệ thống tự tìm đúng tab và vùng bảng, đồng thời đọc ảnh chèn trực tiếp trong ô.
            </p>
            <button
              type="button"
              onClick={props.onImportGoogleSheet}
              disabled={!props.googleSheetUrl.trim() || props.loadingSheet}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {props.loadingSheet ? (
                <><LoaderCircle className="h-4 w-4 animate-spin" /> Đang đọc dữ liệu...</>
              ) : (
                <><Link2 className="h-4 w-4" /> Nhập từ Google Sheet</>
              )}
            </button>
          </div>

          <details className="rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-extrabold text-slate-700">
              Cách nhập khác
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" /> Tải Excel hoặc CSV
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
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
                disabled={!props.sheetInput.trim()}
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
                      .map((column) => {
                        const connectedToAnotherLayer = props.layers.some((item) =>
                          item.id !== layer.id && item.dataBinding?.columnKey === column.key
                        );
                        return (
                          <option
                            key={column.key}
                            value={column.key}
                            disabled={connectedToAnotherLayer}
                          >
                            {column.label}
                            {column.type === 'image' ? ' · Ảnh' : ''}
                            {connectedToAnotherLayer ? ' · Đã kết nối' : ''}
                          </option>
                        );
                      })}
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
                </div>
              );
            })}
          </div>

          {selectedRows > props.readyCount && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-800">
              {selectedRows - props.readyCount} dòng đang thiếu dữ liệu ở phần đã kết nối nên chưa thể tạo ảnh.
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
