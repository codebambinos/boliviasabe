-- 0001_core_tables.sql
-- Core tables from the wiki «Datos» section (SPEC 03).
-- Every key is a bigint identity: Stellar memos hold at most 28 bytes.
-- Foreign keys keep the default RESTRICT, except where the spec says cascade.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id bigint generated always as identity primary key,
  auth_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  full_name text not null,
  city text not null check (city in ('Cochabamba', 'La Paz', 'El Alto', 'Santa Cruz', 'Oruro',
    'Potosí', 'Sucre', 'Tarija', 'Trinidad', 'Cobija')),
  zone text not null,
  zone_norm text not null default '',
  phone text,
  share boolean not null default false,
  stellar_pk text,
  stellar_status text not null default 'preparing'
    check (stellar_status in ('preparing', 'ready', 'error')),
  notif_prefs jsonb not null default '{}'::jsonb,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now()
);

-- Encrypted Stellar secret. No RLS policies: only the service role reads or writes it.
create table public.wallet_keys (
  profile_id bigint primary key references public.profiles (id),
  secret_enc text not null,
  secret_iv text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- signs (letreros)
-- ---------------------------------------------------------------------------
create table public.signs (
  id bigint generated always as identity primary key,
  author_id bigint not null references public.profiles (id),
  title text not null check (char_length(title) between 3 and 80),
  photo_url text not null,
  photo_thumb_url text not null,
  price text,
  city text not null check (city in ('Cochabamba', 'La Paz', 'El Alto', 'Santa Cruz', 'Oruro',
    'Potosí', 'Sucre', 'Tarija', 'Trinidad', 'Cobija')),
  zone text not null,
  zone_norm text not null default '',
  tags text[] not null default '{}'
    check (cardinality(tags) <= 3
      and tags <@ array['Comida', 'Almuerzos', 'Ofertas', 'Precios', 'Servicios', 'Salud',
        'Educación', 'Transporte', 'Hogar', 'Tecnología', 'Mascotas', 'Ropa', 'Eventos',
        'Trabajo', 'Alquileres', 'Trámites', 'Belleza', 'Mercado']::text[]),
  maps_url text check (maps_url is null or maps_url like 'https://%'),
  created_at timestamptz not null default now()
);
create index signs_city_created_idx on public.signs (city, created_at desc);

-- One vote per person and sign. Votes are final (no update or delete policy in 0002).
create table public.sign_votes (
  sign_id bigint not null references public.signs (id),
  voter_id bigint not null references public.profiles (id),
  helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (sign_id, voter_id)
);

-- ---------------------------------------------------------------------------
-- questions and answers («¿Alguien sabe?»)
-- ---------------------------------------------------------------------------
create table public.questions (
  id bigint generated always as identity primary key,
  author_id bigint not null references public.profiles (id),
  text text not null check (char_length(text) between 3 and 300),
  photo_url text,
  city text not null check (city in ('Cochabamba', 'La Paz', 'El Alto', 'Santa Cruz', 'Oruro',
    'Potosí', 'Sucre', 'Tarija', 'Trinidad', 'Cobija')),
  zone text not null,
  zone_norm text not null default '',
  tags text[] not null default '{}'
    check (cardinality(tags) <= 3
      and tags <@ array['Comida', 'Almuerzos', 'Ofertas', 'Precios', 'Servicios', 'Salud',
        'Educación', 'Transporte', 'Hogar', 'Tecnología', 'Mascotas', 'Ropa', 'Eventos',
        'Trabajo', 'Alquileres', 'Trámites', 'Belleza', 'Mercado']::text[]),
  urgent_until timestamptz,
  status text not null default 'open' check (status in ('open', 'solved', 'closed')),
  created_at timestamptz not null default now()
);
create index questions_city_status_created_idx on public.questions (city, status, created_at desc);

create table public.answers (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.questions (id),
  author_id bigint not null references public.profiles (id),
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint answers_one_per_person unique (question_id, author_id)
);

create table public.answer_comments (
  id bigint generated always as identity primary key,
  answer_id bigint not null references public.answers (id),
  author_id bigint not null references public.profiles (id),
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

-- One row per «Me sirvió» / «No me sirvió» mark on an answer. Feeds author_trust (0003).
create table public.ratings (
  id bigint generated always as identity primary key,
  answer_id bigint not null references public.answers (id),
  rater_id bigint not null references public.profiles (id),
  helpful boolean not null,
  created_at timestamptz not null default now(),
  constraint ratings_one_per_rater unique (answer_id, rater_id)
);

-- ---------------------------------------------------------------------------
-- reports, hidden items, contact requests, saved items
-- kind and target_id point to a sign, question or answer; no foreign key because
-- the target table depends on kind.
-- ---------------------------------------------------------------------------
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id bigint not null references public.profiles (id),
  kind text not null check (kind in ('sign', 'question', 'answer')),
  target_id bigint not null,
  reason text not null check (reason in ('spam', 'false_info', 'offensive', 'personal_data',
    'inappropriate', 'other')),
  created_at timestamptz not null default now(),
  constraint reports_one_per_person unique (reporter_id, kind, target_id)
);

-- «Ya no quiero ver esto»: one row per user and item.
create table public.hidden_items (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.profiles (id),
  kind text not null check (kind in ('sign', 'question', 'answer')),
  target_id bigint not null,
  created_at timestamptz not null default now(),
  constraint hidden_items_unique unique (user_id, kind, target_id)
);

create table public.contact_requests (
  id bigint generated always as identity primary key,
  requester_id bigint not null references public.profiles (id),
  owner_id bigint not null references public.profiles (id),
  question_id bigint references public.questions (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  constraint contact_requests_not_self check (requester_id <> owner_id)
);

create table public.saved (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.profiles (id),
  kind text not null check (kind in ('sign', 'question', 'answer')),
  target_id bigint not null,
  created_at timestamptz not null default now(),
  constraint saved_unique unique (user_id, kind, target_id)
);

-- ---------------------------------------------------------------------------
-- notifications, push subscriptions, rewards
-- ---------------------------------------------------------------------------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.profiles (id),
  kind text not null,
  ref_kind text not null,
  ref_id bigint not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.profiles (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- memo_key is the Stellar memo (e.g. 'ayuda:123'); it must fit in 28 bytes.
create table public.rewards (
  id bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles (id),
  memo_key text not null unique check (octet_length(memo_key) <= 28),
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('bienvenida', 'letrero', 'sirvio-l', 'ayuda', 'cierre',
    'urgente', 'canje')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'error')),
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- zone_norm: lower-case, accent-free copy of the hand-typed zone
-- ---------------------------------------------------------------------------
create or replace function public.set_zone_norm()
returns trigger
language plpgsql
as $$
begin
  new.zone_norm := lower(extensions.unaccent(trim(new.zone)));
  return new;
end;
$$;

create trigger profiles_zone_norm
  before insert or update of zone on public.profiles
  for each row execute function public.set_zone_norm();

create trigger signs_zone_norm
  before insert or update of zone on public.signs
  for each row execute function public.set_zone_norm();

create trigger questions_zone_norm
  before insert or update of zone on public.questions
  for each row execute function public.set_zone_norm();

-- ---------------------------------------------------------------------------
-- Rule triggers. They raise SQLSTATE 42501 (insufficient_privilege), which the
-- Supabase adapter maps to DataError 'forbidden'. They also run for the service role.
-- ---------------------------------------------------------------------------
create or replace function public.forbid_self_sign_vote()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.signs s
    where s.id = new.sign_id and s.author_id = new.voter_id
  ) then
    raise exception 'a person cannot vote on their own sign' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sign_votes_not_own
  before insert on public.sign_votes
  for each row execute function public.forbid_self_sign_vote();

create or replace function public.forbid_self_answer()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.questions q
    where q.id = new.question_id and q.author_id = new.author_id
  ) then
    raise exception 'a person cannot answer their own question' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger answers_not_own_question
  before insert on public.answers
  for each row execute function public.forbid_self_answer();

create or replace function public.only_asker_rates()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.answers a
    join public.questions q on q.id = a.question_id
    where a.id = new.answer_id and q.author_id = new.rater_id
  ) then
    raise exception 'only the author of the question can rate its answers' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ratings_only_asker
  before insert on public.ratings
  for each row execute function public.only_asker_rates();
