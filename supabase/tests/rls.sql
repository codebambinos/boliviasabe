-- supabase/tests/rls.sql
-- RLS checks for the local database (SPEC 03). Run it against `supabase start`:
--   docker exec -i supabase_db_BoliviaSabe psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
-- Everything runs inside one transaction that is rolled back at the end.
-- Covers every table with RLS (0002) and the rule triggers (0001).

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as the table owner, bypassing RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@test.local');

create temp table test_ids (name text primary key, id bigint, auth_id uuid);
create temp table test_rows (name text primary key, id bigint);
grant select on test_ids, test_rows to public;

insert into public.profiles (auth_id, display_name, full_name, city, zone, phone, notif_prefs)
values
  ('a0000000-0000-0000-0000-000000000001', 'Ana M.', 'Ana Mamani', 'Cochabamba', 'Sarco', '70000001', '{"push":true}'),
  ('b0000000-0000-0000-0000-000000000002', 'Beto R.', 'Beto Rojas', 'Cochabamba', 'Cala Cala', '70000002', '{"push":false}');

insert into test_ids (name, id, auth_id)
select 'a', id, auth_id from public.profiles where auth_id = 'a0000000-0000-0000-0000-000000000001'
union all
select 'b', id, auth_id from public.profiles where auth_id = 'b0000000-0000-0000-0000-000000000002';

insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone, tags)
values
  ((select id from test_ids where name = 'a'), 'Almuerzo 10 Bs', 'p', 't', 'Cochabamba', 'Sarco', '{Comida}'),
  ((select id from test_ids where name = 'b'), 'Cerrajería 24h', 'p', 't', 'Cochabamba', 'Cala Cala', '{Servicios}');

insert into public.questions (author_id, text, city, zone, tags)
values
  ((select id from test_ids where name = 'a'), 'Dónde hay gas hoy?', 'Cochabamba', 'Sarco', '{Hogar}'),
  ((select id from test_ids where name = 'b'), 'Alguien conoce un doctor?', 'Cochabamba', 'Cala Cala', '{Salud}');

insert into public.answers (question_id, author_id, text)
values
  ((select id from public.questions where text = 'Dónde hay gas hoy?'), (select id from test_ids where name = 'b'), 'En el mercado de Sarco'),
  ((select id from public.questions where text = 'Alguien conoce un doctor?'), (select id from test_ids where name = 'a'), 'Dr. Mamani, Cala Cala');

insert into public.answer_comments (answer_id, author_id, text)
values ((select id from public.answers where text = 'En el mercado de Sarco'), (select id from test_ids where name = 'b'), 'Gracias por el dato');

insert into public.wallet_keys (profile_id, secret_enc, secret_iv)
values ((select id from test_ids where name = 'a'), 'cifrado', 'iv');

insert into public.rewards (profile_id, memo_key, amount, reason)
values ((select id from test_ids where name = 'a'), 'bienvenida:ana', 5, 'bienvenida');

insert into test_rows (name, id)
select 'sign_a', id from public.signs where title = 'Almuerzo 10 Bs'
union all select 'sign_b', id from public.signs where title = 'Cerrajería 24h'
union all select 'q_a', id from public.questions where text = 'Dónde hay gas hoy?'
union all select 'q_b', id from public.questions where text = 'Alguien conoce un doctor?'
union all select 'ans_b', id from public.answers where text = 'En el mercado de Sarco'
union all select 'ans_a', id from public.answers where text = 'Dr. Mamani, Cala Cala'
union all select 'comment_b', id from public.answer_comments where text = 'Gracias por el dato'
union all select 'reward_a', id from public.rewards where memo_key = 'bienvenida:ana';

-- ---------------------------------------------------------------------------
-- Helpers (temporary, rolled back with the transaction)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.id_of(p_name text) returns bigint
language sql as $$ select id from test_ids where name = p_name $$;

create or replace function pg_temp.r(p_name text) returns bigint
language sql as $$ select id from test_rows where name = p_name $$;

create or replace function pg_temp.as_user(p_name text) returns void
language plpgsql as $$
declare v_auth uuid;
begin
  select auth_id into v_auth from test_ids where name = p_name;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end;
$$;

create or replace function pg_temp.as_postgres() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- expect_select: the SELECT must return p_expected rows. A permission error counts as 0 rows.
create or replace function pg_temp.expect_select(p_label text, p_sql text, p_expected bigint)
returns void language plpgsql as $$
declare n bigint := 0;
begin
  begin
    execute 'select count(*) from (' || p_sql || ') as q' into n;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> p_expected then
    raise exception 'FAILED: % (expected % rows, got %)', p_label, p_expected, n;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

-- expect_write: the DML must affect p_expected rows. An RLS, privilege, trigger (42501)
-- or duplicate-key error counts as 0 rows.
create or replace function pg_temp.expect_write(p_label text, p_sql text, p_expected bigint)
returns void language plpgsql as $$
declare n bigint := 0;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when insufficient_privilege or unique_violation then
    n := 0;
  end;
  if n <> p_expected then
    raise exception 'FAILED: % (expected % rows, got %)', p_label, p_expected, n;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles and profiles_public
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select pg_temp.expect_select('anon cannot read profiles',
  'select id from public.profiles', 0);
select pg_temp.expect_select('anon reads profiles_public',
  'select id from public.profiles_public', 2);

select pg_temp.as_user('a');
select pg_temp.expect_select('Ana reads her own profile',
  format('select id from public.profiles where id = %s', pg_temp.id_of('a')), 1);
select pg_temp.expect_select('Ana cannot read Beto''s profile',
  format('select id from public.profiles where id = %s', pg_temp.id_of('b')), 0);
select pg_temp.expect_select('Ana reads Beto in profiles_public',
  format('select id from public.profiles_public where id = %s', pg_temp.id_of('b')), 1);
