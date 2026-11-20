/**
 * Yapitas on Stellar testnet: helpers shared by the scripts and the Vercel
 * server functions (/api/stellar/*). Server-side only: never import this from src/.
 *
 * Model: the issuer creates the YAPITA asset and the distributor pays rewards.
 * Every payment carries a memo that links it to its action (e.g. "ayuda:q123").
 * Testnet only: never use these keys or this flow with real money.
 */
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const NETWORK = Networks.TESTNET;
export const EXPLORER = 'https://stellar.expert/explorer/testnet';
export const ASSET_CODE = 'YAPITA';
const MAX_MEMO_BYTES = 28;

export const server = new Horizon.Server(HORIZON_URL);

export function pointsAsset(issuerPublicKey: string): Asset {
  return new Asset(ASSET_CODE, issuerPublicKey);
}

export const txLink = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const accountLink = (publicKey: string) => `${EXPLORER}/account/${publicKey}`;

/** Reads a required environment variable and fails with a clear message. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run "npm run stellar:setup" first.`);
  return value;
}

/** Stellar text memos hold at most 28 bytes, which is why table IDs are numeric. */
export function memoFor(action: string): Memo {
  if (new TextEncoder().encode(action).length > MAX_MEMO_BYTES) {
    throw new Error(`Memo "${action}" is longer than ${MAX_MEMO_BYTES} bytes`);
  }
  return Memo.text(action);
}

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await server.loadAccount(publicKey);
    return true;
  } catch (err) {
    if (httpStatus(err) === 404) return false;
    throw err;
  }
}

/** Funds a new account with Friendbot (testnet only). Retries because Friendbot rate-limits. */
export async function fundWithFriendbot(publicKey: string, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
    if (res.ok) return;
    if (await accountExists(publicKey)) return; // already funded
    if (i === attempts) throw new Error(`Friendbot failed (${res.status}): ${await res.text()}`);
    await new Promise((resolve) => setTimeout(resolve, 1500 * i));
  }
}

async function submit(source: Keypair, build: (b: TransactionBuilder) => TransactionBuilder) {
  const account = await server.loadAccount(source.publicKey());
  const tx = build(new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK }))
    .setTimeout(60)
    .build();
  tx.sign(source);
  try {
    return await server.submitTransaction(tx);
  } catch (err) {
    const data = err as { response?: { data?: { extras?: { result_codes?: unknown } } }; message?: string };
    const codes = data.response?.data?.extras?.result_codes;
    throw new Error(`Stellar rejected the transaction: ${JSON.stringify(codes ?? data.message)}`);
  }
}

/** Lets the account hold YAPITA (trustline). Required before it can receive the asset. */
export function addTrustline(account: Keypair, issuerPublicKey: string) {
  return submit(account, (b) =>
    b.addOperation(Operation.changeTrust({ asset: pointsAsset(issuerPublicKey) })),
  );
}

export function hasTrustline(
  balances: Horizon.HorizonApi.BalanceLine[],
  issuerPublicKey: string,
): boolean {
  return balances.some(
    (b) => 'asset_code' in b && b.asset_code === ASSET_CODE && b.asset_issuer === issuerPublicKey,
  );
}

/** Pays YAPITA with a memo. `amount` is a decimal string ("5", "0.5"). */
export function payPoints(opts: {
  from: Keypair;
  to: string;
  amount: string;
  issuerPublicKey: string;
  memo: string;
}) {
  return submit(opts.from, (b) =>
    b
      .addOperation(
        Operation.payment({
          destination: opts.to,
          asset: pointsAsset(opts.issuerPublicKey),
          amount: opts.amount,
        }),
      )
      .addMemo(memoFor(opts.memo)),
  );
}

/** YAPITA balance read from the chain (the source of truth for the balance shown in the app). */
export async function pointsBalance(publicKey: string, issuerPublicKey: string): Promise<string> {
  const account = await server.loadAccount(publicKey);
  const line = account.balances.find(
    (b) => 'asset_code' in b && b.asset_code === ASSET_CODE && b.asset_issuer === issuerPublicKey,
  );
  return line ? line.balance : '0';
}

export type PointsMovement = {
  hash: string;
  direction: 'in' | 'out';
  amount: string;
  counterparty: string;
  memo: string | undefined;
  at: string;
};

/** YAPITA movements of an account, newest first, with their memo. */
export async function pointsMovements(
  publicKey: string,
  issuerPublicKey: string,
  limit = 20,
): Promise<PointsMovement[]> {
  const page = await server.payments().forAccount(publicKey).order('desc').limit(limit).call();
  const out: PointsMovement[] = [];
  for (const op of page.records) {
    if (op.type !== 'payment') continue;
    const p = op as Horizon.ServerApi.PaymentOperationRecord;
    if (p.asset_code !== ASSET_CODE || p.asset_issuer !== issuerPublicKey) continue;
    const tx = await p.transaction();
    out.push({
      hash: p.transaction_hash,
      direction: p.to === publicKey ? 'in' : 'out',
      amount: p.amount,
      counterparty: p.to === publicKey ? p.from : p.to,
      memo: tx.memo,
      at: p.created_at,
    });
  }
  return out;
}
