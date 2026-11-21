/**
 * Brings YAPITA back after Stellar wipes testnet (SPEC 20, T37, wiki #211). Three stages, each one skipping what is
 * already done, so running it again after a cut finishes the job:
 *   1. Issuer and distributor. After a wipe they are recreated with the same keys of the env file (same addresses:
 *      nothing changes in Vercel). `--force` creates new ones instead, rewrites the env file (with a backup) and
 *      prints the Vercel commands: it is for the local test.
 *   2. Every neighbor with a key in `wallet_keys` gets their same account back (Friendbot) and the trustline.
 *   3. Every confirmed `rewards` row is paid again, in order and with its memo, and its new hash is saved. A row whose
 *      `tx_hash` already is a YAPITA payment of the current issuer counts as done.
 *
 *   npm run stellar:reset [-- --dry-run] [-- --force] [-- --env-file <path>]
 *
 * Never prints a secret.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Keypair, type Horizon } from '@stellar/stellar-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_CODE,
  accountExists,
  accountLink,
  addTrustline,
  fundWithFriendbot,
  hasTrustline,
  payPoints,
  pointsBalance,
  pointsMovements,
  server,
} from '../../lib/stellar/points.ts';
import { decryptSecret, WELCOME_MEMO } from '../../lib/stellar/wallet.ts';
import { adminClient } from '../../lib/supabase/server.ts';

const INITIAL_SUPPLY = '1000000';

type Args = { dryRun: boolean; force: boolean; envFile: string };

function parseArgs(argv: string[]): Args {
  const at = argv.indexOf('--env-file');
  return { dryRun: argv.includes('--dry-run'), force: argv.includes('--force'), envFile: at >= 0 ? argv[at + 1] ?? '.env' : '.env' };
}

const args = parseArgs(process.argv.slice(2));
const ENV_KEYS = ['YAPITA_ISSUER_SECRET', 'YAPITA_DISTRIBUTOR_SECRET', 'YAPITA_ISSUER_PUBLIC', 'YAPITA_DISTRIBUTOR_PUBLIC', 'VITE_YAPITA_ISSUER_PUBLIC'] as const;
const VERCEL_KEYS = ['YAPITA_ISSUER_PUBLIC', 'VITE_YAPITA_ISSUER_PUBLIC', 'YAPITA_DISTRIBUTOR_SECRET'] as const;

/** The env file is the only source: its values replace whatever the shell had. */
function loadEnvFile(path: string) {
  if (!existsSync(path)) throw new Error(`${path} does not exist`);
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) process.env[key] = value;
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in ${args.envFile}`);
  return value;
}

/** Replaces (or appends) the given lines of the env file, after copying it to a backup next to it. */
function rewriteEnvFile(path: string, values: Record<string, string>): string {
  const backup = `${path}.before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  copyFileSync(path, backup);
  let text = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`;
    process.env[key] = value;
  }
  writeFileSync(path, text);
  return backup;
}

const log = (line: string) => console.log(line);

// ---------------------------------------------------------------------------
// Stage 1 — issuer and distributor
// ---------------------------------------------------------------------------
type Issuer = { issuerPublic: string; distributor: Keypair; changed: boolean };

async function ensureIssuer(): Promise<Issuer> {
  const currentPublic = need('YAPITA_ISSUER_PUBLIC');
  const exists = await accountExists(currentPublic);

  if (exists && !args.force) {
    log(`1/3 Issuer exists: ${currentPublic}. Nothing to create.`);
    return { issuerPublic: currentPublic, distributor: Keypair.fromSecret(need('YAPITA_DISTRIBUTOR_SECRET')), changed: false };
  }

  let issuer: Keypair;
  let distributor: Keypair;
  if (args.force) {
    if (args.dryRun) {
      log('1/3 Would create a new issuer and distributor (--force), rewrite the env file and print the Vercel commands.');
      return { issuerPublic: currentPublic, distributor: Keypair.fromSecret(need('YAPITA_DISTRIBUTOR_SECRET')), changed: true };
    }
    issuer = Keypair.random();
    distributor = Keypair.random();
    // Written before anything is funded, so a cut never loses the new keys
    const backup = rewriteEnvFile(args.envFile, {
      YAPITA_ISSUER_SECRET: issuer.secret(),
      YAPITA_DISTRIBUTOR_SECRET: distributor.secret(),
      YAPITA_ISSUER_PUBLIC: issuer.publicKey(),
      YAPITA_DISTRIBUTOR_PUBLIC: distributor.publicKey(),
      VITE_YAPITA_ISSUER_PUBLIC: issuer.publicKey(),
    });
    log(`1/3 New issuer ${issuer.publicKey()} written to ${args.envFile} (backup: ${backup}).`);
  } else {
    issuer = Keypair.fromSecret(need('YAPITA_ISSUER_SECRET'));
    distributor = Keypair.fromSecret(need('YAPITA_DISTRIBUTOR_SECRET'));
    if (issuer.publicKey() !== currentPublic) throw new Error('YAPITA_ISSUER_SECRET does not match YAPITA_ISSUER_PUBLIC');
    if (args.dryRun) {
      log(`1/3 Issuer ${currentPublic} is gone: would recreate it and the distributor with the same keys.`);
      return { issuerPublic: currentPublic, distributor, changed: false };
    }
    log(`1/3 Issuer ${currentPublic} is gone: recreating it and the distributor with the same keys.`);
  }

  for (const kp of [issuer, distributor]) if (!(await accountExists(kp.publicKey()))) await fundWithFriendbot(kp.publicKey());
  const dist = await server.loadAccount(distributor.publicKey());
  if (!hasTrustline(dist.balances, issuer.publicKey())) await addTrustline(distributor, issuer.publicKey());
  if (Number(await pointsBalance(distributor.publicKey(), issuer.publicKey())) === 0) {
    await payPoints({ from: issuer, to: distributor.publicKey(), amount: INITIAL_SUPPLY, issuerPublicKey: issuer.publicKey(), memo: 'emision:inicial' });
  }
  log(`    Issuer and distributor ready. Distributor holds ${await pointsBalance(distributor.publicKey(), issuer.publicKey())} ${ASSET_CODE}.`);
  return { issuerPublic: issuer.publicKey(), distributor, changed: args.force };
}

// ---------------------------------------------------------------------------
// Stage 2 — every neighbor's same account, with the trustline
// ---------------------------------------------------------------------------
type Neighbor = { profileId: number; name: string; keypair: Keypair };

async function loadNeighbors(db: SupabaseClient): Promise<Neighbor[]> {
  const keys = await db.from('wallet_keys').select('profile_id, secret_enc, secret_iv').order('profile_id');
  if (keys.error) throw new Error(`wallet_keys: ${keys.error.message}`);
  const profiles = await db.from('profiles').select('id, display_name, stellar_pk');
  if (profiles.error) throw new Error(`profiles: ${profiles.error.message}`);
  const byId = new Map((profiles.data as { id: number; display_name: string; stellar_pk: string | null }[]).map((p) => [p.id, p]));
  const encryptionKey = need('WALLET_ENC_KEY');
  return (keys.data as { profile_id: number; secret_enc: string; secret_iv: string }[]).map((row) => {
    const keypair = Keypair.fromSecret(decryptSecret({ secretEnc: row.secret_enc, secretIv: row.secret_iv }, encryptionKey));
    const profile = byId.get(row.profile_id);
    if (profile?.stellar_pk && profile.stellar_pk !== keypair.publicKey()) {
      throw new Error(`Profile ${row.profile_id}: stellar_pk does not match its stored key`);
    }
    return { profileId: row.profile_id, name: profile?.display_name ?? `#${row.profile_id}`, keypair };
  });
}

