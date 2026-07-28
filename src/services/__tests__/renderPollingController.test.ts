import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderPollingController } from '../renderPollingController';
import type { VideoProjectRenderDetail } from '../videoProjectRenderService';

function mockDetail(status: VideoProjectRenderDetail['status'], progress = 50): VideoProjectRenderDetail {
  return {
    id: 'r1',
    projectId: 'p1',
    status,
    progress,
    resolution: '1080p',
    aspectRatio: '9:16',
    duration: 10,
  };
}

test('polling stops automatically when caller stops poller on completed status', async () => {
  let calls = 0;
  const updates: VideoProjectRenderDetail[] = [];

  const poller = createRenderPollingController({
    intervalMs: 10,
    fetchDetail: async () => {
      calls++;
      if (calls === 1) return mockDetail('rendering', 40);
      return mockDetail('completed', 100);
    },
    onUpdate: (detail) => {
      updates.push(detail);
      if (detail.status === 'completed') {
        poller.stop();
      }
    },
  });

  poller.start();

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(updates.length, 2);
  assert.equal(updates[1].status, 'completed');
  assert.equal(poller.isActive(), false);
});

test('polling stops automatically when caller stops poller on failed status', async () => {
  let calls = 0;
  const updates: VideoProjectRenderDetail[] = [];

  const poller = createRenderPollingController({
    intervalMs: 10,
    fetchDetail: async () => {
      calls++;
      if (calls === 1) return mockDetail('queued', 0);
      return mockDetail('failed', 10);
    },
    onUpdate: (detail) => {
      updates.push(detail);
      if (detail.status === 'failed') {
        poller.stop();
      }
    },
  });

  poller.start();

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(updates.length, 2);
  assert.equal(updates[1].status, 'failed');
  assert.equal(poller.isActive(), false);
});

test('never runs overlapping requests at the same time', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;

  const poller = createRenderPollingController({
    intervalMs: 10,
    fetchDetail: async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise((res) => setTimeout(res, 25));
      inFlight--;
      calls++;
      if (calls >= 3) return mockDetail('completed', 100);
      return mockDetail('rendering', calls * 20);
    },
    onUpdate: (detail) => {
      if (detail.status === 'completed') {
        poller.stop();
      }
    },
  });

  poller.start();

  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(maxInFlight, 1);
  assert.equal(poller.isActive(), false);
});

test('stopping poller aborts in-flight request and prevents onUpdate callback', async () => {
  let wasAborted = false;
  let updateCalled = false;

  const poller = createRenderPollingController({
    fetchDetail: async (signal) => {
      return new Promise<VideoProjectRenderDetail>((resolve, reject) => {
        const timer = setTimeout(() => resolve(mockDetail('rendering', 50)), 100);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          wasAborted = true;
          reject(new Error('Aborted'));
        });
      });
    },
    onUpdate: () => {
      updateCalled = true;
    },
  });

  poller.start();
  await new Promise((res) => setTimeout(res, 10));

  poller.stop();

  await new Promise((res) => setTimeout(res, 150));

  assert.equal(wasAborted, true);
  assert.equal(updateCalled, false);
  assert.equal(poller.isActive(), false);
});

test('recovers from transient network error and continues next tick until stopped', async () => {
  let calls = 0;
  let errors = 0;
  const listItems: string[] = [];

  const poller = createRenderPollingController<string[]>({
    intervalMs: 10,
    fetchData: async () => {
      calls++;
      if (calls === 1) throw new Error('Network timeout');
      if (calls === 2) return ['job1-rendering'];
      return ['job1-completed'];
    },
    onUpdate: (items) => {
      listItems.push(items[0]);
      if (items[0] === 'job1-completed') {
        poller.stop();
      }
    },
    onError: () => {
      errors++;
    },
  });

  poller.start();

  await new Promise((res) => setTimeout(res, 80));

  assert.equal(errors, 1);
  assert.deepEqual(listItems, ['job1-rendering', 'job1-completed']);
  assert.equal(poller.isActive(), false);
});
