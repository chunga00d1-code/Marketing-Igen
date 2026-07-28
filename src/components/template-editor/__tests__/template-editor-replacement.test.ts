import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEditorItemMediaReplacementTransition,
  replaceEditorItemMedia,
} from '../template-editor-replacement';
import type { MediaAsset, TemplateEditorItem, TemplateEditorProject } from '../types';

const replaceableVisual = (
  overrides: Partial<TemplateEditorItem> = {}
): TemplateEditorItem => ({
  id: 'clip-1',
  trackId: 'track-video',
  type: 'video',
  start: 3,
  duration: 4,
  sourceUrl: 'https://example.test/original.mp4',
  thumbnailUrl: 'https://example.test/original.jpg',
  label: 'Original clip',
  replaceable: true,
  order: 2,
  providerBinding: {
    provider: 'shotstack',
    trackIndex: 1,
    clipIndex: 3,
    rawTransition: { in: 'fade', out: 'slideLeft' },
  },
  fitMode: 'fit',
  trim: 0.4,
  opacity: 0.8,
  scale: 1.2,
  rotation: 15,
  volume: 0.5,
  text: 'Keep text metadata',
  style: { fontFamily: 'Arial', fontSize: 20, color: '#fff', align: 'center', bold: true, italic: false },
  ...overrides,
});

const mediaAsset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'asset-1',
  name: 'Replacement image',
  type: 'image',
  url: 'https://example.test/replacement.png',
  thumbnailUrl: 'https://example.test/replacement-thumb.png',
  uploadStatus: 'ready',
  ...overrides,
});

test('replaces a replaceable video clip with an image without changing its bound timeline metadata', () => {
  const item = replaceableVisual();
  const before = structuredClone(item);

  const result = replaceEditorItemMedia(item, mediaAsset());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.item, {
    ...before,
    type: 'image',
    sourceUrl: 'https://example.test/replacement.png',
    thumbnailUrl: 'https://example.test/replacement-thumb.png',
    label: 'Replacement image',
    replacement: { originalType: 'video', sourceType: 'image' },
  });
  assert.deepEqual(item, before);
});

test('rejects a locked item without mutating it', () => {
  const item = replaceableVisual({ replaceable: false });
  const before = structuredClone(item);

  const result = replaceEditorItemMedia(item, mediaAsset());

  assert.deepEqual(result, { ok: false, reason: 'Clip is locked and cannot be replaced.' });
  assert.deepEqual(item, before);
});

test('rejects an unfinished upload without mutating the project item', () => {
  const item = replaceableVisual();
  const before = structuredClone(item);

  const result = replaceEditorItemMedia(item, mediaAsset({ uploadStatus: 'uploading' }));

  assert.deepEqual(result, { ok: false, reason: 'Media upload is not ready.' });
  assert.deepEqual(item, before);
});

test('allows immediate replacement for a local blob media asset while uploading', () => {
  const item = replaceableVisual();
  const blobAsset = mediaAsset({
    url: 'blob:http://localhost/1234-5678',
    uploadStatus: 'uploading',
  });

  const result = replaceEditorItemMedia(item, blobAsset);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.item.sourceUrl, 'blob:http://localhost/1234-5678');
});

test('rejects audio and text assets', () => {
  const item = replaceableVisual();

  for (const type of ['audio', 'text'] as const) {
    const result = replaceEditorItemMedia(item, mediaAsset({ type }));
    assert.deepEqual(result, { ok: false, reason: 'Only image or video media can replace a clip.' });
  }
});

test('keeps the initial visual type across repeated replacements', () => {
  const first = replaceEditorItemMedia(replaceableVisual(), mediaAsset({ type: 'image' }));
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const second = replaceEditorItemMedia(
    first.item,
    mediaAsset({
      type: 'video',
      url: 'https://example.test/replacement.mp4',
      name: 'Replacement video',
      duration: 2.5,
    })
  );

  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(second.item.replacement, {
    originalType: 'video',
    sourceType: 'video',
    sourceDuration: 2.5,
  });
  assert.equal(second.item.type, 'video');
});

