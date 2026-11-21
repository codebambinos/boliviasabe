// Ajustes › Notificaciones (SPEC 15): the 4 switches of the account. They change at once on screen and roll back if
// saving fails.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotifPrefs } from '../api';
import { keys } from '../keys';
import { api } from '../source';

export function useNotifPrefs(enabled = true) {
  return useQuery({ queryKey: keys.notifPrefs(), queryFn: () => api.push.getPrefs(), enabled });
}

export function useSetNotifPrefs() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotifPrefs) => api.push.setPrefs(prefs),
    onMutate: async (prefs) => {
      await client.cancelQueries({ queryKey: keys.notifPrefs() });
      const before = client.getQueryData<NotifPrefs>(keys.notifPrefs());
      client.setQueryData(keys.notifPrefs(), prefs);
      return { before };
    },
    onError: (_error, _prefs, context) => {
      if (context?.before) client.setQueryData(keys.notifPrefs(), context.before);
    },
    onSuccess: (prefs) => client.setQueryData(keys.notifPrefs(), prefs),
  });
}
