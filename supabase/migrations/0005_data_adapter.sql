-- 0005_data_adapter.sql
-- What the Supabase data adapter needs on top of the tables and RLS (SPEC 11, T39):
--   · the `photos` Storage bucket and its policies,
--   · read functions that return JSON shaped like src/data/types.ts (per-caller fields, hidden and in-review rules),
--   · the writes the RLS forbids to clients on purpose (question status, deleting a voted sign),
--   · a rule trigger: a closed or solved question receives no new answers.
-- Errors use SQLSTATEs the adapter maps to DataError: 28000 unauthenticated, 42501 forbidden, P0002 not_found.
-- Read functions and the content helpers are security invoker (RLS still decides what a caller sees);
-- only report_count, rate_answer, close_question and remove_sign are security definer.

-- ---------------------------------------------------------------------------
-- Storage: public bucket, one folder per profile (`<profile_id>/<uuid>.jpg`)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy photos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_profile_id()::text);

-- Reading through the API is public (public bucket); this policy lets the owner see their own files, which a delete needs.
create policy photos_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_profile_id()::text);

create policy photos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.current_profile_id()::text);

-- ---------------------------------------------------------------------------
-- Rule: a question that is not open takes no new answers (wiki, «Estados»)
-- ---------------------------------------------------------------------------
create or replace function public.only_open_questions_take_answers()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.questions q where q.id = new.question_id and q.status = 'open') then
    raise exception 'this question no longer accepts answers' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger answers_only_open_question
  before insert on public.answers
  for each row execute function public.only_open_questions_take_answers();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.iso_utc(p timestamptz)
returns text
language sql
stable
as $$ select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

-- Reports are readable only by their reporter, so the count needs a definer function.
create or replace function public.report_count(p_kind text, p_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$ select count(*)::integer from public.reports r where r.kind = p_kind and r.target_id = p_id $$;

-- Visible for the caller: not hidden by them, and not in review (3 reports) unless it is theirs.
create or replace function public.item_visible(p_kind text, p_id bigint, p_author bigint)
returns boolean
language sql
stable
as $$
  select not exists (
           select 1 from public.hidden_items h
           where h.user_id = public.current_profile_id() and h.kind = p_kind and h.target_id = p_id)
     and (public.report_count(p_kind, p_id) < 3 or coalesce(p_author = public.current_profile_id(), false))
$$;

create or replace function public.author_json(p_id bigint)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('id', p.id, 'displayName', p.display_name, 'stars', p.stars, 'badge', p.badge)
  from public.profiles_public p where p.id = p_id
$$;

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
    'inReview', coalesce(s.author_id = public.current_profile_id(), false) and public.report_count('sign', s.id) >= 3
  )
$$;

create or replace function public.question_json(q public.questions)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', q.id,
    'text', q.text,
    'photoUrl', q.photo_url,
    'city', q.city,
    'zone', q.zone,
    'tags', to_jsonb(q.tags),
    'author', public.author_json(q.author_id),
    'createdAt', public.iso_utc(q.created_at),
    'urgentUntil', case when q.urgent_until > now() then public.iso_utc(q.urgent_until) end,
    'status', q.status,
    'answerCount', (select count(*) from public.answers a where a.question_id = q.id),
    'savedByMe', exists (select 1 from public.saved sv
                         where sv.user_id = public.current_profile_id() and sv.kind = 'question' and sv.target_id = q.id),
    'isMine', coalesce(q.author_id = public.current_profile_id(), false),
    'inReview', coalesce(q.author_id = public.current_profile_id(), false) and public.report_count('question', q.id) >= 3
  )
$$;

create or replace function public.answer_json(a public.answers)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', a.id,
    'questionId', a.question_id,
    'text', a.text,
    'author', public.author_json(a.author_id),
    'createdAt', public.iso_utc(a.created_at),
    'helpful', exists (select 1 from public.ratings r where r.answer_id = a.id and r.helpful),
    'notHelpful', exists (select 1 from public.ratings r where r.answer_id = a.id and not r.helpful),
    'savedByMe', exists (select 1 from public.saved sv
                         where sv.user_id = public.current_profile_id() and sv.kind = 'answer' and sv.target_id = a.id),
    'isMine', coalesce(a.author_id = public.current_profile_id(), false),
    'inReview', coalesce(a.author_id = public.current_profile_id(), false) and public.report_count('answer', a.id) >= 3
  )
