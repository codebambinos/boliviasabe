-- supabase/tests/rls.sql
-- RLS checks for the local database (SPEC 03). Run it against `supabase start`:
--   docker exec -i supabase_db_BoliviaSabe psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
-- Everything runs inside one transaction that is rolled back at the end.
-- Step 3 covers profiles and profiles_public. Step 4 extends it to every table.

\set ON_ERROR_STOP on
begin;

-- Test users (as the table owner, bypassing RLS).
insert into auth.users (id, aud, role, email)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@test.local'),
  ('b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'beto@test.local');

create temp table test_ids (name text primary key, id bigint, auth_id uuid);
grant select on test_ids to public;

insert into public.profiles (auth_id, display_name, full_name, city, zone, phone, notif_prefs)
values
  ('a0000000-0000-0000-0000-000000000001', 'Ana M.', 'Ana Mamani', 'Cochabamba', 'Sarco', '70000001', '{"push":true}'),
  ('b0000000-0000-0000-0000-000000000002', 'Beto R.', 'Beto Rojas', 'Cochabamba', 'Cala Cala', '70000002', '{"push":false}');

insert into test_ids (name, id, auth_id)
select 'a', id, auth_id from public.profiles where auth_id = 'a0000000-0000-0000-0000-000000000001'
union all
select 'b', id, auth_id from public.profiles where auth_id = 'b0000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- Helpers (temporary, rolled back with the transaction)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.id_of(p_name text) returns bigint
language sql as $$ select id from test_ids where name = p_name $$;

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

-- expect_write: the DML must affect p_expected rows. An RLS or privilege error counts as 0 rows.
create or replace function pg_temp.expect_write(p_label text, p_sql text, p_expected bigint)
returns void language plpgsql as $$
declare n bigint := 0;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
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

-- anon sees no profile rows, but sees the public view.
select pg_temp.as_anon();
select pg_temp.expect_select('anon cannot read profiles',
  'select id from public.profiles', 0);
select pg_temp.expect_select('anon reads profiles_public',
  'select id from public.profiles_public', 2);

-- Ana reads her own full row and nobody else's.
select pg_temp.as_user('a');
select pg_temp.expect_select('Ana reads her own profile',
  format('select id from public.profiles where id = %s', pg_temp.id_of('a')), 1);
select pg_temp.expect_select('Ana cannot read Beto''s profile',
  format('select id from public.profiles where id = %s', pg_temp.id_of('b')), 0);
select pg_temp.expect_select('Ana reads Beto in profiles_public',
  format('select id from public.profiles_public where id = %s', pg_temp.id_of('b')), 1);

-- Ana cannot change Beto's profile.
select pg_temp.expect_write('Ana cannot rename Beto',
  format('update public.profiles set display_name = ''Hackeado'' where id = %s', pg_temp.id_of('b')), 0);
select pg_temp.expect_write('Ana cannot insert a profile for Beto''s account',
  format('insert into public.profiles (auth_id, display_name, full_name, city, zone) values (%L, ''Falso'', ''Falso'', ''Cochabamba'', ''Centro'')',
    (select auth_id from test_ids where name = 'b')), 0);

-- Ana cannot write server-only fields on her own profile.
select pg_temp.expect_write('Ana cannot set her own stellar_status',
  format('update public.profiles set stellar_status = ''ready'' where id = %s', pg_temp.id_of('a')), 0);
select pg_temp.expect_write('Ana cannot set her own stellar_pk',
  format('update public.profiles set stellar_pk = ''GFAKE'' where id = %s', pg_temp.id_of('a')), 0);

-- Ana can update her own allowed fields.
select pg_temp.expect_write('Ana updates her own theme',
  format('update public.profiles set theme = ''dark'' where id = %s', pg_temp.id_of('a')), 1);

-- The public view never exposes private columns.
select pg_temp.as_postgres();
select pg_temp.expect_select('profiles_public has no phone, notif_prefs, stellar or auth columns',
  'select column_name from information_schema.columns
     where table_schema = ''public'' and table_name = ''profiles_public''
       and column_name in (''phone'', ''notif_prefs'', ''stellar_pk'', ''stellar_status'', ''auth_id'')', 0);

-- Beto's phone is still there for the owner, not for Ana.
select pg_temp.as_user('b');
select pg_temp.expect_select('Beto reads his own phone',
  format('select id from public.profiles where id = %s and phone = ''70000002''', pg_temp.id_of('b')), 1);

select pg_temp.as_postgres();
do $$ begin raise notice 'rls ok (profiles)'; end $$;

rollback;
