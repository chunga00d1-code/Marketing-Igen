import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  History,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CampaignSheetAIJob,
  CampaignSheetColumn,
  CampaignSheetData,
  CampaignSheetDataType,
  CampaignSheetRow,
  marketingCampaignService,
} from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

interface CampaignContentSheetProps {
  campaignId: string;
}

const READ_ONLY_KEYS = new Set(['scheduledAt', 'platform', 'page', 'status']);
const ORDER_COLUMN_KEYS = [
  'pillar',
  'topicBrief',
  'productionBrief',
  'assetFormat',
  'proposedQuantity',
  'usageChannels',
];
const ORDER_COLUMN_LABELS: Record<string, string> = {
  pillar: 'Nhóm nội dung',
  topicBrief: 'Nội dung cần quay/chụp',
  productionBrief: 'Chi tiết yêu cầu',
  assetFormat: 'Định dạng',
  proposedQuantity: 'SL đề xuất',
  usageChannels: 'Phục vụ',
};
const DATA_TYPES: Array<{ id: CampaignSheetDataType; label: string }> = [
  { id: 'short_text', label: 'Văn bản ngắn' },
  { id: 'long_text', label: 'Văn bản dài' },
  { id: 'number', label: 'Số' },
  { id: 'currency', label: 'Tiền tệ' },
  { id: 'select', label: 'Danh sách chọn' },
  { id: 'multi_select', label: 'Chọn nhiều' },
  { id: 'url', label: 'URL' },
  { id: 'media_url', label: 'Ảnh / media URL' },
  { id: 'boolean', label: 'Có / Không' },
  { id: 'date', label: 'Ngày' },
  { id: 'datetime', label: 'Ngày giờ' },
];

function fieldValue(row: CampaignSheetRow, column: CampaignSheetColumn) {
  const stored = row.fields[column.key];
  if (stored) return stored.value;
  return row.system[column.key] ?? '';
}

function displayValue(value: unknown, column: CampaignSheetColumn, timezone: string) {
  if (value === null || value === undefined || value === '') return '';
  if (column.dataType === 'datetime') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
  }
  if (column.dataType === 'multi_select' && Array.isArray(value)) return value.join(', ');
  if (column.dataType === 'boolean') return value ? 'Có' : 'Không';
  return String(value);
}

