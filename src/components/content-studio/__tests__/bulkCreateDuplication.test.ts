import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataRow, TemplateLayer } from '../bulk-create/types';
import { createRow } from '../bulk-create/workspace-utils';

function simulateUpdateCell(
  layers: TemplateLayer[],
  rows: DataRow[],
  rowId: string,
  layerId: string,
  value: string
): { nextLayers: TemplateLayer[]; nextRows: DataRow[] } {
  const layer = layers.find((item) => item.id === layerId);
  if (!layer) return { nextLayers: layers, nextRows: rows };
  const bindingKey = layer.dataBinding?.columnKey;

  let nextLayers = layers;
  if (rows.length === 1 && !bindingKey) {
    nextLayers = layers.map((item) =>
      item.id === layerId ? { ...item, defaultValue: value } : item
    );
  }

  const nextRows = rows.map((row) =>
    row.id === rowId
      ? {
          ...row,
          values: { ...row.values, [layerId]: value },
          ...(bindingKey
            ? { sourceCells: { ...(row.sourceCells || {}), [bindingKey]: value } }
            : {}),
        }
      : row
  );

  return { nextLayers, nextRows };
}

function simulateDuplicateRow(
  layers: TemplateLayer[],
  rows: DataRow[],
  sourceRow: DataRow
): DataRow[] {
  const duplicated: DataRow = {
    ...createRow(layers, sourceRow.values),
    name: sourceRow.name ? `${sourceRow.name} - bản sao` : 'Trang bản sao',
    sourceCells: sourceRow.sourceCells ? { ...sourceRow.sourceCells } : undefined,
    campaignAssetOrderId: sourceRow.campaignAssetOrderId,
    campaignSlotId: sourceRow.campaignSlotId,
  };
  return [...rows, duplicated];
}

test('BulkCreate - Page duplication and isolated image editing', () => {
  const imageLayer: TemplateLayer = {
    id: 'layer-img-1',
    type: 'image',
    fieldName: 'Ảnh sản phẩm',
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    rotation: 0,
    zIndex: 1,
    defaultValue: 'https://example.com/original-image.jpg',
  };

  const textLayer: TemplateLayer = {
    id: 'layer-txt-1',
    type: 'text',
    fieldName: 'Tiêu đề',
    x: 10,
    y: 60,
    width: 80,
    height: 20,
    rotation: 0,
    zIndex: 2,
    defaultValue: 'Sản phẩm mẫu 1',
  };

  const layers = [imageLayer, textLayer];

  // 1. Khởi tạo bản mẫu ban đầu (Trang 1)
  const initialRow = createRow(layers);
  initialRow.name = 'Trang 1';
  let rows = [initialRow];

  assert.equal(rows.length, 1);
  assert.equal(rows[0].values['layer-img-1'], 'https://example.com/original-image.jpg');
  assert.equal(rows[0].values['layer-txt-1'], 'Sản phẩm mẫu 1');

  // 2. Sao chép / Nhân bản Trang 1 thành Trang 2 (Bản sao)
  rows = simulateDuplicateRow(layers, rows, rows[0]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].name, 'Trang 1 - bản sao');
  assert.equal(rows[1].values['layer-img-1'], 'https://example.com/original-image.jpg');
  assert.equal(rows[1].values['layer-txt-1'], 'Sản phẩm mẫu 1');
  assert.notEqual(rows[0].id, rows[1].id, 'Trang sao chép phải có ID riêng biệt');

  // 3. Sửa ảnh và chữ trên Trang 2 (bản sao)
  const updatedPage2 = simulateUpdateCell(
    layers,
    rows,
    rows[1].id,
    'layer-img-1',
    'https://example.com/new-product-2.jpg'
  );
  rows = updatedPage2.nextRows;

  const updatedPage2Text = simulateUpdateCell(
    layers,
    rows,
    rows[1].id,
    'layer-txt-1',
    'Sản phẩm mới trang 2'
  );
  rows = updatedPage2Text.nextRows;

  // 4. KIỂM TRA: Trang 2 phải có ảnh & chữ mới
  assert.equal(
    rows[1].values['layer-img-1'],
    'https://example.com/new-product-2.jpg',
    'Trang 2 phải cập nhật ảnh mới'
  );
  assert.equal(
    rows[1].values['layer-txt-1'],
    'Sản phẩm mới trang 2',
    'Trang 2 phải cập nhật tiêu đề mới'
  );

  // 5. KIỂM TRA QUAN TRỌNG: Trang 1 (bản mẫu gốc) KHÔNG ĐƯỢC BỊ THAY ĐỔI
  assert.equal(
    rows[0].values['layer-img-1'],
    'https://example.com/original-image.jpg',
    'LỖI: Trang 1 bị thay đổi ảnh theo trang 2!'
  );
  assert.equal(
    rows[0].values['layer-txt-1'],
    'Sản phẩm mẫu 1',
    'LỖI: Trang 1 bị thay đổi tiêu đề theo trang 2!'
  );

  // 6. Nhân bản tiếp Trang 2 thành Trang 3 và sửa Trang 3
  rows = simulateDuplicateRow(layers, rows, rows[1]);
  assert.equal(rows.length, 3);
  const updatedPage3 = simulateUpdateCell(
    layers,
    rows,
    rows[2].id,
    'layer-img-1',
    'https://example.com/product-3.jpg'
  );
  rows = updatedPage3.nextRows;

  assert.equal(rows[0].values['layer-img-1'], 'https://example.com/original-image.jpg');
  assert.equal(rows[1].values['layer-img-1'], 'https://example.com/new-product-2.jpg');
  assert.equal(rows[2].values['layer-img-1'], 'https://example.com/product-3.jpg');
});
