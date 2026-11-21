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

select pg_temp.as_postgres();
do $$ begin raise notice 'rls ok'; end $$;

rollback;
