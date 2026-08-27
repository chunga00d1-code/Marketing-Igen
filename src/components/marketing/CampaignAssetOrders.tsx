import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FileImage,
  FolderOpen,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react';
import {
  CampaignAssetOrder,
  CampaignAssetOrderAsset,
  CampaignAssetOrderBulkPreview,
  CampaignAssetOrderData,
  CampaignAssetRole,
  marketingCampaignService,
} from '../../services/marketingCampaignService';
import {
  bulkCreateService,
  type BulkDataColumn,
  type BulkImportedRow,
  type BulkTemplate,
} from '../../services/bulkCreateService';
import { toast } from '../../pages/Toast';

interface CampaignAssetOrdersProps {
  campaignId: string;
}

const STATUS_LABEL: Record<CampaignAssetOrder['status'], string> = {
  draft: 'Nháp',
  needs_assets: 'Thiếu ảnh',
  ready: 'Sẵn sàng',
  bulk_queued: 'Đang tạo',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
};

const STATUS_CLASS: Record<CampaignAssetOrder['status'], string> = {
  draft: 'bg-slate-100 text-slate-600',
  needs_assets: 'bg-amber-100 text-amber-700',
  ready: 'bg-emerald-100 text-emerald-700',
  bulk_queued: 'bg-blue-100 text-blue-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-rose-100 text-rose-700',
};

function cloneOrder(order: CampaignAssetOrder) {
  return {
    ...order,
    assets: order.assets.map((asset) => ({ ...asset })),
  };
}

function normalizeImportKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findImportValue(cells: Record<string, string>, columns: BulkDataColumn[], aliases: string[]) {
  const matched = columns.find((column) => {
    const key = normalizeImportKey(`${column.key} ${column.label}`);
    return aliases.some((alias) => key.includes(alias));
  });
  return matched ? String(cells[matched.key] || '').trim() : '';
}

