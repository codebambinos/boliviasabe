// Session hooks. Signing in or out refreshes every other query: «isMine», «savedByMe» and
// the wallet depend on who is looking.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileInput } from '../api';
import { keys } from '../keys';
import { api } from '../source';
import type { Session } from '../types';

export function useSession() {
  return useQuery({ queryKey: keys.session(), queryFn: () => api.auth.getSession() });
}

function useSessionMutation<TInput>(run: (input: TInput) => Promise<Session>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (session) => {
      client.setQueryData(keys.session(), session);
      void client.invalidateQueries({ queryKey: keys.all, predicate: (q) => q.queryKey[1] !== 'session' });
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

export const useSignOut = () => useSessionMutation<void>(() => api.auth.signOut());

/** «Tu barrio»: saves name, city and zone. The first time it also prepares the wallet. */
export const useSaveProfile = () => useSessionMutation<ProfileInput>((input) => api.auth.saveProfile(input));
