import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateTimelineSegment,
  buildTemplateTimelinePresenter,
  shouldShowDestructiveItemControls,
} from '../template-editor-timeline-presenter';
import type { TemplateEditorItem } from '../types';

const item = (
  id: string,
  overrides: Partial<TemplateEditorItem> = {}
): TemplateEditorItem => ({
  id,
  trackId: 'shotstack-visuals',
  type: 'video',
  start: 0,
  duration: 2,
  order: 0,
  providerBinding: {
    provider: 'shotstack',
    trackIndex: 0,
    clipIndex: 0,
  },
  ...overrides,
});

test('five replaceable Shotstack clips become Đoạn 1 through Đoạn 5 and transition metadata adds no segment', () => {
  const presenter = buildTemplateTimelinePresenter([
    item('clip-5', {
      start: 8,
      replaceable: true,
      providerBinding: {
        provider: 'shotstack',
        trackIndex: 0,
        clipIndex: 4,
        rawTransition: { in: 'fade' },
      },
    }),
    item('clip-1', { start: 0, replaceable: true }),
    item('clip-2', {
      start: 2,
      replaceable: true,
      providerBinding: {
        provider: 'shotstack',
        trackIndex: 0,
        clipIndex: 1,
        rawTransition: { out: 'slideLeft' },
      },
    }),
    item('clip-3', {
      start: 4,
      replaceable: true,
      providerBinding: { provider: 'shotstack', trackIndex: 0, clipIndex: 2 },
    }),
    item('clip-4', {
      start: 6,
      replaceable: true,
      providerBinding: {
        provider: 'shotstack',
        trackIndex: 0,
        clipIndex: 3,
        rawTransition: {},
      },
    }),
  ]);

  assert.deepEqual(
    presenter.visualSegments.map((segment) => segment.label),
    ['Đoạn 1', 'Đoạn 2', 'Đoạn 3', 'Đoạn 4', 'Đoạn 5']
  );
  assert.equal(presenter.visualSegments.length, 5);
  assert.equal(presenter.visualSegments.filter((segment) => segment.transitionLabel).length, 3);
  assert.equal(presenter.visualSegments[3]?.transitionLabel, 'Chuyển cảnh');
});

test('locked visuals are omitted from the replacement row and audio remains locked', () => {
  const presenter = buildTemplateTimelinePresenter([
    item('locked-background', { replaceable: false }),
    item('replaceable', { start: 2, replaceable: true }),
    item('soundtrack', {
      trackId: 'shotstack-audio',
      type: 'audio',
      start: 1.5,
      duration: 8.25,
      label: 'Nhạc thương hiệu',
      replaceable: true,
    }),
    item('legacy-unbound-soundtrack', {
      trackId: 'track-audio',
      type: 'audio',
      start: 0,
      duration: 10,
      label: 'Nhạc chưa gắn provider',
      providerBinding: undefined,
    }),
  ]);

  assert.deepEqual(presenter.visualSegments.map((segment) => segment.item.id), ['replaceable']);
  assert.deepEqual(
    presenter.audioSegments.map(({ item: audioItem, label, locked }) => ({
      id: audioItem.id,
      start: audioItem.start,
      duration: audioItem.duration,
      label,
      locked,
    })),
    [
      {
        id: 'legacy-unbound-soundtrack',
        start: 0,
        duration: 10,
        label: 'Nhạc chưa gắn provider',
        locked: true,
      },
      {
        id: 'soundtrack',
        start: 1.5,
        duration: 8.25,
        label: 'Nhạc thương hiệu',
        locked: true,
      },
    ]
  );
  assert.equal(presenter.canAddAudio, false);
});

test('standalone editor audio remains editable and new music can still be added', () => {
  const localAudio = item('local-audio', {
    trackId: 'track-audio',
    type: 'audio',
    providerBinding: undefined,
  });
  const presenter = buildTemplateTimelinePresenter([localAudio]);

  assert.equal(presenter.audioSegments[0]?.locked, false);
  assert.equal(presenter.canAddAudio, true);
  assert.equal(shouldShowDestructiveItemControls(localAudio, [localAudio]), true);
});

test('selecting a timeline segment retains selection and seeks to its clip start', () => {
  const selected: Array<string | null> = [];
  const seeked: number[] = [];
  const clip = item('clip-3', { start: 4.75, replaceable: true });

  activateTimelineSegment(clip, (itemId) => selected.push(itemId), (time) => seeked.push(time));

  assert.deepEqual(selected, ['clip-3']);
  assert.deepEqual(seeked, [4.75]);
});

test('provider-bound items and provider-template audio hide every destructive item control', () => {
  const boundVisual = item('bound', { replaceable: true });
  const unboundAudio = item('unbound-audio', {
    type: 'audio',
    providerBinding: undefined,
  });
  const projectItems = [boundVisual, unboundAudio];

  assert.equal(shouldShowDestructiveItemControls(boundVisual, projectItems), false);
  assert.equal(shouldShowDestructiveItemControls(unboundAudio, projectItems), false);
  assert.equal(
    shouldShowDestructiveItemControls(
      item('local', { providerBinding: undefined }),
      [item('local-project-item', { providerBinding: undefined })]
    ),
    true
  );
  assert.equal(shouldShowDestructiveItemControls(null, projectItems), false);
});

test('assigns the lowest available compact lane to overlapping replacement segments', () => {
  const presenter = buildTemplateTimelinePresenter([
    item('long', { start: 0, duration: 6, replaceable: true }),
    item('short', {
      start: 0,
      duration: 2,
      replaceable: true,
      providerBinding: { provider: 'shotstack', trackIndex: 1, clipIndex: 0 },
    }),
    item('reuses-second-lane', {
      start: 2,
      duration: 2,
      replaceable: true,
      providerBinding: { provider: 'shotstack', trackIndex: 1, clipIndex: 1 },
    }),
  ]);

  assert.equal(presenter.visualLaneCount, 2);
  assert.deepEqual(
    presenter.visualSegments.map(({ item: segmentItem, lane }) => ({
      id: segmentItem.id,
      lane,
    })),
    [
      { id: 'long', lane: 0 },
      { id: 'short', lane: 1 },
      { id: 'reuses-second-lane', lane: 1 },
    ]
  );
});

test('keeps non-overlapping replacement segments in one row', () => {
  const presenter = buildTemplateTimelinePresenter([
    item('first', { start: 0, duration: 2, replaceable: true }),
    item('second', {
      start: 2,
      duration: 3,
      replaceable: true,
      providerBinding: { provider: 'shotstack', trackIndex: 0, clipIndex: 1 },
    }),
  ]);

  assert.equal(presenter.visualLaneCount, 1);
  assert.deepEqual(presenter.visualSegments.map((segment) => segment.lane), [0, 0]);
});
