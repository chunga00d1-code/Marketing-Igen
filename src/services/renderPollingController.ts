import type { VideoProjectRenderDetail } from './videoProjectRenderService';

export interface RenderPollingOptions<T = VideoProjectRenderDetail> {
  fetchData?: (signal: AbortSignal) => Promise<T>;
  fetchDetail?: (signal: AbortSignal) => Promise<T>;
  onUpdate: (data: T) => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
}

export interface RenderPollingController {
  start: () => void;
  stop: () => void;
  isActive: () => boolean;
}

export function createRenderPollingController<T = VideoProjectRenderDetail>({
  fetchData,
  fetchDetail,
  onUpdate,
  onError,
  intervalMs = 2000,
}: RenderPollingOptions<T>): RenderPollingController {
  let active = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let seq = 0;

  const fetchFn = fetchData || fetchDetail;
  if (!fetchFn) {
    throw new Error('Cần cung cấp fetchData hoặc fetchDetail cho polling controller.');
  }

  const clearTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const cancelInFlight = () => {
    if (abortController !== null) {
      abortController.abort();
      abortController = null;
    }
  };

  const scheduleNext = () => {
    clearTimer();
    if (!active) return;
    timerId = setTimeout(() => {
      void tick();
    }, intervalMs);
  };

  const tick = async () => {
    if (!active) return;

    cancelInFlight();
    const currentSeq = ++seq;
    const controller = new AbortController();
    abortController = controller;

    try {
      const data = await fetchFn(controller.signal);

      if (!active || controller.signal.aborted || currentSeq !== seq) {
        return;
      }

      onUpdate(data);

      scheduleNext();
    } catch (error: unknown) {
      if (!active || controller.signal.aborted || currentSeq !== seq) {
        return;
      }

      onError?.(error);
      scheduleNext();
    } finally {
      if (abortController === controller) {
        abortController = null;
      }
    }
  };

  const stop = () => {
    active = false;
    clearTimer();
    cancelInFlight();
  };

  return {
    start() {
      if (active) return;
      active = true;
      void tick();
    },
    stop,
    isActive() {
      return active;
    },
  };
}
