/**
 * Pilot numbers with real people only (T47, Atlas analysis 3): accounts, letreros, questions, answers, «Me sirvió»,
 * yapitas paid and redemptions, plus the time to the first answer. Read-only.
 *
 * Who is NOT counted, so the numbers can be shown as they are:
 *   - the seed neighbors (`@example.com`) and test accounts (`@test.local`);
 *   - the team: the e-mails in `CLEANUP_TEAM_EMAILS` (comma-separated, in `.env`; never committed).
 * An action counts when its author is a real account, whoever it was for.
 *
 *   npm run stats:pilot [-- --since 2026-11-23]
 */
import { parseArgs } from 'node:util';
import { adminClient } from '../../lib/supabase/server.ts';

const { values } = parseArgs({ options: { since: { type: 'string', default: '2026-11-23' } } });
const since = values.since!;
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since must be YYYY-MM-DD');
/** Midnight in Bolivia (UTC−4) of the start day. */
const sinceIso = new Date(`${since}T04:00:00.000Z`).toISOString();

const team = new Set(
  (process.env.CLEANUP_TEAM_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
const excluded = (email: string | undefined) => !email || /@(example\.com|test\.local)$/i.test(email) || team.has(email.toLowerCase());

type Row = Record<string, unknown>;

async function all(db: ReturnType<typeof adminClient>, table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

async function main() {
  const db = adminClient();
  if (team.size === 0) console.warn('⚠ CLEANUP_TEAM_EMAILS is empty: team accounts are counted as real. Add them to .env.\n');

  const users: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const realAuth = new Set(users.filter((u) => !excluded(u.email)).map((u) => u.id));

  const profiles = await all(db, 'profiles', 'id, auth_id, created_at');
  const real = new Set(profiles.filter((p) => realAuth.has(p.auth_id as string)).map((p) => p.id as number));
  const isReal = (id: unknown) => real.has(id as number);
  const recent = (row: Row) => (row.created_at as string) >= sinceIso;

  const [signs, questions, answers, ratings, votes, rewards, redemptions] = await Promise.all([
    all(db, 'signs', 'id, author_id, created_at'),
    all(db, 'questions', 'id, author_id, created_at'),
    all(db, 'answers', 'id, question_id, author_id, created_at'),
    all(db, 'ratings', 'rater_id, helpful, created_at'),
    all(db, 'sign_votes', 'voter_id, helpful, created_at'),
    all(db, 'rewards', 'profile_id, amount, status, created_at'),
    all(db, 'redemptions', 'profile_id, status, created_at'),
  ]);

  const by = (rows: Row[], key: string, extra: (row: Row) => boolean = () => true) =>
    rows.filter((row) => isReal(row[key]) && recent(row) && extra(row)).length;

  // Time to the first answer, for questions by real people since the start (any answerer, team included: it is
  // how long the asker waited)
  const firstAnswer = new Map<number, string>();
  for (const a of answers) {
    const q = a.question_id as number;
    const at = a.created_at as string;
    if (!firstAnswer.has(q) || at < firstAnswer.get(q)!) firstAnswer.set(q, at);
  }
  const waits = questions
    .filter((q) => isReal(q.author_id) && recent(q) && firstAnswer.has(q.id as number))
    .map((q) => (Date.parse(firstAnswer.get(q.id as number)!) - Date.parse(q.created_at as string)) / 60_000)
    .sort((x, y) => x - y);
  const median = waits.length ? waits[Math.floor((waits.length - 1) / 2)] : null;
  const realQuestions = by(questions, 'author_id');

  const rows: [string, number | string][] = [
    ['Real accounts (all time)', real.size],
    [`Real accounts created since ${since}`, profiles.filter((p) => isReal(p.id) && recent(p)).length],
    ['Letreros', by(signs, 'author_id')],
    ['Questions', realQuestions],
    ['Answers', by(answers, 'author_id')],
    ['«Me sirvió» on answers', by(ratings, 'rater_id', (r) => r.helpful === true)],
    ['«Me sirvió» on letreros', by(votes, 'voter_id', (r) => r.helpful === true)],
    ['Yapitas paid to real accounts (confirmed)', rewards.filter((r) => isReal(r.profile_id) && recent(r) && r.status === 'confirmed' && (r.amount as number) > 0).reduce((sum, r) => sum + (r.amount as number), 0)],
    ['Redemptions (confirmed)', by(redemptions, 'profile_id', (r) => r.status === 'confirmed')],
    ['Questions with an answer', `${waits.length} of ${realQuestions}`],
    ['Median time to the first answer', median === null ? '—' : `${Math.round(median)} min`],
  ];

  console.log(`Pilot since ${since} (Bolivia), real people only. Excluded: @example.com, @test.local and ${team.size} team e-mails.\n`);
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) console.log(`${label.padEnd(width)}  ${value}`);
}

main().catch((error: Error) => {
  console.error('✗', error.message);
  process.exit(1);
});
