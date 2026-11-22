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

-- expect_text: the scalar query must return p_expected.
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
-- contact_requests (0006): only request_contact / respond_contact write; both parties read
-- ---------------------------------------------------------------------------
select pg_temp.expect_write('Beto cannot insert a request directly',
  format('insert into public.contact_requests (requester_id, owner_id, question_id, answer_id) values (%s, %s, %s, %s)',
    pg_temp.id_of('b'), pg_temp.id_of('a'), pg_temp.r('q_a'), pg_temp.r('ans_b')), 0);

select pg_temp.as_user('a');
select pg_temp.expect_text('Ana asks Beto for his contact', format('select public.request_contact(%s, ''70000001'')->>''status''', pg_temp.r('ans_b')), 'pending');
select pg_temp.expect_write('Ana cannot accept through the table',
  'update public.contact_requests set status = ''accepted'', answered_at = now()', 0);
select pg_temp.expect_select('Ana reads the request as requester', 'select id from public.contact_requests', 1);
select pg_temp.expect_select('nobody reads the phones table', 'select request_id from public.contact_phones', 0);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto reads the request as owner', 'select id from public.contact_requests', 1);
select pg_temp.expect_text('Beto accepts and sees Ana''s phone',
  'select public.respond_contact((select id from public.contact_requests limit 1), true, ''70000002'')->''other''->>''phone''', '70000001');
select pg_temp.expect_write('Beto cannot delete the request', 'delete from public.contact_requests', 0);

select pg_temp.as_user('a');
select pg_temp.expect_text('Ana sees Beto''s e-mail', format('select public.contact_json(%s)->''other''->>''email''', pg_temp.r('ans_b')), 'beto@test.local');

-- ---------------------------------------------------------------------------
-- notifications: the owner reads, marks read and deletes; no client inserts
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a');
select pg_temp.expect_write('Ana cannot insert a notification',
  format('insert into public.notifications (user_id, kind, ref_kind, ref_id) values (%s, ''fake'', ''question'', 1)',
    pg_temp.id_of('a')), 0);
-- Five rows, all written by triggers from Beto's fixtures: his answer, his comment, his «Me sirvió» on her letrero
-- and on her answer, and his acceptance of her contact request (0003 + 0008).
select pg_temp.expect_select('Ana reads only her notifications (five from triggers)', 'select id from public.notifications', 5);
select pg_temp.expect_write('Ana marks her notifications as read',
  'update public.notifications set read_at = now()', 5);
select pg_temp.expect_write('Ana cannot change a notification kind',
  'update public.notifications set kind = ''fake''', 0);
