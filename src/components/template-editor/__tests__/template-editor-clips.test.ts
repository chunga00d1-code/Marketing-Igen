import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisualClipSegments, transitionLabel } from '../template-editor-clips';
import type { TemplateEditorItem } from '../types';

const visualItem = (
  id: string,
  start: number,
  overrides: Partial<TemplateEditorItem> = {}
): TemplateEditorItem => ({
  id,
  trackId: 'visual-track',
  type: 'video',
  start,
  duration: 3,
  order: 0,
  ...overrides,
});

test('builds visual clips chronologically using provider positions as tie breakers', () => {
  const clips = buildVisualClipSegments([
    visualItem('later', 4, { providerBinding: { provider: 'shotstack', trackIndex: 0, clipIndex: 0 } }),
    visualItem('same-start-second', 0, { providerBinding: { provider: 'shotstack', trackIndex: 1, clipIndex: 1 } }),
    visualItem('same-start-first', 0, { providerBinding: { provider: 'shotstack', trackIndex: 1, clipIndex: 0 } }),
    visualItem('same-start-track-first', 0, { providerBinding: { provider: 'shotstack', trackIndex: 0, clipIndex: 2 } }),
    visualItem('audio', 0, { type: 'audio' }),
    visualItem('caption', 0, { type: 'text' }),
  ]);

  assert.deepEqual(clips.map((clip) => clip.item.id), [
    'same-start-track-first',
    'same-start-first',
    'same-start-second',
    'later',
  ]);
});

test('numbers only explicitly replaceable visual clips and locks all others', () => {
  const clips = buildVisualClipSegments([
    visualItem('locked', 0),
    visualItem('replaceable-video', 1, { replaceable: true }),
    visualItem('replaceable-image', 2, { type: 'image', replaceable: true }),
    visualItem('not-exactly-true', 3, { replaceable: false }),
  ]);

  assert.deepEqual(
    clips.map(({ item, replacementNumber, locked }) => ({ id: item.id, replacementNumber, locked })),
    [
      { id: 'locked', replacementNumber: null, locked: true },
      { id: 'replaceable-video', replacementNumber: 1, locked: false },
      { id: 'replaceable-image', replacementNumber: 2, locked: false },
      { id: 'not-exactly-true', replacementNumber: null, locked: true },
    ]
  );
});

test('locks an unbound replaceable visual only when it belongs to a Shotstack project', () => {
  const providerClips = buildVisualClipSegments([
    visualItem('bound', 0, {
      replaceable: true,
      providerBinding: {
        provider: 'shotstack',
        trackIndex: 0,
        clipIndex: 0,
      },
    }),
    visualItem('missing-binding', 3, {
      replaceable: true,
      providerBinding: undefined,
    }),
  ]);
  const standaloneClips = buildVisualClipSegments([
    visualItem('standalone', 0, {
      replaceable: true,
      providerBinding: undefined,
    }),
  ]);
  const orphanProviderClips = buildVisualClipSegments([
    visualItem('shotstack-0-1', 0, {
      replaceable: true,
      providerBinding: undefined,
    }),
  ]);

  assert.deepEqual(
    providerClips.map(({ item, replacementNumber, locked }) => ({
      id: item.id,
      replacementNumber,
      locked,
    })),
    [
      { id: 'bound', replacementNumber: 1, locked: false },
      { id: 'missing-binding', replacementNumber: null, locked: true },
    ]
  );
  assert.deepEqual(
    standaloneClips.map(({ replacementNumber, locked }) => ({ replacementNumber, locked })),
    [{ replacementNumber: 1, locked: false }]
  );
  assert.deepEqual(
    orphanProviderClips.map(({ replacementNumber, locked }) => ({ replacementNumber, locked })),
    [{ replacementNumber: null, locked: true }]
  );
});

test('labels transitions only when a transition is provided', () => {
  assert.equal(transitionLabel({ in: 'fade', out: 'slideLeft' }), 'Vào: fade · Ra: slideLeft');
  assert.equal(transitionLabel(), null);
  assert.equal(transitionLabel({}), null);
});

test('does not mutate the input item order or visual items', () => {
  const items = [
    visualItem('later', 3, { replaceable: true }),
    visualItem('first', 0, { replaceable: true }),
  ];
  const before = structuredClone(items);

  buildVisualClipSegments(items);

  assert.deepEqual(items, before);
});
