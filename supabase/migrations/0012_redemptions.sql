-- 0012_redemptions.sql
-- Redeem yapitas with partner businesses (SPEC 29, wiki #219).
-- A partner is an app profile linked by `npm run partner:add`. A neighbor pays an offer's cost from their custodial
-- account to the partner's account (memo `canje:<redemption id>`), all or nothing. Only the service role writes these
-- tables; the browser reads offers and its own redemptions through the functions below.

create table public.partners (
  id bigint generated always as identity primary key,
  profile_id bigint not null unique references public.profiles (id),
  name text not null check (char_length(name) between 2 and 60),
  city text not null,
  zone text not null,
  created_at timestamptz not null default now()
);

create table public.offers (
  id bigint generated always as identity primary key,
  partner_id bigint not null references public.partners (id),
  title text not null check (char_length(title) between 3 and 80),
  cost integer not null check (cost between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (partner_id, title)
);

create table public.redemptions (
  id bigint generated always as identity primary key,
  offer_id bigint not null references public.offers (id),
  profile_id bigint not null references public.profiles (id),
  partner_id bigint not null references public.partners (id),
  cost integer not null check (cost > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'error')),
  tx_hash text,
  created_at timestamptz not null default now()
);

create index redemptions_daily_idx on public.redemptions (profile_id, offer_id, created_at) where status = 'confirmed';

alter table public.rewards add column redemption_id bigint references public.redemptions (id);

-- ---------------------------------------------------------------------------
-- RLS: signed-in users read partners and active offers; a redemption only by its neighbor or its partner.
-- ---------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.offers enable row level security;
alter table public.redemptions enable row level security;

create policy partners_select_all on public.partners
  for select to authenticated
  using (true);

create policy offers_select_active on public.offers
  for select to authenticated
  using (active);

create policy redemptions_select_parties on public.redemptions
  for select to authenticated
  using (
    public.is_profile_owner(profile_id)
    or exists (select 1 from public.partners pa where pa.id = partner_id and public.is_profile_owner(pa.profile_id))
  );

-- ---------------------------------------------------------------------------
-- list_offers(): the active offers in the caller's city, without the caller's own, each with whether the caller
-- already redeemed it today (Bolivian day). Shaped like `Offer` in src/data/types.ts.
-- ---------------------------------------------------------------------------
create or replace function public.list_offers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'title', o.title,
      'cost', o.cost,
      'partner', jsonb_build_object('name', pa.name, 'city', pa.city, 'zone', pa.zone),
      'redeemedToday', exists (
        select 1 from public.redemptions r
        where r.offer_id = o.id and r.profile_id = me.id and r.status = 'confirmed'
          and r.created_at >= public.bolivia_day_start()
      )
    ) order by o.cost, pa.name, o.id), '[]'::jsonb)
  from public.profiles me
  join public.partners pa on pa.city = me.city and pa.profile_id <> me.id
  join public.offers o on o.partner_id = pa.id and o.active
  where me.id = public.current_profile_id()
$$;

-- ---------------------------------------------------------------------------
-- get_redemption(id): the receipt, for the neighbor who paid or the partner who received. Null for anyone else.
-- ---------------------------------------------------------------------------
create or replace function public.get_redemption(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
      'id', r.id,
      'offerTitle', o.title,
      'partnerName', pa.name,
      'partnerZone', pa.zone,
      'cost', r.cost,
      'createdAt', r.created_at,
      'txHash', r.tx_hash,
      'side', case when r.profile_id = public.current_profile_id() then 'paid' else 'received' end
    )
  from public.redemptions r
  join public.offers o on o.id = r.offer_id
  join public.partners pa on pa.id = r.partner_id
  where r.id = p_id
    and r.status = 'confirmed'
    and (r.profile_id = public.current_profile_id() or pa.profile_id = public.current_profile_id())
$$;

revoke execute on function public.list_offers() from public, anon;
revoke execute on function public.get_redemption(bigint) from public, anon;
grant execute on function public.list_offers() to authenticated;
grant execute on function public.get_redemption(bigint) to authenticated;
