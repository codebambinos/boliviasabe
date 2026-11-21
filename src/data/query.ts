// Shared QueryClient. Reads retry once on "offline" and "server"; rule errors are never retried.
// What others publish shows up when the person comes back to the app or the tab (wiki #181): a read older than
// 10 s is fetched again then. There is no Realtime yet.
// Mutations are never retried automatically: repeating a publish could duplicate it.
// Reads stay in memory for 24 h, as long as the persisted copy lives (src/data/persist.ts, wiki #197).
import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { isDataError } from './errors';
import { keys } from './keys';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!isDataError(error)) return true;
  return error.code === 'offline' || error.code === 'server';
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, staleTime: 10_000, gcTime: 24 * 60 * 60 * 1000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

/** Marks these cached queries (and everything under them) as stale so they refetch. */
export function invalidate(client: QueryClient, ...queryKeys: QueryKey[]): void {
  for (const queryKey of queryKeys) void client.invalidateQueries({ queryKey });
}

/** What belongs to one person: dropped when the session changes and never persisted on the device (#195, #197). */
export const PERSONAL_KEYS: readonly QueryKey[] = [keys.wallet(), keys.activity(), keys.saved(), keys.myPhone()];

/** True for a personal key or anything under one. */
export function isPersonalKey(key: readonly unknown[]): boolean {
  return PERSONAL_KEYS.some((p) => p.every((part, i) => key[i] === part));
}