async function restoreAccounts(db: SupabaseClient, neighbors: Neighbor[], issuer: Issuer) {
  const issuerPublic = issuer.issuerPublic;
  // A dry run of --force has no new issuer yet: every account would need the trustline to it
  const newIssuerPending = args.dryRun && issuer.changed;
  let recreated = 0;
  let trustlines = 0;
  for (const n of neighbors) {
    const exists = await accountExists(n.keypair.publicKey());
    const trusted = !newIssuerPending && exists && hasTrustline((await server.loadAccount(n.keypair.publicKey())).balances, issuerPublic);
    if (!exists) recreated += 1;
    if (!trusted) trustlines += 1;
    if (args.dryRun || (exists && trusted)) continue;
    if (!exists) await fundWithFriendbot(n.keypair.publicKey());
    if (!trusted) await addTrustline(n.keypair, issuerPublic);
    const { error } = await db.from('profiles').update({ stellar_pk: n.keypair.publicKey(), stellar_status: 'ready' }).eq('id', n.profileId);
    if (error) throw new Error(`profiles ${n.profileId}: ${error.message}`);
  }
  const verb = args.dryRun ? 'would recreate' : 'recreated';
  log(`2/3 ${neighbors.length} neighbors: ${verb} ${recreated} accounts and ${trustlines} trustlines.`);
}

// ---------------------------------------------------------------------------
// Stage 3 — replay of every confirmed reward
// ---------------------------------------------------------------------------
type Reward = { id: number; profile_id: number; memo_key: string; amount: number; reason: string; tx_hash: string | null };

/** True when the hash is a payment of YAPITA of the current issuer (after a wipe, old hashes are simply gone). */
async function paidOnCurrentNetwork(hash: string | null, issuerPublic: string): Promise<boolean> {
  if (!hash) return false;
  try {
    const ops = await server.operations().forTransaction(hash).call();
    return ops.records.some((op) => {
      const p = op as Horizon.ServerApi.PaymentOperationRecord;
      return op.type === 'payment' && p.asset_code === ASSET_CODE && p.asset_issuer === issuerPublic;
    });
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) return false;
    throw error;
  }
}

/**
 * The YAPITA payments of an account on the current network, by direction and memo. A cut between Stellar accepting
 * a payment and saving its hash leaves the row looking unpaid: this finds that payment so it is never sent twice.
 * Every memo of a neighbor is unique (the `memo_key`, or `bienvenida` once per account).
 */
