// Calls to the SQL functions of migration 0005 (SPEC 11) and the translation of their errors to DataError.
// The functions raise SQLSTATEs on purpose: 28000 unauthenticated, 42501 forbidden, P0002 not_found, BSLIM limit (0007).
import { DataError, type LimitReason } from '../errors';
import { supabase } from './client';

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };

const LIMITS: readonly LimitReason[] = ['questions_per_day', 'open_questions', 'urgent_active', 'insufficient_balance', 'comments_per_hour'];

/** Postgres, PostgREST and network failures become the DataError the screens know. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const e = (error ?? {}) as PgError;
  const message = e.message ?? 'Supabase request failed';
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || /Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return new DataError('offline', 'No connection');
  }
  switch (e.code) {
    case 'BSLIM': {
      // 0007: message 'limit:<reason>', hint = when it frees (ISO) or empty
      const reason = message.replace(/^limit:/, '') as LimitReason;
      return new DataError('limit', message, { limit: LIMITS.includes(reason) ? reason : undefined, until: e.hint || undefined });
    }
    case '28000':
      return new DataError('unauthenticated', message);
    case 'P0002':
    case 'PGRST116': // .single() found no row
      return new DataError('not_found', message);
    case '42501':
      // A guest calling a function only signed-in people may run
      if (/permission denied for function/i.test(message)) return new DataError('unauthenticated', message);
      return new DataError('forbidden', message);
    case '23505': // a second vote, answer or report by the same person
      return new DataError('forbidden', message);
    case '23514': // a check constraint (lengths, tags, Maps link)
      return new DataError('validation', message);
    default:
      return new DataError('server', message);
  }
}

/** Runs a SQL function and returns its JSON already shaped like the types of src/data/types.ts. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toDataError(error);
  return data as T;
}

/** The opaque cursor of the lists is the offset of the next page. */
export const offsetOf = (cursor?: string | null): number => (cursor ? Number(cursor) || 0 : 0);