select pg_temp.expect_write('Ana cannot delete Beto''s notifications',
  format('delete from public.notifications where user_id = %s', pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana deletes her notifications', 'delete from public.notifications', 5);

select pg_temp.as_user('b');
select pg_temp.expect_select('Beto reads his notifications (five from triggers)', 'select id from public.notifications', 5);

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

-- Notifications from the two triggers. Ana's two questions are fixtures: she already has 3 open questions
-- with answers, the limit of 0007.
select pg_temp.as_postgres();
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
select pg_temp.expect_text('similar_questions: words every question has do not count', $q$select jsonb_array_length(public.similar_questions('donde venden pollo'))::text$q$, '0');
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
select pg_temp.expect_text('rate_answer on a closed question solves it (0006)', format('select public.rate_answer(%s, true)->>''questionStatus''', pg_temp.r('ans_one')), 'solved');

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
-- Threads and contact (0006, SPEC 12), with the people of the 0005 block
-- ---------------------------------------------------------------------------
-- Contact: only the asker asks, on others' answers; the phone is validated
select pg_temp.as_user('mz');
select pg_temp.expect_error('the answerer cannot ask for a contact', format('select public.request_contact(%s)', pg_temp.r('ans_z')), '42501');
select pg_temp.as_user('mx');
select pg_temp.expect_error('a bad phone is a validation error', format('select public.request_contact(%s, ''abc'')', pg_temp.r('ans_y')), '23514');
select pg_temp.expect_text('mx asks my for a contact', format('select public.request_contact(%s, ''+591 70000010'')->>''requestedByMe''', pg_temp.r('ans_y')), 'true');
select pg_temp.expect_text('asking again returns the same pending request', format('select public.request_contact(%s)->>''status''', pg_temp.r('ans_y')), 'pending');
select pg_temp.expect_error('only the person asked can answer', format('select public.respond_contact((public.contact_json(%s)->>''requestId'')::bigint, true)', pg_temp.r('ans_y')), '42501');
select pg_temp.expect_text('nothing is shown while pending', format('select public.contact_json(%s)->>''other'' is null', pg_temp.r('ans_y')), 'true');
select public.request_contact(pg_temp.r('ans_z'));

select pg_temp.as_user('mz');
select pg_temp.expect_text('mz says «Ahora no»', format('select public.respond_contact((public.contact_json(%s)->>''requestId'')::bigint, false)->>''status''', pg_temp.r('ans_z')), 'declined');
select pg_temp.as_user('mx');
select pg_temp.expect_error('after «Ahora no» the asker cannot ask again', format('select public.request_contact(%s)', pg_temp.r('ans_z')), '42501');

select pg_temp.as_user('my');
select pg_temp.expect_text('my sees the request in their answer', format('select public.get_question(%s)->''answers''->0->''contact''->>''requestedByMe''', pg_temp.r('q_old')), 'false');
select pg_temp.expect_text('my accepts and sees mx''s phone', format('select public.respond_contact((public.contact_json(%s)->>''requestId'')::bigint, true, ''70000020'')->''other''->>''phone''', pg_temp.r('ans_y')), '+591 70000010');
select pg_temp.expect_text('my sees mx''s e-mail', format('select public.contact_json(%s)->''other''->>''email''', pg_temp.r('ans_y')), 'x@test.local');
select pg_temp.as_user('mx');
select pg_temp.expect_text('mx sees my''s phone', format('select public.contact_json(%s)->''other''->>''phone''', pg_temp.r('ans_y')), '70000020');
select pg_temp.as_user('mw');
select pg_temp.expect_text('a third person sees no contact', format('select (select count(*) from jsonb_array_elements(public.get_question(%s)->''answers'') x where x->''contact'' <> ''null''::jsonb)::text', pg_temp.r('q_old')), '0');
select pg_temp.expect_error('a third person cannot read it directly either', format('select public.respond_contact((select id from public.contact_requests limit 1), true)'), 'P0002');
select pg_temp.as_anon();
select pg_temp.expect_text('a guest reads the question with no contact', format('select public.get_question(%s)->''answers''->0->>''contact''', pg_temp.r('q_old')), null);
select pg_temp.as_postgres();
select pg_temp.expect_text('the phone typed is saved in the profile', format('select phone from public.profiles where id = %s', pg_temp.id_of('mx')), '+591 70000010');

-- Threads: anyone with an account comments, even on a solved question; three reports hide a comment
select pg_temp.as_user('mw');
select pg_temp.expect_write('mw comments on a solved question',
  format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Yo también fui, buen dato'')', pg_temp.r('ans_y'), pg_temp.id_of('mw')), 1);
select pg_temp.expect_write('mw cannot comment as someone else',
  format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Falso'')', pg_temp.r('ans_y'), pg_temp.id_of('mx')), 0);
select pg_temp.as_postgres();
insert into test_rows (name, id) select 'comment_w', id from public.answer_comments where text = 'Yo también fui, buen dato';
select pg_temp.as_anon();
select pg_temp.expect_text('a guest reads the thread', format('select jsonb_array_length(public.get_question(%s)->''answers''->0->''comments'')::text', pg_temp.r('q_old')), '1');
select pg_temp.as_user('mx');
select public.report_content('comment', pg_temp.r('comment_w'), 'spam');
select pg_temp.expect_text('the reporter stops seeing the comment', format('select jsonb_array_length(public.get_question(%s)->''answers''->0->''comments'')::text', pg_temp.r('q_old')), '0');
select pg_temp.as_user('my');
select public.report_content('comment', pg_temp.r('comment_w'), 'offensive');
select pg_temp.as_user('mz');
select public.report_content('comment', pg_temp.r('comment_w'), 'other');
select pg_temp.as_anon();
select pg_temp.expect_text('three reports hide the comment for guests', format('select jsonb_array_length(public.get_question(%s)->''answers''->0->''comments'')::text', pg_temp.r('q_old')), '0');
select pg_temp.as_user('mw');
select pg_temp.expect_text('its author sees it in review', format('select public.get_question(%s)->''answers''->0->''comments''->0->>''inReview''', pg_temp.r('q_old')), 'true');
select pg_temp.expect_write('mw deletes their own comment', format('delete from public.answer_comments where id = %s', pg_temp.r('comment_w')), 1);

-- An answer goes away with its thread and its contact request
select pg_temp.as_user('mz');
select pg_temp.expect_write('mz answers q_empty', format('insert into public.answers (question_id, author_id, text) values (%s, %s, ''Respuesta que se borra'')', pg_temp.r('q_empty'), pg_temp.id_of('mz')), 1);
select pg_temp.as_postgres();
insert into test_rows (name, id) select 'ans_gone', id from public.answers where text = 'Respuesta que se borra';
select pg_temp.as_user('mw');
select pg_temp.expect_write('mw comments on it', format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Comentario que se va'')', pg_temp.r('ans_gone'), pg_temp.id_of('mw')), 1);
select pg_temp.as_user('mx');
select public.request_contact(pg_temp.r('ans_gone'));
select pg_temp.as_user('mz');
select pg_temp.expect_write('mz deletes the answer', format('delete from public.answers where id = %s', pg_temp.r('ans_gone')), 1);
select pg_temp.as_postgres();
select pg_temp.expect_select('its thread and contact request are gone',
  format('select 1 from public.answer_comments where answer_id = %s union all select 1 from public.contact_requests where answer_id = %s', pg_temp.r('ans_gone'), pg_temp.r('ans_gone')), 0);

-- ---------------------------------------------------------------------------
-- Limits and reward caps (0007, SPEC 13). Fresh people l1..l5 so the blocks above do not interfere.
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
insert into auth.users (id, aud, role, email)
select ('e0000000-0000-0000-0000-0000000000b' || g)::uuid, 'authenticated', 'authenticated', 'l' || g || '@test.local'
from generate_series(1, 5) g;
insert into public.profiles (auth_id, display_name, full_name, city, zone)
select ('e0000000-0000-0000-0000-0000000000b' || g)::uuid, 'Limite ' || g, 'Limite Prueba ' || g, 'Tarija', 'Centro'
from generate_series(1, 5) g;
insert into test_ids (name, id, auth_id)
select 'l' || right(p.auth_id::text, 1), p.id, p.auth_id from public.profiles p
where p.auth_id::text like 'e0000000-0000-0000-0000-0000000000b_';

-- Fails unless the statement raises BSLIM with that message, and returns the hint (when it frees).
create or replace function pg_temp.expect_limit(p_label text, p_sql text, p_reason text)
returns text language plpgsql as $$
declare v_state text; v_message text; v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_hint = pg_exception_hint;
    if v_state = 'BSLIM' and v_message = 'limit:' || p_reason then
      raise notice 'ok: %', p_label;
      return v_hint;
    end if;
    raise exception 'FAILED: % (expected BSLIM limit:%, got % %)', p_label, p_reason, v_state, v_message;
  end;
  raise exception 'FAILED: % (no error, expected limit:%)', p_label, p_reason;
end;
$$;

-- 10 questions per Bolivian day: l1 has 10 today, l2 has 10 from before today's Bolivian midnight
insert into public.questions (author_id, text, city, zone)
select pg_temp.id_of('l1'), 'Pregunta de hoy ' || g, 'Tarija', 'Centro' from generate_series(1, 10) g;
insert into public.questions (author_id, text, city, zone, created_at)
select pg_temp.id_of('l2'), 'Pregunta de ayer ' || g, 'Tarija', 'Centro', public.bolivia_day_start() - interval '1 minute'
from generate_series(1, 10) g;
select pg_temp.as_user('l1');
select pg_temp.expect_text('the 11th question of the day frees at the next Bolivian midnight',
  format('select pg_temp.expect_limit(''l1 cannot ask an 11th question today'', %L, ''questions_per_day'')',
    format('insert into public.questions (author_id, text, city, zone) values (%s, ''La número once'', ''Tarija'', ''Centro'')', pg_temp.id_of('l1'))),
  public.iso_utc(public.bolivia_next_midnight()));
select pg_temp.as_user('l2');
select pg_temp.expect_write('questions from before midnight in Bolivia do not count',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Primera de hoy'', ''Tarija'', ''Centro'')', pg_temp.id_of('l2')), 1);
select pg_temp.as_postgres();
select pg_temp.expect_write('the service role is not limited',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Del seed'', ''Tarija'', ''Centro'')', pg_temp.id_of('l1')), 1);

-- 3 open questions with answers: l3 has three, each answered by l4
insert into public.questions (author_id, text, city, zone)
select pg_temp.id_of('l3'), 'Abierta con respuesta ' || g, 'Tarija', 'Centro' from generate_series(1, 3) g;
insert into public.answers (question_id, author_id, text)
select q.id, pg_temp.id_of('l4'), 'Respuesta de l4' from public.questions q where q.text like 'Abierta con respuesta %';
insert into public.questions (author_id, text, city, zone)
values (pg_temp.id_of('l3'), 'Abierta sin respuestas', 'Tarija', 'Centro');
select pg_temp.as_user('l3');
select pg_temp.expect_text('open_questions has no until',
  format('select pg_temp.expect_limit(''l3 cannot ask with 3 open questions with answers'', %L, ''open_questions'')',
    format('insert into public.questions (author_id, text, city, zone) values (%s, ''La cuarta'', ''Tarija'', ''Centro'')', pg_temp.id_of('l3'))),
  '');
select pg_temp.as_postgres();
update public.questions set status = 'closed' where text = 'Abierta con respuesta 1';
select pg_temp.as_user('l3');
select pg_temp.expect_write('after closing one, l3 asks again',
  format('insert into public.questions (author_id, text, city, zone) values (%s, ''Ahora sí la cuarta'', ''Tarija'', ''Centro'')', pg_temp.id_of('l3')), 1);

-- 30 comments in the last hour: l4 has 30 in the window, l5 has 30 just outside it
select pg_temp.as_postgres();
insert into test_rows (name, id) select 'ans_comments', min(id) from public.answers where text = 'Respuesta de l4';
insert into public.answer_comments (answer_id, author_id, text, created_at)
select pg_temp.r('ans_comments'), pg_temp.id_of('l4'), 'Comentario ' || g, now() - ((60 - g) || ' minutes')::interval
from generate_series(1, 30) g;
insert into public.answer_comments (answer_id, author_id, text, created_at)
select pg_temp.r('ans_comments'), pg_temp.id_of('l5'), 'Viejo ' || g, now() - interval '61 minutes' from generate_series(1, 30) g;
select pg_temp.as_user('l4');
select pg_temp.expect_text('the 31st comment frees when the oldest one leaves the hour',
  format('select pg_temp.expect_limit(''l4 cannot write a 31st comment in an hour'', %L, ''comments_per_hour'')',
    format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Uno más'')', pg_temp.r('ans_comments'), pg_temp.id_of('l4'))),
  public.iso_utc(now() - interval '59 minutes' + interval '1 hour'));
select pg_temp.as_user('l5');
select pg_temp.expect_write('comments older than an hour do not count',
  format('insert into public.answer_comments (answer_id, author_id, text) values (%s, %s, ''Nuevo'')', pg_temp.r('ans_comments'), pg_temp.id_of('l5')), 1);

-- Reward caps
select pg_temp.as_postgres();
insert into public.rewards (profile_id, memo_key, amount, reason)
select pg_temp.id_of('l1'), 'letrero:9000' || g, 1, 'letrero' from generate_series(1, 10) g;
select pg_temp.expect_text('the 11th rewarded letrero today is capped',
  format('select public.reward_cap(''letrero'', %s, null, ''letrero:900011'', 900011)', pg_temp.id_of('l1')), 'signs_per_day');
select pg_temp.expect_text('a letrero memo that already exists is never capped',
  format('select public.reward_cap(''letrero'', %s, null, ''letrero:90001'', 90001)', pg_temp.id_of('l1')), null);
update public.rewards set created_at = public.bolivia_day_start() - interval '1 minute' where memo_key like 'letrero:9000%';
select pg_temp.expect_text('letreros from before midnight in Bolivia do not count',
  format('select public.reward_cap(''letrero'', %s, null, ''letrero:900011'', 900011)', pg_temp.id_of('l1')), null);

-- 3 rewarded «Me sirvió» per question: l2 asks, l1, l3, l4 and l5 answer, l2 marks all four in order
insert into public.questions (author_id, text, city, zone) values (pg_temp.id_of('l2'), 'Cuatro respuestas útiles', 'Tarija', 'Centro');
insert into test_rows (name, id) select 'q_four', id from public.questions where text = 'Cuatro respuestas útiles';
insert into public.answers (question_id, author_id, text)
select pg_temp.r('q_four'), pg_temp.id_of(n), 'Útil de ' || n from unnest(array['l1', 'l3', 'l4', 'l5']) n;
insert into test_rows (name, id) select 'ans_' || right(text, 2), id from public.answers where question_id = pg_temp.r('q_four');
insert into public.ratings (answer_id, rater_id, helpful)
select pg_temp.r('ans_' || n), pg_temp.id_of('l2'), true from unnest(array['l1', 'l3', 'l4', 'l5']) with ordinality as t(n, i) order by i;
select pg_temp.expect_text('the 3rd helpful rating of a question still pays',
  format('select public.reward_cap(''ayuda'', %s, %s, ''ayuda:%s'', %s)', pg_temp.id_of('l4'), pg_temp.id_of('l2'), pg_temp.r('ans_l4'), pg_temp.r('ans_l4')), null);
select pg_temp.expect_text('the 4th helpful rating of a question is capped',
  format('select public.reward_cap(''ayuda'', %s, %s, ''ayuda:%s'', %s)', pg_temp.id_of('l5'), pg_temp.id_of('l2'), pg_temp.r('ans_l5'), pg_temp.r('ans_l5')), 'answers_per_question');

-- 3 rewards per day between the same two people (letrero votes and «Me sirvió» count, others do not)
insert into public.rewards (profile_id, memo_key, amount, reason, source_id)
select pg_temp.id_of('l3'), 'sirvio-l:8000' || g || '-1', 1, 'sirvio-l', pg_temp.id_of('l1') from generate_series(1, 3) g;
select pg_temp.expect_text('a 4th reward from l1 to l3 today is capped',
  format('select public.reward_cap(''sirvio-l'', %s, %s, ''sirvio-l:80009-1'', 80009)', pg_temp.id_of('l3'), pg_temp.id_of('l1')), 'pair_per_day');
select pg_temp.expect_text('another pair is not capped',
  format('select public.reward_cap(''sirvio-l'', %s, %s, ''sirvio-l:80009-2'', 80009)', pg_temp.id_of('l3'), pg_temp.id_of('l2')), null);
select pg_temp.expect_text('a pair reward that already exists is never capped',
  format('select public.reward_cap(''sirvio-l'', %s, %s, ''sirvio-l:80001-1'', 80001)', pg_temp.id_of('l3'), pg_temp.id_of('l1')), null);

-- my_reward_cap: the caller's view, the same rule; reward_cap itself is service-role only
select pg_temp.as_user('l2');
select pg_temp.expect_text('my_reward_cap tells l2 their 4th «Me sirvió» did not pay',
  format('select public.my_reward_cap(''ayuda'', %s)', pg_temp.r('ans_l5')), 'answers_per_question');
select pg_temp.expect_text('my_reward_cap is null for a reward l2 cannot claim',
  format('select public.my_reward_cap(''letrero'', %s)', pg_temp.r('sign_a')), null);
select pg_temp.expect_error('a browser cannot call reward_cap directly',
  format('select public.reward_cap(''letrero'', %s, null, ''letrero:1'', 1)', pg_temp.id_of('l2')), '42501');
select pg_temp.as_anon();
select pg_temp.expect_error('a guest cannot call my_reward_cap', 'select public.my_reward_cap(''letrero'', 1)', '42501');

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

-- ---------------------------------------------------------------------------
-- Push notifications (0008, SPEC 15). Fresh people n1..n6 in Oruro so the blocks above do not interfere.
-- The events are written as postgres: these checks are about who the triggers notify, not about RLS.
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
insert into auth.users (id, aud, role, email)
select ('f0000000-0000-0000-0000-0000000000c' || g)::uuid, 'authenticated', 'authenticated', 'n' || g || '@test.local'
from generate_series(1, 6) g;
insert into public.profiles (auth_id, display_name, full_name, city, zone, notif_prefs)
select ('f0000000-0000-0000-0000-0000000000c' || g)::uuid, 'Aviso ' || g, 'Aviso Prueba ' || g, 'Oruro',
  case g when 5 then ' CÉNTRO ' else 'Centro' end,
  case g when 6 then '{"urgent": false}'::jsonb else '{}'::jsonb end
from generate_series(1, 6) g;
insert into test_ids (name, id, auth_id)
select 'n' || right(p.auth_id::text, 1), p.id, p.auth_id from public.profiles p
where p.auth_id::text like 'f0000000-0000-0000-0000-0000000000c_';

-- How many notifications of a kind a person has, optionally caused by someone
create or replace function pg_temp.notes(p_person text, p_kind text, p_actor text default null) returns bigint
language sql as $$
  select count(*) from public.notifications
  where user_id = pg_temp.id_of(p_person) and kind = p_kind
    and (p_actor is null or actor_id = pg_temp.id_of(p_actor));
$$;

-- A new answer notifies the asker, with who answered
insert into public.questions (author_id, text, city, zone) values (pg_temp.id_of('n1'), 'Pregunta con avisos', 'Oruro', 'Centro');
insert into test_rows (name, id) select 'q_n1', id from public.questions where text = 'Pregunta con avisos';
insert into public.answers (question_id, author_id, text) values (pg_temp.r('q_n1'), pg_temp.id_of('n2'), 'Respuesta de n2');
insert into test_rows (name, id) select 'ans_n2', id from public.answers where text = 'Respuesta de n2';
select pg_temp.expect_text('n1 gets an answer notification from n2', 'select pg_temp.notes(''n1'', ''answer'', ''n2'')::text', '1');
select pg_temp.expect_text('n2 is not notified of their own answer', 'select pg_temp.notes(''n2'', ''answer'')::text', '0');

-- Comments: the answer's author, the asker and the earlier commenters; never the one who comments
insert into public.answer_comments (answer_id, author_id, text) values (pg_temp.r('ans_n2'), pg_temp.id_of('n2'), 'Comentario de n2');
select pg_temp.expect_text('n2''s comment notifies the asker n1', 'select pg_temp.notes(''n1'', ''comment'', ''n2'')::text', '1');
select pg_temp.expect_text('n2 is not notified of their own comment', 'select pg_temp.notes(''n2'', ''comment'')::text', '0');
insert into public.answer_comments (answer_id, author_id, text) values (pg_temp.r('ans_n2'), pg_temp.id_of('n3'), 'Comentario de n3');
select pg_temp.expect_text('n3''s comment notifies n1 (asker)', 'select pg_temp.notes(''n1'', ''comment'', ''n3'')::text', '1');
select pg_temp.expect_text('n3''s comment notifies n2 (answer author)', 'select pg_temp.notes(''n2'', ''comment'', ''n3'')::text', '1');
insert into public.answer_comments (answer_id, author_id, text) values (pg_temp.r('ans_n2'), pg_temp.id_of('n1'), 'Comentario de n1');
select pg_temp.expect_text('n1''s comment notifies n3, who commented before', 'select pg_temp.notes(''n3'', ''comment'', ''n1'')::text', '1');
select pg_temp.expect_text('n1 is not notified of their own comment', 'select pg_temp.notes(''n1'', ''comment'', ''n1'')::text', '0');
select pg_temp.expect_text('n4 never took part in the thread', 'select pg_temp.notes(''n4'', ''comment'')::text', '0');

-- «Me sirvió» on a letrero: a helpful vote, not a «No me sirvió»; a change to helpful notifies too
insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone)
values (pg_temp.id_of('n1'), 'Letrero con avisos', 'p', 't', 'Oruro', 'Centro');
insert into test_rows (name, id) select 'sign_n1', id from public.signs where title = 'Letrero con avisos';
insert into public.sign_votes (sign_id, voter_id, helpful) values (pg_temp.r('sign_n1'), pg_temp.id_of('n2'), true);
insert into public.sign_votes (sign_id, voter_id, helpful) values (pg_temp.r('sign_n1'), pg_temp.id_of('n3'), false);
select pg_temp.expect_text('only the helpful vote notifies the letrero''s author', 'select pg_temp.notes(''n1'', ''sign_helpful'')::text', '1');
update public.sign_votes set helpful = true where sign_id = pg_temp.r('sign_n1') and voter_id = pg_temp.id_of('n3');
select pg_temp.expect_text('a vote changed to helpful notifies', 'select pg_temp.notes(''n1'', ''sign_helpful'', ''n3'')::text', '1');

-- «Pedir contacto»: the request to who answered, the acceptance back; «Ahora no» is silent
insert into public.contact_requests (requester_id, owner_id, question_id, answer_id) values (pg_temp.id_of('n1'), pg_temp.id_of('n2'), pg_temp.r('q_n1'), pg_temp.r('ans_n2'));
insert into test_rows (name, id) select 'cr_n1', max(id) from public.contact_requests where requester_id = pg_temp.id_of('n1');
select pg_temp.expect_text('the contact request notifies the owner', 'select pg_temp.notes(''n2'', ''contact_request'', ''n1'')::text', '1');
update public.contact_requests set status = 'accepted', answered_at = now() where id = pg_temp.r('cr_n1');
select pg_temp.expect_text('accepting notifies the requester', 'select pg_temp.notes(''n1'', ''contact_accepted'', ''n2'')::text', '1');
insert into public.contact_requests (requester_id, owner_id, question_id, answer_id) values (pg_temp.id_of('n3'), pg_temp.id_of('n2'), pg_temp.r('q_n1'), pg_temp.r('ans_n2'));
update public.contact_requests set status = 'declined', answered_at = now()
where requester_id = pg_temp.id_of('n3') and owner_id = pg_temp.id_of('n2');
select pg_temp.expect_text('declining notifies nobody', 'select pg_temp.notes(''n3'', ''contact_accepted'')::text', '0');

-- Urgent: same city and zone (normalized), the notice on, never the author, at most 3 per hour each
insert into public.questions (author_id, text, city, zone) values
  (pg_temp.id_of('n1'), 'Urgente 1', 'Oruro', 'Centro'),
  (pg_temp.id_of('n2'), 'Urgente 2', 'Oruro', 'Centro'),
  (pg_temp.id_of('n4'), 'Urgente 3', 'Oruro', 'Centro'),
  (pg_temp.id_of('n1'), 'Urgente 4', 'Oruro', 'Centro'),
  (pg_temp.id_of('n1'), 'Urgente en otra zona', 'Oruro', 'Zona sin vecinos');
update public.questions set urgent_until = now() + interval '24 hours' where text = 'Urgente 1';
select pg_temp.expect_text('an urgent question reaches a neighbor of the zone', 'select pg_temp.notes(''n3'', ''urgent'', ''n1'')::text', '1');
select pg_temp.expect_text('the zone matches without accents or case', 'select pg_temp.notes(''n5'', ''urgent'', ''n1'')::text', '1');
select pg_temp.expect_text('whoever turned urgent off gets no row', 'select pg_temp.notes(''n6'', ''urgent'')::text', '0');
select pg_temp.expect_text('the author is not notified', 'select pg_temp.notes(''n1'', ''urgent'')::text', '0');
update public.questions set urgent_until = now() + interval '23 hours' where text = 'Urgente 1';
select pg_temp.expect_text('moving an active urgent_until does not notify again', 'select pg_temp.notes(''n3'', ''urgent'')::text', '1');
update public.questions set urgent_until = now() + interval '24 hours' where text in ('Urgente 2', 'Urgente 3');
select pg_temp.expect_text('n3 got 3 urgent in the hour', 'select pg_temp.notes(''n3'', ''urgent'')::text', '3');
update public.questions set urgent_until = now() + interval '24 hours' where text = 'Urgente 4';
select pg_temp.expect_text('a 4th urgent in the hour does not reach n3', 'select pg_temp.notes(''n3'', ''urgent'')::text', '3');
select pg_temp.expect_text('n2 had 2 in the hour (not their own), so the 4th reaches them', 'select pg_temp.notes(''n2'', ''urgent'')::text', '3');
update public.questions set urgent_until = now() + interval '24 hours' where text = 'Urgente en otra zona';
select pg_temp.expect_text('another zone is not notified', 'select count(*)::text from public.notifications n join public.questions q on q.id = n.ref_id
  where n.kind = ''urgent'' and q.text = ''Urgente en otra zona''', '0');

-- push_details: what /api/push writes; the quoted text, where a tap opens, and gone or hidden items
select pg_temp.expect_text('push_details of an answer quotes the answer and opens the question',
  format('select (d->>''text'') || '' '' || (d->>''url'') || '' '' || (d->>''actor'') from (select public.push_details(id) d from public.notifications
          where user_id = %s and kind = ''answer'') x', pg_temp.id_of('n1')),
  format('Respuesta de n2 /p/%s Aviso 2', pg_temp.r('q_n1')));
select pg_temp.expect_text('push_details of an urgent question has its zone',
  format('select d->>''zone'' from (select public.push_details(id) d from public.notifications where user_id = %s and kind = ''urgent'' limit 1) x', pg_temp.id_of('n3')),
  'Centro');
select pg_temp.expect_text('the second «Me sirvió» on a letrero is not pushed within the hour',
  format('select (public.push_details(max(id))->>''signPushedRecently'') from public.notifications where user_id = %s and kind = ''sign_helpful''', pg_temp.id_of('n1')),
  'false');
