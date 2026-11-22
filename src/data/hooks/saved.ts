// «☆ Guardar» hooks.
import { useMutation, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { keys } from '../keys';
import { api } from '../source';
import type { ContentKind, Id, Page, Sign } from '../types';

/** Saved signs, questions and answers (Yo › Mi actividad › Guardados). */
export function useSaved(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.saved(), queryFn: () => api.saved.list(), enabled: options.enabled ?? true });
}

type SignCache = InfiniteData<Page<Sign>> | Sign | undefined;

/** The cached letrero lists and sheets with `id`'s bookmark turned over. */
function flipSign(data: SignCache, id: Id): SignCache {
  if (!data) return data;
  const flip = (sign: Sign) => (sign.id === id ? { ...sign, savedByMe: !sign.savedByMe } : sign);
  if ('pages' in data) return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(flip) })) };
  return flip(data);
}

/**
 * Resolves to true when the item ends up saved, false when it was removed. It stays pending until the lists show the
 * new state, so a screen that blocks the button while it is pending never lets a second tap undo the first.
 * A letrero's bookmark turns at the tap in every list (the tile answered only after the save and three refetches,
 * over a second later); it turns back if the save fails. Questions and answers still wait for the server (SPEC 28).
 */
export function useToggleSaved() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: ContentKind; id: Id }) => api.saved.toggle(kind, id),
    onMutate: ({ kind, id }): { previous: [QueryKey, unknown][] } | undefined => {
      if (kind !== 'sign') return undefined;
      // A refetch in flight would bring back the old bookmark: cancel it (the cache reverts at once), without waiting
      void client.cancelQueries({ queryKey: keys.signs() });
      const previous = client.getQueriesData({ queryKey: keys.signs() });
      client.setQueriesData<SignCache>({ queryKey: keys.signs() }, (data) => flipSign(data, id));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([queryKey, data]) => client.setQueryData(queryKey, data));
    },
    onSuccess: () =>
      Promise.all([keys.saved(), keys.signs(), keys.questions()].map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
}