select pg_temp.expect_write('Ana cannot rename Beto',
  format('update public.profiles set display_name = ''Hackeado'' where id = %s', pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot insert a profile for Beto''s account',
  format('insert into public.profiles (auth_id, display_name, full_name, city, zone) values (%L, ''Falso'', ''Falso'', ''Cochabamba'', ''Centro'')',
    (select auth_id from test_ids where name = 'b')), 0);
select pg_temp.expect_write('Ana cannot set her own stellar_status',
  format('update public.profiles set stellar_status = ''ready'' where id = %s', pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana cannot set her own stellar_pk',
  format('update public.profiles set stellar_pk = ''GFAKE'' where id = %s', pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana updates her own theme',
  format('update public.profiles set theme = ''dark'' where id = %s', pg_temp.id_of('a')), 1);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto reads his own phone',
  format('select id from public.profiles where id = %s and phone = ''70000002''', pg_temp.id_of('b')), 1);

-- ---------------------------------------------------------------------------
-- signs: public read, owner writes, locked once someone voted
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select pg_temp.expect_select('anon reads signs', 'select id from public.signs', 2);
select pg_temp.expect_write('anon cannot insert a sign',
  format('insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone) values (%s, ''Anónimo'', ''p'', ''t'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('a')), 0);

select pg_temp.as_user('a');
select pg_temp.expect_select('Ana reads all signs', 'select id from public.signs', 2);
select pg_temp.expect_write('Ana cannot edit Beto''s sign',
  format('update public.signs set title = ''Hackeado'' where id = %s', pg_temp.r('sign_b')), 0);
select pg_temp.expect_write('Ana cannot delete Beto''s sign',
  format('delete from public.signs where id = %s', pg_temp.r('sign_b')), 0);
select pg_temp.expect_write('Ana cannot insert a sign as Beto',
  format('insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone) values (%s, ''Falso'', ''p'', ''t'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana edits her own sign before any vote',
  format('update public.signs set title = ''Almuerzo 12 Bs'' where id = %s', pg_temp.r('sign_a')), 1);
select pg_temp.expect_write('Ana inserts and deletes her own sign without votes',
  format('insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone) values (%s, ''Temporal'', ''p'', ''t'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('a')), 1);
select pg_temp.expect_write('Ana deletes that temporary sign',
  'delete from public.signs where title = ''Temporal''', 1);

-- ---------------------------------------------------------------------------
-- sign_votes: the voter is the caller; no self-votes; votes are final
-- ---------------------------------------------------------------------------
select pg_temp.expect_write('Ana cannot vote as Beto',
  format('insert into public.sign_votes (sign_id, voter_id, helpful) values (%s, %s, true)',
    pg_temp.r('sign_b'), pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot vote on her own sign (trigger)',
  format('insert into public.sign_votes (sign_id, voter_id, helpful) values (%s, %s, true)',
    pg_temp.r('sign_a'), pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana votes on Beto''s sign',
  format('insert into public.sign_votes (sign_id, voter_id, helpful) values (%s, %s, true)',
    pg_temp.r('sign_b'), pg_temp.id_of('a')), 1);

select pg_temp.as_user('b');
select pg_temp.expect_write('Beto votes on Ana''s sign',
  format('insert into public.sign_votes (sign_id, voter_id, helpful) values (%s, %s, true)',
    pg_temp.r('sign_a'), pg_temp.id_of('b')), 1);
select pg_temp.expect_write('Beto cannot change his vote',
  format('update public.sign_votes set helpful = false where sign_id = %s', pg_temp.r('sign_a')), 0);
select pg_temp.expect_write('Beto cannot delete his vote',
  format('delete from public.sign_votes where sign_id = %s', pg_temp.r('sign_a')), 0);
select pg_temp.expect_write('Beto cannot edit his sign after Ana voted',
  format('update public.signs set title = ''Cambiado'' where id = %s', pg_temp.r('sign_b')), 0);
select pg_temp.expect_write('Beto cannot delete his sign after votes',
  format('delete from public.signs where id = %s', pg_temp.r('sign_b')), 0);

select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot edit her sign after Beto voted',
  format('update public.signs set title = ''Cambiado'' where id = %s', pg_temp.r('sign_a')), 0);
select pg_temp.expect_select('Ana sees every vote (public)', 'select sign_id from public.sign_votes', 2);

-- ---------------------------------------------------------------------------
-- questions: the author writes; status and urgency are server-only; no delete with answers
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot edit Beto''s question',
  format('update public.questions set text = ''Hackeado'' where id = %s', pg_temp.r('q_b')), 0);
select pg_temp.expect_write('Ana cannot close her own question (server-only column)',
  format('update public.questions set status = ''closed'' where id = %s', pg_temp.r('q_a')), 0);
select pg_temp.expect_write('Ana edits the text of her own question',
  format('update public.questions set text = ''Dónde hay gas hoy en Sarco?'' where id = %s', pg_temp.r('q_a')), 1);
select pg_temp.expect_write('Ana cannot delete her question while it has answers',
  format('delete from public.questions where id = %s', pg_temp.r('q_a')), 0);
select pg_temp.expect_write('Ana cannot post a question as Beto',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Falsa'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana posts and deletes a question without answers',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Pregunta temporal'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('a')), 1);
select pg_temp.expect_write('Ana deletes that temporary question',
  'delete from public.questions where text = ''Pregunta temporal''', 1);

select pg_temp.as_user('b');
select pg_temp.expect_write('Beto cannot delete his question while it has answers',
  format('delete from public.questions where id = %s', pg_temp.r('q_b')), 0);

-- ---------------------------------------------------------------------------
-- answers: no self-answers (trigger); one per person; text frozen after ratings
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot answer her own question (trigger)',
  format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Yo mismo'')',
    pg_temp.r('q_a'), pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana cannot answer as Beto',
  format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Falso'')',
    pg_temp.r('q_b'), pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot answer the same question twice',
  format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Segunda'')',
    pg_temp.r('q_b'), pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana cannot edit Beto''s answer',
  format('update public.answers set text = ''Hackeado'' where id = %s', pg_temp.r('ans_b')), 0);
select pg_temp.expect_write('Ana edits her own answer before any rating',
  format('update public.answers set text = ''Dr. Mamani, Av. Ayacucho'' where id = %s', pg_temp.r('ans_a')), 1);

-- ---------------------------------------------------------------------------
-- ratings: only the question author rates; no edits or deletes
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select pg_temp.expect_write('Beto rates Ana''s answer (he asked q_b)',
  format('insert into public.ratings (answer_id, rater_id, helpful) values (%s, %s, true)',
    pg_temp.r('ans_a'), pg_temp.id_of('b')), 1);
