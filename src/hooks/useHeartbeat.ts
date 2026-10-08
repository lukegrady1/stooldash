'use client';
import { useEffect, useRef } from 'react';
import { LIMITS } from '@/engine/types';

/**
 * Calls `beat` every 15s while the tab is visible, and immediately when it becomes
 * visible again (spec §8.4). `beat` is read through a ref so callers can pass a fresh
 * closure each render without restarting the timer.
 */
export function useHeartbeat(beat: (() => void) | null, intervalMs = LIMITS.heartbeatMs): void {
  const ref = useRef(beat);
  ref.current = beat;

  useEffect(() => {
    if (!beat) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => ref.current?.(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        ref.current?.();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onVisibility);
    };
    // `beat` toggling between null and a function is the only dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat === null, intervalMs]);
}
