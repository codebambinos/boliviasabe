/**
 * Pollar from the server (SPEC 31): verify the access token the browser got from the Pollar SDK, and read the
 * Stellar address of that person's wallet. Uses the secret key, so never import this from src/.
 * API v3 only (v1 retires on 30 Nov 2026): https://docs.pollar.xyz/docs/sdk-reference/server-api
 */

const BASE = 'https://server.api.pollar.xyz/v3';

export type PollarIdentity = { userId: string; address: string; network: string | null; email: string | null };

export class PollarError extends Error {
  readonly reason: 'invalid_token' | 'no_wallet' | 'unavailable';

  constructor(reason: PollarError['reason'], message: string) {
    super(message);
    this.name = 'PollarError';
    this.reason = reason;
  }
}

type Envelope = { success?: boolean; code?: string; content?: unknown };

const isStellarAddress = (value: unknown): value is string => typeof value === 'string' && /^G[A-Z2-7]{55}$/.test(value);

/**
 * The G-address of the token's Stellar wallet. The docs do not fix the exact shape of `wallet`, so this accepts the
 * documented forms: an object with `address`, or a list of wallets with `chain: 'STELLAR'`.
 */
export function stellarAddressOf(wallet: unknown): string | null {
  const candidates = Array.isArray(wallet) ? wallet : [wallet];
  for (const entry of candidates) {
    if (!entry || typeof entry !== 'object') continue;
    const w = entry as { address?: unknown; publicKey?: unknown; chain?: unknown };
    if (w.chain !== undefined && String(w.chain).toUpperCase() !== 'STELLAR') continue;
    if (isStellarAddress(w.address)) return w.address;
    if (isStellarAddress(w.publicKey)) return w.publicKey;
  }
  return null;
}

export async function verifyPollarToken(token: string, secretKey: string, fetchImpl: typeof fetch = fetch): Promise<PollarIdentity> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/tokens/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pollar-api-key': secretKey },
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    throw new PollarError('unavailable', `Pollar did not answer: ${String(error)}`);
  }
  const body = (await res.json().catch(() => null)) as Envelope | null;
  if (res.status === 401 || res.status === 403) throw new PollarError('invalid_token', `Pollar refused the token (${body?.code ?? res.status})`);
  if (!res.ok || !body?.success || !body.content || typeof body.content !== 'object') {
    throw new PollarError('unavailable', `Pollar answered ${res.status} ${body?.code ?? ''}`.trim());
  }
  const content = body.content as { userId?: unknown; wallet?: unknown; network?: unknown; profile?: { email?: unknown } };
  const address = stellarAddressOf(content.wallet);
  if (!address) throw new PollarError('no_wallet', 'The Pollar token has no Stellar wallet yet');
  return {
    userId: String(content.userId ?? ''),
    address,
    network: typeof content.network === 'string' ? content.network : null,
    email: typeof content.profile?.email === 'string' ? content.profile.email : null,
  };
}
