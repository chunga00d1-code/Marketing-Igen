import React, { useState } from 'react';
import {
  Check,
  X,
  Bot,
  Loader2,
  ArrowRight,
  Video,
  Image,
  AlertTriangle,
} from 'lucide-react';
import {
  type CampaignAssetOrder,
  marketingCampaignService,
} from '../../services/marketingCampaignService';
import { toast } from '../../pages/Toast';

interface AssetOrderAIPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: CampaignAssetOrder[];
  customFieldColumns: Array<{ key: string; label: string }>;
  campaignId: string;
  onApplied: (appliedOrders: CampaignAssetOrder[]) => void;
  onDismissed: (orderIds: string[]) => void;
}

const FIELD_LABELS: Record<string, string> = {
  contentGroup: 'Nhóm nội dung',
  shootingContent: 'Nội dung quay/chụp',
  productionRequirements: 'Chi tiết yêu cầu',
  quantitySuggestion: 'SL đề xuất',
  format: 'Định dạng',
  headline: 'Tiêu đề ảnh',
  subheadline: 'Caption Facebook',
  visualBrief: 'Mô tả ảnh',
  videoScript: 'Kịch bản video',
};

export default function AssetOrderAIPreviewModal({
  isOpen,
  onClose,
  orders,
  customFieldColumns,
  campaignId,
  onApplied,
  onDismissed,
}: AssetOrderAIPreviewModalProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    orders[0]?._id || ''
  );
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState<'apply' | 'dismiss' | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(20);

  React.useEffect(() => {
    setVisibleCount(20);
  }, [orders.length]);

  const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
      setVisibleCount((prev) => Math.min(prev + 20, orders.length));
    }
  };

  if (!isOpen || !orders.length) return null;

  // Sync selection if the orders list changes and the selected order is no longer in the list
  const currentOrdersMap = new Map(orders.map((o) => [o._id, o]));
  const activeOrder = currentOrdersMap.get(selectedOrderId) || orders[0];
  const activeOrderId = activeOrder._id;

  const isApplying = (id: string) => processingIds.includes(`${id}:apply`);
  const isDismissing = (id: string) => processingIds.includes(`${id}:dismiss`);

  // Build the comparison fields list for the active order
  const getFieldComparison = (order: CampaignAssetOrder) => {
    const proposal = order.aiProposal;
    if (!proposal) return [];

    const fieldsList: Array<{
      key: string;
      label: string;
      currentValue: string;
      proposedValue: string;
      status: 'new' | 'modified' | 'unchanged';
    }> = [];

    const compareField = (key: string, label: string) => {
      let currentVal = '';
      let proposedVal = '';

      if (key === 'format') {
        currentVal = order.format === 'video' ? 'Video' : 'Ảnh';
        proposedVal = proposal.format === 'video' ? 'Video' : 'Ảnh';
      } else {
        currentVal = String(order[key as keyof CampaignAssetOrder] || '').trim();
        proposedVal = String(proposal[key as keyof typeof proposal] || '').trim();
      }

      if (!proposedVal && key === 'videoScript') return;
      if (!proposedVal && !currentVal) return;

      const status = !currentVal
        ? 'new'
        : currentVal !== proposedVal
        ? 'modified'
        : 'unchanged';

      fieldsList.push({
        key,
        label,
        currentValue: currentVal || '—',
        proposedValue: proposedVal || '—',
        status,
      });
    };

    // Standard fields
    compareField('contentGroup', FIELD_LABELS.contentGroup);
    compareField('shootingContent', FIELD_LABELS.shootingContent);
    compareField('productionRequirements', FIELD_LABELS.productionRequirements);
    compareField('quantitySuggestion', FIELD_LABELS.quantitySuggestion);
    compareField('format', FIELD_LABELS.format);
    
    if (proposal.format === 'video') {
      compareField('videoScript', FIELD_LABELS.videoScript);
    } else {
      compareField('headline', FIELD_LABELS.headline);
      compareField('subheadline', FIELD_LABELS.subheadline);
      compareField('visualBrief', FIELD_LABELS.visualBrief);
    }

    // Custom fields
    for (const field of customFieldColumns) {
      const currentVal = (order.customFields?.[field.key] || '').trim();
      const proposedVal = (proposal.customFields?.[field.key] || '').trim();

      if (!proposedVal && !currentVal) continue;

      const status = !currentVal
        ? 'new'
        : currentVal !== proposedVal
        ? 'modified'
        : 'unchanged';

      fieldsList.push({
        key: `customFields.${field.key}`,
        label: field.label,
        currentValue: currentVal || '—',
        proposedValue: proposedVal || '—',
        status,
      });
    };

    return fieldsList;
  };

  const fields = getFieldComparison(activeOrder);

  // Single Action handlers
  const handleApplySingle = async (order: CampaignAssetOrder) => {
    const actionKey = `${order._id}:apply`;
    setProcessingIds((curr) => [...curr, actionKey]);
    try {
      const fieldKeys: Parameters<typeof marketingCampaignService.applyAssetOrderAI>[2]['fieldKeys'] = [
        'contentGroup',
        'shootingContent',
        'productionRequirements',
        'quantitySuggestion',
        'format',
        'headline',
        'subheadline',
        'cta',
        'visualBrief',
        'videoScript',
        'customFields',
      ];
      const applied = await marketingCampaignService.applyAssetOrderAI(
        campaignId,
        order._id,
        {
          expectedRevision: order.revision,
          fieldKeys,
        }
      );
      toast.success(`Đã duyệt đề xuất cho dòng: ${order.title}`);
      onApplied([applied]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không thể áp dụng đề xuất AI.'
      );
    } finally {
      setProcessingIds((curr) => curr.filter((x) => x !== actionKey));
    }
  };

  const handleDismissSingle = async (order: CampaignAssetOrder) => {
    const actionKey = `${order._id}:dismiss`;
    setProcessingIds((curr) => [...curr, actionKey]);
    try {
      await marketingCampaignService.dismissAssetOrderAI(campaignId, order._id);
      toast.success(`Đã từ chối đề xuất cho dòng: ${order.title}`);
      onDismissed([order._id]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Không thể bỏ qua đề xuất AI.'
      );
    } finally {
      setProcessingIds((curr) => curr.filter((x) => x !== actionKey));
    }
  };

  // Bulk action handlers
  const handleApplyAll = async () => {
    setIsProcessingAll('apply');
    const appliedList: CampaignAssetOrder[] = [];
    const failedList: string[] = [];

    // Process them sequentially to ensure revisions match and avoid parallel database conflicts
    for (const order of orders) {
      try {
        const fieldKeys: Parameters<typeof marketingCampaignService.applyAssetOrderAI>[2]['fieldKeys'] = [
          'contentGroup',
          'shootingContent',
          'productionRequirements',
          'quantitySuggestion',
          'format',
          'headline',
          'subheadline',
          'cta',
          'visualBrief',
          'videoScript',
          'customFields',
        ];
        const applied = await marketingCampaignService.applyAssetOrderAI(
          campaignId,
          order._id,
          {
            expectedRevision: order.revision,
            fieldKeys,
          }
        );
        appliedList.push(applied);
      } catch {
        failedList.push(order.title);
      }
    }

    if (appliedList.length > 0) {
      onApplied(appliedList);
      toast.success(`Đã duyệt thành công ${appliedList.length}/${orders.length} dòng.`);
    }
    if (failedList.length > 0) {
      toast.error(`Không thể duyệt các dòng: ${failedList.join(', ')}`);
    }
    setIsProcessingAll(null);
  };

  const handleDismissAll = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn từ chối toàn bộ ${orders.length} đề xuất AI này?`)) return;
    setIsProcessingAll('dismiss');
    const dismissedIds: string[] = [];
    const failedList: string[] = [];

    for (const order of orders) {
      try {
        await marketingCampaignService.dismissAssetOrderAI(campaignId, order._id);
        dismissedIds.push(order._id);
      } catch {
        failedList.push(order.title);
      }
    }

    if (dismissedIds.length > 0) {
      onDismissed(dismissedIds);
      toast.success(`Đã từ chối ${dismissedIds.length}/${orders.length} đề xuất.`);
    }
    if (failedList.length > 0) {
      toast.error(`Không thể hủy đề xuất của: ${failedList.join(', ')}`);
    }
    setIsProcessingAll(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-violet-100 p-2 text-violet-700">
              <Bot className="h-5 w-5 animate-pulse" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Xem trước & Phê duyệt Đề xuất AI
              </h3>
              <p className="text-xs text-slate-500">
                So sánh sự thay đổi của các ô dữ liệu trước khi quyết định lưu vào bảng sản xuất.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processingIds.length > 0 || isProcessingAll !== null}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar (Only visible when multiple orders are previewed) */}
          {orders.length > 1 && (
            <aside
              onScroll={handleSidebarScroll}
              className="w-80 border-r border-slate-100 overflow-y-auto bg-slate-50/30 p-4"
            >
              <h4 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Danh sách Order ({orders.length})
              </h4>
              <div className="space-y-1.5">
                {orders.slice(0, visibleCount).map((o) => {
                  const isActive = o._id === activeOrderId;
                  return (
                    <button
                      key={o._id}
                      type="button"
                      onClick={() => setSelectedOrderId(o._id)}
                      className={`w-full text-left rounded-xl p-3 text-xs transition-all border ${
                        isActive
                          ? 'bg-violet-50/80 border-violet-200 text-violet-900 font-semibold shadow-sm'
                          : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold">{o.title}</span>
                        {o.aiProposal?.format === 'video' ? (
                          <Video className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                        ) : (
                          <Image className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400 line-clamp-1">
                        {o.aiProposal?.contentGroup || 'Chưa phân nhóm'}
                      </p>
                    </button>
                  );
                })}
                {orders.length > visibleCount && (
                  <div className="py-2 text-center text-[10px] text-slate-450 font-semibold animate-pulse">
                    Cuộn xuống để tải thêm...
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Main Comparison Area */}
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đang xem dòng</span>
                <h4 className="text-sm font-extrabold text-slate-800">{activeOrder.title}</h4>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleDismissSingle(activeOrder)}
                  disabled={processingIds.length > 0 || isProcessingAll !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  {isDismissing(activeOrderId) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Từ chối dòng này
                </button>
                <button
                  type="button"
                  onClick={() => void handleApplySingle(activeOrder)}
                  disabled={processingIds.length > 0 || isProcessingAll !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {isApplying(activeOrderId) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Đồng ý dòng này
                </button>
              </div>
            </div>

            {/* Warnings if any */}
            {activeOrder.aiProposal?.warnings && activeOrder.aiProposal.warnings.length > 0 && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <span className="font-bold">Lưu ý của AI:</span>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {activeOrder.aiProposal.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Comparison Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm bg-white">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 text-left w-48">Trường thông tin</th>
                    <th className="px-4 py-3 text-left">Giá trị hiện tại</th>
                    <th className="w-10 px-0 py-3 text-center"></th>
                    <th className="px-4 py-3 text-left bg-violet-50/20">Đề xuất từ AI</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    let highlightClass = '';
                    let statusLabel = '';

                    if (field.status === 'new') {
                      highlightClass = 'bg-emerald-50 text-emerald-950 font-medium';
                      statusLabel = 'Điền mới';
                    } else if (field.status === 'modified') {
                      highlightClass = 'bg-amber-50 text-amber-950 font-medium';
                      statusLabel = 'Thay đổi';
                    } else {
                      highlightClass = 'text-slate-500';
                    }

                    return (
                      <tr key={field.key} className="border-b border-slate-100 hover:bg-slate-50/30 align-top">
                        <td className="px-4 py-3.5 font-bold text-slate-700 whitespace-nowrap">{field.label}</td>
                        <td className="px-4 py-3.5 text-slate-500 whitespace-pre-wrap leading-relaxed">{field.currentValue}</td>
                        <td className="px-0 py-3.5 text-center text-slate-300">
                          {field.status !== 'unchanged' && <ArrowRight className="h-4 w-4 inline" />}
                        </td>
                        <td className={`px-4 py-3.5 whitespace-pre-wrap leading-relaxed transition-colors ${highlightClass}`}>
                          <div className="flex items-start justify-between gap-3">
                            <span>{field.proposedValue}</span>
                            {statusLabel && (
                              <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                field.status === 'new' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </main>
        </div>

        {/* Modal Footer */}
        {orders.length > 1 && (
          <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
            <div className="text-xs text-slate-500">
              Bạn đang xem danh sách <span className="font-bold text-slate-800">{orders.length}</span> đề xuất cần duyệt.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDismissAll}
                disabled={processingIds.length > 0 || isProcessingAll !== null}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {isProcessingAll === 'dismiss' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Từ chối tất cả ({orders.length})
              </button>
              <button
                type="button"
                onClick={handleApplyAll}
                disabled={processingIds.length > 0 || isProcessingAll !== null}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {isProcessingAll === 'apply' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Đồng ý tất cả ({orders.length})
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