$$;

-- Author of a content item the caller can see, or null.
create or replace function public.content_author(p_kind text, p_id bigint)
returns bigint
language sql
stable
as $$
  select a from (
    select s.author_id a from public.signs s where p_kind = 'sign' and s.id = p_id
    union all
    select q.author_id from public.questions q where p_kind = 'question' and q.id = p_id
    union all
    select x.author_id from public.answers x where p_kind = 'answer' and x.id = p_id
  ) t
  where public.item_visible(p_kind, p_id, a)
$$;

-- ---------------------------------------------------------------------------
-- Signs
-- ---------------------------------------------------------------------------
create or replace function public.list_signs(p_city text, p_search text default null, p_tags text[] default null, p_offset integer default 0)
returns jsonb
language sql
stable
as $$
  with ranked as (
    select public.sign_json(s) as j,
           row_number() over (
             order by s.created_at desc,
                      (select count(*) filter (where v.helpful) - count(*) filter (where not v.helpful)
                       from public.sign_votes v where v.sign_id = s.id) desc,
                      s.id desc) as rn
    from public.signs s
    where s.city = p_city
      and public.item_visible('sign', s.id, s.author_id)
      and (coalesce(btrim(p_search), '') = ''
           or position(lower(extensions.unaccent(btrim(p_search))) in lower(extensions.unaccent(s.title || ' ' || s.zone))) > 0)
      and (p_tags is null or cardinality(p_tags) = 0 or s.tags && p_tags)
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(j order by rn) filter (where rn <= p_offset + 30), '[]'::jsonb),
    'nextCursor', case when count(*) > 30 then (p_offset + 30)::text end)
  from ranked where rn > p_offset and rn <= p_offset + 31
$$;

create or replace function public.get_sign(p_id bigint)
returns jsonb
language plpgsql
stable
as $$
declare s public.signs;
begin
  select * into s from public.signs where id = p_id;
  if not found or not public.item_visible('sign', s.id, s.author_id) then
    raise exception 'this sign is no longer available' using errcode = 'P0002';
  end if;
  return public.sign_json(s);
end;
$$;

-- A sign with votes cannot be deleted through the table (RLS), but its author may delete it:
-- the points already earned stay (wiki «Borrar el tuyo»).
create or replace function public.remove_sign(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me bigint := public.current_profile_id();
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.signs where id = p_id) then
    raise exception 'this sign is no longer available' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.signs where id = p_id and author_id = me) then
    raise exception 'you can only delete your own sign' using errcode = '42501';
  end if;
  delete from public.sign_votes where sign_id = p_id;
  delete from public.saved where kind = 'sign' and target_id = p_id;
  delete from public.hidden_items where kind = 'sign' and target_id = p_id;
  delete from public.reports where kind = 'sign' and target_id = p_id;
  delete from public.signs where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Questions and answers
-- ---------------------------------------------------------------------------
-- Wiki order: active urgent → caller's zone → rest of the city → solved and closed; newest first inside each.
create or replace function public.list_questions(p_city text, p_search text default null, p_tags text[] default null, p_offset integer default 0)
returns jsonb
language sql
stable
as $$
  with me as (
    select p.zone_norm from public.profiles p where p.id = public.current_profile_id() and p.city = p_city
  ),
  ranked as (
    select public.question_json(q) as j,
           row_number() over (
             order by case when q.status <> 'open' then 3
                           when q.urgent_until > now() then 0
                           when q.zone_norm = (select zone_norm from me) then 1
                           else 2 end,
                      q.created_at desc, q.id desc) as rn
    from public.questions q
    where q.city = p_city
      and public.item_visible('question', q.id, q.author_id)
      and (coalesce(btrim(p_search), '') = ''
           or position(lower(extensions.unaccent(btrim(p_search))) in lower(extensions.unaccent(q.text))) > 0)
      and (p_tags is null or cardinality(p_tags) = 0 or q.tags && p_tags)
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(j order by rn) filter (where rn <= p_offset + 30), '[]'::jsonb),
    'nextCursor', case when count(*) > 30 then (p_offset + 30)::text end)
  from ranked where rn > p_offset and rn <= p_offset + 31
$$;

