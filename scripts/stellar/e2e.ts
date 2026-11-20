/**
 * End-to-end check of the YAPITA flow on testnet, following the product rules:
 *   1. A new user gets an account (Friendbot) and a YAPITA trustline.
 *   2. Welcome reward: +5 (memo "bienvenida").
 *   3. "Me sirvió" on an answer: +5 (memo "ayuda:q1").
 *   4. Urgent question: −5 paid back to the distributor (memo "urgente:q1").
 *   5. Balance and movements are read from the chain: 5 expected.
 *
 *   npm run stellar:e2e
 */
import { Keypair } from '@stellar/stellar-sdk';
import {
  ASSET_CODE,
  accountLink,
  addTrustline,
  fundWithFriendbot,
  payPoints,
  pointsBalance,
  pointsMovements,
  requireEnv,
  txLink,
} from '../../lib/stellar/points.ts';

const EXPECTED_BALANCE = 5;

async function main() {
  const issuerPublic = requireEnv('YAPITA_ISSUER_PUBLIC');
  const distributor = Keypair.fromSecret(requireEnv('YAPITA_DISTRIBUTOR_SECRET'));

  const user = Keypair.random();
  await fundWithFriendbot(user.publicKey());
  await addTrustline(user, issuerPublic);
  console.log(`1. User account created with ${ASSET_CODE} trustline → ${accountLink(user.publicKey())}`);

  const steps: { label: string; from: Keypair; to: string; amount: string; memo: string }[] = [
    { label: '2. Welcome +5', from: distributor, to: user.publicKey(), amount: '5', memo: 'bienvenida' },
    { label: '3. Answer helped +5', from: distributor, to: user.publicKey(), amount: '5', memo: 'ayuda:q1' },
    { label: '4. Urgent question −5', from: user, to: distributor.publicKey(), amount: '5', memo: 'urgente:q1' },
  ];
  for (const s of steps) {
    const res = await payPoints({ ...s, issuerPublicKey: issuerPublic });
    console.log(`${s.label} ${ASSET_CODE} → ${txLink(res.hash)}`);
  }

  const balance = await pointsBalance(user.publicKey(), issuerPublic);
  const movements = await pointsMovements(user.publicKey(), issuerPublic);
  console.log(`5. On-chain balance: ${balance} ${ASSET_CODE}`);
  for (const m of movements) {
    console.log(`   ${m.direction === 'in' ? '+' : '−'}${m.amount}  memo="${m.memo}"  ${txLink(m.hash)}`);
  }

  if (Number(balance) !== EXPECTED_BALANCE) {
    throw new Error(`Expected ${EXPECTED_BALANCE} ${ASSET_CODE}, got ${balance}`);
  }
  console.log(`\n✓ ${ASSET_CODE} flow works end to end on testnet.`);
}

main().catch((err: Error) => {
  console.error('✗', err.message);
  process.exit(1);
});
