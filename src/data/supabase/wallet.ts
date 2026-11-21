// `wallet` of the Supabase adapter (SPEC 08, T16): status and address from the profile, balance from
// Horizon with `fetch`. The Stellar SDK stays on the server. Movimientos arrive with T17.
import type { DataApi } from '../api';
import { DataError } from '../errors';
import type { Wallet } from '../types';
import { supabase } from './client';

const HORIZON = 'https://horizon-testnet.stellar.org';
const ASSET_CODE = 'YAPITA';
const ISSUER = import.meta.env.VITE_YAPITA_ISSUER_PUBLIC as string | undefined;
const RETRY_COOLDOWN_MS = 20_000;

let inFlight: Promise<void> | null = null;
let lastTry = 0;

/**
 * Asks the server to prepare (or finish preparing) the Stellar account. Never throws and never runs twice
 * at once: a failure is not an error for the person, the wallet just keeps saying «Preparando…».
 */
export function ensureWallet(): Promise<void> {
  if (inFlight) return inFlight;
  if (Date.now() - lastTry < RETRY_COOLDOWN_MS) return Promise.resolve();
  lastTry = Date.now();
  inFlight = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await fetch('/api/stellar/crear-cuenta', {
        method: 'POST',
        headers: { authorization: `Bearer ${data.session.access_token}` },
      });
    } catch {
      /* offline or the function is down: the next wallet.get tries again after the cooldown */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

type Balance = { asset_code?: string; asset_issuer?: string; balance: string };

/** YAPITA balance of an account, or null when Horizon does not answer (the screen keeps the last one). */
async function readBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(`${HORIZON}/accounts/${encodeURIComponent(address)}`);
    if (res.status === 404) return 0;
    if (!res.ok) return null;
    const account = (await res.json()) as { balances: Balance[] };
    const line = account.balances.find((b) => b.asset_code === ASSET_CODE && (!ISSUER || b.asset_issuer === ISSUER));
    return line ? Number(line.balance) : 0;
  } catch {
    return null;
  }
}

export const supabaseWallet: Pick<DataApi['wallet'], 'get'> = {
  async get(): Promise<Wallet> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new DataError('unauthenticated', 'Sign in first');
    const { data, error } = await supabase
      .from('profiles')
      .select('stellar_pk, stellar_status')
      .eq('auth_id', auth.user.id)
      .maybeSingle<{ stellar_pk: string | null; stellar_status: Wallet['status'] }>();
    if (error) throw new DataError(navigator.onLine ? 'server' : 'offline', error.message);
    if (!data) throw new DataError('unauthenticated', 'Tu barrio is pending', { field: 'profile' });

    if (data.stellar_status !== 'ready' || !data.stellar_pk) {
      void ensureWallet();
      return { status: 'preparing', address: data.stellar_pk, balance: null };
    }
    return { status: 'ready', address: data.stellar_pk, balance: await readBalance(data.stellar_pk) };
  },
};
