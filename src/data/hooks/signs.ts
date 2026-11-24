// Letreros (signs) hooks.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListQuery, NewSign } from '../api';
import { keys } from '../keys';
import { invalidate, queryClient } from '../query';
import { api } from '../source';
import type { City, Id } from '../types';

/** Pages of 30 signs for a city, newest first. Use fetchNextPage() for «Ver más». */
export function useSigns(filters: Omit<ListQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: keys.signList(filters),
    queryFn: ({ pageParam }) => api.signs.list({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Typing or a chip keeps the last grid on screen until the new one arrives; a city change
    // starts clean (skeleton), so one city's letreros never show under another's name
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[3] as Omit<ListQuery, 'cursor'> | undefined)?.city === filters.city ? previous : undefined,
  });
}

/** «Destacados» in Hoy (SPEC 30): up to 4 featured partner letreros of the city. */
export function useFeaturedSigns(city: City, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.featured(city), queryFn: () => api.signs.featured(city), enabled: options.enabled ?? true });
}

/** Loads one letrero outside a component (a pending action coming back from Google opens its sheet). */
export function fetchSign(id: Id) {
  return queryClient.fetchQuery({ queryKey: keys.sign(id), queryFn: () => api.signs.get(id), staleTime: 0 });
}

export function useSign(id: Id) {
  return useQuery({ queryKey: keys.sign(id), queryFn: () => api.signs.get(id) });
}

/** Resolves to { sign, rewarded }. rewarded=false past 10 signs a day (published anyway). */
export function useCreateSign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSign) => api.signs.create(input),
    // Fail right away without signal so the form shows «Sin conexión» + Reintentar (wiki #65, #167),
    // instead of pausing until the network is back
    networkMode: 'always',
    onSuccess: () => invalidate(client, keys.signs(), keys.wallet(), keys.activity()),
  });
}

/** «Me sirvió» / «No me sirvió» on a sign. One vote per person, final. Resolves to { sign, rewardCap }. */
export function useVoteSign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: Id; value: 'helpful' | 'not_helpful' }) => api.signs.vote(id, value),
    onSuccess: ({ sign }) => {
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
