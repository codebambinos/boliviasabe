-- 0006_threads_and_contact.sql
-- Threads under each answer, «Pedir contacto» and the live question detail (SPEC 12, T22):
--   · comments can be reported and hidden, and go away with their answer (wiki #82),
--   · a contact request belongs to one answer; the phones live in a table no client can read,
--   · get_question returns each answer's visible comments and, only for the two people, its contact state,
--   · request_contact / respond_contact are the only way to write a request,
--   · «Me sirvió» on a closed question solves it (wiki), without a second +1,
--   · Realtime publishes comments, answers, ratings and contact requests.
-- Errors keep the 0005 convention: 28000 unauthenticated, 42501 forbidden, P0002 not_found, 23514 validation.

-- ---------------------------------------------------------------------------
-- Comments can be reported and hidden; an answer is deleted with its thread
-- ---------------------------------------------------------------------------
alter table public.reports drop constraint reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('sign', 'question', 'answer', 'comment'));
alter table public.hidden_items drop constraint hidden_items_kind_check;
alter table public.hidden_items add constraint hidden_items_kind_check check (kind in ('sign', 'question', 'answer', 'comment'));

alter table public.answer_comments drop constraint answer_comments_answer_id_fkey;
alter table public.answer_comments
  add constraint answer_comments_answer_id_fkey foreign key (answer_id) references public.answers (id) on delete cascade;
create index answer_comments_answer_idx on public.answer_comments (answer_id, created_at);

-- ---------------------------------------------------------------------------
-- Contact requests: one per answer and asker. «Ahora no» is final for that answer.
-- The table has no rows yet (checked before applying), so answer_id can be not null.
-- ---------------------------------------------------------------------------
alter table public.contact_requests
  add column answer_id bigint not null references public.answers (id) on delete cascade,
  add constraint contact_requests_one_per_answer unique (answer_id, requester_id);

-- Only request_contact / respond_contact write requests; the parties still read their own (and Realtime needs that).
drop policy contact_requests_insert_requester on public.contact_requests;
drop policy contact_requests_update_owner on public.contact_requests;
revoke insert, update on public.contact_requests from authenticated;

-- The phones each one typed. No policies: only the definer functions below read them, and only after «Aceptar».
create table public.contact_phones (
  request_id bigint primary key references public.contact_requests (id) on delete cascade,
  requester_phone text,
  owner_phone text
);
alter table public.contact_phones enable row level security;

-- ---------------------------------------------------------------------------
-- Visibility and authorship know about comments
-- ---------------------------------------------------------------------------
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
    union all
    select c.author_id from public.answer_comments c where p_kind = 'comment' and c.id = p_id
  ) t
  where public.item_visible(p_kind, p_id, a)
$$;

create or replace function public.comment_json(c public.answer_comments)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', c.id,
    'answerId', c.answer_id,
    'text', c.text,
    'author', public.author_json(c.author_id),
    'createdAt', public.iso_utc(c.created_at),
    'isMine', coalesce(c.author_id = public.current_profile_id(), false),
    'inReview', coalesce(c.author_id = public.current_profile_id(), false) and public.report_count('comment', c.id) >= 3
  )
$$;

-- The caller's contact state on an answer, or null when they are neither the asker nor the answerer.
-- The other person's e-mail and phone appear only once the request is accepted.
create or replace function public.contact_json(p_answer_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  r public.contact_requests;
  p public.contact_phones;
  other_id bigint;
  other_phone text;
  other_email text;
begin
  if me is null then return null; end if;
  select * into r from public.contact_requests
  where answer_id = p_answer_id and (requester_id = me or owner_id = me)
  order by id desc limit 1;
  if not found then return null; end if;

  if r.status = 'accepted' then
    select * into p from public.contact_phones where request_id = r.id;
    if r.requester_id = me then
      other_id := r.owner_id;
      other_phone := p.owner_phone;
    else
      other_id := r.requester_id;
      other_phone := p.requester_phone;
    end if;
    select u.email into other_email from public.profiles pr join auth.users u on u.id = pr.auth_id where pr.id = other_id;
  end if;

  return jsonb_build_object(
    'requestId', r.id,
    'status', r.status,
    'requestedByMe', r.requester_id = me,
    'other', case when r.status = 'accepted' then jsonb_build_object('email', other_email, 'phone', other_phone) end
  );
end;
$$;

-- answer_json now carries the visible thread (oldest first) and the caller's contact state.
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
    'inReview', coalesce(a.author_id = public.current_profile_id(), false) and public.report_count('answer', a.id) >= 3,
    'comments', coalesce((
      select jsonb_agg(public.comment_json(c) order by c.created_at, c.id)
      from public.answer_comments c
      where c.answer_id = a.id and public.item_visible('comment', c.id, c.author_id)), '[]'::jsonb),
    'contact', public.contact_json(a.id)
  )