update public.notifications set pushed_at = now()
where id = (select min(id) from public.notifications where user_id = pg_temp.id_of('n1') and kind = 'sign_helpful');
select pg_temp.expect_text('… once the first one was pushed, the next says so',
  format('select (public.push_details(max(id))->>''signPushedRecently'') from public.notifications where user_id = %s and kind = ''sign_helpful''', pg_temp.id_of('n1')),
  'true');
insert into public.hidden_items (user_id, kind, target_id) values (pg_temp.id_of('n1'), 'answer', pg_temp.r('ans_n2'));
select pg_temp.expect_text('an answer the recipient hid is not pushed',
  format('select public.push_details(id)->>''visible'' from public.notifications where user_id = %s and kind = ''answer''', pg_temp.id_of('n1')),
  'false');
select pg_temp.as_user('n1');
select pg_temp.expect_error('a browser cannot call push_details', 'select public.push_details(1)', '42501');
select pg_temp.as_postgres();

-- Nobody can call notify() or write notifications from the browser
select pg_temp.as_user('n1');
select pg_temp.expect_error('a browser cannot call notify()',
  format('select public.notify(%s, ''answer'', ''question'', 1, null)', pg_temp.id_of('n2')), '42501');

-- Subscriptions: saved for the caller; the same endpoint moves to whoever signs in on that phone
select pg_temp.expect_write('n1 saves a subscription', 'select public.save_push_subscription(''https://push.example/phone-1'', ''key'', ''auth'')', 1);
select pg_temp.expect_select('n1 reads their subscription', 'select id from public.push_subscriptions', 1);
select pg_temp.expect_error('an endpoint must be https', 'select public.save_push_subscription(''http://push.example/x'', ''key'', ''auth'')', '23514');
select pg_temp.as_user('n2');
select pg_temp.expect_select('n2 cannot read n1''s subscription', 'select id from public.push_subscriptions', 0);
select pg_temp.expect_write('n2 signs in on the same phone', 'select public.save_push_subscription(''https://push.example/phone-1'', ''key2'', ''auth2'')', 1);
select pg_temp.expect_select('the endpoint now belongs to n2', 'select id from public.push_subscriptions', 1);
select pg_temp.as_user('n1');
select pg_temp.expect_select('n1 no longer has it', 'select id from public.push_subscriptions', 0);
select pg_temp.expect_write('n1 cannot delete n2''s subscription', 'select public.delete_push_subscription(''https://push.example/phone-1'')', 1);
select pg_temp.as_user('n2');
select pg_temp.expect_select('n2 still has it', 'select id from public.push_subscriptions', 1);
select pg_temp.expect_write('n2 signs out and deletes it', 'select public.delete_push_subscription(''https://push.example/phone-1'')', 1);
select pg_temp.expect_select('the phone has no subscription', 'select id from public.push_subscriptions', 0);
select pg_temp.as_anon();
select pg_temp.expect_error('a guest cannot save a subscription', 'select public.save_push_subscription(''https://push.example/x'', ''k'', ''a'')', '42501');

