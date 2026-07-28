export function buildTimelineTicks(duration: number): number[] {
  const safeDuration = Math.max(1, duration);
  const rawStep = safeDuration / 4;
  const step = rawStep <= 2 ? 2 : rawStep <= 5 ? 5 : rawStep <= 10 ? 10 : Math.ceil(rawStep / 10) * 10;
  const end = Math.ceil(safeDuration / step) * step;
  return Array.from({ length: Math.floor(end / step) + 1 }, (_, index) => index * step);
}

export function getThumbnailFrameCount(duration: number): number {
  return Math.max(3, Math.min(40, Math.ceil(duration / 0.75)));
}