test('persists uploaded video duration through replacement project serialization', () => {
  const result = replaceEditorItemMedia(
    replaceableVisual(),
    mediaAsset({
      type: 'video',
      url: 'https://example.test/short.mp4',
      name: 'Short upload',
      duration: 2.25,
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const reloaded = JSON.parse(JSON.stringify(result.item)) as TemplateEditorItem;
  assert.equal(reloaded.replacement?.sourceDuration, 2.25);
});

test('rejects a provider-template replacement when the target has no valid Shotstack binding', () => {
  const target = replaceableVisual({
    id: 'shotstack-0-1',
    providerBinding: undefined,
  });
  const project: TemplateEditorProject = {
    id: 'provider-project',
    title: 'Provider project',
    aspectRatio: '9:16',
    duration: 10,
    mode: 'edit-project',
    tracks: [{ id: 'track-video', type: 'video', name: 'Video' }],
    items: [target],
  };
  const asset = mediaAsset();
  const before = structuredClone(project);

  const result = replaceEditorItemMedia(target, asset, project.items);
  assert.deepEqual(result, {
    ok: false,
    reason: 'Không thể xác định đoạn nguồn của mẫu.',
  });

  const transition = createEditorItemMediaReplacementTransition({
    project,
    history: [structuredClone(project)],
    historyIndex: 0,
    mediaAssets: [asset],
    selectedItemId: target.id,
    itemId: target.id,
    asset,
  });
  assert.equal(transition.ok, false);
  if (transition.ok) return;
  assert.equal(
    transition.reason,
    'Không thể xác định đoạn nguồn của mẫu.'
  );
  assert.deepEqual(transition.state.project, before);
});

test('keeps normal replacement behavior for an unbound standalone visual item', () => {
  const item = replaceableVisual({
    id: 'standalone',
    providerBinding: undefined,
  });

  const result = replaceEditorItemMedia(item, mediaAsset(), [item]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.item.sourceUrl, 'https://example.test/replacement.png');
});

test('replacement transition creates one undo entry, retains selection, marks the asset added, and requests success feedback', () => {
  const originalItem = replaceableVisual();
  const project: TemplateEditorProject = {
    id: 'project-1',
    title: 'Project',
    aspectRatio: '9:16',
    duration: 10,
    mode: 'edit-project',
    tracks: [{ id: 'track-video', type: 'video', name: 'Video' }],
    items: [originalItem],
  };
  const asset = mediaAsset();
  const transition = createEditorItemMediaReplacementTransition({
    project,
    history: [structuredClone(project)],
    historyIndex: 0,
    mediaAssets: [asset],
    selectedItemId: originalItem.id,
    itemId: originalItem.id,
    asset,
  });

  assert.equal(transition.ok, true);
  if (!transition.ok) return;
  assert.equal(transition.state.history.length, 2);
  assert.equal(transition.state.historyIndex, 1);
  assert.equal(transition.state.history[0].items[0].sourceUrl, originalItem.sourceUrl);
  assert.equal(transition.state.selectedItemId, originalItem.id);
  assert.equal(transition.state.project.items[0].sourceUrl, asset.url);
  assert.equal(transition.state.mediaAssets[0].added, true);
  assert.equal(transition.successMessage, `Đã thay thế bằng media "${asset.name}".`);
});

test('rejected replacement transition preserves project, assets, history, selection, and success feedback', () => {
  const item = replaceableVisual({ replaceable: false });
  const project: TemplateEditorProject = {
    id: 'project-1',
    title: 'Project',
    aspectRatio: '9:16',
    duration: 10,
    mode: 'edit-project',
    tracks: [{ id: 'track-video', type: 'video', name: 'Video' }],
    items: [item],
  };
  const asset = mediaAsset();
  const state = {
    project,
    history: [structuredClone(project)],
    historyIndex: 0,
    mediaAssets: [asset],
    selectedItemId: item.id,
  };

  const transition = createEditorItemMediaReplacementTransition({ ...state, itemId: item.id, asset });

  assert.equal(transition.ok, false);
  if (transition.ok) return;
  assert.equal(transition.reason, 'Clip is locked and cannot be replaced.');
  assert.equal(transition.state.project, state.project);
  assert.equal(transition.state.history, state.history);
  assert.equal(transition.state.historyIndex, state.historyIndex);
  assert.equal(transition.state.mediaAssets, state.mediaAssets);
  assert.equal(transition.state.selectedItemId, state.selectedItemId);
  assert.equal('successMessage' in transition, false);
});
