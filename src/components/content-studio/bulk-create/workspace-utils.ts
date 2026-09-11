import type {
  BulkDataColumn,
  BulkImportedRow,
} from '../../../services/bulkCreateService';
import type { DataRow, LayerType, TemplateLayer } from './types';
import { clamp } from './utils';

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function pageFilename(name: string, index: number) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${normalized || `trang-${index + 1}`}.png`;
}

export function triggerFileDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function closeBulkWorkspace(onClose?: () => void) {
  if (onClose) {
    onClose();
    return;
  }
  window.history.pushState(null, '', '/xuong-noi-dung/tao-hinh-anh');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function createRow(
  layers: TemplateLayer[],
  values: Record<string, string> = {}
): DataRow {
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

export function matchLayersToColumns(
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
    if (!best || best.score <= 0) return { ...layer, dataBinding: undefined };
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

export function matrixToDataSet(matrix: Array<Array<string | number | boolean>>) {
  const data = extractTableRegion(matrix);
  if (data.length < 2) throw new Error('Dữ liệu cần một dòng tiêu đề và ít nhất một dòng nội dung.');
  if (data[0].length > 50) throw new Error('Dữ liệu chỉ được tối đa 50 cột.');
  const labels = data[0].map((cell) => String(cell ?? '').trim());
  if (labels.some((label) => !label)) throw new Error('Dòng tiêu đề có cột để trống.');
  const keys = labels.map(normalizeDataKey);
  if (keys.some((key) => !key)) throw new Error('Tên cột cần có ít nhất một chữ cái hoặc chữ số.');
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

export function estimateTextLayerWidth(text: string, fontSize: number, canvasWidth: number) {
  const characterCount = Math.max(1, Array.from(text.trim()).length);
  const estimatedPixelWidth = characterCount * fontSize * 0.58 + fontSize;
  return clamp(Math.round((estimatedPixelWidth / canvasWidth) * 100), 18, 64);
}

export function normalizeLayerBounds(
  layer: TemplateLayer,
  canvas: { width: number; height: number }
): TemplateLayer {
  const width = clamp(Number(layer.width), 0.1, 300);
  const height = clamp(Number(layer.height), 0.1, 300);
  return {
    ...layer,
    x: clamp(Number(layer.x), -50, 150),
    y: clamp(Number(layer.y), -50, 150),
    width,
    height,
    rotation: clamp(Number(layer.rotation), -360, 360),
    zIndex: clamp(Number(layer.zIndex), 0, 1000),
    fontSize: layer.type === 'text'
      ? clamp(Number(layer.fontSize || 60), 8, Math.min(300, Math.max(8, canvas.width / 2)))
      : layer.fontSize,
  };
}

export function optimizeLayersForReadability(
  currentLayers: TemplateLayer[],
  canvas: { width: number; height: number }
) {
  const hasImage = currentLayers.some((layer) => layer.type === 'image');
  const panelId = 'readability-panel';
  const panel: TemplateLayer = {
    id: panelId,
    type: 'text',
    layerKind: 'shape',
    fieldName: 'Vùng nội dung dễ đọc',
    x: hasImage ? 5 : 8,
    y: 8,
    width: hasImage ? 50 : 84,
    height: hasImage ? 68 : 76,
    rotation: 0,
    zIndex: 1,
    fillColor: '#ffffff',
    opacity: 0.88,
    borderRadius: 24,
    borderWidth: 0,
    padding: 0,
    locked: true,
  };

  const nextLayers = currentLayers.map((layer) => {
    if (layer.id === panelId) return panel;
    if (layer.type === 'image') {
      return normalizeLayerBounds({
        ...layer,
        x: hasImage ? 59 : layer.x,
        y: hasImage ? 23 : layer.y,
        width: hasImage ? 34 : layer.width,
        height: hasImage ? 52 : layer.height,
        zIndex: 3,
        fit: 'cover',
      }, canvas);
    }

    const field = `${layer.id} ${layer.fieldName}`.toLocaleLowerCase('vi-VN');
    const isBrand = field.includes('brand') || field.includes('thương hiệu');
    const isPrice = field.includes('price') || field.includes('giá');
    const isDescription = field.includes('subheadline') || field.includes('mô tả') || field.includes('lợi ích') || field.includes('thời hạn');
    const isTitle = field.includes('headline') || field.includes('tiêu đề') || field.includes('tên sản phẩm') || field.includes('tên sự kiện');
    const isCallToAction = layer.layerKind === 'cta' || layer.layerKind === 'badge';

    if (isCallToAction || layer.layerKind === 'shape' || layer.layerKind === 'icon') return layer;

    const contentX = hasImage ? 10 : 13;
    const contentWidth = hasImage ? 40 : 74;
    const base = {
      ...layer,
      x: contentX,
      width: contentWidth,
      zIndex: Math.max(4, layer.zIndex),
      fillColor: undefined,
      borderWidth: 0,
      borderRadius: 0,
      padding: 0,
      opacity: 1,
      textAlign: 'left' as const,
      autoFit: true,
      minFontSize: 20,
    };

    if (isBrand) return normalizeLayerBounds({ ...base, y: 13, height: 6, fontSize: 26, fontWeight: 800, color: '#4f46e5', letterSpacing: 1, textTransform: 'uppercase', maxLines: 1 }, canvas);
    if (isTitle) return normalizeLayerBounds({ ...base, y: 21, height: 17, fontSize: 62, fontWeight: 900, color: '#0f172a', letterSpacing: 0, textTransform: 'none', maxLines: 2 }, canvas);
    if (isDescription) return normalizeLayerBounds({ ...base, y: 41, height: 11, fontSize: 30, fontWeight: 500, color: '#334155', lineHeight: 1.25, maxLines: 3 }, canvas);
    if (isPrice) return normalizeLayerBounds({ ...base, y: 57, height: 12, fontSize: 60, fontWeight: 900, color: '#c2410c', maxLines: 1 }, canvas);
    return normalizeLayerBounds({ ...base, color: '#1e293b', maxLines: 3 }, canvas);
  });

  return {
    panelId,
    layers: currentLayers.some((layer) => layer.id === panelId)
      ? nextLayers
      : [panel, ...nextLayers],
  };
}

interface CreateTemplateLayerOptions {
  type: LayerType;
  initialValue?: string;
  overrides?: Partial<TemplateLayer>;
  placement?: { centerX: number; centerY: number };
  existingLayers: TemplateLayer[];
  canvas: { width: number; height: number };
}

export function createTemplateLayer({
  type,
  initialValue = '',
  overrides,
  placement,
  existingLayers,
  canvas,
}: CreateTemplateLayerOptions): TemplateLayer {
  const layerKind = overrides?.layerKind || 'text';
  const isShape = layerKind === 'shape';
  const isIcon = layerKind === 'icon';
  const number = existingLayers.filter((layer) => (
    layer.type === type && (type !== 'text' || (layer.layerKind || 'text') === layerKind)
  )).length + 1;
  const baseFieldName = type === 'image'
    ? 'Hình ảnh'
    : isShape
      ? 'Hình khối'
      : layerKind === 'badge'
        ? 'Nhãn'
        : layerKind === 'cta'
          ? 'Nút kêu gọi'
          : layerKind === 'icon'
            ? 'Biểu tượng'
            : overrides?.fieldName || 'Nội dung chữ';
  let finalFieldName = baseFieldName;
  let nameNumber = 2;
  while (existingLayers.some((layer) => layer.fieldName.toLowerCase() === finalFieldName.toLowerCase())) {
    finalFieldName = `${baseFieldName} ${nameNumber++}`;
  }

  const initialFontSize = overrides?.fontSize || 60;
  const initialText = initialValue || (isShape ? '' : isIcon ? '★' : finalFieldName);
  const width = type === 'text'
    ? isShape || isIcon
      ? 18
      : layerKind === 'badge' || layerKind === 'cta'
        ? 42
        : estimateTextLayerWidth(initialText, initialFontSize, canvas.width)
    : 40;
  const height = type === 'text'
    ? isShape || isIcon
      ? 18
      : layerKind === 'badge' || layerKind === 'cta'
        ? 12
        : Math.max(4, Math.round(initialFontSize * 0.125))
    : 40;
  const defaultX = type === 'text' ? (isShape ? 18 : isIcon ? 42 : 10) : 30;
  const defaultY = type === 'text' ? (isShape || isIcon ? 36 : 12 + (number - 1) * 12) : 38;

  return {
    id: makeId('field'),
    type,
    layerKind: type === 'text' ? layerKind : undefined,
    rotation: 0,
    zIndex: existingLayers.length,
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
    x: placement ? clamp(placement.centerX - width / 2, 0, 100 - width) : overrides?.x ?? defaultX,
    y: placement ? clamp(placement.centerY - height / 2, 0, 100 - height) : overrides?.y ?? defaultY,
    width: overrides?.width ?? width,
    height: overrides?.height ?? height,
    defaultValue: overrides?.defaultValue ?? (initialText || (type === 'text' && !isShape ? finalFieldName : '')),
  };
}

export function snapToClosest(value: number, targets: number[], threshold = 1.2) {
  const closest = targets.reduce(
    (best, target) => Math.abs(target - value) < Math.abs(best - value) ? target : best,
    value
  );
  return Math.abs(closest - value) <= threshold ? closest : value;
}

export function readFileAsDataUrl(file: File) {
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

export async function mapWithConcurrency<T, R>(
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

export async function waitForDerivedImage(url: string, attempts = 5): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Ảnh xóa nền chưa sẵn sàng.'));
        image.src = url;
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Ảnh xóa nền chưa sẵn sàng.');
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }
  throw lastError || new Error('Không thể tải ảnh sau khi xóa nền.');
}
