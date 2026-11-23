/**
 * Supabase from the server (Vercel functions and scripts). Uses the service role, which bypasses RLS:
 * never import this from src/. The functions validate who is calling before they touch any data.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RedeemFacts, RewardCap, RewardFacts } from '../stellar/rewards.ts';
import type { OwnWalletStore } from '../stellar/ownWallet.ts';
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

    async markError(profileId) {
      const { error } = await db.from('profiles').update({ stellar_status: 'error' }).eq('id', profileId).neq('stellar_status', 'ready');
      fail('profiles', error);
    },

    async getStellar(profileId) {
      const { data, error } = await db.from('profiles').select('stellar_pk, stellar_status').eq('id', profileId).maybeSingle();
      fail('profiles', error);
      return { publicKey: data?.stellar_pk ?? null, status: data?.stellar_status ?? 'preparing' };
    },

    async ensureReward({ profileId, sourceId, memoKey, amount, reason, redemptionId }) {
      const { error } = await db
        .from('rewards')
        .upsert(
          { profile_id: profileId, source_id: sourceId ?? null, memo_key: memoKey, amount, reason, redemption_id: redemptionId ?? null },
          { onConflict: 'memo_key', ignoreDuplicates: true },
        );
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

const URGENT_HOURS = 24;

/** Makes a paid question urgent for 24 h. A repeated call keeps the first deadline. */
export async function markUrgent(db: SupabaseClient, questionId: number): Promise<void> {
  const until = new Date(Date.now() + URGENT_HOURS * 3600 * 1000).toISOString();
  const { error } = await db.from('questions').update({ urgent_until: until }).eq('id', questionId).is('urgent_until', null);
  fail('questions', error);
}

/** `RewardFacts` on the Supabase tables that decide whether a reward is legitimate (service role: RLS is not in the way). */
export function supabaseRewardFacts(db: SupabaseClient): RewardFacts {
  return {
    async sign(id) {
      const { data, error } = await db.from('signs').select('author_id').eq('id', id).maybeSingle();
      fail('signs', error);
      return data ? { authorId: data.author_id } : null;
    },

    async signVote(signId, voterId) {
      const { data, error } = await db.from('sign_votes').select('helpful').eq('sign_id', signId).eq('voter_id', voterId).maybeSingle();
      fail('sign_votes', error);
      return data ? { helpful: data.helpful } : null;
    },

    async question(id) {
      const { data, error } = await db.from('questions').select('author_id, status, urgent_until').eq('id', id).maybeSingle();
      fail('questions', error);
      if (!data) return null;
      const { count, error: countError } = await db.from('answers').select('id', { count: 'exact', head: true }).eq('question_id', id);
      fail('answers', countError);
      return { authorId: data.author_id, status: data.status, urgent: data.urgent_until !== null, answerCount: count ?? 0 };
    },

    async answer(id) {
      const { data, error } = await db.from('answers').select('author_id, question_id').eq('id', id).maybeSingle();
      fail('answers', error);
      return data ? { authorId: data.author_id, questionId: data.question_id } : null;
    },

    async rating(answerId, raterId) {
      const { data, error } = await db.from('ratings').select('helpful').eq('answer_id', answerId).eq('rater_id', raterId).maybeSingle();
      fail('ratings', error);
      return data ? { helpful: data.helpful } : null;
    },

    /** The one rule of the caps lives in SQL (0007 `reward_cap`), shared with the browser's notice. */
    async rewardCap(plan, refId) {
      const { data, error } = await db.rpc('reward_cap', {
        p_reason: plan.reason,
        p_recipient: plan.recipientId,
        p_source: plan.sourceId,
        p_memo: plan.memoKey,
        p_ref: refId,
      });
      fail('reward_cap', error);
      return (data as RewardCap | null) ?? null;
    },

    async otherActiveUrgent(authorId, exceptQuestionId) {
      const { data, error } = await db
        .from('questions')
        .select('id')
        .eq('author_id', authorId)
        .neq('id', exceptQuestionId)
        .gt('urgent_until', new Date().toISOString())
        .limit(1);
      fail('questions', error);
      return (data ?? []).length > 0;
    },
  };
}

const DAY_MS = 24 * 3600 * 1000;
/** Bolivia is UTC−4 all year (no daylight saving). */
const BOLIVIA_OFFSET_MS = 4 * 3600 * 1000;

