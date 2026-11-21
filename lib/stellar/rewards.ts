/**
 * Yapitas earned and spent by an action (SPEC 09). Server-side: never import from src/.
 *
 * `planReward` and `planCharge` decide, from rows read through `RewardFacts`, whether the caller may trigger
 * the action and what it is worth: the client only names the action (`reason`, `refId`). `payReward` and
 * `chargeUrgent` move the yapitas exactly once: the unique `rewards.memo_key` plus a look for the memo on the
 * chain stop a repeated or simultaneous call from paying twice. Storage is behind `WalletStore` and `RewardFacts`
 * so the same code runs on Supabase (api/) and in memory (scripts/stellar/e2e.ts).
 */
import { Keypair } from '@stellar/stellar-sdk';
import { memoFor, payPoints, pointsBalance, pointsMovements } from './points.ts';
import { decryptSecret, type RewardReason, type WalletEnv, type WalletStore } from './wallet.ts';

export type PremiarReason = 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre';
export type GastarReason = 'urgente';

export type RewardPlan = {
  /** The profile that receives (premiar) or pays (gastar). */
  recipientId: number;
  reason: RewardReason;
  /** +1, +5 or −5. */
  amount: number;
  /** `rewards.memo_key`, and also the Stellar memo (at most 28 bytes). */
  memoKey: string;
};

export type QuestionFacts = { authorId: number; status: 'open' | 'solved' | 'closed'; urgent: boolean; answerCount: number };

/** The rows that decide whether an action is legitimate. Each one resolves to null when it does not exist. */
export interface RewardFacts {
  sign(id: number): Promise<{ authorId: number } | null>;
  signVote(signId: number, voterId: number): Promise<{ helpful: boolean } | null>;
  question(id: number): Promise<QuestionFacts | null>;
  answer(id: number): Promise<{ authorId: number; questionId: number } | null>;
  /** The caller's own rating of the answer, if they gave one. */
  rating(answerId: number, raterId: number): Promise<{ helpful: boolean } | null>;
}

export const PREMIAR_REASONS: readonly PremiarReason[] = ['letrero', 'sirvio-l', 'ayuda', 'cierre'];
export const URGENT_COST = 5;

function plan(recipientId: number, reason: RewardReason, amount: number, memoKey: string): RewardPlan {
  memoFor(memoKey); // throws if it does not fit in 28 bytes
  return { recipientId, reason, amount, memoKey };
}

/** What `callerId` earns for `reason` on `refId`, or null when the action does not exist or is not theirs to claim. */
export async function planReward(facts: RewardFacts, callerId: number, reason: PremiarReason, refId: number): Promise<RewardPlan | null> {
  switch (reason) {
    case 'letrero': {
      const sign = await facts.sign(refId);
      return sign && sign.authorId === callerId ? plan(callerId, 'letrero', 1, `letrero:${refId}`) : null;
    }
    case 'sirvio-l': {
      const sign = await facts.sign(refId);
      if (!sign || sign.authorId === callerId) return null;
      const vote = await facts.signVote(refId, callerId);
      return vote?.helpful ? plan(sign.authorId, 'sirvio-l', 1, `sirvio-l:${refId}-${callerId}`) : null;
    }
    case 'ayuda': {
      const answer = await facts.answer(refId);
      if (!answer || answer.authorId === callerId) return null;
      const question = await facts.question(answer.questionId);
      if (!question || question.authorId !== callerId) return null;
      const rating = await facts.rating(refId, callerId);
      return rating?.helpful ? plan(answer.authorId, 'ayuda', 5, `ayuda:${refId}`) : null;
    }
    case 'cierre': {
      const question = await facts.question(refId);
      const closed = question && question.status !== 'open' && question.answerCount >= 1;
      return question && closed && question.authorId === callerId ? plan(callerId, 'cierre', 1, `cierre:${refId}`) : null;
    }
  }
}

/** What `callerId` pays to make their question urgent, or null when it is not theirs or not urgent. */
export async function planCharge(facts: RewardFacts, callerId: number, _reason: GastarReason, refId: number): Promise<RewardPlan | null> {
  const question = await facts.question(refId);
  return question && question.authorId === callerId && question.urgent ? plan(callerId, 'urgente', -URGENT_COST, `urgente:${refId}`) : null;
}

