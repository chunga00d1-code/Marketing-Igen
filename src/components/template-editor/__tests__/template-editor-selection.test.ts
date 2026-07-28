import test from 'node:test';
import assert from 'node:assert/strict';
import type { TemplateEditorItem } from '../types';
import {
  findActiveVisualItem,
  findActiveVisualItems,
  selectInitialEditorItemId,
} from '../template-editor-selection';

const items: TemplateEditorItem[] = [
  {
    id: 'audio-1',
    trackId: 'track-audio',
    type: 'audio',
    start: 0,
    duration: 16,
    sourceUrl: 'https://cdn.example.com/music.mp3',
    order: 1,
  },
  {
    id: 'video-later',
    trackId: 'track-video',
    type: 'video',
    start: 5,
    duration: 3,
    sourceUrl: 'https://cdn.example.com/later.mp4',
    order: 1,
    providerBinding: {
      provider: 'shotstack',
      trackIndex: 2,
      clipIndex: 0,
    },
  },
  {
    id: 'main-video',
    trackId: 'track-video',
    type: 'video',
    start: 0,
    duration: 16,
    sourceUrl: 'https://cdn.example.com/main.mp4',
    order: 2,
    providerBinding: {
      provider: 'shotstack',
      trackIndex: 5,
      clipIndex: 0,
    },
  },
];

test('hydrates a Shotstack project by selecting the visual layer active at zero', () => {
  assert.equal(selectInitialEditorItemId(items), 'main-video');
});

test('finds the visual layer active at the requested playhead time', () => {
  assert.equal(findActiveVisualItem(items, 1)?.id, 'main-video');
  assert.equal(findActiveVisualItem(items, 6)?.id, 'video-later');
  assert.equal(findActiveVisualItem(items, 20), undefined);
});

test('returns active Shotstack visuals from background to foreground for canvas compositing', () => {
  assert.deepEqual(
    findActiveVisualItems(items, 6).map((item) => item.id),
    ['main-video', 'video-later']
  );
});