select pg_temp.expect_write('Beto cannot rate twice',
  format('insert into public.ratings (answer_id, rater_id, helpful) values (%s, %s, false)',
    pg_temp.r('ans_a'), pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Beto cannot change a rating',
  format('update public.ratings set helpful = false where answer_id = %s', pg_temp.r('ans_a')), 0);
select pg_temp.expect_write('Beto cannot delete a rating',
  format('delete from public.ratings where answer_id = %s', pg_temp.r('ans_a')), 0);

select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot rate her own answer (trigger: she did not ask q_b)',
  format('insert into public.ratings (answer_id, rater_id, helpful) values (%s, %s, true)',
    pg_temp.r('ans_a'), pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana rates Beto''s answer (she asked q_a)',
  format('insert into public.ratings (answer_id, rater_id, helpful) values (%s, %s, true)',
    pg_temp.r('ans_b'), pg_temp.id_of('a')), 1);
select pg_temp.expect_write('Ana cannot rate as Beto',
  format('insert into public.ratings (answer_id, rater_id, helpful) values (%s, %s, true)',
    pg_temp.r('ans_b'), pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot edit her answer after a rating',
  format('update public.answers set text = ''Cambiado'' where id = %s', pg_temp.r('ans_a')), 0);
select pg_temp.expect_write('Ana cannot delete her answer after a rating',
  format('delete from public.answers where id = %s', pg_temp.r('ans_a')), 0);

-- ---------------------------------------------------------------------------
-- answer_comments: the author writes and deletes their own comments
-- ---------------------------------------------------------------------------
select pg_temp.expect_write('Ana comments on Beto''s answer',
  format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Gracias!'')',
    pg_temp.r('ans_b'), pg_temp.id_of('a')), 1);
select pg_temp.expect_write('Ana cannot comment as Beto',
  format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Falso'')',
    pg_temp.r('ans_b'), pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot delete Beto''s comment',
  format('delete from public.answer_comments where id = %s', pg_temp.r('comment_b')), 0);
select pg_temp.expect_write('Ana deletes her own comment',
  'delete from public.answer_comments where text = ''Gracias!''', 1);

-- ---------------------------------------------------------------------------
-- reports: the reporter sees and writes only their own
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b');
select pg_temp.expect_write('Beto reports Ana''s sign',
  format('insert into public.reports (reporter_id, kind, target_id, reason) values (%s, ''sign'', %s, ''spam'')',
    pg_temp.id_of('b'), pg_temp.r('sign_a')), 1);

select pg_temp.as_user('a');
select pg_temp.expect_select('Ana sees no reports yet', 'select id from public.reports', 0);
select pg_temp.expect_write('Ana cannot report as Beto',
  format('insert into public.reports (reporter_id, kind, target_id, reason) values (%s, ''sign'', %s, ''spam'')',
    pg_temp.id_of('b'), pg_temp.r('sign_b')), 0);
select pg_temp.expect_write('Ana reports Beto''s sign',
  format('insert into public.reports (reporter_id, kind, target_id, reason) values (%s, ''sign'', %s, ''spam'')',
    pg_temp.id_of('a'), pg_temp.r('sign_b')), 1);
select pg_temp.expect_select('Ana sees only her own report', 'select id from public.reports', 1);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto sees only his own report', 'select id from public.reports', 1);

-- ---------------------------------------------------------------------------
-- hidden_items, saved, push_subscriptions: each user manages only their own rows
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select pg_temp.expect_write('Ana hides Beto''s question',
  format('insert into public.hidden_items (user_id, kind, target_id) values (%s, ''question'', %s)',
    pg_temp.id_of('a'), pg_temp.r('q_b')), 1);
select pg_temp.expect_write('Ana cannot hide an item for Beto',
  format('insert into public.hidden_items (user_id, kind, target_id) values (%s, ''question'', %s)',
    pg_temp.id_of('b'), pg_temp.r('q_a')), 0);
select pg_temp.expect_select('Ana sees her hidden items', 'select id from public.hidden_items', 1);
select pg_temp.expect_write('Ana deletes her hidden item',
  'delete from public.hidden_items', 1);

select pg_temp.expect_write('Ana saves Beto''s sign',
  format('insert into public.saved (user_id, kind, target_id) values (%s, ''sign'', %s)',
    pg_temp.id_of('a'), pg_temp.r('sign_b')), 1);
select pg_temp.expect_write('Ana cannot save as Beto',
  format('insert into public.saved (user_id, kind, target_id) values (%s, ''sign'', %s)',
    pg_temp.id_of('b'), pg_temp.r('sign_a')), 0);
select pg_temp.expect_select('Ana sees her saved items', 'select id from public.saved', 1);
select pg_temp.expect_write('Ana deletes her saved item', 'delete from public.saved', 1);

select pg_temp.expect_write('Ana subscribes a device',
  format('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%s, ''https://push.test/a'', ''k'', ''a'')',
    pg_temp.id_of('a')), 1);
select pg_temp.expect_write('Ana cannot subscribe a device for Beto',
  format('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%s, ''https://push.test/b'', ''k'', ''a'')',
    pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot change a subscription (no update policy)',
  'update public.push_subscriptions set auth = ''x''', 0);
select pg_temp.expect_select('Ana sees her subscriptions', 'select id from public.push_subscriptions', 1);
select pg_temp.expect_write('Ana deletes her subscription', 'delete from public.push_subscriptions', 1);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto sees no saved items of Ana', 'select id from public.saved', 0);
select pg_temp.expect_select('Beto sees no hidden items of Ana', 'select id from public.hidden_items', 0);

-- ---------------------------------------------------------------------------
-- contact_requests: requester and owner read; requester creates; only owner answers
-- ---------------------------------------------------------------------------
select pg_temp.expect_write('Beto asks Ana for contact',
  format('insert into public.contact_requests (requester_id, owner_id, question_id) values (%s, %s, %s)',
    pg_temp.id_of('b'), pg_temp.id_of('a'), pg_temp.r('q_a')), 1);
select pg_temp.expect_write('Beto cannot accept his own request',
  'update public.contact_requests set status = ''accepted'', answered_at = now()', 0);
select pg_temp.expect_write('Beto cannot request as Ana',
  format('insert into public.contact_requests (requester_id, owner_id) values (%s, %s)',
    pg_temp.id_of('a'), pg_temp.id_of('b')), 0);

select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot change who requested',
  format('update public.contact_requests set requester_id = %s', pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana accepts the request',
  'update public.contact_requests set status = ''accepted'', answered_at = now()', 1);
select pg_temp.expect_select('Ana reads the request as owner', 'select id from public.contact_requests', 1);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto reads the request as requester', 'select id from public.contact_requests', 1);
select pg_temp.expect_write('Beto cannot delete the request', 'delete from public.contact_requests', 0);

-- ---------------------------------------------------------------------------
-- notifications: the owner reads, marks read and deletes; no client inserts
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot insert a notification',
  format('insert into public.notifications (user_id, kind, ref_kind, ref_id) values (%s, ''fake'', ''question'', 1)',
    pg_temp.id_of('a')), 0);
