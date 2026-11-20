/**
 * Creates (or reuses) the YAPITA issuer and distributor on testnet and issues the initial supply.
 * Idempotent: if the accounts in .env already exist, they are not created again.
 * If testnet was reset, delete the YAPITA_* variables from .env and run it again.
 *
 *   npm run stellar:setup
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Keypair } from '@stellar/stellar-sdk';
import {
  ASSET_CODE,
  accountExists,
  accountLink,
  addTrustline,
  fundWithFriendbot,
  hasTrustline,
  payPoints,
  pointsBalance,
  server,
  txLink,
} from '../../lib/stellar/points.ts';

const ENV_FILE = '.env';
const INITIAL_SUPPLY = '1000000'; // YAPITA the issuer hands to the distributor

function saveEnv(name: string, value: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  if (new RegExp(`^${name}=.+`, 'm').test(current)) return;
  appendFileSync(ENV_FILE, `${current && !current.endsWith('\n') ? '\n' : ''}${name}=${value}\n`);
  process.env[name] = value;
}

async function ensureAccount(label: string, envName: string): Promise<Keypair> {
  const secret = process.env[envName];
  if (secret) {
    const kp = Keypair.fromSecret(secret);
    if (await accountExists(kp.publicKey())) {
      console.log(`✓ ${label} already exists: ${kp.publicKey()}`);
      return kp;
    }
    throw new Error(
      `${label} is in .env but does not exist on testnet (was the network reset?). ` +
        `Delete the YAPITA_* variables from .env and run again.`,
    );
  }
  const kp = Keypair.random();
  await fundWithFriendbot(kp.publicKey());
  saveEnv(envName, kp.secret());
  console.log(`✓ ${label} created and funded: ${kp.publicKey()}`);
  return kp;
}

async function main() {
  const issuer = await ensureAccount('Issuer', 'YAPITA_ISSUER_SECRET');
  const distributor = await ensureAccount('Distributor', 'YAPITA_DISTRIBUTOR_SECRET');
  saveEnv('YAPITA_ISSUER_PUBLIC', issuer.publicKey());
  saveEnv('YAPITA_DISTRIBUTOR_PUBLIC', distributor.publicKey());

  const dist = await server.loadAccount(distributor.publicKey());
  if (!hasTrustline(dist.balances, issuer.publicKey())) {
    await addTrustline(distributor, issuer.publicKey());
    console.log(`✓ Distributor now holds ${ASSET_CODE}`);
  }

  const balance = await pointsBalance(distributor.publicKey(), issuer.publicKey());
  if (Number(balance) === 0) {
    const res = await payPoints({
      from: issuer,
      to: distributor.publicKey(),
      amount: INITIAL_SUPPLY,
      issuerPublicKey: issuer.publicKey(),
      memo: 'emision:inicial',
    });
    console.log(`✓ Issued ${INITIAL_SUPPLY} ${ASSET_CODE} → ${txLink(res.hash)}`);
  } else {
    console.log(`✓ Distributor already has ${balance} ${ASSET_CODE}`);
  }

  console.log(`\nIssuer:      ${accountLink(issuer.publicKey())}`);
  console.log(`Distributor: ${accountLink(distributor.publicKey())}`);
  console.log('Keys saved in .env (never committed).');
}

main().catch((err: Error) => {
  console.error('✗', err.message);
  process.exit(1);
});
