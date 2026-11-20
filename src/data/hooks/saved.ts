// «☆ Guardar» hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { ContentKind, Id } from '../types';

/** Saved signs, questions and answers (Yo › Mi actividad › Guardados). */
export function useSaved() {
  return useQuery({ queryKey: keys.saved(), queryFn: () => api.saved.list() });
}

/** Resolves to true when the item ends up saved, false when it was removed. */
export function useToggleSaved() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: ContentKind; id: Id }) => api.saved.toggle(kind, id),
    onSuccess: () => invalidate(client, keys.saved(), keys.signs(), keys.questions()),
  });
}
