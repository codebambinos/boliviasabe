-- 0015_featured_partners.sql
-- Partners in Hoy (SPEC 30, wiki #220): a featured period per partner, the «Acepta yapitas» flag on every letrero,
-- the «Destacados» section and the offers box of a partner's letrero. Guests may read all three: partners and offers
-- stay closed to anon (0012), so the reads that need them are security definer and return only public fields.

alter table public.partners add column featured_until timestamptz;

-- ---------------------------------------------------------------------------
-- Helpers (definer: anon cannot read partners or offers)
-- ---------------------------------------------------------------------------

-- The profile is a partner with at least one active offer.
create or replace function public.accepts_yapitas(p_profile_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partners pa
    join public.offers o on o.partner_id = pa.id and o.active
    where pa.profile_id = p_profile_id
  )
$$;

-- The profile is a partner whose featured period has not ended.
create or replace function public.is_featured_partner(p_profile_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.partners pa where pa.profile_id = p_profile_id and pa.featured_until > now())
$$;

-- ---------------------------------------------------------------------------
-- sign_json: same keys as 0005, plus `acceptsYapitas`
-- ---------------------------------------------------------------------------
create or replace function public.sign_json(s public.signs)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'photoUrl', s.photo_url,
    'thumbUrl', s.photo_thumb_url,
    'price', s.price,
    'city', s.city,
    'zone', s.zone,
    'tags', to_jsonb(s.tags),
    'mapsUrl', s.maps_url,
    'author', public.author_json(s.author_id),
    'createdAt', public.iso_utc(s.created_at),
    'helpfulCount', (select count(*) from public.sign_votes v where v.sign_id = s.id and v.helpful),
    'myVote', (select case when v.helpful then 'helpful' else 'not_helpful' end
               from public.sign_votes v where v.sign_id = s.id and v.voter_id = public.current_profile_id()),
    'savedByMe', exists (select 1 from public.saved sv
                         where sv.user_id = public.current_profile_id() and sv.kind = 'sign' and sv.target_id = s.id),
    'isMine', coalesce(s.author_id = public.current_profile_id(), false),
    'inReview', coalesce(s.author_id = public.current_profile_id(), false) and public.report_count('sign', s.id) >= 3,
    'acceptsYapitas', public.accepts_yapitas(s.author_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- featured_signs(city): up to 4 letreros of featured partners in the city, last 7 days, visible to the caller.
-- The caller's zone first (signed in with a zone), then the rest; newest first in each group.
-- ---------------------------------------------------------------------------
create or replace function public.featured_signs(p_city text)
returns jsonb
language sql
stable
as $$
  with me as (
    select nullif(p.zone_norm, '') as zone_norm from public.profiles p where p.id = public.current_profile_id()
  ),
  picked as (
    select public.sign_json(s) as j, s.created_at, s.id, (s.zone_norm = (select zone_norm from me)) is true as mine
    from public.signs s
    where s.city = p_city
      and s.created_at >= now() - interval '7 days'
      and public.is_featured_partner(s.author_id)
      and public.item_visible('sign', s.id, s.author_id)
    order by mine desc, s.created_at desc, s.id desc
    limit 4
  )
  select coalesce(jsonb_agg(j order by mine desc, created_at desc, id desc), '[]'::jsonb)
  from picked
$$;

-- ---------------------------------------------------------------------------
-- sign_offers(sign): the active offers of a letrero's author, shaped like `Offer` (SPEC 29). [] for the caller's own
-- letrero, a non-partner, or a letrero the caller cannot see. `redeemedToday` counts testnet redemptions only (the
-- pilot's «Canjear»), and is false for a guest.
-- ---------------------------------------------------------------------------
create or replace function public.sign_offers(p_sign_id bigint)
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
        where r.offer_id = o.id and r.profile_id = public.current_profile_id() and r.status = 'confirmed'
          and r.network = 'testnet'
          and r.created_at >= public.bolivia_day_start()
      )
    ) order by o.cost, o.id), '[]'::jsonb)
  from public.signs s
  join public.partners pa on pa.profile_id = s.author_id
  join public.offers o on o.partner_id = pa.id and o.active
  where s.id = p_sign_id
    and s.author_id is distinct from public.current_profile_id()
    and public.item_visible('sign', s.id, s.author_id)
$$;

revoke all on function
  public.accepts_yapitas(bigint), public.is_featured_partner(bigint), public.featured_signs(text), public.sign_offers(bigint)
  from public;
grant execute on function
  public.accepts_yapitas(bigint), public.is_featured_partner(bigint), public.featured_signs(text), public.sign_offers(bigint)
  to anon, authenticated;
