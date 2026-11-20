// Yapitas: balance and «Movimientos». Both poll every second while something is still settling.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Id } from '../types';

const POLL_MS = 1000;

/** status "preparing" shows «★ …» and «Preparando tu cuenta». */
export function useWallet(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.wallet(),
    queryFn: () => api.wallet.get(),
    enabled: options.enabled ?? true,
    refetchInterval: (query) => (query.state.data?.status === 'preparing' ? POLL_MS : false),
  });
}

/** Pages of 30 movements, newest first. Polls while any movement is «Pendiente». */
export function useMovements(options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: keys.movements(),
    queryFn: ({ pageParam }) => api.wallet.movements({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: options.enabled ?? true,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((m) => m.status === 'pending')) ? POLL_MS : false,
  });
}

/** «Reintentar» on a movement in «Error». */
export function useRetryMovement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (movementId: Id) => api.wallet.retry(movementId),
    onSuccess: () => invalidate(client, keys.wallet()),
  });
}
