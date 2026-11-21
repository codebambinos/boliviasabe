-- 0003_ratings_view_and_notifications.sql
-- Reputation view (stars and badge) and the two notification events (SPEC 03).

-- ---------------------------------------------------------------------------
-- author_trust: stars and badge per author, from the ratings on their answers.
-- It is not security_invoker on purpose: it must read every rating, but it exposes
-- only the aggregates below.
--   stars = 1 + 4 × helpful ÷ ratings, one decimal, null while ratings < 3
--   badge = 'Vecino nuevo' (< 3), 'De confianza' (stars ≥ 4.5 and ≥ 5), else 'Buen vecino'
-- ---------------------------------------------------------------------------
create view public.author_trust as
with agg as (
  select a.author_id as profile_id,
         count(*) as ratings_count,
         count(*) filter (where r.helpful) as helpful_count
  from public.ratings r
  join public.answers a on a.id = r.answer_id
  group by a.author_id
),
scored as (
  select profile_id,
         ratings_count,
         helpful_count,
         case when ratings_count >= 3
           then round(1 + 4.0 * helpful_count / ratings_count, 1)
         end as stars
  from agg
)
select profile_id,
       ratings_count,
       helpful_count,
       stars,
       case
         when ratings_count < 3 then 'Vecino nuevo'
         when stars >= 4.5 and ratings_count >= 5 then 'De confianza'
         else 'Buen vecino'
       end as badge
from scored;

grant select on public.author_trust to anon, authenticated;

-- profiles_public now carries stars and badge. A profile with no ratings has no row in
-- author_trust, so the view fills in null stars and «Vecino nuevo».
create or replace view public.profiles_public as
  select p.id,
         p.display_name,
         p.city,
         p.zone,
         p.share,
         t.stars,
         coalesce(t.badge, 'Vecino nuevo') as badge
  from public.profiles p
  left join public.author_trust t on t.profile_id = p.id;

-- ---------------------------------------------------------------------------
-- Notifications. Only these two events exist in this spec; the rest belong to T22 and T24.
-- Triggers are security definer: clients have no insert policy on notifications.
-- ---------------------------------------------------------------------------

-- A new answer notifies the author of the question.
create or replace function public.notify_on_new_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, ref_kind, ref_id)
  select q.author_id, 'answer', 'question', q.id
  from public.questions q
  where q.id = new.question_id;
  return new;
end;
$$;

create trigger answers_notify_asker
  after insert on public.answers
  for each row execute function public.notify_on_new_answer();

-- A «Me sirvió» on an answer notifies the answer's author. «No me sirvió» does not notify.
create or replace function public.notify_on_helpful_mark()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.helpful then
    insert into public.notifications (user_id, kind, ref_kind, ref_id)
    select a.author_id, 'helpful', 'answer', a.id
    from public.answers a
    where a.id = new.answer_id;
  end if;
  return new;
end;
$$;

create trigger ratings_notify_author
  after insert on public.ratings
  for each row execute function public.notify_on_helpful_mark();