$$;

-- ---------------------------------------------------------------------------
-- «Pedir contacto» and «Aceptar» / «Ahora no»
-- ---------------------------------------------------------------------------
create or replace function public.clean_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare v text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v is not null and v !~ '^\+?[0-9][0-9 ()-]{5,19}$' then
    raise exception 'invalid phone' using errcode = '23514';
  end if;
  return v;
end;
$$;

create or replace function public.request_contact(p_answer_id bigint, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  a public.answers;
  q public.questions;
  existing public.contact_requests;
  v_phone text := public.clean_phone(p_phone);
  new_id bigint;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into a from public.answers where id = p_answer_id;
  if not found or not public.item_visible('answer', a.id, a.author_id) then
    raise exception 'this answer is no longer available' using errcode = 'P0002';
  end if;
  select * into q from public.questions where id = a.question_id;
  if q.author_id <> me then raise exception 'only the asker can ask for a contact' using errcode = '42501'; end if;
  if a.author_id = me then raise exception 'not on your own answer' using errcode = '42501'; end if;

  select * into existing from public.contact_requests where answer_id = a.id and requester_id = me;
  if found then
    if existing.status = 'declined' then
      raise exception 'they chose not to share their contact for this answer' using errcode = '42501';
    end if;
    return public.contact_json(a.id);
  end if;

  insert into public.contact_requests (requester_id, owner_id, question_id, answer_id)
  values (me, a.author_id, q.id, a.id) returning id into new_id;
  insert into public.contact_phones (request_id, requester_phone) values (new_id, v_phone);
  if v_phone is not null then update public.profiles set phone = v_phone where id = me; end if;
  return public.contact_json(a.id);
end;
$$;

create or replace function public.respond_contact(p_request_id bigint, p_accept boolean, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint := public.current_profile_id();
  r public.contact_requests;
  v_phone text := case when p_accept then public.clean_phone(p_phone) end;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into r from public.contact_requests where id = p_request_id;
  if not found or (r.owner_id <> me and r.requester_id <> me) then
    raise exception 'this request is no longer available' using errcode = 'P0002';
  end if;
  if r.owner_id <> me then raise exception 'only the person asked can answer' using errcode = '42501'; end if;
  if r.status <> 'pending' then return public.contact_json(r.answer_id); end if;

  update public.contact_requests
  set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
  where id = r.id;
  if p_accept then
    update public.contact_phones set owner_phone = v_phone where request_id = r.id;
    if v_phone is not null then update public.profiles set phone = v_phone where id = me; end if;
  end if;
  return public.contact_json(r.answer_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- «Me sirvió» on a closed question solves it (wiki «Detalle»); the +1 for closing is still paid once
-- ---------------------------------------------------------------------------
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

  if p_helpful and q.status <> 'solved' then
    update public.questions set status = 'solved' where id = q.id returning status into q.status;
  end if;
  return jsonb_build_object('answer', public.answer_json(a), 'questionStatus', q.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- contact_json stays callable by guests (get_question uses it): it returns null without a caller.
revoke all on function public.request_contact(bigint, text), public.respond_contact(bigint, boolean, text) from public, anon;
grant execute on function public.request_contact(bigint, text), public.respond_contact(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the live question detail listens to these tables (RLS still filters what each one receives)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['answer_comments', 'answers', 'ratings', 'contact_requests'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
