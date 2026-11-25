// «Deslizar hacia abajo actualiza» (wiki › flujo-final › Hoy): a light pull-to-refresh for touch
// screens. It only starts at the very top of the page, with no sheet open, and ignores mostly
// horizontal drags (the chip row scrolls sideways).
import { useEffect, useRef, useState } from 'react';

export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing';

/** Finger travel is halved, so the indicator lags behind the finger. */
const RESISTANCE = 0.5;
/** Release at or past this distance (after resistance) to refresh. */
export const PULL_THRESHOLD = 64;
/** The indicator never travels further than this. */
export const PULL_MAX = 96;
/** Where the indicator rests while the list refreshes. */
export const PULL_REST = 56;
/** Finger travel before the gesture decides it is a vertical pull. */
const SLOP = 6;

export function usePullToRefresh(
  onRefresh: () => Promise<unknown>,
  opts: { enabled?: boolean } = {},
): { state: PullState; distance: number } {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<PullState>('idle');
  const [distance, setDistance] = useState(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled || !window.matchMedia('(pointer: coarse)').matches) return;

    let tracking = false;
    let pulling = false;
    let startX = 0;
    let startY = 0;
    let current = 0;

    const reset = () => {
      tracking = false;
      pulling = false;
      current = 0;
    };

    const onStart = (e: TouchEvent) => {
      const sheetOpen = document.documentElement.style.overflow === 'hidden';
      if (busy.current || sheetOpen || window.scrollY > 0 || e.touches.length !== 1) return;
      tracking = true;
      pulling = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // Sideways (chips) or upwards (normal scroll): not a pull
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
          reset();
          return;
        }
        pulling = true;
      }
      if (window.scrollY > 0) {
        reset();
        setDistance(0);
        setState('idle');
        return;
      }
      if (e.cancelable) e.preventDefault();
      current = Math.min(PULL_MAX, Math.max(0, dy * RESISTANCE));
      setDistance(current);
      setState(current >= PULL_THRESHOLD ? 'armed' : 'pulling');
    };

    const onEnd = () => {
      if (!tracking) return;
      const armed = pulling && current >= PULL_THRESHOLD;
      reset();
      if (!armed) {
        setDistance(0);
        setState('idle');
        return;
      }
      busy.current = true;
      setDistance(PULL_REST);
      setState('refreshing');
      refreshRef.current().finally(() => {
        busy.current = false;
        setDistance(0);
        setState('idle');
      });
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: while pulling it stops the browser's own overscroll and reload
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  return { state, distance };
}

/** The pull, or the same «Actualizando…» chip while a tap on the tab refreshes the list (wiki #226). */
export function withTabRefresh(pull: { state: PullState; distance: number }, tabRefreshing: boolean): { state: PullState; distance: number } {
  return pull.state === 'idle' && tabRefreshing ? { state: 'refreshing', distance: PULL_REST } : pull;
}
