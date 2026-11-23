/**
 * End-to-end check of the own-wallet rules on testnet (SPEC 31), with in-memory storage. Two throwaway accounts play
 * the Pollar wallets (self-custody: they sign their own payments, as Pollar does for the neighbor):
 *   1. Linking: refused when not invited or without the YAPITA trustline; linked once, with the 5-yapita welcome paid
 *      once (memo `bienvenida`), even when linking again.
 *   2. Redemption: started only for a wallet with balance and a partner with a wallet; confirmed only after the
 *      payment is verified on Horizon (with memo, and also without one); a reused hash, a wrong amount and a second
 *      redemption of the same offer the same day are refused.
 * Uses the testnet YAPITA of `npm run stellar:setup` (YAPITA_ISSUER_PUBLIC, YAPITA_DISTRIBUTOR_SECRET in .env).
 *
 *   npm run stellar:own-wallet-e2e
 */
import { Keypair } from '@stellar/stellar-sdk';
import { networkClient, Operation } from '../../lib/stellar/network.ts';
import { confirmRedeem, linkWallet, startRedeem, type OwnWalletEnv, type OwnWalletStore } from '../../lib/stellar/ownWallet.ts';
import type { RedeemFacts } from '../../lib/stellar/rewards.ts';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run "npm run stellar:setup" first.`);
  return value;
};

async function main() {
  const client = networkClient('testnet');
  const env: OwnWalletEnv = {
    network: 'testnet',
    issuerPublic: requireEnv('YAPITA_ISSUER_PUBLIC'),
    distributorSecret: requireEnv('YAPITA_DISTRIBUTOR_SECRET'),
    betaEmails: new Set(['vecina@test.local', 'negocio@test.local']),
  };
  const [NEIGHBOR, PARTNER, STRANGER] = [1, 2, 3];
  const wallets = { [NEIGHBOR]: Keypair.random(), [PARTNER]: Keypair.random(), [STRANGER]: Keypair.random() };

  // The «Pollar wallets»: funded, and the first two trust YAPITA (Pollar's setTrustline)
  for (const kp of Object.values(wallets)) {
    const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    check(res.ok, `Friendbot failed for ${kp.publicKey()}`);
  }
  for (const id of [NEIGHBOR, PARTNER]) await client.submit(wallets[id], [Operation.changeTrust({ asset: client.asset(env.issuerPublic) })]);

  // In-memory storage
  const addresses = new Map<number, string>();
  const payments: { profileId: number; kind: string; redemptionId?: number; txHash: string }[] = [];
  const redemptions: { id: number; offerId: number; profileId: number; partnerProfileId: number; cost: number; status: 'pending' | 'confirmed' | 'error'; createdAt: string }[] = [];
  const offers = [
    { id: 1, partnerId: 9, partnerProfileId: PARTNER, cost: 2, active: true },
    { id: 2, partnerId: 9, partnerProfileId: PARTNER, cost: 1, active: true },
    { id: 3, partnerId: 8, partnerProfileId: STRANGER, cost: 1, active: true },
  ];
  const store: OwnWalletStore = {
    address: async (id) => addresses.get(id) ?? null,
    partnerAddress: async (id) => addresses.get(id) ?? null,
    setAddress: async (id, address) => {
      if ([...addresses.entries()].some(([other, a]) => a === address && other !== id)) throw new Error('taken');
      addresses.set(id, address);
    },
    welcomePaid: async (id) => payments.some((p) => p.profileId === id && p.kind === 'bienvenida'),
    recordPayment: async (p) => void payments.push(p),
    redemption: async (id) => {
      const r = redemptions.find((x) => x.id === id);
      return r ? { id: r.id, profileId: r.profileId, cost: r.cost, status: r.status, network: 'testnet', createdAt: r.createdAt, partnerAddress: addresses.get(r.partnerProfileId) ?? null } : null;
    },
    hashUsed: async (hash) => payments.some((p) => p.txHash === hash),
  };
  const facts: RedeemFacts = {
    offer: async (id) => offers.find((o) => o.id === id) ?? null,
    redeemedToday: async (profileId, offerId) => redemptions.some((r) => r.profileId === profileId && r.offerId === offerId && r.status === 'confirmed'),
    createRedemption: async ({ offerId, profileId, cost }) => {
      const id = 700_000 + Math.floor(Math.random() * 100_000) * 10 + redemptions.length;
      redemptions.push({ id, offerId, profileId, partnerProfileId: offers.find((o) => o.id === offerId)!.partnerProfileId, cost, status: 'pending', createdAt: new Date().toISOString() });
      return id;
    },
    settleRedemption: async (id, patch) => {
      const r = redemptions.find((x) => x.id === id);
      if (r) r.status = patch.status;
    },
  };
  const balanceOf = async (id: number) => (await client.balance(wallets[id].publicKey(), env.issuerPublic)) ?? 0;
  const pay = (from: number, to: string, amount: string, memo?: string) =>
    client.submit(wallets[from], [Operation.payment({ destination: to, asset: client.asset(env.issuerPublic), amount })], memo);

  // 1. Linking
  const notInvited = await linkWallet(store, env, { profileId: STRANGER, email: 'otro@test.local', address: wallets[STRANGER].publicKey() }, client);
  check(notInvited.status === 'refused' && notInvited.why === 'not_invited', 'A person not on the list must be refused');
  const noTrust = await linkWallet(store, { ...env, betaEmails: new Set([...env.betaEmails, 'otro@test.local']) }, { profileId: STRANGER, email: 'otro@test.local', address: wallets[STRANGER].publicKey() }, client);
  check(noTrust.status === 'refused' && noTrust.why === 'no_trustline', 'A wallet without the YAPITA trustline must be refused');
  for (const [id, email] of [[NEIGHBOR, 'vecina@test.local'], [PARTNER, 'negocio@test.local']] as const) {
    const linked = await linkWallet(store, env, { profileId: id, email, address: wallets[id].publicKey() }, client);
    check(linked.status === 'linked' && linked.welcome !== 'already', `Profile ${id} should be linked with a welcome`);
    const again = await linkWallet(store, env, { profileId: id, email, address: wallets[id].publicKey() }, client);
    check(again.status === 'linked' && again.welcome === 'already', 'Linking again must not pay twice');
    check((await balanceOf(id)) === 5, `Profile ${id} should hold 5 after the welcome`);
    console.log(`1. Profile ${id} linked, welcome +5 once → ${client.txLink((linked.welcome as { txHash: string }).txHash)}`);
  }
  const other = await linkWallet(store, env, { profileId: NEIGHBOR, email: 'vecina@test.local', address: wallets[PARTNER].publicKey() }, client);
  check(other.status === 'refused' && other.why === 'other_wallet', 'A second, different wallet for the same profile must be refused');

  // 2. Redemption with memo
  const started = await startRedeem(store, facts, env, { profileId: NEIGHBOR, email: 'vecina@test.local', offerId: 1 }, client);
  check(started.status === 'started' && started.destination === wallets[PARTNER].publicKey() && started.amount === '2', 'The redemption should start toward the partner for 2');
  const wrong = await pay(NEIGHBOR, started.destination, '1', started.memo);
  const wrongAmount = await confirmRedeem(store, facts, env, { profileId: NEIGHBOR, redemptionId: started.redemptionId, txHash: wrong.hash }, client);
  check(wrongAmount.status === 'refused' && wrongAmount.why === 'mismatch', 'A payment of the wrong amount must be refused');
  const paid = await pay(NEIGHBOR, started.destination, started.amount, started.memo);
  const confirmed = await confirmRedeem(store, facts, env, { profileId: NEIGHBOR, redemptionId: started.redemptionId, txHash: paid.hash }, client);
  check(confirmed.status === 'confirmed', `The verified payment should confirm the redemption: ${JSON.stringify(confirmed)}`);
  check((await balanceOf(NEIGHBOR)) === 5 - 1 - 2 && (await balanceOf(PARTNER)) === 5 + 1 + 2, 'Balances after the redemption');
  console.log(`2. Redemption with memo ${started.memo} confirmed after Horizon check → ${client.txLink(paid.hash)}`);

  const twice = await startRedeem(store, facts, env, { profileId: NEIGHBOR, email: 'vecina@test.local', offerId: 1 }, client);
  check(twice.status === 'refused' && twice.why === 'limit', 'The same offer twice in a day must be refused');
  const noPartnerWallet = await startRedeem(store, facts, env, { profileId: NEIGHBOR, email: 'vecina@test.local', offerId: 3 }, client);
  check(noPartnerWallet.status === 'refused' && noPartnerWallet.why === 'partner_no_wallet', 'A partner without a wallet must be refused');

  // 3. Redemption without memo (if Pollar sends none), and a reused hash
  const second = await startRedeem(store, facts, env, { profileId: NEIGHBOR, email: 'vecina@test.local', offerId: 2 }, client);
  check(second.status === 'started', 'The second offer should start');
  const reused = await confirmRedeem(store, facts, env, { profileId: NEIGHBOR, redemptionId: second.redemptionId, txHash: paid.hash }, client);
  check(reused.status === 'refused' && reused.why === 'hash_used', 'A hash already used must be refused');
  const noMemo = await pay(NEIGHBOR, second.destination, second.amount);
  const confirmedNoMemo = await confirmRedeem(store, facts, env, { profileId: NEIGHBOR, redemptionId: second.redemptionId, txHash: noMemo.hash }, client);
  check(confirmedNoMemo.status === 'confirmed', 'A payment without memo, verified on Horizon, should confirm');
  console.log(`3. Redemption without memo confirmed by its verified hash → ${client.txLink(noMemo.hash)}; a reused hash was refused`);

  console.log('\n✓ Own-wallet rules work end to end on testnet.');
}

main().catch((error: Error) => {
  console.error('✗', error.message);
  process.exit(1);
});
