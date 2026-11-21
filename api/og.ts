/**
 * GET /api/og?kind=question|sign&id=N — the Open Graph page of a shared link (SPEC 19, wiki #210).
 * vercel.json sends here only preview bots (WhatsApp, Facebook, Telegram…) asking for /p/:id or /l/:id; people get
 * the app. It reads with the anon key, so a bot sees what a guest sees: anything deleted, hidden or in review gets
 * the generic preview. It never fails: a bad link or a database error also answers the generic preview.
 */
import { createClient } from '@supabase/supabase-js';
import { ogFor, renderOgHtml, type OgItem } from '../lib/og/meta.ts';

const html = (body: string) =>
  new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=86400',
    },
  });

type Row = { id: number; zone: string; city: string };
type QuestionRow = Row & { text: string; photoUrl: string | null };
type SignRow = Row & { title: string; price: string | null; thumbUrl: string };

async function readItem(kind: 'question' | 'sign', id: number): Promise<OgItem | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('og: Supabase URL or anon key is not set');
    return null;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (kind === 'question') {
    const { data, error } = await db.rpc('get_question', { p_id: id });
    if (error || !data) return null;
    const q = (data as { question: QuestionRow }).question;
    return { kind, id: q.id, text: q.text, zone: q.zone, city: q.city, photoUrl: q.photoUrl };
  }
  const { data, error } = await db.rpc('get_sign', { p_id: id });
  if (error || !data) return null;
  const s = data as SignRow;
  return { kind, id: s.id, title: s.title, price: s.price, zone: s.zone, city: s.city, thumbUrl: s.thumbUrl };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const rawId = url.searchParams.get('id') ?? '';
  const id = /^\d{1,15}$/.test(rawId) ? Number(rawId) : 0;

  if ((kind !== 'question' && kind !== 'sign') || id <= 0) return html(renderOgHtml(ogFor(null, url.origin, '/')));

  const path = `${kind === 'question' ? '/p/' : '/l/'}${id}`;
  try {
    return html(renderOgHtml(ogFor(await readItem(kind, id), url.origin, path)));
  } catch (error) {
    console.error('og: unexpected error', error);
    return html(renderOgHtml(ogFor(null, url.origin, path)));
  }
}
