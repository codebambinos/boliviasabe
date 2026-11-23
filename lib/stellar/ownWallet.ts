/**
 * Own Pollar wallet (SPEC 31, wiki #221): link it, pay the 5-yapita welcome once, and verify a redemption the neighbor
 * signed with Pollar. The network (testnet first, then mainnet) comes from configuration. Storage is behind
 * `OwnWalletStore` so the same rules run on Supabase (api/) and in memory (scripts/stellar/own-wallet-e2e.ts).
 * Server-side only: never import this from src/.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { networkClient, networkOf, Operation, type NetworkClient, type StellarNetwork } from './network.ts';
import { isRefused, planRedeem, redeemMemo, type RedeemFacts } from './rewards.ts';

export const OWN_WELCOME_AMOUNT = 5;
export const OWN_WELCOME_MEMO = 'bienvenida';

export type OwnWalletEnv = {
  network: StellarNetwork;
  issuerPublic: string;
  distributorSecret: string;
  /** Lower-case e-mails allowed to use this path. */
  betaEmails: Set<string>;
};

export function ownWalletEnv(env: NodeJS.ProcessEnv = process.env): OwnWalletEnv {
  const need = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  return {
    network: networkOf(env.VITE_POLLAR_NETWORK),
    issuerPublic: need('POLLAR_YAPITA_ISSUER_PUBLIC'),
    distributorSecret: need('POLLAR_YAPITA_DISTRIBUTOR_SECRET'),
    betaEmails: new Set(
      (env.MAINNET_BETA_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  };
}

export const isInvited = (env: OwnWalletEnv, email: string) => env.betaEmails.has(email.trim().toLowerCase());

export interface OwnWalletStore {
  /** The address linked to the profile, or null. */
  address(profileId: number): Promise<string | null>;
  /** Links the address. Throws `taken` when another profile already has it. */
  setAddress(profileId: number, address: string): Promise<void>;
  welcomePaid(profileId: number): Promise<boolean>;
  recordPayment(payment: { profileId: number; kind: 'bienvenida' | 'canje'; redemptionId?: number; amount: number; txHash: string }): Promise<void>;
  /** A redemption with its payer and partner addresses, for confirming it. */
  redemption(id: number): Promise<{
    id: number;
    profileId: number;
    cost: number;
    status: 'pending' | 'confirmed' | 'error';
    network: 'testnet' | 'mainnet';
    createdAt: string;
    partnerAddress: string | null;
  } | null>;
  /** The linked address of a partner's profile. */
  partnerAddress(partnerProfileId: number): Promise<string | null>;
  hashUsed(txHash: string): Promise<boolean>;
}

export type LinkResult =
  | { status: 'linked'; address: string; welcome: { txHash: string } | 'already' }
  | { status: 'refused'; why: 'not_invited' | 'no_trustline' | 'taken' | 'other_wallet' };

/**
 * Links a verified Pollar address to the profile and pays the welcome once. The address must already trust YAPITA
 * (the app adds the trustline with Pollar before linking). Linking again pays nothing.
 */
export async function linkWallet(
  store: OwnWalletStore,
  env: OwnWalletEnv,
  input: { profileId: number; email: string; address: string },
  client: NetworkClient = networkClient(env.network),
): Promise<LinkResult> {
  if (!isInvited(env, input.email)) return { status: 'refused', why: 'not_invited' };
  const current = await store.address(input.profileId);
  if (current && current !== input.address) return { status: 'refused', why: 'other_wallet' };
  if ((await client.balance(input.address, env.issuerPublic).catch(() => null)) === null) return { status: 'refused', why: 'no_trustline' };
  if (!current) {
    try {
      await store.setAddress(input.profileId, input.address);
    } catch (error) {
      if ((error as Error).message === 'taken') return { status: 'refused', why: 'taken' };
      throw error;
    }
  }
  if (await store.welcomePaid(input.profileId)) return { status: 'linked', address: input.address, welcome: 'already' };

  const distributor = Keypair.fromSecret(env.distributorSecret);
  // Two calls at once: look for the welcome on the chain before paying it
  const paid = await findPayment(client, { from: distributor.publicKey(), to: input.address, issuer: env.issuerPublic, amount: OWN_WELCOME_AMOUNT, memo: OWN_WELCOME_MEMO });
  const txHash =
    paid ??
    (
      await client.submit(
        distributor,
        [Operation.payment({ destination: input.address, asset: client.asset(env.issuerPublic), amount: String(OWN_WELCOME_AMOUNT) })],
        OWN_WELCOME_MEMO,
      )
    ).hash;
  await store.recordPayment({ profileId: input.profileId, kind: 'bienvenida', amount: OWN_WELCOME_AMOUNT, txHash });
  return { status: 'linked', address: input.address, welcome: { txHash } };
}

/** A recent payment of YAPITA between two accounts with that memo, if there is one. */
async function findPayment(
  client: NetworkClient,
  want: { from: string; to: string; issuer: string; amount: number; memo: string },
): Promise<string | null> {
  const page = await client.server.payments().forAccount(want.to).order('desc').limit(30).join('transactions').call();
  for (const record of page.records) {
    const p = record as unknown as { type: string; from?: string; to?: string; asset_code?: string; asset_issuer?: string; amount?: string; transaction_hash: string; transaction_attr?: { memo?: string; memo_type?: string } };
    if (p.type !== 'payment' || p.from !== want.from || p.to !== want.to) continue;
    if (p.asset_code !== 'YAPITA' || p.asset_issuer !== want.issuer || Number(p.amount) !== want.amount) continue;
    if (p.transaction_attr?.memo === want.memo) return p.transaction_hash;
  }
  return null;
}

export type StartRedeemResult =
  | { status: 'started'; redemptionId: number; destination: string; amount: string; memo: string; issuer: string }
  | { status: 'refused'; why: 'not_invited' | 'no_wallet' | 'partner_no_wallet' | 'unavailable' | 'own' | 'limit' | 'balance' };

/** Creates a pending mainnet redemption for the neighbor to sign with Pollar. Same rules as SPEC 29. */
export async function startRedeem(
  store: OwnWalletStore,
  facts: RedeemFacts,
  env: OwnWalletEnv,
  input: { profileId: number; email: string; offerId: number },
  client: NetworkClient = networkClient(env.network),
): Promise<StartRedeemResult> {
  if (!isInvited(env, input.email)) return { status: 'refused', why: 'not_invited' };
  const payer = await store.address(input.profileId);
  if (!payer) return { status: 'refused', why: 'no_wallet' };
  const plan = await planRedeem(facts, input.profileId, input.offerId);
  if (isRefused(plan)) return { status: 'refused', why: plan.refused };
  const destination = await store.partnerAddress(plan.partnerProfileId);
  if (!destination) return { status: 'refused', why: 'partner_no_wallet' };
  const balance = await client.balance(payer, env.issuerPublic).catch(() => null);
  if (balance === null || balance < plan.cost) return { status: 'refused', why: 'balance' };
  const redemptionId = await facts.createRedemption({ offerId: plan.offerId, profileId: plan.payerId, partnerId: plan.partnerId, cost: plan.cost });
  return { status: 'started', redemptionId, destination, amount: String(plan.cost), memo: redeemMemo(redemptionId), issuer: env.issuerPublic };
}

export type ConfirmRedeemResult =
  | { status: 'confirmed'; redemptionId: number; txHash: string }
  | { status: 'refused'; why: 'not_found' | 'not_yours' | 'hash_used' | 'not_on_chain' | 'mismatch' | 'too_old' };

/**
 * Confirms a redemption only after checking the transaction on Horizon: successful, after the redemption was
 * created, a YAPITA payment of the exact cost from the neighbor's address to the partner's, and the memo
 * `canje:<id>` when there is a memo (Pollar may send it without one: the verified hash is then the proof).
 */
export async function confirmRedeem(
  store: OwnWalletStore,
  facts: RedeemFacts,
  env: OwnWalletEnv,
  input: { profileId: number; redemptionId: number; txHash: string },
  client: NetworkClient = networkClient(env.network),
): Promise<ConfirmRedeemResult> {
  const redemption = await store.redemption(input.redemptionId);
  if (!redemption || redemption.network !== env.network) return { status: 'refused', why: 'not_found' };
  if (redemption.profileId !== input.profileId) return { status: 'refused', why: 'not_yours' };
  if (redemption.status === 'confirmed') return { status: 'confirmed', redemptionId: redemption.id, txHash: input.txHash };
  if (!/^[0-9a-f]{64}$/.test(input.txHash) || (await store.hashUsed(input.txHash))) return { status: 'refused', why: 'hash_used' };

  const payer = await store.address(input.profileId);
  let tx: { successful: boolean; created_at: string; memo?: string; memo_type: string };
  let ops: { type: string; from?: string; to?: string; asset_code?: string; asset_issuer?: string; amount?: string }[];
  try {
    tx = (await client.server.transactions().transaction(input.txHash).call()) as unknown as typeof tx;
    ops = (await client.server.operations().forTransaction(input.txHash).call()).records as unknown as typeof ops;
  } catch {
    return { status: 'refused', why: 'not_on_chain' };
  }
  if (!tx.successful) return { status: 'refused', why: 'not_on_chain' };
  if (Date.parse(tx.created_at) < Date.parse(redemption.createdAt) - 60_000) return { status: 'refused', why: 'too_old' };
  const expectedMemo = redeemMemo(redemption.id);
  if (tx.memo_type !== 'none' && tx.memo !== expectedMemo) return { status: 'refused', why: 'mismatch' };
  const match = ops.some(
    (op) =>
      op.type === 'payment' &&
      op.from === payer &&
      op.to === redemption.partnerAddress &&
      op.asset_code === 'YAPITA' &&
      op.asset_issuer === env.issuerPublic &&
      Number(op.amount) === redemption.cost,
  );
  if (!match) return { status: 'refused', why: 'mismatch' };

  await facts.settleRedemption(redemption.id, { status: 'confirmed', txHash: input.txHash });
  await store.recordPayment({ profileId: input.profileId, kind: 'canje', redemptionId: redemption.id, amount: -redemption.cost, txHash: input.txHash });
  return { status: 'confirmed', redemptionId: redemption.id, txHash: input.txHash };
}
