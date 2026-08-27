import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBulkSourceCropPixels } from '../bulk-create-renderer.service';

test('Bulk Create converts normalized sourceCrop coordinates to exact source pixels', () => {
  assert.deepEqual(
    resolveBulkSourceCropPixels(
      { x: 25, y: 10, width: 50, height: 40 },
      1200,
      800
    ),
    { left: 300, top: 80, width: 600, height: 320 }
  );
});

test('Bulk Create clamps sourceCrop pixels to valid non-empty image bounds', () => {
  assert.deepEqual(
    resolveBulkSourceCropPixels(
      { x: 99.9, y: 99.9, width: 0.1, height: 0.1 },
      101,
      51
    ),
    { left: 100, top: 50, width: 1, height: 1 }
  );
});
