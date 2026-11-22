// «☆ Guardar» hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { api } from '../source';
import type { ContentKind, Id } from '../types';

/** Saved signs, questions and answers (Yo › Mi actividad › Guardados). */
export function useSaved(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.saved(), queryFn: () => api.saved.list(), enabled: options.enabled ?? true });
}

/**
 * Resolves to true when the item ends up saved, false when it was removed. It stays pending until the lists show the
 * new state, so a screen that blocks the button while it is pending never lets a second tap undo the first.
 */
export function useToggleSaved() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: ContentKind; id: Id }) => api.saved.toggle(kind, id),
    onSuccess: () =>
      Promise.all([keys.saved(), keys.signs(), keys.questions()].map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
}