-- Two rows: the answer from Beto (fixture) and the helpful mark from Beto (ratings), both written by triggers.
select pg_temp.expect_select('Ana reads only her notifications (answer and helpful from triggers)', 'select id from public.notifications', 2);
select pg_temp.expect_write('Ana marks her notifications as read',
  'update public.notifications set read_at = now()', 2);
select pg_temp.expect_write('Ana cannot change a notification kind',
  'update public.notifications set kind = ''fake''', 0);
select pg_temp.expect_write('Ana cannot delete Beto''s notifications',
  format('delete from public.notifications where user_id = %s', pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana deletes her notifications', 'delete from public.notifications', 2);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto reads his notifications (answer and helpful from triggers)', 'select id from public.notifications', 2);

-- ---------------------------------------------------------------------------
-- rewards and wallet_keys: the owner reads rewards; wallet keys are never readable
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select pg_temp.expect_select('Ana reads her reward', 'select id from public.rewards', 1);
select pg_temp.expect_write('Ana cannot insert a reward',
  format('insert into public.rewards (profile_id, memo_key, amount, reason) values (%s, ''fake:1'', 5, ''letrero'')',
    pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana cannot change a reward',
  'update public.rewards set status = ''confirmed''', 0);
select pg_temp.expect_write('Ana cannot delete a reward', 'delete from public.rewards', 0);
select pg_temp.expect_select('Ana cannot read her wallet key', 'select profile_id from public.wallet_keys', 0);
select pg_temp.expect_write('Ana cannot write a wallet key',
  format('insert into public.wallet_keys (profile_id, secret_enc, secret_iv) values (%s, ''x'', ''y'')',
    pg_temp.id_of('b')), 0);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto cannot read Ana''s reward', 'select id from public.rewards', 0);

select pg_temp.as_anon();
select pg_temp.expect_select('anon reads no notifications', 'select id from public.notifications', 0);
select pg_temp.expect_select('anon reads no rewards', 'select id from public.rewards', 0);
select pg_temp.expect_select('anon reads no wallet keys', 'select profile_id from public.wallet_keys', 0);

-- ---------------------------------------------------------------------------
-- rewards.memo_key: Stellar memos hold at most 28 bytes (bytes, not characters)
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
do $$
begin
  insert into public.rewards (profile_id, memo_key, amount, reason)
  values ((select id from test_ids where name = 'a'), repeat('x', 28), 5, 'letrero');
  raise notice 'ok: a 28-byte memo_key is accepted';

  begin
    insert into public.rewards (profile_id, memo_key, amount, reason)
    values ((select id from test_ids where name = 'a'), repeat('y', 29), 5, 'letrero');
    raise exception 'FAILED: a 29-byte memo_key was accepted';
  exception when check_violation then
    raise notice 'ok: a 29-byte memo_key is rejected';
  end;

  begin
    -- 15 characters, 30 bytes
    insert into public.rewards (profile_id, memo_key, amount, reason)
    values ((select id from test_ids where name = 'a'), repeat('ñ', 15), 5, 'letrero');
    raise exception 'FAILED: a 30-byte memo_key (15 characters) was accepted';
  exception when check_violation then
    raise notice 'ok: a memo_key over 28 bytes is rejected even with fewer than 28 characters';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- zone_norm: lower case, no accents, from the zone (trigger)
-- ---------------------------------------------------------------------------
update public.profiles set zone = 'Sopocachí' where id = pg_temp.id_of('a');
select pg_temp.expect_select('zone_norm drops accents and case',
  format('select id from public.profiles where id = %s and zone_norm = ''sopocachi''', pg_temp.id_of('a')), 1);

-- ---------------------------------------------------------------------------
-- author_trust and profiles_public (0003)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.expect_text(p_label text, p_sql text, p_expected text)
returns void language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  if v is distinct from p_expected then
    raise exception 'FAILED: % (expected %, got %)', p_label, p_expected, v;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

-- A question by Ana, answered by p_author, and rated by Ana (she is the asker).
create or replace function pg_temp.rate_answer(p_author text, p_helpful boolean) returns void
language plpgsql as $$
declare q bigint; ans bigint;
begin
  insert into public.questions (author_id, text, city, zone)
  values (pg_temp.id_of('a'), 'Pregunta de prueba', 'Cochabamba', 'Centro') returning id into q;
  insert into public.answers (question_id, author_id, text)
  values (q, pg_temp.id_of(p_author), 'Respuesta de prueba') returning id into ans;
  insert into public.ratings (answer_id, rater_id, helpful)
  values (ans, pg_temp.id_of('a'), p_helpful);
end;
$$;

select pg_temp.as_postgres();
insert into auth.users (id, aud, role, email)
values
  ('d0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dani@test.local'),
  ('e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'eva@test.local'),
  ('f0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'fran@test.local');
insert into public.profiles (auth_id, display_name, full_name, city, zone)
values
  ('d0000000-0000-0000-0000-000000000004', 'Dani P.', 'Dani Pérez', 'Cochabamba', 'Centro'),
  ('e0000000-0000-0000-0000-000000000005', 'Eva L.', 'Eva López', 'Cochabamba', 'Centro'),
  ('f0000000-0000-0000-0000-000000000006', 'Fran G.', 'Fran Gómez', 'Cochabamba', 'Centro');
insert into test_ids (name, id, auth_id)
select 'd', id, auth_id from public.profiles where display_name = 'Dani P.'
union all select 'e', id, auth_id from public.profiles where display_name = 'Eva L.'
union all select 'f', id, auth_id from public.profiles where display_name = 'Fran G.';

-- Beto has one rating from Ana: below 3 ratings, so stars are null.
select pg_temp.expect_text('Beto (1 rating) has null stars',
  format('select (stars is null)::text from public.author_trust where profile_id = %s', pg_temp.id_of('b')), 'true');
select pg_temp.expect_text('Beto (1 rating) is Vecino nuevo',
  format('select badge from public.author_trust where profile_id = %s', pg_temp.id_of('b')), 'Vecino nuevo');

-- Dani: two helpful ratings, then three, then five.
select pg_temp.rate_answer('d', true);
select pg_temp.rate_answer('d', true);
select pg_temp.expect_text('Dani with 2 ratings has null stars',
  format('select (stars is null)::text from public.author_trust where profile_id = %s', pg_temp.id_of('d')), 'true');
select pg_temp.expect_text('Dani with 2 ratings is Vecino nuevo',
  format('select badge from public.author_trust where profile_id = %s', pg_temp.id_of('d')), 'Vecino nuevo');
select pg_temp.rate_answer('d', true);
select pg_temp.expect_text('Dani with 3 helpful ratings has 5.0 stars',
  format('select (stars = 5.0)::text from public.author_trust where profile_id = %s', pg_temp.id_of('d')), 'true');
select pg_temp.expect_text('Dani with 3 ratings is Buen vecino (not 5 yet)',
  format('select badge from public.author_trust where profile_id = %s', pg_temp.id_of('d')), 'Buen vecino');
select pg_temp.rate_answer('d', true);
select pg_temp.rate_answer('d', true);
select pg_temp.expect_text('Dani with 5 helpful ratings is De confianza',
  format('select badge from public.author_trust where profile_id = %s', pg_temp.id_of('d')), 'De confianza');

-- Eva: 2 helpful and 1 not helpful gives 1 + 4 × 2/3 = 3.7 stars, Buen vecino.
select pg_temp.rate_answer('e', true);
select pg_temp.rate_answer('e', true);
select pg_temp.rate_answer('e', false);
select pg_temp.expect_text('Eva with 2 helpful and 1 not helpful has 3.7 stars',
  format('select (stars = 3.7)::text from public.author_trust where profile_id = %s', pg_temp.id_of('e')), 'true');
select pg_temp.expect_text('Eva with 3 ratings is Buen vecino',
  format('select badge from public.author_trust where profile_id = %s', pg_temp.id_of('e')), 'Buen vecino');

-- Fran has no ratings: no trust row, and profiles_public fills in null stars and Vecino nuevo.
select pg_temp.expect_text('Fran has no author_trust row',
  format('select count(*)::text from public.author_trust where profile_id = %s', pg_temp.id_of('f')), '0');
select pg_temp.expect_text('profiles_public gives Fran null stars',
  format('select (stars is null)::text from public.profiles_public where id = %s', pg_temp.id_of('f')), 'true');
select pg_temp.expect_text('profiles_public gives Fran Vecino nuevo',
  format('select badge from public.profiles_public where id = %s', pg_temp.id_of('f')), 'Vecino nuevo');

-- author_trust exposes only aggregates, and anon can read it.
select pg_temp.expect_text('author_trust has no raw rating columns',
  'select count(*)::text from information_schema.columns
     where table_schema = ''public'' and table_name = ''author_trust''
       and column_name in (''rater_id'', ''answer_id'', ''created_at'')', '0');
select pg_temp.as_anon();
select pg_temp.expect_select('anon reads author_trust', 'select profile_id from public.author_trust', 4);

-- Notifications from the two triggers.
select pg_temp.as_user('a');
select pg_temp.expect_write('Ana asks a question to be answered',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Pregunta para notificar'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('a')), 1);
select pg_temp.expect_write('Ana asks a second question',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Pregunta para no sirvió'', ''Cochabamba'', ''Sarco'')',
    pg_temp.id_of('a')), 1);

select pg_temp.as_user('b');
select pg_temp.expect_write('Beto answers Ana''s first question',
  format('insert into public.answers (question_id, author_id, text) values ((select id from public.questions where text = ''Pregunta para notificar''), %s, ''Respuesta notificada'')',
    pg_temp.id_of('b')), 1);
select pg_temp.expect_write('Beto answers Ana''s second question',
  format('insert into public.answers (question_id, author_id, text) values ((select id from public.questions where text = ''Pregunta para no sirvió''), %s, ''Respuesta no sirvió'')',
    pg_temp.id_of('b')), 1);

select pg_temp.as_user('a');
select pg_temp.expect_select('Ana gets one answer notification per new answer',
  'select n.id from public.notifications n join public.questions q on q.id = n.ref_id
   where n.kind = ''answer'' and q.text in (''Pregunta para notificar'', ''Pregunta para no sirvió'')', 2);

select pg_temp.expect_write('Ana marks Beto''s first answer helpful',
  'insert into public.ratings (answer_id, rater_id, helpful) values ((select id from public.answers where text = ''Respuesta notificada''), ' || pg_temp.id_of('a') || ', true)', 1);
select pg_temp.expect_write('Ana marks Beto''s second answer not helpful',
  'insert into public.ratings (answer_id, rater_id, helpful) values ((select id from public.answers where text = ''Respuesta no sirvió''), ' || pg_temp.id_of('a') || ', false)', 1);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto gets a helpful notification for the helpful mark',
  'select n.id from public.notifications n
   where n.kind = ''helpful'' and n.ref_id = (select id from public.answers where text = ''Respuesta notificada'')', 1);
select pg_temp.expect_select('Beto gets no notification for the not-helpful mark',
  'select n.id from public.notifications n
   where n.kind = ''helpful'' and n.ref_id = (select id from public.answers where text = ''Respuesta no sirvió'')', 0);

-- ---------------------------------------------------------------------------
-- Data adapter (0005, SPEC 11): read functions, hidden and in-review rules, rating, closing, saved, bucket
-- Fresh people (x, y, z, w) and content in Oruro/Sucre so the checks above do not interfere.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.expect_error(p_label text, p_sql text, p_state text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      raise notice 'ok: %', p_label;
      return;
    end if;
    raise exception 'FAILED: % (expected %, got % %)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % (no error, expected %)', p_label, p_state;
end;
$$;

select pg_temp.as_postgres();
insert into auth.users (id, aud, role, email)
values
  ('d0000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'x@test.local'),
  ('d0000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'y@test.local'),
  ('d0000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'z@test.local'),
  ('d0000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'w@test.local');
insert into public.profiles (auth_id, display_name, full_name, city, zone)
values
  ('d0000000-0000-0000-0000-0000000000a1', 'Xavi P.', 'Xavi Perez', 'Oruro', 'Centro'),
  ('d0000000-0000-0000-0000-0000000000a2', 'Yola Q.', 'Yola Quispe', 'Oruro', 'Norte'),
  ('d0000000-0000-0000-0000-0000000000a3', 'Zoe R.', 'Zoe Rios', 'Oruro', 'Norte'),
  ('d0000000-0000-0000-0000-0000000000a4', 'Walter S.', 'Walter Soto', 'Oruro', 'Norte');
insert into test_ids (name, id, auth_id)
select case u.email when 'x@test.local' then 'mx' when 'y@test.local' then 'my' when 'z@test.local' then 'mz' else 'mw' end,
       p.id, p.auth_id
from public.profiles p join auth.users u on u.id = p.auth_id
where u.email in ('x@test.local', 'y@test.local', 'z@test.local', 'w@test.local');

-- x: one sign (voted helpful by y) and 31 more in Sucre for paging
insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone, tags, created_at)
values (pg_temp.id_of('mx'), 'Pan caliente', 'p', 't', 'Oruro', 'Centro', '{Comida}', now() - interval '1 hour');
insert into test_rows (name, id) select 'adapter_sign', id from public.signs where title = 'Pan caliente';
insert into public.sign_votes (sign_id, voter_id, helpful) values (pg_temp.r('adapter_sign'), pg_temp.id_of('my'), true);
insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone, created_at)
select pg_temp.id_of('mx'), 'Sucre ' || g, 'p', 't', 'Sucre', 'Centro', now() - (g || ' minutes')::interval from generate_series(1, 31) g;

-- questions: q_old (x, Centro) oldest, q_urgent (w, Norte, urgent), q_new (w, Norte) newest, q_closed (w, closed)
insert into public.questions (author_id, text, city, zone, tags, urgent_until, status, created_at)
values
  (pg_temp.id_of('mx'), 'Dónde conseguir gas envasado hoy?', 'Oruro', 'Centro', '{Hogar}', null, 'open', now() - interval '5 hours'),
  (pg_temp.id_of('mw'), 'Urgente: farmacia abierta', 'Oruro', 'Norte', '{Salud}', now() + interval '12 hours', 'open', now() - interval '6 hours'),
  (pg_temp.id_of('mw'), 'Hay buses al aeropuerto?', 'Oruro', 'Norte', '{Transporte}', null, 'open', now() - interval '1 hour'),
  (pg_temp.id_of('mw'), 'Pregunta cerrada vieja', 'Oruro', 'Norte', '{}', null, 'closed', now() - interval '30 minutes'),
  (pg_temp.id_of('mx'), 'Pregunta sin respuestas de x', 'Oruro', 'Centro', '{}', null, 'open', now() - interval '2 hours'),
  (pg_temp.id_of('mx'), 'Pregunta con una respuesta de x', 'Oruro', 'Centro', '{}', null, 'open', now() - interval '3 hours');
insert into test_rows (name, id)
select 'q_old', id from public.questions where text like 'Dónde conseguir gas%'
union all select 'q_urgent', id from public.questions where text like 'Urgente:%'
union all select 'q_new', id from public.questions where text like 'Hay buses%'
union all select 'q_closed', id from public.questions where text like 'Pregunta cerrada%'
union all select 'q_empty', id from public.questions where text like 'Pregunta sin respuestas%'
union all select 'q_one', id from public.questions where text like 'Pregunta con una respuesta%';

-- signs: guest read, per-caller fields, search, tags, paging
select pg_temp.as_anon();
select pg_temp.expect_text('list_signs: a guest sees the sign', $q$select jsonb_array_length(public.list_signs('Oruro')->'items')::text$q$, '1');
select pg_temp.expect_text('list_signs: search ignores case and accents', $q$select jsonb_array_length(public.list_signs('Oruro', 'PÁN')->'items')::text$q$, '1');
select pg_temp.expect_text('list_signs: search with no match', $q$select jsonb_array_length(public.list_signs('Oruro', 'zzz')->'items')::text$q$, '0');
select pg_temp.expect_text('list_signs: tag filter keeps the match', $q$select jsonb_array_length(public.list_signs('Oruro', null, '{Comida,Salud}')->'items')::text$q$, '1');
select pg_temp.expect_text('list_signs: tag filter drops the rest', $q$select jsonb_array_length(public.list_signs('Oruro', null, '{Salud}')->'items')::text$q$, '0');
select pg_temp.expect_text('list_signs: a guest has no vote', $q$select (public.list_signs('Oruro')->'items'->0->>'myVote') is null$q$, 'true');
select pg_temp.expect_text('list_signs: first page has 30', $q$select jsonb_array_length(public.list_signs('Sucre')->'items')::text$q$, '30');
select pg_temp.expect_text('list_signs: first page points to the next', $q$select public.list_signs('Sucre')->>'nextCursor'$q$, '30');
select pg_temp.expect_text('list_signs: second page has the last one', $q$select jsonb_array_length(public.list_signs('Sucre', null, null, 30)->'items')::text$q$, '1');
select pg_temp.expect_text('list_signs: last page has no cursor', $q$select public.list_signs('Sucre', null, null, 30)->>'nextCursor' is null$q$, 'true');
select pg_temp.expect_text('list_signs: pages do not repeat', $q$select count(distinct i->>'id')::text from (select jsonb_array_elements(public.list_signs('Sucre')->'items') i union all select jsonb_array_elements(public.list_signs('Sucre', null, null, 30)->'items')) t$q$, '31');
select pg_temp.expect_error('a guest cannot call rate_answer', 'select public.rate_answer(1, true)', '42501');

select pg_temp.as_user('my');
select pg_temp.expect_text('get_sign: my vote', format('select public.get_sign(%s)->>''myVote''', pg_temp.r('adapter_sign')), 'helpful');
select pg_temp.expect_text('get_sign: counts the helpful vote', format('select public.get_sign(%s)->>''helpfulCount''', pg_temp.r('adapter_sign')), '1');
select pg_temp.expect_text('get_sign: not mine', format('select public.get_sign(%s)->>''isMine''', pg_temp.r('adapter_sign')), 'false');
select pg_temp.as_user('mx');
select pg_temp.expect_text('get_sign: mine', format('select public.get_sign(%s)->>''isMine''', pg_temp.r('adapter_sign')), 'true');
select pg_temp.expect_error('get_sign: unknown id is not_found', 'select public.get_sign(999999999)', 'P0002');

-- saved
select pg_temp.expect_text('toggle_saved: saves', format('select public.toggle_saved(''sign'', %s)::text', pg_temp.r('adapter_sign')), 'true');
select pg_temp.expect_text('get_sign: savedByMe', format('select public.get_sign(%s)->>''savedByMe''', pg_temp.r('adapter_sign')), 'true');
select pg_temp.expect_text('saved_items: lists it', $q$select jsonb_array_length(public.saved_items()->'signs')::text$q$, '1');
select pg_temp.expect_text('toggle_saved: unsaves', format('select public.toggle_saved(''sign'', %s)::text', pg_temp.r('adapter_sign')), 'false');
select pg_temp.expect_error('toggle_saved: unknown item is not_found', $q$select public.toggle_saved('sign', 999999999)$q$, 'P0002');

-- reports: three different people hide it for everyone but its author; the reporter loses it at once
select pg_temp.expect_error('report_content: not your own', format('select public.report_content(''sign'', %s, ''spam'')', pg_temp.r('adapter_sign')), '42501');
select pg_temp.as_user('mz');
select public.report_content('sign', pg_temp.r('adapter_sign'), 'spam');
select pg_temp.expect_text('the reporter stops seeing it', $q$select jsonb_array_length(public.list_signs('Oruro')->'items')::text$q$, '0');
select pg_temp.as_user('my');
select pg_temp.expect_text('others still see it after one report', $q$select jsonb_array_length(public.list_signs('Oruro')->'items')::text$q$, '1');
select public.report_content('sign', pg_temp.r('adapter_sign'), 'false_info');
select pg_temp.as_user('mw');
select public.report_content('sign', pg_temp.r('adapter_sign'), 'offensive');
select pg_temp.as_user('mx');
select pg_temp.expect_text('the author sees it in review', $q$select public.list_signs('Oruro')->'items'->0->>'inReview'$q$, 'true');
select pg_temp.as_anon();
select pg_temp.expect_text('three reports hide it for everyone else', $q$select jsonb_array_length(public.list_signs('Oruro')->'items')::text$q$, '0');
select pg_temp.expect_error('a hidden sign is not_found for a guest', format('select public.get_sign(%s)', pg_temp.r('adapter_sign')), 'P0002');

-- hide_content hides only for the caller
select pg_temp.as_user('my');
select public.hide_content('question', pg_temp.r('q_new'));
select pg_temp.expect_text('hide_content: gone for me', format('select (select count(*) from jsonb_array_elements(public.list_questions(''Oruro'')->''items'') i where (i->>''id'')::bigint = %s)::text', pg_temp.r('q_new')), '0');
select pg_temp.as_user('mz');
select pg_temp.expect_text('hide_content: still there for others', format('select (select count(*) from jsonb_array_elements(public.list_questions(''Oruro'')->''items'') i where (i->>''id'')::bigint = %s)::text', pg_temp.r('q_new')), '1');

-- remove_sign: only the author, even with votes
select pg_temp.expect_error('remove_sign: not mine', format('select public.remove_sign(%s)', pg_temp.r('adapter_sign')), '42501');
select pg_temp.as_user('mx');
select public.remove_sign(pg_temp.r('adapter_sign'));
select pg_temp.as_postgres();
select pg_temp.expect_select('remove_sign: the sign and its votes are gone',
  format('select 1 from public.signs where id = %s union all select 1 from public.sign_votes where sign_id = %s', pg_temp.r('adapter_sign'), pg_temp.r('adapter_sign')), 0);

-- question order: guest urgent → city → closed; a member of Centro sees Centro before Norte
select pg_temp.as_anon();
select pg_temp.expect_text('list_questions (guest): urgent first', $q$select public.list_questions('Oruro')->'items'->0->>'text'$q$, 'Urgente: farmacia abierta');
select pg_temp.expect_text('list_questions (guest): the closed one is last', $q$select public.list_questions('Oruro')->'items'->5->>'text'$q$, 'Pregunta cerrada vieja');
select pg_temp.expect_text('list_questions (guest): newest first in the city', $q$select public.list_questions('Oruro')->'items'->1->>'text'$q$, 'Hay buses al aeropuerto?');
select pg_temp.as_user('mx');
select pg_temp.expect_text('list_questions (x): urgent first', $q$select public.list_questions('Oruro')->'items'->0->>'text'$q$, 'Urgente: farmacia abierta');
select pg_temp.expect_text('list_questions (x): my zone before the rest of the city', $q$select public.list_questions('Oruro')->'items'->1->>'text'$q$, 'Pregunta sin respuestas de x');
select pg_temp.expect_text('list_questions: search ignores accents', $q$select jsonb_array_length(public.list_questions('Oruro', 'DONDE')->'items')::text$q$, '1');
select pg_temp.expect_text('similar_questions: shared words of 4+ letters', $q$select jsonb_array_length(public.similar_questions('quiero gas envasado barato'))::text$q$, '1');
select pg_temp.expect_text('similar_questions: under 3 words gives none', $q$select jsonb_array_length(public.similar_questions('gas envasado'))::text$q$, '0');

-- answers
select pg_temp.as_user('my');
select pg_temp.expect_write('y answers q_old', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''En el Mercado'')', pg_temp.r('q_old'), pg_temp.id_of('my')), 1);
select pg_temp.expect_write('y cannot answer q_old twice', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Otra'')', pg_temp.r('q_old'), pg_temp.id_of('my')), 0);
select pg_temp.expect_write('a closed question takes no answers', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Tarde'')', pg_temp.r('q_closed'), pg_temp.id_of('my')), 0);
select pg_temp.as_user('mz');
select pg_temp.expect_write('z answers q_old', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Cerca de la plaza'')', pg_temp.r('q_old'), pg_temp.id_of('mz')), 1);
select pg_temp.as_user('my');
select pg_temp.expect_write('y answers q_one', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Respuesta para q_one'')', pg_temp.r('q_one'), pg_temp.id_of('my')), 1);
select pg_temp.as_postgres();
insert into test_rows (name, id)
select 'ans_y', id from public.answers where text = 'En el Mercado'
union all select 'ans_z', id from public.answers where text = 'Cerca de la plaza'
union all select 'ans_one', id from public.answers where text = 'Respuesta para q_one';

-- rate_answer
select pg_temp.as_user('my');
select pg_temp.expect_error('rate_answer: not the asker', format('select public.rate_answer(%s, true)', pg_temp.r('ans_z')), '42501');
select pg_temp.as_user('mx');
select pg_temp.expect_text('rate_answer: «No me sirvió» keeps the question open', format('select public.rate_answer(%s, false)->>''questionStatus''', pg_temp.r('ans_z')), 'open');
select pg_temp.expect_text('rate_answer: «Me sirvió» solves it', format('select public.rate_answer(%s, true)->>''questionStatus''', pg_temp.r('ans_y')), 'solved');
select pg_temp.expect_text('rate_answer: «No me sirvió» can become «Me sirvió»', format('select public.rate_answer(%s, true)->''answer''->>''helpful''', pg_temp.r('ans_z')), 'true');
select pg_temp.expect_error('rate_answer: «Me sirvió» is final', format('select public.rate_answer(%s, false)', pg_temp.r('ans_y')), '42501');
select pg_temp.expect_text('rate_answer: repeating «Me sirvió» changes nothing', format('select public.rate_answer(%s, true)->>''questionStatus''', pg_temp.r('ans_y')), 'solved');
select pg_temp.expect_text('get_question: «Me sirvió» answers first, then the oldest', format('select public.get_question(%s)->''answers''->0->>''text''', pg_temp.r('q_old')), 'En el Mercado');
select pg_temp.expect_text('get_question: answerCount', format('select public.get_question(%s)->''question''->>''answerCount''', pg_temp.r('q_old')), '2');
select pg_temp.as_postgres();
select pg_temp.expect_select('rate_answer: the helpful marks notified the helpers once each',
  format('select 1 from public.notifications where kind = ''helpful'' and ref_id in (%s, %s)', pg_temp.r('ans_y'), pg_temp.r('ans_z')), 2);
select pg_temp.as_user('mz');
select pg_temp.expect_error('a solved question takes no new answers', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Tarde'')', pg_temp.r('q_old'), pg_temp.id_of('mw')), '42501');

-- close_question
select pg_temp.as_user('mw');
select pg_temp.expect_error('close_question: not the asker', format('select public.close_question(%s)', pg_temp.r('q_one')), '42501');
select pg_temp.as_user('mx');
select pg_temp.expect_error('close_question: a solved question cannot be closed', format('select public.close_question(%s)', pg_temp.r('q_old')), '42501');
select pg_temp.expect_error('close_question: needs answers', format('select public.close_question(%s)', pg_temp.r('q_empty')), '42501');
select pg_temp.expect_text('close_question: closes an open question with answers', format('select public.close_question(%s)->>''status''', pg_temp.r('q_one')), 'closed');
select pg_temp.expect_text('rate_answer on a closed question keeps it closed', format('select public.rate_answer(%s, true)->>''questionStatus''', pg_temp.r('ans_one')), 'closed');

-- clients still cannot write the status or the urgency
select pg_temp.expect_write('x cannot set the status through the table', format('update public.questions set status = ''solved'' where id = %s', pg_temp.r('q_empty')), 0);
select pg_temp.expect_write('x cannot set urgent_until through the table', format('update public.questions set urgent_until = now() + interval ''1 day'' where id = %s', pg_temp.r('q_empty')), 0);

-- activity
select pg_temp.expect_text('my_questions: the caller''s own', $q$select jsonb_array_length(public.my_questions())::text$q$, '3');
select pg_temp.as_user('my');
select pg_temp.expect_text('my_answers: the caller''s own', $q$select jsonb_array_length(public.my_answers())::text$q$, '2');
select pg_temp.expect_text('my_signs: none for y', $q$select jsonb_array_length(public.my_signs())::text$q$, '0');

-- Storage: a person writes only inside their own folder of the `photos` bucket
select pg_temp.as_user('mx');
select pg_temp.expect_write('x uploads to their own folder',
  format('insert into storage.objects (bucket_id, name) values (''photos'', ''%s/a.jpg'')', pg_temp.id_of('mx')), 1);
select pg_temp.expect_write('x cannot upload to y''s folder',
  format('insert into storage.objects (bucket_id, name) values (''photos'', ''%s/a.jpg'')', pg_temp.id_of('my')), 0);
-- Storage blocks a direct SQL delete unless its API flag is set; the API sets it for the caller's own request.
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.expect_write('x deletes their own file',
  format('delete from storage.objects where bucket_id = ''photos'' and name = ''%s/a.jpg''', pg_temp.id_of('mx')), 1);

-- ---------------------------------------------------------------------------
-- auth_method (0004): the sign-in sheet asks which method an e-mail has
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
insert into auth.users (id, aud, role, email)
values ('c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'Lucia@Test.local');
insert into auth.identities (id, user_id, identity_data, provider, provider_id)
values
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '{}', 'email', 'ana@test.local'),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000002', '{}', 'google', 'beto-google'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000003', '{}', 'google', 'lucia-google'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000003', '{}', 'email', 'lucia@test.local');

select pg_temp.as_anon();
select pg_temp.expect_text('auth_method: e-mail + password account', 'select public.auth_method(''ana@test.local'')', 'password');
select pg_temp.expect_text('auth_method: Google-only account', 'select public.auth_method(''beto@test.local'')', 'google');
select pg_temp.expect_text('auth_method: unknown e-mail', 'select public.auth_method(''nadie@test.local'')', null);
select pg_temp.expect_text('auth_method: ignores case and spaces', 'select public.auth_method('' ANA@Test.Local '')', 'password');
select pg_temp.expect_text('auth_method: Google plus password counts as password', 'select public.auth_method(''lucia@test.local'')', 'password');
select pg_temp.expect_select('anon cannot read auth.users directly', 'select id from auth.users', 0);

select pg_temp.as_user('a');
select pg_temp.expect_text('auth_method: signed-in users can call it too', 'select public.auth_method(''beto@test.local'')', 'google');

select pg_temp.as_postgres();
do $$ begin raise notice 'rls ok'; end $$;

rollback;
