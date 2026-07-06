import { useEffect, useRef } from 'react';

/**
 * Runs callback on an interval that pauses or slows when the window is hidden.
 * hiddenMs = null → no polling while hidden (best for CPU/battery).
 */
export function useVisibilityPoll(
  callback: () => void,
  options: {
    enabled?: boolean;
    visibleMs: number;
    hiddenMs?: number | null;
    runOnMount?: boolean;
  }
) {
  const { enabled = true, visibleMs, hiddenMs = null, runOnMount = true } = options;
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const clear = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clear();
      const ms = document.hidden ? hiddenMs : visibleMs;
      if (ms == null || ms <= 0) return;
      timer = setInterval(() => saved.current(), ms);
    };

    const onVisibility = () => {
      if (!document.hidden) {
        saved.current();
      }
      schedule();
    };

    if (runOnMount && !document.hidden) {
      saved.current();
    }
    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, visibleMs, hiddenMs, runOnMount]);
}
