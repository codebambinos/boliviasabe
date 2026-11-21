/**
 * End-to-end check of the YAPITA flow on testnet, following the product rules:
 *   1. New users get a custodied account (Friendbot, trustline, AES-256-GCM key) through the same
 *      `provisionWallet` the /api/stellar/crear-cuenta function uses. Welcome +5, paid once.
 *   2. Rewards through `planReward` / `payReward`, the logic of /api/stellar/premiar: letrero +1,
 *      «Me sirvió» on a letrero +1, «Me sirvió» on an answer +5, close a question +1. Repeating a call
 *      (also two at once) never pays twice, and a caller who is not entitled gets nothing.
 *   3. Urgent question −5 through `chargeUrgent` (/api/stellar/gastar): charged once, and not charged
 *      when the balance is short.
 *   4. A Stellar failure leaves the reward «pending» and the same call finishes it later.
 *   5. Balances and memos are read from the chain.
 *
 *   npm run stellar:e2e
 */
import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  ASSET_CODE,
  accountLink,
  pointsBalance,
  pointsMovements,
  requireEnv,
  txLink,
} from '../../lib/stellar/points.ts';
import { chargeUrgent, payReward, planCharge, planReward, type RewardFacts } from '../../lib/stellar/rewards.ts';
import {
  decryptSecret,
  provisionWallet,
  welcomeKey,
  type EncryptedSecret,
  type RewardRow,
  type StellarStatus,
  type WalletStore,
} from '../../lib/stellar/wallet.ts';

type Account = { key: EncryptedSecret | null; publicKey: string | null; status: StellarStatus };

/** In-memory `WalletStore` for any number of profiles: same contract as the Supabase one, so the e2e needs no database. */
function memoryStore() {
  const accounts = new Map<number, Account>();
  const rewards = new Map<string, RewardRow & { profileId: number }>();
  const account = (id: number) => {
    if (!accounts.has(id)) accounts.set(id, { key: null, publicKey: null, status: 'preparing' });
    return accounts.get(id)!;
  };
  const store: WalletStore = {
    profileExists: async () => true,
    getKey: async (id) => account(id).key,
    saveKey: async (id, key) => (account(id).key ??= key),
    setStellar: async (id, patch) => {
      if (patch.publicKey) account(id).publicKey = patch.publicKey;
      if (patch.status) account(id).status = patch.status;
    },
    markError: async (id) => {
      if (account(id).status !== 'ready') account(id).status = 'error';
    },
    getStellar: async (id) => ({ publicKey: account(id).publicKey, status: account(id).status }),
    ensureReward: async ({ profileId, memoKey }) => {
      if (!rewards.has(memoKey)) rewards.set(memoKey, { id: rewards.size + 1, status: 'pending', txHash: null, profileId });
      return { ...rewards.get(memoKey)! };
    },
    settleReward: async (id, patch) => {
      for (const row of rewards.values()) if (row.id === id) Object.assign(row, { status: patch.status, txHash: patch.txHash ?? null });
    },
  };
  return { store, account, rewards };
}

/**
 * The rows the rules read, as the app would have saved them.
 * Profiles: 1 helps (publishes, answers), 2 asks (votes, rates, asks).
 */
