// Redemption with partner businesses (SPEC 29). Offers and receipts come from the SQL functions of 0012; the
// payment goes through /api/stellar/gastar, which signs from the neighbor's custodial account (all or nothing).
import type { DataApi } from '../api';
import { DataError } from '../errors';
import type { Offer, Redemption } from '../types';
import { supabase } from './client';
import { rpc, toDataError } from './rpc';

type NotCharged = { status: 'not_charged'; why: 'disabled' | 'unavailable' | 'own' | 'limit' | 'balance' | 'stellar' };

/** Why nothing was charged, as the DataError the screens know. */
function refusal(why: NotCharged['why']): DataError {
  switch (why) {
    case 'balance':
      return new DataError('limit', 'Not enough yapitas', { limit: 'insufficient_balance' });
    case 'limit':
      return new DataError('limit', 'Offer already redeemed today', { limit: 'redeem_per_day' });
    case 'stellar':
      return new DataError('server', 'Stellar payment failed');
    default:
      return new DataError('forbidden', `Redemption not available: ${why}`);
  }
}

export const supabaseRedemptions: DataApi['redemptions'] = {
  offers: () => rpc<Offer[]>('list_offers'),

  async redeem(offerId) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new DataError('unauthenticated', 'Sign in to redeem');
    let res: Response;
    try {
      res = await fetch('/api/stellar/gastar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ reason: 'canje', refId: offerId }),
      });
    } catch (error) {
      throw toDataError(error);
    }
    const body = (await res.json().catch(() => null)) as { status?: string; redemptionId?: number; why?: NotCharged['why'] } | null;
    if (res.ok && body?.status === 'confirmed' && body.redemptionId) return supabaseRedemptions.get(body.redemptionId);
    if (body?.status === 'not_charged' && body.why) throw refusal(body.why);
    if (res.status === 401) throw new DataError('unauthenticated', 'Sign in to redeem');
    throw new DataError('server', `gastar answered ${res.status}`);
  },

  offersForSign: (signId) => rpc<Offer[]>('sign_offers', { p_sign_id: signId }),

  async get(id) {
    const receipt = await rpc<Redemption | null>('get_redemption', { p_id: id });
    if (!receipt) throw new DataError('not_found', 'Redemption not found');
    return { ...receipt, createdAt: new Date(receipt.createdAt).toISOString() };
  },
};
