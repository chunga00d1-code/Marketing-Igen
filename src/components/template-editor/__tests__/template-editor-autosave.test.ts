import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemplateEditorAutosaveQueue } from '../template-editor-autosave';
import * as autosaveModule from '../template-editor-autosave';

test('flush resolves immediately when queue is empty and not in flight', async () => {
  const queue = createTemplateEditorAutosaveQueue<string>({
    initialRevision: 1,
    persist: async () => ({ revision: 2 }),
  });

  await queue.flush();
  assert.ok(true);
});

test('flush waits for in-flight save to finish', async () => {
  let resolvePersist: (val: { revision: number }) => void = () => {};
  let persisted = false;

  const queue = createTemplateEditorAutosaveQueue<string>({
    initialRevision: 1,
    persist: () =>
      new Promise((res) => {
        resolvePersist = (val) => {
          persisted = true;
          res(val);
        };
      }),
  });

  queue.enqueue({ serialized: 'snap1', value: 'val1' });

  let flushed = false;
  const flushPromise = queue.flush().then(() => {
    flushed = true;
  });

  assert.equal(flushed, false);
  assert.equal(persisted, false);

  resolvePersist({ revision: 2 });
  await flushPromise;

  assert.equal(flushed, true);
  assert.equal(persisted, true);
});

test('flush waits until latest enqueued snapshot is persisted', async () => {
  const saveOrder: string[] = [];

  const queue = createTemplateEditorAutosaveQueue<string>({
    initialRevision: 1,
    persist: async (val, rev) => {
      saveOrder.push(val);
      return { revision: rev + 1 };
    },
  });

  queue.enqueue({ serialized: 'snap1', value: 'val1' });
  queue.enqueue({ serialized: 'snap2', value: 'val2' });

  await queue.flush();

  assert.deepEqual(saveOrder, ['val1', 'val2']);
});

test('flush rejects when persist fails', async () => {
  const queue = createTemplateEditorAutosaveQueue<string>({
    initialRevision: 1,
    persist: async () => {
      throw new Error('Lỗi lưu cơ sở dữ liệu');
    },
  });

  queue.enqueue({ serialized: 'snap1', value: 'val1' });

  await assert.rejects(
    () => queue.flush(),
    (err: Error) => err.message === 'Lỗi lưu cơ sở dữ liệu'
  );
});

test('flush rejects when queue is disposed', async () => {
  let resolvePersist: (val: { revision: number }) => void = () => {};

  const queue = createTemplateEditorAutosaveQueue<string>({
    initialRevision: 1,
    persist: () =>
      new Promise((res) => {
        resolvePersist = res;
      }),
  });

  queue.enqueue({ serialized: 'snap1', value: 'val1' });

  const flushPromise = queue.flush();
  queue.dispose();

  await assert.rejects(
    () => flushPromise,
    (err: Error) => err.message.includes('bị hủy')
  );

  resolvePersist({ revision: 2 });
});

type AutosaveReadinessState = {
  isReady: boolean;
  saveStatus: 'loading' | 'saving' | 'saved' | 'error';
  queue: { flush: () => Promise<void> } | null;
};

type RequireAutosaveQueue = (
  state: AutosaveReadinessState
) => { flush: () => Promise<void> };

type RetryAutosaveQueue = (
  state: {
    isReady: boolean;
    saveStatus: AutosaveReadinessState['saveStatus'];
    queue: ({ flush: () => Promise<void>; retry: () => void }) | null;
  }
) => void;

const readinessGuard = () => (
  autosaveModule as unknown as {
    requireTemplateEditorAutosaveQueue?: RequireAutosaveQueue;
  }
).requireTemplateEditorAutosaveQueue;

const retryController = () => (
  autosaveModule as unknown as {
    retryTemplateEditorAutosave?: RetryAutosaveQueue;
  }
).retryTemplateEditorAutosave;

test('export readiness rejects while the editor is not ready', () => {
  const guard = readinessGuard();
  assert.equal(typeof guard, 'function');
  if (!guard) return;

  assert.throws(() => guard({
    isReady: false,
    saveStatus: 'saved',
    queue: { flush: async () => undefined },
  }));
});

test('export readiness rejects loading and failed save states', () => {
  const guard = readinessGuard();
  assert.equal(typeof guard, 'function');
  if (!guard) return;

  for (const saveStatus of ['loading', 'error'] as const) {
    assert.throws(() => guard({
      isReady: true,
      saveStatus,
      queue: { flush: async () => undefined },
    }), saveStatus);
  }
});

test('export readiness rejects when the autosave queue is absent', () => {
  const guard = readinessGuard();
  assert.equal(typeof guard, 'function');
  if (!guard) return;

  assert.throws(() => guard({
    isReady: true,
    saveStatus: 'saved',
    queue: null,
  }));
});

test('export readiness returns a safely flushable saving or saved queue', () => {
  const guard = readinessGuard();
  assert.equal(typeof guard, 'function');
  if (!guard) return;
  const queue = { flush: async () => undefined };

  assert.equal(guard({ isReady: true, saveStatus: 'saving', queue }), queue);
  assert.equal(guard({ isReady: true, saveStatus: 'saved', queue }), queue);
});

test('failed pending snapshot is retried explicitly and becomes export-ready after saving', async () => {
  let saveStatus: AutosaveReadinessState['saveStatus'] = 'saving';
  let attempts = 0;
  const persistedValues: string[] = [];
  const queue = createTemplateEditorAutosaveQueue<string>({
    initialRevision: 1,
    persist: async (value, revision) => {
      attempts += 1;
      persistedValues.push(value);
      if (attempts === 1) throw new Error('first save failed');
      return { revision: revision + 1 };
    },
    onAttempt: () => {
      saveStatus = 'saving';
    },
    onPersisted: () => {
      saveStatus = 'saved';
    },
    onError: () => {
      saveStatus = 'error';
    },
  });
  const retry = retryController();
  const guard = readinessGuard();

  assert.equal(typeof retry, 'function');
  assert.equal(typeof guard, 'function');
  if (!retry || !guard) return;

  queue.enqueue({ serialized: 'snapshot-1', value: 'value-1' });
  await assert.rejects(() => queue.flush(), /first save failed/);
  assert.equal(saveStatus, 'error');
  assert.throws(() => guard({ isReady: true, saveStatus, queue }));

  retry({ isReady: true, saveStatus, queue });
  await queue.flush();

  assert.equal(saveStatus, 'saved');
  assert.deepEqual(persistedValues, ['value-1', 'value-1']);
  assert.equal(guard({ isReady: true, saveStatus, queue }), queue);
});

test('autosave retry controller only invokes retry for an explicit failed-save action', () => {
  const retry = retryController();
  assert.equal(typeof retry, 'function');
  if (!retry) return;
  let retryCalls = 0;
  const queue = {
    retry: () => {
      retryCalls += 1;
    },
    flush: async () => undefined,
  };

  retry({ isReady: true, saveStatus: 'error', queue });
  assert.equal(retryCalls, 1);
  assert.throws(() => retry({ isReady: true, saveStatus: 'saved', queue }));
  assert.throws(() => retry({ isReady: false, saveStatus: 'error', queue }));
  assert.equal(retryCalls, 1);
});
