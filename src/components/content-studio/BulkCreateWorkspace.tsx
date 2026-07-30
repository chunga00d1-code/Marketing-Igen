import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Sparkles,
  Share2,
  Undo2,
  Search,
  Users,
  Link,
  ArrowLeft,
  FilePlus2,
  Cloud,
  CloudCheck,
  CloudOff,
  LoaderCircle,
  WandSparkles,
} from 'lucide-react';
import {
  bulkCreateService,
  type BulkAsset,
  type BulkAiHistoryMessage,
  type BulkAiSceneResult,
  type BulkDataColumn,
  type BulkImportedRow,
  type BulkRenderItem,
  type BulkRenderJob,
  type BulkTemplate,
  type BulkTemplatePayload,
} from '../../services/bulkCreateService';
import {
  marketingCampaignService,
  type MarketingCampaignSummary,
} from '../../services/marketingCampaignService';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import type { UserProfile } from '../../types';
import { toast } from '../../pages/Toast';
import { BRAND_LOGO_PATH, BRAND_NAME } from '../../config/brand';

import type {
  EditorTool,
  LayerPresetDragPayload,
  LayerType,
  TemplateLayer,
  DataRow,
  EditorSnapshot,
  ResizeCorner,
  SelectionBox,
  PageRenderState,
} from './bulk-create/types';
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

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function pageFilename(name: string, index: number) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${normalized || `trang-${index + 1}`}.png`;
}

function triggerFileDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function createRow(layers: TemplateLayer[], values: Record<string, string> = {}): DataRow {
  return {
    id: makeId('row'),
    values: Object.fromEntries(layers.map((layer) => [
      layer.id,
      values[layer.id] || layer.defaultValue || (
        layer.type === 'text' && layer.layerKind !== 'shape' ? layer.fieldName : ''
      ),
    ])),
    selected: true,
  };
}

function normalizeDataKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dataMatchTokens(value: string) {
  return normalizeDataKey(value)
    .split('-')
    .filter(Boolean)
    .map((token) => {
      if (['anh', 'hinh', 'image', 'photo', 'picture'].includes(token)) return 'image';
      if (['chu', 'text'].includes(token)) return 'text';
      return token;
    });
}

function matchLayersToColumns(
  currentLayers: TemplateLayer[],
  columns: BulkDataColumn[]
) {
  const claimedColumnKeys = new Set<string>();
  return currentLayers.map((layer) => {
    const currentColumn = layer.dataBinding
      ? columns.find((column) =>
          column.key === layer.dataBinding?.columnKey && column.type === layer.type
        )
      : undefined;
    if (currentColumn) {
      claimedColumnKeys.add(currentColumn.key);
      return {
        ...layer,
        dataBinding: {
          columnKey: currentColumn.key,
          columnLabel: currentColumn.label,
        },
      };
    }

    const layerKey = normalizeDataKey(layer.fieldName);
    const layerTokens = dataMatchTokens(layer.fieldName);
    const availableColumns = columns.filter((column) =>
      column.type === layer.type && !claimedColumnKeys.has(column.key)
    );
    const ranked = availableColumns
      .map((column, index) => {
        const columnTokens = dataMatchTokens(column.label);
        const sharedTokens = layerTokens.filter((token) => columnTokens.includes(token));
        const layerNumber = layerTokens.find((token) => /^\d+$/.test(token));
        const columnNumber = columnTokens.find((token) => /^\d+$/.test(token));
        const score =
          (column.key === layerKey ? 10_000 : 0) +
          sharedTokens.length * 100 +
          (layerNumber && layerNumber === columnNumber ? 500 : 0) +
          (layerKey.includes(column.key) || column.key.includes(layerKey) ? 25 : 0) -
          index;
        return { column, score };
      })
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || best.score <= 0) {
      return { ...layer, dataBinding: undefined };
    }
    claimedColumnKeys.add(best.column.key);
    return {
      ...layer,
      dataBinding: {
        columnKey: best.column.key,
        columnLabel: best.column.label,
      },
    };
  });
}

function extractTableRegion<T>(matrix: T[][]) {
  const populatedRows = matrix.filter((row) =>
    row.some((cell) => String(cell ?? '').trim())
  );
  let bestHeaderIndex = -1;
  let bestHeaderColumns: number[] = [];
  let bestScore = -1;

  populatedRows.slice(0, -1).forEach((row, rowIndex) => {
    const headerColumns = row
      .map((cell, columnIndex) => String(cell ?? '').trim() ? columnIndex : -1)
      .filter((columnIndex) => columnIndex >= 0);
    const supportedColumns = headerColumns.filter((columnIndex) =>
      populatedRows.slice(rowIndex + 1).some(
        (dataRow) => String(dataRow[columnIndex] ?? '').trim()
      )
    );
    if (supportedColumns.length === 0) return;
    const score = supportedColumns.length * 100 + headerColumns.length;
    if (score > bestScore) {
      bestScore = score;
      bestHeaderIndex = rowIndex;
      bestHeaderColumns = headerColumns;
    }
  });

  if (bestHeaderIndex < 0 || bestHeaderColumns.length === 0) return populatedRows;
  const firstColumn = bestHeaderColumns[0];
  const lastColumn = bestHeaderColumns[bestHeaderColumns.length - 1];
  return populatedRows
    .slice(bestHeaderIndex)
    .map((row) => row.slice(firstColumn, lastColumn + 1));
}

function matrixToDataSet(matrix: Array<Array<string | number | boolean>>) {
  const data = extractTableRegion(matrix);
  if (data.length < 2) throw new Error('Dữ liệu cần một dòng tiêu đề và ít nhất một dòng nội dung.');
  if (data[0].length > 50) throw new Error('Dữ liệu chỉ được tối đa 50 cột.');
  const labels = data[0].map((cell) => String(cell ?? '').trim());
  if (labels.some((label) => !label)) throw new Error('Dòng tiêu đề có cột để trống.');
  const keys = labels.map(normalizeDataKey);
  if (keys.some((key) => !key)) {
    throw new Error('Tên cột cần có ít nhất một chữ cái hoặc chữ số.');
  }
  if (new Set(keys).size !== keys.length) throw new Error('Dòng tiêu đề có tên cột bị trùng.');
  const sourceRows = data.slice(1).slice(0, 100);
  const columns: BulkDataColumn[] = labels.map((label, columnIndex) => {
    const samples = sourceRows
      .map((row) => String(row[columnIndex] ?? '').trim())
      .filter(Boolean)
      .slice(0, 4);
    return {
      key: keys[columnIndex],
      label,
      type: (
        /(ảnh|hình|image|photo|logo|avatar|thumbnail)/i.test(label) ||
        samples.some((value) => /^https:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value))
      ) ? 'image' : 'text',
      samples,
    };
  });
  const rows: BulkImportedRow[] = sourceRows.map((row, rowIndex) => ({
    id: `import-row-${rowIndex + 1}`,
    selected: true,
    cells: Object.fromEntries(columns.map((column, columnIndex) => [
      column.key,
      String(row[columnIndex] ?? '').trim(),
    ])),
  }));
  return { columns, rows };
}

function estimateTextLayerWidth(text: string, fontSize: number, canvasWidth: number) {
  const characterCount = Math.max(1, Array.from(text.trim()).length);
  const estimatedPixelWidth = characterCount * fontSize * 0.58 + fontSize;
  return clamp(Math.round((estimatedPixelWidth / canvasWidth) * 100), 18, 64);
}

function normalizeLayerBounds(
  layer: TemplateLayer,
  canvas: { width: number; height: number }
): TemplateLayer {
  const width = clamp(Number(layer.width), 1, 100);
  const height = clamp(Number(layer.height), 1, 100);
  return {
    ...layer,
    x: clamp(Number(layer.x), 0, 100 - width),
    y: clamp(Number(layer.y), 0, 100 - height),
    width,
    height,
    rotation: clamp(Number(layer.rotation), -360, 360),
    zIndex: clamp(Number(layer.zIndex), 0, 1000),
    fontSize: layer.type === 'text'
      ? clamp(Number(layer.fontSize || 60), 8, Math.min(300, Math.max(8, canvas.width / 2)))
      : layer.fontSize,
  };
}

function snapToClosest(value: number, targets: number[], threshold = 1.2) {
  const closest = targets.reduce(
    (best, target) => Math.abs(target - value) < Math.abs(best - value) ? target : best,
    value
  );
  return Math.abs(closest - value) <= threshold ? closest : value;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Không thể đọc ảnh đã chọn.'));
    };
    reader.onerror = () => reject(new Error('Không thể đọc ảnh đã chọn.'));
    reader.readAsDataURL(file);
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(runners);
  return results;
}


interface BulkCreateWorkspaceProps {
  onClose?: () => void;
  cardId?: string;
  onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
}

type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function BulkCreateWorkspace({ onClose }: BulkCreateWorkspaceProps = {}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorViewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ layerId: string; layerIds: string[]; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ layerId: string; corner: ResizeCorner; pointerX: number; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const selectionRef = useRef<{ startX: number; startY: number; additive: boolean } | null>(null);
  const selectionBoxRef = useRef<SelectionBox | null>(null);
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
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingCampaignOrders, setLoadingCampaignOrders] = useState(false);
  const [campaignOrderImportId, setCampaignOrderImportId] = useState('');
  const [templateName, setTemplateName] = useState('Thiết kế chưa đặt tên');
  const [savedTemplateId, setSavedTemplateId] = useState('');
  const savedTemplateIdRef = useRef('');
  const aiHistoryStorageReadyRef = useRef(false);
  const aiHistoryStorageKey = `igen-bulk-ai-history:${savedTemplateId || templateName}`;

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
      // Local history is an enhancement; private browsing/storage limits must not block editing.
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
  const [copiedPage, setCopiedPage] = useState<DataRow | null>(null);
  const rotateRef = useRef<{
    layerId: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);

  const [uploadedImages, setUploadedImages] = useState<BulkAsset[]>([]);
  const [uploadingAsset, setUploadingAsset] = useState(false);

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
      const missingLayers = layers.filter((layer) => (
        layer.layerKind !== 'shape' && !row.values[layer.id]?.trim()
      ));
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
    const layerKind = overrides?.layerKind || 'text';
    const isShape = layerKind === 'shape';
    const isIcon = layerKind === 'icon';
    const number = layers.filter((layer) => (
      layer.type === type
      && (type !== 'text' || (layer.layerKind || 'text') === layerKind)
    )).length + 1;

    const baseFieldName = (
      type === 'image'
        ? 'Hình ảnh'
        : isShape
          ? 'Hình khối'
          : layerKind === 'badge'
            ? 'Nhãn'
            : layerKind === 'cta'
              ? 'Nút kêu gọi'
              : layerKind === 'icon'
                ? 'Biểu tượng'
                : overrides?.fieldName || 'Nội dung chữ'
    );
    let finalFieldName = baseFieldName;
    let nameNumber = 2;
    while (layers.some((l) => l.fieldName.toLowerCase() === finalFieldName.toLowerCase())) {
      finalFieldName = `${baseFieldName} ${nameNumber++}`;
    }
    const initialFontSize = overrides?.fontSize || 60;
    const initialText = initialValue || (isShape ? '' : isIcon ? '★' : finalFieldName);
    const layerWidth = type === 'text'
      ? isShape || isIcon
        ? 18
        : layerKind === 'badge' || layerKind === 'cta'
          ? 42
          : estimateTextLayerWidth(initialText, initialFontSize, canvasSize.width)
      : 40;
    const layerHeight = type === 'text'
      ? isShape || isIcon
        ? 18
        : layerKind === 'badge' || layerKind === 'cta'
          ? 12
          : Math.max(4, Math.round(initialFontSize * 0.125))
      : 40;
    const defaultX = type === 'text' ? (isShape ? 18 : isIcon ? 42 : 10) : 30;
    const defaultY = type === 'text' ? (isShape || isIcon ? 36 : 12 + (number - 1) * 12) : 38;

    const layer: TemplateLayer = {
      id: makeId('field'),
      type,
      layerKind: type === 'text' ? layerKind : undefined,
      rotation: 0,
      zIndex: layers.length,
      locked: false,
      fit: 'contain',
      fontSize: type === 'text'
        ? isIcon
          ? 72
          : layerKind === 'badge' || layerKind === 'cta'
            ? 28
            : 60
        : 24,
      fontFamily: 'DejaVu Sans',
      fontWeight: 700,
      color: isIcon ? '#f59e0b' : '#000000',
      textAlign: 'left',
      autoFit: true,
      minFontSize: 12,
      fillColor: isShape ? '#e2e8f0' : layerKind === 'badge' ? '#fef3c7' : layerKind === 'cta' ? '#2563eb' : undefined,
      borderRadius: isShape ? 12 : layerKind === 'badge' || layerKind === 'cta' ? 999 : 0,
      padding: layerKind === 'badge' || layerKind === 'cta' ? 12 : 0,
      ...overrides,
      fieldName: finalFieldName,
      x: placement
        ? clamp(placement.centerX - layerWidth / 2, 0, 100 - layerWidth)
        : overrides?.x ?? defaultX,
      y: placement
        ? clamp(placement.centerY - layerHeight / 2, 0, 100 - layerHeight)
        : overrides?.y ?? defaultY,
      width: overrides?.width ?? layerWidth,
      height: overrides?.height ?? layerHeight,
      defaultValue: overrides?.defaultValue ?? (initialText || (type === 'text' && !isShape ? finalFieldName : '')),
    };
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'c') {
          event.preventDefault();
          handleCopy();
        } else if (event.key.toLowerCase() === 'v') {
          event.preventDefault();
          handlePaste();
        } else if (event.key.toLowerCase() === 'd') {
          event.preventDefault();
          handleDuplicate();
        }
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste, handleDuplicate, handleDelete]);

  const updateCell = (rowId: string, layerId: string, value: string) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    const bindingKey = layer.dataBinding?.columnKey;
    if (!bindingKey) {
      setLayers((current) => current.map((item) =>
        item.id === layerId ? { ...item, defaultValue: value } : item
      ));
      setRows((current) => current.map((row) => ({
        ...row,
        values: { ...row.values, [layerId]: value },
      })));
      return;
    }
    setRows((current) => current.map((row) => row.id === rowId
      ? {
          ...row,
          values: { ...row.values, [layerId]: value },
          sourceCells: { ...row.sourceCells, [bindingKey]: value },
        }
      : row));
  };

  const addRow = () => {
    const row = createRow(layers);
    setRows((current) => [...current, row]);
    setActiveRowId(row.id);
    setPagesCreated(true);
  };

  const duplicateRow = (row: DataRow) => {
    const duplicated = {
      ...createRow(layers, row.values),
      name: row.name ? `${row.name} - bản sao` : undefined,
      sourceCells: row.sourceCells ? { ...row.sourceCells } : undefined,
      campaignAssetOrderId: row.campaignAssetOrderId,
      campaignSlotId: row.campaignSlotId,
    };
    setRows((current) => [...current, duplicated]);
    setActiveRowId(duplicated.id);
    setPagesCreated(true);
  };

  const removeRow = (rowId: string) => {
    setPageResults((current) => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    if (rows.length === 1) {
      const replacement = createRow(layers);
      setRows([replacement]);
      setActiveRowId(replacement.id);
      return;
    }
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows);
    if (activeRowId === rowId) setActiveRowId(nextRows[0].id);
  };

  const copyPage = (row: DataRow) => {
    setCopiedPage({
      ...row,
      values: { ...row.values },
      sourceCells: row.sourceCells ? { ...row.sourceCells } : undefined,
    });
    toast.success(`Đã sao chép ${row.name || 'trang'}.`);
  };

  const insertPageAfter = (source: DataRow, afterRowId: string, name?: string) => {
    const inserted = {
      ...createRow(layers, source.values),
      name,
      sourceCells: source.sourceCells ? { ...source.sourceCells } : undefined,
      campaignAssetOrderId: source.campaignAssetOrderId,
      campaignSlotId: source.campaignSlotId,
      selected: true,
    };
    setRows((current) => {
      const targetIndex = current.findIndex((row) => row.id === afterRowId);
      const insertIndex = targetIndex >= 0 ? targetIndex + 1 : current.length;
      const next = [...current];
      next.splice(insertIndex, 0, inserted);
      return next;
    });
    setActiveRowId(inserted.id);
    setPagesCreated(true);
  };

  const pastePageAfter = (afterRowId: string) => {
    if (!copiedPage) return;
    insertPageAfter(
      copiedPage,
      afterRowId,
      copiedPage.name ? `${copiedPage.name} - bản sao` : 'Trang đã dán'
    );
  };

  const duplicatePage = (row: DataRow) => {
    insertPageAfter(
      row,
      row.id,
      row.name ? `${row.name} - bản sao` : 'Trang bản sao'
    );
  };

  const renamePage = (rowId: string, name: string) => {
    const normalizedName = name.trim().slice(0, 80);
    if (!normalizedName) return;
    setRows((current) => current.map((row) =>
      row.id === rowId ? { ...row, name: normalizedName } : row
    ));
  };

  const downloadPage = async (row: DataRow, index: number) => {
    const name = row.name || `Trang ${index + 1}`;
    const filename = pageFilename(name, index);
    const result = pageResults[row.id];
    try {
      if (result?.status === 'completed' && result.outputUrl) {
        triggerFileDownload(
          `/api/v1/media/download?url=${encodeURIComponent(result.outputUrl)}&filename=${encodeURIComponent(filename)}`,
          filename
        );
        return;
      }
      if (editorScene.layers.length === 0) {
        toast.error('Hãy thêm ít nhất một nội dung chữ hoặc ảnh trước khi tải trang.');
        return;
      }
      toast.info(`Đang chuẩn bị tải “${name}”...`);
      const previewUrl = await bulkCreateService.previewScene({
        name,
        sceneVersion: editorScene.sceneVersion,
        canvas: editorScene.canvas,
        background: editorScene.background,
        layers: editorScene.layers,
      }, row.values);
      triggerFileDownload(previewUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 10_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải trang.');
    }
  };

  const applyImportedData = (
    columns: BulkDataColumn[],
    importedRows: BulkImportedRow[],
    sourceName: string,
    sourceCampaignId = ''
  ) => {
    const nextLayers = matchLayersToColumns(layers, columns);
    const nextRows: DataRow[] = importedRows.map((row) => ({
      id: row.id || makeId('row'),
      campaignAssetOrderId: row.cells.order_id || undefined,
      campaignSlotId: row.cells.slot_id || undefined,
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

  const importGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) return;
    setLoadingSheet(true);
    setErrorMessage('');
    try {
      const preview = await bulkCreateService.previewPublicGoogleSheet(googleSheetUrl.trim());
      applyImportedData(
        preview.columns,
        preview.rows,
        `Google Sheet · ${preview.sheetName || 'Tự động'}`
      );
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

  const importSheet = () => {
    const matrix = sheetInput
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split('\t'));
    const dataSet = matrixToDataSet(matrix);
    applyImportedData(dataSet.columns, dataSet.rows, 'Dữ liệu đã dán');
  };

  const importExcel = async (file: File) => {
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
      ...Object.fromEntries(layers
        .filter((layer) => layer.type === 'image')
        .map((layer) => {
          const source = row.values[layer.id] || '';
          return [layer.id, uploadedImageUrls.get(source) || source];
        })),
      ...(row.campaignAssetOrderId ? { __campaign_asset_order_id: row.campaignAssetOrderId } : {}),
      ...(row.campaignSlotId ? { __campaign_slot_id: row.campaignSlotId } : {}),
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
      const job = await bulkCreateService.createJob(template._id, uploadedRows.values);
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
      const facebookCampaigns = result.campaigns.filter((campaign) => campaign.platforms.includes('Facebook'));
      setCampaigns(facebookCampaigns);
      setSelectedCampaignId((current) => current || facebookCampaigns[0]?._id || '');
      if (!facebookCampaigns.length) toast.warning('Chưa có chiến dịch Facebook để nhập Order.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải danh sách chiến dịch.');
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const importCampaignOrders = async () => {
    if (!selectedCampaignId) return;
    setLoadingCampaignOrders(true);
    setErrorMessage('');
    try {
      const preview = await marketingCampaignService.exportAssetOrdersForBulk(selectedCampaignId);
      if (!preview.rows.length) {
        toast.warning('Chiến dịch chưa có Order ảnh có thể nhập vào Bulk Create.');
        return;
      }
      applyImportedData(preview.columns, preview.rows, preview.sourceName, selectedCampaignId);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoLayers(); else undoLayers();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoLayers();
      } else if (selectedLayerId) {
        const layer = layers.find((l) => l.id === selectedLayerId);
        if (layer && layer.type === 'text' && !layer.locked) {
          const isModifier = event.ctrlKey || event.metaKey || event.altKey;
          if (!isModifier && (event.key === 'Backspace' || event.key.length === 1)) {
            setEditingLayerId(selectedLayerId);
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const pickLayersInBox = useCallback((box: SelectionBox, additive: boolean) => {
    const selectedIds = layers
      .filter((layer) => {
        const layerRight = layer.x + layer.width;
        const layerBottom = layer.y + layer.height;
        const boxRight = box.left + box.width;
        const boxBottom = box.top + box.height;
        return layer.x < boxRight && layerRight > box.left && layer.y < boxBottom && layerBottom > box.top;
      })
      .map((layer) => layer.id);

    const nextIds = additive ? Array.from(new Set([...selectedLayerIds, ...selectedIds])) : selectedIds;
    setSelectedLayerIds(nextIds);
    setSelectedLayerId(nextIds[nextIds.length - 1] || '');
    setBackgroundSelected(false);
    setEditingLayerId('');
  }, [layers, selectedLayerIds]);

  const handleSelectionStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
    const startY = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100);
    selectionRef.current = { startX, startY, additive: event.shiftKey };
    const initialBox = { left: startX, top: startY, width: 0, height: 0 };
    selectionBoxRef.current = initialBox;
    setSelectionBox(initialBox);
    setBackgroundSelected(false);
    setEditingLayerId('');
    if (!event.shiftKey) {
      clearLayerSelection();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSelectionMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const selection = selectionRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!selection || !rect || event.buttons === 0) return;
    const currentX = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
    const currentY = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100);
    const nextBox = {
      left: Math.min(selection.startX, currentX),
      top: Math.min(selection.startY, currentY),
      width: Math.abs(currentX - selection.startX),
      height: Math.abs(currentY - selection.startY),
    };
    selectionBoxRef.current = nextBox;
    setSelectionBox(nextBox);
  };

  const handleSelectionEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const selection = selectionRef.current;
    const box = selectionBoxRef.current;
    if (!selection) return;
    if (box && (box.width > 0.5 || box.height > 0.5)) {
      pickLayersInBox(box, selection.additive);
    } else {
      setBackgroundSelected(true);
      setActiveTool('background');
    }
    selectionRef.current = null;
    selectionBoxRef.current = null;
    setSelectionBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, layer: TemplateLayer) => {
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (editingLayerId !== layer.id) {
      setEditingLayerId('');
    }
    if (event.shiftKey) {
      setSelectedLayerIds((current) => {
        const next = current.includes(layer.id) ? current.filter((id) => id !== layer.id) : [...current, layer.id];
        setSelectedLayerId(next[next.length - 1] || '');
        return next;
      });
    } else {
      selectLayer(layer.id);
    }
    setBackgroundSelected(false);
    if (event.shiftKey || layer.locked || editingLayerId === layer.id) return;
    recordLayerHistory();
    const dragLayerIds = layer.groupId
      ? layers.filter((item) => item.groupId === layer.groupId && !item.locked).map((item) => item.id)
      : selectedLayerIds.length > 1 && selectedLayerIds.includes(layer.id)
        ? layers.filter((item) => selectedLayerIds.includes(item.id) && !item.locked).map((item) => item.id)
        : [layer.id];
    dragRef.current = {
      layerId: layer.id,
      layerIds: dragLayerIds,
      offsetX: event.clientX - (rect.left + rect.width * layer.x / 100),
      offsetY: event.clientY - (rect.top + rect.height * layer.y / 100),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect || event.buttons === 0) return;
    const layer = layers.find((item) => item.id === drag.layerId);
    if (!layer) return;
    const rawX = (event.clientX - rect.left - drag.offsetX) / rect.width * 100;
    const rawY = (event.clientY - rect.top - drag.offsetY) / rect.height * 100;
    const otherLayers = layers.filter((item) => !drag.layerIds.includes(item.id));
    const x = snapToClosest(rawX, [
      0,
      6,
      50 - layer.width / 2,
      94 - layer.width,
      100 - layer.width,
      ...otherLayers.flatMap((item) => [
        item.x,
        item.x + item.width - layer.width,
        item.x + item.width / 2 - layer.width / 2,
      ]),
    ]);
    const y = snapToClosest(rawY, [
      0,
      6,
      50 - layer.height / 2,
      94 - layer.height,
      100 - layer.height,
      ...otherLayers.flatMap((item) => [
        item.y,
        item.y + item.height - layer.height,
        item.y + item.height / 2 - layer.height / 2,
      ]),
    ]);
    const nextX = clamp(x, 0, Math.max(0, 100 - layer.width));
    const nextY = clamp(y, 0, Math.max(0, 100 - layer.height));
    if (drag.layerIds.length > 1) {
      const deltaX = nextX - layer.x;
      const deltaY = nextY - layer.y;
      setLayers((current) => current.map((item) => drag.layerIds.includes(item.id)
        ? {
            ...item,
            x: clamp(item.x + deltaX, 0, Math.max(0, 100 - item.width)),
            y: clamp(item.y + deltaY, 0, Math.max(0, 100 - item.height)),
          }
        : item));
    } else {
      updateLayer(layer.id, { x: nextX, y: nextY });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLButtonElement>, layer: TemplateLayer, corner: ResizeCorner) => {
    event.stopPropagation();
    if (layer.locked) return;
    recordLayerHistory();
    resizeRef.current = { layerId: layer.id, corner, pointerX: event.clientX, startX: layer.x, startY: layer.y, startWidth: layer.width, startHeight: layer.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const resize = resizeRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!resize || !rect || event.buttons === 0) return;
    const layer = layers.find((item) => item.id === resize.layerId);
    if (!layer) return;

    const deltaX = (event.clientX - resize.pointerX) / rect.width * 100;

    if (resize.corner === 'e') {
      const nextWidth = clamp(resize.startWidth + deltaX, 5, 100 - resize.startX);
      updateLayer(layer.id, {
        width: nextWidth,
      });
    } else if (resize.corner === 'w') {
      const nextWidth = clamp(resize.startWidth - deltaX, 5, resize.startX + resize.startWidth);
      const nextX = resize.startX + resize.startWidth - nextWidth;
      updateLayer(layer.id, {
        x: nextX,
        width: nextWidth,
      });
    } else {
      const delta = (event.clientX - resize.pointerX) / rect.width * 100;
      const fromWest = resize.corner === 'nw' || resize.corner === 'sw';
      const fromNorth = resize.corner === 'nw' || resize.corner === 'ne';
      const ratio = resize.startHeight / resize.startWidth;
      const maxWidth = fromWest ? resize.startX + resize.startWidth : 100 - resize.startX;
      const maxHeight = fromNorth ? resize.startY + resize.startHeight : 100 - resize.startY;
      const upperWidth = Math.max(5, Math.min(maxWidth, maxHeight / ratio));
      const nextWidth = clamp(resize.startWidth + (fromWest ? -delta : delta), 5, upperWidth);
      const nextHeight = nextWidth * ratio;
      updateLayer(layer.id, {
        x: fromWest ? resize.startX + resize.startWidth - nextWidth : resize.startX,
        y: fromNorth ? resize.startY + resize.startHeight - nextHeight : resize.startY,
        width: nextWidth,
        height: nextHeight,
      });
    }
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleRotateStart = (event: React.PointerEvent<HTMLButtonElement>, layer: TemplateLayer) => {
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    recordLayerHistory();

    const layerCenterX = rect.left + rect.width * (layer.x + layer.width / 2) / 100;
    const layerCenterY = rect.top + rect.height * (layer.y + layer.height / 2) / 100;

    const angle = Math.atan2(event.clientY - layerCenterY, event.clientX - layerCenterX);

    rotateRef.current = {
      layerId: layer.id,
      centerX: layerCenterX,
      centerY: layerCenterY,
      startAngle: angle,
      startRotation: layer.rotation || 0,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleRotateMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rotate = rotateRef.current;
    if (!rotate || event.buttons === 0) return;
    const layer = layers.find((item) => item.id === rotate.layerId);
    if (!layer) return;

    const currentAngle = Math.atan2(event.clientY - rotate.centerY, event.clientX - rotate.centerX);
    const deltaAngle = currentAngle - rotate.startAngle;
    let nextRotation = Math.round(rotate.startRotation + (deltaAngle * 180) / Math.PI);

    const snap = 3;
    const targets = [0, 90, 180, 270, -90, -180, -270, 360, -360];
    for (const t of targets) {
      if (Math.abs(nextRotation - t) < snap) {
        nextRotation = t;
        break;
      }
    }

    updateLayer(layer.id, {
      rotation: nextRotation,
    });
  };

  const handleRotateEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    rotateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const closeWorkspace = () => {
    if (onClose) {
      onClose();
      return;
    }
    window.history.pushState(null, '', '/xuong-noi-dung/tao-hinh-anh');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen overflow-hidden bg-white">
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
          loadingCampaigns={loadingCampaigns}
          loadingCampaignOrders={loadingCampaignOrders}
          readyCount={readyCount}
          canvasSize={canvasSize}
          systemTemplates={BULK_MARKETING_PRESETS}
          templates={templates}
          loadingTemplates={loadingTemplates}
          templatesHasMore={templatesHasMore}
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
          onSelectCampaign={setSelectedCampaignId}
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
          onDownloadJob={(job) => void bulkCreateService.downloadZip(job._id, job.templateName)}
          onClose={() => setSidebarOpen(false)}
          uploadedImages={uploadedImages}
          uploadingAsset={uploadingAsset}
          onDeleteUploadedImage={(assetId) => void deleteUploadedImage(assetId)}
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
        <div className="relative flex h-14 shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-4 text-white shadow-sm">
          <div className="flex shrink-0 items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-extrabold transition-colors hover:bg-white/20"
                title="Quay lại Xưởng nội dung"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Xưởng nội dung</span>
              </button>
            )}
            {onClose && <span className="h-5 w-px bg-white/20" />}

            {/* Undo / Redo */}
            <button type="button" onClick={undoLayers} disabled={undoRef.current.length === 0} className="rounded-lg p-2.5 hover:bg-white/15 disabled:opacity-30" title="Hoàn tác"><Undo2 className="h-5 w-5" /></button>
            <button type="button" onClick={redoLayers} disabled={redoRef.current.length === 0} className="rounded-lg p-2.5 hover:bg-white/15 disabled:opacity-30" title="Làm lại"><Redo2 className="h-5 w-5" /></button>
            <button
              type="button"
              onClick={createNewTemplate}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-extrabold hover:bg-white/15"
              title="Tạo thiết kế mới"
            >
              <FilePlus2 className="h-4 w-4" />
              <span className="hidden xl:inline">Tạo mới</span>
            </button>
          </div>
          <div className="flex max-w-xs flex-1 min-w-[120px] flex-col items-center justify-center md:max-w-md">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Thiết kế chưa đặt tên"
              className="w-full rounded-lg border-0 border-b border-transparent bg-transparent px-2 py-0.5 text-center text-sm font-extrabold text-white outline-none transition placeholder-white/50 hover:border-white/20 hover:bg-white/10 focus:border-white focus:bg-white/15"
              title="Đổi tên thiết kế"
            />
            <span
              className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${
                autoSaveStatus === 'error' ? 'text-rose-100' : 'text-white/70'
              }`}
            >
              {autoSaveStatus === 'saving' ? (
                <LoaderCircle className="h-3 w-3 animate-spin" />
              ) : autoSaveStatus === 'saved' ? (
                <CloudCheck className="h-3 w-3" />
              ) : autoSaveStatus === 'error' ? (
                <CloudOff className="h-3 w-3" />
              ) : (
                <Cloud className="h-3 w-3" />
              )}
              {autoSaveStatus === 'saving'
                ? 'Đang tự động lưu...'
                : autoSaveStatus === 'saved'
                  ? 'Đã tự động lưu'
                  : autoSaveStatus === 'dirty'
                    ? 'Sẽ tự động lưu'
                    : autoSaveStatus === 'error'
                      ? 'Tự động lưu thất bại'
                      : 'Tự động lưu khi bắt đầu thiết kế'}
            </span>
          </div>
          <div className="relative flex items-center gap-2">
            {pagesCreated && (
              <button
                type="button"
                onClick={() => void startGeneration()}
                disabled={
                  readyCount === 0 ||
                  busy ||
                  !!activeJob && ['queued', 'processing'].includes(activeJob.status)
                }
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:bg-white/30 disabled:text-white/70"
              >
                {busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {assetUploadProgress
                  ? `Đang tải ảnh ${assetUploadProgress.completed}/${assetUploadProgress.total}`
                  : busy
                    ? 'Đang đưa vào hàng chờ...'
                    : `Tạo ${readyCount} ảnh`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShareMenuOpen((current) => !current)}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-blue-700 shadow-sm hover:bg-blue-50"
            >
              <Share2 className="h-4 w-4" /> Chia sẻ
            </button>

            {shareMenuOpen && (
              <div
                className="absolute right-0 top-12 z-[1000] w-[340px] rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-extrabold text-slate-900">Chia sẻ thiết kế</h4>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <Users className="h-3 w-3" /> {companyMembers.length} thành viên
                  </span>
                </div>

                {/* Company Members Access */}
                <div className="mt-3 space-y-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Thành viên có quyền truy cập</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm thành viên công ty..."
                      value={memberSearchQuery}
                      onChange={(event) => setMemberSearchQuery(event.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-250 pl-9 pr-3 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin]">
                    {companyMembers
                      .filter((member) => {
                        const name = member.displayName || '';
                        const email = member.email || '';
                        const query = memberSearchQuery.toLowerCase();
                        return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
                      })
                      .map((member) => {
                        const initials = (member.displayName || member.email || 'US').slice(0, 2).toUpperCase();
                        return (
                          <div key={member.uid} className="flex items-center gap-2.5 py-1">
                            {member.photoURL ? (
                              <img src={member.photoURL} alt={member.displayName} className="h-7 w-7 rounded-full border border-slate-100 object-cover" />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-extrabold text-indigo-700">
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold text-slate-800">{member.displayName}</span>
                              <span className="block truncate text-[10px] text-slate-500">{member.email}</span>
                            </div>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase">
                              {member.role}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Access Level Option */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Cấp độ truy cập</label>
                  <div className="relative">
                    <select
                      value={templates.find((t) => t._id === savedTemplateId)?.visibility || 'private'}
                      onChange={(event) => void handleToggleVisibility(event.target.value as 'private' | 'public')}
                      className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pl-9 pr-10 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                    >
                      <option value="private">🔒 Chỉ bạn mới có quyền truy cập</option>
                      <option value="public">🌐 Công khai (Kho mẫu cộng đồng)</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 text-slate-500" />
                  </div>
                </div>

                {/* Copy Link Button */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const link = `${window.location.origin}${window.location.pathname}?template=${savedTemplateId || ''}`;
                      void navigator.clipboard.writeText(link).then(() => {
                        toast.success('Đã sao chép liên kết thiết kế!');
                      });
                    }}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50"
                  >
                    <Link className="h-3.5 w-3.5 text-slate-500" /> Sao chép liên kết
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                  {activeJob && ['completed', 'partial'].includes(activeJob.status) && (
                    <button
                      type="button"
                      onClick={() => void bulkCreateService.downloadZip(activeJob._id, activeJob.templateName)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      <Download className="h-4 w-4" /> Tải tất cả ảnh
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <PropertiesToolbar
          selectedLayer={selectedLayer}
          recordLayerHistory={recordLayerHistory}
          updateLayer={updateLayer}
          changeLayer={changeLayer}
          duplicateLayer={duplicateLayer}
          removeLayer={removeLayer}
          alignLayer={alignLayer}
        />

        {errorMessage && (
          <div className="mx-5 mt-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage('')}>
              Đóng
            </button>
          </div>
        )}
        {activeJob && ['queued', 'processing'].includes(activeJob.status) && (
          <div className="mx-5 mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm font-bold text-indigo-800">
              <span>Đang tạo {activeJob.completedItems}/{activeJob.totalItems} ảnh</span>
              <span>{activeJob.progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
          </div>
        )}

        <EditorCanvas
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