-- {question, answers}: answers with «Me sirvió» first, then the oldest first.
create or replace function public.get_question(p_id bigint)
returns jsonb
language plpgsql
stable
as $$
declare q public.questions;
begin
  select * into q from public.questions where id = p_id;
  if not found or not public.item_visible('question', q.id, q.author_id) then
    raise exception 'this question is no longer available' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'question', public.question_json(q),
    'answers', coalesce((
      select jsonb_agg(public.answer_json(a) order by
               exists (select 1 from public.ratings r where r.answer_id = a.id and r.helpful) desc,
               a.created_at asc, a.id asc)
      from public.answers a
      where a.question_id = q.id and public.item_visible('answer', a.id, a.author_id)), '[]'::jsonb));
end;
$$;

-- «Preguntas parecidas»: from 3 typed words, up to 3 questions of the caller's city (Cochabamba for guests)
-- that share words of 4+ letters, the most words first.
create or replace function public.similar_questions(p_text text)
returns jsonb
language sql
stable
as $$
  with words as (
    select w from unnest(regexp_split_to_array(lower(extensions.unaccent(btrim(coalesce(p_text, '')))), '\s+')) w where w <> ''
  ),
  keywords as (select distinct w from words where char_length(w) >= 4),
  city as (
    select coalesce((select p.city from public.profiles p where p.id = public.current_profile_id()), 'Cochabamba') c
  ),
  scored as (
    select q, (select count(*) from keywords k where position(k.w in lower(extensions.unaccent(q.text))) > 0) as score
    from public.questions q, city
    where (select count(*) from words) >= 3
      and q.city = city.c
      and public.item_visible('question', q.id, q.author_id)
  )
  select coalesce(jsonb_agg(public.question_json(s.q) order by s.score desc, (s.q).created_at desc), '[]'::jsonb)
  from (select * from scored where score > 0 order by score desc, (q).created_at desc limit 3) s
$$;

