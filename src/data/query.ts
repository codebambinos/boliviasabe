// Shared QueryClient. Reads retry once on "offline" and "server"; rule errors are never retried.
// Mutations are never retried automatically: repeating a publish could duplicate it.
import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { isDataError } from './errors';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!isDataError(error)) return true;
  return error.code === 'offline' || error.code === 'server';
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

/** Marks these cached queries (and everything under them) as stale so they refetch. */
export function invalidate(client: QueryClient, ...queryKeys: QueryKey[]): void {
  for (const queryKey of queryKeys) void client.invalidateQueries({ queryKey });
}
