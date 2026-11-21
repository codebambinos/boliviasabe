// The caller's profile, which every write needs (author id, city, default zone).
import { DataError } from '../errors';
import type { City } from '../types';
import { supabase } from './client';
import { toDataError } from './rpc';

export type Me = { id: number; city: City; zone: string };

/** Rejects with `unauthenticated` for guests, and with field `profile` while «Tu barrio» is pending. */
export async function requireMe(): Promise<Me> {
  const { data: auth } = await supabase.auth.getSession();
  const user = auth.session?.user;
  if (!user) throw new DataError('unauthenticated', 'Sign in first');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, city, zone')
    .eq('auth_id', user.id)
    .maybeSingle<Me>();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('unauthenticated', 'Tu barrio is pending', { field: 'profile' });
  return data;
}
