/**
 * Supabase from the server (Vercel functions and scripts). Uses the service role, which bypasses RLS:
 * never import this from src/. The functions validate who is calling before they touch any data.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EncryptedSecret, RewardRow, WalletStore } from '../stellar/wallet.ts';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The person behind a `Authorization: Bearer <access token>` header, or null when the token is not valid. */
export async function userFromRequest(db: SupabaseClient, request: Request): Promise<{ id: string; email: string } | null> {
  const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** `WalletStore` on the Supabase tables `profiles`, `wallet_keys` and `rewards`. */
export function supabaseWalletStore(db: SupabaseClient): WalletStore {
  return {
    async profileExists(profileId) {
      const { data, error } = await db.from('profiles').select('id').eq('id', profileId).maybeSingle();
      fail('profiles', error);
      return data !== null;
    },

    async getKey(profileId) {
      const { data, error } = await db.from('wallet_keys').select('secret_enc, secret_iv').eq('profile_id', profileId).maybeSingle();
      fail('wallet_keys', error);
      return data ? { secretEnc: data.secret_enc, secretIv: data.secret_iv } : null;
    },

    async saveKey(profileId, key) {
      const { error } = await db
        .from('wallet_keys')
        .upsert({ profile_id: profileId, secret_enc: key.secretEnc, secret_iv: key.secretIv }, { onConflict: 'profile_id', ignoreDuplicates: true });
      fail('wallet_keys', error);
      // A parallel call may have stored its own key first: that one wins
      const stored = await this.getKey(profileId);
      if (!stored) throw new Error('wallet_keys: the key was not stored');
      return stored satisfies EncryptedSecret;
    },

    async setStellar(profileId, patch) {
      const update: Record<string, string> = {};
      if (patch.publicKey) update.stellar_pk = patch.publicKey;
      if (patch.status) update.stellar_status = patch.status;
      const { error } = await db.from('profiles').update(update).eq('id', profileId);
      fail('profiles', error);
    },

    async ensureReward({ profileId, memoKey, amount, reason }) {
      const { error } = await db
        .from('rewards')
        .upsert({ profile_id: profileId, memo_key: memoKey, amount, reason }, { onConflict: 'memo_key', ignoreDuplicates: true });
      fail('rewards', error);
      const { data, error: readError } = await db.from('rewards').select('id, status, tx_hash').eq('memo_key', memoKey).single();
      fail('rewards', readError);
      return { id: data.id, status: data.status, txHash: data.tx_hash } satisfies RewardRow;
    },

    async settleReward(id, patch) {
      const { error } = await db
        .from('rewards')
        .update({ status: patch.status, tx_hash: patch.txHash ?? null, updated_at: new Date().toISOString() })
        .eq('id', id);
      fail('rewards', error);
    },
  };
}
