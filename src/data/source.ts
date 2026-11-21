// Picks the adapter behind the hooks. VITE_DATA_SOURCE=mock|supabase (default: mock).
// With `supabase` only `auth` is real (SPEC 07, T15); the rest still runs on the mock until its
// own task lands. The Supabase code loads on first use, so the mock build never ships it.
import type { DataApi } from './api';
import type { Session } from './types';
import { followRealSession, mockAdapter } from './mock/adapter';

/** The mock keeps its own session, so it follows the real one (see followRealSession). */
async function bridged(session: Promise<Session>): Promise<Session> {
  const result = await session;
  followRealSession(result);
  return result;
}

function lazyAuth(): DataApi['auth'] {
  const load = () => import('./supabase/auth').then((module) => module.supabaseAuth);
  return {
    getSession: () => bridged(load().then((auth) => auth.getSession())),
    signInWithGoogle: () => bridged(load().then((auth) => auth.signInWithGoogle())),
    signInWithEmail: (email, password) => bridged(load().then((auth) => auth.signInWithEmail(email, password))),
    requestPasswordReset: (email) => load().then((auth) => auth.requestPasswordReset(email)),
    recoveryReady: () => load().then((auth) => auth.recoveryReady()),
    updatePassword: (password) => bridged(load().then((auth) => auth.updatePassword(password))),
    signOut: () => bridged(load().then((auth) => auth.signOut())),
    saveProfile: (input) => load().then((auth) => auth.saveProfile(input)),
  };
}

function pickAdapter(): DataApi {
  const source = import.meta.env.VITE_DATA_SOURCE as string | undefined;
  if (source === 'supabase') return { ...mockAdapter, auth: lazyAuth() };
  if (source && source !== 'mock') console.warn(`VITE_DATA_SOURCE="${source}" is unknown. Using the mock adapter.`);
  return mockAdapter;
}

export const api: DataApi = pickAdapter();
