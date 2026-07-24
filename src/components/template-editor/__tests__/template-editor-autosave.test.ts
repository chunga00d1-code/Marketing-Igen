import assert from 'node:assert/strict';
import test from 'node:test';
import * as autosaveModule from '../template-editor-autosave';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type QueueContract<T> = {
  enqueue: (snapshot: { serialized: string; value: T }) => void;
  retry: () => void;
  dispose: () => void;
};

type AutosaveContract = {
  createTemplateEditorAutosaveQueue: <T>(options: {
    initialRevision: number;
    persist: (value: T, expectedRevision: number) => Promise<{ revision: number }>;
    onAttempt?: () => void;
    onPersisted?: (serialized: string, revision: number) => void;
    onError?: (error: unknown) => void;
  }) => QueueContract<T>;
};

const subject = autosaveModule as unknown as AutosaveContract;

test("serializes saves and coalesces in-flight edits to the newest snapshot", async () => {
  assert.equal(typeof subject.createTemplateEditorAutosaveQueue, 'function');
  const first = deferred<{ revision: number }>();
  const second = deferred<{ revision: number }>();
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const latestPersisted = deferred<void>();
  const calls: Array<{ title: string; expectedRevision: number }> = [];

  const queue = subject.createTemplateEditorAutosaveQueue<{ title: string }>({
    initialRevision: 7,
    persist: async (value, expectedRevision) => {
      calls.push({ title: value.title, expectedRevision });
      if (calls.length === 1) {
        firstStarted.resolve();
        return first.promise;
      }
      secondStarted.resolve();
      return second.promise;
    },
    onPersisted: (serialized) => {
      if (serialized === 'latest') latestPersisted.resolve();
    },
  });

  queue.enqueue({ serialized: 'older', value: { title: 'Older' } });
  await firstStarted.promise;
  queue.enqueue({ serialized: 'middle', value: { title: 'Middle' } });
  queue.enqueue({ serialized: 'latest', value: { title: 'Latest' } });

  assert.deepEqual(calls, [{ title: 'Older', expectedRevision: 7 }]);

  first.resolve({ revision: 8 });
  await secondStarted.promise;
  assert.deepEqual(calls, [
    { title: 'Older', expectedRevision: 7 },
    { title: 'Latest', expectedRevision: 8 },
  ]);

  second.resolve({ revision: 9 });
  await latestPersisted.promise;
  assert.equal(calls.at(-1)?.title, 'Latest');
});

test("preserves the newest pending edit after an error and retries that snapshot", async () => {
  assert.equal(typeof subject.createTemplateEditorAutosaveQueue, 'function');
  const first = deferred<{ revision: number }>();
  const second = deferred<{ revision: number }>();
  const third = deferred<{ revision: number }>();
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const thirdStarted = deferred<void>();
  let errors = 0;
  const twoErrorsReported = deferred<void>();
  const calls: Array<{ title: string; expectedRevision: number }> = [];

  const queue = subject.createTemplateEditorAutosaveQueue<{ title: string }>({
    initialRevision: 3,
    persist: async (value, expectedRevision) => {
      calls.push({ title: value.title, expectedRevision });
      if (calls.length === 1) {
        firstStarted.resolve();
        return first.promise;
      }
      if (calls.length === 2) {
        secondStarted.resolve();
        return second.promise;
      }
      thirdStarted.resolve();
      return third.promise;
    },
    onError: () => {
      errors += 1;
      if (errors === 2) twoErrorsReported.resolve();
    },
  });

  queue.enqueue({ serialized: 'older', value: { title: 'Older' } });
  await firstStarted.promise;
  queue.enqueue({ serialized: 'latest', value: { title: 'Latest' } });
  first.reject(new Error('revision conflict'));
  await secondStarted.promise;
  second.reject(new Error('revision conflict'));
  await twoErrorsReported.promise;

  assert.deepEqual(calls, [
    { title: 'Older', expectedRevision: 3 },
    { title: 'Latest', expectedRevision: 3 },
  ]);

  queue.retry();
  await thirdStarted.promise;
  assert.deepEqual(calls.at(-1), { title: 'Latest', expectedRevision: 3 });
  third.resolve({ revision: 4 });
});

test("cleanup drops pending work and suppresses callbacks after an in-flight save", async () => {
  assert.equal(typeof subject.createTemplateEditorAutosaveQueue, 'function');
  const first = deferred<{ revision: number }>();
  const firstStarted = deferred<void>();
  const calls: string[] = [];
  let callbacks = 0;

  const queue = subject.createTemplateEditorAutosaveQueue<{ title: string }>({
    initialRevision: 1,
    persist: async (value) => {
      calls.push(value.title);
      firstStarted.resolve();
      return first.promise;
    },
    onPersisted: () => {
      callbacks += 1;
    },
    onError: () => {
      callbacks += 1;
    },
  });

  queue.enqueue({ serialized: 'older', value: { title: 'Older' } });
  await firstStarted.promise;
  queue.enqueue({ serialized: 'latest', value: { title: 'Latest' } });
  queue.dispose();
  first.resolve({ revision: 2 });
  await first.promise;
  await Promise.resolve();

  assert.deepEqual(calls, ['Older']);
  assert.equal(callbacks, 0);
});
