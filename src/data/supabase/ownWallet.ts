// Own Pollar wallet (SPEC 31): everything goes through /api/stellar/mainnet, which checks the invite list and verifies
// with Pollar and Horizon. The balance is public: the browser reads it from Horizon with fetch.
import type { DataApi } from '../api';
import { DataError } from '../errors';
import type { Offer, OwnRedeemStart, OwnWalletStatus } from '../types';
import { supabase } from './client';
import { rpc, toDataError } from './rpc';
import { supabaseRedemptions } from './redemptions';

const HORIZON = { testnet: 'https://horizon-testnet.stellar.org', mainnet: 'https://horizon.stellar.org' } as const;

async function call<T>(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: T | null }> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new DataError('unauthenticated', 'Sign in first');
  let res: Response;
  try {
    res = await fetch('/api/stellar/mainnet', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw toDataError(error);
  }
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as T | null };
}

type Refusal = { status?: string; why?: string; error?: string };

function refusal(r: Refusal | null, status: number): DataError {
  switch (r?.why) {
    case 'balance':
      return new DataError('limit', 'Not enough yapitas', { limit: 'insufficient_balance' });
    case 'limit':
      return new DataError('limit', 'Offer already redeemed today', { limit: 'redeem_per_day' });
    case 'no_trustline':
    case 'mismatch':
    case 'not_on_chain':
    case 'hash_used':
    case 'too_old':
      return new DataError('validation', `Own wallet: ${r?.why}`, { field: r?.why });
    case undefined:
      return status === 401 ? new DataError('unauthenticated', 'Sign in first') : new DataError(r?.error === 'disabled' ? 'forbidden' : 'server', `mainnet answered ${status}`);
    default:
      return new DataError('forbidden', `Own wallet: ${r?.why}`);
  }
}

async function horizonBalance(network: 'testnet' | 'mainnet', address: string, issuer: string): Promise<number | null> {
  try {
    const res = await fetch(`${HORIZON[network]}/accounts/${address}`);
    if (!res.ok) return null;
    const account = (await res.json()) as { balances: { asset_code?: string; asset_issuer?: string; balance: string }[] };
    const line = account.balances.find((b) => b.asset_code === 'YAPITA' && b.asset_issuer === issuer);
    return line ? Number(line.balance) : null;
  } catch {
    return null;
  }
}

export const supabaseOwnWallet: DataApi['ownWallet'] = {
  async status() {
    const res = await call<Omit<OwnWalletStatus, 'balance'>>({ action: 'status' });
    if (res.body && 'error' in (res.body as object) && (res.body as Refusal).error === 'disabled') {
      return { invited: false, network: 'testnet', issuer: null, address: null, balance: null };
    }
    if (!res.ok || !res.body) throw refusal(res.body as Refusal | null, res.status);
    const s = res.body;
    const balance = s.address && s.issuer ? await horizonBalance(s.network, s.address, s.issuer) : null;
    return { ...s, balance };
  },

  async link(pollarToken) {
    const res = await call<{ status: string; address?: string; welcome?: { txHash: string } | 'already' } & Refusal>({ action: 'link', pollarToken });
    if (res.ok && res.body?.status === 'linked' && res.body.address) {
      const welcome = res.body.welcome;
      return { address: res.body.address, welcomeTxHash: welcome && welcome !== 'already' ? welcome.txHash : null };
    }
    throw refusal(res.body, res.status);
  },

  offers: () => rpc<Offer[]>('list_offers', { p_network: 'mainnet' }),

  async startRedeem(offerId) {
    const res = await call<{ status: string } & OwnRedeemStart & Refusal>({ action: 'start-redeem', offerId });
    if (res.ok && res.body?.status === 'started') {
      const { redemptionId, destination, amount, memo, issuer } = res.body;
      return { redemptionId, destination, amount, memo, issuer };
    }
    throw refusal(res.body, res.status);
  },

  async confirmRedeem(redemptionId, txHash) {
    const res = await call<{ status: string } & Refusal>({ action: 'confirm-redeem', redemptionId, txHash });
    if (res.ok && res.body?.status === 'confirmed') return supabaseRedemptions.get(redemptionId);
    throw refusal(res.body, res.status);
  },
};