-- ---------------------------------------------------------------------------
-- 24 h reminder and resend of lost pushes (0009, SPEC 18). Same people n1..n6.
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
-- Earlier rows (and the seed) must not count in the resend checks
update public.notifications set pushed_at = now() where pushed_at is null;

-- A question of `p_author`, answered by `p_answerer` `p_age` ago (none when p_answerer is null), in `p_status`
create or replace function pg_temp.asked(p_name text, p_author text, p_answerer text, p_age interval, p_status text default 'open')
returns void language plpgsql as $$
declare q bigint;
begin
  insert into public.questions (author_id, text, city, zone) values (pg_temp.id_of(p_author), 'Recordatorio ' || p_name, 'Oruro', 'Centro')
  returning id into q;
  insert into test_rows (name, id) values (p_name, q);
  if p_answerer is not null then
    insert into public.answers (question_id, author_id, text, created_at)
    values (q, pg_temp.id_of(p_answerer), 'Respuesta ' || p_name, now() - p_age);
  end if;
  update public.questions set status = p_status where id = q;
end;
$$;

-- How many reminders a question has
create or replace function pg_temp.reminders(p_name text) returns bigint
language sql as $$
  select count(*) from public.notifications where kind = 'reminder' and ref_id = pg_temp.r(p_name);