/** The last Bolivian midnight, as an ISO date (same rule as SQL `bolivia_day_start`). */
export function boliviaDayStart(now = Date.now()): string {
  return new Date(Math.floor((now - BOLIVIA_OFFSET_MS) / DAY_MS) * DAY_MS + BOLIVIA_OFFSET_MS).toISOString();
}

/** `RedeemFacts` on the SPEC 29 tables (service role), for one network (SPEC 31 adds `mainnet`). */
export function supabaseRedeemFacts(db: SupabaseClient, network: 'testnet' | 'mainnet' = 'testnet'): RedeemFacts {
  return {
    async offer(id) {
      const { data, error } = await db
        .from('offers')
        .select('id, cost, active, partner_id, partners!inner(profile_id)')
        .eq('id', id)
        .maybeSingle<{ id: number; cost: number; active: boolean; partner_id: number; partners: { profile_id: number } }>();
      fail('offers', error);
      return data ? { id: data.id, partnerId: data.partner_id, partnerProfileId: data.partners.profile_id, cost: data.cost, active: data.active } : null;
    },

    async redeemedToday(profileId, offerId) {
      const { data, error } = await db
        .from('redemptions')
        .select('id')
        .eq('profile_id', profileId)
        .eq('offer_id', offerId)
        .eq('status', 'confirmed')
        .eq('network', network)
        .gte('created_at', boliviaDayStart())
        .limit(1);
      fail('redemptions', error);
      return (data ?? []).length > 0;
    },

    async createRedemption({ offerId, profileId, partnerId, cost }) {
      const { data, error } = await db
        .from('redemptions')
        .insert({ offer_id: offerId, profile_id: profileId, partner_id: partnerId, cost, network })
        .select('id')
        .single<{ id: number }>();
      fail('redemptions', error);
      return data!.id;
    },

    async settleRedemption(id, patch) {
      const { error } = await db.from('redemptions').update({ status: patch.status, tx_hash: patch.txHash ?? null }).eq('id', id);
      fail('redemptions', error);
    },
  };
}

/** `OwnWalletStore` (SPEC 31) on `profiles.mainnet_address`, `mainnet_payments` and `redemptions` (service role). */
export function supabaseOwnWalletStore(db: SupabaseClient): OwnWalletStore {
  const addressOf = async (profileId: number) => {
    const { data, error } = await db.from('profiles').select('mainnet_address').eq('id', profileId).maybeSingle<{ mainnet_address: string | null }>();
    fail('profiles', error);
    return data?.mainnet_address ?? null;
  };
  return {
    address: addressOf,
    partnerAddress: addressOf,

    async setAddress(profileId, address) {
      const { error } = await db.from('profiles').update({ mainnet_address: address }).eq('id', profileId);
      if (error?.code === '23505') throw new Error('taken');
      fail('profiles', error);
    },

    async welcomePaid(profileId) {
      const { data, error } = await db.from('mainnet_payments').select('id').eq('profile_id', profileId).eq('kind', 'bienvenida').limit(1);
      fail('mainnet_payments', error);
      return (data ?? []).length > 0;
    },

    async recordPayment({ profileId, kind, redemptionId, amount, txHash }) {
      const { error } = await db
        .from('mainnet_payments')
        .upsert({ profile_id: profileId, kind, redemption_id: redemptionId ?? null, amount, tx_hash: txHash }, { onConflict: 'tx_hash', ignoreDuplicates: true });
      fail('mainnet_payments', error);
    },

    async redemption(id) {
      const { data, error } = await db
        .from('redemptions')
        .select('id, profile_id, cost, status, network, created_at, partners!inner(profile_id)')
        .eq('id', id)
        .maybeSingle<{ id: number; profile_id: number; cost: number; status: 'pending' | 'confirmed' | 'error'; network: 'testnet' | 'mainnet'; created_at: string; partners: { profile_id: number } }>();
      fail('redemptions', error);
      if (!data) return null;
      return {
        id: data.id,
        profileId: data.profile_id,
        cost: data.cost,
        status: data.status,
        network: data.network,
        createdAt: new Date(data.created_at).toISOString(),
        partnerAddress: await addressOf(data.partners.profile_id),
      };
    },

    async hashUsed(txHash) {
      const { data, error } = await db.from('mainnet_payments').select('id').eq('tx_hash', txHash).limit(1);
      fail('mainnet_payments', error);
      return (data ?? []).length > 0;
    },
  };
}
