// `auth` of the Supabase adapter (SPEC 07, T15): Google, e-mail + password and password recovery.
// The rest of the adapter (signs, questions, wallet…) arrives with the tasks that need it.
import type { DataApi, ProfileInput } from '../api';
import { DataError } from '../errors';
import { CITIES } from '../catalog';
import type { Badge, City, Session } from '../types';
import { recovery, supabase } from './client';
import { ensureWallet } from './wallet';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

/** Auth and network failures become the DataError the screens know. */
function mapError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return new DataError('offline', 'No connection');
  const e = (error ?? {}) as { name?: string; code?: string; message?: string };
  if (e.name === 'AuthRetryableFetchError') return new DataError('offline', 'Could not reach Supabase');
  if (e.code === 'weak_password') return new DataError('validation', e.message ?? 'Weak password', { field: 'password' });
  if (e.code === 'email_address_invalid') return new DataError('validation', e.message ?? 'Invalid email', { field: 'email' });
  return new DataError('server', e.message ?? 'Authentication failed');
}

function checkEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean)) throw new DataError('validation', 'Invalid email', { field: 'email' });
  return clean;
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD) {
    throw new DataError('validation', `Password needs at least ${MIN_PASSWORD} characters`, { field: 'password' });
  }
}

type ProfileRow = { id: number; display_name: string; full_name: string; city: string; zone: string };
type TrustRow = { stars: number | string | null; badge: Badge };

/**
 * The name the neighbors see (wiki #173): the first word plus the initial of the surname. With 2 or 3 words
 * the surname is the last one («Lucía Mamani» → «Lucía M.»); with 4 or more there are two surnames, so it is
 * the one before the last («Diego Marcelo Choque Ramirez» → «Diego C.»). One word stays as it is.
 */
export function displayNameOf(fullName: string): string {
  const words = fullName.split(' ');
  if (words.length === 1) return words[0];
  const surname = words.length >= 4 ? words[words.length - 2] : words[words.length - 1];
  return `${words[0]} ${surname[0].toUpperCase()}.`;
}

async function readSession(): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw mapError(error);
  const user = data.session?.user;
  if (!user) return { status: 'guest' };

  // No row in `profiles` means «Tu barrio» is still pending (T16)
  const { data: row, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, city, zone')
    .eq('auth_id', user.id)
    .maybeSingle<ProfileRow>();
  if (profileError) throw mapError(profileError);
  if (!row) {
    const meta = user.user_metadata as { full_name?: unknown; name?: unknown } | null;
    const known = [meta?.full_name, meta?.name].find((v): v is string => typeof v === 'string' && v.trim() !== '');
    return { status: 'signed-in', userId: 0, email: user.email ?? '', profile: null, suggestedName: known?.trim() };
  }

  const { data: trust } = await supabase
    .from('author_trust')
    .select('stars, badge')
    .eq('profile_id', row.id)
    .maybeSingle<TrustRow>();

  return {
    status: 'signed-in',
    userId: row.id,
    email: user.email ?? '',
    profile: {
      id: row.id,
      displayName: row.display_name,
      stars: trust?.stars == null ? null : Number(trust.stars),
      badge: trust?.badge ?? 'Vecino nuevo',
      fullName: row.full_name,
      city: row.city as City, // the table's check constraint keeps it inside the 10 cities
      zone: row.zone,
    },
  };
}

export const supabaseAuth: DataApi['auth'] = {
  getSession: () => readSession().catch((error) => Promise.reject(mapError(error))),

  /** Leaves the app for Google. It never resolves: the page is gone before the answer. */
  async signInWithGoogle() {
    // The origin root is the Redirect URL allowed in the dashboard; the page to return to is kept by
    // the pending action (SPEC 07), not by the URL
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw mapError(error);
    return new Promise<Session>(() => undefined);
  },

  /** `auth_method` (migration 0004) says which of the three cases this e-mail is. */
  async signInWithEmail(email, password) {
    const clean = checkEmail(email);
    checkPassword(password);

    const { data: method, error: methodError } = await supabase.rpc('auth_method', { p_email: clean });
    if (methodError) throw mapError(methodError);
    if (method === 'google') throw new DataError('google_account', 'This account enters with Google');

    if (method === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
      if (error?.code === 'invalid_credentials') throw new DataError('wrong_password', 'Wrong password');
      if (error) throw mapError(error);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: clean, password });
      if (error) throw mapError(error);
      // «Confirm email» must be off (supabase/README.md › Auth setup): without a session the flow stops
      if (!data.session) throw new DataError('server', 'Sign-up returned no session: turn «Confirm email» off');
    }
    return readSession();
  },

  async requestPasswordReset(email) {
    const clean = checkEmail(email);
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    });
    if (error) throw mapError(error);
  },

  /** Waits for Supabase to exchange the link's code, then answers whether it was a recovery link. */
  async recoveryReady() {
    await supabase.auth.initialize();
    return recovery.get();
  },

  async updatePassword(password) {
    checkPassword(password);
    if (!recovery.get()) throw new DataError('unauthenticated', 'The recovery link is not valid');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw mapError(error);
    recovery.clear();
    return readSession();
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw mapError(error);
    recovery.clear();
    return { status: 'guest' } as const;
  },

  /**
   * «Tu barrio». Saves the profile with RLS (the person writes their own row), then asks the server
   * to prepare the Stellar account in the background: «Listo» never waits for Friendbot.
   */
  async saveProfile(input: ProfileInput): Promise<Session> {
    try {
      const fullName = input.fullName.trim().replace(/\s+/g, ' ');
      const zone = input.zone.trim().replace(/\s+/g, ' ');
      if (fullName.length < 2 || fullName.length > 60) throw new DataError('validation', 'Invalid name', { field: 'fullName' });
      if (!CITIES.includes(input.city)) throw new DataError('validation', 'Unknown city', { field: 'city' });
      if (zone.length < 1 || zone.length > 60) throw new DataError('validation', 'Invalid zone', { field: 'zone' });

      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new DataError('unauthenticated', 'Sign in first');
      const fields = { display_name: displayNameOf(fullName), full_name: fullName, city: input.city, zone };

      const { data: existing, error: lookupError } = await supabase.from('profiles').select('id').eq('auth_id', data.user.id).maybeSingle();
      if (lookupError) throw mapError(lookupError);
      const { error: saveError } = existing
        ? await supabase.from('profiles').update(fields).eq('id', existing.id)
        : await supabase.from('profiles').insert({ auth_id: data.user.id, ...fields });
      if (saveError) throw mapError(saveError);

      ensureWallet(); // not awaited on purpose: the screen shows «Preparando tu cuenta» meanwhile
      return await readSession();
    } catch (error) {
      throw mapError(error);
    }
  },
};
