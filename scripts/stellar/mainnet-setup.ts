/**
 * YAPITA on mainnet (SPEC 31, wiki #221): a new issuer and distributor, a fixed supply of 1.000.000 YAPITA, and the
 * issuer locked (master weight 0, memo `emisora:cerrada`) so nobody can ever issue more.
 *
 *   npm run stellar:mainnet-setup                    # mainnet: real XLM, keys saved to .env
 *   npm run stellar:mainnet-setup -- --network testnet   # rehearsal on testnet: Friendbot funds it, nothing is saved
 *
 * Mainnet, step by step (resumable: run it again after any stop):
 *   1. Creates the two keypairs and saves them to .env at once, never printing a secret:
 *      MAINNET_SETUP_ISSUER_SECRET (temporary), MAINNET_YAPITA_ISSUER_PUBLIC, MAINNET_YAPITA_DISTRIBUTOR_SECRET,
 *      MAINNET_YAPITA_DISTRIBUTOR_PUBLIC.
 *   2. Prints the two public addresses and waits until both exist: Diego funds them with real XLM himself
 *      (about 3 XLM for the issuer and 5 for the distributor).
 *   3. Distributor trustline, 1.000.000 YAPITA from the issuer, then the issuer is locked.
 *   4. Deletes MAINNET_SETUP_ISSUER_SECRET from .env: after the lock the key is useless and is kept nowhere.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Keypair } from '@stellar/stellar-sdk';
import { ASSET_CODE, networkClient, networkOf, Operation, type NetworkClient } from '../../lib/stellar/network.ts';

const SUPPLY = '1000000';
const LOCK_MEMO = 'emisora:cerrada';
const ENV_FILE = '.env';
const WAIT_MS = 15_000;
const WAIT_LIMIT_MS = 2 * 3600 * 1000;

const { values } = parseArgs({ options: { network: { type: 'string', default: 'mainnet' } } });
const network = networkOf(values.network);
const rehearsal = network === 'testnet';

/** Sets or removes one line of .env without printing it. */
function setEnv(name: string, value: string | null) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n') : [];
  const kept = lines.filter((line) => !line.startsWith(`${name}=`));
  if (value !== null) {
    while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
    kept.push(`${name}=${value}`, '');
  }
  writeFileSync(ENV_FILE, kept.join('\n'), { mode: 0o600 });
  if (value === null) delete process.env[name];
  else process.env[name] = value;
}

function keypairs(): { issuer: Keypair; distributor: Keypair } {
  if (rehearsal) return { issuer: Keypair.random(), distributor: Keypair.random() };
  const savedIssuer = process.env.MAINNET_SETUP_ISSUER_SECRET;
  const savedDistributor = process.env.MAINNET_YAPITA_DISTRIBUTOR_SECRET;
  if (savedDistributor && !savedIssuer && process.env.MAINNET_YAPITA_ISSUER_PUBLIC) {
    return { issuer: Keypair.fromPublicKey(process.env.MAINNET_YAPITA_ISSUER_PUBLIC), distributor: Keypair.fromSecret(savedDistributor) };
  }
  if (savedIssuer && savedDistributor) return { issuer: Keypair.fromSecret(savedIssuer), distributor: Keypair.fromSecret(savedDistributor) };
  if (savedIssuer || savedDistributor) throw new Error('Only one of the mainnet keys is in .env: fix .env by hand before running again.');
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  setEnv('MAINNET_SETUP_ISSUER_SECRET', issuer.secret());
  setEnv('MAINNET_YAPITA_ISSUER_PUBLIC', issuer.publicKey());
  setEnv('MAINNET_YAPITA_DISTRIBUTOR_SECRET', distributor.secret());
  setEnv('MAINNET_YAPITA_DISTRIBUTOR_PUBLIC', distributor.publicKey());
  console.log('✓ Keys created and saved to .env (not printed).');
  return { issuer, distributor };
}

async function friendbot(publicKey: string) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok && res.status !== 400) throw new Error(`Friendbot answered ${res.status}`);
}

async function waitForFunding(client: NetworkClient, addresses: string[]) {
  const started = Date.now();
  for (;;) {
    const missing: string[] = [];
    for (const address of addresses) if (!(await client.accountExists(address))) missing.push(address);
    if (missing.length === 0) return;
    if (Date.now() - started > WAIT_LIMIT_MS) throw new Error('Still not funded after 2 hours. Run the script again once it is.');
    console.log(`… waiting for XLM in ${missing.length} account(s). Checking again in ${WAIT_MS / 1000} s.`);
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
}

async function issuerLocked(client: NetworkClient, issuerPublic: string): Promise<boolean> {
  const account = await client.server.loadAccount(issuerPublic);
  return account.signers.every((s) => s.weight === 0);
}

async function main() {
  const client = networkClient(network);
  console.log(`YAPITA setup on ${network}${rehearsal ? ' (rehearsal: nothing is saved)' : ''}\n`);
  const { issuer, distributor } = keypairs();
  const issuerPublic = issuer.publicKey();
  const distributorPublic = distributor.publicKey();

  console.log(`Issuer:      ${issuerPublic}`);
  console.log(`Distributor: ${distributorPublic}\n`);

  if (rehearsal) {
    await friendbot(issuerPublic);
    await friendbot(distributorPublic);
  } else {
    console.log('Send real XLM to both addresses (about 3 XLM to the issuer and 5 to the distributor).');
  }
  await waitForFunding(client, [issuerPublic, distributorPublic]);
  console.log('✓ Both accounts exist');

  if ((await client.balance(distributorPublic, issuerPublic)) === null) {
    const { hash } = await client.submit(distributor, [Operation.changeTrust({ asset: client.asset(issuerPublic) })]);
    console.log(`✓ Distributor trusts ${ASSET_CODE} → ${client.txLink(hash)}`);
  }

  const locked = await issuerLocked(client, issuerPublic);
  if (!locked) {
    if (!('secret' in issuer) || !issuer.canSign()) throw new Error('The issuer is not locked and its key is not in .env.');
    const held = (await client.balance(distributorPublic, issuerPublic)) ?? 0;
    if (held === 0) {
      const { hash } = await client.submit(issuer, [
        Operation.payment({ destination: distributorPublic, asset: client.asset(issuerPublic), amount: SUPPLY }),
      ]);
      console.log(`✓ ${SUPPLY} ${ASSET_CODE} issued to the distributor → ${client.txLink(hash)}`);
    }
    const { hash } = await client.submit(issuer, [Operation.setOptions({ masterWeight: 0 })], LOCK_MEMO);
    console.log(`✓ Issuer locked (master weight 0, memo ${LOCK_MEMO}) → ${client.txLink(hash)}`);
  } else {
    console.log('✓ Issuer already locked');
  }

  if (!(await issuerLocked(client, issuerPublic))) throw new Error('The issuer should be locked now');
  const supply = await client.balance(distributorPublic, issuerPublic);
  if (!rehearsal) setEnv('MAINNET_SETUP_ISSUER_SECRET', null);

  console.log(`\n✓ Done. Distributor holds ${supply} ${ASSET_CODE}; nobody can issue more.`);
  console.log(`  Issuer:      ${client.accountLink(issuerPublic)}`);
  console.log(`  Distributor: ${client.accountLink(distributorPublic)}`);
  if (!rehearsal) console.log('  The issuer key was removed from .env. Next: copy the MAINNET_* values to Vercel (SPEC 31, step 8).');
}

main().catch((error: Error) => {
  console.error('✗', error.message);
  process.exit(1);
});
