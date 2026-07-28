import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelineTicks, getThumbnailFrameCount } from '../timeline-scale';

test('builds timeline ticks from the real project duration', () => {
  assert.deepEqual(buildTimelineTicks(19.6), [0, 5, 10, 15, 20]);
  assert.deepEqual(buildTimelineTicks(8), [0, 2, 4, 6, 8]);
});

test('creates more filmstrip frames for longer clips', () => {
  assert.equal(getThumbnailFrameCount(5.1), 7);
  assert.equal(getThumbnailFrameCount(19.6), 27);
});
