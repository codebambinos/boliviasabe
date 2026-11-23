-- 0014_mainnet_wallets.sql
-- Own Pollar wallet on mainnet for invited accounts (SPEC 31, wiki #221). The pilot stays on testnet.
-- A profile links the G-address of its Pollar wallet; the mainnet welcome and redemptions are recorded here. Only the
-- service role writes these columns and rows.

alter table public.profiles add column mainnet_address text unique
  check (mainnet_address is null or mainnet_address ~ '^G[A-Z2-7]{55}$');

alter table public.redemptions add column network text not null default 'testnet'
  check (network in ('testnet', 'mainnet'));

create table public.mainnet_payments (
  id bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles (id),
  kind text not null check (kind in ('bienvenida', 'canje')),
  redemption_id bigint references public.redemptions (id),
  amount integer not null,
  tx_hash text not null unique,
  created_at timestamptz not null default now(),
  check ((kind = 'canje') = (redemption_id is not null))
);

-- One mainnet welcome per profile, one record per redemption
create unique index mainnet_payments_one_welcome on public.mainnet_payments (profile_id) where kind = 'bienvenida';
create unique index mainnet_payments_one_redemption on public.mainnet_payments (redemption_id) where kind = 'canje';

alter table public.mainnet_payments enable row level security;

create policy mainnet_payments_select_own on public.mainnet_payments
  for select to authenticated
  using (public.is_profile_owner(profile_id));

-- The client never writes the mainnet address: profiles keep column-level grants (0002), and this column is not in
-- them. Only the server writes it, after verifying the Pollar token.

-- ---------------------------------------------------------------------------
-- list_offers(p_network): as in 0012, and for `mainnet` only the offers whose partner linked a wallet.
-- ---------------------------------------------------------------------------
drop function public.list_offers();

create or replace function public.list_offers(p_network text default 'testnet')
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
          and r.network = coalesce(p_network, 'testnet')
          and r.created_at >= public.bolivia_day_start()
      )
    ) order by o.cost, pa.name, o.id), '[]'::jsonb)
  from public.profiles me
  join public.partners pa on pa.city = me.city and pa.profile_id <> me.id
  join public.profiles owner on owner.id = pa.profile_id
  join public.offers o on o.partner_id = pa.id and o.active
  where me.id = public.current_profile_id()
    and (coalesce(p_network, 'testnet') <> 'mainnet' or owner.mainnet_address is not null)
$$;

revoke execute on function public.list_offers(text) from public, anon;
grant execute on function public.list_offers(text) to authenticated;
