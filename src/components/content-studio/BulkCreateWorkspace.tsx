import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  WandSparkles,
} from 'lucide-react';
import {
  bulkCreateService,
  type BulkAsset,
  type BulkAiHistoryMessage,
  type BulkAiScene,
  type BulkAiSceneResult,
  type BulkDataColumn,
  type BulkImportedRow,
  type BulkRenderItem,
  type BulkRenderJob,
  type BulkTemplate,
  type BulkTemplatePayload,
  type CanvaConnectionStatus,
  type CanvaDesign,
} from '../../services/bulkCreateService';
import { marketingCampaignService, type CampaignAssetOrderData, type MarketingCampaignSummary } from '../../services/marketingCampaignService';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import type { UserProfile } from '../../types';
import { toast } from '../../pages/Toast';
import { BRAND_LOGO_PATH, BRAND_NAME } from '../../config/brand';
import type { EditorTool, LayerPresetDragPayload, LayerType, TemplateLayer, DataRow, EditorSnapshot, SelectionBox, PageRenderState } from './bulk-create/types';
import { BACKGROUNDS, TOOLS } from './bulk-create/constants';
import { EditorPanel } from './bulk-create/EditorPanel';
import { clamp } from './bulk-create/utils';
import { PropertiesToolbar } from './bulk-create/PropertiesToolbar';
import { PageStrip } from './bulk-create/PageStrip';
import { EditorCanvas } from './bulk-create/EditorCanvas';
import { ContextMenu } from './bulk-create/ContextMenu';
import {
  BULK_MARKETING_PRESETS,
  type BulkMarketingPreset,
} from './bulk-create/systemTemplates';
import {
  BULK_SCENE_VERSION,
  type BulkSceneDocument,
} from './bulk-create/SceneCanvas';
import { BulkAiPanel } from './bulk-create/BulkAiPanel';
import { useCanvasInteractions } from './bulk-create/useCanvasInteractions';
import { useBulkKeyboardShortcuts } from './bulk-create/useBulkKeyboardShortcuts';
import { useBulkPageActions } from './bulk-create/useBulkPageActions';
import { BulkWorkspaceHeader } from './bulk-create/BulkWorkspaceHeader';
import { BulkWorkspaceStatus } from './bulk-create/BulkWorkspaceStatus';
import {
  CampaignSetupDialog,
  type CampaignSetupStep,
} from './bulk-create/CampaignSetupDialog';
import {
  createRow,
  createTemplateLayer,
  closeBulkWorkspace,
  makeId,
  mapWithConcurrency,
  matchLayersToColumns,
  matrixToDataSet,
  normalizeLayerBounds,
  optimizeLayersForReadability,
  readFileAsDataUrl,
  waitForDerivedImage,
} from './bulk-create/workspace-utils';

interface BulkCreateWorkspaceProps {
  onClose?: () => void;
  cardId?: string;
  initialCampaignId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
}
type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
const CAMPAIGN_BULK_WRITABLE_SLOT_STATUSES = new Set([
  'planned', 'queued', 'generating', 'researching', 'writing', 'scoring',
  'awaiting_assets', 'retrying', 'needs_attention', 'failed',
]);

type PdfJsPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<{ getPage: (pageNumber: number) => Promise<PdfJsPage> }> };
};

function loadPdfJs() {
  const browserWindow = window as Window & typeof globalThis & { pdfjsLib?: PdfJs };
  if (browserWindow.pdfjsLib) return Promise.resolve(browserWindow.pdfjsLib);

  return new Promise<PdfJs>((resolve, reject) => {
    const existing = document.getElementById('igen-pdfjs-script') as HTMLScriptElement | null;
    const complete = () => {
      if (browserWindow.pdfjsLib) resolve(browserWindow.pdfjsLib);
      else reject(new Error('Không thể tải công cụ đọc PDF.'));
    };
    if (existing) {
      existing.addEventListener('load', complete, { once: true });
      existing.addEventListener('error', () => reject(new Error('Không thể tải công cụ đọc PDF.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'igen-pdfjs-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.async = true;
    script.onload = complete;
    script.onerror = () => reject(new Error('Không thể tải công cụ đọc PDF.'));
    document.head.appendChild(script);
  });
}

async function rasterizeFirstPdfPage(file: File) {
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 1_800 / Math.max(initialViewport.width, initialViewport.height));
  const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không thể tạo preview PDF.');
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.9);
}

function imageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Không thể đọc kích thước ảnh mẫu.'));
    image.src = dataUrl;
  });
}

function importedTemplateName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Mẫu đã nhập';
}

