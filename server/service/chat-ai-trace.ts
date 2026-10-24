import { AsyncLocalStorage } from "node:async_hooks";

export interface ChatAiTrace {
  attempts: Array<{ model: string; hasImages: boolean; durationMs: number; succeeded: boolean }>;
}
const traces = new AsyncLocalStorage<ChatAiTrace>();
export function createChatAiTrace(): ChatAiTrace { return { attempts: [] }; }
export function withChatAiTrace<T>(trace: ChatAiTrace | undefined, action: () => Promise<T>): Promise<T> {
  return trace ? traces.run(trace, action) : action();
}
export function beginChatAiAttempt(model: string, hasImages: boolean) {
  const trace = traces.getStore();
  const started = Date.now();
  const attempt = { model, hasImages, durationMs: 0, succeeded: false };
  let finished = false;
  trace?.attempts.push(attempt);
  return (succeeded: boolean) => {
    if (finished) return;
    finished = true;
    attempt.succeeded = succeeded;
    attempt.durationMs = Date.now() - started;
  };
}
export function describeChatAiTrace(trace: ChatAiTrace) {
  return {
    requestCount: trace.attempts.length,
    imageRequestCount: trace.attempts.filter(attempt => attempt.hasImages).length,
    providerDurationMs: trace.attempts.reduce((total, attempt) => total + attempt.durationMs, 0),
    failedRequestCount: trace.attempts.filter(attempt => !attempt.succeeded).length,
    models: [...new Set(trace.attempts.map(attempt => attempt.model))],
  };
}