function memoryFacts(): RewardFacts {
  return {
    sign: async (id) => (id === 10 ? { authorId: 1 } : null),
    signVote: async (signId, voterId) => (signId === 10 && voterId === 2 ? { helpful: true } : null),
    question: async (id) => {
      if (id === 20) return { authorId: 2, status: 'solved', urgent: true, answerCount: 1 };
      if (id === 21) return { authorId: 2, status: 'open', urgent: true, answerCount: 0 };
      if (id === 22) return { authorId: 2, status: 'solved', urgent: false, answerCount: 2 };
      return null;
    },
    answer: async (id) => (id === 30 ? { authorId: 1, questionId: 20 } : id === 31 || id === 32 ? { authorId: 1, questionId: 22 } : null),
    rating: async (answerId, raterId) => ([30, 31, 32].includes(answerId) && raterId === 2 ? { helpful: true } : null),
  };
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const issuerPublic = requireEnv('YAPITA_ISSUER_PUBLIC');

  const encryptionKey = process.env.WALLET_ENC_KEY || randomBytes(32).toString('base64');
  const env = { issuerPublic, distributorSecret: requireEnv('YAPITA_DISTRIBUTOR_SECRET'), encryptionKey };
  const { store, account, rewards } = memoryStore();
  const facts = memoryFacts();
  const [HELPER, ASKER] = [1, 2];

  // 1. Accounts and welcome, paid once per account even when provisioning runs twice
  for (const id of [HELPER, ASKER]) {
    const publicKey = await provisionWallet(store, id, env);
    await provisionWallet(store, id, env);
    const user = Keypair.fromSecret(decryptSecret(account(id).key!, encryptionKey));
    check(user.publicKey() === publicKey, 'The stored key does not match the account');
    check(rewards.get(welcomeKey(id))?.status === 'confirmed', 'The welcome reward was not confirmed');
    console.log(`1. Account ${id} created and welcome +5 paid once → ${accountLink(publicKey)}`);
  }
  const helperKey = account(HELPER).publicKey!;
  const askerKey = account(ASKER).publicKey!;
  const balanceOf = async (publicKey: string) => Number(await pointsBalance(publicKey, issuerPublic));

  // 2. Rewards: right amount, right recipient, once
  const reward = async (caller: number, reason: Parameters<typeof planReward>[2], refId: number) => {
    const plan = await planReward(facts, caller, reason, refId);
    return plan ? { plan, result: await payReward(store, plan, env) } : null;
  };
  const expectPaid = async (label: string, caller: number, reason: Parameters<typeof planReward>[2], refId: number, memoKey: string) => {
    const first = await reward(caller, reason, refId);
    check(first?.plan.memoKey === memoKey && first.result.status === 'confirmed', `${label}: expected a confirmed ${memoKey}`);
    const again = await reward(caller, reason, refId);
    check(again?.result.status === 'confirmed' && again.result.txHash === first.result.txHash, `${label}: repeating the call must return the same hash`);
    console.log(`2. ${label} → ${txLink(first.result.txHash)}`);
  };
  await expectPaid('Letrero published +1', HELPER, 'letrero', 10, 'letrero:10');
  await expectPaid('«Me sirvió» on the letrero +1', ASKER, 'sirvio-l', 10, 'sirvio-l:10-2');
  await expectPaid('«Me sirvió» on the answer +5', ASKER, 'ayuda', 30, 'ayuda:30');
  await expectPaid('Question closed +1', ASKER, 'cierre', 20, 'cierre:20');
  check((await balanceOf(helperKey)) === 5 + 1 + 1 + 5, 'The helper should hold 12 after the three rewards');

  // 2b. Callers who are not entitled get nothing, and no reward row is created
  const rows = rewards.size;
  const denied: [string, number, Parameters<typeof planReward>[2], number][] = [
    ['letrero of someone else', ASKER, 'letrero', 10],
    ['«Me sirvió» on the own letrero', HELPER, 'sirvio-l', 10],
    ['rating that is not yours', HELPER, 'ayuda', 30],
    ['close a question that is not yours', HELPER, 'cierre', 20],
    ['close a question still open', ASKER, 'cierre', 21],
    ['an answer that does not exist', ASKER, 'ayuda', 999],
  ];
  for (const [label, caller, reason, refId] of denied) check((await reward(caller, reason, refId)) === null, `Should not be allowed: ${label}`);
  check(rewards.size === rows, 'A denied call must not create a reward row');
  console.log('2b. Six calls that are not allowed were refused and left no trace');

  // 3. Two calls at once pay once
  const concurrent = await planReward(facts, ASKER, 'ayuda', 31);
  check(concurrent !== null, 'The plan for answer 31 should exist');
  const [one, two] = await Promise.all([payReward(store, concurrent, env), payReward(store, concurrent, env)]);
  check(one.status === 'confirmed' && two.status === 'confirmed', `Two simultaneous calls should both end confirmed: ${one.status}, ${two.status}`);
  check((await balanceOf(helperKey)) === 12 + 5, 'Two simultaneous calls must pay once (12 + 5)');
  console.log('3. Two simultaneous calls paid +5 once');

  // 4. A Stellar failure leaves it pending; the same call finishes it
  const failingPlan = await planReward(facts, ASKER, 'ayuda', 32);
  check(failingPlan !== null, 'The plan for answer 32 should exist');
  const broken = await payReward(store, failingPlan, { ...env, distributorSecret: Keypair.random().secret() });
  check(broken.status === 'pending' && rewards.get('ayuda:32')?.status === 'pending', 'A failed payment should leave the reward pending');
  check((await balanceOf(helperKey)) === 17, 'A failed payment must not move yapitas');
  const retried = await payReward(store, failingPlan, env);
  check(retried.status === 'confirmed' && (await balanceOf(helperKey)) === 22, 'The retry should pay once (17 + 5)');
  console.log('4. A failed payment stayed pending; the same call paid it once');

  // 5. Urgent: charged once; not charged when the balance is short
  const urgent = await planCharge(facts, ASKER, 'urgente', 20);
  check(urgent !== null && urgent.amount === -5 && urgent.memoKey === 'urgente:20', 'The urgent plan should be −5 with memo urgente:20');
  const charged = await chargeUrgent(store, urgent, env);
  const chargedAgain = await chargeUrgent(store, urgent, env);
  check(charged.status === 'confirmed' && chargedAgain.status === 'confirmed' && chargedAgain.txHash === charged.txHash, 'The urgent charge should be repeatable without charging twice');
  check((await balanceOf(askerKey)) === 5 + 1 - 5, 'The asker should hold 1 after paying 5 once');
  const short = await planCharge(facts, ASKER, 'urgente', 21);
  check(short !== null, 'The plan for question 21 should exist');
  const refused = await chargeUrgent(store, short, env);
  check(refused.status === 'not_charged' && refused.why === 'balance', 'With 1 yapita the urgent charge should be refused for balance');
  check(rewards.get('urgente:21')?.status === 'error' && (await balanceOf(askerKey)) === 1, 'A refused charge should leave the row in error and the balance alone');
  check((await planCharge(facts, HELPER, 'urgente', 20)) === null, 'Only the asker can pay for the question');
  console.log(`5. Urgent −5 charged once → ${txLink((charged as { txHash: string }).txHash)}; with 1 yapita left it was refused`);

  // 6. Every memo is on the chain exactly once
  const movements = await pointsMovements(helperKey, issuerPublic, 30);
  for (const memo of ['bienvenida', 'letrero:10', 'sirvio-l:10-2', 'ayuda:30', 'ayuda:31', 'ayuda:32']) {
    check(movements.filter((m) => m.memo === memo).length === 1, `The memo "${memo}" should be on the chain once`);
  }
  console.log(`6. Helper balance ${await balanceOf(helperKey)} ${ASSET_CODE}; every memo is on the chain once`);

  // 7. A Stellar failure while creating the account never loses the person: «error» + reward «pending»,
  // and the next call finishes the job and pays the welcome once.
  const failing = memoryStore();
  const brokenEnv = { ...env, distributorSecret: Keypair.random().secret() }; // an account that does not exist cannot pay
  let failed = false;
  try {
    await provisionWallet(failing.store, 3, brokenEnv);
  } catch {
    failed = true;
  }
  check(failed, 'Provisioning should fail when the distributor cannot pay');
  check(failing.account(3).status === 'error', `Expected status "error" after the failure, got "${failing.account(3).status}"`);
  check(failing.rewards.get(welcomeKey(3))?.status === 'pending', 'The reward should stay pending after the failure');
  await provisionWallet(failing.store, 3, env);
  const welcomed = await balanceOf(failing.account(3).publicKey!);
  check(failing.account(3).status === 'ready' && failing.rewards.get(welcomeKey(3))?.status === 'confirmed' && welcomed === 5, `The retry should finish the account: balance ${welcomed}`);
  console.log('7. A failed welcome left status "error" + reward "pending"; the retry paid it once (balance 5)');

  console.log(`\n✓ ${ASSET_CODE} flow works end to end on testnet.`);
}

main().catch((err: Error) => {
  console.error('✗', err.message);
  process.exit(1);
});