$$;

select pg_temp.asked('rem_25h', 'n3', 'n1', interval '25 hours');
select pg_temp.asked('rem_23h', 'n3', 'n1', interval '23 hours');
select pg_temp.asked('rem_49h', 'n5', 'n1', interval '49 hours');
select pg_temp.asked('rem_solved', 'n5', 'n2', interval '25 hours', 'solved');
select pg_temp.asked('rem_closed', 'n6', 'n2', interval '25 hours', 'closed');
select pg_temp.asked('rem_none', 'n6', null, null);
update public.profiles set notif_prefs = '{"answers": false}'::jsonb where id = pg_temp.id_of('n4');
select pg_temp.asked('rem_prefs_off', 'n4', 'n2', interval '30 hours');
-- A later answer does not move «the first answer»
insert into public.answers (question_id, author_id, text) values (pg_temp.r('rem_25h'), pg_temp.id_of('n2'), 'Respuesta nueva');

select pg_temp.expect_text('the first run queues the reminders', 'select (public.queue_answer_reminders() >= 2)::text', 'true');
select pg_temp.expect_text('an open question answered 25 h ago gets one reminder', 'select pg_temp.reminders(''rem_25h'')::text', '1');
select pg_temp.expect_text('… for its author, about the question, caused by nobody',
  format('select (user_id = %s and ref_kind = ''question'' and actor_id is null)::text from public.notifications
          where kind = ''reminder'' and ref_id = %s', pg_temp.id_of('n3'), pg_temp.r('rem_25h')), 'true');
select pg_temp.expect_text('a second run queues nothing', 'select public.queue_answer_reminders()::text', '0');
select pg_temp.expect_error('a second reminder for the same question is refused',
  format('insert into public.notifications (user_id, kind, ref_kind, ref_id) values (%s, ''reminder'', ''question'', %s)',
    pg_temp.id_of('n3'), pg_temp.r('rem_25h')), '23505');
select pg_temp.expect_text('no reminder 23 h after the first answer', 'select pg_temp.reminders(''rem_23h'')::text', '0');
select pg_temp.expect_text('no reminder 49 h after the first answer', 'select pg_temp.reminders(''rem_49h'')::text', '0');
select pg_temp.expect_text('no reminder for a solved question', 'select pg_temp.reminders(''rem_solved'')::text', '0');
select pg_temp.expect_text('no reminder for a closed question', 'select pg_temp.reminders(''rem_closed'')::text', '0');
select pg_temp.expect_text('no reminder without answers', 'select pg_temp.reminders(''rem_none'')::text', '0');
select pg_temp.expect_text('with «Respuestas» off the row is still saved (only the push is skipped)', 'select pg_temp.reminders(''rem_prefs_off'')::text', '1');

-- push_details of a reminder: the question, and not pushed if its author hid it
select pg_temp.expect_text('push_details of a reminder quotes the question and opens it',
  format('select (d->>''kind'') || '' '' || (d->>''text'') || '' '' || (d->>''url'') || '' '' || (d->>''visible'')
          from (select public.push_details(id) d from public.notifications where kind = ''reminder'' and ref_id = %s) x', pg_temp.r('rem_25h')),
  format('reminder Recordatorio rem_25h /p/%s true', pg_temp.r('rem_25h')));
insert into public.hidden_items (user_id, kind, target_id) values (pg_temp.id_of('n3'), 'question', pg_temp.r('rem_25h'));
select pg_temp.expect_text('a question its author hid is not pushed',
  format('select public.push_details(id)->>''visible'' from public.notifications where kind = ''reminder'' and ref_id = %s', pg_temp.r('rem_25h')),
  'false');

-- Resend: only rows /api/push never processed, 5 to 65 minutes old
update public.notifications set pushed_at = now() where pushed_at is null;
insert into public.notifications (user_id, kind, ref_kind, ref_id, created_at, pushed_at) values
  (pg_temp.id_of('n6'), 'answer', 'question', pg_temp.r('rem_none'), now() - interval '10 minutes', null),
  (pg_temp.id_of('n6'), 'answer', 'question', pg_temp.r('rem_none'), now() - interval '2 minutes', null),
  (pg_temp.id_of('n6'), 'answer', 'question', pg_temp.r('rem_none'), now() - interval '2 hours', null),
  (pg_temp.id_of('n6'), 'answer', 'question', pg_temp.r('rem_none'), now() - interval '10 minutes', now());
select pg_temp.expect_text('the resend asks again only for the 10-minute-old row without pushed_at',
  'select public.resend_pending_pushes()::text', '1');
select pg_temp.expect_text('run_hourly_push_jobs reports both counts',
  'select (d->>''reminders'') || '' '' || (d->>''resent'') from (select public.run_hourly_push_jobs() d) x', '0 1');

-- Only the database runs these
select pg_temp.as_user('n1');
select pg_temp.expect_error('a browser cannot call request_push', 'select public.request_push(1)', '42501');
select pg_temp.expect_error('a browser cannot queue reminders', 'select public.queue_answer_reminders()', '42501');
select pg_temp.expect_error('a browser cannot resend pushes', 'select public.resend_pending_pushes()', '42501');
select pg_temp.expect_error('a browser cannot run the hourly job', 'select public.run_hourly_push_jobs()', '42501');
select pg_temp.as_anon();
select pg_temp.expect_error('a guest cannot run the hourly job', 'select public.run_hourly_push_jobs()', '42501');

-- ---------------------------------------------------------------------------
-- Avisos (0010, SPEC 22): my notices built and grouped, unread count, marking read. Same people n1..n6.
-- ---------------------------------------------------------------------------
select pg_temp.as_postgres();
delete from public.notifications where user_id in (pg_temp.id_of('n1'), pg_temp.id_of('n2'), pg_temp.id_of('n5'));

insert into public.signs (author_id, title, photo_url, photo_thumb_url, city, zone)
values (pg_temp.id_of('n1'), 'Letrero de avisos', 'p', 't', 'Oruro', 'Centro');
insert into test_rows (name, id) select 'av_sign', id from public.signs where title = 'Letrero de avisos';
insert into public.questions (author_id, text, city, zone) values
  (pg_temp.id_of('n3'), 'Avisos oculta', 'Oruro', 'Centro'),
  (pg_temp.id_of('n3'), 'Avisos en revisión', 'Oruro', 'Centro'),
  (pg_temp.id_of('n1'), 'Avisos mía en revisión', 'Oruro', 'Centro');
insert into test_rows (name, id)
select 'av_hidden', id from public.questions where text = 'Avisos oculta'
union all select 'av_review', id from public.questions where text = 'Avisos en revisión'
union all select 'av_mine_review', id from public.questions where text = 'Avisos mía en revisión';
insert into public.hidden_items (user_id, kind, target_id) values (pg_temp.id_of('n1'), 'question', pg_temp.r('av_hidden'));
insert into public.reports (reporter_id, kind, target_id, reason)
select pg_temp.id_of(p), 'question', q, 'spam'
from unnest(array['n2', 'n4', 'n5']) p, unnest(array[pg_temp.r('av_review'), pg_temp.r('av_mine_review')]) q;

-- Three «Me sirvió» on n1's letrero (one notice), a reminder on a gone question, and three urgent ones
insert into public.notifications (user_id, kind, ref_kind, ref_id, actor_id, created_at, pushed_at) values
  (pg_temp.id_of('n1'), 'sign_helpful', 'sign', pg_temp.r('av_sign'), pg_temp.id_of('n2'), now() - interval '3 hours', now()),
  (pg_temp.id_of('n1'), 'sign_helpful', 'sign', pg_temp.r('av_sign'), pg_temp.id_of('n3'), now() - interval '2 hours', now()),
  (pg_temp.id_of('n1'), 'sign_helpful', 'sign', pg_temp.r('av_sign'), pg_temp.id_of('n4'), now() - interval '1 hour', now()),
  (pg_temp.id_of('n1'), 'urgent', 'question', -1, pg_temp.id_of('n3'), now() - interval '4 hours', now()),
  (pg_temp.id_of('n1'), 'urgent', 'question', pg_temp.r('av_hidden'), pg_temp.id_of('n3'), now() - interval '5 hours', now()),
  (pg_temp.id_of('n1'), 'urgent', 'question', pg_temp.r('av_review'), pg_temp.id_of('n3'), now() - interval '6 hours', now()),
  (pg_temp.id_of('n1'), 'urgent', 'question', pg_temp.r('av_mine_review'), pg_temp.id_of('n3'), now() - interval '7 hours', now()),
  (pg_temp.id_of('n2'), 'urgent', 'question', pg_temp.r('av_review'), pg_temp.id_of('n3'), now(), now());

select pg_temp.as_user('n1');
select pg_temp.expect_text('my_notifications returns only my notices (3 «Me sirvió» are one)',
  'select jsonb_array_length(public.my_notifications()->''items'')::text', '5');
select pg_temp.expect_text('the group: newest actor, count 3, unread, opens the letrero',
  'select (i->>''actor'') || '' '' || (i->>''count'') || '' '' || (i->>''read'') || '' '' || (i->''open''->>''kind'') || '' '' || (i->>''text'')
   from jsonb_array_elements(public.my_notifications()->''items'') i where i->>''kind'' = ''sign_helpful''',
  (select display_name from public.profiles_public where id = pg_temp.id_of('n4')) || ' 3 false sign Letrero de avisos');
select pg_temp.expect_text('newest first: the group leads the list',
  'select public.my_notifications()->''items''->0->>''kind''', 'sign_helpful');
select pg_temp.expect_text('a gone, a hidden and an in-review question have no open and no text',
  'select count(*)::text from jsonb_array_elements(public.my_notifications()->''items'') i
   where i->>''kind'' = ''urgent'' and i->''open'' = ''null''::jsonb and i->''text'' = ''null''::jsonb', '3');
select pg_temp.expect_text('my own question in review still opens for me, with its zone',
  format('select (i->''open''->>''id'') || '' '' || (i->>''zone'') from jsonb_array_elements(public.my_notifications()->''items'') i
          where i->''open''->>''id'' = ''%s''', pg_temp.r('av_mine_review')),
  pg_temp.r('av_mine_review') || ' Centro');
select pg_temp.expect_text('the unread count counts the group once', 'select public.my_unread_notices()::text', '5');
select pg_temp.expect_text('nextOffset is null on the only page', 'select coalesce(public.my_notifications()->>''nextOffset'', ''null'')', 'null');

-- Marking read: the group at once; someone else's id changes nothing
select public.mark_notice_read((public.my_notifications()->'items'->0->>'id')::bigint);
select pg_temp.as_postgres();
select pg_temp.expect_text('marking the group marks its three rows',
  format('select count(*)::text from public.notifications where user_id = %s and kind = ''sign_helpful'' and read_at is not null', pg_temp.id_of('n1')), '3');
select pg_temp.as_user('n1');
select pg_temp.expect_text('… and the count goes down by one', 'select public.my_unread_notices()::text', '4');
select public.mark_notice_read((select id from public.notifications where user_id = pg_temp.id_of('n2') limit 1));
select pg_temp.as_postgres();
select pg_temp.expect_text('n1 cannot mark n2''s notice',
  format('select count(*)::text from public.notifications where user_id = %s and read_at is null', pg_temp.id_of('n2')), '1');
select pg_temp.as_user('n1');
select public.mark_all_notices_read();
select pg_temp.expect_text('mark_all_notices_read leaves 0 unread', 'select public.my_unread_notices()::text', '0');
select pg_temp.expect_text('… and every notice read',
  'select count(*)::text from jsonb_array_elements(public.my_notifications()->''items'') i where (i->>''read'')::boolean', '5');

-- Contact: the request carries the pending state; the acceptance carries the contact
select pg_temp.as_postgres();
insert into public.questions (author_id, text, city, zone) values (pg_temp.id_of('n1'), 'Avisos contacto', 'Oruro', 'Centro');
insert into test_rows (name, id) select 'av_cq', id from public.questions where text = 'Avisos contacto';
insert into public.answers (question_id, author_id, text) values (pg_temp.r('av_cq'), pg_temp.id_of('n2'), 'Respuesta de avisos');
insert into test_rows (name, id) select 'av_ca', id from public.answers where text = 'Respuesta de avisos';
select pg_temp.as_user('n1');
select public.request_contact(pg_temp.r('av_ca'), '70000011');
select pg_temp.as_user('n2');
select pg_temp.expect_text('the contact_request notice carries status pending and opens the question',
  'select (i->''contact''->>''status'') || '' '' || (i->''open''->>''kind'') || '' '' || (i->>''text'')
   from jsonb_array_elements(public.my_notifications()->''items'') i where i->>''kind'' = ''contact_request''',
  'pending question Avisos contacto');
select public.respond_contact((select id from public.contact_requests where answer_id = pg_temp.r('av_ca')), true, '70000022');
select pg_temp.expect_text('… and accepted once answered',
  'select i->''contact''->>''status'' from jsonb_array_elements(public.my_notifications()->''items'') i where i->>''kind'' = ''contact_request''',
  'accepted');
select pg_temp.as_user('n1');
select pg_temp.expect_text('the requester''s contact_accepted notice carries the other''s phone',
  'select (i->''contact''->>''status'') || '' '' || (i->''contact''->''other''->>''phone'')
   from jsonb_array_elements(public.my_notifications()->''items'') i where i->>''kind'' = ''contact_accepted''',
  'accepted 70000022');

-- Pages of 30 over notices, without repeating
select pg_temp.as_postgres();
insert into public.notifications (user_id, kind, ref_kind, ref_id, actor_id, created_at, pushed_at)
select pg_temp.id_of('n5'), 'urgent', 'question', pg_temp.r('av_review'), pg_temp.id_of('n3'), now() - make_interval(mins => g), now()
from generate_series(1, 35) g;
select pg_temp.as_user('n5');
select pg_temp.expect_text('page 1 has 30 and points to 30',
  'select jsonb_array_length(p->''items'') || '' '' || (p->>''nextOffset'') from (select public.my_notifications() p) x', '30 30');
select pg_temp.expect_text('page 2 has the other 5 and no next page',
  'select jsonb_array_length(p->''items'') || '' '' || coalesce(p->>''nextOffset'', ''null'') from (select public.my_notifications(30) p) x', '5 null');
select pg_temp.expect_text('no notice repeats between pages',
  'select count(distinct i->>''id'')::text from (
     select jsonb_array_elements(public.my_notifications()->''items'') i
     union all select jsonb_array_elements(public.my_notifications(30)->''items'')) x', '35');

-- Only signed-in people, and Realtime carries notifications
select pg_temp.as_anon();
select pg_temp.expect_error('a guest cannot list notices', 'select public.my_notifications()', '42501');
select pg_temp.expect_error('a guest cannot count notices', 'select public.my_unread_notices()', '42501');
select pg_temp.expect_error('a guest cannot mark a notice', 'select public.mark_notice_read(1)', '42501');
select pg_temp.expect_error('a guest cannot mark all', 'select public.mark_all_notices_read()', '42501');
select pg_temp.as_user('n1');
select pg_temp.expect_error('a browser cannot call notice_item', 'select public.notice_item(n) from public.notifications n limit 1', '42501');
select pg_temp.as_postgres();
select pg_temp.expect_text('notifications is in the supabase_realtime publication',
  'select count(*)::text from pg_publication_tables where pubname = ''supabase_realtime'' and schemaname = ''public'' and tablename = ''notifications''', '1');

select pg_temp.as_postgres();
do $$ begin raise notice 'rls ok'; end $$;

rollback;
