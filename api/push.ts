/**
 * POST /api/push — sends one notification as a Web Push (SPEC 15, T27).
 * Called by pg_net from the database (0008) with `x-push-secret` and the body { id }. Never by the browser.
 */
import { timingSafeEqual } from 'node:crypto';
import { adminClient } from '../lib/supabase/server.ts';
import { sendPush, webPushSender } from '../lib/push/send.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('push: PUSH_WEBHOOK_SECRET is not set');
    return json({ error: 'server' }, 500);
  }
  if (!sameSecret(request.headers.get('x-push-secret'), secret)) return json({ error: 'unauthorized' }, 401);

  const body: unknown = await request.json().catch(() => null);
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return json({ error: 'bad_request' }, 400);

  try {
    return json(await sendPush(adminClient(), id, webPushSender()));
  } catch (error) {
    console.error('push: unexpected error', error);
    return json({ error: 'server' }, 500);
  }
}