-- «Me sirvió» / «No me sirvió» on an answer, by the author of the question.
-- «Me sirvió» is final; «No me sirvió» can still become «Me sirvió». The first «Me sirvió» solves an open question;
-- on a closed one the status does not change. Returns {answer, questionStatus}.
create or replace function public.rate_answer(p_answer_id bigint, p_helpful boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  a public.answers;
  q public.questions;
  existing public.ratings;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into a from public.answers where id = p_answer_id;
  if not found or not public.item_visible('answer', a.id, a.author_id) then
    raise exception 'this answer is no longer available' using errcode = 'P0002';
  end if;
  select * into q from public.questions where id = a.question_id;
  if q.author_id <> me then
    raise exception 'only the asker can rate answers' using errcode = '42501';
  end if;

  select * into existing from public.ratings where answer_id = a.id and rater_id = me;
  if found then
    if existing.helpful and not p_helpful then
      raise exception '«Me sirvió» is final' using errcode = '42501';
    end if;
    if existing.helpful = p_helpful then
      return jsonb_build_object('answer', public.answer_json(a), 'questionStatus', q.status);
    end if;
    delete from public.ratings where id = existing.id; -- «No me sirvió» → «Me sirvió»: a new row fires the notification
  end if;

  insert into public.ratings (answer_id, rater_id, helpful) values (a.id, me, p_helpful);

  if p_helpful and q.status = 'open' then
    update public.questions set status = 'solved' where id = q.id returning status into q.status;
  end if;
  return jsonb_build_object('answer', public.answer_json(a), 'questionStatus', q.status);
end;
$$;

-- «Ninguna me sirvió»: the asker closes an open question that has answers.
create or replace function public.close_question(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  q public.questions;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into q from public.questions where id = p_id;
  if not found or not public.item_visible('question', q.id, q.author_id) then
    raise exception 'this question is no longer available' using errcode = 'P0002';
  end if;
  if q.author_id <> me then raise exception 'only the asker can close the question' using errcode = '42501'; end if;
  if q.status <> 'open' then raise exception 'the question is already closed' using errcode = '42501'; end if;
  if not exists (select 1 from public.answers where question_id = q.id) then
    raise exception 'a question without answers is deleted, not closed' using errcode = '42501';
  end if;
  update public.questions set status = 'closed' where id = q.id returning * into q;
  return public.question_json(q);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved, reports and «Ya no quiero ver esto» (security invoker: the RLS on the tables still applies)
-- ---------------------------------------------------------------------------
create or replace function public.toggle_saved(p_kind text, p_id bigint)
returns boolean
language plpgsql
as $$
declare me bigint := public.current_profile_id();
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if public.content_author(p_kind, p_id) is null then
    raise exception 'this item is no longer available' using errcode = 'P0002';
  end if;
  delete from public.saved where user_id = me and kind = p_kind and target_id = p_id;
  if found then return false; end if;
  insert into public.saved (user_id, kind, target_id) values (me, p_kind, p_id);
  return true;
end;
$$;

-- One report per person; it also hides the item for the reporter right away (wiki #166).
create or replace function public.report_content(p_kind text, p_id bigint, p_reason text)
returns void
language plpgsql
as $$
declare
  me bigint := public.current_profile_id();
  author bigint;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  author := public.content_author(p_kind, p_id);
  if author is null then raise exception 'this item is no longer available' using errcode = 'P0002'; end if;
  if author = me then raise exception 'you cannot report your own content' using errcode = '42501'; end if;
  insert into public.reports (reporter_id, kind, target_id, reason) values (me, p_kind, p_id, p_reason)
    on conflict (reporter_id, kind, target_id) do nothing;
  insert into public.hidden_items (user_id, kind, target_id) values (me, p_kind, p_id)
    on conflict (user_id, kind, target_id) do nothing;
end;
$$;

create or replace function public.hide_content(p_kind text, p_id bigint)
returns void
language plpgsql
as $$
declare me bigint := public.current_profile_id();
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if public.content_author(p_kind, p_id) is null then
    raise exception 'this item is no longer available' using errcode = 'P0002';
  end if;
  insert into public.hidden_items (user_id, kind, target_id) values (me, p_kind, p_id)
    on conflict (user_id, kind, target_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity and saved lists (the caller's own, newest first)
-- ---------------------------------------------------------------------------
create or replace function public.my_signs()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(public.sign_json(s) order by s.created_at desc, s.id desc), '[]'::jsonb)
  from public.signs s where s.author_id = public.current_profile_id()
$$;

create or replace function public.my_questions()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(public.question_json(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
  from public.questions q where q.author_id = public.current_profile_id()
$$;

create or replace function public.my_answers()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(public.answer_json(a) order by a.created_at desc, a.id desc), '[]'::jsonb)
  from public.answers a where a.author_id = public.current_profile_id()
$$;

-- {signs, questions, answers}: saved items that still exist and are visible, most recently saved first.
create or replace function public.saved_items()
returns jsonb
language sql
stable
as $$
  with mine as (
    select sv.kind, sv.target_id, sv.created_at, sv.id sid from public.saved sv where sv.user_id = public.current_profile_id()
  )
  select jsonb_build_object(
    'signs', coalesce((select jsonb_agg(public.sign_json(s) order by m.created_at desc, m.sid desc)
                       from mine m join public.signs s on m.kind = 'sign' and s.id = m.target_id
                       where public.item_visible('sign', s.id, s.author_id)), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(public.question_json(q) order by m.created_at desc, m.sid desc)
                           from mine m join public.questions q on m.kind = 'question' and q.id = m.target_id
                           where public.item_visible('question', q.id, q.author_id)), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(public.answer_json(a) order by m.created_at desc, m.sid desc)
                         from mine m join public.answers a on m.kind = 'answer' and a.id = m.target_id
                         where public.item_visible('answer', a.id, a.author_id)), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Grants: functions are executable by default for public; make that explicit and keep writes to signed-in users.
-- ---------------------------------------------------------------------------
revoke all on function
  public.rate_answer(bigint, boolean), public.close_question(bigint), public.remove_sign(bigint),
  public.toggle_saved(text, bigint), public.report_content(text, bigint, text), public.hide_content(text, bigint),
  public.my_signs(), public.my_questions(), public.my_answers(), public.saved_items()
  from public, anon;
grant execute on function
  public.rate_answer(bigint, boolean), public.close_question(bigint), public.remove_sign(bigint),
  public.toggle_saved(text, bigint), public.report_content(text, bigint, text), public.hide_content(text, bigint),
  public.my_signs(), public.my_questions(), public.my_answers(), public.saved_items()
  to authenticated;
grant execute on function
  public.list_signs(text, text, text[], integer), public.get_sign(bigint),
  public.list_questions(text, text, text[], integer), public.get_question(bigint), public.similar_questions(text)
  to anon, authenticated;
