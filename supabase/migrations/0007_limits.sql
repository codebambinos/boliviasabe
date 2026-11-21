-- 0007_limits.sql
-- Server-side limits and reward anti-abuse (SPEC 13, T23; wiki reglas-finales › Límites, #186-190):
--   · BEFORE INSERT triggers: 10 questions per Bolivian day, 3 open questions with answers, 30 comments in the
--     last hour. Only for signed-in callers (auth.uid() is set): the seed and the scripts use the service role.
--   · A limit raises SQLSTATE BSLIM, message 'limit:<reason>', hint = when it frees (ISO, or empty).
--   · rewards.source_id: who gave a «Me sirvió» (sirvio-l, ayuda), to count the pair.
--   · reward_cap: the one rule for the reward caps, used by /premiar (service role) and, through
--     my_reward_cap, by the browser right after saving, so the «sin yapitas» notice is exact.

-- ---------------------------------------------------------------------------
-- Who gave a reward
-- ---------------------------------------------------------------------------
alter table public.rewards add column source_id bigint references public.profiles (id);
create index rewards_pair_day_idx on public.rewards (profile_id, source_id, created_at);
create index rewards_reason_day_idx on public.rewards (profile_id, reason, created_at);
create index questions_author_created_idx on public.questions (author_id, created_at);
create index answer_comments_author_created_idx on public.answer_comments (author_id, created_at);

-- ---------------------------------------------------------------------------
-- The Bolivian day (America/La_Paz, UTC−4 all year)
-- ---------------------------------------------------------------------------
create or replace function public.bolivia_day_start()
returns timestamptz
language sql
stable
as $$ select date_trunc('day', now() at time zone 'America/La_Paz') at time zone 'America/La_Paz' $$;

create or replace function public.bolivia_next_midnight()
returns timestamptz
language sql
stable
as $$ select public.bolivia_day_start() + interval '1 day' $$;

-- 'limit:<reason>' with the moment it frees in the hint; the adapter turns it into DataError('limit').
create or replace function public.raise_limit(p_reason text, p_until timestamptz)
returns void
language plpgsql
as $$
begin
  raise exception 'limit:%', p_reason using errcode = 'BSLIM', hint = coalesce(public.iso_utc(p_until), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Publishing limits
-- ---------------------------------------------------------------------------
create or replace function public.check_question_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null then return new; end if;

  select count(*) into n from public.questions
  where author_id = new.author_id and created_at >= public.bolivia_day_start();
  if n >= 10 then perform public.raise_limit('questions_per_day', public.bolivia_next_midnight()); end if;

  select count(*) into n from public.questions q
  where q.author_id = new.author_id and q.status = 'open'
    and exists (select 1 from public.answers a where a.question_id = q.id);
  if n >= 3 then perform public.raise_limit('open_questions', null); end if;
  return new;
end;
$$;

create trigger questions_limits
  before insert on public.questions
  for each row execute function public.check_question_limits();

-- 30 in the last hour; a slot frees when the oldest comment that keeps the count at 30 leaves the window.
create or replace function public.check_comment_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  frees timestamptz;
begin
  if auth.uid() is null then return new; end if;
  select count(*) into n from public.answer_comments
  where author_id = new.author_id and created_at > now() - interval '1 hour';
  if n >= 30 then
    select created_at + interval '1 hour' into frees from public.answer_comments
    where author_id = new.author_id and created_at > now() - interval '1 hour'
    order by created_at, id offset n - 30 limit 1;
    perform public.raise_limit('comments_per_hour', frees);
  end if;
  return new;
end;
$$;

create trigger answer_comments_limits
  before insert on public.answer_comments
  for each row execute function public.check_comment_limits();

-- ---------------------------------------------------------------------------
-- Reward caps: null when the reward may be paid, else 'signs_per_day', 'answers_per_question' or 'pair_per_day'.
-- A reward whose memo already exists is never capped (retries and «Reintentar» still pay), and the memo being
-- checked never counts against itself.
-- ---------------------------------------------------------------------------
create or replace function public.reward_cap(p_reason text, p_recipient bigint, p_source bigint, p_memo text, p_ref bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n integer;
  v_rating bigint;
  v_question bigint;
begin
  if exists (select 1 from public.rewards where memo_key = p_memo) then return null; end if;

  if p_reason = 'letrero' then
    select count(*) into n from public.rewards
    where profile_id = p_recipient and reason = 'letrero' and created_at >= public.bolivia_day_start();
    return case when n >= 10 then 'signs_per_day' end;
  end if;

  if p_reason = 'ayuda' then
    -- Only the first 3 helpful ratings of a question pay (wiki #188), counted by rating id.
    select r.id, a.question_id into v_rating, v_question
    from public.ratings r join public.answers a on a.id = r.answer_id
    where r.answer_id = p_ref and r.helpful;
    if v_rating is not null then
      select count(*) into n from public.ratings r join public.answers a on a.id = r.answer_id
      where a.question_id = v_question and r.helpful and r.id < v_rating;
      if n >= 3 then return 'answers_per_question'; end if;
    end if;
  end if;

  if p_reason in ('ayuda', 'sirvio-l') and p_source is not null then
    select count(*) into n from public.rewards
    where profile_id = p_recipient and source_id = p_source and reason in ('ayuda', 'sirvio-l')
      and created_at >= public.bolivia_day_start();
    if n >= 3 then return 'pair_per_day'; end if;
  end if;
  return null;
end;
$$;

-- The caller's side: who receives, who gives and the memo, derived the same way as planReward (lib/stellar).
-- Null when the caller could not claim that reward at all.
create or replace function public.my_reward_cap(p_reason text, p_ref bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  v_author bigint;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_reason = 'letrero' then
    select author_id into v_author from public.signs where id = p_ref;
    if v_author is distinct from me then return null; end if;
    return public.reward_cap('letrero', me, null, 'letrero:' || p_ref, p_ref);
  elsif p_reason = 'sirvio-l' then
    select author_id into v_author from public.signs where id = p_ref;
    if v_author is null or v_author = me then return null; end if;
    return public.reward_cap('sirvio-l', v_author, me, 'sirvio-l:' || p_ref || '-' || me, p_ref);
  elsif p_reason = 'ayuda' then
    select author_id into v_author from public.answers where id = p_ref;
    if v_author is null or v_author = me then return null; end if;
    return public.reward_cap('ayuda', v_author, me, 'ayuda:' || p_ref, p_ref);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.reward_cap(text, bigint, bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.reward_cap(text, bigint, bigint, text, bigint) to service_role;
revoke all on function public.my_reward_cap(text, bigint) from public, anon;
grant execute on function public.my_reward_cap(text, bigint) to authenticated;
revoke all on function public.check_question_limits(), public.check_comment_limits() from public, anon, authenticated;
