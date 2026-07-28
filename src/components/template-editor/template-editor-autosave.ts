export interface TemplateEditorAutosaveSnapshot<T> {
  serialized: string;
  value: T;
}

export type TemplateEditorSaveStatus = 'loading' | 'saving' | 'saved' | 'error';

interface TemplateEditorAutosaveQueueOptions<T> {
  initialRevision: number;
  persist: (value: T, expectedRevision: number) => Promise<{ revision: number }>;
  onAttempt?: () => void;
  onPersisted?: (serialized: string, revision: number) => void;
  onError?: (error: unknown) => void;
}

export interface TemplateEditorAutosaveQueue<T> {
  enqueue: (snapshot: TemplateEditorAutosaveSnapshot<T>) => void;
  retry: () => void;
  dispose: () => void;
  flush: () => Promise<void>;
}

export function requireTemplateEditorAutosaveQueue<T>({
  isReady,
  saveStatus,
  queue,
}: {
  isReady: boolean;
  saveStatus: TemplateEditorSaveStatus;
  queue: TemplateEditorAutosaveQueue<T> | null;
}): TemplateEditorAutosaveQueue<T> {
  if (!isReady) {
    throw new Error('Dự án chưa sẵn sàng để xuất. Vui lòng chờ tải hoàn tất.');
  }
  if (!queue) {
    throw new Error('Không thể xác nhận hàng đợi tự động lưu cho dự án.');
  }
  if (saveStatus === 'error') {
    throw new Error('Không thể xuất video vì lần lưu gần nhất thất bại.');
  }
  if (saveStatus !== 'saving' && saveStatus !== 'saved') {
    throw new Error('Dự án chưa ở trạng thái có thể lưu an toàn để xuất.');
  }
  return queue;
}

export function retryTemplateEditorAutosave<T>({
  isReady,
  saveStatus,
  queue,
}: {
  isReady: boolean;
  saveStatus: TemplateEditorSaveStatus;
  queue: TemplateEditorAutosaveQueue<T> | null;
}): void {
  if (!isReady || !queue) {
    throw new Error('Không thể thử lưu lại vì dự án chưa sẵn sàng.');
  }
  if (saveStatus !== 'error') {
    throw new Error('Chỉ có thể thử lại sau khi tự động lưu thất bại.');
  }
  queue.retry();
}

type FlushWaiter = {
  resolve: () => void;
  reject: (reason: unknown) => void;
};

export function createTemplateEditorAutosaveQueue<T>({
  initialRevision,
  persist,
  onAttempt,
  onPersisted,
  onError,
}: TemplateEditorAutosaveQueueOptions<T>): TemplateEditorAutosaveQueue<T> {
  let revision = initialRevision;
  let pending: TemplateEditorAutosaveSnapshot<T> | null = null;
  let inFlight = false;
  let disposed = false;
  let flushWaiters: FlushWaiter[] = [];

  const notifyWaitersSuccess = () => {
    const waiters = flushWaiters;
    flushWaiters = [];
    waiters.forEach((w) => w.resolve());
  };

  const notifyWaitersError = (error: unknown) => {
    const waiters = flushWaiters;
    flushWaiters = [];
    waiters.forEach((w) => w.reject(error));
  };

  const pump = () => {
    if (disposed || inFlight || !pending) return;

    const current = pending;
    pending = null;
    inFlight = true;
    onAttempt?.();

    void (async () => {
      try {
        const saved = await persist(current.value, revision);
        if (disposed) {
          notifyWaitersError(new Error('Autosave queue đã bị hủy.'));
          return;
        }
        revision = saved.revision;
        onPersisted?.(current.serialized, revision);
        inFlight = false;
        if (pending !== null) {
          pump();
        } else {
          notifyWaitersSuccess();
        }
      } catch (error: unknown) {
        if (disposed) {
          notifyWaitersError(new Error('Autosave queue đã bị hủy.'));
          return;
        }
        const hasNewerPending = pending !== null;
        if (!hasNewerPending) {
          pending = current;
        }
        inFlight = false;
        onError?.(error);
        notifyWaitersError(error);
        if (hasNewerPending) {
          pump();
        }
      }
    })();
  };

  return {
    enqueue(snapshot) {
      if (disposed) return;
      pending = snapshot;
      pump();
    },
    retry() {
      pump();
    },
    dispose() {
      disposed = true;
      pending = null;
      notifyWaitersError(new Error('Autosave queue đã bị hủy.'));
    },
    flush() {
      if (disposed) {
        return Promise.reject(new Error('Autosave queue đã bị hủy.'));
      }
      if (!inFlight && !pending) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        flushWaiters.push({ resolve, reject });
      });
    },
  };
}