export function BulkCreateWorkspace({ onClose, initialCampaignId }: BulkCreateWorkspaceProps = {}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorViewportRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  const [activeTool, setActiveTool] = useState<EditorTool>('background');
  const [aiHtmlMode, setAiHtmlMode] = useState(false);
  const [aiHistory, setAiHistory] = useState<BulkAiHistoryMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backgroundId, setBackgroundId] = useState('blank');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [backgroundSelected, setBackgroundSelected] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1080, height: 1080 });
  const [layers, setLayers] = useState<TemplateLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [editingLayerId, setEditingLayerId] = useState('');
  const [rows, setRows] = useState<DataRow[]>([createRow([])]);
  const [activeRowId, setActiveRowId] = useState(rows[0].id);
  const [sheetInput, setSheetInput] = useState('');
  const [dataColumns, setDataColumns] = useState<BulkDataColumn[]>([]);
  const [dataStep, setDataStep] = useState<1 | 2 | 3>(1);
  const [dataSourceName, setDataSourceName] = useState('');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [campaigns, setCampaigns] = useState<MarketingCampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignContext, setCampaignContext] = useState<CampaignAssetOrderData | null>(null);
  const [bulkTarget, setBulkTarget] = useState<'standalone' | 'campaign'>('standalone');
  const [campaignSetupOpen, setCampaignSetupOpen] = useState(true);
  const [campaignSetupStep, setCampaignSetupStep] = useState<CampaignSetupStep>('target');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignDataSource, setCampaignDataSource] = useState<'manual' | 'campaign_orders' | 'sheet'>('manual');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingCampaignOrders, setLoadingCampaignOrders] = useState(false);
  const [campaignOrderImportId, setCampaignOrderImportId] = useState('');
  const [templateName, setTemplateName] = useState('Thiết kế chưa đặt tên');
  const [savedTemplateId, setSavedTemplateId] = useState('');
  const savedTemplateIdRef = useRef('');
  const aiHistoryStorageReadyRef = useRef(false);
  const aiHistoryStorageKey = `igen-bulk-ai-history:${savedTemplateId || templateName}`;
  const selectedCampaign = campaigns.find((campaign) => campaign._id === selectedCampaignId);
  const matchingCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLocaleLowerCase('vi-VN');
    if (!query) return campaigns;
    return campaigns.filter((campaign) => campaign.title.toLocaleLowerCase('vi-VN').includes(query));
  }, [campaignSearch, campaigns]);
  const availableCampaignSlotCount = campaignContext?.slots.filter((slot) => (
    slot.platform === 'Facebook'
    && !['video', 'human-video'].includes(slot.mediaType)
    && CAMPAIGN_BULK_WRITABLE_SLOT_STATUSES.has(slot.status)
  )).length || 0;
  useEffect(() => {
    aiHistoryStorageReadyRef.current = false;
    try {
      const stored = window.localStorage.getItem(aiHistoryStorageKey);
      const parsed = stored ? JSON.parse(stored) as BulkAiHistoryMessage[] : [];
      setAiHistory(Array.isArray(parsed) ? parsed.slice(-20) : []);
    } catch {
      setAiHistory([]);
    } finally {
      aiHistoryStorageReadyRef.current = true;
    }
  }, [aiHistoryStorageKey]);
  useEffect(() => {
    if (!aiHistoryStorageReadyRef.current) return;
    try {
      window.localStorage.setItem(
        aiHistoryStorageKey,
        JSON.stringify(aiHistory.slice(-20)),
      );
    } catch {
      // Local history is best effort only.
    }
  }, [aiHistory, aiHistoryStorageKey]);
  const persistRequestRef = useRef<Promise<BulkTemplate> | null>(null);
  const generationInFlightRef = useRef(false);
  const autoSaveVersionRef = useRef(0);
  const designSessionRef = useRef(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [templates, setTemplates] = useState<BulkTemplate[]>([]);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatesHasMore, setTemplatesHasMore] = useState(false);
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const loadingTemplatesRef = useRef(false);
  const [communityTemplates, setCommunityTemplates] = useState<BulkTemplate[]>([]);
  const [jobs, setJobs] = useState<BulkRenderJob[]>([]);
  const [activeJob, setActiveJob] = useState<BulkRenderJob | null>(null);
  const [jobItems, setJobItems] = useState<BulkRenderItem[]>([]);
  const [pagesCreated, setPagesCreated] = useState(false);
  const [pageResults, setPageResults] = useState<Record<string, PageRenderState>>({});
  const [activeJobPageIds, setActiveJobPageIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [assetUploadProgress, setAssetUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoomPercent, setZoomPercent] = useState(50);
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; targetLayerId?: string } | null>(null);
  const copiedLayerRef = useRef<TemplateLayer | null>(null);
  const [uploadedImages, setUploadedImages] = useState<BulkAsset[]>([]);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [canvaStatus, setCanvaStatus] = useState<CanvaConnectionStatus>({ connected: false });
  const [canvaDesigns, setCanvaDesigns] = useState<CanvaDesign[]>([]);
  const [loadingCanva, setLoadingCanva] = useState(true);
  const [canvaError, setCanvaError] = useState('');
  const [removingBackground, setRemovingBackground] = useState(false);
  const { user } = useAuth();
  const [companyMembers, setCompanyMembers] = useState<UserProfile[]>([]);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  useEffect(() => {
    if (user?.companyCode) {
      authService.getUsersByCompany(user.companyCode)
        .then(setCompanyMembers)
        .catch((error) => console.error('Lỗi khi tải thành viên công ty:', error));
    }
  }, [user?.companyCode]);
  const selectedBackground = BACKGROUNDS.find((background) => background.id === backgroundId);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
  const selectedLayers = useMemo(
    () => layers.filter((layer) => selectedLayerIds.includes(layer.id)),
    [layers, selectedLayerIds]
  );
  const activeRow = rows.find((row) => row.id === activeRowId) || rows[0];
  const getRowIssue = useCallback(
    (row: DataRow) => {
      if (row.selected === false) return 'Trang này đang bị bỏ chọn.';
      if (layers.length === 0) return 'Thiết kế chưa có trường nội dung.';
      const missingLayers = layers.filter((layer) => {
        if (layer.layerKind === 'shape') return false;
        const val = row.values[layer.id] ?? row.values[layer.fieldName] ?? layer.defaultValue;
        return !val?.trim();
      });
      if (missingLayers.length === 0) return null;
      return `Thiếu dữ liệu: ${missingLayers.map((layer) => layer.fieldName).join(', ')}`;
    },
    [layers]
  );
  const isRowReady = useCallback(
    (row: DataRow) => getRowIssue(row) === null,
    [getRowIssue]
  );
  const readyCount = useMemo(
    () => rows.filter(isRowReady).length,
    [isRowReady, rows]
  );
  const visiblePages = useMemo(() => {
    if (!pagesCreated) return activeRow ? [activeRow] : [];
    const selectedRows = rows.filter((row) => row.selected !== false);
    return selectedRows.length > 0 ? selectedRows : rows.slice(0, 1);
  }, [activeRow, pagesCreated, rows]);
  const editorScene = useMemo<BulkSceneDocument>(() => ({
    sceneVersion: BULK_SCENE_VERSION,
    canvas: canvasSize,
    background: backgroundImage
      ? { type: 'image', imageUrl: backgroundImage }
      : backgroundId === 'blank'
        ? { type: 'color', color: backgroundColor }
        : {
            type: 'gradient',
            colors: selectedBackground?.colors || ['#ffffff', '#ffffff'],
          },
    layers,
  }), [
    backgroundColor,
    backgroundId,
    backgroundImage,
    canvasSize,
    layers,
    selectedBackground?.colors,
  ]);
  const fitZoomPercent = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) return 50;
    const horizontalPadding = viewportSize.width < 720 ? 48 : 96;
    const availableWidth = Math.max(160, viewportSize.width - horizontalPadding);
    const availableHeight = Math.max(160, viewportSize.height - 96);
    return clamp(Math.floor(Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height) * 100), 10, 100);
  }, [canvasSize.height, canvasSize.width, viewportSize.height, viewportSize.width]);
  const canvasDisplayWidth = canvasSize.width * zoomPercent / 100;
  const canvasDisplayHeight = canvasSize.height * zoomPercent / 100;

  const selectLayer = useCallback((layerId: string) => {
    setSelectedLayerId(layerId);
    setSelectedLayerIds(layerId ? [layerId] : []);
  }, []);

  const clearLayerSelection = useCallback(() => {
    setSelectedLayerId('');
    setSelectedLayerIds([]);
  }, []);

  const refreshLibrary = useCallback(async () => {
    loadingTemplatesRef.current = true;
    setLoadingTemplates(true);
    try {
      const [templateResult, communityList, jobList, assetList] = await Promise.all([
        bulkCreateService.listTemplatesPage(1, 6),
        bulkCreateService.listCommunityTemplates(),
        bulkCreateService.listJobs(),
        bulkCreateService.listAssets(),
      ]);
      setTemplates(templateResult.items);
      setTemplatePage(templateResult.page);
      setTemplatesHasMore(templateResult.hasMore);
      setTemplatesTotal(templateResult.total);
      setCommunityTemplates(communityList);
      setJobs(jobList);
      setUploadedImages(assetList);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      loadingTemplatesRef.current = false;
      setLoadingTemplates(false);
    }
  }, []);
  const goToTemplatePage = useCallback(async (page: number) => {
    if (loadingTemplatesRef.current) return;
    loadingTemplatesRef.current = true;
    setLoadingTemplates(true);
    try {
      const result = await bulkCreateService.listTemplatesPage(page, 6);
      setTemplates(result.items);
      setTemplatePage(result.page);
      setTemplatesHasMore(result.hasMore);
      setTemplatesTotal(result.total);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      loadingTemplatesRef.current = false;
      setLoadingTemplates(false);
    }
  }, []);
  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);
  const loadMoreTemplates = useCallback(async () => {
    if (loadingTemplatesRef.current || !templatesHasMore) return;
    loadingTemplatesRef.current = true;
    setLoadingTemplates(true);
    try {
      const result = await bulkCreateService.listTemplatesPage(templatePage + 1, 6);
      setTemplates((current) => {
        const existingIds = new Set(current.map((template) => template._id));
        return [
          ...current,
          ...result.items.filter((template) => !existingIds.has(template._id)),
        ];
      });
      setTemplatePage(result.page);
      setTemplatesHasMore(result.hasMore);
      setTemplatesTotal(result.total);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      loadingTemplatesRef.current = false;
      setLoadingTemplates(false);
    }
  }, [templatePage, templatesHasMore]);
  const syncPageResults = useCallback((
    items: BulkRenderItem[],
    pageIds: string[]
  ) => {
    if (pageIds.length === 0) return;
    setPageResults((current) => {
      const next = { ...current };
      items.forEach((item) => {
        const pageId = pageIds[item.rowIndex];
        if (!pageId) return;
        next[pageId] = {
          status: item.status,
          outputUrl: item.outputUrl,
          errorMessage: item.errorMessage,
        };
      });
      return next;
    });
  }, []);
  const polledJobId = activeJob?._id;
  const polledJobStatus = activeJob?.status;
  useEffect(() => {
    if (!polledJobId || !polledJobStatus || !['queued', 'processing'].includes(polledJobStatus)) {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const jobId = polledJobId;

    const poll = async () => {
      try {
        const [job, items] = await Promise.all([
          bulkCreateService.getJob(jobId),
          bulkCreateService.listItems(jobId),
        ]);
        if (cancelled) return;
        setActiveJob(job);
        setJobItems(items);
        syncPageResults(items, activeJobPageIds);
        setJobs((current) => [job, ...current.filter((item) => item._id !== job._id)]);
        if (!['queued', 'processing'].includes(job.status)) {
          if (job.status === 'completed') {
            toast.success(`Đã tạo xong ${job.completedItems} ảnh.`);
            if (campaignOrderImportId) {
              toast.info('Mở Campaign, chọn Bulk Create để xem trước và gắn ảnh vào bài viết.');
            }
          } else if (job.status === 'partial') {
            toast.error(
              `Đã tạo ${job.completedItems} ảnh, ${job.failedItems} ảnh bị lỗi.`
            );
            if (campaignOrderImportId) {
              toast.info('Mở Campaign, chọn Bulk Create để xem trước các ảnh đã tạo và gắn vào bài viết.');
            }
          } else if (job.status === 'failed') {
            toast.error(job.errorMessage || 'Không thể tạo ảnh.');
          }
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
      if (!cancelled) {
        timer = window.setTimeout(
          poll,
          document.visibilityState === 'visible' ? 2_000 : 8_000
        );
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeJobPageIds, campaignOrderImportId, polledJobId, polledJobStatus, syncPageResults]);

  useEffect(() => {
    const viewport = editorViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoomMode('manual');
      setZoomPercent((current) => clamp(current + (event.deltaY > 0 ? -5 : 5), 10, 200));
    };
    observer.observe(viewport);
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    if (zoomMode === 'fit') setZoomPercent(fitZoomPercent);
  }, [fitZoomPercent, zoomMode]);

  const changeZoom = (nextZoom: number) => {
    setZoomMode('manual');
    setZoomPercent(clamp(Math.round(nextZoom), 10, 200));
  };

  const fitCanvasToViewport = () => {
    setZoomMode('fit');
    setZoomPercent(fitZoomPercent);
  };

  useEffect(() => {
    const liveIds = new Set(layers.map((layer) => layer.id));
    setSelectedLayerIds((current) => {
      const next = current.filter((id) => liveIds.has(id));
      return next.length === current.length ? current : next;
    });
    setSelectedLayerId((current) => (current && liveIds.has(current) ? current : ''));
  }, [layers]);

  const updateLayer = useCallback((layerId: string, updates: Partial<TemplateLayer>) => {
    setLayers((current) => current.map((layer) => layer.id === layerId
      ? normalizeLayerBounds({ ...layer, ...updates }, canvasSize)
      : layer));
  }, [canvasSize]);
  const optimizeReadability = () => {
    recordLayerHistory();
    const optimized = optimizeLayersForReadability(layers, canvasSize);
    setLayers(optimized.layers);
    setRows((current) => current.map((row) => ({
      ...row,
      values: row.values[optimized.panelId] === undefined
        ? { ...row.values, [optimized.panelId]: '' }
        : row.values,
    })));
    setSelectedLayerId(optimized.panelId);
    setSelectedLayerIds([optimized.panelId]);
    setBackgroundSelected(false);
    toast.success('Đã tối ưu bố cục để nội dung dễ đọc hơn.');
  };
  const createEditorSnapshot = useCallback((): EditorSnapshot => ({
      layers: layers.map((layer) => ({ ...layer })),
      rows: rows.map((row) => ({ ...row, values: { ...row.values } })),
      canvasSize: { ...canvasSize },
      backgroundId,
      backgroundImage,
      backgroundColor,
  }), [backgroundColor, backgroundId, backgroundImage, canvasSize, layers, rows]);

  const restoreEditorSnapshot = useCallback((snapshot: EditorSnapshot) => {
    setLayers(snapshot.layers);
    setRows(snapshot.rows);
    setCanvasSize(snapshot.canvasSize);
    setBackgroundId(snapshot.backgroundId);
    setBackgroundImage(snapshot.backgroundImage);
    setBackgroundColor(snapshot.backgroundColor);
  }, []);

  const recordLayerHistory = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-29), createEditorSnapshot()];
    redoRef.current = [];
  }, [createEditorSnapshot]);

  const applyAiScene = useCallback((result: BulkAiSceneResult) => {
    recordLayerHistory();
    const nextLayers = result.scene.layers;
    setCanvasSize(result.scene.canvas);
    setLayers(nextLayers);
    setRows((currentRows) => {
      if (currentRows.length === 0) return [createRow(nextLayers, result.values)];
      return currentRows.map((row) => ({
        ...row,
        values: Object.fromEntries(nextLayers.map((layer) => {
          const generatedValue = row.id === activeRowId ? result.values[layer.id] : undefined;
          return [
            layer.id,
            generatedValue
              ?? row.values[layer.id]
              ?? layer.defaultValue
              ?? (layer.type === 'text' && layer.layerKind !== 'shape' ? layer.fieldName : ''),
          ];
        })),
      }));
    });

    if (result.scene.background.type === 'image') {
      setBackgroundImage(result.scene.background.imageUrl || '');
      setBackgroundId('');
    } else if (result.scene.background.type === 'gradient') {
      setBackgroundImage('');
      const colors = result.scene.background.colors || [];
      const match = BACKGROUNDS.find((item) => item.colors.join(',') === colors.join(','));
      if (match) {
        setBackgroundId(match.id);
      } else {
        setBackgroundId('blank');
        setBackgroundColor(colors[0] || '#ffffff');
      }
    } else {
      setBackgroundImage('');
      setBackgroundId('blank');
      setBackgroundColor(result.scene.background.color || '#ffffff');
    }

    setBackgroundSelected(false);
    setSelectedLayerId('');
    setSelectedLayerIds([]);
    setEditingLayerId('');
    setPageResults({});
    setActiveJobPageIds([]);
    setActiveJob(null);
    setJobItems([]);
  }, [activeRowId, recordLayerHistory]);

  const changeLayer = useCallback((layerId: string, updates: Partial<TemplateLayer>) => {
    recordLayerHistory();
    updateLayer(layerId, updates);
  }, [recordLayerHistory, updateLayer]);

  const undoLayers = () => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(createEditorSnapshot());
    restoreEditorSnapshot(previous);
    setSelectedLayerId('');
    setSelectedLayerIds([]);
  };

  const redoLayers = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(createEditorSnapshot());
    restoreEditorSnapshot(next);
    setSelectedLayerId('');
    setSelectedLayerIds([]);
  };



  const addLayer = (
    type: LayerType,
    initialValue = '',
    overrides?: Partial<TemplateLayer>,
    placement?: { centerX: number; centerY: number },
  ) => {
    recordLayerHistory();
    const layer = createTemplateLayer({
      type,
      initialValue,
      overrides,
      placement,
      existingLayers: layers,
      canvas: canvasSize,
    });
    const isShape = layer.layerKind === 'shape';
    setLayers((current) => [...current, layer]);
    setRows((current) => current.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [layer.id]: layer.defaultValue || (type === 'text' && !isShape ? layer.fieldName : ''),
      },
    })));
    setSelectedLayerId(layer.id);
    setSelectedLayerIds([layer.id]);
    setBackgroundSelected(false);
    setActiveTool(type);
  };

  const uploadLibraryAsset = async (file: File, target: 'background' | 'layer') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tệp hình ảnh.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ảnh tải lên không được vượt quá 10 MB.');
      return;
    }

    setUploadingAsset(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const asset = await bulkCreateService.uploadLibraryAsset(dataUrl, file.name);
      setUploadedImages((current) => [asset, ...current.filter((item) => item._id !== asset._id)]);
      if (target === 'background') {
        setBackgroundImage(asset.url);
        setBackgroundId('');
        setBackgroundSelected(true);
        clearLayerSelection();
      } else {
        addLayer('image', asset.url);
      }
      toast.success('Đã tải ảnh lên thư viện.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tải ảnh lên thư viện.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setUploadingAsset(false);
    }
  };

  const importTemplateFile = async (file: File) => {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!isPdf && !isImage) {
      toast.error('Mẫu cần là PNG, JPG, WEBP hoặc PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Mẫu nhập không được vượt quá 10 MB.');
      return;
    }

    setImportingTemplate(true);
    setErrorMessage('');
    try {
      const sourceDataUrl = isPdf ? await rasterizeFirstPdfPage(file) : await readFileAsDataUrl(file);
      const dimensions = await imageDimensions(sourceDataUrl);
      const safeCanvas = {
        width: Math.min(4_096, Math.max(320, Math.round(dimensions.width))),
        height: Math.min(4_096, Math.max(320, Math.round(dimensions.height))),
      };
      const asset = await bulkCreateService.uploadLibraryAsset(
        sourceDataUrl,
        isPdf ? `${importedTemplateName(file.name)}-trang-1.jpg` : file.name,
      );
      setUploadedImages((current) => [asset, ...current.filter((item) => item._id !== asset._id)]);

      const fallbackLayer = createTemplateLayer({
        type: 'text',
        initialValue: 'Nội dung thay đổi',
        overrides: {
          fieldName: 'Nội dung thay đổi',
          x: 8,
          y: 76,
          width: 84,
          height: 12,
          fontSize: Math.max(24, Math.round(safeCanvas.width * 0.045)),
          color: '#111827',
          fillColor: '#ffffff',
          borderRadius: 12,
          padding: 12,
          textAlign: 'center',
          maxLines: 2,
        },
        existingLayers: [],
        canvas: safeCanvas,
      });
      const initialScene = {
        sceneVersion: BULK_SCENE_VERSION,
        canvas: safeCanvas,
        background: { type: 'image' as const, imageUrl: asset.url },
        layers: [fallbackLayer],
      };
      const initialValues = { [fallbackLayer.id]: fallbackLayer.defaultValue || '' };
      let analyzedScene: BulkAiScene = initialScene;
      let analyzedValues = initialValues;

      try {
        const analysis = await bulkCreateService.updateSceneWithAi({
          prompt: 'Chuyển ảnh mẫu đính kèm thành template chỉnh sửa được để tạo hàng loạt. Giữ nguyên tối đa phần đồ họa tĩnh của mẫu. Tự nhận diện 1-6 vùng có khả năng thay đổi giữa các phiên bản như tiêu đề, giá, mô tả, CTA hoặc ảnh sản phẩm. Với mỗi vùng đã có chữ trong ảnh, thêm shape che kín chữ cũ cùng một layer text chỉnh sửa được ở đúng vị trí; đặt fieldName rõ ràng bằng tiếng Việt và defaultValue gần với nội dung nhìn thấy. Chỉ tạo layer ảnh biến đổi nếu ảnh mẫu thật sự có vùng ảnh sản phẩm. Không thiết kế lại theo phong cách khác, không thêm dữ liệu không có trong ảnh và luôn giữ ít nhất một field text có thể map Excel.',
          scene: initialScene,
          values: initialValues,
          attachments: [{ type: 'image', name: file.name, url: asset.url }],
        });
        if (analysis.scene.layers.length > 0) {
          analyzedScene = analysis.scene;
          analyzedValues = analysis.values;
        }
      } catch (analysisError) {
        console.warn('[BulkCreate] Template import analysis failed; using editable draft:', analysisError);
        toast.warning('Đã tạo mẫu nháp. AI chưa phân tích được bố cục, bạn có thể chỉnh tiếp trong editor.');
      }

      const template = await bulkCreateService.createTemplate({
        name: importedTemplateName(file.name),
        canvas: analyzedScene.canvas,
        background: analyzedScene.background,
        layers: analyzedScene.layers,
      });
      setTemplates((current) => [template, ...current.filter((item) => item._id !== template._id)]);
      setTemplatesTotal((current) => current + 1);
      loadTemplate(template);
      setRows([createRow(analyzedScene.layers, analyzedValues)]);
      setActiveTool('data');
      setAiHtmlMode(false);
      setSidebarOpen(true);
      toast.success(isPdf
        ? 'Đã tạo template từ trang đầu của PDF. Hãy kiểm tra preview trước khi render.'
        : 'Đã tạo template từ mẫu đã nhập. Hãy kiểm tra preview trước khi render.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể nhập mẫu thiết kế.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setImportingTemplate(false);
    }
  };

  const refreshCanva = useCallback(async (showConnectedToast = false) => {
    setLoadingCanva(true);
    setCanvaError('');
    try {
      const status = await bulkCreateService.getCanvaStatus();
      setCanvaStatus(status);
      if (!status.connected) {
        setCanvaDesigns([]);
        return;
      }
      const designs = await bulkCreateService.listCanvaDesigns();
      setCanvaDesigns(designs);
      if (showConnectedToast) toast.success('Đã kết nối và đồng bộ thiết kế Canva.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đồng bộ tài khoản Canva.';
      setCanvaError(message);
    } finally {
      setLoadingCanva(false);
    }
  }, []);

  useEffect(() => {
    void refreshCanva();
  }, [refreshCanva]);

  useEffect(() => {
    const handleCanvaConnected = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (event.origin !== window.location.origin || data?.type !== 'igen-canva-connected') return;
      void refreshCanva(true);
    };
    window.addEventListener('message', handleCanvaConnected);
    return () => window.removeEventListener('message', handleCanvaConnected);
  }, [refreshCanva]);

  const startCanvaConnection = async () => {
    try {
      setCanvaError('');
      const { url } = await bulkCreateService.startCanvaOAuth();
      const popup = window.open(url, 'igen-canva-connect', 'popup,width=560,height=720');
      if (!popup) window.location.assign(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể khởi tạo kết nối Canva.';
      setCanvaError(message);
      setErrorMessage(message);
      toast.error(message);
    }
  };
  const deleteUploadedImage = async (assetId: string) => {
    try {
      await bulkCreateService.archiveAsset(assetId);
      setUploadedImages((current) => current.filter((item) => item._id !== assetId));
      toast.success('Đã xóa ảnh khỏi lịch sử.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể xóa ảnh khỏi lịch sử.';
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const removeSelectedImageBackground = async () => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;
    if (selectedLayer.locked) {
      toast.warning('Ảnh đang bị khóa, hãy mở khóa trước khi xóa nền.');
      return;
    }
    const source = activeRow?.values[selectedLayer.id] || selectedLayer.defaultValue || '';
    if (!/^https:\/\/res\.cloudinary\.com\//i.test(source)) {
      toast.info('Hãy tải ảnh lên thư viện trước, rồi chọn lại ảnh để xóa nền AI.');
      return;
    }
    setRemovingBackground(true);
    try {
      const removedBackgroundUrl = bulkCreateService.backgroundRemovedUrl(source);
      if (removedBackgroundUrl === source) {
        toast.info('Ảnh này đã được xóa nền trước đó.');
        return;
      }
      await waitForDerivedImage(removedBackgroundUrl);
      recordLayerHistory();
      if (selectedLayer.dataBinding && activeRow) {
        setRows((current) => current.map((row) => row.id === activeRow.id
          ? { ...row, values: { ...row.values, [selectedLayer.id]: removedBackgroundUrl } }
          : row));
      } else {
        setLayers((current) => current.map((layer) => layer.id === selectedLayer.id
          ? { ...layer, defaultValue: removedBackgroundUrl }
          : layer));
        setRows((current) => current.map((row) => ({
          ...row,
          values: { ...row.values, [selectedLayer.id]: removedBackgroundUrl },
        })));
      }
      toast.success('Đã xóa nền ảnh bằng AI.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa nền ảnh bằng AI.');
    } finally {
      setRemovingBackground(false);
    }
  };

  const removeLayer = useCallback((layerId: string) => {
    recordLayerHistory();
    setLayers((current) => current.filter((layer) => layer.id !== layerId));
    setRows((current) => current.map((row) => {
      const values = { ...row.values };
      delete values[layerId];
      return { ...row, values };
    }));
    setSelectedLayerId('');
    setSelectedLayerIds([]);
  }, [recordLayerHistory]);

  const duplicateLayer = (source: TemplateLayer) => {
    recordLayerHistory();
    const baseName = `${source.fieldName} bản sao`;
    let fieldName = baseName;
    let copyNumber = 2;
    while (layers.some((layer) => layer.fieldName.trim().toLocaleLowerCase('vi-VN') === fieldName.toLocaleLowerCase('vi-VN'))) {
      fieldName = `${baseName} ${copyNumber++}`;
    }
    const duplicated = { ...source, id: makeId('field'), fieldName, x: clamp(source.x + 3, 0, 100 - source.width), y: clamp(source.y + 3, 0, 100 - source.height), zIndex: layers.length, locked: false };
    setLayers((current) => [...current, duplicated]);
    setRows((current) => current.map((row) => ({ ...row, values: { ...row.values, [duplicated.id]: row.values[source.id] || '' } })));
    setSelectedLayerId(duplicated.id);
    setSelectedLayerIds([duplicated.id]);
  };

  const removeSelectedLayers = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    recordLayerHistory();
    const ids = new Set(selectedLayerIds);
    setLayers((current) => current.filter((layer) => !ids.has(layer.id)));
    setRows((current) => current.map((row) => {
      const values = { ...row.values };
      ids.forEach((layerId) => {
        delete values[layerId];
      });
      return { ...row, values };
    }));
    clearLayerSelection();
  }, [clearLayerSelection, recordLayerHistory, selectedLayerIds]);

  const duplicateSelectedLayers = useCallback(() => {
    if (selectedLayers.length === 0) return;
    recordLayerHistory();
    const usedNames = new Set(layers.map((layer) => layer.fieldName.trim().toLocaleLowerCase('vi-VN')));
    const duplicatedLayers = selectedLayers.map((source, index) => {
      const baseName = `${source.fieldName} Copy`;
      let fieldName = baseName;
      let copyNumber = 2;
      while (usedNames.has(fieldName.trim().toLocaleLowerCase('vi-VN'))) {
        fieldName = `${baseName} ${copyNumber++}`;
      }
      usedNames.add(fieldName.trim().toLocaleLowerCase('vi-VN'));
      return {
        ...source,
        id: makeId('field'),
        fieldName,
        x: clamp(source.x + 4, 0, 100 - source.width),
        y: clamp(source.y + 4, 0, 100 - source.height),
        zIndex: layers.length + index,
        locked: false,
      };
    });
    setLayers((current) => [...current, ...duplicatedLayers]);
    setRows((current) => current.map((row) => {
      const values = { ...row.values };
      duplicatedLayers.forEach((layer, index) => {
        values[layer.id] = row.values[selectedLayers[index].id] || '';
      });
      return { ...row, values };
    }));
    setSelectedLayerId(duplicatedLayers[duplicatedLayers.length - 1]?.id || '');
    setSelectedLayerIds(duplicatedLayers.map((layer) => layer.id));
  }, [layers, recordLayerHistory, selectedLayers]);

  const toggleLockSelectedLayers = useCallback(() => {
    if (selectedLayerIds.length === 0) return;
    recordLayerHistory();
    const ids = new Set(selectedLayerIds);
    const shouldLock = selectedLayers.some((layer) => !layer.locked);
    setLayers((current) => current.map((layer) => ids.has(layer.id) ? { ...layer, locked: shouldLock } : layer));
  }, [recordLayerHistory, selectedLayerIds, selectedLayers]);

  const handleCopy = useCallback(() => {
    const selected = layers.find((l) => l.id === selectedLayerId);
    if (selected) {
      copiedLayerRef.current = { ...selected };
    }
  }, [layers, selectedLayerId]);

  const handlePaste = useCallback(() => {
    if (!copiedLayerRef.current) return;
    recordLayerHistory();
    const newLayer: TemplateLayer = {
      ...copiedLayerRef.current,
      id: makeId('field'),
      fieldName: `${copiedLayerRef.current.fieldName} Copy`,
      x: clamp(copiedLayerRef.current.x + 4, 0, 90),
      y: clamp(copiedLayerRef.current.y + 4, 0, 90),
      zIndex: layers.length,
    };
    setLayers((current) => [...current, newLayer]);
    setSelectedLayerId(newLayer.id);
    setSelectedLayerIds([newLayer.id]);
  }, [layers, recordLayerHistory]);

  const handleDuplicate = useCallback(() => {
    if (selectedLayerIds.length > 1) {
      duplicateSelectedLayers();
      return;
    }
    const selected = layers.find((l) => l.id === selectedLayerId);
    if (!selected) return;
    recordLayerHistory();
    const newLayer: TemplateLayer = {
      ...selected,
      id: makeId('field'),
      fieldName: `${selected.fieldName} Copy`,
      x: clamp(selected.x + 4, 0, 90),
      y: clamp(selected.y + 4, 0, 90),
      zIndex: layers.length,
    };
    setLayers((current) => [...current, newLayer]);
    setSelectedLayerId(newLayer.id);
    setSelectedLayerIds([newLayer.id]);
  }, [
    duplicateSelectedLayers,
    layers,
    recordLayerHistory,
    selectedLayerId,
    selectedLayerIds.length,
  ]);

  const handleDelete = useCallback(() => {
    if (selectedLayerIds.length > 1) {
      removeSelectedLayers();
    } else if (selectedLayerId) {
      removeLayer(selectedLayerId);
    } else if (backgroundSelected) {
      recordLayerHistory();
      setBackgroundImage('');
      setBackgroundId('blank');
    }
  }, [
    backgroundSelected,
    selectedLayerId,
    selectedLayerIds.length,
    removeSelectedLayers,
    removeLayer,
    recordLayerHistory,
  ]);

  const handleResize = useCallback((width: number, height: number) => {
    recordLayerHistory();
    setCanvasSize({ width, height });
  }, [recordLayerHistory]);

  const alignLayer = useCallback((alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    if (!selectedLayer) return;
    const updates: Partial<TemplateLayer> =
      alignment === 'left'
        ? { x: 0 }
        : alignment === 'center-x'
          ? { x: (100 - selectedLayer.width) / 2 }
          : alignment === 'right'
            ? { x: 100 - selectedLayer.width }
            : alignment === 'top'
              ? { y: 0 }
              : alignment === 'center-y'
                ? { y: (100 - selectedLayer.height) / 2 }
                : { y: 100 - selectedLayer.height };
    changeLayer(selectedLayer.id, updates);
  }, [changeLayer, selectedLayer]);

  const alignSelectedLayers = useCallback((
    alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'distribute-x' | 'distribute-y',
  ) => {
    if (selectedLayers.length < 2) return;
    recordLayerHistory();
    const left = Math.min(...selectedLayers.map((layer) => layer.x));
    const top = Math.min(...selectedLayers.map((layer) => layer.y));
    const right = Math.max(...selectedLayers.map((layer) => layer.x + layer.width));
    const bottom = Math.max(...selectedLayers.map((layer) => layer.y + layer.height));
    const next = new Map<string, Partial<TemplateLayer>>();

    if (alignment === 'distribute-x' || alignment === 'distribute-y') {
      const horizontal = alignment === 'distribute-x';
      const sorted = [...selectedLayers].sort((a, b) => (
        horizontal ? a.x - b.x : a.y - b.y
      ));
      const span = horizontal ? right - left : bottom - top;
      const occupied = sorted.reduce((sum, layer) => sum + (horizontal ? layer.width : layer.height), 0);
      const gap = Math.max(0, (span - occupied) / (sorted.length - 1));
      let cursor = horizontal ? left : top;
      sorted.forEach((layer) => {
        next.set(layer.id, horizontal ? { x: cursor } : { y: cursor });
        cursor += (horizontal ? layer.width : layer.height) + gap;
      });
    } else {
      selectedLayers.forEach((layer) => {
        const updates: Partial<TemplateLayer> =
          alignment === 'left'
            ? { x: left }
            : alignment === 'center-x'
              ? { x: (left + right - layer.width) / 2 }
              : alignment === 'right'
                ? { x: right - layer.width }
                : alignment === 'top'
                  ? { y: top }
                  : alignment === 'center-y'
                    ? { y: (top + bottom - layer.height) / 2 }
                    : { y: bottom - layer.height };
        next.set(layer.id, updates);
      });
    }
    setLayers((current) => current.map((layer) => {
      const updates = next.get(layer.id);
      return updates ? { ...layer, ...updates } : layer;
    }));
  }, [recordLayerHistory, selectedLayers]);

  const toggleGroupSelectedLayers = useCallback(() => {
    if (selectedLayers.length < 2) return;
    recordLayerHistory();
    const existingGroupIds = new Set(selectedLayers.map((layer) => layer.groupId).filter(Boolean));
    const sharedGroupId = existingGroupIds.size === 1
      && selectedLayers.every((layer) => layer.groupId === [...existingGroupIds][0])
      ? undefined
      : makeId('group');
    const selectedIds = new Set(selectedLayers.map((layer) => layer.id));
    setLayers((current) => current.map((layer) => (
      selectedIds.has(layer.id) ? { ...layer, groupId: sharedGroupId } : layer
    )));
  }, [recordLayerHistory, selectedLayers]);

  const {
    copiedPage,
    downloadingJob,
    updateCell,
    addRow,
    duplicateRow,
    removeRow,
    copyPage,
    pastePageAfter,
    duplicatePage,
    renamePage,
    downloadPage,
    downloadJob,
  } = useBulkPageActions({
    layers,
    setLayers,
    rows,
    setRows,
    activeRowId,
    setActiveRowId,
    setPagesCreated,
    pageResults,
    setPageResults,
    editorScene,
    setErrorMessage,
  });

  const applyImportedData = (
    columns: BulkDataColumn[],
    importedRows: BulkImportedRow[],
    sourceName: string,
    sourceCampaignId = '',
    sourceType: 'manual' | 'campaign_orders' | 'sheet' = 'manual',
    context: CampaignAssetOrderData | null = null,
  ) => {
    const nextLayers = matchLayersToColumns(layers, columns);
    const mappableSlots = (context?.slots || []).filter((slot) => (
      slot.platform === 'Facebook'
      && !['video', 'human-video'].includes(slot.mediaType)
      && CAMPAIGN_BULK_WRITABLE_SLOT_STATUSES.has(slot.status)
    ));
    const orderBySlotId = new Map((context?.orders || [])
      .filter((order) => order.status !== 'cancelled' && order.slotId)
      .map((order) => [String(order.slotId), order._id]));
    const nextRows: DataRow[] = importedRows.map((row, rowIndex) => ({
      id: row.id || makeId('row'),
      campaignAssetOrderId: row.cells.order_id || orderBySlotId.get(mappableSlots[rowIndex]?._id) || undefined,
      campaignSlotId: row.cells.slot_id || mappableSlots[rowIndex]?._id || undefined,
      sourceCells: row.cells,
      selected: row.selected !== false,
      values: Object.fromEntries(nextLayers.map((layer) => [
        layer.id,
        layer.dataBinding
          ? row.cells[layer.dataBinding.columnKey] || ''
          : layer.defaultValue || (layer.type === 'text' && layer.layerKind !== 'shape' ? layer.fieldName : ''),
      ])),
    }));
    setLayers(nextLayers);
    setDataColumns(columns);
    setRows(nextRows);
    setActiveRowId(nextRows[0]?.id || '');
    setDataSourceName(sourceName);
    setCampaignOrderImportId(sourceCampaignId);
    setCampaignDataSource(sourceType);
    setDataStep(2);
    setSheetInput('');
    setPagesCreated(false);
    setPageResults({});
    setActiveJobPageIds([]);
  };

  const connectLayerData = (layerId: string, columnKey: string) => {
    const column = dataColumns.find((item) => item.key === columnKey);
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    if (column && column.type !== layer.type) {
      toast.error(
        layer.type === 'image'
          ? 'Khung ảnh chỉ có thể kết nối với cột ảnh.'
          : 'Ô chữ chỉ có thể kết nối với cột văn bản.'
      );
      return;
    }
    const dataBinding = column
      ? { columnKey: column.key, columnLabel: column.label }
      : undefined;
    setLayers((current) => current.map((item) =>
      item.id === layerId ? { ...item, dataBinding } : item
    ));
    setRows((current) => current.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [layerId]: column
          ? row.sourceCells?.[column.key] || ''
          : layer.defaultValue || (layer.type === 'text' ? layer.fieldName : ''),
      },
    })));
  };

  const autoMatchData = () => {
    const matchedLayers = matchLayersToColumns(layers, dataColumns);
    setLayers(matchedLayers);
    setRows((current) => current.map((row) => ({
      ...row,
      values: Object.fromEntries(matchedLayers.map((layer) => [
        layer.id,
        layer.dataBinding
          ? row.sourceCells?.[layer.dataBinding.columnKey] || ''
          : layer.defaultValue || row.values[layer.id] || (
            layer.type === 'text' && layer.layerKind !== 'shape' ? layer.fieldName : ''
          ),
      ])),
    })));
  };

  const toggleImportedRow = (rowId: string) => {
    setRows((current) => {
      const nextRows = current.map((row) =>
        row.id === rowId ? { ...row, selected: row.selected === false } : row
      );
      const activeStillVisible = nextRows.some(
        (row) => row.id === activeRowId && row.selected !== false
      );
      if (!activeStillVisible) {
        setActiveRowId(
          nextRows.find((row) => row.selected !== false)?.id || nextRows[0]?.id || ''
        );
      }
      return nextRows;
    });
  };

  const selectAllImportedRows = (selected: boolean) => {
    setRows((current) => current.map((row) => ({ ...row, selected })));
    if (selected && rows[0]) setActiveRowId(rows[0].id);
  };

  const resolveCampaignImportContext = async () => {
    if (bulkTarget !== 'campaign') return { campaignId: '', context: null as CampaignAssetOrderData | null };
    if (!selectedCampaignId) throw new Error('Select a campaign before importing data.');
    const context = campaignContext || await loadCampaignContext(selectedCampaignId);
    if (!context) throw new Error('Unable to load the selected campaign posts.');
    return { campaignId: selectedCampaignId, context };
  };

  const assignCampaignToImportedRows = (
    campaignId: string,
    context: CampaignAssetOrderData | null,
    sourceType: 'campaign_orders' | 'sheet',
  ) => {
    if (!campaignId || !context) return;
    const slots = context.slots.filter((slot) => (
      slot.platform === 'Facebook'
      && !['video', 'human-video'].includes(slot.mediaType)
      && CAMPAIGN_BULK_WRITABLE_SLOT_STATUSES.has(slot.status)
    ));
    const orderBySlotId = new Map(context.orders
      .filter((order) => order.status !== 'cancelled' && order.slotId)
      .map((order) => [String(order.slotId), order._id]));
    setRows((current) => current.map((row, index) => {
      const slotId = row.campaignSlotId || slots[index]?._id;
      return {
        ...row,
        campaignSlotId: slotId,
        campaignAssetOrderId: row.campaignAssetOrderId || orderBySlotId.get(String(slotId || '')),
      };
    }));
    setCampaignOrderImportId(campaignId);
    setCampaignDataSource(sourceType);
  };

  const importGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) return;
    setLoadingSheet(true);
    setErrorMessage('');
    try {
      const [preview, target] = await Promise.all([
        bulkCreateService.previewPublicGoogleSheet(googleSheetUrl.trim()),
        resolveCampaignImportContext(),
      ]);
      applyImportedData(
        preview.columns,
        preview.rows,
        `Google Sheet · ${preview.sheetName || 'Tự động'}`
      );
      assignCampaignToImportedRows(target.campaignId, target.context, 'sheet');
      const imageSummary = preview.embeddedImageCount
        ? ` và ${preview.embeddedImageCount} ảnh`
        : '';
      toast.success(`Đã nhập ${preview.rows.length} dòng${imageSummary} từ Google Sheet.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đọc Google Sheet.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoadingSheet(false);
    }
  };

  const importSheet = async () => {
    const matrix = sheetInput
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split('\t'));
    const dataSet = matrixToDataSet(matrix);
    const target = await resolveCampaignImportContext();
    applyImportedData(dataSet.columns, dataSet.rows, 'Dữ liệu đã dán');
    assignCampaignToImportedRows(target.campaignId, target.context, 'sheet');
  };

  const importExcel = async (file: File) => {
    const target = await resolveCampaignImportContext();
    if (/\.xlsx$/i.test(file.name)) {
      setLoadingSheet(true);
      setErrorMessage('');
      try {
        const preview = await bulkCreateService.previewWorkbook(file);
        applyImportedData(
          preview.columns,
          preview.rows,
          `${file.name} · ${preview.sheetName || 'Tự động'}`
        );
        assignCampaignToImportedRows(target.campaignId, target.context, 'sheet');
        const imageSummary = preview.embeddedImageCount
          ? ` và ${preview.embeddedImageCount} ảnh`
          : '';
        toast.success(`Đã nhập ${preview.rows.length} dòng${imageSummary} từ ${file.name}.`);
      } finally {
        setLoadingSheet(false);
      }
      return;
    }
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const candidates = workbook.SheetNames.map((sheetName) => {
      try {
        const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(
          workbook.Sheets[sheetName],
          { header: 1, raw: false }
        );
        const dataSet = matrixToDataSet(matrix);
        return {
          sheetName,
          dataSet,
          score: dataSet.columns.length * 1_000 + dataSet.rows.length,
        };
      } catch {
        return null;
      }
    }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    if (!best) throw new Error('Không tìm thấy bảng dữ liệu hợp lệ trong tệp.');
    applyImportedData(best.dataSet.columns, best.dataSet.rows, `${file.name} · ${best.sheetName}`);
    assignCampaignToImportedRows(target.campaignId, target.context, 'sheet');
  };

  const buildTemplatePayload = useCallback(async (): Promise<BulkTemplatePayload> => {
    if (layers.length === 0) throw new Error('Hãy thêm ít nhất một trường chữ hoặc ảnh.');
    const background = BACKGROUNDS.find((item) => item.id === backgroundId);
    let uploadedBackground = backgroundImage;
    if (uploadedBackground.startsWith('data:')) {
      uploadedBackground = await bulkCreateService.uploadAsset(uploadedBackground, 'igen_erp/bulk-create/backgrounds');
      setBackgroundImage(uploadedBackground);
    }
    return {
      sceneVersion: BULK_SCENE_VERSION,
      name: templateName.trim() || 'Thiết kế chưa đặt tên',
      canvas: canvasSize,
      background: uploadedBackground
        ? { type: 'image', imageUrl: uploadedBackground }
        : backgroundId === 'blank'
          ? { type: 'color', color: backgroundColor }
          : { type: 'gradient', colors: background?.colors || ['#ffffff', '#ffffff'] },
      layers,
    };
  }, [
    backgroundColor,
    backgroundId,
    backgroundImage,
    canvasSize,
    layers,
    templateName,
  ]);

  const persistTemplate = useCallback(async (expectedDesignSession?: number) => {
    const payload = await buildTemplatePayload();
    if (persistRequestRef.current) {
      await persistRequestRef.current.catch(() => undefined);
    }
    const isNew = !savedTemplateIdRef.current;
    const request = savedTemplateIdRef.current
      ? bulkCreateService.updateTemplate(savedTemplateIdRef.current, payload)
      : bulkCreateService.createTemplate(payload);
    persistRequestRef.current = request;
    try {
      const template = await request;
      const belongsToCurrentDesign =
        expectedDesignSession === undefined ||
        designSessionRef.current === expectedDesignSession;
      if (belongsToCurrentDesign) {
        savedTemplateIdRef.current = template._id;
        setSavedTemplateId(template._id);
      }
      setTemplates((current) => [template, ...current.filter((item) => item._id !== template._id)]);
      if (isNew) {
        setTemplatesTotal((total) => total + 1);
      }
      return template;
    } finally {
      if (persistRequestRef.current === request) {
        persistRequestRef.current = null;
      }
    }
  }, [buildTemplatePayload]);

  const saveTemplate = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      return await persistTemplate();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    autoSaveVersionRef.current += 1;
    const version = autoSaveVersionRef.current;
    const designSession = designSessionRef.current;
    if (layers.length === 0) {
      setAutoSaveStatus('idle');
      return;
    }

    setAutoSaveStatus('dirty');
    const timer = window.setTimeout(() => {
      setAutoSaveStatus('saving');
      void persistTemplate(designSession)
        .then(() => {
          if (autoSaveVersionRef.current === version) {
            setAutoSaveStatus('saved');
          }
        })
        .catch((error) => {
          if (autoSaveVersionRef.current === version) {
            setAutoSaveStatus('error');
          }
          console.error('[BulkCreate] Auto-save failed:', error);
        });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [layers.length, persistTemplate]);

  const uploadReadyRows = async () => {
    const readyRows = rows.filter(isRowReady);
    const localImageSources = Array.from(new Set(
      readyRows.flatMap((row) => layers
        .filter((layer) => layer.type === 'image')
        .map((layer) => row.values[layer.id] || '')
        .filter((value) => value.startsWith('data:image/')))
    ));
    const uploadedImageUrls = new Map<string, string>();
    if (localImageSources.length > 0) {
      setAssetUploadProgress({ completed: 0, total: localImageSources.length });
      const uploadedUrls = await mapWithConcurrency(
        localImageSources,
        4,
        async (source) => {
          const url = await bulkCreateService.uploadAsset(source, 'igen_erp/bulk-create/inputs');
          setAssetUploadProgress((current) => current
            ? { ...current, completed: current.completed + 1 }
            : current
          );
          return url;
        }
      );
      localImageSources.forEach((source, index) => {
        uploadedImageUrls.set(source, uploadedUrls[index]);
      });
    }
      const uploaded = readyRows.map((row) => ({
        ...row.values,
        ...Object.fromEntries(layers.map((layer) => {
          if (layer.type === 'image') {
            const source = row.values[layer.id] || row.values[layer.fieldName] || layer.defaultValue || '';
            return [layer.id, uploadedImageUrls.get(source) || source];
          }
          const val = row.values[layer.id] ?? row.values[layer.fieldName] ?? (layer.layerKind === 'shape' ? '' : (layer.defaultValue || layer.fieldName));
          return [layer.id, val];
        })),
        ...(row.campaignAssetOrderId ? { __campaign_asset_order_id: row.campaignAssetOrderId } : {}),
        ...(row.campaignSlotId ? { __campaign_slot_id: row.campaignSlotId } : {}),
        __source_row_id: row.id,
      }));
    setRows((current) => current.map((row) => {
      const index = readyRows.findIndex((ready) => ready.id === row.id);
      return index >= 0 ? { ...row, values: uploaded[index] } : row;
    }));
    return {
      values: uploaded,
      pageIds: readyRows.map((row) => row.id),
    };
  };

  const createPages = () => {
    const selectedRows = rows.filter((row) => row.selected !== false);
    if (selectedRows.length === 0) return;
    setPagesCreated(true);
    setActiveRowId(selectedRows[0].id);
    setSidebarOpen(false);
    toast.success(`Đã đưa ${selectedRows.length} trang vào thiết kế.`);
  };

  const startGeneration = async () => {
    if (readyCount === 0 || generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    setBusy(true);
    setErrorMessage('');
    try {
      const template = await persistTemplate();
      const uploadedRows = await uploadReadyRows();
      if (bulkTarget === 'campaign' && !campaignOrderImportId) {
        throw new Error('HÃ£y chá»n chiáº¿n dá»‹ch vÃ  nháº­p dá»¯ liá»‡u trÆ°á»›c khi táº¡o áº£nh.');
      }
      if (bulkTarget === 'campaign') {
        const unmappedCount = uploadedRows.values.filter((row) => !row.__campaign_slot_id).length;
        if (unmappedCount > 0) {
          throw new Error(`${unmappedCount} rows are not mapped to campaign posts.`);
        }
      }
      const job = await bulkCreateService.createJob(template._id, uploadedRows.values, {
        campaignId: bulkTarget === 'campaign' ? campaignOrderImportId : undefined,
        sourceType: bulkTarget === 'campaign' ? campaignDataSource : 'manual',
        mappingMode: bulkTarget === 'campaign'
          ? (campaignDataSource === 'campaign_orders' ? 'order' : campaignDataSource === 'sheet' ? 'position' : 'manual')
          : undefined,
      });
      setPagesCreated(true);
      setActiveJobPageIds(uploadedRows.pageIds);
      setPageResults((current) => {
        const next = { ...current };
        uploadedRows.pageIds.forEach((pageId) => {
          next[pageId] = { status: 'queued' };
        });
        return next;
      });
      setActiveJob(job);
      setJobItems([]);
      setJobs((current) => [job, ...current.filter((item) => item._id !== job._id)]);
      setShareMenuOpen(false);
      toast.success(`Đã bắt đầu tạo ${uploadedRows.values.length} ảnh.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      generationInFlightRef.current = false;
      setAssetUploadProgress(null);
      setBusy(false);
    }
  };

  const loadTemplate = (template: BulkTemplate) => {
    autoSaveVersionRef.current += 1;
    designSessionRef.current += 1;
    savedTemplateIdRef.current = template._id;
    setSavedTemplateId(template._id);
    setAutoSaveStatus('saved');
    setTemplateName(template.name);
    const normalizedLayers = template.layers.map((layer) =>
      normalizeLayerBounds(layer, template.canvas)
    );
    setLayers(normalizedLayers);
    setCanvasSize(template.canvas);
    setSelectedLayerId('');
    setBackgroundSelected(false);
    if (template.background.type === 'image') {
      setBackgroundImage(template.background.imageUrl || '');
      setBackgroundId('');
    } else if (template.background.type === 'color') {
      setBackgroundImage('');
      setBackgroundId('blank');
      setBackgroundColor(template.background.color || '#ffffff');
    } else {
      setBackgroundImage('');
      const match = BACKGROUNDS.find((item) => item.colors.join(',') === (template.background.colors || []).join(','));
      setBackgroundId(match?.id || 'blank');
    }
    setRows([createRow(normalizedLayers)]);
    setDataColumns([]);
    setDataSourceName('');
    setCampaignOrderImportId('');
    setDataStep(1);
    setPagesCreated(false);
    setPageResults({});
    setActiveJobPageIds([]);
    setActiveJob(null);
    setJobItems([]);
    setAiHistory([]);
  };

  const loadCampaignsForImport = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const result = await marketingCampaignService.list(1, 100);
      const activeFacebookCampaigns = result.campaigns.filter((campaign) => (
        campaign.status === 'active' && campaign.platforms.includes('Facebook')
      ));
      setCampaigns(activeFacebookCampaigns);
      setSelectedCampaignId((current) => (
        activeFacebookCampaigns.some((campaign) => campaign._id === current)
          ? current
          : activeFacebookCampaigns[0]?._id || ''
      ));
      if (!activeFacebookCampaigns.length) toast.warning('Chưa có chiến dịch Facebook đang hoạt động để tạo ảnh.');
      return activeFacebookCampaigns;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải danh sách chiến dịch.');
      return [] as MarketingCampaignSummary[];
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const loadCampaignContext = useCallback(async (campaignId: string) => {
    if (!campaignId) {
      setCampaignContext(null);
      return null;
    }
    setLoadingCampaignOrders(true);
    try {
      const context = await marketingCampaignService.getAssetOrders(campaignId);
      setCampaignContext(context);
      return context;
    } catch (error) {
      setCampaignContext(null);
      toast.error(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ táº£i dÃ»ng bÃ i viáº¿t cá»§a chiáº¿n dá»‹ch.');
      return null;
    } finally {
      setLoadingCampaignOrders(false);
    }
  }, []);

  useEffect(() => {
    if (!initialCampaignId) return;
    setBulkTarget('campaign');
    setCampaignSetupStep('confirm_campaign');
    void (async () => {
      const activeCampaigns = await loadCampaignsForImport();
      const selectedCampaign = activeCampaigns.find((campaign) => campaign._id === initialCampaignId)
        || activeCampaigns[0];
      if (!selectedCampaign) {
        setSelectedCampaignId('');
        setCampaignOrderImportId('');
        setCampaignContext(null);
        return;
      }
      setSelectedCampaignId(selectedCampaign._id);
      setCampaignOrderImportId(selectedCampaign._id);
      void loadCampaignContext(selectedCampaign._id);
    })();
  }, [initialCampaignId, loadCampaignContext, loadCampaignsForImport]);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const templateIdFromUrl = searchParams.get('template');
      if (templateIdFromUrl && /^[0-9a-fA-F]{24}$/.test(templateIdFromUrl)) {
        void (async () => {
          try {
            setBusy(true);
            const template = await bulkCreateService.getTemplate(templateIdFromUrl);
            if (template) {
              loadTemplate(template);
              toast.success(`Đã mở mẫu thiết kế “${template.name}”.`);
            }
          } catch (err) {
            console.error('Không thể tải mẫu thiết kế từ liên kết:', err);
            toast.error('Không thể tải mẫu thiết kế từ liên kết chia sẻ.');
          } finally {
            setBusy(false);
          }
        })();
      }
    } catch {
      // Ignored if window.location is unavailable
    }
  }, []);

  const importCampaignOrders = async () => {
    if (!selectedCampaignId) return;
    setBulkTarget('campaign');
    setLoadingCampaignOrders(true);
    setErrorMessage('');
    try {
      const preview = await marketingCampaignService.exportAssetOrdersForBulk(selectedCampaignId);
      if (!preview.rows.length) {
        toast.warning('Chiến dịch chưa có Order ảnh có thể nhập vào Bulk Create.');
        return;
      }
      applyImportedData(preview.columns, preview.rows, preview.sourceName, selectedCampaignId, 'campaign_orders');
      const notices = [
        preview.skipped.length ? `${preview.skipped.length} Order video giữ lại ở luồng video` : '',
        preview.missingPrimaryAssetCount ? `${preview.missingPrimaryAssetCount} dòng chưa có ảnh chính` : '',
        preview.rows.length > preview.maxBulkRows ? `Bulk Create hiện tạo tối đa ${preview.maxBulkRows} ảnh mỗi job` : '',
      ].filter(Boolean);
      toast.success(`Đã nhập ${preview.rows.length} Order ảnh từ chiến dịch.`);
      if (notices.length) toast.warning(notices.join(' · '));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể nhập Order chiến dịch.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoadingCampaignOrders(false);
    }
  };

  const applySystemTemplate = (template: BulkMarketingPreset) => {
    autoSaveVersionRef.current += 1;
    designSessionRef.current += 1;
    savedTemplateIdRef.current = '';
    setSavedTemplateId('');
    setAutoSaveStatus('idle');
    setTemplateName(template.name);
    const normalizedLayers = template.layers.map((layer) =>
      normalizeLayerBounds(layer, template.canvas)
    );
    setLayers(normalizedLayers);
    setCanvasSize(template.canvas);
    setBackgroundImage('');
    setBackgroundId(template.backgroundId);
    setSelectedLayerId('');
    setSelectedLayerIds([]);
    setBackgroundSelected(false);
    setRows([createRow(normalizedLayers)]);
    setDataColumns([]);
    setDataSourceName('');
    setCampaignOrderImportId('');
    setDataStep(1);
    setPagesCreated(false);
    setPageResults({});
    setActiveJobPageIds([]);
    setActiveJob(null);
    setJobItems([]);
    setAiHistory([]);
    undoRef.current = [];
    redoRef.current = [];
    toast.success(`Đã mở mẫu “${template.name}”. Bạn có thể chỉnh sửa hoặc map dữ liệu ngay.`);
  };

  const createNewTemplate = () => {
    autoSaveVersionRef.current += 1;
    designSessionRef.current += 1;
    savedTemplateIdRef.current = '';
    setSavedTemplateId('');
    setAutoSaveStatus('idle');
    setTemplateName('Thiết kế chưa đặt tên');
    setLayers([]);
    setRows([createRow([])]);
    setDataColumns([]);
    setDataSourceName('');
    setCampaignOrderImportId('');
    setDataStep(1);
    setGoogleSheetUrl('');
    setBackgroundId('blank');
    setBackgroundImage('');
    setBackgroundColor('#ffffff');
    setCanvasSize({ width: 1080, height: 1080 });
    setSelectedLayerId('');
    setBackgroundSelected(false);
    setPagesCreated(false);
    setPageResults({});
    setActiveJobPageIds([]);
    setActiveJob(null);
    setJobItems([]);
    setAiHistory([]);
    undoRef.current = [];
    redoRef.current = [];
  };

  const archiveTemplate = async (templateId: string) => {
    try {
      await bulkCreateService.archiveTemplate(templateId);
      setTemplates((current) => current.filter((template) => template._id !== templateId));
      setTemplatesTotal((total) => Math.max(0, total - 1));
      if (savedTemplateId === templateId) createNewTemplate();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const setTemplateVisibility = async (templateId: string, visibility: 'private' | 'public') => {
    setErrorMessage('');
    try {
      const template = visibility === 'public'
        ? await bulkCreateService.publishTemplate(templateId)
        : await bulkCreateService.unpublishTemplate(templateId);
      setTemplates((current) => current.map((item) => item._id === template._id ? template : item));
      setCommunityTemplates((current) => visibility === 'public'
        ? [template, ...current.filter((item) => item._id !== template._id)]
        : current.filter((item) => item._id !== template._id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleToggleVisibility = async (nextVisibility: 'private' | 'public') => {
    try {
      let tempId = savedTemplateId;
      if (!tempId) {
        const template = await saveTemplate();
        tempId = template._id;
      }
      if (tempId) {
        await setTemplateVisibility(tempId, nextVisibility);
        toast.success(`Đã chuyển đổi quyền truy cập thành ${nextVisibility === 'public' ? 'Công khai' : 'Riêng tư'}`);
      }
    } catch (error) {
      console.error(error);
      toast.error('Không thể cập nhật quyền truy cập.');
    }
  };

  const applyCommunityTemplate = async (templateId: string) => {
    setBusy(true);
    setErrorMessage('');
    try {
      const template = await bulkCreateService.useCommunityTemplate(templateId);
      setTemplates((current) => [template, ...current]);
      setTemplatesTotal((total) => total + 1);
      setCommunityTemplates((current) => current.map((item) => item._id === templateId ? { ...item, useCount: (item.useCount || 0) + 1 } : item));
      loadTemplate(template);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const openJob = async (job: BulkRenderJob) => {
    setActiveJob(job);
    setActiveJobPageIds([]);
    setJobItems(await bulkCreateService.listItems(job._id));
  };

  const retryJob = async (jobId: string) => {
    const job = await bulkCreateService.retry(jobId);
    setActiveJob(job);
    setJobItems([]);
    if (activeJobPageIds.length > 0) {
      setPageResults((current) => {
        const next = { ...current };
        activeJobPageIds.forEach((pageId) => {
          if (next[pageId]?.status === 'failed') {
            next[pageId] = { status: 'queued' };
          }
        });
        return next;
      });
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const job = await bulkCreateService.cancel(jobId);
      setActiveJob(job);
      setJobs((current) => [job, ...current.filter((item) => item._id !== job._id)]);
      setPageResults((current) => {
        const next = { ...current };
        activeJobPageIds.forEach((pageId) => {
          if (next[pageId]?.status === 'queued' || next[pageId]?.status === 'processing') {
            next[pageId] = { status: 'cancelled' };
          }
        });
        return next;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useBulkKeyboardShortcuts({
    layers,
    selectedLayerId,
    setEditingLayerId,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onUndo: undoLayers,
    onRedo: redoLayers,
  });

  const {
    handleSelectionStart,
    handleSelectionMove,
    handleSelectionEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleRotateStart,
    handleRotateMove,
    handleRotateEnd,
  } = useCanvasInteractions({
    canvasRef,
    layers,
    setLayers,
    selectedLayerIds,
    setSelectedLayerIds,
    setSelectedLayerId,
    editingLayerId,
    setEditingLayerId,
    setSelectionBox,
    setBackgroundSelected,
    setActiveTool,
    clearLayerSelection,
    selectLayer,
    recordLayerHistory,
    updateLayer,
  });

  const closeWorkspace = () => closeBulkWorkspace(onClose);

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden bg-white">
      <CampaignSetupDialog
        open={campaignSetupOpen}
        step={campaignSetupStep}
        search={campaignSearch}
        campaigns={matchingCampaigns}
        selectedCampaign={selectedCampaign}
        selectedCampaignId={selectedCampaignId}
        campaignContext={campaignContext}
        loadingCampaigns={loadingCampaigns}
        loadingCampaignOrders={loadingCampaignOrders}
        availableCampaignSlotCount={availableCampaignSlotCount}
        onSearch={setCampaignSearch}
        onStep={setCampaignSetupStep}
        onChooseStandalone={() => { setBulkTarget('standalone'); setCampaignOrderImportId(''); setCampaignDataSource('manual'); setCampaignSetupOpen(false); }}
        onChooseCampaign={() => { setBulkTarget('campaign'); setCampaignSearch(''); setCampaignSetupStep('select_campaign'); void loadCampaignsForImport(); }}
        onSelectCampaign={(campaignId) => { setSelectedCampaignId(campaignId); setCampaignOrderImportId(''); setCampaignContext(null); setCampaignSearch(''); setCampaignSetupStep('confirm_campaign'); void loadCampaignContext(campaignId); }}
        onConfirmCampaign={() => { setCampaignOrderImportId(selectedCampaignId); setCampaignSetupOpen(false); setActiveTool('data'); setSidebarOpen(true); }}
      />
      <nav className="flex w-[76px] shrink-0 flex-col border-r border-slate-200 bg-white py-3">
        <button
          type="button"
          onClick={closeWorkspace}
          className="mb-3 flex items-center justify-center transition-transform hover:scale-105"
          title="Quay lại Xưởng nội dung"
        >
          <div className="relative">
            <img
              src={BRAND_LOGO_PATH}
              alt={BRAND_NAME}
              className="h-11 w-11 rounded-2xl border border-blue-100 bg-white object-cover shadow-md shadow-blue-500/10"
            />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white">
              <ArrowLeft className="h-2.5 w-2.5" />
            </span>
          </div>
        </button>
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button key={tool.id} type="button" onClick={() => { setAiHtmlMode(false); if (active && sidebarOpen) setSidebarOpen(false); else { setActiveTool(tool.id); setSidebarOpen(true); } }} className={`mx-2 mb-1 flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${active && sidebarOpen && !aiHtmlMode ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-5 w-5" />{tool.label}
              {tool.id === 'data' && layers.length > 0 && <span className="absolute hidden" />}
            </button>
          );
        })}
        <button type="button" onClick={() => { if (aiHtmlMode && sidebarOpen) setSidebarOpen(false); else { setAiHtmlMode(true); setSidebarOpen(true); } }} className={`mx-2 mb-1 flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-xs font-bold transition ${aiHtmlMode && sidebarOpen ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`} title="Thiết kế và chỉnh sửa trang bằng AI">
          <WandSparkles className="h-5 w-5" />Thiết kế AI
        </button>
      </nav>

      <aside className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ${sidebarOpen ? 'w-[320px]' : 'w-0 border-r-0'}`}>
        <div className="flex min-h-0 w-[320px] flex-1">
          {aiHtmlMode ? (
            <BulkAiPanel
              scene={editorScene}
              values={activeRow?.values || {}}
              history={aiHistory}
              onHistoryChange={setAiHistory}
              onApply={applyAiScene}
              onUndo={undoLayers}
              onClose={() => setSidebarOpen(false)}
            />
          ) : (
            <EditorPanel
          activeTool={activeTool}
          backgroundImage={backgroundImage}
          backgroundColor={backgroundColor}
          layers={layers}
          rows={rows}
          dataColumns={dataColumns}
          dataStep={dataStep}
          dataSourceName={dataSourceName}
          activeRowId={activeRowId}
          sheetInput={sheetInput}
          googleSheetUrl={googleSheetUrl}
          loadingSheet={loadingSheet}
          campaigns={campaigns}
          selectedCampaignId={selectedCampaignId}
          bulkTarget={bulkTarget}
          campaignContext={campaignContext}
          loadingCampaigns={loadingCampaigns}
          loadingCampaignOrders={loadingCampaignOrders}
          readyCount={readyCount}
          canvasSize={canvasSize}
          systemTemplates={BULK_MARKETING_PRESETS}
          templates={templates}
          loadingTemplates={loadingTemplates}
          canvaStatus={canvaStatus}
          canvaDesigns={canvaDesigns}
          loadingCanva={loadingCanva}
          canvaError={canvaError}
          templatesTotal={templatesTotal}
          templatePage={templatePage}
          onChangeTemplatePage={goToTemplatePage}
          communityTemplates={communityTemplates}
          jobs={jobs}
          activeJob={activeJob}
          jobItems={jobItems}
          onBackgroundUpload={(value) => {
            recordLayerHistory();
            setBackgroundImage(value);
            setBackgroundId('');
            setBackgroundSelected(true);
            clearLayerSelection();
          }}
          onUploadAsset={(file, target) => void uploadLibraryAsset(file, target)}
          onBackgroundColor={(value) => { recordLayerHistory(); setBackgroundColor(value); setBackgroundImage(''); setBackgroundId('blank'); setBackgroundSelected(true); clearLayerSelection(); }}
          onRemoveBackground={() => { recordLayerHistory(); setBackgroundImage(''); setBackgroundId('blank'); setBackgroundSelected(true); clearLayerSelection(); }}
          onAddLayer={addLayer}
          onSelectLayer={(id) => { selectLayer(id); setBackgroundSelected(false); }}
          onSheetInput={setSheetInput}
          onImportSheet={importSheet}
          onDataStep={setDataStep}
          onGoogleSheetUrl={setGoogleSheetUrl}
          onImportGoogleSheet={() => void importGoogleSheet()}
          onLoadCampaigns={() => void loadCampaignsForImport()}
          onSelectCampaign={(campaignId) => {
            setSelectedCampaignId(campaignId);
            setCampaignContext(null);
            setCampaignOrderImportId('');
            if (campaignId) void loadCampaignContext(campaignId);
          }}
          onBulkTarget={(target) => {
            setBulkTarget(target);
            if (target === 'campaign' && campaigns.length === 0) void loadCampaignsForImport();
            if (target === 'standalone') {
              setCampaignOrderImportId('');
              setCampaignDataSource('manual');
            }
          }}
          onImportCampaignOrders={() => void importCampaignOrders()}
          onConnectLayer={connectLayerData}
          onAutoMatch={autoMatchData}
          onToggleRow={toggleImportedRow}
          onSelectAllRows={selectAllImportedRows}
          onCreatePages={createPages}
          onImportExcel={(file) => void importExcel(file).catch((error) => setErrorMessage(error instanceof Error ? error.message : String(error)))}
          onCanvasSize={(size) => handleResize(size.width, size.height)}
          onApplySystemTemplate={applySystemTemplate}
          onAddRow={addRow}
          onSelectRow={setActiveRowId}
          onAssignCampaignSlot={(rowId, slotId) => {
            const orderId = campaignContext?.orders.find((order) => String(order.slotId || '') === slotId)?._id;
            setRows((current) => current.map((row) => row.id === rowId
              ? { ...row, campaignSlotId: slotId || undefined, campaignAssetOrderId: orderId }
              : row));
          }}
          onUpdateCell={updateCell}
          onDuplicateRow={duplicateRow}
          onRemoveRow={removeRow}
          onLoadTemplate={loadTemplate}
          onLoadMoreTemplates={loadMoreTemplates}
          onArchiveTemplate={(templateId) => void archiveTemplate(templateId)}
          onPublishTemplate={(templateId) => void setTemplateVisibility(templateId, 'public')}
          onUnpublishTemplate={(templateId) => void setTemplateVisibility(templateId, 'private')}
          onUseCommunityTemplate={(templateId) => void applyCommunityTemplate(templateId)}
          onOpenJob={(job) => void openJob(job)}
          onRetryJob={(jobId) => void retryJob(jobId)}
          onCancelJob={(jobId) => void cancelJob(jobId)}
          onDownloadJob={(job) => void downloadJob(job)}
          onClose={() => setSidebarOpen(false)}
          uploadedImages={uploadedImages}
          uploadingAsset={uploadingAsset}
          onDeleteUploadedImage={(assetId) => void deleteUploadedImage(assetId)}
          importingTemplate={importingTemplate}
          onImportTemplate={(file) => void importTemplateFile(file)}
          onStartCanvaConnection={() => void startCanvaConnection()}
          onRefreshCanva={() => void refreshCanva()}
          />
          )}
        </div>
      </aside>

      <div className="relative z-30 w-0 shrink-0">
        <button type="button" onClick={() => setSidebarOpen((current) => !current)} className="absolute -left-4 top-20 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:text-indigo-600" title={sidebarOpen ? 'Ẩn bảng tùy chọn' : 'Mở bảng tùy chọn'}>
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#f4f5f7]">
        <BulkWorkspaceHeader
          onClose={onClose}
          canUndo={undoRef.current.length > 0}
          canRedo={redoRef.current.length > 0}
          onUndo={undoLayers}
          onRedo={redoLayers}
          onCreateNew={createNewTemplate}
          templateName={templateName}
          onTemplateNameChange={setTemplateName}
          autoSaveStatus={autoSaveStatus}
          pagesCreated={pagesCreated}
          readyCount={readyCount}
          busy={busy}
          activeJob={activeJob}
          assetUploadProgress={assetUploadProgress}
          onStartGeneration={() => void startGeneration()}
          shareMenuOpen={shareMenuOpen}
          onToggleShareMenu={() => setShareMenuOpen((current) => !current)}
          companyMembers={companyMembers}
          memberSearchQuery={memberSearchQuery}
          onMemberSearchQueryChange={setMemberSearchQuery}
          templateId={savedTemplateId}
          visibility={templates.find((template) => template._id === savedTemplateId)?.visibility || 'private'}
          onVisibilityChange={(visibility) => void handleToggleVisibility(visibility)}
          downloadingJob={downloadingJob}
          onDownloadJob={(job) => void downloadJob(job)}
        />

        <PropertiesToolbar
          selectedLayer={selectedLayer}
          recordLayerHistory={recordLayerHistory}
          updateLayer={updateLayer}
          changeLayer={changeLayer}
          duplicateLayer={duplicateLayer}
          removeLayer={removeLayer}
          alignLayer={alignLayer}
          onRemoveImageBackground={() => void removeSelectedImageBackground()}
          removingBackground={removingBackground}
          onOptimizeReadability={optimizeReadability}
        />

        <BulkWorkspaceStatus
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage('')}
          activeJob={activeJob}
        />

        <EditorCanvas
          activeTool={activeTool}
          layers={layers}
          activeRow={activeRow}
          selectedLayerId={selectedLayerId}
          selectedLayerIds={selectedLayerIds}
          editingLayerId={editingLayerId}
          selectionBox={selectionBox}
          backgroundSelected={backgroundSelected}
          backgroundColor={backgroundColor}
          backgroundImage={backgroundImage}
          canvasSize={canvasSize}
          selectedBackground={selectedBackground}
          canvasDisplayWidth={canvasDisplayWidth}
          canvasDisplayHeight={canvasDisplayHeight}
          editorViewportRef={editorViewportRef}
          canvasRef={canvasRef}
          setSelectedLayerId={selectLayer}
          setEditingLayerId={setEditingLayerId}
          setBackgroundSelected={setBackgroundSelected}
          changeLayer={changeLayer}
          duplicateLayer={duplicateLayer}
          removeLayer={removeLayer}
          removeSelectedLayers={removeSelectedLayers}
          duplicateSelectedLayers={duplicateSelectedLayers}
          toggleLockSelectedLayers={toggleLockSelectedLayers}
          alignSelectedLayers={alignSelectedLayers}
          toggleGroupSelectedLayers={toggleGroupSelectedLayers}
          handlePointerDown={handlePointerDown}
          handlePointerMove={handlePointerMove}
          handlePointerUp={handlePointerUp}
          handleSelectionStart={handleSelectionStart}
          handleSelectionMove={handleSelectionMove}
          handleSelectionEnd={handleSelectionEnd}
          handleResizeStart={handleResizeStart}
          handleResizeMove={handleResizeMove}
          handleResizeEnd={handleResizeEnd}
          handleRotateStart={handleRotateStart}
          handleRotateMove={handleRotateMove}
          handleRotateEnd={handleRotateEnd}
          updateCell={updateCell}
          recordLayerHistory={recordLayerHistory}
          onOpenContextMenu={(clientX, clientY, targetLayerId) => {
            setContextMenu({
              visible: true,
              x: clientX,
              y: clientY,
              targetLayerId,
            });
          }}
          onSetBackgroundImage={(url) => {
            recordLayerHistory();
            setBackgroundImage(url);
            setBackgroundId('');
            setBackgroundSelected(true);
            clearLayerSelection();
          }}
          onDropAsset={(url, clientX, clientY) => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            if (!bounds) {
              addLayer('image', url);
              return;
            }
            const width = 30;
            const height = 30;
            const x = clamp(((clientX - bounds.left) / bounds.width) * 100 - width / 2, 0, 100 - width);
            const y = clamp(((clientY - bounds.top) / bounds.height) * 100 - height / 2, 0, 100 - height);
            addLayer('image', url, { x, y, width, height });
          }}
          onDropLayerPreset={(payload: LayerPresetDragPayload, clientX, clientY) => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            if (!bounds) {
              addLayer(payload.type, payload.initialValue, payload.overrides);
              return;
            }
            addLayer(
              payload.type,
              payload.initialValue,
              payload.overrides,
              {
                centerX: ((clientX - bounds.left) / bounds.width) * 100,
                centerY: ((clientY - bounds.top) / bounds.height) * 100,
              },
            );
          }}
        />

        <PageStrip
          scene={editorScene}
          rows={visiblePages}
          activeRowId={activeRowId}
          pageResults={pageResults}
          isRowReady={isRowReady}
          getRowIssue={getRowIssue}
          onSelectRow={(rowId) => {
            setActiveRowId(rowId);
            clearLayerSelection();
            setBackgroundSelected(false);
          }}
          onAddRow={addRow}
          hasCopiedPage={!!copiedPage}
          onCopyRow={copyPage}
          onPasteRow={pastePageAfter}
          onDuplicateRow={duplicatePage}
          onRenameRow={renamePage}
          onDeleteRow={removeRow}
          onDownloadRow={(row, index) => void downloadPage(row, index)}
          zoomPercent={zoomPercent}
          zoomMode={zoomMode}
          changeZoom={changeZoom}
          fitCanvasToViewport={fitCanvasToViewport}
        />
      </main>

      {contextMenu?.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasLayerSelected={!!selectedLayerId}
          hasCopiedLayer={!!copiedLayerRef.current}
          canvasSize={canvasSize}
          selectedLayer={selectedLayer}
          layers={layers}
          dataColumns={dataColumns}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onResize={handleResize}
          onConnectData={connectLayerData}
        />
      )}
    </div>
  );
}
