/**
 * End-to-end check of the YAPITA flow on testnet, following the product rules:
 *   1. A new user gets a custodied account (Friendbot, trustline, AES-256-GCM key) through the same
 *      `provisionWallet` the /api/stellar/crear-cuenta function uses.
 *   2. Welcome reward: +5 (memo "bienvenida"), paid once even if provisioning runs twice.
 *   3. "Me sirvió" on an answer: +5 (memo "ayuda:q1").
 *   4. Urgent question: −5 paid back to the distributor (memo "urgente:q1").
 *   5. Balance and movements are read from the chain: 5 expected.
 *
 *   npm run stellar:e2e
 */
import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  ASSET_CODE,
  accountLink,
  payPoints,
  pointsBalance,
  pointsMovements,
  requireEnv,
  txLink,
} from '../../lib/stellar/points.ts';
import {
  decryptSecret,
  provisionWallet,
  welcomeKey,
  type EncryptedSecret,
  type RewardRow,
  type StellarStatus,
  type WalletStore,
} from '../../lib/stellar/wallet.ts';

const EXPECTED_BALANCE = 5;

/** In-memory `WalletStore`: same contract as the Supabase one, so the e2e needs no database. */
function memoryStore(): WalletStore & { key: EncryptedSecret | null; rewards: Map<string, RewardRow>; publicKey: string | null; status: StellarStatus } {
  const state = { key: null as EncryptedSecret | null, rewards: new Map<string, RewardRow>(), publicKey: null as string | null, status: 'preparing' as StellarStatus };
  return {
    ...state,
    get key() { return state.key; },
    get rewards() { return state.rewards; },
    get publicKey() { return state.publicKey; },
    get status() { return state.status; },
    profileExists: async () => true,
    getKey: async () => state.key,
    saveKey: async (_id, key) => (state.key ??= key),
    setStellar: async (_id, patch) => {
      if (patch.publicKey) state.publicKey = patch.publicKey;
      if (patch.status) state.status = patch.status;
    },
    markError: async () => {
      if (state.status !== 'ready') state.status = 'error';
    },
    ensureReward: async ({ memoKey }) => {
      if (!state.rewards.has(memoKey)) state.rewards.set(memoKey, { id: state.rewards.size + 1, status: 'pending', txHash: null });
      return state.rewards.get(memoKey)!;
    },
    settleReward: async (id, patch) => {
      for (const row of state.rewards.values()) if (row.id === id) Object.assign(row, { status: patch.status, txHash: patch.txHash ?? null });
    },
  };
}

async function main() {
  const issuerPublic = requireEnv('YAPITA_ISSUER_PUBLIC');
  const distributor = Keypair.fromSecret(requireEnv('YAPITA_DISTRIBUTOR_SECRET'));

  const encryptionKey = process.env.WALLET_ENC_KEY || randomBytes(32).toString('base64');
  const env = { issuerPublic, distributorSecret: process.env.YAPITA_DISTRIBUTOR_SECRET!, encryptionKey };
  const store = memoryStore();
  const profileId = 1;
  const publicKey = await provisionWallet(store, profileId, env);
  await provisionWallet(store, profileId, env); // a second call must not pay again
  const user = Keypair.fromSecret(decryptSecret(store.key!, encryptionKey));
  if (user.publicKey() !== publicKey) throw new Error('The stored key does not match the account');
  if (store.rewards.get(welcomeKey(profileId))?.status !== 'confirmed') throw new Error('The welcome reward was not confirmed');
  console.log(`1. Account created and welcome +5 paid once → ${accountLink(user.publicKey())}`);

  const steps: { label: string; from: Keypair; to: string; amount: string; memo: string }[] = [
    { label: '2. Answer helped +5', from: distributor, to: user.publicKey(), amount: '5', memo: 'ayuda:q1' },
    { label: '3. Urgent question −5', from: user, to: distributor.publicKey(), amount: '5', memo: 'urgente:q1' },
  ];
  for (const s of steps) {
    const res = await payPoints({ ...s, issuerPublicKey: issuerPublic });
    console.log(`${s.label} ${ASSET_CODE} → ${txLink(res.hash)}`);
  }

  const balance = await pointsBalance(user.publicKey(), issuerPublic);
  const movements = await pointsMovements(user.publicKey(), issuerPublic);
  console.log(`4. On-chain balance: ${balance} ${ASSET_CODE}`);
  for (const m of movements) {
    console.log(`   ${m.direction === 'in' ? '+' : '−'}${m.amount}  memo="${m.memo}"  ${txLink(m.hash)}`);
  }

  // A Stellar failure never loses the person: the account ends in «error» with the reward «pending», and
  // the next call (the retry) finishes the job and pays the welcome once.
  const failing = memoryStore();
  const brokenEnv = { ...env, distributorSecret: Keypair.random().secret() }; // an account that does not exist cannot pay
  let failed = false;
  try {
    await provisionWallet(failing, 2, brokenEnv);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('Provisioning should fail when the distributor cannot pay');
  if (failing.status !== 'error') throw new Error(`Expected status "error" after the failure, got "${failing.status}"`);
  if (failing.rewards.get(welcomeKey(2))?.status !== 'pending') throw new Error('The reward should stay pending after the failure');
  await provisionWallet(failing, 2, env);
  const retried = await pointsBalance(failing.publicKey!, issuerPublic);
  const finalStatus = (failing as { status: StellarStatus }).status; // read again: the retry changed it
  if (finalStatus !== 'ready' || failing.rewards.get(welcomeKey(2))?.status !== 'confirmed' || Number(retried) !== 5) {
    throw new Error(`The retry should finish the account: status ${finalStatus}, balance ${retried}`);
  }
  console.log('5. A failed payment left status "error" + reward "pending"; the retry paid it once (balance 5)');

  if (Number(balance) !== EXPECTED_BALANCE) {
    throw new Error(`Expected ${EXPECTED_BALANCE} ${ASSET_CODE}, got ${balance}`);
  }
  console.log(`\n✓ ${ASSET_CODE} flow works end to end on testnet.`);
}

main().catch((err: Error) => {
  console.error('✗', err.message);
  process.exit(1);
});