async function paymentsByMemo(publicKey: string, issuerPublic: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!(await accountExists(publicKey))) return found;
  for (const m of await pointsMovements(publicKey, issuerPublic, 200)) if (m.memo) found.set(`${m.direction}:${m.memo}`, m.hash);
  return found;
}

async function replayRewards(db: SupabaseClient, neighbors: Neighbor[], issuer: Issuer) {
  const { data, error } = await db
    .from('rewards')
    .select('id, profile_id, memo_key, amount, reason, tx_hash')
    .eq('status', 'confirmed')
    .order('created_at')
    .order('id');
  if (error) throw new Error(`rewards: ${error.message}`);
  const rows = data as Reward[];
  const byProfile = new Map(neighbors.map((n) => [n.profileId, n]));
  const onChain = new Map<number, Map<string, string>>();
  let replayed = 0;
  let done = 0;

  for (const [i, row] of rows.entries()) {
    if (!issuer.changed || !args.dryRun) {
      if (await paidOnCurrentNetwork(row.tx_hash, issuer.issuerPublic)) {
        done += 1;
        continue;
      }
    }
    const neighbor = byProfile.get(row.profile_id);
    if (!neighbor) throw new Error(`reward ${row.id}: profile ${row.profile_id} has no stored key`);
    const memo = row.reason === 'bienvenida' ? WELCOME_MEMO : row.memo_key;
    if (!args.dryRun || !issuer.changed) {
      if (!onChain.has(neighbor.profileId)) onChain.set(neighbor.profileId, await paymentsByMemo(neighbor.keypair.publicKey(), issuer.issuerPublic));
      const hash = onChain.get(neighbor.profileId)?.get(`${row.amount > 0 ? 'in' : 'out'}:${memo}`);
      if (hash) {
        done += 1;
        if (!args.dryRun && hash !== row.tx_hash) {
          const saved = await db.from('rewards').update({ tx_hash: hash, updated_at: new Date().toISOString() }).eq('id', row.id);
          if (saved.error) throw new Error(`rewards ${row.id}: ${saved.error.message}`);
        }
        continue;
      }
    }
    replayed += 1;
    if (args.dryRun) continue;
    const result =
      row.amount > 0
        ? await payPoints({ from: issuer.distributor, to: neighbor.keypair.publicKey(), amount: String(row.amount), issuerPublicKey: issuer.issuerPublic, memo })
        : await payPoints({ from: neighbor.keypair, to: issuer.distributor.publicKey(), amount: String(-row.amount), issuerPublicKey: issuer.issuerPublic, memo });
    const saved = await db.from('rewards').update({ tx_hash: result.hash, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (saved.error) throw new Error(`rewards ${row.id}: ${saved.error.message}`);
    if (replayed % 10 === 0) log(`    … ${i + 1}/${rows.length}`);
  }
  const verb = args.dryRun ? 'would replay' : 'replayed';
  log(`3/3 ${rows.length} confirmed rewards: ${verb} ${replayed}, ${done} already on the current network.`);
  return rows;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
async function report(neighbors: Neighbor[], rows: Reward[], issuer: Issuer) {
  log(`\nIssuer:      ${accountLink(issuer.issuerPublic)}`);
  log(`Distributor: ${accountLink(issuer.distributor.publicKey())}`);
  if (args.dryRun) return;
  log('\nBalances (chain / database):');
  for (const n of neighbors) {
    const expected = rows.filter((r) => r.profile_id === n.profileId).reduce((sum, r) => sum + r.amount, 0);
    const onChain = (await accountExists(n.keypair.publicKey())) ? Number(await pointsBalance(n.keypair.publicKey(), issuer.issuerPublic)) : 0;
    log(`  ${onChain === expected ? '✓' : '✗'} ${n.name.padEnd(16)} ${onChain} / ${expected}`);
  }
  if (issuer.changed) {
    log('\nThe issuer changed (--force). To use it in production, run (values are read from the file, never shown):');
    for (const key of VERCEL_KEYS) {
      log(`  vercel env rm ${key} production --yes`);
      log(`  grep '^${key}=' ${args.envFile} | cut -d= -f2- | vercel env add ${key} production${key.endsWith('_SECRET') ? ' --sensitive' : ''} --yes`);
    }
    log('  vercel --prod');
  }
}

async function main() {
  loadEnvFile(args.envFile);
  log(`stellar:reset on ${args.envFile}${args.dryRun ? ' (dry run: nothing is written)' : ''}${args.force ? ' (--force)' : ''}`);
  const issuer = await ensureIssuer();
  const db = adminClient();
  const neighbors = await loadNeighbors(db);
  await restoreAccounts(db, neighbors, issuer);
  const rows = await replayRewards(db, neighbors, issuer);
  await report(neighbors, rows, issuer);
  for (const key of ENV_KEYS) if (!process.env[key]) log(`! ${key} is missing in ${args.envFile}`);
}

main().catch((error: Error) => {
  console.error('✗', error.message);
  process.exit(1);
});
