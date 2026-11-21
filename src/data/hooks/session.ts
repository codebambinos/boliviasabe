// Session hooks. Signing in or out refreshes every other query: «isMine», «savedByMe» and
// the wallet depend on who is looking. What belongs to one person (balance, movements, activity, saved, phone) is
// dropped, not just refetched, so the next person never sees the previous one's numbers while it loads.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileInput } from '../api';
import { keys } from '../keys';
import { disablePushOnThisDevice } from '../../push/device';
import { persister } from '../persist';
import { invalidate, isPersonalKey, PERSONAL_KEYS } from '../query';
import { api } from '../source';
import type { Session } from '../types';

export function useSession() {
  return useQuery({ queryKey: keys.session(), queryFn: () => api.auth.getSession() });
}

function useSessionMutation<TInput>(run: (input: TInput) => Promise<Session>, after?: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (session) => {
      client.setQueryData(keys.session(), session);
      for (const key of PERSONAL_KEYS) void client.resetQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: keys.all, predicate: (q) => !isPersonalKey(q.queryKey) && q.queryKey[1] !== 'session' });
      after?.();
    },
  });
}

export const useSignInWithGoogle = () => useSessionMutation<void>(() => api.auth.signInWithGoogle());

export const useSignInWithEmail = () =>
  useSessionMutation<{ email: string; password: string }>(({ email, password }) => api.auth.signInWithEmail(email, password));

/** «¿La olvidaste?»: sends the recovery e-mail. */
export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => api.auth.requestPasswordReset(email) });
}

/** /nueva-contrasena: is there a valid recovery to show the form for? */
export function useRecoveryReady() {
  return useQuery({ queryKey: keys.recovery(), queryFn: () => api.auth.recoveryReady(), retry: false, staleTime: 0 });
}

/** The new password of the recovery session; also signs the person in. */
export const useUpdatePassword = () => useSessionMutation<string>((password) => api.auth.updatePassword(password));

// Signing out first forgets this device's push subscription (#207), then drops the copy kept on the device for
// offline use (#197).
export const useSignOut = () =>
  useSessionMutation<void>(
    async () => {
      await disablePushOnThisDevice();
      return api.auth.signOut();
    },
    () => void persister.removeClient(),
  );

/** «Tu barrio»: saves name, city and zone. The first time it also prepares the wallet. */
export const useSaveProfile = () => useSessionMutation<ProfileInput>((input) => api.auth.saveProfile(input));

/**
 * Yo › «Editar» (SPEC 21): same save, but the person does not change, so their balance, movements and activity are
 * kept (no reset, no pulsing bar). The lists are fetched again because they follow the city and show the name.
 */
export function useEditProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => api.auth.saveProfile(input),
    onSuccess: (session) => {
      client.setQueryData(keys.session(), session);
      invalidate(client, keys.signs(), keys.questions(), keys.activity(), keys.saved());
    },
  });
}
