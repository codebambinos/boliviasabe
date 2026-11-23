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
  /** Who gave it, for the pair cap (SPEC 13): the voter of sirvio-l, the asker of ayuda; null otherwise. */
  sourceId: number | null;
  reason: RewardReason;
  /** +1, +5 or −5. */
  amount: number;
  /** `rewards.memo_key`, and also the Stellar memo (at most 28 bytes). */
  memoKey: string;
};

/** Why a reward is saved but not paid (wiki reglas-finales › Antiabuso, #188-189). Same values as SQL `reward_cap`. */
export type RewardCap = 'signs_per_day' | 'answers_per_question' | 'pair_per_day';
/** A legitimate action whose reward is over a cap: nothing is paid and no `rewards` row is created. */
export type CappedReward = { capped: RewardCap };

export type QuestionFacts = { authorId: number; status: 'open' | 'solved' | 'closed'; urgent: boolean; answerCount: number };

/** The rows that decide whether an action is legitimate. Each one resolves to null when it does not exist. */
export interface RewardFacts {
  sign(id: number): Promise<{ authorId: number } | null>;
  signVote(signId: number, voterId: number): Promise<{ helpful: boolean } | null>;
  question(id: number): Promise<QuestionFacts | null>;
  answer(id: number): Promise<{ authorId: number; questionId: number } | null>;
  /** The caller's own rating of the answer, if they gave one. */
  rating(answerId: number, raterId: number): Promise<{ helpful: boolean } | null>;
  /** The cap the reward is over, or null when it may be paid. Never caps a memo that already has a row. */
  rewardCap(plan: RewardPlan, refId: number): Promise<RewardCap | null>;
  /** Whether the author has another question still urgent (wiki #190: one active urgent per person). */
  otherActiveUrgent(authorId: number, exceptQuestionId: number): Promise<boolean>;
}

export const PREMIAR_REASONS: readonly PremiarReason[] = ['letrero', 'sirvio-l', 'ayuda', 'cierre'];
export const URGENT_COST = 5;

function plan(recipientId: number, reason: RewardReason, amount: number, memoKey: string, sourceId: number | null = null): RewardPlan {
  memoFor(memoKey); // throws if it does not fit in 28 bytes
  return { recipientId, sourceId, reason, amount, memoKey };
}

/** Who would earn what for `reason` on `refId`, before the caps; null when it is not theirs to claim. */
async function entitled(facts: RewardFacts, callerId: number, reason: PremiarReason, refId: number): Promise<RewardPlan | null> {
  switch (reason) {
    case 'letrero': {
      const sign = await facts.sign(refId);
      return sign && sign.authorId === callerId ? plan(callerId, 'letrero', 1, `letrero:${refId}`) : null;
    }
    case 'sirvio-l': {
      const sign = await facts.sign(refId);
      if (!sign || sign.authorId === callerId) return null;
      const vote = await facts.signVote(refId, callerId);
      return vote?.helpful ? plan(sign.authorId, 'sirvio-l', 1, `sirvio-l:${refId}-${callerId}`, callerId) : null;
    }
    case 'ayuda': {
      const answer = await facts.answer(refId);
      if (!answer || answer.authorId === callerId) return null;
      const question = await facts.question(answer.questionId);
      if (!question || question.authorId !== callerId) return null;
      const rating = await facts.rating(refId, callerId);
      return rating?.helpful ? plan(answer.authorId, 'ayuda', 5, `ayuda:${refId}`, callerId) : null;
    }
    case 'cierre': {
      const question = await facts.question(refId);
      const closed = question && question.status !== 'open' && question.answerCount >= 1;
      return question && closed && question.authorId === callerId ? plan(callerId, 'cierre', 1, `cierre:${refId}`) : null;
    }
  }
}

/**
 * What `callerId` earns for `reason` on `refId`: the plan to pay, `{ capped }` when the action is legitimate but over
 * a cap (saved, not paid), or null when the action does not exist or is not theirs to claim.
 */
export async function planReward(
  facts: RewardFacts,
  callerId: number,
  reason: PremiarReason,
  refId: number,
): Promise<RewardPlan | CappedReward | null> {
  const reward = await entitled(facts, callerId, reason, refId);
  if (!reward) return null;
  const cap = await facts.rewardCap(reward, refId);
  return cap ? { capped: cap } : reward;
}

export const isCapped = (plan: RewardPlan | CappedReward): plan is CappedReward => 'capped' in plan;

/**
 * What `callerId` pays to make their question urgent, or null when it is not theirs or no longer open. The
 * question is published as normal and becomes urgent only after this charge is confirmed (wiki #179), so an
 * already urgent question is a repeated call of a paid charge: `chargeUrgent` answers it without charging again.
 */
