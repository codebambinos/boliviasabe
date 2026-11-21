// The one Supabase client of the browser (SPEC 07). It only gets public values: the project URL and
// the anon key. The service role key never reaches the browser.
import { createClient } from '@supabase/supabase-js';
import { DataError } from '../errors';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new DataError('server', 'VITE_DATA_SOURCE=supabase needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, anonKey, {
  // PKCE: the e-mail and Google links carry a one-time code, not the tokens themselves
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/**
 * «This page was opened from a recovery link.» Supabase signals it once, with PASSWORD_RECOVERY, while
 * it exchanges the code in the URL. sessionStorage keeps it across a reload of /nueva-contrasena.
 */
const RECOVERY_KEY = 'bs:recovery:v1';
let recoveringInMemory = false;

export const recovery = {
  get(): boolean {
    try {
      return recoveringInMemory || sessionStorage.getItem(RECOVERY_KEY) === '1';
    } catch {
      return recoveringInMemory;
    }
  },
  set(): void {
    recoveringInMemory = true;
    try {
      sessionStorage.setItem(RECOVERY_KEY, '1');
    } catch {
      /* private mode: the in-memory flag is enough until a reload */
    }
  },
  clear(): void {
    recoveringInMemory = false;
    try {
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recovery.set();
  if (event === 'SIGNED_OUT') recovery.clear();
});