export type PayResult = { status: 'confirmed'; txHash: string } | { status: 'pending' };
export type ChargeResult = { status: 'confirmed'; txHash: string } | { status: 'not_charged'; why: 'balance' | 'stellar' };

/** The movements to look through for the memo of a payment. A memo is unique, so one hit means it was paid. */
const LOOKBACK = 20;
const RETRIES = 3;

async function findOnChain(publicKey: string, env: WalletEnv, direction: 'in' | 'out', memo: string): Promise<string | undefined> {
  const movements = await pointsMovements(publicKey, env.issuerPublic, LOOKBACK);
  return movements.find((m) => m.direction === direction && m.memo === memo)?.hash;
}

/**
 * Two things that are not a failure of the payment, only of the moment: the distributor is one account, so two
 * payments at once can collide on the sequence number («tx_bad_seq»), and Horizon can answer «504» for a
 * transaction that is still being applied. Either way, try again after a short random pause: the attempt looks
 * for the memo on the chain first, so a payment that did land is never sent twice.
 */
const isTransient = (error: unknown) => /tx_bad_seq|504|Gateway Timeout|Timeout/i.test(String(error));

async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (i >= RETRIES || !isTransient(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
    }
  }
}

/** Pays a reward once. Pending (not an error) when the recipient has no ready account or Stellar fails: the same call finishes it later. */
export async function payReward(store: WalletStore, plan: RewardPlan, env: WalletEnv): Promise<PayResult> {
  const reward = await store.ensureReward({ profileId: plan.recipientId, memoKey: plan.memoKey, amount: plan.amount, reason: plan.reason });
  if (reward.status === 'confirmed' && reward.txHash) return { status: 'confirmed', txHash: reward.txHash };

  const account = await store.getStellar(plan.recipientId);
  if (!account.publicKey || account.status !== 'ready') return { status: 'pending' };

  try {
    const hash = await withRetry(async () => {
      const paid = await findOnChain(account.publicKey as string, env, 'in', plan.memoKey);
      if (paid) return paid;
      const result = await payPoints({
        from: Keypair.fromSecret(env.distributorSecret),
        to: account.publicKey as string,
        amount: String(plan.amount),
        issuerPublicKey: env.issuerPublic,
        memo: plan.memoKey,
      });
      return result.hash;
    });
    await store.settleReward(reward.id, { status: 'confirmed', txHash: hash });
    return { status: 'confirmed', txHash: hash };
  } catch (error) {
    console.error(`reward ${plan.memoKey} stays pending:`, error);
    return { status: 'pending' };
  }
}

/** Charges the urgent question once, from the payer's own account to the distributor. A failure charges nothing. */
export async function chargeUrgent(store: WalletStore, plan: RewardPlan, env: WalletEnv): Promise<ChargeResult> {
  const reward = await store.ensureReward({ profileId: plan.recipientId, memoKey: plan.memoKey, amount: plan.amount, reason: plan.reason });
  if (reward.status === 'confirmed' && reward.txHash) return { status: 'confirmed', txHash: reward.txHash };

  const notCharged = async (why: 'balance' | 'stellar'): Promise<ChargeResult> => {
    await store.settleReward(reward.id, { status: 'error' });
    return { status: 'not_charged', why };
  };

  const account = await store.getStellar(plan.recipientId);
  const key = await store.getKey(plan.recipientId);
  if (!account.publicKey || account.status !== 'ready' || !key) return notCharged('stellar');

  try {
    if (Number(await pointsBalance(account.publicKey, env.issuerPublic)) < -plan.amount && !(await findOnChain(account.publicKey, env, 'out', plan.memoKey))) {
      return await notCharged('balance');
    }
    const publicKey = account.publicKey;
    const hash = await withRetry(async () => {
      const paid = await findOnChain(publicKey, env, 'out', plan.memoKey);
      if (paid) return paid;
      const result = await payPoints({
        from: Keypair.fromSecret(decryptSecret(key, env.encryptionKey)),
        to: Keypair.fromSecret(env.distributorSecret).publicKey(),
        amount: String(-plan.amount),
        issuerPublicKey: env.issuerPublic,
        memo: plan.memoKey,
      });
      return result.hash;
    });
    await store.settleReward(reward.id, { status: 'confirmed', txHash: hash });
    return { status: 'confirmed', txHash: hash };
  } catch (error) {
    console.error(`charge ${plan.memoKey} not charged:`, error);
    return notCharged('stellar');
  }
}
