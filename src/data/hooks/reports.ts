// «Reportar» and «Ya no quiero ver esto» hooks.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Id, ReportKind, ReportReason } from '../types';

/** Reports the item. It also disappears from every list of the reporter (wiki #166). */
export function useReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, reason }: { kind: ReportKind; id: Id; reason: ReportReason }) => api.reports.report(kind, id, reason),
    onSuccess: () => invalidate(client, keys.signs(), keys.questions(), keys.saved()),
  });
}

/** Hides the item for this user only. It disappears from every list. */
export function useHideForMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: ReportKind; id: Id }) => api.reports.hideForMe(kind, id),
    onSuccess: () => invalidate(client, keys.signs(), keys.questions(), keys.saved()),
  });
}
