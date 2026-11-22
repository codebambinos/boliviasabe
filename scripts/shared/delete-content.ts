/**
 * Deleting content from the real database (SPEC 26, used by the seed of SPEC 14 and by `npm run cleanup`).
 * Knows the foreign-key order: children first, then the items, then their photos in the `photos` bucket.
 *
 * - `deleteContent` deletes exactly the given items and what hangs from them (answers of a question, comments and
 *   ratings of an answer, sign votes, contact requests, and the saved / hidden / reported marks and notifications
 *   that point at them). With `dryRun` it only returns the plan.
 * - `deleteOwned` deletes everything a set of profiles wrote; with `everything`, the profiles and users too.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'photos';

type Db = SupabaseClient;

export function fail(what: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function allUsers(db: Db): Promise<{ id: string; email?: string }[]> {
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    fail('auth users', error);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

export type ContentIds = { signIds: number[]; questionIds: number[]; answerIds: number[]; commentIds: number[] };

/** What is (or would be) deleted: ids per table, and the photo paths in the bucket. */
export type DeletePlan = { rows: Record<string, number[]>; photos: string[] };

const ids = (rows: { id: number }[] | null) => (rows ?? []).map((r) => r.id);
const uniq = (xs: number[]) => [...new Set(xs)];
const none = (xs: number[]) => (xs.length ? xs : [0]);

/** "https://…/storage/v1/object/public/photos/8/abc.jpg" → "8/abc.jpg" (null for anything outside the bucket). */
export function photoPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  return at < 0 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
}

export function emptyPlan(plan: DeletePlan): boolean {
  return plan.photos.length === 0 && Object.values(plan.rows).every((r) => r.length === 0);
}

/** Expands the items to everything that hangs from them and returns the full plan. */
export async function planContent(db: Db, input: ContentIds): Promise<{ ids: ContentIds; plan: DeletePlan }> {
  const signIds = uniq(input.signIds);
  const questionIds = uniq(input.questionIds);

  // Answers of the deleted questions go with them; comments and contact requests of the deleted answers too
  const { data: qa, error: e1 } = await db.from('answers').select('id').in('question_id', none(questionIds));
  fail('answers of questions', e1);
  const answerIds = uniq([...input.answerIds, ...ids(qa)]);
  const { data: ac, error: e2 } = await db.from('answer_comments').select('id').in('answer_id', none(answerIds));
  fail('comments of answers', e2);
  const commentIds = uniq([...input.commentIds, ...ids(ac)]);

  const { data: rt, error: e3 } = await db.from('ratings').select('id').in('answer_id', none(answerIds));
  fail('ratings', e3);
  // sign_votes has no id (its key is sign + voter): the plan keeps one sign id per vote
  const { data: sv, error: e4 } = await db.from('sign_votes').select('sign_id').in('sign_id', none(signIds));
  fail('sign votes', e4);
  const { data: cr, error: e5 } = await db
    .from('contact_requests')
    .select('id')
    .or(`question_id.in.(${none(questionIds).join(',')}),answer_id.in.(${none(answerIds).join(',')})`);
  fail('contact requests', e5);
  const contactIds = ids(cr);

  // Marks that point at an item by kind (no foreign key)
  const marks: Record<string, number[]> = { saved: [], hidden_items: [], reports: [] };
  for (const table of Object.keys(marks)) {
    for (const [kind, list] of [['sign', signIds], ['question', questionIds], ['answer', answerIds]] as const) {
      if (!list.length) continue;
      const { data, error } = await db.from(table).select('id').eq('kind', kind).in('target_id', list);
      fail(table, error);
      marks[table].push(...ids(data));
    }
  }

  // Notifications whose ref points at a deleted item (same mapping as notice_item, 0010)
  const notifications: number[] = [];
  for (const [kinds, list] of [
    [['answer', 'urgent', 'reminder'], questionIds],
    [['comment'], commentIds],
    [['helpful'], answerIds],
    [['sign_helpful'], signIds],
    [['contact_request', 'contact_accepted'], contactIds],
  ] as const) {
    if (!list.length) continue;
    const { data, error } = await db.from('notifications').select('id').in('kind', [...kinds]).in('ref_id', list);
    fail('notifications', error);
    notifications.push(...ids(data));
  }

  // Photos of the deleted letreros and questions
  const photos: string[] = [];
  const { data: sp, error: e6 } = await db.from('signs').select('photo_url, photo_thumb_url').in('id', none(signIds));
  fail('sign photos', e6);
  const { data: qp, error: e7 } = await db.from('questions').select('photo_url').in('id', none(questionIds));
  fail('question photos', e7);
  for (const r of [...(sp ?? []), ...(qp ?? [])] as { photo_url?: string | null; photo_thumb_url?: string | null }[]) {
    for (const p of [photoPath(r.photo_url), photoPath(r.photo_thumb_url)]) if (p) photos.push(p);
  }

  return {
    ids: { signIds, questionIds, answerIds, commentIds },
    plan: {
      rows: {
        notifications: uniq(notifications),
        saved: uniq(marks.saved),
        hidden_items: uniq(marks.hidden_items),
        reports: uniq(marks.reports),
        answer_comments: commentIds,
        ratings: ids(rt),
        contact_requests: contactIds,
        answers: answerIds,
        sign_votes: (sv ?? []).map((v) => v.sign_id as number),
        signs: signIds,
        questions: questionIds,
      },
      photos: [...new Set(photos)],
    },
  };
}

