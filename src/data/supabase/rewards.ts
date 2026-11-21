// The yapitas of an action are asked to the T17 routes after the action is saved (SPEC 11). The browser only
// names the action; the server checks it in the database, pays and keeps it idempotent.
import { keys } from '../keys';
import { invalidate, queryClient } from '../query';
import type { RewardCap } from '../types';
import { supabase } from './client';
import { rpc } from './rpc';

export type PremiarReason = 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre';

async function post(path: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
}

/**
 * Whether the reward of an action just saved is over a cap (SPEC 13), with the same SQL rule /premiar uses. A
 * failure to ask counts as «not capped»: the server still decides, and a wrong +N notice is better than no action.
 */
export async function rewardCapOf(reason: 'letrero' | 'sirvio-l' | 'ayuda', refId: number): Promise<RewardCap | null> {
  try {
    return await rpc<RewardCap | null>('my_reward_cap', { p_reason: reason, p_ref: refId });
  } catch {
    return null;
  }
}

/**
 * Fire and forget: a failure never fails the action. The reward stays `pending` in `rewards` and Movimientos
 * offers «Reintentar». When the route answers, the balance and the movements refresh.
 */
export function requestReward(reason: PremiarReason, refId: number): void {
  void post('/api/stellar/premiar', { reason, refId })
    .catch(() => undefined)
    .finally(() => invalidate(queryClient, keys.wallet()));
}

/** «Reintentar» in Movimientos: the server pays the caller's own pending reward again, once. */
export async function retryReward(rewardId: number): Promise<void> {
  try {
    await post('/api/stellar/reintentar', { refId: rewardId });
  } catch {
    /* offline: the row stays as it was */
  } finally {
    invalidate(queryClient, keys.wallet());
  }
}

/** The −5 of an urgent question. True only when the charge is confirmed. */
export async function requestCharge(questionId: number): Promise<boolean> {
  try {
    const res = await post('/api/stellar/gastar', { reason: 'urgente', refId: questionId });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === 'confirmed';
  } catch {
    return false;
  } finally {
    invalidate(queryClient, keys.wallet());
  }
}
