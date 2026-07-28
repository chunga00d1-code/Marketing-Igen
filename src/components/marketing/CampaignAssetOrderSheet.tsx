import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  type CampaignAssetOrder,
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
  | 'quantitySuggestion';

const plannerFields: PlannerField[] = [
  'contentGroup',
  'shootingContent',
  'productionRequirements',
  'quantitySuggestion',
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
  const [creating, setCreating] = useState(false);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [aiIds, setAiIds] = useState<string[]>([]);
  const [applyingIds, setApplyingIds] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const createRow = async () => {
    setCreating(true);
    try {
      const created = await marketingCampaignService.createAssetOrder(campaignId, {
        title: 'Nhóm nội dung mới',
        contentGroup: '',
        shootingContent: '',
        productionRequirements: '',
        quantitySuggestion: '',
        usageChannels: 'Facebook',
        format: 'image',
        aspectRatio: '4:5',
      });
      setData((current) => current ? { ...current, orders: [...current.orders, created] } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể thêm dòng Order.');
    } finally {
      setCreating(false);
    }
  };

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

  const removeRow = async (order: CampaignAssetOrder) => {
    if (!window.confirm(`Hủy dòng “${order.contentGroup || order.title || 'chưa đặt tên'}”?`)) return;
    try {
      await marketingCampaignService.archiveAssetOrder(campaignId, order._id);
      setData((current) => current ? {
        ...current,
        orders: current.orders.filter((item) => item._id !== order._id),
      } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hủy Order.');
    }
  };

  const generateProposal = async (order: CampaignAssetOrder) => {
    setAiIds((current) => [...current, order._id]);
    try {
      const proposed = await marketingCampaignService.previewAssetOrderAI(campaignId, order._id, {
        idempotencyKey: createIdempotencyKey(),
      });
      setData((current) => updateOrderInData(current, proposed));
      toast.success('AI đã tạo đề xuất. Hãy kiểm tra trước khi áp dụng.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI chưa thể tạo mô tả sản xuất.');
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

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">Bảng brief sản xuất ảnh, video</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Mỗi dòng là một hạng mục quay/chụp. AI chỉ đưa đề xuất để bạn duyệt; cột Phục vụ hiện cố định cho Facebook.
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
              onClick={() => void createRow()}
              disabled={creating}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Thêm dòng
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1230px] w-full border-collapse text-left text-xs">
            <thead className="bg-emerald-50 text-emerald-950">
              <tr className="border-b border-emerald-100">
                <th className="w-12 px-3 py-3 text-center font-extrabold">STT</th>
                <th className="min-w-44 px-3 py-3 font-extrabold">Nhóm nội dung</th>
                <th className="min-w-60 px-3 py-3 font-extrabold">Nội dung cần quay/chụp</th>
                <th className="min-w-80 px-3 py-3 font-extrabold">Chi tiết yêu cầu</th>
                <th className="w-32 px-3 py-3 font-extrabold">Định dạng</th>
                <th className="min-w-32 px-3 py-3 font-extrabold">SL đề xuất</th>
                <th className="w-28 px-3 py-3 font-extrabold">Phục vụ</th>
                <th className="w-44 px-3 py-3 font-extrabold">AI & thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-teal-600" />Đang tải bảng Order…</td></tr>
              )}
              {!loading && !data?.orders.length && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">Chưa có dòng nào. Thêm một dòng hoặc dùng AI để tạo mô tả cho từng hạng mục.</td></tr>
              )}
              {!loading && data?.orders.map((order, index) => {
                const readOnly = ['completed', 'cancelled'].includes(order.status);
                const proposal = order.aiProposal;
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
                            {Object.entries(FORMAT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                      <td className="px-3 py-3"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-700">Facebook</span></td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void generateProposal(order)}
                            disabled={readOnly || isGenerating(order._id) || isApplying(order._id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md bg-violet-600 px-2 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {isGenerating(order._id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />} AI gợi ý
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeRow(order)}
                            disabled={readOnly}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 px-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            title="Hủy dòng"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isSaving(order._id) && <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700"><Loader2 className="h-3 w-3 animate-spin" />Đang lưu</span>}
                      </td>
                    </tr>
                    {proposal && (
                      <tr className="border-b border-violet-100 bg-violet-50/70">
                        <td colSpan={7} className="px-4 py-3">
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
            <p className="mt-1 text-xs text-slate-500">Mở phần chi tiết khi cần gắn asset nguồn, lấy Drive/Excel hoặc chạy Bulk Create cho từng dòng.</p>
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