/** Deletes in foreign-key order. Every step checks its error: a failed one stops the run (it can run again). */
async function runPlan(db: Db, plan: DeletePlan): Promise<void> {
  for (const [table, list] of Object.entries(plan.rows)) {
    if (!list.length) continue;
    const column = table === 'sign_votes' ? 'sign_id' : 'id';
    fail(`delete ${table}`, (await db.from(table).delete().in(column, uniq(list))).error);
  }
  for (let i = 0; i < plan.photos.length; i += 100) {
    fail('delete photos', (await db.storage.from(BUCKET).remove(plan.photos.slice(i, i + 100))).error);
  }
}

export async function deleteContent(db: Db, input: ContentIds, opts: { dryRun: boolean }): Promise<DeletePlan> {
  const { plan } = await planContent(db, input);
  if (!opts.dryRun) await runPlan(db, plan);
  return plan;
}

/** Deletes the content of `profiles`. With `everything`, also their rewards, keys, profiles and auth users. */
export async function deleteOwned(db: Db, profiles: { id: number; authId: string }[], everything: boolean): Promise<void> {
  if (!profiles.length) return;
  const p = profiles.map((x) => x.id);

  const { data: s, error: e1 } = await db.from('signs').select('id').in('author_id', p);
  fail('signs', e1);
  const { data: q, error: e2 } = await db.from('questions').select('id').in('author_id', p);
  fail('questions', e2);
  const { data: a, error: e3 } = await db.from('answers').select('id').in('author_id', p);
  fail('answers', e3);
  const { data: c, error: e4 } = await db.from('answer_comments').select('id').in('author_id', p);
  fail('comments', e4);
  await deleteContent(db, { signIds: ids(s), questionIds: ids(q), answerIds: ids(a), commentIds: ids(c) }, { dryRun: false });

  // What these profiles did on others' content
  const inList = `(${p.join(',')})`;
  const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
    ['ratings', () => db.from('ratings').delete().in('rater_id', p)],
    ['contact requests', () => db.from('contact_requests').delete().or(`requester_id.in.${inList},owner_id.in.${inList}`)],
    ['sign votes', () => db.from('sign_votes').delete().in('voter_id', p)],
    ['saved', () => db.from('saved').delete().in('user_id', p)],
    ['hidden items', () => db.from('hidden_items').delete().in('user_id', p)],
    ['reports', () => db.from('reports').delete().in('reporter_id', p)],
  ];
  if (everything) {
    steps.push(
      ['notifications', () => db.from('notifications').delete().or(`user_id.in.${inList},actor_id.in.${inList}`)],
      ['push subscriptions', () => db.from('push_subscriptions').delete().in('user_id', p)],
      // Others keep their rewards; they only lose the link to who gave them
      ['reward sources', () => db.from('rewards').update({ source_id: null }).in('source_id', p).not('profile_id', 'in', inList)],
      ['rewards', () => db.from('rewards').delete().in('profile_id', p)],
      ['wallet keys', () => db.from('wallet_keys').delete().in('profile_id', p)],
    );
  }
  for (const [what, run] of steps) fail(`delete ${what}`, (await run()).error);

  // Photos: each profile has its own folder in the bucket
  for (const { id } of profiles) {
    const { data: files, error } = await db.storage.from(BUCKET).list(String(id), { limit: 1000 });
    fail('photos list', error);
    if (files?.length) fail('photos delete', (await db.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`))).error);
  }

  if (everything) {
    fail('delete profiles', (await db.from('profiles').delete().in('id', p)).error);
    for (const { authId } of profiles) fail('delete auth user', (await db.auth.admin.deleteUser(authId)).error);
  }
}
