import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react';
import {
  type CampaignAssetOrder,
  type CampaignAssetOrderAIJob,
  type CampaignAssetOrderFormat,
  type CampaignAssetOrderData,
  marketingCampaignService,
} from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';
import CampaignAssetOrders from './CampaignAssetOrders';

interface CampaignAssetOrderSheetProps {
  campaignId: string;
}

type PlannerField =
  | 'contentGroup'
  | 'shootingContent'
  | 'productionRequirements'
  | 'quantitySuggestion'
  | 'headline'
  | 'subheadline'
  | 'visualBrief'
  | 'videoScript';

const plannerFields: PlannerField[] = [
  'contentGroup',
  'shootingContent',
  'productionRequirements',
  'quantitySuggestion',
  'headline',
  'subheadline',
  'visualBrief',
  'videoScript',
];

const FORMAT_LABEL: Record<CampaignAssetOrderFormat, string> = {
  image: 'Ảnh',
  video: 'Video',
  image_video: 'Ảnh + Video',
};

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `asset-order-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateOrderInData(
  current: CampaignAssetOrderData | null,
  nextOrder: CampaignAssetOrder,
) {
  if (!current) return current;
  return {
    ...current,
    orders: current.orders.map((order) => order._id === nextOrder._id ? { ...order, ...nextOrder } : order),
  };
}

export default function CampaignAssetOrderSheet({ campaignId }: CampaignAssetOrderSheetProps) {
  const [data, setData] = useState<CampaignAssetOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [aiIds, setAiIds] = useState<string[]>([]);
  const [applyingIds, setApplyingIds] = useState<string[]>([]);
  const [fillAllJob, setFillAllJob] = useState<CampaignAssetOrderAIJob | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [customFieldLabel, setCustomFieldLabel] = useState('');
  const [addingCustomField, setAddingCustomField] = useState(false);
  const handledFillAllJobRef = useRef('');

  const isSaving = (orderId: string) => savingIds.includes(orderId);
  const isGenerating = (orderId: string) => aiIds.includes(orderId);
  const isApplying = (orderId: string) => applyingIds.includes(orderId);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      setData(await marketingCampaignService.getAssetOrders(campaignId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải bảng Order ảnh, video.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const fillAllInProgress = Boolean(fillAllJob && ['queued', 'processing'].includes(fillAllJob.status));
  const activeFillAllJobId = fillAllInProgress ? fillAllJob?._id || '' : '';

  useEffect(() => {
    if (!activeFillAllJobId) return;
    const timer = window.setTimeout(() => {
      void marketingCampaignService.getFillAllAssetOrdersAIJob(campaignId, activeFillAllJobId)
        .then(setFillAllJob)
        .catch((error) => {
          setFillAllJob((current) => current ? {
            ...current,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Không thể cập nhật tiến trình AI điền Order.',
          } : current);
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeFillAllJobId, campaignId]);

  useEffect(() => {
    if (!fillAllJob || ['queued', 'processing'].includes(fillAllJob.status)) return;
    if (handledFillAllJobRef.current === fillAllJob._id) return;
    handledFillAllJobRef.current = fillAllJob._id;
    void loadOrders();
    const applied = fillAllJob.results.filter((result) => result.status === 'applied').length;
    if (fillAllJob.status === 'completed') {
      toast.success(`AI đã điền ${applied}/${fillAllJob.totalItems} dòng Order.`);
      return;
    }
    if (fillAllJob.status === 'cancelled') {
      toast.warning(`Đã hủy AI điền Order sau ${fillAllJob.completedItems}/${fillAllJob.totalItems} dòng.`);
      return;
    }
    if (fillAllJob.status === 'failed') {
      toast.error(fillAllJob.errorMessage || 'AI chưa thể điền các dòng Order.');
      return;
    }
    toast.warning(`AI đã xử lý ${applied}/${fillAllJob.totalItems} dòng; ${fillAllJob.skippedItems + fillAllJob.conflictedItems + fillAllJob.failedItems} dòng cần kiểm tra lại.`);
  }, [fillAllJob, loadOrders]);

  const changeLocal = <K extends PlannerField | 'format'>(
    orderId: string,
    field: K,
    value: CampaignAssetOrder[K],
  ) => {
    setData((current) => current ? {
      ...current,
      orders: current.orders.map((order) => order._id === orderId ? { ...order, [field]: value } : order),
    } : current);
  };

  const changeCustomFieldLocal = (orderId: string, fieldKey: string, value: string) => {
    setData((current) => current ? {
      ...current,
      orders: current.orders.map((order) => order._id === orderId
        ? { ...order, customFields: { ...order.customFields, [fieldKey]: value } }
        : order),
    } : current);
  };

  const saveCell = async <K extends PlannerField | 'format'>(
    order: CampaignAssetOrder,
    field: K,
  ) => {
    if (isSaving(order._id) || ['completed', 'cancelled'].includes(order.status)) return;
    setSavingIds((current) => [...current, order._id]);
    try {
      const saved = await marketingCampaignService.updateAssetOrder(campaignId, order._id, {
        expectedRevision: order.revision,
        [field]: order[field],
      });
      setData((current) => updateOrderInData(current, saved));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu ô này.');
      await loadOrders();
    } finally {
      setSavingIds((current) => current.filter((id) => id !== order._id));
    }
  };

  const saveCustomField = async (order: CampaignAssetOrder, fieldKey: string) => {
    if (isSaving(order._id) || ['completed', 'cancelled'].includes(order.status)) return;
    setSavingIds((current) => [...current, order._id]);
    try {
      const saved = await marketingCampaignService.updateAssetOrder(campaignId, order._id, {
        expectedRevision: order.revision,
        customFields: { [fieldKey]: order.customFields?.[fieldKey] || '' },
      });
      setData((current) => updateOrderInData(current, saved));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu ô tùy chỉnh này.');
      await loadOrders();
    } finally {
      setSavingIds((current) => current.filter((id) => id !== order._id));
    }
  };

  const generateProposal = async (order: CampaignAssetOrder) => {
    setAiIds((current) => [...current, order._id]);
    try {
      const proposed = await marketingCampaignService.previewAssetOrderAI(campaignId, order._id, {
        idempotencyKey: createIdempotencyKey(),
      });
      const applied = await marketingCampaignService.applyAssetOrderAI(campaignId, proposed._id, {
        expectedRevision: proposed.revision,
        fieldKeys: [...plannerFields, 'format'],
      });
      setData((current) => updateOrderInData(current, applied));
      toast.success('AI đã điền nội dung vào dòng này.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI chưa thể điền nội dung cho dòng này.');
    } finally {
      setAiIds((current) => current.filter((id) => id !== order._id));
    }
  };

  const applyProposal = async (order: CampaignAssetOrder) => {
    if (!order.aiProposal) return;
    setApplyingIds((current) => [...current, order._id]);
    try {
      const applied = await marketingCampaignService.applyAssetOrderAI(campaignId, order._id, {
        expectedRevision: order.revision,
        fieldKeys: plannerFields,
      });
      setData((current) => updateOrderInData(current, applied));
      toast.success('Đã áp dụng mô tả sản xuất từ AI.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể áp dụng đề xuất AI.');
      await loadOrders();
    } finally {
      setApplyingIds((current) => current.filter((id) => id !== order._id));
    }
  };

  const plannedOrders = (data?.orders || []).filter((order) => Boolean(order.slotId));

  const fillAllRows = async () => {
    if (!plannedOrders.length) {
      toast.warning('Chưa có bài viết để AI điền Order.');
      return;
    }
    try {
      const job = await marketingCampaignService.fillAllAssetOrdersAI(campaignId, {
        idempotencyKey: createIdempotencyKey(),
        overwritePolicy: 'empty_only',
      });
      handledFillAllJobRef.current = '';
      setFillAllJob(job);
      toast.info('AI đang điền Order ở nền. Bạn có thể tiếp tục xem bảng.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI chưa thể điền toàn bộ Order.');
    }
  };

  const cancelFillAllRows = async () => {
    if (!fillAllJob || !fillAllInProgress) return;
    try {
      setFillAllJob(await marketingCampaignService.cancelFillAllAssetOrdersAIJob(campaignId, fillAllJob._id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hủy AI điền Order.');
    }
  };

  const addCustomField = async () => {
    const label = customFieldLabel.trim();
    if (!label) return;
    setAddingCustomField(true);
    try {
      const field = await marketingCampaignService.addAssetOrderCustomField(campaignId, label);
      setData((current) => current ? { ...current, customFieldColumns: [...current.customFieldColumns, field] } : current);
      setCustomFieldLabel('');
      setShowAddCustomField(false);
      toast.success(`Đã thêm cột “${field.label}”.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thêm cột tùy chỉnh.');
    } finally {
      setAddingCustomField(false);
    }
  };

  const archiveCustomField = async (fieldKey: string) => {
    const field = data?.customFieldColumns.find((item) => item.key === fieldKey);
    if (!field || !window.confirm(`Ẩn cột “${field.label}” khỏi bảng Order? Dữ liệu cũ vẫn được giữ.`)) return;
    try {
      await marketingCampaignService.archiveAssetOrderCustomField(campaignId, fieldKey);
      setData((current) => current ? {
        ...current,
        customFieldColumns: current.customFieldColumns.filter((item) => item.key !== fieldKey),
      } : current);
      toast.success(`Đã ẩn cột “${field.label}”.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể ẩn cột tùy chỉnh.');
    }
  };

  const customFieldColumns = data?.customFieldColumns || [];
  const tableColumnCount = 9 + customFieldColumns.length;
  const proposalColumnSpan = 8 + customFieldColumns.length;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
                <h3 className="text-sm font-extrabold text-slate-800">Bảng brief sản xuất ảnh, video theo bài viết</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
              Mỗi bài viết có một dòng Order. AI tự chọn Ảnh hoặc Video và điền thẳng nội dung; cột Phục vụ hiện cố định cho Facebook.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadOrders()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
            <button
              type="button"
              onClick={() => void fillAllRows()}
              disabled={loading || fillAllInProgress || !plannedOrders.length}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {fillAllInProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
              {fillAllInProgress ? `AI ${fillAllJob?.completedItems || 0}/${fillAllJob?.totalItems || plannedOrders.length}` : `AI điền toàn bộ (${plannedOrders.length})`}
            </button>
            <button
              type="button"
              onClick={() => setShowAddCustomField((current) => !current)}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm cột
            </button>
            {fillAllInProgress && (
              <button
                type="button"
                onClick={() => void cancelFillAllRows()}
                className="inline-flex h-9 items-center rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50"
              >
                Hủy AI
              </button>
            )}
          </div>
        </div>

        {showAddCustomField && (
          <form
            className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-teal-50/60 px-5 py-3"
            onSubmit={(event) => { event.preventDefault(); void addCustomField(); }}
          >
            <label className="text-xs font-bold text-teal-900">Tên cột mới</label>
            <input
              autoFocus
              value={customFieldLabel}
              onChange={(event) => setCustomFieldLabel(event.target.value)}
              maxLength={120}
              placeholder="Ví dụ: Mã SKU, ưu đãi, lưu ý thiết kế"
              className="h-9 min-w-64 flex-1 rounded-lg border border-teal-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-teal-500"
            />
            <button type="submit" disabled={!customFieldLabel.trim() || addingCustomField} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
              {addingCustomField && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Thêm
            </button>
            <button type="button" onClick={() => { setShowAddCustomField(false); setCustomFieldLabel(''); }} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600 hover:bg-white">Hủy</button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-[1540px] w-full border-collapse text-left text-xs">
            <thead className="bg-emerald-50 text-emerald-950">
              <tr className="border-b border-emerald-100">
                <th className="w-12 px-3 py-3 text-center font-extrabold">STT</th>
                <th className="min-w-44 px-3 py-3 font-extrabold">Nhóm nội dung</th>
                <th className="min-w-60 px-3 py-3 font-extrabold">Nội dung cần quay/chụp</th>
                <th className="min-w-80 px-3 py-3 font-extrabold">Chi tiết yêu cầu</th>
                <th className="w-32 px-3 py-3 font-extrabold">Định dạng</th>
                <th className="min-w-32 px-3 py-3 font-extrabold">SL đề xuất</th>
                <th className="min-w-80 px-3 py-3 font-extrabold">Nội dung AI tạo</th>
                {customFieldColumns.map((field) => (
                  <th key={field.key} className="min-w-44 px-3 py-3 font-extrabold">
                    <span className="inline-flex items-center gap-1.5">
                      {field.label}
                      <button type="button" onClick={() => void archiveCustomField(field.key)} title={`Ẩn cột ${field.label}`} className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100 hover:text-rose-600">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </th>
                ))}
                <th className="w-28 px-3 py-3 font-extrabold">Phục vụ</th>
                <th className="w-44 px-3 py-3 font-extrabold">AI & thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={tableColumnCount} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-teal-600" />Đang tải bảng Order…</td></tr>
              )}
              {!loading && !plannedOrders.length && (
                <tr><td colSpan={tableColumnCount} className="px-4 py-12 text-center text-slate-500">Chưa có bài viết trong chiến dịch để tạo Order.</td></tr>
              )}
              {!loading && plannedOrders.map((order, index) => {
                const readOnly = ['completed', 'cancelled'].includes(order.status);
                const proposal = order.aiProposal && !order.aiProposal.appliedAt ? order.aiProposal : undefined;
                return (
                  <Fragment key={order._id}>
                    <tr className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                      <td className="px-3 py-3 text-center font-bold text-slate-400">{index + 1}</td>
                      <td className="px-2 py-2">
                        <textarea
                          value={order.contentGroup || order.title || ''}
                          onChange={(event) => changeLocal(order._id, 'contentGroup', event.target.value)}
                          onBlur={() => void saveCell(order, 'contentGroup')}
                          disabled={readOnly || isSaving(order._id)}
                          rows={2}
                          placeholder="Ví dụ: Nhận diện thương hiệu"
                          className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-semibold text-slate-800 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <textarea
                          value={order.shootingContent || order.visualBrief || order.headline || ''}
                          onChange={(event) => changeLocal(order._id, 'shootingContent', event.target.value)}
                          onBlur={() => void saveCell(order, 'shootingContent')}
                          disabled={readOnly || isSaving(order._id)}
                          rows={3}
                          placeholder="Logo, bảng hiệu, không gian, thao tác…"
                          className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <textarea
                          value={order.productionRequirements || order.visualBrief || ''}
                          onChange={(event) => changeLocal(order._id, 'productionRequirements', event.target.value)}
                          onBlur={() => void saveCell(order, 'productionRequirements')}
                          disabled={readOnly || isSaving(order._id)}
                          rows={3}
                          placeholder="Góc chụp, bố cục, chi tiết cần nhấn mạnh…"
                          className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="relative">
                          <select
                            value={order.format}
                            onChange={(event) => changeLocal(order._id, 'format', event.target.value as CampaignAssetOrderFormat)}
                            onBlur={() => void saveCell(order, 'format')}
                            disabled={readOnly || isSaving(order._id)}
                            className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2 pr-7 font-semibold text-slate-700 outline-none focus:border-teal-400 disabled:cursor-not-allowed"
                          >
                            {Object.entries(FORMAT_LABEL)
                              .filter(([value]) => value !== 'image_video')
                              .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <textarea
                          value={order.quantitySuggestion || ''}
                          onChange={(event) => changeLocal(order._id, 'quantitySuggestion', event.target.value)}
                          onBlur={() => void saveCell(order, 'quantitySuggestion')}
                          disabled={readOnly || isSaving(order._id)}
                          rows={2}
                          placeholder="Ví dụ: 20 ảnh + 3 video"
                          className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {order.format === 'video' ? (
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Kịch bản video</span>
                            <textarea
                              value={order.videoScript || ''}
                              onChange={(event) => changeLocal(order._id, 'videoScript', event.target.value)}
                              onBlur={() => void saveCell(order, 'videoScript')}
                              disabled={readOnly || isSaving(order._id)}
                              rows={5}
                              placeholder="Mở cảnh, nội dung, lời thoại/voice-over và CTA…"
                              className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                            />
                          </label>
                        ) : (
                          <div className="space-y-1.5">
                            <input
                              value={order.headline || ''}
                              onChange={(event) => changeLocal(order._id, 'headline', event.target.value)}
                              onBlur={() => void saveCell(order, 'headline')}
                              disabled={readOnly || isSaving(order._id)}
                              placeholder="Tiêu đề ảnh"
                              className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-xs font-bold text-slate-800 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                            />
                            <textarea
                              value={order.subheadline || ''}
                              onChange={(event) => changeLocal(order._id, 'subheadline', event.target.value)}
                              onBlur={() => void saveCell(order, 'subheadline')}
                              disabled={readOnly || isSaving(order._id)}
                              rows={2}
                              placeholder="Caption Facebook"
                              className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                            />
                            <textarea
                              value={order.visualBrief || ''}
                              onChange={(event) => changeLocal(order._id, 'visualBrief', event.target.value)}
                              onBlur={() => void saveCell(order, 'visualBrief')}
                              disabled={readOnly || isSaving(order._id)}
                              rows={3}
                              placeholder="Mô tả ảnh"
                              className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                            />
                          </div>
                        )}
                      </td>
                      {customFieldColumns.map((field) => (
                        <td key={field.key} className="px-2 py-2">
                          <textarea
                            value={order.customFields?.[field.key] || ''}
                            onChange={(event) => changeCustomFieldLocal(order._id, field.key, event.target.value)}
                            onBlur={() => void saveCustomField(order, field.key)}
                            disabled={readOnly || isSaving(order._id)}
                            rows={2}
                            maxLength={500}
                            placeholder={field.label}
                            className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-slate-700 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:bg-white disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-3"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-700">Facebook</span></td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void generateProposal(order)}
                            disabled={readOnly || isGenerating(order._id) || isApplying(order._id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md bg-violet-600 px-2 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {isGenerating(order._id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />} AI điền dòng
                          </button>
                        </div>
                        {isSaving(order._id) && <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700"><Loader2 className="h-3 w-3 animate-spin" />Đang lưu</span>}
                      </td>
                    </tr>
                    {proposal && (
                      <tr className="border-b border-violet-100 bg-violet-50/70">
                        <td colSpan={proposalColumnSpan} className="px-4 py-3">
                          <p className="font-bold text-violet-900">Đề xuất AI chưa áp dụng</p>
                          <div className="mt-1 grid gap-x-5 gap-y-1 text-[11px] leading-5 text-violet-900 md:grid-cols-2 xl:grid-cols-4">
                            <span><b>Nhóm:</b> {proposal.contentGroup || '—'}</span>
                            <span><b>Quay/chụp:</b> {proposal.shootingContent || '—'}</span>
                            <span><b>Yêu cầu:</b> {proposal.productionRequirements || '—'}</span>
                            <span><b>Số lượng:</b> {proposal.quantitySuggestion || '—'}</span>
                          </div>
                          {proposal.warnings.length > 0 && <p className="mt-1 text-[11px] text-amber-700">{proposal.warnings.join(' · ')}</p>}
                        </td>
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={() => void applyProposal(order)}
                            disabled={readOnly || isApplying(order._id) || isGenerating(order._id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-violet-200 bg-white px-2 text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                          >
                            {isApplying(order._id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Duyệt AI
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-extrabold text-slate-700">Nguồn ảnh, video & Bulk Create</h4>
            <p className="mt-1 text-xs text-slate-500">Mở phần chi tiết để gắn asset nguồn; Bulk Create có thể nhập toàn bộ Order ảnh từ chiến dịch.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <Settings2 className="h-3.5 w-3.5" /> {showAdvanced ? 'Ẩn chi tiết' : 'Mở chi tiết'}
          </button>
        </div>
        {showAdvanced && <div className="mt-4 border-t border-slate-200 pt-4"><CampaignAssetOrders campaignId={campaignId} /></div>}
      </section>
    </div>
  );
}
