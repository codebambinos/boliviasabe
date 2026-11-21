/**
 * POST /api/stellar/crear-cuenta — prepares the Stellar account of the signed-in person (T16).
 *
 * Needs «Tu barrio» saved first (a row in `profiles`). It creates the custodied key, funds the account,
 * adds the YAPITA trustline and pays the +5 welcome. Safe to call again: each step is skipped once done,
 * so the client uses it as the retry too. A Stellar failure answers 202 «preparing», never an error screen.
 */
import { adminClient, supabaseWalletStore, userFromRequest } from '../../lib/supabase/server.ts';
import { provisionWallet, walletEnv } from '../../lib/stellar/wallet.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get('authorization')) return json({ error: 'unauthenticated' }, 401);

  let db;
  let env;
  try {
    db = adminClient();
    env = walletEnv(); // a missing variable is a server problem, not a Stellar failure
  } catch (error) {
    console.error('crear-cuenta: server is not configured', error);
    return json({ error: 'server' }, 500);
  }

  const user = await userFromRequest(db, request);
  if (!user) return json({ error: 'unauthenticated' }, 401);

  const { data: profile, error } = await db.from('profiles').select('id, stellar_status').eq('auth_id', user.id).maybeSingle();
  if (error) {
    console.error('crear-cuenta: profile lookup failed', error.message);
    return json({ error: 'server' }, 500);
  }
  if (!profile) return json({ error: 'profile_missing' }, 409);
  if (profile.stellar_status === 'ready') return json({ status: 'ready' });

  try {
    await provisionWallet(supabaseWalletStore(db), profile.id, env);
    return json({ status: 'ready' });
  } catch (stellarError) {
    // The status is already «error» in the profile; the next call retries from where it stopped
    console.error('crear-cuenta: Stellar failed', stellarError);
    return json({ status: 'preparing' }, 202);
  }
}
