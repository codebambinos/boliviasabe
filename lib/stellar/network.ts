/**
 * Stellar networks for the own-wallet path (SPEC 31): testnet first, then mainnet, chosen by configuration.
 * The pilot's custodial flow keeps using `points.ts` (testnet only) and is not touched by this module.
 * Server-side only: never import this from src/.
 */
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder, type xdr } from '@stellar/stellar-sdk';

export type StellarNetwork = 'testnet' | 'mainnet';

export const NETWORK_CONFIG: Record<StellarNetwork, { horizon: string; passphrase: string; explorer: string }> = {
  testnet: { horizon: 'https://horizon-testnet.stellar.org', passphrase: Networks.TESTNET, explorer: 'https://stellar.expert/explorer/testnet' },
  mainnet: { horizon: 'https://horizon.stellar.org', passphrase: Networks.PUBLIC, explorer: 'https://stellar.expert/explorer/public' },
};

export const ASSET_CODE = 'YAPITA';
const MAX_MEMO_BYTES = 28;

/** `testnet` unless the value is exactly `mainnet`: a typo never lands on real money. */
export function networkOf(value: string | undefined): StellarNetwork {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

export type NetworkClient = {
  network: StellarNetwork;
  server: Horizon.Server;
  asset: (issuerPublic: string) => Asset;
  txLink: (hash: string) => string;
  accountLink: (publicKey: string) => string;
  /** Builds, signs and submits one transaction from `source`. */
  submit: (source: Keypair, operations: xdr.Operation[], memo?: string) => Promise<{ hash: string }>;
  accountExists: (publicKey: string) => Promise<boolean>;
  /** The YAPITA balance of an account, or null when it has no trustline. */
  balance: (publicKey: string, issuerPublic: string) => Promise<number | null>;
};

export function memoText(text: string): Memo {
  if (new TextEncoder().encode(text).length > MAX_MEMO_BYTES) throw new Error(`Memo "${text}" is longer than ${MAX_MEMO_BYTES} bytes`);
  return Memo.text(text);
}

export function networkClient(network: StellarNetwork): NetworkClient {
  const config = NETWORK_CONFIG[network];
  const server = new Horizon.Server(config.horizon);
  const asset = (issuerPublic: string) => new Asset(ASSET_CODE, issuerPublic);

  return {
    network,
    server,
    asset,
    txLink: (hash) => `${config.explorer}/tx/${hash}`,
    accountLink: (publicKey) => `${config.explorer}/account/${publicKey}`,

    async submit(source, operations, memo) {
      const account = await server.loadAccount(source.publicKey());
      const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.passphrase }).setTimeout(60);
      for (const operation of operations) builder.addOperation(operation);
      if (memo) builder.addMemo(memoText(memo));
      const tx = builder.build();
      tx.sign(source);
      const result = await server.submitTransaction(tx);
      return { hash: result.hash };
    },

    async accountExists(publicKey) {
      try {
        await server.loadAccount(publicKey);
        return true;
      } catch (error) {
        if ((error as { response?: { status?: number } })?.response?.status === 404) return false;
        throw error;
      }
    },

    async balance(publicKey, issuerPublic) {
      const account = await server.loadAccount(publicKey);
      const line = account.balances.find((b) => 'asset_code' in b && b.asset_code === ASSET_CODE && b.asset_issuer === issuerPublic);
      return line ? Number(line.balance) : null;
    },
  };
}

export { Operation };
