// «Tocar otra vez la pestaña en la que estás» refreshes it (wiki #181): the way to see what others published on a
// computer, where there is no pull-to-refresh. While it loads, the screen shows the same «Actualizando…» chip as the
// pull (wiki #226), so the tap is not silent.
import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';

export type RefreshTarget = 'signs' | 'questions' | 'me';

/** The chip stays at least this long, so a fast refresh still reads as «it did something». */
const MIN_VISIBLE_MS = 600;

let refreshing: RefreshTarget | null = null;
const listeners = new Set<() => void>();
const set = (next: RefreshTarget | null) => {
  refreshing = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useRefresh(): (target: RefreshTarget) => void {
  const client = useQueryClient();
  return (target) => {
    if (refreshing === target) return;
    const queryKeys = target === 'signs' ? [keys.signs()] : target === 'questions' ? [keys.questions()] : [keys.wallet(), keys.activity(), keys.saved()];
    set(target);
    const shown = new Promise((resolve) => window.setTimeout(resolve, MIN_VISIBLE_MS));
    // Errors show on the screen itself (Reintentar); the chip only says it is loading
    const done = Promise.allSettled(queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
    void Promise.all([done, shown]).then(() => {
      if (refreshing === target) set(null);
    });
  };
}

/** True while a tap on the current tab is refreshing this target. */
export function useTabRefreshing(target: RefreshTarget): boolean {
  return useSyncExternalStore(subscribe, () => refreshing === target, () => false);
}