function importAssets(cells: Record<string, string>, columns: BulkDataColumn[], source: CampaignAssetOrderAsset['source']) {
  return columns
    .filter((column) => column.type === 'image' || /(anh|hinh|image|photo|logo|video|thumbnail)/i.test(column.label))
    .map((column, index): CampaignAssetOrderAsset | null => {
      const sourceUrl = String(cells[column.key] || '').trim();
      if (!/^https?:\/\//i.test(sourceUrl)) return null;
      const label = normalizeImportKey(column.label);
      const role: CampaignAssetRole = label.includes('logo')
        ? 'logo'
        : label.includes('video')
          ? 'video'
          : index === 0
            ? 'primary'
            : 'secondary';
      return { role, sourceUrl, originalName: column.label, source, order: index };
    })
    .filter((asset): asset is CampaignAssetOrderAsset => Boolean(asset));
}

function orderInputFromImportedRow(cells: Record<string, string>, columns: BulkDataColumn[], source: CampaignAssetOrderAsset['source']) {
  const title = findImportValue(cells, columns, ['ten', 'title', 'ma', 'sku', 'topic']) || 'Order từ dữ liệu nhập';
  const headline = findImportValue(cells, columns, ['chu chinh', 'headline', 'text chinh', 'main text']);
  const subheadline = findImportValue(cells, columns, ['chu phu', 'subheadline', 'text phu', 'secondary text']);
  const cta = findImportValue(cells, columns, ['cta', 'keu goi', 'call to action']);
  const visualBrief = findImportValue(cells, columns, ['brief', 'mo ta', 'yeu cau', 'visual']);
  const aspectRatio = findImportValue(cells, columns, ['ty le', 'ratio', 'aspect']);
  const rawFormat = normalizeImportKey(findImportValue(cells, columns, ['dinh dang', 'format', 'loai']));
  const assets = importAssets(cells, columns, source);
  const hasVideo = assets.some((asset) => asset.role === 'video');
  return {
    title,
    source,
    format: rawFormat.includes('video') && assets.length > 0 && !hasVideo ? 'image_video' as const : hasVideo ? 'video' as const : 'image' as const,
    aspectRatio: (['1:1', '4:5', '9:16', '16:9'].includes(aspectRatio) ? aspectRatio : '4:5') as CampaignAssetOrder['aspectRatio'],
    headline,
    subheadline,
    cta,
    visualBrief,
    assets,
  };
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `asset-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CampaignAssetOrders({ campaignId }: CampaignAssetOrdersProps) {
  const [data, setData] = useState<CampaignAssetOrderData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CampaignAssetOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState('');
  const [assetUrl, setAssetUrl] = useState('');
  const [assetRole, setAssetRole] = useState<CampaignAssetRole>('primary');
  const [driveUrl, setDriveUrl] = useState('');
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; directUrl: string; isVideo: boolean }>>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [pendingImport, setPendingImport] = useState<{ source: CampaignAssetOrderAsset['source']; columns: BulkDataColumn[]; rows: BulkImportedRow[]; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [applyingAI, setApplyingAI] = useState(false);
  const [templates, setTemplates] = useState<BulkTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<CampaignAssetOrderBulkPreview | null>(null);
  const [creatingBulk, setCreatingBulk] = useState(false);
  const draftRef = useRef<CampaignAssetOrder | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const lastSaveResultRef = useRef(true);
  const draftVersionRef = useRef(0);

  const setCurrentDraft = useCallback((next: CampaignAssetOrder | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const setDirtyState = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  }, []);

  const loadOrders = useCallback(async (keepSelection = true) => {
    setLoading(true);
    try {
      const next = await marketingCampaignService.getAssetOrders(campaignId);
      setData(next);
      const nextId = keepSelection && selectedId && next.orders.some((order) => order._id === selectedId)
        ? selectedId
        : next.orders[0]?._id || '';
      setSelectedId(nextId);
      const order = next.orders.find((item) => item._id === nextId) || null;
      setCurrentDraft(order ? cloneOrder(order) : null);
      setDirtyState(false);
      setConflict('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải Order ảnh, video.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, selectedId, setCurrentDraft, setDirtyState]);

  useEffect(() => {
    void loadOrders(false);
    // Only reload when the selected campaign changes. Selection changes are handled locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    let active = true;
    setLoadingTemplates(true);
    void bulkCreateService.listTemplates()
      .then((items) => { if (active) setTemplates(items); })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : 'Không thể tải template tạo hàng loạt.'); })
      .finally(() => { if (active) setLoadingTemplates(false); });
    return () => { active = false; };
  }, []);

  const saveDraft = useCallback(async function saveCurrentDraft() {
    const snapshot = draftRef.current;
    if (savingRef.current) {
      while (savingRef.current) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
      }
      if (!lastSaveResultRef.current) return false;
      return dirtyRef.current ? saveCurrentDraft() : true;
    }
    if (!snapshot || !dirtyRef.current) return true;
    const savedVersion = draftVersionRef.current;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await marketingCampaignService.updateAssetOrder(campaignId, snapshot._id, {
        expectedRevision: snapshot.revision,
        slotId: snapshot.slotId || '',
        title: snapshot.title,
        source: snapshot.source,
        format: snapshot.format,
        aspectRatio: snapshot.aspectRatio,
        templateId: snapshot.templateId || '',
        headline: snapshot.headline,
        subheadline: snapshot.subheadline || '',
        cta: snapshot.cta || '',
        visualBrief: snapshot.visualBrief || '',
        assets: snapshot.assets,
      });
      setData((current) => current ? {
        ...current,
        orders: current.orders.map((order) => order._id === saved._id ? { ...order, ...saved } : order),
      } : current);
      if (draftVersionRef.current === savedVersion) {
        setCurrentDraft(cloneOrder(saved));
        setDirtyState(false);
      } else {
        setDraft((current) => {
          if (!current || current._id !== saved._id) return current;
          const next = { ...current, revision: saved.revision, status: saved.status };
          draftRef.current = next;
          return next;
        });
      }
      setConflict('');
      lastSaveResultRef.current = true;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu Order.';
      if (/cập nhật ở nơi khác|tải lại/i.test(message)) setConflict(message);
      else toast.error(message);
      lastSaveResultRef.current = false;
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [campaignId, setCurrentDraft, setDirtyState]);

  const selectOrder = async (order: CampaignAssetOrder) => {
    if (dirtyRef.current && !await saveDraft()) return;
    setSelectedId(order._id);
    setCurrentDraft(cloneOrder(order));
    setDirtyState(false);
    setConflict('');
  };

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void saveDraft(), 550);
    return () => window.clearTimeout(timer);
  }, [dirty, saveDraft]);

  const updateDraft = <K extends keyof CampaignAssetOrder>(key: K, value: CampaignAssetOrder[K]) => {
    draftVersionRef.current += 1;
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      draftRef.current = next;
      return next;
    });
    setDirtyState(true);
  };

  const createOrder = async () => {
    if (dirtyRef.current && !await saveDraft()) return;
    setCreating(true);
    try {
      const created = await marketingCampaignService.createAssetOrder(campaignId, {
        title: 'Yêu cầu sản xuất mới',
        format: 'image',
        aspectRatio: '4:5',
      });
      setData((current) => current ? { ...current, orders: [created, ...current.orders] } : current);
      await selectOrder(created);
      toast.success('Đã tạo Order mới. Order này chưa tạo bài đăng hoặc lịch đăng.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo Order.');
    } finally {
      setCreating(false);
    }
  };

  const removeOrder = async () => {
    if (!draft || !window.confirm(`Hủy Order “${draft.title || 'chưa đặt tên'}”?`)) return;
    try {
      await marketingCampaignService.archiveAssetOrder(campaignId, draft._id);
      setData((current) => current ? {
        ...current,
        orders: current.orders.filter((order) => order._id !== draft._id),
      } : current);
      setSelectedId('');
      setCurrentDraft(null);
      setDirtyState(false);
      toast.success('Đã hủy Order.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hủy Order.');
    }
  };

  const addAsset = (url: string, originalName?: string, source: CampaignAssetOrderAsset['source'] = 'manual', role = assetRole) => {
    const sourceUrl = url.trim();
    if (!/^https?:\/\//i.test(sourceUrl)) {
      toast.error('Hãy nhập liên kết ảnh/video HTTP hoặc HTTPS hợp lệ.');
      return;
    }
    if (!draft) return;
    if (draft.assets.some((asset) => asset.sourceUrl === sourceUrl && asset.role === role)) {
      toast.warning('Tài nguyên này đã có trong Order.');
      return;
    }
    updateDraft('assets', [
      ...draft.assets,
      { role, sourceUrl, originalName, source, order: draft.assets.length },
    ]);
    setAssetUrl('');
  };

  const removeAsset = (index: number) => {
    if (!draft) return;
    updateDraft('assets', draft.assets.filter((_, assetIndex) => assetIndex !== index)
      .map((asset, assetIndex) => ({ ...asset, order: assetIndex })));
  };

  const previewDrive = async () => {
    if (!driveUrl.trim()) return;
    setLoadingDrive(true);
    try {
      const files = await marketingCampaignService.previewDrive(driveUrl.trim());
      setDriveFiles(files);
      if (!files.length) toast.warning('Không tìm thấy ảnh hoặc video phù hợp trong thư mục Drive.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể đọc thư mục Google Drive.');
    } finally {
      setLoadingDrive(false);
    }
  };

  const openGoogleSheetImport = async () => {
    if (!googleSheetUrl.trim()) return;
    setImporting(true);
    try {
      const preview = await bulkCreateService.previewPublicGoogleSheet(googleSheetUrl.trim());
      setPendingImport({ source: 'sheet', columns: preview.columns, rows: preview.rows, name: preview.sheetName || 'Google Sheet' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể đọc Google Sheet.');
    } finally {
      setImporting(false);
    }
  };

  const openWorkbookImport = async (file: File) => {
    setImporting(true);
    try {
      if (/\.csv$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(workbook.Sheets[firstSheet], { header: 1, raw: false });
        const labels = (matrix[0] || []).map((cell) => String(cell || '').trim());
        if (!labels.length || labels.some((label) => !label)) throw new Error('CSV cần một dòng tiêu đề đầy đủ.');
        const columns: BulkDataColumn[] = labels.map((label, index) => ({
          key: `column-${index + 1}`,
          label,
          type: /(ảnh|hình|image|photo|logo|video|thumbnail)/i.test(label) ? 'image' : 'text',
          samples: matrix.slice(1, 5).map((row) => String(row[index] || '').trim()).filter(Boolean),
        }));
        const rows: BulkImportedRow[] = matrix.slice(1, 101)
          .filter((row) => row.some((cell) => String(cell || '').trim()))
          .map((row, rowIndex) => ({
            id: `csv-${rowIndex + 1}`,
            selected: true,
            cells: Object.fromEntries(columns.map((column, index) => [column.key, String(row[index] || '').trim()])),
          }));
        setPendingImport({ source: 'sheet', columns, rows, name: file.name });
        return;
      }
      const preview = await bulkCreateService.previewWorkbook(file);
      setPendingImport({ source: 'sheet', columns: preview.columns, rows: preview.rows, name: preview.originalName || file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể đọc tệp Excel.');
    } finally {
      setImporting(false);
    }
  };

  const importOrders = async () => {
    if (!pendingImport) return;
    setImporting(true);
    let created = 0;
    let failed = 0;
    const rows = pendingImport.rows.slice(0, 100);
    try {
      for (let index = 0; index < rows.length; index += 3) {
        const batch = rows.slice(index, index + 3);
        const results = await Promise.allSettled(batch.map((row) => marketingCampaignService.createAssetOrder(
          campaignId,
          orderInputFromImportedRow(row.cells, pendingImport.columns, pendingImport.source)
        )));
        results.forEach((result) => {
          if (result.status === 'fulfilled') created += 1;
          else failed += 1;
        });
      }
      await loadOrders(false);
      setPendingImport(null);
      toast.success(`Đã tạo ${created} Order từ ${pendingImport.name}${failed ? ` · ${failed} dòng lỗi` : ''}.`);
    } finally {
      setImporting(false);
    }
  };

  const generateAiBrief = async () => {
    if (!draft) return;
    if (dirtyRef.current && !await saveDraft()) return;
    const current = draftRef.current;
    if (!current) return;
    setGeneratingAI(true);
    try {
      const proposed = await marketingCampaignService.previewAssetOrderAI(campaignId, current._id, {
        idempotencyKey: createIdempotencyKey(),
      });
      setData((value) => value ? { ...value, orders: value.orders.map((order) => order._id === proposed._id ? { ...order, ...proposed } : order) } : value);
      setCurrentDraft(cloneOrder(proposed));
      setDirtyState(false);
      toast.success('AI đã tạo đề xuất. Hãy xem rồi bấm áp dụng.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo brief bằng AI.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const applyAiBrief = async () => {
    const current = draftRef.current;
    if (!current?.aiProposal) return;
    if (dirtyRef.current && !await saveDraft()) return;
    const saved = draftRef.current;
    if (!saved) return;
    setApplyingAI(true);
    try {
      const applied = await marketingCampaignService.applyAssetOrderAI(campaignId, saved._id, {
        expectedRevision: saved.revision,
      });
      setData((value) => value ? { ...value, orders: value.orders.map((order) => order._id === applied._id ? { ...order, ...applied } : order) } : value);
      setCurrentDraft(cloneOrder(applied));
      setDirtyState(false);
      toast.success('Đã áp dụng đề xuất AI.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể áp dụng đề xuất AI.');
    } finally {
      setApplyingAI(false);
    }
  };

  const previewBulk = async () => {
    if (!draft?.templateId) {
      toast.warning('Hãy chọn template tạo hàng loạt trước.');
      return;
    }
    if (dirtyRef.current && !await saveDraft()) return;
    const current = draftRef.current;
    if (!current?.templateId) return;
    try {
      const preview = await marketingCampaignService.previewAssetOrderBulk(campaignId, current._id, current.templateId);
      setBulkPreview(preview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể kiểm tra map tạo hàng loạt.');
    }
  };

  const createBulk = async () => {
    const current = draftRef.current;
    if (!current?.templateId || !bulkPreview?.ready) return;
    setCreatingBulk(true);
    try {
      const result = await marketingCampaignService.createAssetOrderBulk(campaignId, current._id, {
        templateId: current.templateId,
        idempotencyKey: createIdempotencyKey(),
      });
      setData((value) => value ? { ...value, orders: value.orders.map((order) => order._id === result.order._id ? { ...order, ...result.order } : order) } : value);
      setCurrentDraft(cloneOrder(result.order));
      setDirtyState(false);
      setBulkPreview(null);
      toast.success('Đã đưa Order vào hàng đợi tạo hàng loạt.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo job tạo hàng loạt.');
    } finally {
      setCreatingBulk(false);
    }
  };

  const syncBulk = useCallback(async () => {
    const current = draftRef.current;
    if (!current?.bulkJobId || current.status !== 'bulk_queued') return;
    try {
      const synced = await marketingCampaignService.syncAssetOrderBulk(campaignId, current._id);
      setData((value) => value ? { ...value, orders: value.orders.map((order) => order._id === synced._id ? { ...order, ...synced } : order) } : value);
      setCurrentDraft(cloneOrder(synced));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật tạo hàng loạt.');
    }
  }, [campaignId, setCurrentDraft]);

  useEffect(() => {
    if (draft?.status !== 'bulk_queued' || !draft.bulkJobId) return;
    const timer = window.setTimeout(() => void syncBulk(), 2_500);
    return () => window.clearTimeout(timer);
  }, [draft?.bulkJobId, draft?.status, draft?.updatedAt, syncBulk]);

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">Order ảnh, video</h3>
          <p className="mt-1 text-xs text-slate-500">Order tách riêng với bài đăng; chỉ khi bạn đưa sang Tạo hàng loạt mới tạo đầu ra.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadOrders()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Tải lại">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" disabled={creating} onClick={() => void createOrder()} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm Order
          </button>
        </div>
      </div>

      {conflict && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <span>{conflict}</span>
          <button type="button" onClick={() => void loadOrders()} className="font-bold underline">Tải lại dữ liệu</button>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700"><ImagePlus className="h-4 w-4 text-teal-600" /> Nhập nhiều Order từ Google Sheet hoặc Excel</summary>
        <div className="grid gap-3 border-t border-slate-100 p-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-600">Google Sheet công khai</p>
            <div className="mt-2 flex gap-2"><input value={googleSheetUrl} onChange={(event) => setGoogleSheetUrl(event.target.value)} placeholder="Dán link Google Sheet" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" /><button type="button" disabled={importing || !googleSheetUrl.trim()} onClick={() => void openGoogleSheetImport()} className="h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50">{importing ? 'Đang đọc' : 'Xem trước'}</button></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600">Excel hoặc CSV có cột Ảnh 1, Ảnh 2, Logo…</p>
            <label className="mt-2 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-teal-400 hover:bg-teal-50"><FolderOpen className="h-3.5 w-3.5" /> Chọn tệp .xlsx hoặc .csv<input type="file" accept=".xlsx,.csv" className="hidden" disabled={importing} onChange={(event) => { const file = event.target.files?.[0]; if (file) void openWorkbookImport(file); event.currentTarget.value = ''; }} /></label>
          </div>
          <p className="md:col-span-2 text-[11px] leading-relaxed text-slate-500">Hệ thống nhận các cột có tên Ảnh, Image, Logo, Video thành tài nguyên riêng. Bạn luôn được xem trước số dòng và các cột trước khi tạo Order.</p>
        </div>
      </details>

      {pendingImport && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-teal-900">Xem trước dữ liệu: {pendingImport.name}</p><p className="mt-1 text-xs text-teal-800">{pendingImport.rows.length} dòng · {pendingImport.columns.length} cột · tối đa 100 dòng mỗi lần nhập</p></div><div className="flex gap-2"><button type="button" onClick={() => setPendingImport(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600">Hủy</button><button type="button" disabled={importing} onClick={() => void importOrders()} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tạo {Math.min(100, pendingImport.rows.length)} Order</button></div></div>
          <div className="mt-3 overflow-auto rounded-lg border border-teal-100 bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{pendingImport.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-2 font-bold">{column.label}</th>)}</tr></thead><tbody>{pendingImport.rows.slice(0, 3).map((row) => <tr key={row.id} className="border-t border-slate-100">{pendingImport.columns.map((column) => <td key={column.key} className="max-w-48 truncate px-3 py-2 text-slate-600">{row.cells[column.key] || '—'}</td>)}</tr>)}</tbody></table></div>
        </div>
      )}

      <div className="grid min-h-[520px] gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-2">
          <p className="px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{data?.orders.length || 0} Yêu cầu sản xuất</p>
          <div className="space-y-1 overflow-y-auto lg:max-h-[620px]">
            {data?.orders.map((order) => (
              <button key={order._id} type="button" onClick={() => void selectOrder(order)} className={`w-full rounded-lg p-3 text-left transition ${selectedId === order._id ? 'bg-teal-50 ring-1 ring-teal-300' : 'hover:bg-slate-50'}`}>
                <span className="block truncate text-sm font-bold text-slate-800">{order.title || 'Chưa đặt tên'}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{order.headline || order.slot?.topicBrief || 'Chưa có chữ chính'}</span>
                <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[order.status]}`}>{STATUS_LABEL[order.status]}</span>
              </button>
            ))}
            {!data?.orders.length && <p className="px-3 py-8 text-center text-xs leading-relaxed text-slate-500">Chưa có yêu cầu sản xuất. Hãy tạo yêu cầu đầu tiên.</p>}
          </div>
        </aside>

        {!draft ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <ImagePlus className="h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">Chọn hoặc tạo một yêu cầu sản xuất để bắt đầu</p>
          </div>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[draft.status]}`}>{STATUS_LABEL[draft.status]}</span>
                {saving && <span className="inline-flex items-center gap-1 text-xs text-teal-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu</span>}
                {!saving && dirty && <span className="text-xs text-slate-500">Chờ lưu…</span>}
              </div>
              <button type="button" onClick={() => void removeOrder()} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Hủy Order</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">Tên Order</span><input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} onBlur={() => void saveDraft()} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Gắn với bài đăng</span><div className="relative"><select value={draft.slotId || ''} onChange={(event) => updateDraft('slotId', event.target.value || undefined)} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm outline-none focus:border-teal-500"><option value="">Order độc lập</option>{data?.slots.filter((slot) => !['published', 'cancelled'].includes(slot.status)).map((slot) => <option key={slot._id} value={slot._id}>{slot.topicBrief} · {slot.page || slot.platform}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" /></div></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Loại</span><select value={draft.format} onChange={(event) => updateDraft('format', event.target.value as CampaignAssetOrder['format'])} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500"><option value="image">Ảnh</option><option value="video">Video</option><option value="image_video">Ảnh + Video</option></select></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Tỷ lệ</span><select value={draft.aspectRatio} onChange={(event) => updateDraft('aspectRatio', event.target.value as CampaignAssetOrder['aspectRatio'])} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500"><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Chữ chính</span><input value={draft.headline} maxLength={120} onChange={(event) => updateDraft('headline', event.target.value)} onBlur={() => void saveDraft()} placeholder="Tối đa 45 ký tự nên dùng" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Chữ phụ</span><input value={draft.subheadline || ''} maxLength={220} onChange={(event) => updateDraft('subheadline', event.target.value)} onBlur={() => void saveDraft()} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">CTA</span><input value={draft.cta || ''} maxLength={80} onChange={(event) => updateDraft('cta', event.target.value)} onBlur={() => void saveDraft()} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" /></label>
              <label className="block md:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-600">Brief hình / video</span><textarea value={draft.visualBrief || ''} maxLength={1000} rows={3} onChange={(event) => updateDraft('visualBrief', event.target.value)} onBlur={() => void saveDraft()} placeholder="Mô tả ngắn bố cục, sản phẩm, màu sắc hoặc cảnh quay…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" /></label>
            </div>

            <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-violet-900">AI tạo brief ngắn</p><p className="mt-1 text-xs text-violet-700">Dùng dữ liệu Order, slot, chiến dịch và RAG đúng Page. AI chỉ tạo đề xuất, không tự ghi đè.</p></div><button type="button" disabled={generatingAI || applyingAI} onClick={() => void generateAiBrief()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50">{generatingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Tạo brief</button></div>
              {draft.aiProposal && <div className="mt-3 rounded-lg border border-violet-100 bg-white p-3"><div className="grid gap-2 text-xs sm:grid-cols-2"><p><span className="font-bold text-slate-500">Chữ chính:</span> {draft.aiProposal.headline || '—'}</p><p><span className="font-bold text-slate-500">Chữ phụ:</span> {draft.aiProposal.subheadline || '—'}</p><p><span className="font-bold text-slate-500">CTA:</span> {draft.aiProposal.cta || '—'}</p><p><span className="font-bold text-slate-500">Brief:</span> {draft.aiProposal.visualBrief || '—'}</p></div>{draft.aiProposal.warnings.length > 0 && <p className="mt-2 text-[11px] text-amber-700">{draft.aiProposal.warnings.join(' · ')}</p>}<div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-slate-500">{draft.aiProposal.references.length ? `Có ${draft.aiProposal.references.length / 2} nguồn RAG tham chiếu` : 'Không có nguồn RAG phù hợp'}</span><button type="button" disabled={applyingAI || generatingAI} onClick={() => void applyAiBrief()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{applyingAI && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Áp dụng đề xuất</button></div></div>}
            </div>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-blue-900">Đưa sang Tạo hàng loạt</p><p className="mt-1 text-xs text-blue-700">Hệ thống map chữ và từng ảnh vào layer của template trước khi tạo job.</p></div>{draft.status === 'bulk_queued' && <button type="button" onClick={() => void syncBulk()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700"><RefreshCw className="h-3.5 w-3.5" /> Cập nhật kết quả</button>}</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={draft.templateId || ''} onChange={(event) => { updateDraft('templateId', event.target.value || undefined); setBulkPreview(null); }} className="h-10 min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 text-sm outline-none focus:border-blue-500"><option value="">{loadingTemplates ? 'Đang tải template…' : 'Chọn template Tạo hàng loạt'}</option>{templates.map((template) => <option key={template._id} value={template._id}>{template.name} · {template.canvas.width}×{template.canvas.height}</option>)}</select><button type="button" disabled={!draft.templateId || creatingBulk} onClick={() => void previewBulk()} className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 disabled:opacity-50">Kiểm tra map</button></div>
              {bulkPreview && <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3"><p className="text-xs font-bold text-slate-700">{bulkPreview.template.name} · {bulkPreview.ready ? 'Đã đủ dữ liệu' : `Thiếu ${bulkPreview.missing.length} layer`}</p><div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px]">{bulkPreview.mapping.map((item) => <p key={item.layerId} className={item.value ? 'text-slate-600' : 'text-rose-600'}><span className="font-bold">{item.fieldName}:</span> {item.source || 'Chưa map'}</p>)}</div>{bulkPreview.missing.length > 0 && <p className="mt-2 text-[11px] text-rose-600">Cần bổ sung: {bulkPreview.missing.map((item) => item.fieldName).join(', ')}</p>}<div className="mt-3 flex justify-end"><button type="button" disabled={!bulkPreview.ready || creatingBulk} onClick={() => void createBulk()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">{creatingBulk && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tạo ảnh</button></div></div>}
              {draft.outputUrls.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{draft.outputUrls.map((url, index) => <a key={url} href={`/api/v1/media/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${draft.title || 'order'}-${index + 1}.png`)}`} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700">Tải ảnh {index + 1}</a>)}</div>}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">Tài nguyên nguồn</h4><p className="mt-1 text-xs text-slate-500">Có thể thêm nhiều ảnh: ảnh chính, ảnh phụ, logo hoặc video.</p></div><span className="text-xs font-bold text-slate-400">{draft.assets.length}/20</span></div>
              <div className="mt-3 grid gap-2 md:grid-cols-[150px_minmax(0,1fr)_auto]">
                <select value={assetRole} onChange={(event) => setAssetRole(event.target.value as CampaignAssetRole)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500"><option value="primary">Ảnh chính</option><option value="secondary">Ảnh phụ</option><option value="logo">Logo</option><option value="video">Video</option><option value="other">Khác</option></select>
                <input value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addAsset(assetUrl); } }} placeholder="Dán link ảnh/video" className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
                <button type="button" onClick={() => addAsset(assetUrl)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-700 hover:bg-teal-100"><Link2 className="h-3.5 w-3.5" /> Thêm link</button>
              </div>
              <div className="mt-3 space-y-2">{draft.assets.map((asset, index) => <div key={`${asset.sourceUrl}-${index}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white text-slate-500">{asset.role === 'video' ? <Video className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">{asset.originalName || asset.role}</p><p className="truncate text-[11px] text-slate-500">{asset.sourceUrl}</p></div><button type="button" onClick={() => removeAsset(index)} className="rounded p-1.5 text-rose-500 hover:bg-rose-50" title="Xóa tài nguyên"><Trash2 className="h-4 w-4" /></button></div>)}</div>
            </div>

            <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-slate-700"><FolderOpen className="h-4 w-4 text-amber-600" /> Lấy ảnh/video từ Google Drive</summary>
              <div className="border-t border-slate-200 p-4"><div className="flex gap-2"><input value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} placeholder="Dán link thư mục Google Drive" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" /><button type="button" onClick={() => void previewDrive()} disabled={loadingDrive || !driveUrl.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white disabled:opacity-50">{loadingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />} Đọc Drive</button></div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Drive là thư viện nguồn. Khi cần ghép đúng nhiều dòng, hãy dùng Sheet/Excel có cột mã và các cột Ảnh 1, Ảnh 2…</p>{driveFiles.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{driveFiles.slice(0, 30).map((file) => <button key={file.id} type="button" onClick={() => addAsset(file.directUrl, file.name, 'drive', file.isVideo ? 'video' : assetRole)} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-teal-300"><span className="text-slate-500">{file.isVideo ? <Video className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}</span><span className="truncate text-xs font-semibold text-slate-700">{file.name}</span><Plus className="ml-auto h-3.5 w-3.5 text-teal-600" /></button>)}</div>}</div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
