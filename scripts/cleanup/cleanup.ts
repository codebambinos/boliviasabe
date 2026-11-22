/**
 * Pre-submission cleanup of production (SPEC 26, T38). Three parts:
 *   1. Team content: everything the accounts in CLEANUP_TEAM_EMAILS posted (the accounts, keys and rewards stay).
 *   2. Seed extras: what the 5 seed neighbors posted that is not in scripts/seed/content.ts (matched like the seed:
 *      sign by author + title, question by author + text, answer by question + author + text, comment by
 *      answer + author + text).
 *   3. Test users: the auth users in CLEANUP_DELETE_EMAILS, only if they have no profile.
 * Anyone else is never touched. Rewards stay as history (they are paid on Stellar).
 *
 * The e-mails live in .env (the repo is public). Stops before writing anything on a bad list.
 *
 *   npm run cleanup [-- --dry-run]
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../../lib/supabase/server.ts';
import { NEIGHBORS, QUESTIONS, SIGNS, type NeighborKey } from '../seed/content.ts';
import { allUsers, deleteContent, emptyPlan, fail, planContent, type ContentIds, type DeletePlan } from '../shared/delete-content.ts';

type Db = SupabaseClient;
const DRY = process.argv.slice(2).includes('--dry-run');

const emails = (name: string) =>
  (process.env[name] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

type Row = { id: number; author_id: number; text?: string; title?: string; question_id?: number; answer_id?: number };

async function rows(db: Db, table: string, columns: string, authors: number[]): Promise<Row[]> {
  if (!authors.length) return [];
  const { data, error } = await db.from(table).select(columns).in('author_id', authors);
  fail(table, error);
  return (data ?? []) as unknown as Row[];
}

const short = (t: string | undefined) => (t ?? '').replace(/\s+/g, ' ').slice(0, 40);

async function main() {
  const team = emails('CLEANUP_TEAM_EMAILS');
  const toDelete = emails('CLEANUP_DELETE_EMAILS');
  const seedEmails = NEIGHBORS.map((n) => n.email);

  // Safety checks: nothing is written if a list is wrong
  if (!team.length) throw new Error('CLEANUP_TEAM_EMAILS is empty in .env');
  const clash = [...team, ...toDelete].filter((e) => seedEmails.includes(e));
  if (clash.length) throw new Error(`A seed neighbor cannot be in a cleanup list: ${clash.join(', ')}`);

  const db = adminClient();
  const users = await allUsers(db);
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));
  // A team e-mail must exist (typo guard); a user to delete that is gone was already deleted (re-runnable)
  const unknown = team.filter((e) => !byEmail.has(e));
  if (unknown.length) throw new Error(`Not found in Supabase Auth (typo?): ${unknown.join(', ')}`);
  const gone = toDelete.filter((e) => !byEmail.has(e));
  if (gone.length) console.log(`Already deleted: ${gone.join(', ')}`);

  const { data: profiles, error } = await db.from('profiles').select('id, auth_id, display_name');
  fail('profiles', error);
  const profileOf = (email: string) => (profiles ?? []).find((p) => p.auth_id === byEmail.get(email));
  const withProfile = toDelete.filter((e) => byEmail.has(e) && profileOf(e));
  if (withProfile.length) throw new Error(`These users have a profile, so they are not deleted: ${withProfile.join(', ')}`);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as number, p.display_name as string]));

  // 1. Team content
  const teamIds = team.map((e) => profileOf(e)?.id as number | undefined).filter((x): x is number => x !== undefined);
  const teamSigns = await rows(db, 'signs', 'id, author_id, title', teamIds);
  const teamQuestions = await rows(db, 'questions', 'id, author_id, text', teamIds);
  const teamAnswers = await rows(db, 'answers', 'id, author_id, text, question_id', teamIds);
  const teamComments = await rows(db, 'answer_comments', 'id, author_id, text, answer_id', teamIds);

  // 2. Seed extras
  const seedProfile = new Map<NeighborKey, number>();
  for (const n of NEIGHBORS) {
    const id = profileOf(n.email)?.id as number | undefined;
    if (id !== undefined) seedProfile.set(n.key, id);
  }
  const seedIds = [...seedProfile.values()];
  const key = (author: NeighborKey) => seedProfile.get(author);
  const signKeys = new Set(SIGNS.map((s) => `${key(s.author)}|${s.title}`));
  const questionKeys = new Set(QUESTIONS.map((q) => `${key(q.author)}|${q.text}`));

  const seedSigns = (await rows(db, 'signs', 'id, author_id, title', seedIds)).filter((s) => !signKeys.has(`${s.author_id}|${s.title}`));
  const allSeedQuestions = await rows(db, 'questions', 'id, author_id, text', seedIds);
  const seedQuestions = allSeedQuestions.filter((q) => !questionKeys.has(`${q.author_id}|${q.text}`));

  // Seed answers and comments are only valid on their own seed question / seed answer
  const questionIdByText = new Map(
    allSeedQuestions.filter((q) => questionKeys.has(`${q.author_id}|${q.text}`)).map((q) => [`${q.author_id}|${q.text}`, q.id]),
  );
  const answerKeys = new Set<string>();
  const commentSpecs: { questionKey: string; answer: string; answerAuthor: number | undefined; author: number | undefined; text: string }[] = [];
  for (const q of QUESTIONS) {
    const qid = questionIdByText.get(`${key(q.author)}|${q.text}`);
    for (const a of q.answers) {
      answerKeys.add(`${qid}|${key(a.author)}|${a.text}`);
      for (const c of a.comments ?? []) {
        commentSpecs.push({ questionKey: String(qid), answer: a.text, answerAuthor: key(a.author), author: key(c.author), text: c.text });
      }
    }
  }
  const allSeedAnswers = await rows(db, 'answers', 'id, author_id, text, question_id', seedIds);
  const seedAnswers = allSeedAnswers.filter((a) => !answerKeys.has(`${a.question_id}|${a.author_id}|${a.text}`));
  const validAnswerId = new Map(
    allSeedAnswers.filter((a) => answerKeys.has(`${a.question_id}|${a.author_id}|${a.text}`)).map((a) => [`${a.question_id}|${a.author_id}|${a.text}`, a.id]),
  );
  const commentKeys = new Set(
    commentSpecs.map((c) => `${validAnswerId.get(`${c.questionKey}|${c.answerAuthor}|${c.answer}`)}|${c.author}|${c.text}`),
  );
  const seedComments = (await rows(db, 'answer_comments', 'id, author_id, text, answer_id', seedIds)).filter(
    (c) => !commentKeys.has(`${c.answer_id}|${c.author_id}|${c.text}`),
  );

  // Plan
  const input: ContentIds = {
    signIds: [...teamSigns, ...seedSigns].map((r) => r.id),
    questionIds: [...teamQuestions, ...seedQuestions].map((r) => r.id),
    answerIds: [...teamAnswers, ...seedAnswers].map((r) => r.id),
    commentIds: [...teamComments, ...seedComments].map((r) => r.id),
  };
  const { plan } = await planContent(db, input);
  const testUsers = toDelete.filter((e) => byEmail.has(e)).map((e) => ({ email: e, id: byEmail.get(e)! }));

  const list = (title: string, items: Row[], field: 'title' | 'text') => {
    console.log(`\n${title} (${items.length})`);
    for (const r of items) console.log(`  #${r.id} ${nameOf.get(r.author_id) ?? r.author_id}: ${short(r[field])}`);
  };
  console.log(DRY ? 'DRY RUN: nothing is written.' : 'Cleaning production.');
  console.log(`Team: ${team.length} accounts · seed neighbors: ${seedIds.length} · users to delete: ${testUsers.length}`);
  list('1. Team letreros', teamSigns, 'title');
  list('1. Team preguntas', teamQuestions, 'text');
  list('1. Team respuestas', teamAnswers, 'text');
  list('1. Team comentarios', teamComments, 'text');
  list('2. Seed extra letreros', seedSigns, 'title');
  list('2. Seed extra preguntas', seedQuestions, 'text');
  list('2. Seed extra respuestas', seedAnswers, 'text');
  list('2. Seed extra comentarios', seedComments, 'text');
  console.log(`\n3. Users without profile (${testUsers.length})`);
  for (const u of testUsers) console.log(`  ${u.email}`);
  printPlan(plan);

  if (emptyPlan(plan) && !testUsers.length) {
    console.log('\nNada que limpiar');
    return;
  }
  if (DRY) return;

  await deleteContent(db, input, { dryRun: false });
  for (const u of testUsers) fail(`delete auth user ${u.email}`, (await db.auth.admin.deleteUser(u.id)).error);
  console.log('\nDone. Run it again: it should print «Nada que limpiar».');
}

function printPlan(plan: DeletePlan) {
  console.log('\nRows that go, per table (includes what hangs from the items above):');
  for (const [table, ids] of Object.entries(plan.rows)) if (ids.length) console.log(`  ${table}: ${ids.length}`);
  console.log(`  photos: ${plan.photos.length}${plan.photos.length ? ` (${plan.photos.join(', ')})` : ''}`);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
