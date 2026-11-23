/**
 * POST /api/stellar/mainnet (SPEC 31): the own Pollar wallet. One route, four actions:
 *   { action: 'status' }                                   → whether the caller is invited, and their linked address
 *   { action: 'link', pollarToken }                        → verify with Pollar, link, pay the welcome once
 *   { action: 'start-redeem', offerId }                    → a pending redemption to sign with Pollar
 *   { action: 'confirm-redeem', redemptionId, txHash }     → verified on Horizon, then confirmed
 * Off unless MAINNET_ENABLED=true. Only invited e-mails (MAINNET_BETA_EMAILS) get past `status`.
 */
import { PollarError, verifyPollarToken } from '../pollar/server.ts';
import { adminClient, supabaseOwnWalletStore, supabaseRedeemFacts, userFromRequest } from '../supabase/server.ts';
import { confirmRedeem, isInvited, linkWallet, ownWalletEnv, startRedeem } from './ownWallet.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const mainnetEnabled = () => process.env.MAINNET_ENABLED === 'true';

export async function ownWalletRoute(request: Request): Promise<Response> {
  if (!request.headers.get('authorization')) return json({ error: 'unauthenticated' }, 401);
  if (!mainnetEnabled()) return json({ error: 'disabled' }, 409);

  let db;
  let env;
  try {
    db = adminClient();
    env = ownWalletEnv();
  } catch (error) {
    console.error('mainnet: server is not configured', error);
    return json({ error: 'server' }, 500);
  }

  try {
    const user = await userFromRequest(db, request);
    if (!user) return json({ error: 'unauthenticated' }, 401);
    const { data: profile, error } = await db.from('profiles').select('id').eq('auth_id', user.id).maybeSingle<{ id: number }>();
    if (error) throw new Error(`profile lookup failed: ${error.message}`);
    if (!profile) return json({ error: 'profile_missing' }, 409);

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const store = supabaseOwnWalletStore(db);
    const network = env.network;
    const invited = isInvited(env, user.email);

    switch (body.action) {
      case 'status':
        return json({ invited, network, issuer: env.issuerPublic, address: invited ? await store.address(profile.id) : null });

      case 'link': {
        if (!invited) return json({ status: 'refused', why: 'not_invited' }, 403);
        if (typeof body.pollarToken !== 'string' || !body.pollarToken) return json({ error: 'bad_request' }, 400);
        const secret = process.env.POLLAR_SECRET_KEY;
        if (!secret) throw new Error('Missing POLLAR_SECRET_KEY');
        let identity;
        try {
          identity = await verifyPollarToken(body.pollarToken, secret);
        } catch (e) {
          if (e instanceof PollarError && e.reason !== 'unavailable') return json({ status: 'refused', why: e.reason }, 403);
          throw e;
        }
        const result = await linkWallet(store, env, { profileId: profile.id, email: user.email, address: identity.address });
        return json(result, result.status === 'linked' ? 200 : 409);
      }

      case 'start-redeem': {
        if (!positive(body.offerId)) return json({ error: 'bad_request' }, 400);
        const result = await startRedeem(store, supabaseRedeemFacts(db, network), env, { profileId: profile.id, email: user.email, offerId: body.offerId });
        return json(result, result.status === 'started' ? 200 : 409);
      }

      case 'confirm-redeem': {
        if (!positive(body.redemptionId) || typeof body.txHash !== 'string') return json({ error: 'bad_request' }, 400);
        if (!invited) return json({ status: 'refused', why: 'not_invited' }, 403);
        const result = await confirmRedeem(store, supabaseRedeemFacts(db, network), env, { profileId: profile.id, redemptionId: body.redemptionId, txHash: body.txHash.toLowerCase() });
        return json(result, result.status === 'confirmed' ? 200 : 409);
      }

      default:
        return json({ error: 'bad_request' }, 400);
    }
  } catch (error) {
    console.error('mainnet: unexpected error', error);
    return json({ error: 'server' }, 500);
  }
}