export async function planCharge(facts: RewardFacts, callerId: number, _reason: GastarReason, refId: number): Promise<RewardPlan | null> {
  const question = await facts.question(refId);
  const chargeable = question && question.authorId === callerId && (question.status === 'open' || question.urgent);
  if (!chargeable || (await facts.otherActiveUrgent(callerId, refId))) return null; // one active urgent per person
  return plan(callerId, 'urgente', -URGENT_COST, `urgente:${refId}`);
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
  const reward = await store.ensureReward({
    profileId: plan.recipientId,
    sourceId: plan.sourceId,
    memoKey: plan.memoKey,
    amount: plan.amount,
    reason: plan.reason,
  });
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

// ---------------------------------------------------------------------------
// Redemption with a partner business (SPEC 29, wiki #219). The neighbor pays an offer's cost from their own
// custodial account to the partner's account, memo `canje:<redemption id>`. All or nothing: a redemption is never
// pending, because the business is waiting at the counter.
// ---------------------------------------------------------------------------

export type RedeemOffer = { id: number; partnerId: number; partnerProfileId: number; cost: number; active: boolean };

/** The rows a redemption reads and writes. Each id is a numeric table id. */
export interface RedeemFacts {
  offer(id: number): Promise<RedeemOffer | null>;
  /** Whether the neighbor has a confirmed redemption of this offer since the Bolivian midnight. */
  redeemedToday(profileId: number, offerId: number): Promise<boolean>;
  createRedemption(redemption: { offerId: number; profileId: number; partnerId: number; cost: number }): Promise<number>;
  settleRedemption(id: number, patch: { status: 'confirmed' | 'error'; txHash?: string }): Promise<void>;
}

export type RedeemPlan = { offerId: number; payerId: number; partnerId: number; partnerProfileId: number; cost: number };
/** Why a redemption was refused before any payment. */
export type RedeemRefusal = 'unavailable' | 'own' | 'limit';
export type RedeemResult =
  | { status: 'confirmed'; txHash: string; redemptionId: number }
  | { status: 'not_charged'; why: RedeemRefusal | 'balance' | 'stellar' };

/** The neighbor's memo; the partner's row uses `canje-r:` only because `rewards.memo_key` is unique. */
export const redeemMemo = (redemptionId: number) => `canje:${redemptionId}`;
export const redeemReceivedKey = (redemptionId: number) => `canje-r:${redemptionId}`;

/** Whether `callerId` may redeem `offerId` now: the plan, or why not. */
export async function planRedeem(facts: RedeemFacts, callerId: number, offerId: number): Promise<RedeemPlan | { refused: RedeemRefusal }> {
  const offer = await facts.offer(offerId);
  if (!offer || !offer.active) return { refused: 'unavailable' };
  if (offer.partnerProfileId === callerId) return { refused: 'own' };
  if (await facts.redeemedToday(callerId, offerId)) return { refused: 'limit' };
  return { offerId, payerId: callerId, partnerId: offer.partnerId, partnerProfileId: offer.partnerProfileId, cost: offer.cost };
}

export const isRefused = (plan: RedeemPlan | { refused: RedeemRefusal }): plan is { refused: RedeemRefusal } => 'refused' in plan;

/**
 * Pays a redemption, all or nothing. The balance and the daily limit are checked again right before paying, so two
 * taps or two devices cannot redeem the same offer twice in a day. Each attempt is its own redemption id, so a memo
 * is never reused. On success the partner gets a confirmed `canje-r:` row with the same transaction.
 */
export async function chargeRedeem(store: WalletStore, facts: RedeemFacts, plan: RedeemPlan, env: WalletEnv): Promise<RedeemResult> {
  const payer = await store.getStellar(plan.payerId);
  const key = await store.getKey(plan.payerId);
  const partner = await store.getStellar(plan.partnerProfileId);
  if (!payer.publicKey || payer.status !== 'ready' || !key || !partner.publicKey || partner.status !== 'ready') {
    return { status: 'not_charged', why: 'stellar' };
  }

  try {
    if (Number(await pointsBalance(payer.publicKey, env.issuerPublic)) < plan.cost) return { status: 'not_charged', why: 'balance' };
  } catch (error) {
    console.error(`redeem offer ${plan.offerId}: balance not read`, error);
    return { status: 'not_charged', why: 'stellar' };
  }
  if (await facts.redeemedToday(plan.payerId, plan.offerId)) return { status: 'not_charged', why: 'limit' };

  const redemptionId = await facts.createRedemption({ offerId: plan.offerId, profileId: plan.payerId, partnerId: plan.partnerId, cost: plan.cost });
  const memo = redeemMemo(redemptionId);
  memoFor(memo); // throws if it does not fit in 28 bytes
  const paid = await store.ensureReward({ profileId: plan.payerId, memoKey: memo, amount: -plan.cost, reason: 'canje', redemptionId });

  const payerPublic = payer.publicKey;
  const partnerPublic = partner.publicKey;
  let hash: string;
  try {
    hash = await withRetry(async () => {
      const onChain = await findOnChain(payerPublic, env, 'out', memo);
      if (onChain) return onChain;
      const result = await payPoints({
        from: Keypair.fromSecret(decryptSecret(key, env.encryptionKey)),
        to: partnerPublic,
        amount: String(plan.cost),
        issuerPublicKey: env.issuerPublic,
        memo,
      });
      return result.hash;
    });
  } catch (error) {
    console.error(`redeem ${memo} not charged:`, error);
    await store.settleReward(paid.id, { status: 'error' });
    await facts.settleRedemption(redemptionId, { status: 'error' });
    return { status: 'not_charged', why: 'stellar' };
  }

  await store.settleReward(paid.id, { status: 'confirmed', txHash: hash });
  await facts.settleRedemption(redemptionId, { status: 'confirmed', txHash: hash });
  // Written only now and only as confirmed: «Reintentar» never pays it (it also refuses every `canje` row)
  const received = await store.ensureReward({
    profileId: plan.partnerProfileId,
    memoKey: redeemReceivedKey(redemptionId),
    amount: plan.cost,
    reason: 'canje',
    redemptionId,
  });
  await store.settleReward(received.id, { status: 'confirmed', txHash: hash });
  return { status: 'confirmed', txHash: hash, redemptionId };
}