function displayColumnLabel(column: CampaignSheetColumn) {
  return ORDER_COLUMN_LABELS[column.key] || column.label;
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sheet-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CampaignContentSheet({ campaignId }: CampaignContentSheetProps) {
  const [data, setData] = useState<CampaignSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState('');
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [conflictMessage, setConflictMessage] = useState('');
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [columnForm, setColumnForm] = useState({
    label: '',
    dataType: 'short_text' as CampaignSheetDataType,
    aiInstruction: '',
    sensitive: false,
    useKnowledge: false,
  });
  const [aiJob, setAiJob] = useState<CampaignSheetAIJob | null>(null);
  const [applyingAI, setApplyingAI] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [runningJob, setRunningJob] = useState<CampaignSheetAIJob | null>(null);
  const [creatingBulkJob, setCreatingBulkJob] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState('pillar');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [rowForm, setRowForm] = useState({
    date: '',
    time: '09:00',
    platform: 'Facebook' as 'Facebook' | 'TikTok',
    pillar: '',
    objective: 'Tăng tương tác',
    topicBrief: '',
    funnelStage: 'MOFU' as 'TOFU' | 'MOFU' | 'BOFU',
    mediaType: 'image' as 'text' | 'image' | 'video' | 'human-video',
  });

  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketingCampaignService.getSheet(campaignId);
      setData(result);
      setDrafts({});
      setConflictMessage('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải Content Sheet.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadSheet();
  }, [loadSheet]);

  useEffect(() => {
    if (!runningJob || !['queued', 'processing'].includes(runningJob.status)) return;
    const timer = window.setTimeout(() => {
      void marketingCampaignService.getSheetAIJob(campaignId, runningJob._id)
        .then((nextJob) => {
          if (['awaiting_review', 'partial'].includes(nextJob.status)) {
            setRunningJob(null);
            setAiJob(nextJob);
          } else {
            setRunningJob(nextJob);
          }
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : 'Không thể cập nhật tiến độ AI.'));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [campaignId, runningJob]);

  const allColumns = useMemo(
    () => (data?.config.columns || []).filter((column) => !column.archived),
    [data?.config.columns]
  );
  const orderColumns = useMemo(() => {
    const orderIndex = new Map(ORDER_COLUMN_KEYS.map((key, index) => [key, index]));
    return allColumns
      .filter((column) => orderIndex.has(column.key) || column.kind === 'custom')
      .sort((left, right) => {
        const leftOrder = orderIndex.get(left.key) ?? ORDER_COLUMN_KEYS.length + left.display.order;
        const rightOrder = orderIndex.get(right.key) ?? ORDER_COLUMN_KEYS.length + right.display.order;
        return leftOrder - rightOrder;
      });
  }, [allColumns]);
  const columns = useMemo(
    () => orderColumns.filter((column) => !column.display.hidden),
    [orderColumns]
  );
  const bulkAIColumns = useMemo(
    () => columns.filter((column) => column.ai.enabled && !READ_ONLY_KEYS.has(column.key)),
    [columns]
  );
  const visibleRows = useMemo(() => {
    if (!data) return [];
    const needle = searchQuery.trim().toLocaleLowerCase('vi');
    const rows = data.rows.filter((row) => {
      if (statusFilter && String(row.system.status || '') !== statusFilter) return false;
      if (!needle) return true;
      return columns.some((column) =>
        displayValue(fieldValue(row, column), column, data.campaign.timezone)
          .toLocaleLowerCase('vi')
          .includes(needle)
      );
    });
    return rows.sort((left, right) => {
      const column = allColumns.find((item) => item.key === sortKey);
      const leftValue = column ? fieldValue(left, column) : left.system[sortKey];
      const rightValue = column ? fieldValue(right, column) : right.system[sortKey];
      const leftComparable = column?.dataType === 'datetime' || column?.dataType === 'date'
        ? new Date(String(leftValue || 0)).getTime()
        : String(leftValue ?? '').toLocaleLowerCase('vi');
      const rightComparable = column?.dataType === 'datetime' || column?.dataType === 'date'
        ? new Date(String(rightValue || 0)).getTime()
        : String(rightValue ?? '').toLocaleLowerCase('vi');
      const compared = leftComparable < rightComparable ? -1 : leftComparable > rightComparable ? 1 : 0;
      return sortDirection === 'asc' ? compared : -compared;
    });
  }, [allColumns, columns, data, searchQuery, sortDirection, sortKey, statusFilter]);
  const statuses = useMemo(
    () => Array.from(new Set((data?.rows || []).map((row) => String(row.system.status || '')).filter(Boolean))),
    [data?.rows]
  );

  function draftKey(slotId: string, fieldKey: string) {
    return `${slotId}:${fieldKey}`;
  }

  function currentValue(row: CampaignSheetRow, column: CampaignSheetColumn) {
    const key = draftKey(row.slotId, column.key);
    return Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : fieldValue(row, column);
  }

  function patchLocalRow(slotId: string, patch: {
    revision: number;
    system: Record<string, unknown>;
    fields: CampaignSheetRow['fields'];
  }) {
    setData((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.slotId === slotId
        ? { ...row, revision: patch.revision, system: { ...row.system, ...patch.system }, fields: patch.fields }
        : row),
    } : current);
  }

  async function saveCell(row: CampaignSheetRow, column: CampaignSheetColumn, value: unknown, locked?: boolean) {
    const key = draftKey(row.slotId, column.key);
    const previous = fieldValue(row, column);
    if (value === previous && locked === undefined) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setSavingCell(key);
    try {
      const result = await marketingCampaignService.updateSheetRow(campaignId, row.slotId, {
        expectedRevision: row.revision,
        changes: [{ key: column.key, value, locked }],
      });
      patchLocalRow(row.slotId, result);
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setConflictMessage('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu ô dữ liệu.';
      if (/tải lại|cập nhật ở nơi khác/i.test(message)) setConflictMessage(message);
      toast.error(message);
    } finally {
      setSavingCell('');
    }
  }

  async function addColumn() {
    if (!columnForm.label.trim()) {
      toast.error('Hãy nhập tên trường dữ liệu.');
      return;
    }
    setAddingColumn(true);
    try {
      const config = await marketingCampaignService.addSheetColumn(campaignId, {
        label: columnForm.label.trim(),
        dataType: columnForm.dataType,
        fieldPolicy: columnForm.sensitive ? 'constraint' : 'input',
        ai: {
          enabled: true,
          instruction: columnForm.aiInstruction.trim(),
          allowedSources: columnForm.useKnowledge ? ['row', 'campaign', 'knowledge'] : ['row', 'campaign'],
          sensitiveBusinessField: columnForm.sensitive,
          knowledgeDocumentTypes: columnForm.sensitive && /giá|price/i.test(columnForm.label) ? ['pricing'] : [],
        },
      });
      setData((current) => current ? { ...current, config } : current);
      setColumnForm({ label: '', dataType: 'short_text', aiInstruction: '', sensitive: false, useKnowledge: false });
      setShowAddColumn(false);
      toast.success('Đã thêm trường dữ liệu.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thêm trường.');
    } finally {
      setAddingColumn(false);
    }
  }

  function openAddRow() {
    const platform = data?.campaign.platforms[0] || 'Facebook';
    setRowForm((current) => ({
      ...current,
      date: data?.campaign.startDate || new Date().toISOString().slice(0, 10),
      platform,
      mediaType: platform === 'TikTok' ? 'video' : 'image',
      topicBrief: '',
    }));
    setShowAddRow(true);
  }

  async function addRow() {
    if (!rowForm.topicBrief.trim()) {
      toast.error('Hãy nhập chủ đề hoặc tiêu đề bài viết.');
      return;
    }
    setAddingRow(true);
    try {
      await marketingCampaignService.addSheetRow(campaignId, {
        ...rowForm,
        topicBrief: rowForm.topicBrief.trim(),
        objective: rowForm.objective.trim(),
      });
      setShowAddRow(false);
      toast.success('Đã thêm bài viết vào chiến dịch.');
      await loadSheet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thêm bài viết.');
    } finally {
      setAddingRow(false);
    }
  }

  async function archiveColumn(column: CampaignSheetColumn) {
    if (!window.confirm(`Xóa cột “${column.label}”? Dữ liệu cũ vẫn được lưu trong lịch sử.`)) return;
    try {
      const config = await marketingCampaignService.archiveSheetColumn(campaignId, column.id);
      setData((current) => current ? { ...current, config } : current);
      toast.success('Đã xóa cột tùy chỉnh.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa cột.');
    }
  }

  async function setColumnHidden(column: CampaignSheetColumn, hidden: boolean) {
    try {
      const config = await marketingCampaignService.updateSheetColumn(campaignId, column.id, {
        display: { ...column.display, hidden },
      });
      setData((current) => current ? { ...current, config } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật cách hiển thị cột.');
    }
  }

  function toggleSort(column: CampaignSheetColumn) {
    if (sortKey === column.key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(column.key);
    setSortDirection('asc');
  }

  function normalizePastedValue(rawValue: string, column: CampaignSheetColumn) {
    const value = rawValue.trim();
    if (column.dataType === 'boolean') {
      return ['true', '1', 'có', 'yes', 'x'].includes(value.toLocaleLowerCase('vi'));
    }
    if (column.dataType === 'number' || column.dataType === 'currency') {
      return value === '' ? '' : Number(value.replaceAll(',', ''));
    }
    if (column.dataType === 'multi_select') {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return rawValue;
  }

  async function pasteCells(
    event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    startRow: CampaignSheetRow,
    startColumn: CampaignSheetColumn
  ) {
    const clipboardText = event.clipboardData.getData('text/plain');
    if (!clipboardText.includes('\t') && !/[\r\n]/.test(clipboardText)) return;
    event.preventDefault();
    const startRowIndex = visibleRows.findIndex((row) => row.slotId === startRow.slotId);
    const startColumnIndex = columns.findIndex((column) => column.key === startColumn.key);
    if (startRowIndex < 0 || startColumnIndex < 0) return;
    const matrix = clipboardText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '').split('\n')
      .map((line) => line.split('\t'));
    const grouped = new Map<string, {
      slotId: string;
      expectedRevision: number;
      changes: Array<{ key: string; value: unknown }>;
    }>();
    let cellCount = 0;
    matrix.forEach((values, rowOffset) => {
      const targetRow = visibleRows[startRowIndex + rowOffset];
      if (!targetRow || targetRow.readOnly) return;
      values.forEach((rawValue, columnOffset) => {
        const targetColumn = columns[startColumnIndex + columnOffset];
        if (!targetColumn || READ_ONLY_KEYS.has(targetColumn.key)) return;
        const group = grouped.get(targetRow.slotId) || {
          slotId: targetRow.slotId,
          expectedRevision: targetRow.revision,
          changes: [],
        };
        group.changes.push({
          key: targetColumn.key,
          value: normalizePastedValue(rawValue, targetColumn),
        });
        grouped.set(targetRow.slotId, group);
        cellCount += 1;
      });
    });
    if (!cellCount) {
      toast.warning('Vùng dữ liệu không có ô nào có thể chỉnh sửa.');
      return;
    }
    if (cellCount > 1000) {
      toast.error('Mỗi lần chỉ được dán tối đa 1.000 ô.');
      return;
    }
    setPasting(true);
    try {
      const result = await marketingCampaignService.updateSheetCells(campaignId, {
        rows: Array.from(grouped.values()),
      });
      result.results.forEach((row) => patchLocalRow(row.slotId, row));
      if (result.conflicts.length) {
        setConflictMessage(`${result.conflicts.length} dòng bị xung đột và không bị ghi đè.`);
        toast.warning(`Đã dán một phần; ${result.conflicts.length} dòng cần tải lại.`);
      } else {
        toast.success(`Đã dán ${cellCount} ô dữ liệu.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể dán vùng dữ liệu.');
    } finally {
      setPasting(false);
    }
  }

  async function applyAI(fieldKeys?: string[]) {
    if (!aiJob) return;
    setApplyingAI(true);
    try {
      const result = await marketingCampaignService.applySheetAI(campaignId, aiJob._id, fieldKeys);
      if (result.conflicted > 0) {
        toast.warning('Một số ô đã thay đổi trong lúc AI xử lý và không bị ghi đè.');
      } else {
        toast.success(`Đã áp dụng ${result.applied} trường từ AI.`);
      }
      setAiJob(null);
      await loadSheet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể áp dụng đề xuất AI.');
    } finally {
      setApplyingAI(false);
    }
  }

  async function createBulkAIJob(targetFieldKeys = bulkAIColumns.map((column) => column.key), label = 'toàn bộ trường AI') {
    const slotIds = visibleRows
      .filter((row) => !row.readOnly && (selectedRows.size === 0 || selectedRows.has(row.slotId)))
      .map((row) => row.slotId);

    if (slotIds.length === 0) {
      toast.warning('Không có dòng nào có thể dùng AI.');
      return;
    }
    if (targetFieldKeys.length === 0) {
      toast.warning('Chưa có trường nào được bật AI.');
      return;
    }
    setCreatingBulkJob(true);
    try {
      const job = await marketingCampaignService.createSheetAIJob(campaignId, {
        slotIds,
        targetFieldKeys,
        overwritePolicy: 'suggest_only',
        idempotencyKey: createIdempotencyKey(),
      });
      setRunningJob(job);
      toast.success(`Đã đưa ${slotIds.length} dòng tạo ${label} vào hàng đợi AI.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo AI job hàng loạt.');
    } finally {
      setCreatingBulkJob(false);
    }
  }

  async function cancelBulkJob() {
    if (!runningJob) return;
    try {
      const job = await marketingCampaignService.cancelSheetAIJob(campaignId, runningJob._id);
      setRunningJob(job);
      toast.success('Đã gửi yêu cầu hủy AI job.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hủy AI job.');
    }
  }

  async function retryBulkJob() {
    if (!runningJob) return;
    try {
      const job = await marketingCampaignService.retrySheetAIJob(campaignId, runningJob._id);
      setRunningJob(job);
      toast.success('Đã đưa AI job vào hàng đợi thử lại.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thử lại AI job.');
    }
  }

  async function revertLatestChange() {
    setReverting(true);
    try {
      const revisions = await marketingCampaignService.listSheetRevisions(campaignId, 20);
      const latest = revisions.find((revision) => revision.changes.length > 0 && !revision.operation.startsWith('revert:'));
      if (!latest) {
        toast.warning('Chưa có thay đổi dữ liệu nào để hoàn tác.');
        return;
      }
      if (!window.confirm(`Hoàn tác thay đổi gần nhất gồm ${latest.changes.length} ô?`)) return;
      const result = await marketingCampaignService.revertSheetRevision(campaignId, latest._id);
      if (result.conflicts.length) toast.warning(`Đã hoàn tác một phần; ${result.conflicts.length} dòng bị xung đột.`);
      else toast.success(`Đã hoàn tác ${result.revertedRows} dòng.`);
      await loadSheet();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hoàn tác thay đổi.');
    } finally {
      setReverting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">Order ảnh, video</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Mỗi dòng là một yêu cầu sản xuất để chuẩn bị dữ liệu cho Tạo hàng loạt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm yêu cầu
          </button>
          <button
            type="button"
            disabled={reverting}
            onClick={() => void revertLatestChange()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {reverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
            Hoàn tác
          </button>
          <button
            type="button"
            onClick={() => setShowAddColumn(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm trường
          </button>
          <button
            type="button"
            onClick={() => void loadSheet()}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="Tải lại"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm nhóm nội dung, yêu cầu quay/chụp..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-teal-400"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-teal-400"
        >
          <option value="">Mọi trạng thái</option>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColumnSettings((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Cột hiển thị
          </button>
          {showColumnSettings && (
            <div className="absolute right-0 top-11 z-50 max-h-80 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {orderColumns.map((column) => (
                <button
                  key={column.id}
                  type="button"
                  onClick={() => void setColumnHidden(column, !column.display.hidden)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                    <span className="truncate">{displayColumnLabel(column)}</span>
                  {column.display.hidden
                    ? <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    : <Eye className="h-3.5 w-3.5 text-teal-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="ml-auto text-[10px] font-semibold text-slate-400">
          {visibleRows.length}/{data.rows.length} dòng{pasting ? ' · đang dán...' : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
        <div>
          <p className="text-xs font-bold text-violet-800">AI hoàn thiện nội dung hàng loạt</p>
          <p className="mt-1 text-[10px] text-violet-700">
            {selectedRows.size > 0
              ? `Tạo đề xuất cho ${selectedRows.size} dòng đã chọn.`
              : 'Chưa chọn dòng: AI sẽ tạo đề xuất cho toàn bộ dòng đang hiển thị.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedRows.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedRows(new Set())}
              className="rounded-lg px-3 py-2 text-xs font-bold text-violet-600"
            >
              Bỏ chọn
            </button>
          )}
          <button
            type="button"
            disabled={creatingBulkJob || Boolean(runningJob) || bulkAIColumns.length === 0}
            onClick={() => void createBulkAIJob()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {creatingBulkJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI điền toàn dòng
          </button>
        </div>
      </div>

      {runningJob && (
        <div className={`rounded-xl border p-4 ${
          runningJob.status === 'failed'
            ? 'border-rose-200 bg-rose-50'
            : runningJob.status === 'cancelled'
              ? 'border-slate-200 bg-slate-50'
              : 'border-violet-200 bg-white'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-slate-800">
                {runningJob.status === 'failed' ? 'AI job thất bại' : runningJob.status === 'cancelled' ? 'AI job đã hủy' : 'AI đang xử lý hàng loạt'}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {runningJob.completedItems}/{runningJob.totalItems} dòng · {runningJob.failedItems} lỗi · dự kiến {runningJob.estimatedCost} credit
              </p>
            </div>
            <div className="flex gap-2">
              {['queued', 'processing'].includes(runningJob.status) && (
                <button type="button" onClick={() => void cancelBulkJob()} className="rounded-lg border border-rose-200 px-3 py-1.5 text-[10px] font-bold text-rose-600">
                  Hủy
                </button>
              )}
              {['failed', 'cancelled'].includes(runningJob.status) && (
                <button type="button" onClick={() => void retryBulkJob()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white">
                  Thử lại
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${runningJob.progress || 0}%` }} />
          </div>
          {runningJob.errorMessage && <p className="mt-2 text-[10px] text-rose-600">{runningJob.errorMessage}</p>}
        </div>
      )}

      {conflictMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-750">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {conflictMessage}
          </span>
          <button type="button" onClick={() => void loadSheet()} className="font-bold underline">
            Tải lại dữ liệu
          </button>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-max border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-slate-100">
            <tr>
              <th className="sticky left-0 z-30 w-14 border-b border-r border-slate-200 bg-slate-100 px-2 py-3 text-center text-[10px] font-bold text-slate-500">
                <label className="flex items-center justify-center gap-1" title="Chọn tất cả dòng có thể chỉnh sửa">
                  <input
                    type="checkbox"
                    checked={visibleRows.some((row) => !row.readOnly) && visibleRows.filter((row) => !row.readOnly).every((row) => selectedRows.has(row.slotId))}
                    onChange={(event) => setSelectedRows(event.target.checked
                      ? new Set(visibleRows.filter((row) => !row.readOnly).map((row) => row.slotId))
                      : new Set())}
                  />
                  #
                </label>
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  style={{ width: column.display.width || 180, minWidth: column.display.width || 180 }}
                  className="group border-b border-r border-slate-200 px-3 py-2 align-top"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex min-w-0 items-center gap-1 text-left font-bold text-slate-700 hover:text-teal-700"
                      title="Sắp xếp theo cột này"
                    >
                      <span className="truncate">{column.label}</span>
                      <ArrowUpDown className={`h-3 w-3 shrink-0 ${sortKey === column.key ? 'text-teal-600' : 'text-slate-300'}`} />
                    </button>
                    {column.kind === 'custom' && (
                      <button
                        type="button"
                        onClick={() => void archiveColumn(column)}
                        className="opacity-0 text-slate-400 transition hover:text-rose-600 group-hover:opacity-100"
                        title="Xóa cột"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    {column.kind === 'system' ? 'Hệ thống' : 'Tùy chỉnh'}
                    {column.ai.enabled && !READ_ONLY_KEYS.has(column.key) && (
                      <button
                        type="button"
                        disabled={creatingBulkJob || Boolean(runningJob)}
                        onClick={() => void createBulkAIJob([column.key], displayColumnLabel(column))}
                        className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 font-bold normal-case tracking-normal text-violet-700 hover:bg-violet-200 disabled:opacity-50"
                        title={`AI tạo ${displayColumnLabel(column)} hàng loạt`}
                      >
                        <Sparkles className="h-2.5 w-2.5" /> AI điền
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => {
              return (
                <tr key={row.slotId} className="group border-b border-slate-100 last:border-b-0 hover:bg-teal-50/20">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-2 text-center font-mono text-[10px] text-slate-400 group-hover:bg-teal-50/50">
                    <label className="flex items-center justify-center gap-1">
                      <input
                        type="checkbox"
                        disabled={row.readOnly}
                        checked={selectedRows.has(row.slotId)}
                        onChange={(event) => setSelectedRows((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.slotId);
                          else next.delete(row.slotId);
                          return next;
                        })}
                      />
                      {rowIndex + 1}
                    </label>
                  </td>
                  {columns.map((column) => {
                    const key = draftKey(row.slotId, column.key);
                    const value = currentValue(row, column);
                    const stored = row.fields[column.key];
                    const editable = !row.readOnly && !READ_ONLY_KEYS.has(column.key);
                    return (
                      <td
                        key={column.id}
                        style={{ width: column.display.width || 180, minWidth: column.display.width || 180 }}
                        className="relative border-r border-slate-100 p-1 align-top"
                      >
                        {editable ? (
                          <div className="group/cell relative">
                            {column.dataType === 'long_text' ? (
                              <textarea
                                value={String(value ?? '')}
                                onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                onPaste={(event) => void pasteCells(event, row, column)}
                                onBlur={() => void saveCell(row, column, value)}
                                rows={2}
                                className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xs text-slate-700 outline-none hover:border-slate-200 focus:border-teal-400 focus:bg-white"
                              />
                            ) : column.dataType === 'select' ? (
                              <div className="relative">
                                <select
                                  value={String(value ?? '')}
                                  onChange={(event) => {
                                    setDrafts((current) => ({ ...current, [key]: event.target.value }));
                                    void saveCell(row, column, event.target.value);
                                  }}
                                  className="w-full appearance-none rounded-md border border-transparent bg-transparent px-2 py-1.5 pr-6 text-xs outline-none hover:border-slate-200 focus:border-teal-400 focus:bg-white"
                                >
                                  <option value="">—</option>
                                  {(column.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-3 w-3 text-slate-400" />
                              </div>
                            ) : column.dataType === 'boolean' ? (
                              <label className="flex items-center gap-2 px-2 py-2">
                                <input
                                  type="checkbox"
                                  checked={Boolean(value)}
                                  onChange={(event) => void saveCell(row, column, event.target.checked)}
                                />
                                <span>{value ? 'Có' : 'Không'}</span>
                              </label>
                            ) : (
                              <input
                                type={column.dataType === 'number' || column.dataType === 'currency' ? 'number' : column.dataType === 'date' ? 'date' : 'text'}
                                value={String(value ?? '')}
                                onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                                onPaste={(event) => void pasteCells(event, row, column)}
                                onBlur={() => void saveCell(row, column, value)}
                                className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xs text-slate-700 outline-none hover:border-slate-200 focus:border-teal-400 focus:bg-white"
                              />
                            )}

                            <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-white/95 p-0.5 shadow-xs group-hover/cell:flex">
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => void saveCell(row, column, value, !stored?.locked)}
                                className={`rounded p-1 ${stored?.locked ? 'text-amber-600' : 'text-slate-400'} hover:bg-slate-100`}
                                title={stored?.locked ? 'Mở khóa trường' : 'Khóa trường'}
                              >
                                {stored?.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                              </button>
                            </div>

                            {savingCell === key && (
                              <Loader2 className="absolute bottom-1 right-1 h-3 w-3 animate-spin text-teal-600" />
                            )}
                          </div>
                        ) : (
                          <div className="min-h-8 px-2 py-1.5 text-xs text-slate-600">
                            {displayValue(value, column, data.campaign.timezone) || <span className="text-slate-300">—</span>}
                          </div>
                        )}
                        {stored?.source === 'ai' && (
                          <span className="absolute bottom-0.5 left-1.5 inline-flex items-center gap-0.5 text-[8px] font-bold uppercase text-violet-500">
                            <Sparkles className="h-2 w-2" /> AI
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>{data.rows.length} bài viết · tối đa {data.limits.maxCustomColumns} cột tùy chỉnh</span>
        <span className="inline-flex items-center gap-1"><History className="h-3 w-3" /> Mọi thay đổi được lưu theo revision</span>
      </div>

      {showAddColumn && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Thêm trường dữ liệu</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Trường mới xuất hiện cho mọi bài trong chiến dịch.</p>
              </div>
              <button type="button" onClick={() => setShowAddColumn(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-xs font-bold text-slate-700">
                Tên trường
                <input
                  value={columnForm.label}
                  onChange={(event) => setColumnForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Ví dụ: Giá bán, Text trên ảnh..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-teal-400"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Loại dữ liệu
                <select
                  value={columnForm.dataType}
                  onChange={(event) => setColumnForm((current) => ({ ...current, dataType: event.target.value as CampaignSheetDataType }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                >
                  {DATA_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Hướng dẫn cho AI
                <textarea
                  value={columnForm.aiInstruction}
                  onChange={(event) => setColumnForm((current) => ({ ...current, aiInstruction: event.target.value }))}
                  placeholder="Ví dụ: Viết tối đa 8 từ, giọng tích cực..."
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-teal-400"
                />
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={columnForm.useKnowledge}
                  onChange={(event) => setColumnForm((current) => ({ ...current, useKnowledge: event.target.checked }))}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-slate-700">Dùng kho tri thức doanh nghiệp</strong>
                  <span className="text-slate-500">AI được phép tìm tài liệu phù hợp để điền trường này.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={columnForm.sensitive}
                  onChange={(event) => setColumnForm((current) => ({
                    ...current,
                    sensitive: event.target.checked,
                    useKnowledge: event.target.checked ? true : current.useKnowledge,
                  }))}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-amber-800">Dữ liệu kinh doanh nhạy cảm</strong>
                  <span className="text-amber-700">Giá, ưu đãi, chính sách, tồn kho… bắt buộc phải có nguồn.</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setShowAddColumn(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-500">
                Hủy
              </button>
              <button
                type="button"
                disabled={addingColumn}
                onClick={() => void addColumn()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {addingColumn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Thêm trường
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Thêm bài viết vào Sheet</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Bài mới được tạo ở trạng thái lên lịch và dùng chung với Content Calendar.</p>
              </div>
              <button type="button" onClick={() => setShowAddRow(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Ngày đăng
                <input
                  type="date"
                  min={data.campaign.startDate}
                  max={data.campaign.endDate}
                  value={rowForm.date}
                  onChange={(event) => setRowForm((current) => ({ ...current, date: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Giờ đăng
                <input
                  type="time"
                  value={rowForm.time}
                  onChange={(event) => setRowForm((current) => ({ ...current, time: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Nền tảng
                <select
                  value={rowForm.platform}
                  onChange={(event) => {
                    const platform = event.target.value as 'Facebook' | 'TikTok';
                    setRowForm((current) => ({ ...current, platform, mediaType: platform === 'TikTok' ? 'video' : current.mediaType }));
                  }}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                >
                  {data.campaign.platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Loại media
                <select
                  value={rowForm.mediaType}
                  onChange={(event) => setRowForm((current) => ({ ...current, mediaType: event.target.value as typeof current.mediaType }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                >
                  {rowForm.platform === 'Facebook' && <option value="text">Chỉ văn bản</option>}
                  <option value="image">Hình ảnh</option>
                  <option value="video">Video</option>
                  <option value="human-video">Video người nói</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Funnel
                <select
                  value={rowForm.funnelStage}
                  onChange={(event) => setRowForm((current) => ({ ...current, funnelStage: event.target.value as typeof current.funnelStage }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                >
                  <option value="TOFU">TOFU</option>
                  <option value="MOFU">MOFU</option>
                  <option value="BOFU">BOFU</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Content Pillar
                <input
                  value={rowForm.pillar}
                  onChange={(event) => setRowForm((current) => ({ ...current, pillar: event.target.value }))}
                  placeholder="Để trống dùng pillar mặc định"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                Mục tiêu
                <input
                  value={rowForm.objective}
                  onChange={(event) => setRowForm((current) => ({ ...current, objective: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                Chủ đề / tiêu đề
                <textarea
                  value={rowForm.topicBrief}
                  onChange={(event) => setRowForm((current) => ({ ...current, topicBrief: event.target.value }))}
                  rows={3}
                  placeholder="Nhập ý tưởng hoặc tiêu đề để AI tiếp tục hoàn thiện..."
                  className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setShowAddRow(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-500">Hủy</button>
              <button
                type="button"
                disabled={addingRow}
                onClick={() => void addRow()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {addingRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Thêm bài viết
              </button>
            </div>
          </div>
        </div>
      )}

      {aiJob && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50 px-5 py-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-violet-900">
                  <Sparkles className="h-4 w-4" /> Đề xuất từ AI
                </h3>
                <p className="mt-0.5 text-[11px] text-violet-700">Kiểm tra trước khi áp dụng vào Content Sheet.</p>
              </div>
              <button type="button" onClick={() => setAiJob(null)} className="rounded-lg p-1.5 text-violet-500 hover:bg-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
              {aiJob.proposals.flatMap((proposal) => proposal.fields).map((field) => {
                const column = columns.find((item) => item.key === field.key);
                return (
                  <div key={field.key} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-700">{column?.label || field.key}</span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold text-violet-700">
                        Tin cậy {Math.round(field.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{String(field.value || '')}</p>
                    {(field.references || []).length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                        Nguồn: {field.references?.map((reference) => reference.title || reference.id).filter(Boolean).slice(0, 3).join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
              {aiJob.proposals.flatMap((proposal) => proposal.warnings || []).map((warning) => (
                <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-750">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warning}
                </div>
              ))}
              {aiJob.proposals.every((proposal) => proposal.fields.length === 0) && (
                <div className="py-8 text-center text-sm text-slate-500">AI chưa tạo được đề xuất an toàn cho các trường này.</div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
              <span className="text-[11px] text-slate-500">Chi phí: {aiJob.actualCost} credit</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAiJob(null)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-500">
                  Bỏ qua
                </button>
                <button
                  type="button"
                  disabled={applyingAI || aiJob.proposals.every((proposal) => proposal.fields.length === 0)}
                  onClick={() => void applyAI()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {applyingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Áp dụng đề xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
