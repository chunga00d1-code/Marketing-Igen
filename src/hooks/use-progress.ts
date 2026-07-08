import { useState, useEffect, useRef } from 'react';

export function useProgress(isLoading: boolean, estimatedDurationSeconds: number = 10) {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      const startTime = Date.now();
      const durationMs = estimatedDurationSeconds * 1000;

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Asymptotically approach 98%
        const p = Math.min(98, Math.round(98 * (1 - Math.exp(-elapsed / (durationMs * 0.5)))));
        setProgress(p);
      }, 150);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgress(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLoading, estimatedDurationSeconds]);

  return progress;
}
