/**
 * Custodied Stellar accounts of the users (testnet only). Server-side: never import from src/.
 *
 * `provisionWallet` is idempotent and safe to call again after any failure: it creates the key once,
 * funds the account, adds the YAPITA trustline and pays the +5 welcome exactly once. Storage is behind
 * `WalletStore` so the same code runs on Supabase (api/) and in memory (scripts/stellar/e2e.ts).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import {
  accountExists,
  addTrustline,
  fundWithFriendbot,
  hasTrustline,
  payPoints,
  pointsMovements,
  requireEnv,
  server,
} from './points.ts';

export const WELCOME_AMOUNT = 5;

export type EncryptedSecret = { secretEnc: string; secretIv: string };

/** AES-256-GCM. The 16-byte auth tag is appended to the cipher text; the IV is stored apart. */
export function encryptSecret(secret: string, keyBase64: string): EncryptedSecret {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('WALLET_ENC_KEY must be 32 bytes in base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { secretEnc: body.toString('base64'), secretIv: iv.toString('base64') };
}

export function decryptSecret({ secretEnc, secretIv }: EncryptedSecret, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('WALLET_ENC_KEY must be 32 bytes in base64');
  const body = Buffer.from(secretEnc, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secretIv, 'base64'));
  decipher.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8');
}

export type StellarStatus = 'preparing' | 'ready' | 'error';
export type RewardReason = 'bienvenida' | 'letrero' | 'sirvio-l' | 'ayuda' | 'cierre' | 'urgente' | 'canje';
export type RewardRow = { id: number; status: 'pending' | 'confirmed' | 'error'; txHash: string | null };

export interface WalletStore {
  profileExists(profileId: number): Promise<boolean>;
  getKey(profileId: number): Promise<EncryptedSecret | null>;
  /** Stores the key only if there is none yet. Returns the key that ended up stored (the first one wins). */
  saveKey(profileId: number, key: EncryptedSecret): Promise<EncryptedSecret>;
  setStellar(profileId: number, patch: { publicKey?: string; status?: StellarStatus }): Promise<void>;
  /** Marks the account as failed, unless a parallel call already finished it: a failure never undoes «ready». */
  markError(profileId: number): Promise<void>;
  /** The Stellar address and state of an account, as the profile has them. */
  getStellar(profileId: number): Promise<{ publicKey: string | null; status: StellarStatus }>;
  /** Inserts the reward unless its memo key exists (the unique key is what stops a second payment). A negative amount is a charge. */
  /** `sourceId`: who gave the reward (SPEC 13 pair cap); only sirvio-l and ayuda have one. */
  /** `redemptionId`: the redemption a `canje` row belongs to (SPEC 29). */
  ensureReward(reward: {
    profileId: number;
    sourceId?: number | null;
    memoKey: string;
    amount: number;
    reason: RewardReason;
    redemptionId?: number | null;
  }): Promise<RewardRow>;
  settleReward(id: number, patch: { status: 'confirmed' | 'error'; txHash?: string }): Promise<void>;
}

export type WalletEnv = { issuerPublic: string; distributorSecret: string; encryptionKey: string };

export function walletEnv(): WalletEnv {
  return {
    issuerPublic: requireEnv('YAPITA_ISSUER_PUBLIC'),
    distributorSecret: requireEnv('YAPITA_DISTRIBUTOR_SECRET'),
    encryptionKey: requireEnv('WALLET_ENC_KEY'),
  };
}

/** The Stellar memo of the welcome, as in the wiki table. It is unique per account, so it also tells whether it was paid. */
export const WELCOME_MEMO = 'bienvenida';

/** `rewards.memo_key` is unique across the app, so the welcome's key carries the profile id (SPEC 08). */
export const welcomeKey = (profileId: number) => `bienvenida:${profileId}`;

/**
 * Brings the account of `profileId` to «ready» with the welcome paid. Resolves with the public key.
 * On any Stellar failure the status becomes «error» and the error is rethrown: the caller keeps going
 * (a Stellar failure never blocks the person) and the next call finishes the job.
 */
export async function provisionWallet(store: WalletStore, profileId: number, env: WalletEnv): Promise<string> {
  if (!(await store.profileExists(profileId))) throw new Error(`Profile ${profileId} does not exist`);

  // The key is stored before anything touches the network, so a crash never loses a funded account
  const stored = (await store.getKey(profileId)) ?? (await store.saveKey(profileId, encryptSecret(Keypair.random().secret(), env.encryptionKey)));
  const user = Keypair.fromSecret(decryptSecret(stored, env.encryptionKey));
  await store.setStellar(profileId, { publicKey: user.publicKey() });

  try {
    if (!(await accountExists(user.publicKey()))) await fundWithFriendbot(user.publicKey());
    const account = await server.loadAccount(user.publicKey());
    if (!hasTrustline(account.balances, env.issuerPublic)) await addTrustline(user, env.issuerPublic);

    const reward = await store.ensureReward({ profileId, memoKey: welcomeKey(profileId), amount: WELCOME_AMOUNT, reason: 'bienvenida' });
    if (reward.status !== 'confirmed') {
      // Two calls can race here: the chain is checked for this memo before paying again
      const paid = (await pointsMovements(user.publicKey(), env.issuerPublic, 20)).find((m) => m.direction === 'in' && m.memo === WELCOME_MEMO);
      let hash = paid?.hash;
      if (!hash) {
        const result = await payPoints({
          from: Keypair.fromSecret(env.distributorSecret),
          to: user.publicKey(),
          amount: String(WELCOME_AMOUNT),
          issuerPublicKey: env.issuerPublic,
          memo: WELCOME_MEMO,
        });
        hash = result.hash;
      }
      await store.settleReward(reward.id, { status: 'confirmed', txHash: hash });
    }
    await store.setStellar(profileId, { status: 'ready' });
    return user.publicKey();
  } catch (error) {
    await store.markError(profileId).catch(() => undefined);
    throw error;
  }
}
