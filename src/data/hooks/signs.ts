// Letreros (signs) hooks.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListQuery, NewSign } from '../api';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Id } from '../types';

/** Pages of 30 signs for a city, newest first. Use fetchNextPage() for «Ver más». */
export function useSigns(filters: Omit<ListQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: keys.signList(filters),
    queryFn: ({ pageParam }) => api.signs.list({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useSign(id: Id) {
  return useQuery({ queryKey: keys.sign(id), queryFn: () => api.signs.get(id) });
}

/** Resolves to { sign, rewarded }. rewarded=false past 10 signs a day (published anyway). */
export function useCreateSign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSign) => api.signs.create(input),
    onSuccess: () => invalidate(client, keys.signs(), keys.wallet(), keys.activity()),
  });
}

/** «Me sirvió» / «No me sirvió» on a sign. One vote per person, final. */
export function useVoteSign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: Id; value: 'helpful' | 'not_helpful' }) => api.signs.vote(id, value),
    onSuccess: (sign) => {
      client.setQueryData(keys.sign(sign.id), sign);
      invalidate(client, keys.signs());
    },
  });
}

export function useRemoveSign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => api.signs.remove(id),
    onSuccess: () => invalidate(client, keys.signs(), keys.saved(), keys.activity()),
  });
}
