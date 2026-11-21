/**
 * What /api/stellar/premiar and /gastar share (SPEC 09): who is calling, what they ask for, and the answers.
 * The body names the action only (`reason`, `refId`); amount, memo and recipient come from the database.
 */
import { adminClient, markUrgent, supabaseRewardFacts, supabaseWalletStore, userFromRequest } from '../supabase/server.ts';
import {
  chargeUrgent,
  payReward,
  planCharge,
  planReward,
  PREMIAR_REASONS,
  type GastarReason,
  type PremiarReason,
} from './rewards.ts';
import { walletEnv } from './wallet.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function readBody(request: Request): Promise<{ reason: unknown; refId: number } | null> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) return null;
  const { reason, refId } = body as { reason?: unknown; refId?: unknown };
  return typeof refId === 'number' && Number.isSafeInteger(refId) && refId > 0 ? { reason, refId } : null;
}

/** Runs `act` for a valid caller; everything before it is the same for both routes. */
async function handle(
  request: Request,
  name: string,
  act: (ctx: { db: ReturnType<typeof adminClient>; env: ReturnType<typeof walletEnv>; callerId: number; reason: unknown; refId: number }) => Promise<Response>,
): Promise<Response> {
  if (!request.headers.get('authorization')) return json({ error: 'unauthenticated' }, 401);

  let db;
  let env;
  try {
    db = adminClient();
    env = walletEnv();
  } catch (error) {
    console.error(`${name}: server is not configured`, error);
    return json({ error: 'server' }, 500);
  }

  try {
    const user = await userFromRequest(db, request);
    if (!user) return json({ error: 'unauthenticated' }, 401);

    const { data: profile, error } = await db.from('profiles').select('id').eq('auth_id', user.id).maybeSingle();
    if (error) throw new Error(`profile lookup failed: ${error.message}`);
    if (!profile) return json({ error: 'profile_missing' }, 409);

    const body = await readBody(request);
    if (!body) return json({ error: 'bad_request' }, 400);

    return await act({ db, env, callerId: profile.id, ...body });
  } catch (error) {
    console.error(`${name}: unexpected error`, error);
    return json({ error: 'server' }, 500);
  }
}

export function premiar(request: Request): Promise<Response> {
  return handle(request, 'premiar', async ({ db, env, callerId, reason, refId }) => {
    if (!PREMIAR_REASONS.includes(reason as PremiarReason)) return json({ error: 'bad_request' }, 400);
    const plan = await planReward(supabaseRewardFacts(db), callerId, reason as PremiarReason, refId);
    if (!plan) return json({ error: 'not_allowed' }, 403);
    const result = await payReward(supabaseWalletStore(db), plan, env);
    return result.status === 'confirmed' ? json(result) : json(result, 202);
  });
}

export function gastar(request: Request): Promise<Response> {
  return handle(request, 'gastar', async ({ db, env, callerId, reason, refId }) => {
    if (reason !== ('urgente' satisfies GastarReason)) return json({ error: 'bad_request' }, 400);
    const plan = await planCharge(supabaseRewardFacts(db), callerId, reason, refId);
    if (!plan) return json({ error: 'not_allowed' }, 403);
    const result = await chargeUrgent(supabaseWalletStore(db), plan, env);
    if (result.status !== 'confirmed') return json(result, 202);
    await markUrgent(db, refId); // only now, so an unpaid question never rises to the top
    return json(result);
  });
}
