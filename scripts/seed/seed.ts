/**
 * Seed of the real database (SPEC 14, T09, wiki #33 and #193):
 *   1. Deletes the test accounts `t39-*@test.local` and everything they own.
 *   2. Creates the 5 neighbors of the mock as users who sign in with e-mail and SEED_PASSWORD, with
 *      «Tu barrio» done and a ready Stellar account (provisionWallet: Friendbot, trustline, welcome +5).
 *   3. Loads 9 food letreros with Yaeko's photos, their «Me sirvió», and the 14 questions of the mock with
 *      answers, ratings, outcomes and a few comments. Jorge's pharmacy question is charged −5 and made urgent.
 *   4. Pays every reward through planReward + payReward, the same path (and caps) as /api/stellar/premiar.
 *
 * Idempotent: neighbors are matched by e-mail and content by author + text, and each run completes what is
 * missing. `--fresh` deletes the neighbors' content first (not the neighbors). `--dry-run` writes nothing.
 *
 *   npm run seed [-- --fresh | --dry-run]
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, markUrgent, supabaseRewardFacts, supabaseWalletStore } from '../../lib/supabase/server.ts';
import { chargeUrgent, isCapped, payReward, planCharge, planReward, type PremiarReason } from '../../lib/stellar/rewards.ts';
import { provisionWallet, walletEnv } from '../../lib/stellar/wallet.ts';
import { pointsBalance } from '../../lib/stellar/points.ts';
import { NEIGHBORS, QUESTIONS, SIGNS, TEST_EMAIL, type NeighborKey } from './content.ts';
import { allUsers, BUCKET, deleteOwned, fail } from '../shared/delete-content.ts';

const HOUR = 3600 * 1000;
const PHOTOS = new URL('./photos/', import.meta.url);

const args = new Set(process.argv.slice(2));
const FRESH = args.has('--fresh');
const DRY = args.has('--dry-run');

type Db = SupabaseClient;

const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

/** "Lucía Mamani" → "Lucía M." (same rule as the app). */
function displayName(fullName: string): string {
  const [first, second] = fullName.trim().split(/\s+/);
  return second ? `${first} ${second[0].toUpperCase()}.` : first;
}

