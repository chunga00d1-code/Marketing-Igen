import assert from 'node:assert/strict';
import test from 'node:test';
import * as exportModule from '../template-editor-export';
import * as replacementModule from '../template-editor-replacement';
import type { TemplateEditorItem } from '../types';

type ShortVideoReplacementIssue = {
  itemId: string;
  label: string;
  segmentDuration: number;
  requiredDuration: number;
  sourceDuration: number;
};

type ValidateReplacements = (
  items: TemplateEditorItem[]
) => ShortVideoReplacementIssue[];

type RequestTemplateExport = <T>(input: {
  validationIssues: ShortVideoReplacementIssue[];
  ensureAutosave: () => Promise<void>;
  createRender: () => Promise<T>;
}) => Promise<T>;

const replacementValidator = () => (
  replacementModule as unknown as {
    findShortVideoReplacementIssues?: ValidateReplacements;
  }
).findShortVideoReplacementIssues;

const exportRequest = () => (
  exportModule as unknown as {
    requestTemplateExport?: RequestTemplateExport;
  }
).requestTemplateExport;

const visualItem = (
  id: string,
  overrides: Partial<TemplateEditorItem> = {}
): TemplateEditorItem => ({
  id,
  trackId: 'track-video',
  type: 'video',
  start: 0,
  duration: 5,
  sourceUrl: 'https://example.test/replacement.mp4',
  label: 'Đoạn 1',
  replaceable: true,
  replacement: {
    originalType: 'video',
    sourceType: 'video',
    sourceDuration: 2.5,
  },
  order: 1,
  ...overrides,
});

test('finds replacement videos shorter than their template segment', () => {
  const validate = replacementValidator();
  assert.equal(typeof validate, 'function');
  if (!validate) return;

  assert.deepEqual(validate([visualItem('short-video')]), [{
    itemId: 'short-video',
    label: 'Đoạn 1',
    segmentDuration: 5,
    requiredDuration: 5,
    sourceDuration: 2.5,
  }]);
});

test('ignores long-enough videos, images, unknown durations, and untouched clips', () => {
  const validate = replacementValidator();
  assert.equal(typeof validate, 'function');
  if (!validate) return;

  const issues = validate([
    visualItem('long-video', {
      replacement: {
        originalType: 'video',
        sourceType: 'video',
        sourceDuration: 5,
      },
    }),
    visualItem('image', {
      type: 'image',
      replacement: {
        originalType: 'video',
        sourceType: 'image',
      },
    }),
    visualItem('unknown-duration', {
      replacement: {
        originalType: 'video',
        sourceType: 'video',
      },
    }),
    visualItem('untouched', { replacement: undefined }),
  ]);

  assert.deepEqual(issues, []);
});

test('requires replacement video duration to cover trim plus segment duration at the exact boundary', () => {
  const validate = replacementValidator();
  assert.equal(typeof validate, 'function');
  if (!validate) return;

  assert.deepEqual(validate([
    visualItem('equal-with-trim', {
      trim: 2.5,
      replacement: {
        originalType: 'video',
        sourceType: 'video',
        sourceDuration: 7.5,
      },
    }),
    visualItem('equal-zero-trim', {
      trim: 0,
      replacement: {
        originalType: 'video',
        sourceType: 'video',
        sourceDuration: 5,
      },
    }),
  ]), []);

  assert.deepEqual(validate([
    visualItem('short-by-fraction', {
      trim: 2.5,
      replacement: {
        originalType: 'video',
        sourceType: 'video',
        sourceDuration: 7.499,
      },
    }),
    visualItem('short-zero-trim', {
      trim: 0,
      replacement: {
        originalType: 'video',
        sourceType: 'video',
        sourceDuration: 4.999,
      },
    }),
  ]), [
    {
      itemId: 'short-by-fraction',
      label: 'Đoạn 1',
      segmentDuration: 5,
      requiredDuration: 7.5,
      sourceDuration: 7.499,
    },
    {
      itemId: 'short-zero-trim',
      label: 'Đoạn 1',
      segmentDuration: 5,
      requiredDuration: 5,
      sourceDuration: 4.999,
    },
  ]);
});

test('does not create a render when confirmed autosave rejects', async () => {
  const requestExport = exportRequest();
  assert.equal(typeof requestExport, 'function');
  if (!requestExport) return;
  let createCalls = 0;

  await assert.rejects(
    () => requestExport({
      validationIssues: [],
      ensureAutosave: async () => {
        throw new Error('Snapshot is not safely saved.');
      },
      createRender: async () => {
        createCalls += 1;
        return { id: 'render-1' };
      },
    }),
    /not safely saved/
  );
  assert.equal(createCalls, 0);
});

test('blocks export before autosave when a replacement video is too short', async () => {
  const requestExport = exportRequest();
  assert.equal(typeof requestExport, 'function');
  if (!requestExport) return;
  let autosaveCalls = 0;
  let createCalls = 0;

  await assert.rejects(
    () => requestExport({
      validationIssues: [{
        itemId: 'short-video',
        label: 'Đoạn 1',
        segmentDuration: 5,
        requiredDuration: 5,
        sourceDuration: 2.5,
      }],
      ensureAutosave: async () => {
        autosaveCalls += 1;
      },
      createRender: async () => {
        createCalls += 1;
        return { id: 'render-1' };
      },
    }),
    /ngắn hơn|shorter/i
  );
  assert.equal(autosaveCalls, 0);
  assert.equal(createCalls, 0);
});

test('creates a render only after validation and autosave succeed', async () => {
  const requestExport = exportRequest();
  assert.equal(typeof requestExport, 'function');
  if (!requestExport) return;
  const calls: string[] = [];

  const result = await requestExport({
    validationIssues: [],
    ensureAutosave: async () => {
      calls.push('autosave');
    },
    createRender: async () => {
      calls.push('create-render');
      return { id: 'render-1' };
    },
  });

  assert.deepEqual(calls, ['autosave', 'create-render']);
  assert.deepEqual(result, { id: 'render-1' });
});