async function profilesOf(db: Db, authIds: string[]): Promise<{ id: number; authId: string }[]> {
  if (!authIds.length) return [];
  const { data, error } = await db.from('profiles').select('id, auth_id').in('auth_id', authIds);
  fail('profiles', error);
  return (data ?? []).map((r) => ({ id: r.id as number, authId: r.auth_id as string }));
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

async function ensureNeighbor(db: Db, users: { id: string; email?: string }[], n: (typeof NEIGHBORS)[number], password: string) {
  let authId = users.find((u) => u.email?.toLowerCase() === n.email)?.id;
  if (authId) {
    fail('update user', (await db.auth.admin.updateUserById(authId, { password, email_confirm: true })).error);
  } else {
    const { data, error } = await db.auth.admin.createUser({ email: n.email, password, email_confirm: true });
    fail(`create ${n.email}`, error);
    authId = data.user.id;
  }
  const { data: existing, error } = await db.from('profiles').select('id').eq('auth_id', authId).maybeSingle();
  fail('profile', error);
  if (existing) {
    // The account belongs to the seed: its name and «Tu barrio» are always the seed's (someone may have signed up
    // with this e-mail by hand)
    const fields = { display_name: displayName(n.fullName), full_name: n.fullName, city: n.city, zone: n.zone };
    fail('update profile', (await db.from('profiles').update(fields).eq('id', existing.id)).error);
    return existing.id as number;
  }
  const { data, error: insertError } = await db
    .from('profiles')
    .insert({ auth_id: authId, display_name: displayName(n.fullName), full_name: n.fullName, city: n.city, zone: n.zone })
    .select('id')
    .single();
  fail('insert profile', insertError);
  return data.id as number;
}

async function uploadPhoto(db: Db, profileId: number, photo: string): Promise<{ photoUrl: string; thumbUrl: string }> {
  const base = `${profileId}/${randomUUID()}`;
  const urls: string[] = [];
  for (const [file, path] of [[`${photo}.jpg`, `${base}.jpg`], [`${photo}-480.jpg`, `${base}-480.jpg`]]) {
    const body = await readFile(new URL(file, PHOTOS));
    fail('upload', (await db.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' })).error);
    urls.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return { photoUrl: urls[0], thumbUrl: urls[1] };
}

/** Returns the id of the row matching `match`, inserting `row` when there is none. */
async function findOrInsert(db: Db, table: string, match: Record<string, unknown>, row: Record<string, unknown>): Promise<{ id: number; created: boolean }> {
  const { data, error } = await db.from(table).select('id').match(match).limit(1);
  fail(table, error);
  if (data?.length) return { id: data[0].id as number, created: false };
  const { data: inserted, error: insertError } = await db.from(table).insert({ ...match, ...row }).select('id').single();
  fail(`insert ${table}`, insertError);
  return { id: inserted.id as number, created: true };
}

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 6) throw new Error('Missing SEED_PASSWORD in .env (6 characters or more)');
  const db = adminClient();
  const env = walletEnv();
  const store = supabaseWalletStore(db);
  const facts = supabaseRewardFacts(db);

  // 1. Test accounts
  const users = await allUsers(db);
  const testUsers = users.filter((u) => u.email && TEST_EMAIL.test(u.email));
  const testProfiles = await profilesOf(db, testUsers.map((u) => u.id));
  console.log(`1. Test accounts to delete: ${testUsers.map((u) => u.email).join(', ') || 'none'}`);
  if (DRY) {
    console.log(`   Would create ${NEIGHBORS.length} neighbors, ${SIGNS.length} letreros and ${QUESTIONS.length} questions${FRESH ? ' (fresh)' : ''}.`);
    return;
  }
  await deleteOwned(db, testProfiles, true);
  // An auth user without a profile (never finished «Tu barrio»)
  for (const u of testUsers.filter((t) => !testProfiles.some((p) => p.authId === t.id))) {
    fail('delete auth user', (await db.auth.admin.deleteUser(u.id)).error);
  }

  // 2. Neighbors
  const profile = {} as Record<NeighborKey, number>;
  for (const n of NEIGHBORS) {
    profile[n.key] = await ensureNeighbor(db, users, n, password);
    try {
      await provisionWallet(store, profile[n.key], env);
      console.log(`2. ${n.fullName} (#${profile[n.key]}) ready`);
    } catch (error) {
      console.warn(`2. ${n.fullName} (#${profile[n.key]}): Stellar failed, run the seed again (${String(error)})`);
    }
  }
  if (FRESH) {
    console.log('   --fresh: deleting the neighbors\' content');
    await deleteOwned(db, (await profilesOf(db, users.filter((u) => NEIGHBORS.some((n) => n.email === u.email?.toLowerCase())).map((u) => u.id))), false);
  }

  const rewards: { reason: PremiarReason; caller: number; refId: number }[] = [];

  // 3. Letreros and their «Me sirvió»
  for (const s of SIGNS) {
    const author = profile[s.author];
    const { data: found, error } = await db.from('signs').select('id').eq('author_id', author).eq('title', s.title).limit(1);
    fail('signs', error);
    let signId = found?.[0]?.id as number | undefined;
    if (!signId) {
      const photos = await uploadPhoto(db, author, s.photo);
      const { data, error: insertError } = await db
        .from('signs')
        .insert({
          author_id: author,
          title: s.title,
          photo_url: photos.photoUrl,
          photo_thumb_url: photos.thumbUrl,
          price: s.price,
          city: 'Cochabamba',
          zone: s.zone,
          tags: s.tags,
          created_at: ago(s.hoursAgo),
        })
        .select('id')
        .single();
      fail('insert sign', insertError);
      signId = data.id as number;
    }
    rewards.push({ reason: 'letrero', caller: author, refId: signId });
    for (const voter of s.helpfulFrom) {
      const { error: voteError } = await db
        .from('sign_votes')
        .upsert({ sign_id: signId, voter_id: profile[voter], helpful: true }, { onConflict: 'sign_id,voter_id', ignoreDuplicates: true });
      fail('sign vote', voteError);
      rewards.push({ reason: 'sirvio-l', caller: profile[voter], refId: signId });
    }
  }
  console.log(`3. ${SIGNS.length} letreros with their «Me sirvió»`);

  // 4. Questions, answers, ratings, outcomes and comments
  let urgentId: number | null = null;
  for (const q of QUESTIONS) {
    const author = profile[q.author];
    const created = ago(q.hoursAgo);
    const { id: questionId } = await findOrInsert(
      db,
      'questions',
      { author_id: author, text: q.text },
      { city: q.city, zone: q.zone, tags: q.tags, created_at: created },
    );
    if (q.urgent) urgentId = questionId;

    // Answers go in while the question is still open (a trigger refuses them later)
    const answerIds: number[] = [];
    for (const [i, a] of q.answers.entries()) {
      const { data: found, error } = await db.from('answers').select('id').eq('question_id', questionId).eq('author_id', profile[a.author]).limit(1);
      fail('answers', error);
      let answerId = found?.[0]?.id as number | undefined;
      if (!answerId) {
        const { data: status } = await db.from('questions').select('status').eq('id', questionId).single();
        if (status?.status !== 'open') continue; // already closed by an earlier run
        const { data, error: insertError } = await db
          .from('answers')
          .insert({ question_id: questionId, author_id: profile[a.author], text: a.text, created_at: new Date(Date.parse(created) + (i + 1) * 0.5 * HOUR).toISOString() })
          .select('id')
          .single();
        fail('insert answer', insertError);
        answerId = data.id as number;
      }
      answerIds.push(answerId);
      for (const [j, c] of (a.comments ?? []).entries()) {
        await findOrInsert(
          db,
          'answer_comments',
          { answer_id: answerId, author_id: profile[c.author], text: c.text },
          { created_at: new Date(Date.parse(created) + (i + 1) * 0.5 * HOUR + (j + 1) * 10 * 60 * 1000).toISOString() },
        );
      }
      if (a.rating) {
        const { error: rateError } = await db
          .from('ratings')
          .upsert({ answer_id: answerId, rater_id: author, helpful: a.rating === 'helpful' }, { onConflict: 'answer_id,rater_id', ignoreDuplicates: true });
        fail('rating', rateError);
        if (a.rating === 'helpful') rewards.push({ reason: 'ayuda', caller: author, refId: answerId });
      }
    }

    if (q.outcome !== 'open') {
      fail('outcome', (await db.from('questions').update({ status: q.outcome }).eq('id', questionId)).error);
      if (answerIds.length) rewards.push({ reason: 'cierre', caller: author, refId: questionId });
    }
  }
  console.log(`4. ${QUESTIONS.length} questions with their answers, ratings and comments`);

  // 5. Urgent: charged −5 first, then urgent for 24 h (wiki #179)
  if (urgentId !== null) {
    const plan = await planCharge(facts, profile.jorge, 'urgente', urgentId);
    if (plan) {
      const charged = await chargeUrgent(store, plan, env);
      if (charged.status === 'confirmed') {
        await markUrgent(db, urgentId);
        console.log(`5. Urgent question #${urgentId} charged −5 (${charged.txHash.slice(0, 8)}…)`);
      } else {
        console.warn(`5. Urgent question #${urgentId} not charged (${charged.why}); it stays normal`);
      }
    } else {
      console.log(`5. Urgent question #${urgentId}: nothing to charge`);
    }
  }

  // 6. Rewards, one at a time (one distributor account)
  const tally = { confirmed: 0, pending: 0, capped: 0, refused: 0 };
  for (const r of rewards) {
    const plan = await planReward(facts, r.caller, r.reason, r.refId);
    if (!plan) tally.refused++;
    else if (isCapped(plan)) tally.capped++;
    else tally[(await payReward(store, plan, env)).status]++;
  }
  console.log(`6. Rewards: ${tally.confirmed} confirmed, ${tally.pending} pending, ${tally.capped} capped, ${tally.refused} not allowed`);

  // 7. Summary
  for (const n of NEIGHBORS) {
    const { publicKey } = await store.getStellar(profile[n.key]);
    const balance = publicKey ? await pointsBalance(publicKey, env.issuerPublic).then(Number).catch(() => '?') : '—';
    console.log(`   ${n.fullName.padEnd(13)} ${n.email.padEnd(18)} #${profile[n.key]}  ${balance} yapitas`);
  }
  if (tally.pending) console.log('   Some rewards stayed pending: run the seed again to finish them.');
}

main().catch((error: Error) => {
  console.error('✗', error.message);
  process.exit(1);
});
